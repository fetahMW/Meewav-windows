import { authenticateWaveRequest, edgeFailure, handleWavePreflight, requireWavePost, UUID_PATTERN, waveBody, waveResult, WAVE_PRIVATE_BUCKET } from "../_shared/waveInfra.ts";

/** The browser supplies a reference/round identity, never an asset or Storage path. */
Deno.serve(async request => {
  const preflight = handleWavePreflight(request);
  if (preflight) return preflight;
  const gate = await requireWavePost(request);
  if (gate.response) return gate.response;
  const correlationId = crypto.randomUUID();
  try {
    const body = await waveBody(request);
    const waveId = typeof body.waveId === "string" ? body.waveId : "";
    const id = typeof body.id === "string" ? body.id : "";
    const kind = typeof body.kind === "string" ? body.kind : "";
    const option = typeof body.option === "string" ? body.option : "mix";
    if (!UUID_PATTERN.test(waveId) || !UUID_PATTERN.test(id) || !["reference", "vote", "closing", "layer"].includes(kind)
      || !["mix", "SOLO", "WITH_BEAT", "A"].includes(option)) throw Object.assign(new Error("wave_media_request_invalid"), { code: "22023" });
    const { authClient, service } = await authenticateWaveRequest(request);
    const { data: assetId, error: grantError } = await authClient.rpc("rooms_wave_viewer_media_grant_v6", {
      p_session_id: waveId, p_kind: kind, p_id: id, p_option: option,
    });
    if (grantError) throw grantError;
    if (typeof assetId !== "string" || !UUID_PATTERN.test(assetId)) throw new Error("wave_media_grant_invalid");
    const { data: asset, error } = await service.from("wave_audio_assets_v3")
      .select("storage_bucket,storage_path,status,kind").eq("id", assetId).eq("session_id", waveId).single();
    if (error || !asset || asset.status !== "READY" || asset.kind === "ORIGINAL" || asset.storage_bucket !== WAVE_PRIVATE_BUCKET
      || !asset.storage_path.startsWith(`sessions/${waveId}/`)) throw Object.assign(new Error("wave_media_forbidden"), { code: "42501" });
    const { data: bucket } = await service.storage.getBucket(WAVE_PRIVATE_BUCKET);
    if (!bucket || bucket.public) throw new Error("wave_private_storage_unavailable");
    const { data: signed, error: signedError } = await service.storage.from(WAVE_PRIVATE_BUCKET).createSignedUrl(asset.storage_path, 120);
    if (signedError || !signed?.signedUrl) throw new Error("wave_media_unavailable");
    return waveResult({ url: signed.signedUrl, expiresAt: new Date(Date.now() + 120000).toISOString() }, correlationId, gate.cors.headers);
  } catch (error) { return edgeFailure(error, correlationId, "wave_viewer_media_unavailable", gate.cors.headers); }
});
