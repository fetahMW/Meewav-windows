import {
  CATEGORY_PATTERN,
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
  authenticateWaveRequest,
} from "../_shared/waveInfra.ts";

const PURPOSES = new Set(["LOOP_ORIGINAL", "LOOP_CORRECTION", "HOST_BASE_LOOP"]);
const FILE_NAME_PATTERN = /^[^\\/\u0000-\u001f\u007f]{1,255}$/u;

function processingWorkerConfigured() {
  return Boolean(
    configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_WORKER_URL"))
    || configuredServiceUrl(Deno.env.get("WAVE_AUDIO_PROCESSING_DISPATCH_URL")),
  );
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
      return edgeFailure(
        Object.assign(new Error("wave_audio_processing_not_configured"), { code: "50300" }),
        correlationId,
        "wave_upload_ticket_unavailable",
        gate.cors.headers,
      );
    }

    const waveId = typeof body.waveId === "string" ? body.waveId.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const claimedMimeType = typeof body.claimedMimeType === "string" ? body.claimedMimeType.trim().toLowerCase() : "";
    const sha256 = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const byteSize = typeof body.byteSize === "number" && Number.isSafeInteger(body.byteSize) ? body.byteSize : 0;
    const terms = body.terms && typeof body.terms === "object" && !Array.isArray(body.terms)
      ? body.terms as Record<string, unknown>
      : null;
    const termsVersion = typeof terms?.termsVersion === "string" ? terms.termsVersion.trim() : "";
    const acceptedAt = typeof terms?.acceptedAt === "string" ? terms.acceptedAt : "";
    if (!UUID_PATTERN.test(waveId) || !PURPOSES.has(purpose) || !CATEGORY_PATTERN.test(category)
      || !FILE_NAME_PATTERN.test(fileName) || byteSize <= 0 || !claimedMimeType.startsWith("audio/")
      || claimedMimeType.length > 128 || !SHA256_PATTERN.test(sha256)
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey) || !termsVersion || termsVersion.length > 128
      || !Number.isFinite(Date.parse(acceptedAt))) {
      return edgeFailure(Object.assign(new Error("wave_upload_request_invalid"), { code: "22023" }), correlationId,
        "wave_upload_ticket_unavailable", gate.cors.headers);
    }

    const { authClient, service } = await authenticateWaveRequest(request);
    const { data: bucket, error: bucketError } = await service.storage.getBucket(WAVE_PRIVATE_BUCKET);
    if (bucketError || !bucket || bucket.public) {
      throw Object.assign(new Error("wave_private_storage_not_configured"), { code: "50300" });
    }

    const viewerDraft = body.viewerDraft && typeof body.viewerDraft === "object" && !Array.isArray(body.viewerDraft)
      ? body.viewerDraft as Record<string, unknown> : null;
    if (viewerDraft && (purpose !== "LOOP_ORIGINAL" || typeof viewerDraft.title !== "string"
      || viewerDraft.title.trim().length < 1 || viewerDraft.title.length > 80
      || !(viewerDraft.referenceId === null || (typeof viewerDraft.referenceId === "string" && UUID_PATTERN.test(viewerDraft.referenceId))))) {
      throw Object.assign(new Error("wave_viewer_context_invalid"), { code: "22023" });
    }
    const { data: authority, error: authorityError } = await authClient.rpc(viewerDraft ? "rooms_wave_viewer_upload_v6" : "rooms_wave_request_asset_upload_v5", {
      p_session_id: waveId,
      ...(viewerDraft ? { p_title: viewerDraft.title, p_reference_id: viewerDraft.referenceId } : { p_purpose: purpose }),
      p_category_code: category,
      p_file_name: fileName,
      p_byte_size: byteSize,
      p_claimed_mime_type: claimedMimeType,
      p_sha256: sha256,
      p_terms_version: termsVersion,
      p_terms_accepted_at: acceptedAt,
      p_idempotency_key: idempotencyKey,
      p_correlation_id: correlationId,
    });
    if (authorityError) throw authorityError;
    if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
      throw new Error("wave_upload_authority_invalid");
    }
    const row = authority as Record<string, unknown>;
    const objectKey = typeof row.objectKey === "string" ? row.objectKey : "";
    const uploadId = typeof row.uploadId === "string" ? row.uploadId : "";
    const assetId = typeof row.assetId === "string" ? row.assetId : "";
    const expiresAt = typeof row.expiresAt === "string" ? row.expiresAt : "";
    const maxBytes = typeof row.maxBytes === "number" ? row.maxBytes : Number(row.maxBytes);
    if (!UUID_PATTERN.test(uploadId) || !UUID_PATTERN.test(assetId)
      || !objectKey.startsWith(`sessions/${waveId}/assets/${assetId}/`)
      || !Number.isFinite(Date.parse(expiresAt)) || !Number.isSafeInteger(maxBytes) || maxBytes < byteSize) {
      throw new Error("wave_upload_authority_invalid");
    }

    const { data: signed, error: signedError } = await service.storage
      .from(WAVE_PRIVATE_BUCKET)
      .createSignedUploadUrl(objectKey, { upsert: false });
    if (signedError || !signed?.signedUrl || signed.path !== objectKey) {
      throw Object.assign(new Error("wave_signed_upload_unavailable"), { code: "50300" });
    }

    return waveResult({
      uploadId,
      assetId,
      objectKey,
      uploadUrl: signed.signedUrl,
      method: "PUT",
      headers: {
        "content-type": claimedMimeType,
        "cache-control": "max-age=0",
        "x-upsert": "false",
      },
      expiresAt,
      maxBytes,
      // Supabase signed uploads are single-object PUTs. We explicitly avoid
      // claiming resumability until a TUS/S3 multipart gateway is configured.
      resumable: false,
    }, correlationId, gate.cors.headers);
  } catch (error) {
    return edgeFailure(error, correlationId, "wave_upload_ticket_unavailable", gate.cors.headers);
  }
});
