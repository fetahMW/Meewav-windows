import { createClient } from "npm:@supabase/supabase-js@2";
import {
  configuredServiceUrl,
  correlationIdFrom,
  corsForWaveRequest,
  handleWavePreflight,
  WAVE_PRIVATE_BUCKET,
  waveBody,
  waveResult,
} from "../_shared/waveInfra.ts";
import { jsonResponse } from "../_shared/audioPairing.ts";

type ServiceName = "database" | "realtime" | "object_storage" | "audio_processing" | "audio_engine" | "media_sfu";
type ServiceStatus = "healthy" | "degraded" | "unavailable" | "not_configured";

type HealthRow = {
  service: ServiceName;
  status: ServiceStatus;
  required: boolean;
  checkedAt: string;
  detailCode: string | null;
};

async function probe(name: ServiceName, envName: string, checkedAt: string): Promise<HealthRow> {
  const url = Deno.env.get(envName)?.trim();
  if (!url) return { service: name, status: "not_configured", required: true, checkedAt, detailCode: `${envName}_MISSING` };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { service: name, status: "not_configured", required: true, checkedAt, detailCode: `${envName}_INVALID` };
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    return { service: name, status: "not_configured", required: true, checkedAt, detailCode: `${envName}_INSECURE` };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const token = Deno.env.get("WAVE_HEALTH_PROBE_TOKEN")?.trim();
    const response = await fetch(parsed, {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      redirect: "error",
      signal: controller.signal,
    });
    return response.ok
      ? { service: name, status: "healthy", required: true, checkedAt, detailCode: null }
      : { service: name, status: "unavailable", required: true, checkedAt, detailCode: `HTTP_${response.status}` };
  } catch {
    return { service: name, status: "unavailable", required: true, checkedAt, detailCode: "HEALTH_PROBE_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  const preflight = handleWavePreflight(request);
  if (preflight) return preflight;
  const cors = corsForWaveRequest(request);
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, cors.headers);
  if (!cors.allowed) return jsonResponse(403, { error: "origin_refused" });

  const checkedAt = new Date().toISOString();
  let correlationId = crypto.randomUUID();
  try {
    const body = await waveBody(request);
    correlationId = correlationIdFrom(body.correlationId);
  } catch {
    return jsonResponse(400, { correlationId, error: "invalid_json" }, cors.headers);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const missingConfiguration = new Set<string>();
  const services: HealthRow[] = [];
  let databaseHealthy = false;
  let storageHealthy = false;

  if (!supabaseUrl) missingConfiguration.add("SUPABASE_URL");
  if (!serviceRoleKey) missingConfiguration.add("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    services.push({ service: "database", status: "not_configured", required: true, checkedAt, detailCode: "SUPABASE_AUTHORITY_MISSING" });
    services.push({ service: "object_storage", status: "not_configured", required: true, checkedAt, detailCode: "SUPABASE_AUTHORITY_MISSING" });
  } else {
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: dbError } = await service.from("wave_asset_uploads_v4").select("id", { head: true, count: "exact" }).limit(1);
    databaseHealthy = !dbError;
    services.push({
      service: "database",
      status: dbError ? "unavailable" : "healthy",
      required: true,
      checkedAt,
      detailCode: dbError ? "WAVE_V4_DATABASE_UNAVAILABLE" : null,
    });
    const { data: bucket, error: bucketError } = await service.storage.getBucket(WAVE_PRIVATE_BUCKET);
    storageHealthy = !bucketError && Boolean(bucket) && bucket?.public === false;
    services.push({
      service: "object_storage",
      status: storageHealthy ? "healthy" : "unavailable",
      required: true,
      checkedAt,
      detailCode: storageHealthy ? null : "WAVE_PRIVATE_BUCKET_UNAVAILABLE",
    });
  }

  const probeSpecs: Array<[ServiceName, string]> = [
    ["realtime", "WAVE_REALTIME_HEALTH_URL"],
    ["audio_processing", "WAVE_AUDIO_PROCESSING_HEALTH_URL"],
    ["audio_engine", "WAVE_AUDIO_ENGINE_HEALTH_URL"],
    ["media_sfu", "WAVE_MEDIA_SFU_HEALTH_URL"],
  ];
  const probed = await Promise.all(probeSpecs.map(([name, env]) => probe(name, env, checkedAt)));
  services.push(...probed);
  for (const [, envName] of probeSpecs) if (!Deno.env.get(envName)?.trim()) missingConfiguration.add(envName);
  if (!configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_WORKER_URL"))
    && !configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_URL"))) {
    missingConfiguration.add("WAVE_AUDIO_PROCESSING_WORKER_URL");
    const processing = services.find((row) => row.service === "audio_processing");
    if (processing) {
      processing.status = "not_configured";
      processing.detailCode = "WAVE_AUDIO_PROCESSING_WORKER_URL_MISSING";
    }
  }
  if (!configuredServiceUrl(Deno.env.get("WAVE_AUDIO_ENGINE_RENDER_URL"))
    && !configuredServiceUrl(Deno.env.get("WAVE_AUDIO_ENGINE_URL"))) {
    missingConfiguration.add("WAVE_AUDIO_ENGINE_RENDER_URL");
    const engine = services.find((row) => row.service === "audio_engine");
    if (engine) {
      engine.status = "not_configured";
      engine.detailCode = "WAVE_AUDIO_ENGINE_RENDER_URL_MISSING";
    }
  }

  const statusOf = (service: ServiceName) => services.find((row) => row.service === service)?.status;
  const realtimeHealthy = statusOf("realtime") === "healthy";
  const processingHealthy = statusOf("audio_processing") === "healthy";
  const engineHealthy = statusOf("audio_engine") === "healthy";
  const sfuHealthy = statusOf("media_sfu") === "healthy";
  const capabilities = {
    programAudioRouting: databaseHealthy && engineHealthy,
    realtimeRecovery: databaseHealthy && realtimeHealthy,
    signedDirectUpload: databaseHealthy && storageHealthy,
    asynchronousProcessing: databaseHealthy && processingHealthy,
    collectiveBeatRendering: databaseHealthy && engineHealthy,
    sfuDistribution: sfuHealthy,
  };
  const productionReady = services.every((row) => !row.required || row.status === "healthy")
    && Object.values(capabilities).every(Boolean);

  return waveResult({
    mode: "production",
    deploymentId: Deno.env.get("WAVE_DEPLOYMENT_ID")?.trim() || null,
    checkedAt,
    productionReady,
    services,
    missingConfiguration: [...missingConfiguration].sort(),
    capabilities,
  }, correlationId, cors.headers);
});
