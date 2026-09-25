import { SuperpoweredGlue } from "@superpoweredsdk/web";
import { SuperpoweredVoiceCore } from "./superpoweredVoiceCore.mjs";

class MeewavSuperpoweredVoice extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.closed = false;
    this.core = null;
    this.parameters = {};
    this.port.onmessage = ({ data }) => {
      if (data.type === "dispose") {
        this.closed = true; this.core?.dispose(); this.core = null;
      } else if (data.type === "parameters") {
        this.parameters = data.value; this.core?.update(this.parameters);
      }
    };
    this.initialize(options.processorOptions).catch(() => this.port.postMessage({ type: "error", reason: "Le moteur Superpowered n’a pas pu démarrer." }));
  }
  async initialize({ wasm, licenseKey }) {
    const sdk = new SuperpoweredGlue();
    await sdk.loadFromArrayBuffer(wasm);
    if (this.closed) return;
    sdk.Initialize(licenseKey);
    this.core = new SuperpoweredVoiceCore(sdk, sampleRate);
    this.core.update(this.parameters);
    this.port.postMessage({ type: "ready" });
  }
  process(inputs, outputs) {
    if (this.closed) return false;
    const output = outputs[0];
    if (!output?.[0]) return true;
    if (this.core) {
      try { this.core.process(inputs[0]?.[0], inputs[0]?.[1], output[0], output[1]); }
      catch {
        this.core.dispose(); this.core = null;
        this.port.postMessage({ type: "error", reason: "Traitement Superpowered interrompu. Voix originale restaurée." });
      }
    }
    if (!this.core) for (let channel = 0; channel < output.length; channel++) {
      const input = inputs[0]?.[channel] ?? inputs[0]?.[0];
      if (input) output[channel].set(input); else output[channel].fill(0);
    }
    return true;
  }
}
registerProcessor("meewav-superpowered-voice", MeewavSuperpoweredVoice);
