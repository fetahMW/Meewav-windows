import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  encodeJson,
  hmacSignature,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
} from "../_shared/audioPairing.ts";

// LiveKit JWTs cannot be revoked after signing. Keep the reconnect capability
// brief; the durable worker deletes the room immediately and once more after
// this TTL plus skew to close the residual recreate-after-delete window.
const TOKEN_TTL_SECONDS = 30;
const CLOCK_SKEW_SECONDS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRIVATE_ROOM_PATTERN = /^mw-call-[0-9a-f]{32}-[0-9a-f]{12}$/u;
const PARTICIPANT_IDENTITY_PATTERN = /^[0-9a-f-]{36}:call:[0-9a-f-]{36}$/u;

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

type MediaAuthority = {
  invitation_id: string;
  room_id: string;
  private_room_name: string;
  media_generation: string;
  call_mode: "private" | "public";
  role: "host" | "contact";
  participant_identity: string;
  peer_identity: string;
  session_expires_at: string;
};

function corsForRequest(request: Request) {
  const origin = request.headers.get("origin")?.trim() ?? "";
  if (!origin) return { origin, allowed: true, headers: {} as Record<string, string> };
  const allowed = allowedOrigins().has(origin);
  return {
    origin,
    allowed,
    headers: allowed
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
          "vary": "Origin",
        }
      : {} as Record<string, string>,
  };
}

function liveKitServerUrl() {
  const value = Deno.env.get("LIVEKIT_URL")?.trim()
    || Deno.env.get("LIVEKIT_SERVER_URL")?.trim()
    || "";
  if (!value) throw new Error("Missing required environment variable: LIVEKIT_URL");
  const parsed = new URL(value);
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
    throw new Error("LIVEKIT_URL must use ws:// or wss://");
  }
  if (parsed.protocol === "ws:" && !isLoopbackHostname(parsed.hostname)) {
    throw new Error("LIVEKIT_URL requires WSS outside an explicit loopback development host");
  }
  return parsed.toString().replace(/\/$/u, "");
}

function isMediaAuthority(value: unknown): value is MediaAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.invitation_id === "string"
    && UUID_PATTERN.test(row.invitation_id)
    && typeof row.room_id === "string"
    && UUID_PATTERN.test(row.room_id)
    && typeof row.private_room_name === "string"
    && PRIVATE_ROOM_PATTERN.test(row.private_room_name)
    && typeof row.media_generation === "string"
    && UUID_PATTERN.test(row.media_generation)
    && (row.call_mode === "private" || row.call_mode === "public")
    && (row.role === "host" || row.role === "contact")
    && typeof row.participant_identity === "string"
    && PARTICIPANT_IDENTITY_PATTERN.test(row.participant_identity)
    && typeof row.peer_identity === "string"
    && PARTICIPANT_IDENTITY_PATTERN.test(row.peer_identity)
    && typeof row.session_expires_at === "string"
    && Number.isFinite(Date.parse(row.session_expires_at));
}

async function issueAudioOnlyToken({
  apiKey,
  apiSecret,
  authority,
}: {
  apiKey: string;
  apiSecret: string;
  authority: MediaAuthority;
}) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const sessionExpirySeconds = Math.floor(Date.parse(authority.session_expires_at) / 1_000);
  const expiresAtSeconds = Math.min(nowSeconds + TOKEN_TTL_SECONDS, sessionExpirySeconds);
  if (expiresAtSeconds <= nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new Error("live_call_session_expired");
  }

  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    iss: apiKey,
    sub: authority.participant_identity,
    iat: nowSeconds,
    nbf: nowSeconds - CLOCK_SKEW_SECONDS,
    exp: expiresAtSeconds,
    jti: crypto.randomUUID(),
    metadata: JSON.stringify({
      roomId: authority.room_id,
      liveCallInvitationId: authority.invitation_id,
      mediaGeneration: authority.media_generation,
      callMode: authority.call_mode,
      role: authority.role === "host" ? "phone_host" : "phone_contact",
    }),
    video: {
      room: authority.private_room_name,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
    },
  });
  const unsignedToken = `${header}.${payload}`;
  return {
    token: `${unsignedToken}.${await hmacSignature(unsignedToken, apiSecret)}`,
    expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
  };
}

Deno.serve(async (request) => {
  const cors = corsForRequest(request);

  if (request.method === "OPTIONS") {
    return cors.origin && cors.allowed
      ? new Response(null, {
          status: 204,
          headers: {
            ...cors.headers,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-max-age": "600",
          },
        })
      : jsonResponse(403, { error: "origin_refused" });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, cors.headers);
  }
  if (!cors.allowed) return jsonResponse(403, { error: "origin_refused" });

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "authentication_required" }, cors.headers);
    }

    const body = readJsonObject(await request.text());
    const invitationId = typeof body.invitationId === "string"
      ? body.invitationId.trim()
      : "";
    if (!UUID_PATTERN.test(invitationId)) {
      return jsonResponse(400, { error: "invalid_invitation" }, cors.headers);
    }

    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = requiredEnvironment("LIVEKIT_API_KEY");
    const apiSecret = requiredEnvironment("LIVEKIT_API_SECRET");
    if (apiKey.length > 256 || apiSecret.length < 32) {
      throw new Error("invalid_livekit_credentials");
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(401, { error: "authentication_required" }, cors.headers);
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("rooms_authorize_live_call_media_v1", {
      p_invitation_id: invitationId,
      p_user_id: authData.user.id,
    });
    if (error) {
      if (error.code === "P0002") {
        return jsonResponse(404, { error: "live_call_not_found" }, cors.headers);
      }
      if (error.code === "P0001" && error.message?.includes("live_call_token_rate_limit")) {
        return jsonResponse(429, {
          error: "live_call_token_rate_limited",
          retryAfterSeconds: 60,
        }, { ...cors.headers, "retry-after": "60" });
      }
      if (error.code === "42501" || error.code === "55000") {
        return jsonResponse(403, { error: "live_call_not_authorized" }, cors.headers);
      }
      throw error;
    }
    if (!isMediaAuthority(data)) throw new Error("invalid_media_authority");

    const { token, expiresAt } = await issueAudioOnlyToken({
      apiKey,
      apiSecret,
      authority: data,
    });

    return jsonResponse(200, {
      token,
      serverUrl: liveKitServerUrl(),
      expiresAt,
      invitationId: data.invitation_id,
      callId: data.invitation_id,
      roomId: data.room_id,
      publicRoomId: data.room_id,
      roomName: data.private_room_name,
      callMode: data.call_mode,
      role: data.role,
      participantIdentity: data.participant_identity,
      peerIdentity: data.peer_identity,
      canPublishSources: ["microphone"],
    }, cors.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("rooms-live-call-token", message);
    if (message === "live_call_session_expired") {
      return jsonResponse(403, { error: "live_call_not_authorized" }, cors.headers);
    }
    return jsonResponse(500, { error: "live_call_token_unavailable" }, cors.headers);
  }
});
