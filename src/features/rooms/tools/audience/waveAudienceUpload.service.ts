const MAX_WAVE_FILE_BYTES = 25 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/x-m4a",
};
const ALLOWED_WAVE_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/aac", "audio/flac", "audio/mp4", "audio/x-m4a"]);

function safeExtension(file: Pick<File,"name">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "audio";
  return /^[a-z0-9]{2,5}$/.test(extension) ? extension : "audio";
}

export function validateWaveAudienceFile(file: Pick<File,"name"|"size"|"type">, purpose: "submission"|"base" = "submission") {
  if (file.size <= 0 || file.size > (purpose === "base" ? 64 * 1024 * 1024 : MAX_WAVE_FILE_BYTES)) throw new Error("wave_file_size_invalid");
  const extension = safeExtension(file);
  const mimeType = ALLOWED_WAVE_MIME_TYPES.has(file.type) ? file.type : MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error("wave_file_type_invalid");
  return mimeType;
}

export async function uploadWaveAudienceFile({ roomId, accountId, file }: { roomId: string; accountId: string; file: File }): Promise<string> {
  void roomId;
  void accountId;
  validateWaveAudienceFile(file);
  // The former direct Storage upload bypassed signed one-object tickets,
  // reservation quotas, malware/media processing and immutable versions.
  // Live callers must resolve the normalized waveId and use
  // WaveInfraAdapter.requestAssetUploadTicket -> uploadAsset -> confirm.
  throw new Error("wave_private_asset_pipeline_required");
}

export async function signedWaveAudienceUrl(mediaPath: string): Promise<string> {
  void mediaPath;
  // Read grants are issued by the normalized asset gateway after an
  // authorization check; legacy bucket paths are deliberately unreadable.
  throw new Error("wave_private_asset_gateway_required");
}
