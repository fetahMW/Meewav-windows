export const VOICE_CORRECTION_LAB_ROUTE = "/labs/correction-vocale" as const;

export type VoiceCorrectionCaptureMode = "music" | "browser-assisted";

export function buildVoiceCorrectionMicrophoneConstraints(
  deviceId: string | null,
  mode: VoiceCorrectionCaptureMode,
): MediaStreamConstraints {
  const browserAssisted = mode === "browser-assisted";
  return {
    audio: {
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48_000 },
      echoCancellation: browserAssisted,
      noiseSuppression: browserAssisted,
      autoGainControl: browserAssisted,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
    video: false,
  };
}

export function linearAmplitudeToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return -72;
  return Math.max(-72, Math.min(0, 20 * Math.log10(value)));
}

export function meterPercentFromDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 72) / 72) * 100));
}

export function formatLatency(valueMs: number | null | undefined): string {
  return typeof valueMs === "number" && Number.isFinite(valueMs)
    ? `${valueMs.toFixed(valueMs < 10 ? 1 : 0)} ms`
    : "Non mesurée";
}

export function selectRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export function readableMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "L’accès au microphone a été refusé.";
    if (error.name === "NotFoundError") return "Aucun microphone compatible n’a été trouvé.";
    if (error.name === "NotReadableError") return "Le microphone est déjà utilisé ou inaccessible.";
    if (error.name === "OverconstrainedError") return "Le microphone ne prend pas en charge les réglages demandés.";
  }
  return error instanceof Error ? error.message : "Une erreur audio inconnue est survenue.";
}
