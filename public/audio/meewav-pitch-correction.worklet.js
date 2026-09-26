/*
 * MeeWav monophonic pitch correction.
 * YIN estimates F0; a dual rotating-delay shifter applies a smoothed move to
 * the nearest note in the selected scale. All real-time buffers are allocated
 * in the constructor so process() performs no heap allocation.
 */

const INPUT_RING_SIZE = 2048;
const ANALYSIS_SIZE = 1024;
const DELAY_RING_SIZE = 8192;
const MAX_TAU = 400;
const DEFAULT_ANALYSIS_HOP = 512;
const DEFAULT_DELAY_RANGE = 1024;
const DEFAULT_MIN_DELAY = 64;
const TWO_PI = Math.PI * 2;
const KEY_TO_CLASS = {
  C: 0, "C#": 1, "C♯": 1, D: 2, "D#": 3, "D♯": 3,
  E: 4, F: 5, "F#": 6, "F♯": 6, G: 7, "G#": 8, "G♯": 8,
  A: 9, "A#": 10, "A♯": 10, B: 11,
};
const MAJOR = new Uint8Array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]);
const MINOR = new Uint8Array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]);
const PENTATONIC_MAJOR = new Uint8Array([1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]);
const PENTATONIC_MINOR = new Uint8Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0]);
const BLUES = new Uint8Array([1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0]);
const DORIAN = new Uint8Array([1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0]);
const MIXOLYDIAN = new Uint8Array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0]);
const CHROMATIC = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function wrap01(value) {
  if (value >= 1) return value - Math.floor(value);
  if (value < 0) return value - Math.floor(value);
  return value;
}

function readLinear(buffer, index) {
  let wrapped = index;
  while (wrapped < 0) wrapped += DELAY_RING_SIZE;
  while (wrapped >= DELAY_RING_SIZE) wrapped -= DELAY_RING_SIZE;
  const left = Math.floor(wrapped);
  const right = left + 1 === DELAY_RING_SIZE ? 0 : left + 1;
  const fraction = wrapped - left;
  return buffer[left] + (buffer[right] - buffer[left]) * fraction;
}

class MeeWavPitchCorrectionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options && options.processorOptions ? options.processorOptions : {};
    this.analysisHop = Math.round(clamp(
      Number.isFinite(processorOptions.analysisHopSamples)
        ? Number(processorOptions.analysisHopSamples)
        : DEFAULT_ANALYSIS_HOP,
      128,
      ANALYSIS_SIZE,
    ));
    this.delayRange = Math.round(clamp(
      Number.isFinite(processorOptions.pitchDelayRangeSamples)
        ? Number(processorOptions.pitchDelayRangeSamples)
        : DEFAULT_DELAY_RANGE,
      512,
      2048,
    ));
    this.minDelay = Math.round(clamp(
      Number.isFinite(processorOptions.pitchDelayMinimumSamples)
        ? Number(processorOptions.pitchDelayMinimumSamples)
        : DEFAULT_MIN_DELAY,
      32,
      256,
    ));
    this.inputRing = new Float32Array(INPUT_RING_SIZE);
    this.analysis = new Float32Array(ANALYSIS_SIZE);
    this.difference = new Float32Array(MAX_TAU + 1);
    this.delayRing = new Float32Array(DELAY_RING_SIZE);
    this.inputWrite = 0;
    this.delayWrite = 0;
    this.samplesSinceAnalysis = 0;
    this.totalSamples = 0;
    this.phase = 0.25;
    this.smoothedRatio = 1;
    this.wet = 0;
    this.voiced = false;
    this.enabled = false;
    this.key = "C";
    this.scale = "Chromatique";
    this.amount = 0.85;
    this.speed = 0.75;
    this.humanize = 0.2;
    this.smooth = 0;
    this.shift = 0;

    this.port.onmessage = (event) => {
      if (!event.data || event.data.type !== "parameters") return;
      const value = event.data.value || {};
      const enabled = value.tuneEnabled === true;
      if (enabled !== this.enabled) { this.voiced = false; this.smoothedRatio = 1; }
      this.enabled = enabled;
      this.key = typeof value.tuneKey === "string" ? value.tuneKey : "C";
      this.scale = typeof value.tuneScale === "string" ? value.tuneScale : "Chromatique";
      this.amount = clamp(Number(value.tuneAmount), 0, 1);
      this.speed = clamp(Number(value.tuneSpeed), 0, 1);
      this.humanize = clamp(Number(value.tuneHumanize), 0, 1);
      this.smooth = clamp(Number(value.tuneSmooth ?? 0), 0, 1);
      this.shift = clamp(Number(value.tuneShift ?? 0), -12, 12);
    };
  }

  allowedNotes() {
    if (this.scale === "Majeure") return MAJOR;
    if (this.scale === "Mineure") return MINOR;
    if (this.scale === "Pentatonique majeure") return PENTATONIC_MAJOR;
    if (this.scale === "Pentatonique mineure") return PENTATONIC_MINOR;
    if (this.scale === "Blues") return BLUES;
    if (this.scale === "Dorienne") return DORIAN;
    if (this.scale === "Mixolydienne") return MIXOLYDIAN;
    return CHROMATIC;
  }

  nearestScaleMidi(midi) {
    const keyClass = KEY_TO_CLASS[this.key] ?? 0;
    const allowed = this.allowedNotes();
    const center = Math.round(midi);
    let best = center;
    let distance = Infinity;
    for (let candidate = center - 7; candidate <= center + 7; candidate += 1) {
      const pitchClass = ((candidate - keyClass) % 12 + 12) % 12;
      if (!allowed[pitchClass]) continue;
      const nextDistance = Math.abs(candidate - midi);
      if (nextDistance < distance) {
        best = candidate;
        distance = nextDistance;
      }
    }
    return best;
  }

  analyzePitch() {
    let mean = 0;
    for (let index = 0; index < ANALYSIS_SIZE; index += 1) {
      const first = this.inputRing[(this.inputWrite + index * 2) & (INPUT_RING_SIZE - 1)];
      const second = this.inputRing[(this.inputWrite + index * 2 + 1) & (INPUT_RING_SIZE - 1)];
      const sample = (first + second) * 0.5;
      this.analysis[index] = sample;
      mean += sample;
    }
    mean /= ANALYSIS_SIZE;

    let energy = 0;
    for (let index = 0; index < ANALYSIS_SIZE; index += 1) {
      const centered = this.analysis[index] - mean;
      this.analysis[index] = centered;
      energy += centered * centered;
    }
    const rms = Math.sqrt(energy / ANALYSIS_SIZE);
    if (!this.enabled || rms < 0.008) {
      this.voiced = false;
      return;
    }

    const analysisRate = sampleRate * 0.5;
    const minTau = Math.max(2, Math.floor(analysisRate / 900));
    const maxTau = Math.min(MAX_TAU, Math.floor(analysisRate / 70));
    const compareLength = ANALYSIS_SIZE - maxTau;
    this.difference[0] = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
      let sum = 0;
      for (let index = 0; index < compareLength; index += 1) {
        const delta = this.analysis[index] - this.analysis[index + tau];
        sum += delta * delta;
      }
      this.difference[tau] = sum;
    }

    let running = 0;
    this.difference[0] = 1;
    for (let tau = 1; tau <= maxTau; tau += 1) {
      running += this.difference[tau];
      this.difference[tau] = running > 0 ? (this.difference[tau] * tau) / running : 1;
    }

    let tauEstimate = -1;
    let bestTau = minTau;
    let bestValue = this.difference[minTau];
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      let value = this.difference[tau];
      if (value < bestValue) {
        bestValue = value;
        bestTau = tau;
      }
      if (value < 0.13) {
        while (tau + 1 <= maxTau && this.difference[tau + 1] < value) {
          tau += 1;
          value = this.difference[tau];
        }
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate < 0 && bestValue < 0.28) tauEstimate = bestTau;
    if (tauEstimate < 0) {
      this.voiced = false;
      return;
    }

    let refinedTau = tauEstimate;
    if (tauEstimate > minTau && tauEstimate < maxTau) {
      const left = this.difference[tauEstimate - 1];
      const center = this.difference[tauEstimate];
      const right = this.difference[tauEstimate + 1];
      const denominator = left - 2 * center + right;
      if (Math.abs(denominator) > 1e-9) refinedTau += 0.5 * (left - right) / denominator;
    }
    const frequency = analysisRate / refinedTau;
    if (!Number.isFinite(frequency) || frequency < 70 || frequency > 900) {
      this.voiced = false;
      return;
    }

    const midi = 69 + 12 * Math.log2(frequency / 440);
    const target = this.nearestScaleMidi(midi);
    const distanceSemitones = target - midi;
    const deadbandSemitones = (7 + this.humanize * 28) / 100;
    const correctedDistance = Math.abs(distanceSemitones) <= deadbandSemitones
      ? 0
      : distanceSemitones * this.amount * (1 - this.humanize * 0.38);
    const desiredRatio = clamp(2 ** ((correctedDistance + this.shift) / 12), 0.5, 2);
    const response = (0.055 + this.speed * this.speed * 0.78) / (1 + this.smooth * 8);
    this.smoothedRatio += (desiredRatio - this.smoothedRatio) * response;
    this.voiced = bestValue < 0.3;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const source = input && input[0];
    const destination = output && output[0];
    if (!destination) return true;

    for (let index = 0; index < destination.length; index += 1) {
      const dry = source && Number.isFinite(source[index]) ? source[index] : 0;
      this.inputRing[this.inputWrite] = dry;
      this.inputWrite = (this.inputWrite + 1) & (INPUT_RING_SIZE - 1);
      this.delayRing[this.delayWrite] = dry;

      this.samplesSinceAnalysis += 1;
      this.totalSamples += 1;
      if (this.totalSamples >= INPUT_RING_SIZE && this.samplesSinceAnalysis >= this.analysisHop) {
        this.samplesSinceAnalysis = 0;
        this.analyzePitch();
      }

      const desiredWet = this.enabled && this.voiced && Math.abs(this.smoothedRatio - 1) > 0.0008
        // `amount` already controls the musical pitch distance above. Mixing
        // the immediate dry signal again here with the delayed shifter creates
        // a comb-filtered double voice. Once correction is engaged, use the
        // corrected branch alone and keep only this short click-free ramp.
        ? 1
        : 0;
      this.wet += (desiredWet - this.wet) * 0.0045;
      if (!desiredWet && this.wet < 0.000001) this.wet = 0;

      this.phase = wrap01(this.phase + (1 - this.smoothedRatio) / this.delayRange);
      const otherPhase = wrap01(this.phase + 0.5);
      const firstDelay = this.minDelay + this.phase * this.delayRange;
      const secondDelay = this.minDelay + otherPhase * this.delayRange;
      const first = readLinear(this.delayRing, this.delayWrite - firstDelay);
      const second = readLinear(this.delayRing, this.delayWrite - secondDelay);
      const firstWeight = 0.5 - 0.5 * Math.cos(TWO_PI * this.phase);
      const secondWeight = 1 - firstWeight;
      const shifted = first * firstWeight + second * secondWeight;
      destination[index] = dry + (shifted - dry) * this.wet;

      this.delayWrite = (this.delayWrite + 1) & (DELAY_RING_SIZE - 1);
    }
    return true;
  }
}

registerProcessor("meewav-pitch-correction", MeeWavPitchCorrectionProcessor);
