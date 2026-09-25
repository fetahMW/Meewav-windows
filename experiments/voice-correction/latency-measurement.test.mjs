import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  measureDelayByCorrelation,
  summarizeDelayMeasurements,
} from "./latency-measurement.mjs";

describe("measureDelayByCorrelation", () => {
  it("recovers a known sample delay despite a gain change", () => {
    const reference = Float64Array.from({ length: 256 }, (_, index) => (
      Math.sin(index * 0.31) * 0.6 + Math.sin(index * 0.073) * 0.3
    ));
    const delay = 137;
    const observed = new Float64Array(reference.length + delay + 32);
    reference.forEach((sample, index) => { observed[index + delay] = sample * 0.42; });

    const measurement = measureDelayByCorrelation(reference, observed, {
      sampleRateHz: 48_000,
      maxLagSamples: 256,
      minimumOverlap: 128,
    });

    assert.equal(measurement.lagSamples, delay);
    assert.ok(Math.abs(measurement.delayMs - 2.854166) < 0.00001);
    assert.ok(Math.abs(measurement.normalizedCorrelation - 1) < 0.000001);
  });

  it("rejects silent signals instead of inventing a delay", () => {
    assert.throws(() => measureDelayByCorrelation(new Float32Array(64), new Float32Array(128)), /correlation peak/u);
  });
});

describe("summarizeDelayMeasurements", () => {
  it("reports median, nearest-rank p95 and worst case", () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    assert.deepEqual(summarizeDelayMeasurements(values), {
      count: 20,
      medianMs: 10.5,
      p95Ms: 19,
      worstMs: 20,
    });
  });

  it("accepts measurement objects and rejects invalid values", () => {
    assert.deepEqual(summarizeDelayMeasurements([{ delayMs: 4 }, { delayMs: 8 }, { delayMs: 6 }]), { count: 3, medianMs: 6, p95Ms: 8, worstMs: 8 });
    assert.throws(() => summarizeDelayMeasurements([4, Number.NaN]), /finite non-negative/u);
    assert.throws(() => summarizeDelayMeasurements([]), /At least one/u);
  });
});
