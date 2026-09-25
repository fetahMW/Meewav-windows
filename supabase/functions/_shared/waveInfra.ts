import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedOrigins,
  jsonResponse,
  readJsonObject,
  requiredEnvironment,
} from "./audioPairing.ts";

export const WAVE_PRIVATE_BUCKET = "room-wave-private";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
export const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{15,199}$/u;
export const CATEGORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;

export function configuredServiceUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export type WaveRequestContext = Awaited<ReturnType<typeof authenticateWaveRequest>>;

export function corsForWaveRequest(request: Request) {
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

export function handleWavePreflight(request: Request) {
  const cors = corsForWaveRequest(request);
  if (request.method !== "OPTIONS") return null;
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

export function correlationIdFrom(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256
    ? value.trim()
    : crypto.randomUUID();
}

export function waveResult(data: unknown, correlationId: string, headers: HeadersInit = {}) {
  return jsonResponse(200, { correlationId, data }, headers);
}

export function waveErrorStatus(error: unknown) {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const code = typeof row?.code === "string" ? row.code : "";
  const message = typeof row?.message === "string" ? row.message : "";
  if (code === "42501" || /forbidden|required$/u.test(message)) return 403;
  if (code === "P0002") return 404;
  if (code === "42900" || code === "53300") return 429;
  if (code === "50300") return 503;
  if (code === "23505") return 409;
  if (code === "22023" || code === "23514" || code === "55000") return 422;
  return 500;
}

export function safeWaveErrorCode(error: unknown, fallback: string) {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const message = typeof row?.message === "string" ? row.message : "";
  return /^wave_[a-z0-9_]{1,100}$/u.test(message) ? message : fallback;
}

export async function waveBody(request: Request) {
  return readJsonObject(await request.text());
}

export async function authenticateWaveRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("authentication_required"), { code: "42501" });
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw Object.assign(new Error("authentication_required"), { code: "42501" });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { authClient, service, user: data.user, supabaseUrl };
}

export async function requireWavePost(request: Request) {
  const cors = corsForWaveRequest(request);
  if (request.method !== "POST") return { response: jsonResponse(405, { error: "method_not_allowed" }, cors.headers), cors };
  if (!cors.allowed) return { response: jsonResponse(403, { error: "origin_refused" }), cors };
  return { response: null, cors };
}

export function edgeFailure(
  error: unknown,
  correlationId: string,
  fallback: string,
  headers: HeadersInit = {},
) {
  const status = waveErrorStatus(error);
  const code = safeWaveErrorCode(error, fallback);
  console.error(fallback, code, status);
  return jsonResponse(status, { correlationId, error: code }, headers);
}
