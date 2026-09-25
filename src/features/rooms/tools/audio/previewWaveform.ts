export const DEFAULT_WAVEFORM_BIN_COUNT = 512;
export const MAX_WAVEFORM_BIN_COUNT = 4_096;

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;

export type WaveformPeak = Readonly<{
  min: number;
  max: number;
}>;

export type DecodedWaveform = Readonly<{
  durationSeconds: number;
  channels: number;
  sampleRate: number;
  peaks: readonly WaveformPeak[];
}>;

type DecodedAudioBuffer = Pick<AudioBuffer, "duration" | "numberOfChannels" | "sampleRate" | "getChannelData">;

export type WaveformAudioContext = {
  decodeAudioData: (data: ArrayBuffer) => Promise<DecodedAudioBuffer>;
  close: () => Promise<void> | void;
};

function assertBinCount(binCount: number) {
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > MAX_WAVEFORM_BIN_COUNT) {
    throw new RangeError(`binCount must be an integer between 1 and ${MAX_WAVEFORM_BIN_COUNT}`);
  }
}

function clampPcmSample(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(-1, Math.min(1, value));
}

function isFloat32Channel(value: unknown): value is Float32Array {
  return value instanceof Float32Array;
}

/**
 * Reduces decoded PCM channels to a real min/max envelope.
 *
 * Every source sample is inspected once. Values are never generated or
 * mirrored, so quiet passages, transients and asymmetric signals remain true
 * to the imported media.
 */
export function computeWaveformPeaks(
  channels: readonly Float32Array[],
  binCount = DEFAULT_WAVEFORM_BIN_COUNT,
): WaveformPeak[] {
  assertBinCount(binCount);

  const pcmChannels = channels.filter(isFloat32Channel);
  const sampleCount = pcmChannels.reduce((maximum, channel) => Math.max(maximum, channel.length), 0);
  if (pcmChannels.length === 0 || sampleCount === 0) return [];

  const peaks: WaveformPeak[] = [];
  for (let binIndex = 0; binIndex < binCount; binIndex += 1) {
    const start = Math.floor(binIndex * sampleCount / binCount);
    const calculatedEnd = Math.floor((binIndex + 1) * sampleCount / binCount);
    const end = Math.max(start + 1, calculatedEnd);
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;

    for (const channel of pcmChannels) {
      const channelEnd = Math.min(end, channel.length);
      for (let sampleIndex = start; sampleIndex < channelEnd; sampleIndex += 1) {
        const sample = clampPcmSample(channel[sampleIndex] ?? Number.NaN);
        if (sample === null) continue;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
      }
    }

    peaks.push(Number.isFinite(minimum) && Number.isFinite(maximum)
      ? { min: minimum, max: maximum }
      : { min: 0, max: 0 });
  }

  return peaks;
}

function normalizePeak(peak: WaveformPeak | null | undefined) {
  const first = clampPcmSample(peak?.min) ?? 0;
  const second = clampPcmSample(peak?.max) ?? 0;
  return first <= second
    ? { min: first, max: second }
    : { min: second, max: first };
}

function quantizeSample(value: number) {
  return value < 0
    ? Math.round(value * -INT16_MIN)
    : Math.round(value * INT16_MAX);
}

function dequantizeSample(value: number) {
  const integer = Number.isFinite(value)
    ? Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(value)))
    : 0;
  return integer < 0 ? integer / -INT16_MIN : integer / INT16_MAX;
}

/** Serializes peaks as `[min, max, min, max, ...]` signed 16-bit values. */
export function quantizeWaveformPeaks(peaks: readonly WaveformPeak[]): number[] {
  if (peaks.length > MAX_WAVEFORM_BIN_COUNT) {
    throw new RangeError(`A waveform cannot contain more than ${MAX_WAVEFORM_BIN_COUNT} peaks`);
  }

  const values = new Array<number>(peaks.length * 2);
  for (let index = 0; index < peaks.length; index += 1) {
    const normalized = normalizePeak(peaks[index]);
    values[index * 2] = quantizeSample(normalized.min);
    values[index * 2 + 1] = quantizeSample(normalized.max);
  }
  return values;
}

/**
 * Restores an interleaved int16 envelope. Invalid payload shapes fail closed
 * to an empty waveform instead of fabricating visual data.
 */
export function dequantizeWaveformPeaks(values: ArrayLike<number>): WaveformPeak[] {
  if (!values || !Number.isInteger(values.length) || values.length % 2 !== 0) return [];
  const peakCount = values.length / 2;
  if (peakCount > MAX_WAVEFORM_BIN_COUNT) return [];

  const peaks: WaveformPeak[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const first = dequantizeSample(values[index] ?? 0);
    const second = dequantizeSample(values[index + 1] ?? 0);
    peaks.push(first <= second
      ? { min: first, max: second }
      : { min: second, max: first });
  }
  return peaks;
}

type AudioContextConstructor = new () => WaveformAudioContext;

function getBrowserAudioContextConstructor() {
  const browser = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return browser.AudioContext as AudioContextConstructor | undefined
    ?? browser.webkitAudioContext;
}

export function isAudioWaveformDecodingSupported() {
  return Boolean(getBrowserAudioContextConstructor());
}

function createBrowserAudioContext() {
  const AudioContextClass = getBrowserAudioContextConstructor();
  if (!AudioContextClass) throw new Error("Web Audio API is not available in this browser");
  return new AudioContextClass();
}

/** Decodes an audio file to PCM, then calculates its true min/max envelope. */
export async function decodeAudioWaveform(
  data: ArrayBuffer,
  binCount = DEFAULT_WAVEFORM_BIN_COUNT,
  createAudioContext: () => WaveformAudioContext = createBrowserAudioContext,
): Promise<DecodedWaveform> {
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
    throw new TypeError("A non-empty audio ArrayBuffer is required");
  }

  assertBinCount(binCount);
  const context = createAudioContext();

  try {
    const decoded = await context.decodeAudioData(data.slice(0));
    const declaredChannels = Number.isInteger(decoded.numberOfChannels)
      ? Math.max(0, decoded.numberOfChannels)
      : 0;
    const channels: Float32Array[] = [];
    for (let channelIndex = 0; channelIndex < declaredChannels; channelIndex += 1) {
      const channel = decoded.getChannelData(channelIndex);
      if (isFloat32Channel(channel)) channels.push(channel);
    }

    const sampleRate = Number.isFinite(decoded.sampleRate) && decoded.sampleRate > 0
      ? decoded.sampleRate
      : 0;
    const sampleCount = channels.reduce((maximum, channel) => Math.max(maximum, channel.length), 0);
    const duration = Number.isFinite(decoded.duration) && decoded.duration >= 0
      ? decoded.duration
      : sampleRate > 0 ? sampleCount / sampleRate : 0;

    return {
      durationSeconds: duration,
      channels: channels.length,
      sampleRate,
      peaks: computeWaveformPeaks(channels, binCount),
    };
  } finally {
    try {
      await context.close();
    } catch {
      // Closing the short-lived decoding context must not hide decode results.
    }
  }
}
