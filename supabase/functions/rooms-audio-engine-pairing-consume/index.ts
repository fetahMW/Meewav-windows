import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hmacSignature,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
  ROOM_ID_PATTERN,
  sha256Hex,
  timingSafeEqual,
} from "../_shared/audioPairing.ts";

const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const MAX_TICKET_TTL_SECONDS = 60;

function decodePayload(segment: string) {
  const base64 = segment.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_payload");
  return parsed as Record<string, unknown>;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  try {
    const body = readJsonObject(await request.text());
    const pairingId = typeof body.pairingId === "string" ? body.pairingId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const clientNonce = typeof body.clientNonce === "string" ? body.clientNonce : "";
    if (!ROOM_ID_PATTERN.test(pairingId)
      || token.length < 64
      || token.length > 8_192
      || !CLIENT_NONCE_PATTERN.test(clientNonce)) {
      return jsonResponse(400, { error: "invalid_ticket" });
    }

    const segments = token.split(".");
    if (segments.length !== 3) return jsonResponse(400, { error: "invalid_ticket" });
    const unsignedToken = `${segments[0]}.${segments[1]}`;
    const pairingSecret = requiredEnvironment("MEEWAV_AUDIO_ENGINE_PAIRING_SECRET");
    if (pairingSecret.length < 32) throw new Error("pairing_secret_too_short");
    const expectedSignature = await hmacSignature(unsignedToken, pairingSecret);
    if (!timingSafeEqual(segments[2], expectedSignature)) return jsonResponse(401, { error: "invalid_ticket" });

    const claims = decodePayload(segments[1]);
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (claims.aud !== "meewav-audio-engine"
      || claims.iss !== "meewav-rooms"
      || claims.pairing_id !== pairingId
      || typeof claims.client_nonce !== "string"
      || !CLIENT_NONCE_PATTERN.test(claims.client_nonce)
      || !timingSafeEqual(claims.client_nonce, clientNonce)
      || typeof claims.iat !== "number"
      || !Number.isInteger(claims.iat)
      || typeof claims.exp !== "number"
      || !Number.isInteger(claims.exp)
      || claims.exp <= nowSeconds
      || claims.iat > nowSeconds + 5
      || claims.exp - claims.iat > MAX_TICKET_TTL_SECONDS
      || claims.exp <= claims.iat
      || claims.exp > nowSeconds + MAX_TICKET_TTL_SECONDS
      || typeof claims.room_id !== "string"
      || !ROOM_ID_PATTERN.test(claims.room_id)
      || typeof claims.sub !== "string"
      || !ROOM_ID_PATTERN.test(claims.sub)
      || typeof claims.web_origin !== "string"
      || (claims.room_role !== "host" && claims.room_role !== "guest")) {
      return jsonResponse(401, { error: "invalid_ticket" });
    }

    const service = createClient(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const tokenHash = await sha256Hex(token);
    const { data, error } = await service.rpc("consume_room_audio_engine_pairing_ticket", {
      p_pairing_id: pairingId,
      p_token_hash: tokenHash,
    });
    const consumed = Array.isArray(data) ? data[0] : null;
    if (error || !consumed) return jsonResponse(409, { error: "ticket_expired_or_consumed" });
    if (consumed.room_id !== claims.room_id
      || consumed.user_id !== claims.sub
      || consumed.room_role !== claims.room_role
      || consumed.web_origin !== claims.web_origin) {
      return jsonResponse(401, { error: "ticket_identity_mismatch" });
    }

    return jsonResponse(200, {
      pairingId,
      roomId: consumed.room_id,
      userId: consumed.user_id,
      roomRole: consumed.room_role,
      webOrigin: consumed.web_origin,
      clientNonce,
      expiresAt: consumed.expires_at,
    });
  } catch (error) {
    console.error("rooms-audio-engine-pairing-consume", error instanceof Error ? error.message : "unknown_error");
    return jsonResponse(500, { error: "pairing_validation_unavailable" });
  }
});
