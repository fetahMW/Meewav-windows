import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  encodeJson,
  hmacSignature,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
  ROOM_ID_PATTERN,
} from "../_shared/audioPairing.ts";

const TOKEN_TTL_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 5;
const ROOM_NAME_PATTERN = /^[^\u0000-\u001f\u007f]{1,128}$/u;
const ACTIVE_GUEST_STATUSES = new Set(["accepted", "ready", "backstage", "onstage"]);

type RoomRole = "host" | "guest" | "viewer";

type RoomRow = {
  id: string;
  host_id: string;
  livekit_room_name: string;
  status: string;
  type: string;
};

type ParticipantRow = {
  role: string;
  left_at: string | null;
};

type InvitationRow = {
  status: string;
  ended_at: string | null;
};

type PublicationGrantRow = {
  generation: string;
  state_revision: number;
  is_authorized: boolean;
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
  return parsed.toString().replace(/\/$/u, "");
}

async function issueLiveKitToken({
  apiKey,
  apiSecret,
  identity,
  roomName,
  canPublish,
  canPublishSources,
  role,
  roomId,
  publicationGeneration,
  publicationRevision,
}: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  roomName: string;
  canPublish: boolean;
  canPublishSources?: Array<"camera" | "microphone" | "screen_share" | "screen_share_audio">;
  role: RoomRole;
  roomId: string;
  publicationGeneration: string | null;
  publicationRevision: number | null;
}) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const expiresAtSeconds = nowSeconds + TOKEN_TTL_SECONDS;
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    iss: apiKey,
    sub: identity,
    iat: nowSeconds,
    nbf: nowSeconds - CLOCK_SKEW_SECONDS,
    exp: expiresAtSeconds,
    jti: crypto.randomUUID(),
    metadata: JSON.stringify({
      roomId,
      role,
      ...(publicationGeneration
        ? {
            publicationGeneration,
            publicationRevision,
          }
        : {}),
    }),
    video: {
      room: roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData: canPublish,
      ...(canPublishSources ? { canPublishSources } : {}),
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
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, cors.headers);
  if (!cors.allowed) return jsonResponse(403, { error: "origin_refused" });

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "authentication_required" }, cors.headers);
    }

    const body = readJsonObject(await request.text());
    const requestedRoomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
    const legacyRoomName = typeof body.roomName === "string" ? body.roomName.trim() : "";
    const isWebContract = requestedRoomId.length > 0;
    if (isWebContract ? !ROOM_ID_PATTERN.test(requestedRoomId) : !ROOM_NAME_PATTERN.test(legacyRoomName)) {
      return jsonResponse(400, { error: "invalid_room" }, cors.headers);
    }

    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = requiredEnvironment("LIVEKIT_API_KEY");
    const apiSecret = requiredEnvironment("LIVEKIT_API_SECRET");
    if (apiKey.length > 256 || apiSecret.length < 32) throw new Error("invalid_livekit_credentials");

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
    const roomQuery = service
      .from("rooms_v2")
      .select("id,host_id,livekit_room_name,status,type")
      .eq("status", "live")
      // La Wave reuses the canonical Rooms SFU transport. Its Host must be
      // able to publish the DAW screen + system audio while every viewer
      // subscribes to the same official program. Other specialized Rooms stay
      // outside this token contract until their media governance is explicit.
      .in("type", ["place", "wave"])
      .limit(1);
    const { data: roomData, error: roomError } = isWebContract
      ? await roomQuery.eq("id", requestedRoomId).maybeSingle()
      : await roomQuery.eq("livekit_room_name", legacyRoomName).maybeSingle();
    const room = roomData as RoomRow | null;
    if (roomError || !room || !ROOM_NAME_PATTERN.test(room.livekit_room_name)) {
      return jsonResponse(404, { error: "room_unavailable" }, cors.headers);
    }

    const userId = authData.user.id;
    const [banResult, participantResult, invitationResult, kickResult, publicationGrantResult] = await Promise.all([
      service
        .from("room_bans_v2")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      service
        .from("room_participants_v2")
        .select("role,left_at")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .maybeSingle(),
      service
        .from("room_invitations_v2")
        .select("status,ended_at")
        .eq("room_id", room.id)
        .eq("guest_id", userId)
        .limit(1)
        .maybeSingle(),
      service
        .from("room_kicks_v2")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      service
        .from("room_livekit_publication_grants_v1")
        .select("generation,state_revision,is_authorized")
        .eq("room_id", room.id)
        .eq("user_id", authData.user.id)
        .maybeSingle(),
    ]);
    // Deployment remains backwards-compatible if this Edge Function is rolled
    // out just before the additive migration. Any other grant query error is
    // fail-closed instead of silently minting publication rights.
    const grantInfrastructureUnavailable = publicationGrantResult.error?.code === "42P01"
      || publicationGrantResult.error?.code === "PGRST205";
    const queryError = [
      banResult.error,
      participantResult.error,
      invitationResult.error,
      kickResult.error,
      grantInfrastructureUnavailable ? null : publicationGrantResult.error,
    ].find(Boolean);
    if (queryError) throw queryError;

    const participant = participantResult.data as ParticipantRow | null;
    const invitation = invitationResult.data as InvitationRow | null;
    const participantIsActive = Boolean(participant && participant.left_at === null);
    // A kick is a one-shot expulsion in the canonical Rooms contract: a later
    // successful re-entry creates a fresh active participation. A ban remains
    // durable. Keep media authorization aligned with that existing iOS/Web
    // lifecycle instead of silently turning every kick into a permanent ban.
    if (banResult.data || (kickResult.data && !participantIsActive)) {
      return jsonResponse(403, { error: "room_access_revoked" }, cors.headers);
    }

    const invitationIsActive = Boolean(
      invitation
      && invitation.ended_at === null
      && ACTIVE_GUEST_STATUSES.has(invitation.status),
    );
    const role: RoomRole = room.host_id === userId
      ? "host"
      : invitationIsActive
        ? "guest"
        : "viewer";
    const guestCanPublish = role === "guest"
      && invitation?.status === "onstage"
      && participantIsActive
      && participant?.role === "guest";
    const derivedCanPublish = role === "host" || guestCanPublish;
    const publicationGrant = publicationGrantResult.data as PublicationGrantRow | null;
    const publicationGeneration = publicationGrant?.is_authorized
      ? publicationGrant.generation
      : null;
    const publicationRevision = publicationGrant?.is_authorized
      ? publicationGrant.state_revision
      : null;
    const canPublish = derivedCanPublish
      && (grantInfrastructureUnavailable || publicationGeneration !== null);

    const { token, expiresAt } = await issueLiveKitToken({
      apiKey,
      apiSecret,
      identity: userId,
      roomName: room.livekit_room_name,
      canPublish,
      // Keep the existing native/iOS grant envelope unchanged. The Web Tools
      // panel owns screen sharing, so onstage Web guests receive only the two
      // sources they actually need; the Host keeps the full production set.
      canPublishSources: isWebContract && canPublish
        ? role === "host"
          ? ["camera", "microphone", "screen_share", "screen_share_audio"]
          : ["camera", "microphone"]
        : undefined,
      role,
      roomId: room.id,
      publicationGeneration,
      publicationRevision,
    });

    // The existing iOS client decodes only `{ token }`. Its client-supplied
    // identity and canPublish fields remain accepted for wire compatibility,
    // but they never influence the signed claims above.
    if (!isWebContract) return jsonResponse(200, { token }, cors.headers);

    return jsonResponse(200, {
      token,
      serverUrl: liveKitServerUrl(),
      expiresAt,
      role,
      roomName: room.livekit_room_name,
      canPublish,
      participantIdentity: userId,
      programAudioPublisherIdentity: room.host_id,
    }, cors.headers);
  } catch (error) {
    console.error("livekit-token", error instanceof Error ? error.message : "unknown_error");
    return jsonResponse(500, { error: "livekit_token_unavailable" }, cors.headers);
  }
});
