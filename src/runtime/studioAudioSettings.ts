export type StudioAudioSettings = {
  voiceGain: number;
  voiceMuted: boolean;
  musicGain: number;
  musicMuted: boolean;
  mono: boolean;
  pan: number;
  delayMs: number;
};

const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function studioAudioSettings(value?: Partial<StudioAudioSettings> | null): StudioAudioSettings {
  return {
    voiceGain: bounded(value?.voiceGain, 1, 0, 1), voiceMuted: value?.voiceMuted === true,
    musicGain: bounded(value?.musicGain, 1, 0, 1), musicMuted: value?.musicMuted === true,
    mono: value?.mono === true, pan: bounded(value?.pan, 0, -1, 1), delayMs: bounded(value?.delayMs, 0, 0, 1000),
  };
}

export const gainToDb = (gain: number) => gain > .001 ? Math.max(-60, 20 * Math.log10(gain)) : -60;
export const dbToGain = (db: number) => db <= -60 ? 0 : 10 ** (db / 20);
export const formatDb = (gain: number) => gain <= .001 ? '−∞ dB' : `${gainToDb(gain).toFixed(1)} dB`;
