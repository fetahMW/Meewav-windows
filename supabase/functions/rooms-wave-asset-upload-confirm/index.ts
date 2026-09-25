import {
  authenticateWaveRequest,
  configuredServiceUrl,
  correlationIdFrom,
  edgeFailure,
  handleWavePreflight,
  IDEMPOTENCY_PATTERN,
  requireWavePost,
  SHA256_PATTERN,
  UUID_PATTERN,
  WAVE_PRIVATE_BUCKET,
  waveBody,
  waveResult,
} from "../_shared/waveInfra.ts";

function processingWorkerConfigured() {
  return Boolean(
    configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_WORKER_URL"))
    || configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_URL")),
  );
}

function metadataValue(metadata: unknown, ...keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return null;
}

Deno.serve(async (request) => {
  const preflight = handleWavePreflight(request);
  if (preflight) return preflight;
  const gate = await requireWavePost(request);
  if (gate.response) return gate.response;

  let correlationId = crypto.randomUUID();
  try {
    const body = await waveBody(request);
    correlationId = correlationIdFrom(body.correlationId);
    if (!processingWorkerConfigured()) {
      throw Object.assign(new Error("wave_audio_processing_not_configured"), { code: "50300" });
    }
    const waveId = typeof body.waveId === "string" ? body.waveId.trim() : "";
    const uploadId = typeof body.uploadId === "string" ? body.uploadId.trim() : "";
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    const sha256 = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const byteSize = typeof body.byteSize === "number" && Number.isSafeInteger(body.byteSize) ? body.byteSize : 0;
    if (!UUID_PATTERN.test(waveId) || !UUID_PATTERN.test(uploadId) || !UUID_PATTERN.test(assetId)
      || byteSize <= 0 || !SHA256_PATTERN.test(sha256) || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      throw Object.assign(new Error("wave_upload_confirmation_invalid"), { code: "22023" });
    }

    const { service, user } = await authenticateWaveRequest(request);
    const { data: upload, error: uploadError } = await service
      .from("wave_asset_uploads_v4")
      .select("id,session_id,actor_id,asset_id,storage_bucket,storage_path,expected_byte_size,expected_sha256,state,expires_at")
      .eq("id", uploadId)
      .eq("session_id", waveId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload || upload.actor_id !== user.id) {
      throw Object.assign(new Error(upload ? "wave_upload_confirmation_forbidden" : "wave_upload_not_found"), {
        code: upload ? "42501" : "P0002",
      });
    }
    if (upload.storage_bucket !== WAVE_PRIVATE_BUCKET || typeof upload.storage_path !== "string") {
      throw new Error("wave_upload_storage_authority_invalid");
    }
    if (upload.state !== "AWAITING_UPLOAD") {
      // Idempotent confirmations are resolved by the RPC receipt below. We
      // still inspect the exact private object instead of trusting the client.
      if (upload.state !== "PROCESSING") {
        throw Object.assign(new Error("wave_upload_not_awaiting_confirmation"), { code: "55000" });
      }
    }

    const slash = upload.storage_path.lastIndexOf("/");
    const folder = upload.storage_path.slice(0, slash);
    const leaf = upload.storage_path.slice(slash + 1);
    const { data: objects, error: listError } = await service.storage
      .from(WAVE_PRIVATE_BUCKET)
      .list(folder, { limit: 10, search: leaf, sortBy: { column: "name", order: "asc" } });
    if (listError) throw Object.assign(new Error("wave_private_storage_unavailable"), { code: "50300", cause: listError });
    const object = objects?.find((candidate) => candidate.name === leaf);
    if (!object) throw Object.assign(new Error("wave_upload_object_missing"), { code: "55000" });
    const observedSizeValue = metadataValue(object.metadata, "size", "contentLength", "content_length");
    const observedSize = typeof observedSizeValue === "number"
      ? observedSizeValue
      : typeof observedSizeValue === "string"
        ? Number(observedSizeValue)
        : NaN;
    if (!Number.isSafeInteger(observedSize) || observedSize <= 0) {
      throw Object.assign(new Error("wave_upload_object_metadata_missing"), { code: "50300" });
    }
    const observedMimeValue = metadataValue(object.metadata, "mimetype", "contentType", "content_type");
    const observedMime = typeof observedMimeValue === "string" ? observedMimeValue : null;
    const observedEtagValue = metadataValue(object.metadata, "eTag", "etag");
    const observedEtag = typeof observedEtagValue === "string" ? observedEtagValue : object.id ?? null;

    const { data: status, error: confirmError } = await service.rpc("rooms_wave_confirm_asset_upload_v5", {
      p_actor_id: user.id,
      p_session_id: waveId,
      p_upload_id: uploadId,
      p_asset_id: assetId,
      p_byte_size: byteSize,
      p_sha256: sha256,
      p_observed_byte_size: observedSize,
      p_observed_mime_type: observedMime,
      p_observed_etag: observedEtag,
      p_idempotency_key: idempotencyKey,
      p_correlation_id: correlationId,
    });
    if (confirmError) throw confirmError;
    if (!status || typeof status !== "object" || Array.isArray(status)
      || !["VERIFYING", "PROCESSING"].includes(String((status as Record<string, unknown>).state))) {
      // Confirmation is only an enqueue acknowledgement. READY here would be a
      // false claim because no isolated worker has verified the bytes yet.
      throw new Error("wave_upload_confirmation_state_invalid");
    }

    const dispatchUrl = configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_URL"));
    if (dispatchUrl) {
      const dispatchToken = Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_TOKEN")?.trim();
      // Best effort wake-up only. The database outbox remains the source of
      // truth, so a dispatcher outage cannot lose the processing job.
      void fetch(dispatchUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(dispatchToken ? { authorization: `Bearer ${dispatchToken}` } : {}),
        },
        body: JSON.stringify({ waveId, uploadId, assetId, correlationId }),
      }).catch(() => undefined);
    }
    return waveResult(status, correlationId, gate.cors.headers);
  } catch (error) {
    return edgeFailure(error, correlationId, "wave_upload_confirmation_unavailable", gate.cors.headers);
  }
});
