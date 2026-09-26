import { createClient } from "npm:@supabase/supabase-js@2";
import { BytePlusAdmin } from "../_shared/byteplusAdmin.ts";

const MAX_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;
const TOKEN_TTL_SECONDS = 120;
const SELF_HOSTED_SWEEP_BUFFER_SECONDS = 30;

type OutboxEvent = {
  id: string;
  action: "remove_participant" | "end_room";
  room_id: string;
  livekit_room_name: string;
  participant_identity: string | null;
  publication_generation: string | null;
  publication_revision: number | null;
  source_reason: string;
  attempt_count: number;
  lease_token: string;
  created_at: string;
};

type PublicationGrant = {
  generation: string;
  state_revision: number;
  is_authorized: boolean;
};

type Resolution = {
  resolution: "succeeded" | "retry" | "dead";
  result: string;
  error?: string;
  retryAt?: string;
};

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

function isNotFoundError(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const code = String(candidate?.code ?? "").toLowerCase();
  const status = Number(candidate?.status ?? 0);
  const message = String(candidate?.message ?? error ?? "").toLowerCase();
  return status === 404
    || code === "404"
    || code === "not_found"
    || code === "5"
    || message.includes("not found")
    || message.includes("does not exist");
}

async function readRequestBatch(request: Request) {
  const text = await request.text();
  if (!text.trim()) return 20;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
  const requested = Number((body as { batchSize?: unknown })?.batchSize ?? 20);
  if (!Number.isInteger(requested) || requested < 1) throw new Error("invalid_batch_size");
  return Math.min(requested, MAX_BATCH_SIZE);
}

Deno.serve(async (request) => {
  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const workerSecret = requiredEnvironment("LIVEKIT_REVOCATION_WORKER_SECRET");
    if (workerSecret.length < 32) throw new Error("LIVEKIT_REVOCATION_WORKER_SECRET must contain at least 32 characters");
    const suppliedSecret = request.headers.get("x-meewav-worker-secret") ?? "";
    if (!constantTimeEqual(workerSecret, suppliedSecret)) {
      return jsonResponse(401, { error: "worker_authentication_required" });
    }

    const supabase = createClient(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const health = async () => {
      const { data, error } = await supabase.rpc("rooms_livekit_revocation_health_v1");
      if (error) throw error;
      return data;
    };

    if (request.method === "GET") {
      return jsonResponse(200, { health: await health() });
    }

    const batchSize = await readRequestBatch(request);
    // Validate every remote dependency before leasing durable work. A missing
    // deployment secret must not leave rows stuck in `processing` until the
    // stale-lease timeout elapses.
    const roomService = new BytePlusAdmin();
    const workerId = `edge:${crypto.randomUUID()}`;
    const { data: claimedData, error: claimError } = await supabase.rpc(
      "rooms_claim_livekit_revocations_v1",
      { p_batch_size: batchSize, p_worker_id: workerId },
    );
    if (claimError) throw claimError;
    const claimed = (claimedData ?? []) as OutboxEvent[];

    const loadCurrentGuard = async (event: OutboxEvent) => {
      const noTarget = Promise.resolve({ data: null, error: null });
      const [roomResult, grantResult, participantResult, invitationResult, banResult, kickResult] = await Promise.all([
        supabase
          .from("rooms_v2")
          .select("status,type,livekit_room_name")
          .eq("id", event.room_id)
          .maybeSingle(),
        event.participant_identity
          ? supabase
            .from("room_livekit_publication_grants_v1")
            .select("generation,state_revision,is_authorized")
            .eq("room_id", event.room_id)
            .eq("user_id", event.participant_identity)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        event.participant_identity
          ? supabase
            .from("room_participants_v2")
            .select("role,left_at")
            .eq("room_id", event.room_id)
            .eq("user_id", event.participant_identity)
            .maybeSingle()
          : noTarget,
        event.participant_identity
          ? supabase
            .from("room_invitations_v2")
            .select("status,ended_at")
            .eq("room_id", event.room_id)
            .eq("guest_id", event.participant_identity)
            .limit(1)
            .maybeSingle()
          : noTarget,
        event.participant_identity
          ? supabase
            .from("room_bans_v2")
            .select("id")
            .eq("room_id", event.room_id)
            .eq("user_id", event.participant_identity)
            .limit(1)
            .maybeSingle()
          : noTarget,
        event.participant_identity
          ? supabase
            .from("room_kicks_v2")
            .select("id")
            .eq("room_id", event.room_id)
            .eq("user_id", event.participant_identity)
            .limit(1)
            .maybeSingle()
          : noTarget,
      ]);
      const queryError = [
        roomResult.error,
        grantResult.error,
        participantResult.error,
        invitationResult.error,
        banResult.error,
        kickResult.error,
      ].find(Boolean);
      if (queryError) throw queryError;
      const room = roomResult.data as { status: string; type: string; livekit_room_name: string } | null;
      const grant = grantResult.data as PublicationGrant | null;
      const participant = participantResult.data as { role: string; left_at: string | null } | null;
      const invitation = invitationResult.data as { status: string; ended_at: string | null } | null;
      let mediaAuthorized=false;
      if(event.participant_identity&&room?.status==="live") {
        const {data:policy,error:policyError}=await supabase.rpc("rooms_byteplus_media_policy_v1",{p_room_id:event.room_id,p_user_id:event.participant_identity});
        if(policyError&&!['42501','P0002'].includes(policyError.code))throw policyError;
        mediaAuthorized=policy?.canPublish===true;
      }
      return {
        room,
        grant,
        participantActive: Boolean(participant && participant.left_at === null),
        banned: Boolean(banResult.data),
        kicked: Boolean(kickResult.data),
        currentlyAuthorized: mediaAuthorized,
      };
    };

    const resolve = async (event: OutboxEvent, resolution: Resolution) => {
      const { error } = await supabase.rpc("rooms_resolve_livekit_revocation_v1", {
        p_event_id: event.id,
        p_lease_token: event.lease_token,
        p_resolution: resolution.resolution,
        p_result: resolution.result,
        p_error: resolution.error ?? null,
        p_retry_at: resolution.retryAt ?? null,
      });
      if (error) throw error;
    };

    const roomNameWasReused = async (event: OutboxEvent) => {
      const { data, error } = await supabase
        .from("rooms_v2")
        .select("id,status")
        .eq("livekit_room_name", event.livekit_room_name)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data && data.id !== event.room_id && data.status === "live");
    };

    const processEndRoom = async (event: OutboxEvent): Promise<Resolution> => {
      const guard = await loadCurrentGuard(event);
      if (guard.room && guard.room.status !== "ended") {
        return { resolution: "succeeded", result: "superseded_room_is_live" };
      }
      if (!guard.room && await roomNameWasReused(event)) {
        return { resolution: "succeeded", result: "superseded_room_name_reused" };
      }
      try {
        await roomService.deleteRoom(event.livekit_room_name);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      return { resolution: "succeeded", result: "room_ended_server_side" };
    };

    const processRemoveParticipant = async (event: OutboxEvent): Promise<Resolution> => {
      if (!event.participant_identity) {
        return { resolution: "dead", result: "invalid_event", error: "participant_identity_missing" };
      }

      const initialGuard = await loadCurrentGuard(event);
      if (initialGuard.room?.status === "ended" || !initialGuard.room) {
        if (!initialGuard.room && await roomNameWasReused(event)) {
          return { resolution: "succeeded", result: "superseded_room_name_reused" };
        }
        try {
          await roomService.deleteRoom(event.livekit_room_name);
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
        }
        return { resolution: "succeeded", result: "room_ended_server_side" };
      }

      // Any current authorization wins over an older outbox event. This is
      // the first guard against disconnecting a legitimately rejoined guest.
      if (initialGuard.currentlyAuthorized) {
        return { resolution: "succeeded", result: "superseded_currently_authorized" };
      }

      // Re-read immediately before the destructive Admin API operation. This
      // also protects legacy sessions whose metadata has no generation.
      const finalGuard = await loadCurrentGuard(event);
      if (finalGuard.currentlyAuthorized) {
        return { resolution: "succeeded", result: "superseded_during_delivery" };
      }
      if (finalGuard.room?.status !== "live") {
        if (!finalGuard.room && await roomNameWasReused(event)) {
          return { resolution: "succeeded", result: "superseded_room_name_reused" };
        }
        try {
          await roomService.deleteRoom(event.livekit_room_name);
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
        }
        return { resolution: "succeeded", result: "room_ended_server_side" };
      }

      const retainSubscriber = finalGuard.participantActive && !finalGuard.banned;
      let tokenQuery=supabase.from("room_byteplus_tokens_v1")
        .select("token").eq("room_id",event.room_id).eq("user_id",event.participant_identity).gt("expires_at",new Date().toISOString());
      if(event.publication_generation)tokenQuery=tokenQuery.eq("generation",event.publication_generation);
      const {data:tokens,error:tokensError}=await tokenQuery;
      if(tokensError)throw tokensError;
      // LimitTokenPrivilege revokes every issued, unexpired publishing grant.
      // Audience membership can then stay connected with its receive-only grant.
      for(const row of tokens??[]) {
        await roomService.revokePublication(event.livekit_room_name,event.participant_identity,row.token);
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(!retainSubscriber) {
        const current=await loadCurrentGuard(event);
        if(current.currentlyAuthorized || (event.publication_generation && current.grant?.generation !== event.publication_generation))
          return {resolution:"succeeded",result:"superseded_before_ban"};
        const stamp=new Date().toISOString();
        const {error:banError}=await supabase.from("room_byteplus_bans_v1").upsert({room_id:event.room_id,user_id:event.participant_identity,created_at:stamp});
        if(banError)throw banError;
        await roomService.removeParticipant(event.livekit_room_name,event.participant_identity);
        // A re-entry granted while the API was in flight wins over this event.
        const after=await loadCurrentGuard(event);
        if(after.participantActive&&!after.banned) {
          await roomService.clearBan(event.livekit_room_name,event.participant_identity);
          const {error:clearError}=await supabase.from("room_byteplus_bans_v1").delete().eq("room_id",event.room_id).eq("user_id",event.participant_identity).eq("created_at",stamp);
          if(clearError)throw clearError;
        }
      }
      // Sweep after all previously issued BytePlus grants have expired.
      const sweepAtMs = Date.parse(event.created_at)
        + (TOKEN_TTL_SECONDS + SELF_HOSTED_SWEEP_BUFFER_SECONDS) * 1000;
      if (Number.isFinite(sweepAtMs) && Date.now() < sweepAtMs) {
        return {
          resolution: "retry",
          result: retainSubscriber
            ? "publication_permission_revoked_safety_sweep_scheduled"
            : "initial_revocation_delivered_safety_sweep_scheduled",
          retryAt: new Date(sweepAtMs).toISOString(),
        };
      }

      return {
        resolution: "succeeded",
        result: retainSubscriber
          ? "publication_permission_revoked_subscriber_retained"
          : "participant_revoked_server_side",
      };
    };

    const outcomes = [];
    for (const event of claimed) {
      let resolution: Resolution;
      try {
        resolution = event.action === "end_room"
          ? await processEndRoom(event)
          : await processRemoveParticipant(event);
      } catch (error) {
        const message = errorMessage(error);
        if (event.attempt_count >= MAX_ATTEMPTS) {
          resolution = { resolution: "dead", result: "retry_budget_exhausted", error: message };
        } else {
          const exponent = Math.min(event.attempt_count, 7);
          const delaySeconds = Math.min(300, (2 ** exponent) * 2) + Math.floor(Math.random() * 3);
          resolution = {
            resolution: "retry",
            result: "delivery_failed_retry_scheduled",
            error: message,
            retryAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          };
        }
      }
      await resolve(event, resolution);
      outcomes.push({ id: event.id, action: event.action, ...resolution });
      await new Promise(resolve=>setTimeout(resolve,50));
    }

    return jsonResponse(200, {
      claimed: claimed.length,
      outcomes,
      health: await health(),
    });
  } catch (error) {
    console.error("livekit-revocation-worker", errorMessage(error));
    const message = errorMessage(error);
    const configurationError = message.startsWith("Missing required environment variable")
      || message.includes("must contain at least 32 characters");
    return jsonResponse(configurationError ? 503 : 500, {
      error: configurationError ? "worker_not_configured" : "livekit_revocation_worker_unavailable",
    });
  }
});
