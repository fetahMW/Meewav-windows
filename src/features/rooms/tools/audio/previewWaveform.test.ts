import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WAVEFORM_BIN_COUNT,
  MAX_WAVEFORM_BIN_COUNT,
  computeWaveformPeaks,
  decodeAudioWaveform,
  dequantizeWaveformPeaks,
  quantizeWaveformPeaks,
  type WaveformAudioContext,
  type WaveformPeak,
} from "./previewWaveform";

describe("computeWaveformPeaks", () => {
  it("keeps the real minimum and maximum of every mono time slice", () => {
    const peaks = computeWaveformPeaks([
      Float32Array.of(-0.5, 0.25, -1, 0.75),
    ], 2);

    expect(peaks).toEqual([
      { min: -0.5, max: 0.25 },
      { min: -1, max: 0.75 },
    ]);
  });

  it("combines all channels into one truthful envelope", () => {
    const peaks = computeWaveformPeaks([
      Float32Array.of(-0.1, 0.3, 0.2, 0.4),
      Float32Array.of(-0.6, 0.2, -0.3, 0.8),
    ], 2);

    expect(peaks[0].min).toBeCloseTo(-0.6);
    expect(peaks[0].max).toBeCloseTo(0.3);
    expect(peaks[1].min).toBeCloseTo(-0.3);
    expect(peaks[1].max).toBeCloseTo(0.8);
  });

  it("does not mirror an asymmetric signal around zero", () => {
    expect(computeWaveformPeaks([Float32Array.of(0.2, 0.4)], 1)[0]).toEqual({
      min: expect.closeTo(0.2),
      max: expect.closeTo(0.4),
    });
  });

  it("represents PCM silence with zero peaks", () => {
    expect(computeWaveformPeaks([new Float32Array(12)], 3)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ]);
  });

  it("ignores non-finite samples and clamps corrupt amplitudes to PCM bounds", () => {
    const channel = Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.4, -1.4, 0.25);
    expect(computeWaveformPeaks([channel], 2)).toEqual([
      { min: 0, max: 0 },
      { min: -1, max: 1 },
    ]);
  });

  it("supports empty and unequal channel buffers without inventing samples", () => {
    const peaks = computeWaveformPeaks([
      new Float32Array(),
      Float32Array.of(-0.5, 0.5),
    ], 2);
    expect(peaks).toEqual([
      { min: -0.5, max: -0.5 },
      { min: 0.5, max: 0.5 },
    ]);
    expect(computeWaveformPeaks([], 64)).toEqual([]);
  });

  it("returns the requested resolution even for a very short valid buffer", () => {
    expect(computeWaveformPeaks([Float32Array.of(-0.25, 0.75)], 4)).toEqual([
      { min: -0.25, max: -0.25 },
      { min: -0.25, max: -0.25 },
      { min: 0.75, max: 0.75 },
      { min: 0.75, max: 0.75 },
    ]);
  });

  it("enforces a bounded, integral output resolution", () => {
    const channel = Float32Array.of(0);
    for (const binCount of [0, -1, 1.5, Number.NaN, MAX_WAVEFORM_BIN_COUNT + 1]) {
      expect(() => computeWaveformPeaks([channel], binCount)).toThrow(RangeError);
    }
    expect(DEFAULT_WAVEFORM_BIN_COUNT).toBeLessThanOrEqual(MAX_WAVEFORM_BIN_COUNT);
  });
});

describe("preview waveform int16 storage", () => {
  it("quantizes min/max pairs into one compact interleaved Int16Array", () => {
    const quantized = quantizeWaveformPeaks([
      { min: -1, max: 1 },
      { min: -0.5, max: 0.5 },
    ]);

    expect(quantized).toEqual([-32_768, 32_767, -16_384, 16_384]);
  });

  it("round-trips normalized amplitudes within int16 precision", () => {
    const source: WaveformPeak[] = [
      { min: -0.87124, max: 0.14286 },
      { min: -0.002, max: 0.993 },
    ];
    const restored = dequantizeWaveformPeaks(quantizeWaveformPeaks(source));

    restored.forEach((peak, index) => {
      expect(peak.min).toBeCloseTo(source[index].min, 4);
      expect(peak.max).toBeCloseTo(source[index].max, 4);
    });
  });

  it("sanitizes, clamps and orders invalid peak values before persistence", () => {
    const corrupt = [
      { min: 2, max: -2 },
      { min: Number.NaN, max: Number.POSITIVE_INFINITY },
    ] as WaveformPeak[];
    expect(quantizeWaveformPeaks(corrupt)).toEqual([
      -32_768, 32_767,
      0, 0,
    ]);
  });

  it("canonicalizes sparse arrays instead of leaving holes in persisted JSON", () => {
    const sparse = new Array<WaveformPeak>(2);
    sparse[1] = { min: -0.25, max: 0.5 };
    expect(quantizeWaveformPeaks(sparse)).toEqual([0, 0, -8_192, 16_384]);
  });

  it("fails closed on malformed storage shapes and sanitizes stored integers", () => {
    expect(dequantizeWaveformPeaks([1, 2, 3])).toEqual([]);
    expect(dequantizeWaveformPeaks(new Array((MAX_WAVEFORM_BIN_COUNT + 1) * 2).fill(0))).toEqual([]);
    expect(dequantizeWaveformPeaks([40_000, -40_000, Number.NaN, Number.POSITIVE_INFINITY])).toEqual([
      { min: -1, max: 1 },
      { min: 0, max: 0 },
    ]);
  });

  it("rejects oversized peak arrays before allocating the compact payload", () => {
    const peaks = new Array(MAX_WAVEFORM_BIN_COUNT + 1).fill({ min: 0, max: 0 });
    expect(() => quantizeWaveformPeaks(peaks)).toThrow(RangeError);
  });
});

describe("decodeAudioWaveform", () => {
  it("decodes a private copy, calculates peaks and returns real audio metadata", async () => {
    const channels = [
      Float32Array.of(-0.5, 0.25, -0.75, 0.5),
      Float32Array.of(-0.25, 0.75, -0.2, 1),
    ];
    const decodeAudioData = vi.fn().mockResolvedValue({
      duration: 2.5,
      numberOfChannels: 2,
      sampleRate: 48_000,
      getChannelData: (index: number) => channels[index],
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const context: WaveformAudioContext = { decodeAudioData, close };
    const source = Uint8Array.of(1, 2, 3, 4).buffer;

    const decoded = await decodeAudioWaveform(source, 2, () => context);

    expect(decoded).toEqual({
      durationSeconds: 2.5,
      channels: 2,
      sampleRate: 48_000,
      peaks: [
        { min: -0.5, max: 0.75 },
        { min: -0.75, max: 1 },
      ],
    });
    const decodedCopy = decodeAudioData.mock.calls[0][0] as ArrayBuffer;
    expect(decodedCopy).not.toBe(source);
    expect([...new Uint8Array(decodedCopy)]).toEqual([1, 2, 3, 4]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("derives safe metadata when a decoder reports an invalid duration", async () => {
    const context: WaveformAudioContext = {
      decodeAudioData: vi.fn().mockResolvedValue({
        duration: Number.NaN,
        numberOfChannels: 1,
        sampleRate: 4,
        getChannelData: () => new Float32Array(8),
      }),
      close: vi.fn(),
    };

    await expect(decodeAudioWaveform(Uint8Array.of(1).buffer, 2, () => context))
      .resolves.toMatchObject({ durationSeconds: 2, channels: 1, sampleRate: 4 });
  });

  it("returns no peaks when decoded PCM has no samples instead of using a visual fallback", async () => {
    const context: WaveformAudioContext = {
      decodeAudioData: vi.fn().mockResolvedValue({
        duration: 0,
        numberOfChannels: 1,
        sampleRate: 44_100,
        getChannelData: () => new Float32Array(),
      }),
      close: vi.fn(),
    };

    await expect(decodeAudioWaveform(Uint8Array.of(1).buffer, 128, () => context))
      .resolves.toMatchObject({ durationSeconds: 0, peaks: [] });
  });

  it("always closes the decoding context when PCM decoding fails", async () => {
    const failure = new Error("unsupported codec");
    const close = vi.fn().mockResolvedValue(undefined);
    const context: WaveformAudioContext = {
      decodeAudioData: vi.fn().mockRejectedValue(failure),
      close,
    };

    await expect(decodeAudioWaveform(Uint8Array.of(1).buffer, DEFAULT_WAVEFORM_BIN_COUNT, () => context))
      .rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects empty media before creating an AudioContext", async () => {
    const createAudioContext = vi.fn();
    await expect(decodeAudioWaveform(new ArrayBuffer(0), DEFAULT_WAVEFORM_BIN_COUNT, createAudioContext))
      .rejects.toThrow(TypeError);
    expect(createAudioContext).not.toHaveBeenCalled();
  });
});
