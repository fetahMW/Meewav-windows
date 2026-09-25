import { describe, expect, it } from "vitest";
import {
  estimateMeeWavPitchCorrectionLatency,
  MEEWAV_PITCH_CORRECTION_PROFILE,
} from "./meewavPitchCorrectionProfile";

describe("MeeWav pitch correction low-latency profile", () => {
  it("keeps the clear 2048-sample YIN history while reducing audible rotating delay", () => {
    expect(MEEWAV_PITCH_CORRECTION_PROFILE.analysisHistorySamples).toBe(2_048);
    expect(MEEWAV_PITCH_CORRECTION_PROFILE.analysisHopSamples).toBe(512);
    expect(MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayMinimumSamples).toBe(64);
    expect(MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayRangeSamples).toBe(1_024);

    const latency = estimateMeeWavPitchCorrectionLatency(48_000);
    expect(latency.analysisHistoryMs).toBeCloseTo(42.667, 2);
    expect(latency.maximumPitchDecisionIntervalMs).toBeCloseTo(10.667, 2);
    expect(latency.estimatedDspLatencyMs).toBe(12);
    expect(latency.maximumDspLatencyMs).toBeCloseTo(22.667, 2);
  });

  it("uses 48 kHz only as a safe diagnostic fallback for an invalid rate", () => {
    expect(estimateMeeWavPitchCorrectionLatency(Number.NaN).sampleRate).toBe(48_000);
  });
});
