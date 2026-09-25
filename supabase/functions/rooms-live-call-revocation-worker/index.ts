import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.17.0";
import { timingSafeEqual } from "../_shared/audioPairing.ts";

const MAX_BATCH_SIZE = 50;

type RevocationEvent = {
  outbox_id: string;
  invitation_id: string;
  room_id: string;
  media_generation: string;
  private_room_name: string;
  action: "detach_public_mix" | "end_private_call" | "cleanup_private_call";
  route_revision: number;
  source_reason: string;
  lease_token: string;
  attempt_count: number;
};

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

function liveKitHttpUrl() {
  const raw = Deno.env.get("LIVEKIT_URL")?.trim()
    || Deno.env.get("LIVEKIT_SERVER_URL")?.trim()
    || "";
  if (!raw) throw new Error("Missing required environment variable: LIVEKIT_URL");
  const parsed = new URL(raw);
  if (!["wss:", "ws:", "https:", "http:"].includes(parsed.protocol)) {
    throw new Error("LIVEKIT_URL must use https:// or wss://");
  }
  if ((parsed.protocol === "ws:" || parsed.protocol === "http:")
    && !isLoopbackHostname(parsed.hostname)) {
    throw new Error("LIVEKIT_URL requires TLS outside an explicit loopback development host");
  }
  if (parsed.protocol === "wss:") parsed.protocol = "https:";
  else if (parsed.protocol === "ws:") parsed.protocol = "http:";
  return parsed.toString().replace(/\/$/u, "");
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isNotFoundError(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const status = Number(candidate?.status ?? 0);
  const code = String(candidate?.code ?? "").toLowerCase();
  const message = String(candidate?.message ?? error ?? "").toLowerCase();
  return status === 404
    || code === "404"
    || code === "not_found"
    || code === "5"
    || message.includes("not found")
    || message.includes("does not exist");
}

async function readBatchSize(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) return 20;
  const body = JSON.parse(raw) as { batchSize?: unknown };
  const requested = Number(body?.batchSize ?? 20);
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error("invalid_batch_size");
  }
  return Math.min(requested, MAX_BATCH_SIZE);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const workerSecret = requiredEnvironment("LIVE_CALL_REVOCATION_WORKER_SECRET");
    if (workerSecret.length < 32) {
      throw new Error("LIVE_CALL_REVOCATION_WORKER_SECRET must contain at least 32 characters");
    }
    const suppliedSecret = request.headers.get("x-meewav-worker-secret") ?? "";
    if (!timingSafeEqual(workerSecret, suppliedSecret)) {
      return jsonResponse(401, { error: "worker_authentication_required" });
    }

    const batchSize = await readBatchSize(request);
    const service = createClient(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const roomService = new RoomServiceClient(
      liveKitHttpUrl(),
      requiredEnvironment("LIVEKIT_API_KEY"),
      requiredEnvironment("LIVEKIT_API_SECRET"),
    );

    const { error: expiryError } = await service.rpc(
      "rooms_expire_live_call_invitations_v1",
      { p_limit: Math.min(500, batchSize * 10) },
    );
    if (expiryError) throw expiryError;

    const workerId = `live-call-edge:${crypto.randomUUID()}`;
    const { data, error: claimError } = await service.rpc(
      "rooms_claim_live_call_revocations_v1",
      { p_worker_id: workerId, p_limit: batchSize },
    );
    if (claimError) throw claimError;
    const events = (data ?? []) as RevocationEvent[];

    let succeeded = 0;
    let retried = 0;
    for (const event of events) {
      try {
        const { data: shouldExecute, error: guardError } = await service.rpc(
          "rooms_live_call_revocation_should_execute_v1",
          { p_outbox_id: event.outbox_id, p_lease_token: event.lease_token },
        );
        if (guardError) throw guardError;

        let result = "superseded_by_current_state";
        if (shouldExecute === true
          && (event.action === "end_private_call" || event.action === "cleanup_private_call")) {
          try {
            await roomService.deleteRoom(event.private_room_name);
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
          }
          result = event.action === "cleanup_private_call"
            ? "expired_join_token_room_cleaned"
            : "private_call_ended_server_side";
        } else if (shouldExecute === true) {
          // The route row is the authority consumed by the Host bridge. Once
          // it is preview, no remote LiveKit admin action can selectively
          // remove only that locally mixed source from the public program.
          result = "public_mix_route_revoked";
        }

        const { data: completed, error: completionError } = await service.rpc(
          "rooms_complete_live_call_revocation_v1",
          {
            p_outbox_id: event.outbox_id,
            p_lease_token: event.lease_token,
            p_succeeded: true,
            p_result: result,
          },
        );
        if (completionError) throw completionError;
        if (completed === true) succeeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const { error: completionError } = await service.rpc(
          "rooms_complete_live_call_revocation_v1",
          {
            p_outbox_id: event.outbox_id,
            p_lease_token: event.lease_token,
            p_succeeded: false,
            p_result: message.slice(0, 1000),
          },
        );
        if (completionError) console.error("live-call-revocation-completion", completionError.message);
        retried += 1;
      }
    }

    return jsonResponse(200, {
      claimed: events.length,
      succeeded,
      retried,
    });
  } catch (error) {
    console.error(
      "rooms-live-call-revocation-worker",
      error instanceof Error ? error.message : "unknown_error",
    );
    return jsonResponse(500, { error: "live_call_revocation_unavailable" });
  }
});
