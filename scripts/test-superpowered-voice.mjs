import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SuperpoweredGlue } from "@superpoweredsdk/web";
import { androidTuneScale, SuperpoweredVoiceCore } from "../src/features/rooms/place/superpoweredVoiceCore.mjs";

globalThis.self = globalThis;
const sdk = new SuperpoweredGlue();
await sdk.loadFromArrayBuffer(await readFile(new URL("../node_modules/@superpoweredsdk/web/dist/superpowered-npm.wasm", import.meta.url)));
sdk.Initialize("ExampleLicenseKey-WillExpire-OnNextUpdate");

test("Android scale contract maps minor to relative major", () => {
  assert.equal(androidTuneScale("A", "Mineure"), sdk.AutomaticVocalPitchCorrection.CMAJOR);
  assert.equal(androidTuneScale("C", "Majeure"), sdk.AutomaticVocalPitchCorrection.CMAJOR);
  assert.equal(androidTuneScale("D", "Chromatique"), sdk.AutomaticVocalPitchCorrection.CHROMATIC);
});
test("bypass preserves mono input on both output channels", () => {
  const core = new SuperpoweredVoiceCore(sdk, 48000);
  const input = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i / 10) * .2);
  const left = new Float32Array(128), right = new Float32Array(128);
  core.process(input, undefined, left, right);
  assert.deepEqual(left, input); assert.deepEqual(right, input);
  core.dispose();
});
test("real WASM pitch correction brings 450 Hz towards 440 Hz", () => {
  const core = new SuperpoweredVoiceCore(sdk, 48000);
  core.update({ tuneEnabled: true, tuneKey: "A", tuneScale: "Chromatique" });
  const input = new Float32Array(128), left = new Float32Array(128), right = new Float32Array(128);
  const rendered = new Float32Array(48000 * 2);
  for (let frame = 0; frame + 128 <= rendered.length; frame += 128) {
    for (let i = 0; i < 128; i++) input[i] = .2 * Math.sin(2 * Math.PI * 450 * (frame + i) / 48000);
    core.process(input, undefined, left, right); rendered.set(left, frame);
  }
  let bestLag = 0, bestError = Infinity;
  for (let lag = 100; lag <= 120; lag++) {
    let error = 0;
    for (let i = 48000; i < 72000; i++) error += (rendered[i] - rendered[i + lag]) ** 2;
    if (error < bestError) { bestError = error; bestLag = lag; }
  }
  const frequency = 48000 / bestLag;
  assert.ok(Math.abs(frequency - 440) < 3, `Measured ${frequency} Hz`);
  assert.ok(rendered.every(Number.isFinite));
  core.dispose();
});
test("real WASM reverb produces a tail and bypass removes it", () => {
  const core = new SuperpoweredVoiceCore(sdk, 48000);
  core.update({ reverbEnabled: true, reverbAmount: .7 });
  assert.ok(Math.abs(core.reverb.mix - .49) < .001);
  const input = new Float32Array(128), left = new Float32Array(128), right = new Float32Array(128);
  let tailEnergy = 0;
  for (let block = 0; block < 250; block++) {
    input.fill(0); if (block === 0) input[0] = .5;
    core.process(input, undefined, left, right);
    if (block > 10) for (const sample of left) tailEnergy += sample * sample;
  }
  assert.ok(tailEnergy > 1e-7, `Tail energy ${tailEnergy}`);
  core.update({ reverbEnabled: false }); core.process(input, undefined, left, right);
  assert.ok(left.every((sample) => sample === 0));
  core.dispose();
});
