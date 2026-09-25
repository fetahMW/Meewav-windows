/** Public product name. Keep the familiar spelling without the Antares hyphen. */
export const VOICE_CORRECTION_PUBLIC_NAME = "Autotune" as const;

export const OPENDAW_VOICE_CORRECTION_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const OPENDAW_VOICE_CORRECTION_SCALES = [
  "Chromatique",
  "Majeure",
  "Mineure",
  "Pentatonique majeure",
  "Pentatonique mineure",
  "Blues",
  "Dorienne",
  "Mixolydienne",
] as const;

export type VoiceCorrectionKeyIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type VoiceCorrectionScaleIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type VoiceCorrectionKey = (typeof OPENDAW_VOICE_CORRECTION_KEYS)[VoiceCorrectionKeyIndex];
export type VoiceCorrectionScale = (typeof OPENDAW_VOICE_CORRECTION_SCALES)[VoiceCorrectionScaleIndex];
export type VoiceCorrectionPresetId = "natural" | "precise" | "effect";

/** Canonical MeeWav settings mapped one-to-one to openDAW's AutotuneDeviceBox. */
export type VoiceCorrectionSettings = {
  enabled: boolean;
  key: VoiceCorrectionKeyIndex;
  scale: VoiceCorrectionScaleIndex;
  amount: number;
  retune: number;
  shift: number;
  smooth: number;
};

/** Untrusted numeric shape accepted at storage/realtime/UI boundaries. */
export type VoiceCorrectionSettingsInput = Omit<VoiceCorrectionSettings, "key" | "scale"> & {
  key: number;
  scale: number;
};

export type VoiceCorrectionPreset = {
  id: VoiceCorrectionPresetId;
  label: "Naturel" | "Précis" | "Effet";
  settings: Readonly<VoiceCorrectionSettings>;
};

export function voiceCorrectionKeyLabel(index: VoiceCorrectionKeyIndex): VoiceCorrectionKey {
  return OPENDAW_VOICE_CORRECTION_KEYS[index];
}

export function voiceCorrectionScaleLabel(index: VoiceCorrectionScaleIndex): VoiceCorrectionScale {
  return OPENDAW_VOICE_CORRECTION_SCALES[index];
}
