import {
  authenticateWaveRequest,
  configuredServiceUrl,
  correlationIdFrom,
  edgeFailure,
  handleWavePreflight,
  requireWavePost,
  UUID_PATTERN,
  waveBody,
  waveResult,
} from "../_shared/waveInfra.ts";

Deno.serve(async (request) => {
  const preflight = handleWavePreflight(request);
  if (preflight) return preflight;
  const gate = await requireWavePost(request);
  if (gate.response) return gate.response;

  let correlationId = crypto.randomUUID();
  try {
    const body = await waveBody(request);
    correlationId = correlationIdFrom(body.correlationId);
    const waveId = typeof body.waveId === "string" ? body.waveId.trim() : "";
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    if (!UUID_PATTERN.test(waveId) || !UUID_PATTERN.test(assetId)) {
      throw Object.assign(new Error("wave_asset_status_request_invalid"), { code: "22023" });
    }
    if (!configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_WORKER_URL"))
      && !configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_URL"))) {
      throw Object.assign(new Error("wave_audio_processing_not_configured"), { code: "50300" });
    }
    const { authClient } = await authenticateWaveRequest(request);
    const { data, error } = await authClient.rpc("rooms_wave_get_asset_processing_status_v4", {
      p_session_id: waveId,
      p_asset_id: assetId,
    });
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("wave_asset_status_response_invalid");
    }
    return waveResult(data, correlationId, gate.cors.headers);
  } catch (error) {
    return edgeFailure(error, correlationId, "wave_asset_status_unavailable", gate.cors.headers);
  }
});
