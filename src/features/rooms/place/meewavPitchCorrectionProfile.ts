/**
 * Latency-sensitive parameters shared with the MeeWav AudioWorklet.
 *
 * `analysisHistorySamples` is context used by YIN and does not delay the
 * outgoing audio by itself. The rotating delay is the algorithmic audio
 * latency that the singer actually hears on the processed path.
 */
export const MEEWAV_PITCH_CORRECTION_PROFILE = Object.freeze({
  analysisHistorySamples: 2_048,
  analysisHopSamples: 512,
  pitchDelayMinimumSamples: 64,
  pitchDelayRangeSamples: 1_024,
});

export type MeeWavPitchCorrectionLatency = {
  sampleRate: number;
  analysisHistoryMs: number;
  maximumPitchDecisionIntervalMs: number;
  estimatedDspLatencyMs: number;
  maximumDspLatencyMs: number;
};

/**
 * Estimates DSP-only latency. It intentionally excludes microphone, OS,
 * AudioContext output and headphone latency, which cannot be inferred from
 * the algorithm or measured without a physical loopback.
 */
export function estimateMeeWavPitchCorrectionLatency(
  sampleRate: number,
): MeeWavPitchCorrectionLatency {
  const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0
    ? sampleRate
    : 48_000;
  const samplesToMs = (samples: number) => samples / safeSampleRate * 1_000;
  const averageDelaySamples = MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayMinimumSamples
    + MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayRangeSamples * 0.5;
  return {
    sampleRate: safeSampleRate,
    analysisHistoryMs: samplesToMs(MEEWAV_PITCH_CORRECTION_PROFILE.analysisHistorySamples),
    maximumPitchDecisionIntervalMs: samplesToMs(MEEWAV_PITCH_CORRECTION_PROFILE.analysisHopSamples),
    estimatedDspLatencyMs: samplesToMs(averageDelaySamples),
    maximumDspLatencyMs: samplesToMs(
      MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayMinimumSamples
        + MEEWAV_PITCH_CORRECTION_PROFILE.pitchDelayRangeSamples,
    ),
  };
}
