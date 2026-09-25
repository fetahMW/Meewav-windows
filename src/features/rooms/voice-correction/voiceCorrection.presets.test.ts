import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_CORRECTION_SETTINGS,
  normalizeVoiceCorrectionSettings,
  VOICE_CORRECTION_PRESETS,
  voiceCorrectionPreset,
} from "./voiceCorrection.presets";

describe("voice correction presets", () => {
  it("exposes the three public presets", () => {
    expect(Object.values(VOICE_CORRECTION_PRESETS).map(({ label }) => label)).toEqual([
      "Naturel",
      "Précis",
      "Effet",
    ]);
  });

  it("returns an editable copy instead of the shared preset state", () => {
    const first = voiceCorrectionPreset("natural");
    first.amount = 0;
    expect(voiceCorrectionPreset("natural").amount).toBe(0.55);
  });

  it("clamps every openDAW numeric parameter", () => {
    const normalized = normalizeVoiceCorrectionSettings({
      enabled: true,
      key: 99,
      scale: -3,
      amount: 4,
      retune: -1,
      shift: 24,
      smooth: 2,
    });

    expect(normalized).toEqual({
      enabled: true,
      key: 11,
      scale: 0,
      amount: 1,
      retune: 0,
      shift: 12,
      smooth: 1,
    });
  });

  it("uses technical defaults for non-finite runtime values", () => {
    const normalized = normalizeVoiceCorrectionSettings({
      ...DEFAULT_VOICE_CORRECTION_SETTINGS,
      key: Number.NaN,
      scale: Number.POSITIVE_INFINITY,
      amount: Number.NaN,
      retune: Number.NEGATIVE_INFINITY,
      shift: Number.NaN,
      smooth: Number.POSITIVE_INFINITY,
    });

    expect(normalized).toEqual(DEFAULT_VOICE_CORRECTION_SETTINGS);
  });
});
