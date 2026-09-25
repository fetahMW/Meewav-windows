// Parameters mirror Android WaveNativeDuplex.cpp and WavePerformanceBus.kt.
export function androidTuneScale(key, mode) {
  const index = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(String(key).toUpperCase().replace("♯", "#"));
  return index < 0 || /chrom/i.test(mode) ? 0 : (index + (/min/i.test(mode) ? 3 : 0)) % 12 + 1;
}

export class SuperpoweredVoiceCore {
  constructor(sdk, sampleRate, maxFrames = 128) {
    this.sdk = sdk;
    this.input = new sdk.Float32Buffer(maxFrames * 2);
    this.output = new sdk.Float32Buffer(maxFrames * 2);
    this.tune = new sdk.AutomaticVocalPitchCorrection(sampleRate);
    this.tune.range = sdk.AutomaticVocalPitchCorrection.WIDE;
    this.tune.speed = sdk.AutomaticVocalPitchCorrection.EXTREME;
    this.tune.clamp = sdk.AutomaticVocalPitchCorrection.OFF;
    this.tune.frequencyOfA = 440;
    this.reverb = new sdk.Reverb(sampleRate, sampleRate);
    this.update({});
  }
  update(settings) {
    this.tuneEnabled = Boolean(settings.tuneEnabled);
    this.tune.scale = androidTuneScale(settings.tuneKey, settings.tuneScale);
    this.reverb.enabled = Boolean(settings.reverbEnabled);
    const mix = Math.max(0, Math.min(1, settings.reverbAmount || 0));
    this.reverb.mix = mix * mix;
  }
  process(left, right, outputLeft, outputRight) {
    const frames = outputLeft.length;
    const input = this.input.array;
    for (let i = 0; i < frames; i++) {
      input[i * 2] = left?.[i] || 0;
      input[i * 2 + 1] = right?.[i] ?? input[i * 2];
    }
    if (this.tuneEnabled) {
      this.tune.process(this.input.pointer, this.output.pointer, true, frames);
      // Same small dry component as Android, before reverb.
      for (let i = 0; i < frames * 2; i++) input[i] = this.output.array[i] * .98 + input[i] * .02;
    }
    if (this.reverb.enabled) this.reverb.process(this.input.pointer, this.input.pointer, frames);
    for (let i = 0; i < frames; i++) {
      outputLeft[i] = input[i * 2];
      if (outputRight) outputRight[i] = input[i * 2 + 1];
    }
  }
  dispose() {
    this.tune.destruct(); this.reverb.destruct();
    this.input.free(); this.output.free();
  }
}
