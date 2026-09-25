import type {
  VoiceCorrectionPreset,
  VoiceCorrectionPresetId,
  VoiceCorrectionSettings,
  VoiceCorrectionSettingsInput,
} from "./voiceCorrection.types";

export const DEFAULT_VOICE_CORRECTION_SETTINGS: Readonly<VoiceCorrectionSettings> = Object.freeze({
  enabled: false,
  key: 0,
  scale: 0,
  amount: 1,
  retune: 0.5,
  shift: 0,
  smooth: 0.6,
});

export const VOICE_CORRECTION_PRESETS = Object.freeze({
  natural: Object.freeze({
    id: "natural",
    label: "Naturel",
    settings: Object.freeze({
      enabled: true,
      key: 0,
      scale: 0,
      amount: 0.55,
      retune: 0.35,
      shift: 0,
      smooth: 0.82,
    }),
  }),
  precise: Object.freeze({
    id: "precise",
    label: "Précis",
    settings: Object.freeze({
      enabled: true,
      key: 0,
      scale: 1,
      amount: 0.88,
      retune: 0.72,
      shift: 0,
      smooth: 0.45,
    }),
  }),
  effect: Object.freeze({
    id: "effect",
    label: "Effet",
    settings: Object.freeze({
      enabled: true,
      key: 0,
      scale: 1,
      amount: 1,
      retune: 1,
      shift: 0,
      smooth: 0.08,
    }),
  }),
} satisfies Record<VoiceCorrectionPresetId, VoiceCorrectionPreset>);

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number, fallback: number) {
  return Math.min(max, Math.max(min, finiteOr(value, fallback)));
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  return Math.round(clamp(value, min, max, fallback));
}

/**
 * Runtime boundary for values coming from UI, storage or a realtime payload.
 * It guarantees that openDAW never receives an out-of-range parameter.
 */
export function normalizeVoiceCorrectionSettings(
  settings: VoiceCorrectionSettingsInput,
): VoiceCorrectionSettings {
  return {
    enabled: settings.enabled === true,
    key: clampInteger(settings.key, 0, 11, DEFAULT_VOICE_CORRECTION_SETTINGS.key) as VoiceCorrectionSettings["key"],
    scale: clampInteger(settings.scale, 0, 7, DEFAULT_VOICE_CORRECTION_SETTINGS.scale) as VoiceCorrectionSettings["scale"],
    amount: clamp(settings.amount, 0, 1, DEFAULT_VOICE_CORRECTION_SETTINGS.amount),
    retune: clamp(settings.retune, 0, 1, DEFAULT_VOICE_CORRECTION_SETTINGS.retune),
    shift: clamp(settings.shift, -12, 12, DEFAULT_VOICE_CORRECTION_SETTINGS.shift),
    smooth: clamp(settings.smooth, 0, 1, DEFAULT_VOICE_CORRECTION_SETTINGS.smooth),
  };
}

export function voiceCorrectionPreset(id: VoiceCorrectionPresetId): VoiceCorrectionSettings {
  return { ...VOICE_CORRECTION_PRESETS[id].settings };
}
