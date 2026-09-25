import {
  authenticateWaveRequest,
  configuredServiceUrl,
  correlationIdFrom,
  edgeFailure,
  handleWavePreflight,
  requireWavePost,
  UUID_PATTERN,
  WAVE_PRIVATE_BUCKET,
  waveBody,
  waveResult,
} from "../_shared/waveInfra.ts";

const MODES = new Set(["SOLO", "WITH_BEAT"]);
const SIGNED_READ_TTL_SECONDS = 120;

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
    const candidateVersionId = typeof body.candidateVersionId === "string" ? body.candidateVersionId.trim() : "";
    const referenceBeatRevisionId = typeof body.referenceBeatRevisionId === "string" ? body.referenceBeatRevisionId.trim() : "";
    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    if (!UUID_PATTERN.test(waveId) || !UUID_PATTERN.test(candidateVersionId)
      || !UUID_PATTERN.test(referenceBeatRevisionId) || !MODES.has(mode)) {
      throw Object.assign(new Error("wave_private_audition_request_invalid"), { code: "22023" });
    }

    const renderAvailable = Boolean(
      configuredServiceUrl(Deno.env.get("WAVE_AUDIO_ENGINE_RENDER_URL"))
      || configuredServiceUrl(Deno.env.get("WAVE_AUDIO_ENGINE_URL")),
    );
    const { authClient, service } = await authenticateWaveRequest(request);
    const { data: authority, error: authorityError } = await authClient.rpc("rooms_wave_request_private_audition_v4", {
      p_session_id: waveId,
      p_candidate_version_id: candidateVersionId,
      p_reference_beat_revision_id: referenceBeatRevisionId,
      p_mode: mode,
      p_render_available: renderAvailable,
      p_correlation_id: correlationId,
    });
    if (authorityError) throw authorityError;
    if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
      throw new Error("wave_private_audition_authority_invalid");
    }
    const row = authority as Record<string, unknown>;
    const state = typeof row.state === "string" ? row.state : "";
    const previewAssetId = typeof row.previewAssetId === "string" ? row.previewAssetId : null;
    if (state !== "READY" || !previewAssetId) {
      return waveResult({ ...row, signedUrl: null, expiresAt: null }, correlationId, gate.cors.headers);
    }

    const { data: asset, error: assetError } = await service
      .from("wave_audio_assets_v3")
      .select("id,session_id,status,storage_bucket,storage_path")
      .eq("id", previewAssetId)
      .eq("session_id", waveId)
      .eq("status", "READY")
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset || asset.storage_bucket !== WAVE_PRIVATE_BUCKET || typeof asset.storage_path !== "string") {
      throw Object.assign(new Error("wave_private_audition_asset_unavailable"), { code: "50300" });
    }
    const { data: signed, error: signedError } = await service.storage
      .from(WAVE_PRIVATE_BUCKET)
      .createSignedUrl(asset.storage_path, SIGNED_READ_TTL_SECONDS, { download: false });
    if (signedError || !signed?.signedUrl) {
      throw Object.assign(new Error("wave_private_audition_signing_unavailable"), { code: "50300" });
    }
    return waveResult({
      ...row,
      signedUrl: signed.signedUrl,
      expiresAt: new Date(Date.now() + SIGNED_READ_TTL_SECONDS * 1_000).toISOString(),
    }, correlationId, gate.cors.headers);
  } catch (error) {
    return edgeFailure(error, correlationId, "wave_private_audition_unavailable", gate.cors.headers);
  }
});
