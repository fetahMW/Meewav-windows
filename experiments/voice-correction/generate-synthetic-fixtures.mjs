#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SAMPLE_RATE = 48_000;
const MAX_PCM16 = 32_767;

function fadeEnvelope(index, length, fadeSamples = 480) {
  const attack = Math.min(1, index / Math.max(1, fadeSamples));
  const release = Math.min(1, (length - 1 - index) / Math.max(1, fadeSamples));
  return Math.max(0, Math.min(attack, release));
}

function createWave(samples, sampleRate = SAMPLE_RATE) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);
  samples.forEach((sample, index) => {
    const safe = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
    buffer.writeInt16LE(Math.round(safe * MAX_PCM16), 44 + index * 2);
  });
  return buffer;
}

function silence() {
  return new Float64Array(SAMPLE_RATE);
}

function impulse() {
  const samples = new Float64Array(SAMPLE_RATE);
  samples[Math.round(SAMPLE_RATE * 0.1)] = 0.95;
  return samples;
}

function logarithmicSweep() {
  const durationSeconds = 2;
  const length = SAMPLE_RATE * durationSeconds;
  const samples = new Float64Array(length);
  const startHz = 30;
  const endHz = 18_000;
  const ratio = endHz / startHz;
  const phaseScale = 2 * Math.PI * startHz * durationSeconds / Math.log(ratio);
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const phase = phaseScale * (Math.pow(ratio, time / durationSeconds) - 1);
    samples[index] = Math.sin(phase) * 0.55 * fadeEnvelope(index, length);
  }
  return samples;
}

function noteSequence() {
  const frequencies = [261.625565, 329.627557, 391.995436];
  const samplesPerNote = SAMPLE_RATE;
  const samples = new Float64Array(samplesPerNote * frequencies.length);
  frequencies.forEach((frequency, noteIndex) => {
    for (let index = 0; index < samplesPerNote; index += 1) {
      samples[noteIndex * samplesPerNote + index] = Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE)
        * 0.5
        * fadeEnvelope(index, samplesPerNote);
    }
  });
  return samples;
}

function majorChord() {
  const frequencies = [261.625565, 329.627557, 391.995436];
  const length = SAMPLE_RATE * 2;
  const samples = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const mixed = frequencies.reduce((sum, frequency) => (
      sum + Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE)
    ), 0) / frequencies.length;
    samples[index] = mixed * 0.55 * fadeEnvelope(index, length);
  }
  return samples;
}

const fixtures = [
  ["synthetic-silence.wav", silence],
  ["synthetic-impulse.wav", impulse],
  ["synthetic-log-sweep.wav", logarithmicSweep],
  ["synthetic-note-sequence.wav", noteSequence],
  ["synthetic-major-chord.wav", majorChord],
];

const outputArgument = process.argv.find((argument) => argument.startsWith("--out-dir="));
const outputDirectory = outputArgument
  ? path.resolve(outputArgument.slice("--out-dir=".length))
  : fileURLToPath(new URL("./generated/", import.meta.url));

await mkdir(outputDirectory, { recursive: true });
const result = [];
for (const [filename, buildSamples] of fixtures) {
  const samples = buildSamples();
  const wave = createWave(samples);
  const target = path.join(outputDirectory, filename);
  await writeFile(target, wave);
  result.push({
    filename,
    sampleRateHz: SAMPLE_RATE,
    channels: 1,
    frames: samples.length,
    bytes: wave.length,
    sha256: createHash("sha256").update(wave).digest("hex"),
  });
}

process.stdout.write(`${JSON.stringify({ outputDirectory, fixtures: result }, null, 2)}\n`);
