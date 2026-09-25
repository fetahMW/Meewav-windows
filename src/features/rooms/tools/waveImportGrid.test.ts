import { describe, expect, it } from "vitest";
import { assertWaveBaseDuration, waveBarsForImportedDuration } from "./waveImportGrid";

describe("grille des productions réimportées", () => {
  it.each([4, 8, 16] as const)("reconnaît exactement %s mesures au BPM de la Wave", (bars) => {
    const bpm = 130;
    expect(waveBarsForImportedDuration({
      durationSeconds: bars * 4 * 60 / bpm,
      bpm,
      fallbackBars: 8,
    })).toBe(bars);
  });

  it("absorbe le petit padding d’un codec sans accepter une dérive musicale", () => {
    const exact = 8 * 4 * 60 / 124;
    expect(waveBarsForImportedDuration({ durationSeconds: exact + .08, bpm: 124, fallbackBars: 8 })).toBe(8);
    expect(() => waveBarsForImportedDuration({ durationSeconds: exact + 1.2, bpm: 124, fallbackBars: 8 }))
      .toThrow("wave_import_duration_off_grid");
  });

  it("interdit de remplacer une base de huit mesures par une production de quatre", () => {
    expect(() => assertWaveBaseDuration({ durationSeconds: 4 * 4 * 60 / 130, bpm: 130, baseBars: 8 }))
      .toThrow("wave_import_base_length_mismatch");
  });
});
