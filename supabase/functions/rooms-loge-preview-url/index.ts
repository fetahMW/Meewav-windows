import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
  ROOM_ID_PATTERN,
} from "../_shared/audioPairing.ts";

const LOGE_PREVIEW_BUCKET = "room-loge-previews";
const VIEWER_TTL_SECONDS = 120;
const CONTROL_TTL_SECONDS = 10 * 60;
const EXPIRY_SKEW_SECONDS = 5;
const MEDIA_PATH_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$/iu;

type LogePreviewMediaAuthority = {
  room_id: string;
  media_path: string;
  is_control: boolean;
  preview_expires_at: string | null;
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

function isAuthority(value: unknown): value is LogePreviewMediaAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const pathMatch = typeof row.media_path === "string"
    ? MEDIA_PATH_PATTERN.exec(row.media_path)
    : null;
  return typeof row.room_id === "string"
    && ROOM_ID_PATTERN.test(row.room_id)
    && pathMatch !== null
    && pathMatch[1].toLowerCase() === row.room_id.toLowerCase()
    && typeof row.is_control === "boolean"
    && (
      row.preview_expires_at === null
      || (
        typeof row.preview_expires_at === "string"
        && Number.isFinite(Date.parse(row.preview_expires_at))
      )
    );
}

function signedUrlTtl(authority: LogePreviewMediaAuthority, nowSeconds: number) {
  if (authority.is_control) return CONTROL_TTL_SECONDS;
  let ttl = VIEWER_TTL_SECONDS;
  if (authority.preview_expires_at) {
    const previewExpirySeconds = Math.floor(Date.parse(authority.preview_expires_at) / 1_000);
    ttl = Math.min(ttl, previewExpirySeconds - nowSeconds);
  }
  if (ttl <= EXPIRY_SKEW_SECONDS) throw new Error("loge_preview_access_expired");
  return ttl;
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

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "authentication_required" }, cors.headers);
  }

  let body: Record<string, unknown>;
  try {
    body = readJsonObject(await request.text());
  } catch {
    return jsonResponse(400, { error: "invalid_request" }, cors.headers);
  }
  if (
    Object.keys(body).length !== 1
    || !Object.prototype.hasOwnProperty.call(body, "roomId")
  ) {
    return jsonResponse(400, { error: "invalid_request" }, cors.headers);
  }
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!ROOM_ID_PATTERN.test(roomId)) {
    return jsonResponse(400, { error: "invalid_room" }, cors.headers);
  }

  try {
    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");

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
    const { data, error } = await service.rpc("rooms_authorize_loge_preview_media_v1", {
      p_room_id: roomId,
      p_user_id: authData.user.id,
    });
    if (error) {
      if (error.code === "42501" || error.code === "P0002" || error.code === "55000") {
        return jsonResponse(404, { error: "loge_preview_unavailable" }, cors.headers);
      }
      throw new Error("loge_preview_authority_unavailable");
    }
    if (!isAuthority(data) || data.room_id.toLowerCase() !== roomId.toLowerCase()) {
      throw new Error("invalid_loge_preview_authority");
    }

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const ttl = signedUrlTtl(data, nowSeconds);
    const { data: signed, error: signingError } = await service.storage
      .from(LOGE_PREVIEW_BUCKET)
      .createSignedUrl(data.media_path, ttl);
    if (signingError || !signed?.signedUrl) {
      throw new Error("loge_preview_signing_failed");
    }

    const signedUrl = new URL(signed.signedUrl, supabaseUrl);
    if (signedUrl.origin !== new URL(supabaseUrl).origin) {
      throw new Error("invalid_loge_preview_origin");
    }
    return jsonResponse(200, {
      signedUrl: signedUrl.toString(),
      expiresAt: new Date((nowSeconds + ttl) * 1_000).toISOString(),
    }, cors.headers);
  } catch (error) {
    if (error instanceof Error && error.message === "loge_preview_access_expired") {
      return jsonResponse(404, { error: "loge_preview_unavailable" }, cors.headers);
    }
    // Storage errors can contain private object paths. Keep logs deliberately
    // constant and return one generic failure envelope.
    console.error("rooms-loge-preview-url", "request_failed");
    return jsonResponse(500, { error: "loge_preview_url_unavailable" }, cors.headers);
  }
});
