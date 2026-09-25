import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
  ROOM_ID_PATTERN,
} from "../_shared/audioPairing.ts";

const CLASSROOM_RESOURCE_BUCKET = "room-classe-resources";
const SIGNED_URL_TTL_SECONDS = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESOURCE_PATH_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|wav|mp3|aac|flac|m4a)$/iu;

type ClassroomResourceAuthority = {
  room_id: string;
  resource_id: string;
  media_path: string;
  download_name: string;
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

function isAuthority(value: unknown): value is ClassroomResourceAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const pathMatch = typeof row.media_path === "string" ? RESOURCE_PATH_PATTERN.exec(row.media_path) : null;
  return typeof row.room_id === "string"
    && ROOM_ID_PATTERN.test(row.room_id)
    && typeof row.resource_id === "string"
    && UUID_PATTERN.test(row.resource_id)
    && pathMatch !== null
    && pathMatch[1].toLowerCase() === row.room_id.toLowerCase()
    && typeof row.download_name === "string"
    && row.download_name.trim().length > 0
    && row.download_name.length <= 120
    && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(row.download_name);
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

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return jsonResponse(401, { error: "authentication_required" }, cors.headers);

  let body: Record<string, unknown>;
  try {
    body = readJsonObject(await request.text());
  } catch {
    return jsonResponse(400, { error: "invalid_request" }, cors.headers);
  }
  if (Object.keys(body).length !== 2
    || !Object.prototype.hasOwnProperty.call(body, "roomId")
    || !Object.prototype.hasOwnProperty.call(body, "resourceId")) {
    return jsonResponse(400, { error: "invalid_request" }, cors.headers);
  }
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  const resourceId = typeof body.resourceId === "string" ? body.resourceId.trim() : "";
  if (!ROOM_ID_PATTERN.test(roomId) || !UUID_PATTERN.test(resourceId)) {
    return jsonResponse(400, { error: "invalid_resource" }, cors.headers);
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
    if (authError || !authData.user) return jsonResponse(401, { error: "authentication_required" }, cors.headers);

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("rooms_authorize_classe_resource_v1", {
      p_room_id: roomId,
      p_user_id: authData.user.id,
      p_resource_id: resourceId,
    });
    if (error) {
      if (error.code === "42501" || error.code === "P0002" || error.code === "55000") {
        return jsonResponse(404, { error: "class_resource_unavailable" }, cors.headers);
      }
      throw new Error("class_resource_authority_unavailable");
    }
    if (!isAuthority(data)
      || data.room_id.toLowerCase() !== roomId.toLowerCase()
      || data.resource_id.toLowerCase() !== resourceId.toLowerCase()) {
      throw new Error("invalid_class_resource_authority");
    }

    const { data: signed, error: signingError } = await service.storage
      .from(CLASSROOM_RESOURCE_BUCKET)
      .createSignedUrl(data.media_path, SIGNED_URL_TTL_SECONDS, { download: data.download_name });
    if (signingError || !signed?.signedUrl) throw new Error("class_resource_signing_failed");
    const signedUrl = new URL(signed.signedUrl, supabaseUrl);
    if (signedUrl.origin !== new URL(supabaseUrl).origin) throw new Error("invalid_class_resource_origin");
    return jsonResponse(200, {
      signedUrl: signedUrl.toString(),
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1_000).toISOString(),
    }, cors.headers);
  } catch {
    console.error("rooms-classe-resource-url", "request_failed");
    return jsonResponse(500, { error: "class_resource_url_unavailable" }, cors.headers);
  }
});
