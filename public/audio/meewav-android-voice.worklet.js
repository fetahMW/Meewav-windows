// Control/copy boundary only. Pitch and reverb run in the unchanged Android C++.
class MeeWavAndroidVoice extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.closed = false;
    this.settings = { tuneEnabled: false, reverbEnabled: false, reverbAmount: 0, scale: 0, speed: 1, humanize: 0, smooth: 0 };
    try {
      this.dsp = new WebAssembly.Instance(options.processorOptions.module, {
        wasi_snapshot_preview1: { proc_exit: () => { throw new Error("DSP stopped"); } },
      }).exports;
      this.dsp._initialize?.();
      if (typeof this.dsp.mw_process_pro !== 'function') throw new Error('Incompatible DSP');
      this.dsp.mw_init(sampleRate);
      this.buffer = new Float32Array(this.dsp.memory.buffer, this.dsp.mw_buffer(), 2048);
      this.port.postMessage({ type: "ready" });
    } catch {
      this.failed = true;
      this.port.postMessage({ type: "error", reason: "Le moteur vocal Android n’a pas pu démarrer." });
    }
    this.port.onmessage = ({ data }) => {
      if (data.type === "dispose") this.closed = true;
      if (data.type === "parameters") this.settings = data.value;
    };
  }
  process(inputs, outputs) {
    if (this.closed) return false;
    const output = outputs[0];
    if (!output?.[0]) return true;
    const frames = output[0].length;
    const input = inputs[0]?.[0];
    if (!this.failed) {
      try {
        for (let i = 0; i < frames; i++) {
          const sample = input?.[i] ?? 0;
          this.buffer[i * 2] = this.buffer[i * 2 + 1] = sample;
        }
        const s = this.settings;
        this.dsp.mw_process_pro(frames, s.tuneEnabled ? 1 : 0, s.scale, s.reverbEnabled ? 1 : 0, s.reverbAmount,
          s.speed ?? 1, s.humanize ?? 0, s.smooth ?? 0);
        for (let i = 0; i < frames; i++) {
          output[0][i] = this.buffer[i * 2];
          if (output[1]) output[1][i] = this.buffer[i * 2 + 1];
        }
        return true;
      } catch {
        this.failed = true;
        this.port.postMessage({ type: "error", reason: "Le moteur vocal a été interrompu. Voix originale restaurée." });
      }
    }
    for (const channel of output) {
      if (input) channel.set(input); else channel.fill(0);
    }
    return true;
  }
}
registerProcessor("meewav-android-voice", MeeWavAndroidVoice);
