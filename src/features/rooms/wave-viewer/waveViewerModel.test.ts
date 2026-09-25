import { describe, expect, it } from "vitest";
import { contributionLabel, formatWaveBpm, workshopCompatibility, type ViewerRules } from "./waveViewerModel";
const rules: ViewerRules = { id: "rules-12", bpm: 120, key: "Do mineur", signature: "4/4", cycleBars: 8, acceptedBars: [4, 8], maxDurationMs: 16000, repeatPolicy: "REPEAT_TO_CYCLE", mimeTypes: ["audio/wav"] };
describe("Wave Viewer musical and activation semantics", () => {
  it("formats BPM without mutating the official engine value", () => { const bpm = 129.91544264875787; expect(formatWaveBpm(bpm)).toBe("129,9"); expect(bpm).toBe(129.91544264875787); });
  it("uses the allowed lengths, cycle and signature independently", () => {
    expect(workshopCompatibility(8, rules)).toEqual({ bars: 4, error: null });
    expect(workshopCompatibility(4, rules).error).toContain("longueurs autorisées 4, 8");
    expect(workshopCompatibility(8.06, rules).error).toContain("Durée incompatible");
    expect(workshopCompatibility(6, { ...rules, signature: "3/4" })).toEqual({ bars: 4, error: null });
    expect(workshopCompatibility(6, { ...rules, signature: "6/8" })).toEqual({ bars: 4, error: null });
  });
  it("does not truncate overlong material or infer missing rules", () => {
    expect(workshopCompatibility(32, { ...rules, acceptedBars: [16], maxDurationMs: 40000 }).error).toContain("ni tronquée ni étirée");
    expect(workshopCompatibility(16, null).error).toContain("préparation");
  });
  it("separates public approval from activation and host rejection from public rejection", () => {
    const item = { id: "s", title: "Basse", category: "bass", version: 1, status: "ACCEPTED", reason: null, integrated: false };
    expect(contributionLabel(item)).toBe("Validée — activation en préparation");
    expect(contributionLabel({ ...item, integrated: true })).toBe("Intégrée au Beat");
    expect(contributionLabel({ ...item, status: "NOT_SELECTED" })).toContain("public");
    expect(contributionLabel({ ...item, status: "REJECTED" })).toContain("host");
  });
});
