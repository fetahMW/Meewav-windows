import { describe, expect, it } from "vitest";
import {
  OPENDAW_VOICE_CORRECTION_KEYS,
  OPENDAW_VOICE_CORRECTION_SCALES,
  VOICE_CORRECTION_PUBLIC_NAME,
  voiceCorrectionKeyLabel,
  voiceCorrectionScaleLabel,
} from "./voiceCorrection.types";

describe("voice correction openDAW mappings", () => {
  it("uses the familiar public Autotune name without the vendor spelling", () => {
    expect(VOICE_CORRECTION_PUBLIC_NAME).toBe("Autotune");
  });

  it("maps key indices exactly in chromatic order", () => {
    expect(OPENDAW_VOICE_CORRECTION_KEYS).toEqual([
      "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    ]);
    expect(voiceCorrectionKeyLabel(0)).toBe("C");
    expect(voiceCorrectionKeyLabel(11)).toBe("B");
  });

  it("maps all eight scale indices exactly", () => {
    expect(OPENDAW_VOICE_CORRECTION_SCALES).toEqual([
      "Chromatique",
      "Majeure",
      "Mineure",
      "Pentatonique majeure",
      "Pentatonique mineure",
      "Blues",
      "Dorienne",
      "Mixolydienne",
    ]);
    expect(voiceCorrectionScaleLabel(0)).toBe("Chromatique");
    expect(voiceCorrectionScaleLabel(7)).toBe("Mixolydienne");
  });
});
