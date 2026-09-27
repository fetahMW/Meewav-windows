import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const module = new WebAssembly.Module(readFileSync("public/audio/meewav-android-voice.wasm"));
function render(input, { tune = true, scale = 0, reverb = false, amount = .3, block = 128, pro = false, speed = 1, humanize = 0, smooth = 0 } = {}) {
  const { exports: dsp } = new WebAssembly.Instance(module);
  dsp._initialize();
  dsp.mw_init(48000);
  const buffer = new Float32Array(dsp.memory.buffer, dsp.mw_buffer(), 2048);
  const output = new Float32Array(input.length);
  for (let offset = 0; offset < input.length; offset += block * 2) {
    const frames = Math.min(block, (input.length - offset) / 2);
    buffer.set(input.subarray(offset, offset + frames * 2));
    if (pro) dsp.mw_process_pro(frames, Number(tune), scale, Number(reverb), amount, speed, humanize, smooth);
    else dsp.mw_process(frames, Number(tune), scale, Number(reverb), amount);
    output.set(buffer.subarray(0, frames * 2), offset);
  }
  return output;
}
function voice(frames = 48000) {
  const samples = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.min(1, i / 480) * (i < frames * .75 ? 1 : 0);
    const frequency = i < frames * .4 ? 450 : 226;
    samples[i * 2] = samples[i * 2 + 1] = envelope * .25 * (Math.sin(i * frequency * 2 * Math.PI / 48000) + .2 * Math.sin(i * frequency * 4 * Math.PI / 48000));
  }
  return samples;
}
test("WASM is self-contained and pins the unchanged Android DSP", () => {
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const manifest = JSON.parse(readFileSync("native/voice-dsp/source.json", "utf8"));
  const source = readFileSync("native/voice-dsp/MeeWavVoiceDsp.h", "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(source).digest("hex"), manifest.normalizedSha256);
});
test("bypass is sample-exact, stereo reverb has a tail and finite samples", () => {
  const input = voice();
  assert.ok(render(input, { tune: false }).every((sample, i) => sample === input[i]));
  const output = render(input, { tune: false, reverb: true });
  assert.ok(output.every(Number.isFinite));
  assert.ok(output.subarray(80000).some(x => Math.abs(x) > 1e-5));
  assert.ok(output.some((x, i) => i % 2 === 0 && x !== output[i + 1]));
});
test("96-frame Android and 128-frame Worklet blocks have identical DSP timing", () => {
  const input = voice();
  assert.deepEqual(render(input, { reverb: true, block: 96 }), render(input, { reverb: true, block: 128 }));
});
test("Pro at 100% speed and 0% humanisation preserves Android's exact output", () => {
  const input = voice();
  assert.deepEqual(render(input, { pro: true, reverb: true }), render(input, { reverb: true }));
});
test("retune speed and humanisation independently change real DSP output with no block-size drift", () => {
  const input = voice();
  const base = render(input, { pro: true });
  const slow = render(input, { pro: true, speed: .1 });
  const human = render(input, { pro: true, humanize: .8 });
  for (const adjusted of [slow, human]) {
    assert.ok(adjusted.every(Number.isFinite));
    assert.ok(adjusted.some((value, index) => Math.abs(value - base[index]) > .001));
  }
  const controls = { pro: true, speed: .4, humanize: .6, smooth: .6, reverb: true };
  assert.deepEqual(render(input, { ...controls, block: 96 }), render(input, { ...controls, block: 128 }));
});
test("AudioWorklet uses the real WASM, reports readiness, bypass and disposal", () => {
  let Processor;
  const messages = [];
  vm.runInNewContext(readFileSync("public/audio/meewav-android-voice.worklet.js", "utf8"), {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: m => messages.push(m) }; } },
    registerProcessor: (_name, value) => { Processor = value; },
    sampleRate: 48000, WebAssembly, Float32Array,
  });
  const processor = new Processor({ processorOptions: { module } });
  assert.equal(messages[0]?.type, "ready");
  const input = new Float32Array(128).fill(.2);
  const output = [new Float32Array(128), new Float32Array(128)];
  assert.equal(processor.process([[input]], [output]), true);
  assert.deepEqual(output[0], input);
  processor.port.onmessage({ data: { type: "dispose" } });
  assert.equal(processor.process([[input]], [output]), false);
});
test("AudioWorklet parameter messages drive Pro DSP without rebuilding the processor", () => {
  let Processor;
  vm.runInNewContext(readFileSync("public/audio/meewav-android-voice.worklet.js", "utf8"), {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: () => {} }; } },
    registerProcessor: (_name, value) => { Processor = value; }, sampleRate: 48000, WebAssembly, Float32Array,
  });
  const processor = new Processor({ processorOptions: { module } });
  const settings = { tuneEnabled: true, reverbEnabled: true, reverbAmount: .4, scale: 4, speed: .3, humanize: .6, smooth: .6 };
  processor.port.onmessage({ data: { type: "parameters", value: settings } });
  const input = voice(48128), actual = new Float32Array(input.length);
  for (let offset = 0; offset < input.length; offset += 256) {
    const mono = new Float32Array(128);
    for (let i = 0; i < 128; i++) mono[i] = input[offset + i * 2];
    const output = [new Float32Array(128), new Float32Array(128)];
    assert.equal(processor.process([[mono]], [output]), true);
    for (let i = 0; i < 128; i++) { actual[offset + i * 2] = output[0][i]; actual[offset + i * 2 + 1] = output[1][i]; }
  }
  assert.deepEqual(actual, render(input, { pro: true, scale: 4, reverb: true, amount: .4, speed: .3, humanize: .6, smooth: .6 }));
});
test("native Android C++ oracle matches the distributed WASM", { skip: !process.env.MEEWAV_DSP_REFERENCE }, () => {
  const input = voice();
  for (const [tune, scale, reverb, amount] of [[0,0,0,0], [1,0,0,0], [1,1,0,0], [1,10,0,0], [0,0,1,.6], [1,4,1,.35]]) {
    const native = spawnSync(process.env.MEEWAV_DSP_REFERENCE, [tune, scale, reverb, amount].map(String), {
      input: Buffer.from(input.buffer), maxBuffer: 1024 * 1024 * 4,
    });
    assert.equal(native.status, 0, native.stderr?.toString());
    const reference = new Float32Array(native.stdout.buffer.slice(native.stdout.byteOffset, native.stdout.byteOffset + native.stdout.byteLength));
    const actual = render(input, { tune: Boolean(tune), scale, reverb: Boolean(reverb), amount });
    assert.equal(actual.length, reference.length);
    let max = 0, sum = 0;
    for (let i = 0; i < actual.length; i++) {
      const error = Math.abs(actual[i] - reference[i]);
      max = Math.max(max, error); sum += error * error;
    }
    const rms = Math.sqrt(sum / actual.length);
    console.log(JSON.stringify({ tune, scale, reverb, amount, maxError: max, rmsError: rms }));
    assert.ok(max < .00001 && rms < .000001, "native/WASM parity exceeded rounding tolerance");
  }
});
