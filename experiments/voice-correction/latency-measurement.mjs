/**
 * Estimates a positive input→output delay by normalized cross-correlation.
 * This measures timing only. It deliberately produces no vocal quality score.
 */
export function measureDelayByCorrelation(reference, observed, options = {}) {
  if (!reference || !observed || reference.length === 0 || observed.length === 0) {
    throw new TypeError("Reference and observed signals must be non-empty arrays.");
  }
  const sampleRateHz = options.sampleRateHz ?? 48_000;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new RangeError("sampleRateHz must be a positive finite number.");
  }
  const maximumPossibleLag = Math.max(0, observed.length - 1);
  const maxLagSamples = Math.min(
    maximumPossibleLag,
    Math.max(0, Math.floor(options.maxLagSamples ?? maximumPossibleLag)),
  );
  const minimumOverlap = Math.max(1, Math.floor(options.minimumOverlap ?? Math.min(reference.length, 64)));

  let bestLag = 0;
  let bestCorrelation = Number.NEGATIVE_INFINITY;
  for (let lag = 0; lag <= maxLagSamples; lag += 1) {
    const overlap = Math.min(reference.length, observed.length - lag);
    if (overlap < minimumOverlap) break;
    let cross = 0;
    let referenceEnergy = 0;
    let observedEnergy = 0;
    for (let index = 0; index < overlap; index += 1) {
      const referenceValue = Number(reference[index]);
      const observedValue = Number(observed[index + lag]);
      if (!Number.isFinite(referenceValue) || !Number.isFinite(observedValue)) {
        throw new TypeError("Signals must contain only finite samples.");
      }
      cross += referenceValue * observedValue;
      referenceEnergy += referenceValue * referenceValue;
      observedEnergy += observedValue * observedValue;
    }
    const denominator = Math.sqrt(referenceEnergy * observedEnergy);
    const correlation = denominator > 0 ? cross / denominator : 0;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  if (!Number.isFinite(bestCorrelation) || bestCorrelation <= 0) {
    throw new Error("No positive correlation peak was found.");
  }
  return {
    lagSamples: bestLag,
    delayMs: bestLag / sampleRateHz * 1_000,
    normalizedCorrelation: bestCorrelation,
    sampleRateHz,
  };
}

function median(sorted) {
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function nearestRank(sorted, percentile) {
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

export function summarizeDelayMeasurements(measurements) {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    throw new TypeError("At least one delay measurement is required.");
  }
  const values = measurements.map((measurement) => (
    typeof measurement === "number" ? measurement : measurement?.delayMs
  ));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Delay measurements must be finite non-negative milliseconds.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    medianMs: median(sorted),
    p95Ms: nearestRank(sorted, 0.95),
    worstMs: sorted[sorted.length - 1],
  };
}
