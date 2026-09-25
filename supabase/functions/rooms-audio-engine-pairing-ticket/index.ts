import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  encodeJson,
  hmacSignature,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
  ROOM_ID_PATTERN,
  sha256Hex,
} from "../_shared/audioPairing.ts";

const TICKET_TTL_SECONDS = 60;
const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

Deno.serve(async (request) => {
  const origin = request.headers.get("origin")?.trim() ?? "";
  const origins = allowedOrigins();
  const corsHeaders = origin && origins.has(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "vary": "Origin" }
    : {};

  if (request.method === "OPTIONS") {
    return origin && origins.has(origin)
      ? new Response(null, { status: 204, headers: { ...corsHeaders, "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600" } })
      : jsonResponse(403, { error: "origin_refused" });
  }
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, corsHeaders);
  if (!origin || !origins.has(origin)) return jsonResponse(403, { error: "origin_refused" });

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return jsonResponse(401, { error: "authentication_required" }, corsHeaders);

    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const pairingSecret = requiredEnvironment("MEEWAV_AUDIO_ENGINE_PAIRING_SECRET");
    if (pairingSecret.length < 32) throw new Error("pairing_secret_too_short");

    const body = readJsonObject(await request.text());
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    const clientNonce = typeof body.clientNonce === "string" ? body.clientNonce : "";
    if (!ROOM_ID_PATTERN.test(roomId)) return jsonResponse(400, { error: "invalid_room" }, corsHeaders);
    if (!CLIENT_NONCE_PATTERN.test(clientNonce)) return jsonResponse(400, { error: "invalid_client_nonce" }, corsHeaders);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse(401, { error: "authentication_required" }, corsHeaders);

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: room, error: roomError } = await service
      .from("rooms_v2")
      .select("id, host_id, status, type")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError || !room || room.status !== "live" || room.type !== "place") {
      return jsonResponse(404, { error: "room_unavailable" }, corsHeaders);
    }

    let roomRole: "host" | "guest" | null = room.host_id === authData.user.id ? "host" : null;
    if (!roomRole) {
      const { data: invitation, error: invitationError } = await service
        .from("room_invitations_v2")
        .select("id")
        .eq("room_id", roomId)
        .eq("guest_id", authData.user.id)
        .in("status", ["accepted", "ready", "backstage", "onstage"])
        .is("ended_at", null)
        .limit(1)
        .maybeSingle();
      if (invitationError) throw invitationError;
      if (invitation) roomRole = "guest";
    }
    if (!roomRole) return jsonResponse(403, { error: "voice_processing_not_authorized" }, corsHeaders);

    const pairingId = crypto.randomUUID();
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const expiresAt = new Date((nowSeconds + TICKET_TTL_SECONDS) * 1_000).toISOString();
    const header = encodeJson({ alg: "HS256", typ: "JWT", kid: "meewav-audio-pairing-v1" });
    const payload = encodeJson({
      iss: "meewav-rooms",
      aud: "meewav-audio-engine",
      sub: authData.user.id,
      room_id: roomId,
      room_role: roomRole,
      web_origin: origin,
      client_nonce: clientNonce,
      pairing_id: pairingId,
      jti: crypto.randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + TICKET_TTL_SECONDS,
    });
    const unsignedToken = `${header}.${payload}`;
    const token = `${unsignedToken}.${await hmacSignature(unsignedToken, pairingSecret)}`;
    const tokenHash = await sha256Hex(token);

    const { error: insertError } = await service.rpc("issue_room_audio_engine_pairing_ticket", {
      p_pairing_id: pairingId,
      p_room_id: roomId,
      p_user_id: authData.user.id,
      p_room_role: roomRole,
      p_web_origin: origin,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    if (insertError?.code === "42900") {
      return jsonResponse(429, { error: "pairing_rate_limited" }, {
        ...corsHeaders,
        "retry-after": "60",
      });
    }
    if (insertError) throw insertError;

    return jsonResponse(200, { pairingId, token, expiresAt }, corsHeaders);
  } catch (error) {
    console.error("rooms-audio-engine-pairing-ticket", error instanceof Error ? error.message : "unknown_error");
    return jsonResponse(500, { error: "pairing_ticket_unavailable" }, corsHeaders);
  }
});
