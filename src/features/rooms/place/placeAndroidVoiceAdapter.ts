import type { PlacePitchCorrectionAdapter, PlacePitchCorrectionParameters } from "./placeLocalAudioEngine";
import { estimateMeeWavPitchCorrectionLatency } from "./meewavPitchCorrectionProfile";

const contexts = new WeakMap<AudioContext, Promise<void>>();
let modulePromise: Promise<WebAssembly.Module> | undefined;
const unit = (value: number | undefined, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : fallback;

/** Exact WavePerformanceBus.waveTuneScale mapping; minor uses relative major. */
export function androidVoiceParameters(parameters: PlacePitchCorrectionParameters) {
  const index = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    .indexOf(parameters.tuneKey.toUpperCase().replace("♯", "#"));
  const scale = index < 0 || /chrom/i.test(parameters.tuneScale)
    ? 0 : (index + (/min/i.test(parameters.tuneScale) ? 3 : 0)) % 12 + 1;
  return {
    tuneEnabled: parameters.tuneEnabled, scale,
    speed: unit(parameters.tuneSpeed, 1),
    humanize: unit(parameters.tuneHumanize, 0),
    smooth: unit(parameters.tuneSmooth, 0),
    reverbEnabled: Boolean(parameters.reverbEnabled),
    reverbAmount: Math.max(0, Math.min(1, parameters.reverbAmount || 0)),
  };
}

export const androidVoiceAdapter: PlacePitchCorrectionAdapter = {
  id: "meewav.android.voice.v1",
  handlesReverb: true,
  async create(context) {
    if (context.sampleRate !== 48_000) throw new Error("Le moteur vocal Android nécessite une capture à 48 kHz. Relance le micro.");
    let loaded = contexts.get(context);
    if (!loaded) {
      loaded = context.audioWorklet.addModule("/audio/meewav-android-voice.worklet.js?v=2")
        .catch((error) => { contexts.delete(context); throw error; });
      contexts.set(context, loaded);
    }
    modulePromise ??= fetch("/audio/meewav-android-voice.wasm?v=2").then(async (response) => {
      if (!response.ok) throw new Error("Le moteur vocal n’a pas pu être chargé.");
      return WebAssembly.compile(await response.arrayBuffer());
    }).catch((error) => { modulePromise = undefined; throw error; });
    const [, module] = await Promise.all([loaded, modulePromise]);
    const node = new AudioWorkletNode(context, "meewav-android-voice", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers",
      processorOptions: { module },
    });
    let available = false;
    let active = false;
    let reason: string | null = null;
    const listeners = new Set<() => void>();
    const dispose = () => {
      node.port.postMessage({ type: "dispose" });
      node.disconnect(); node.port.close(); node.onprocessorerror = null; listeners.clear();
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Le moteur vocal ne répond pas.")), 5_000);
        const fail = (message: string) => {
          available = false; active = false; reason = message;
          clearTimeout(timeout); reject(new Error(message));
          listeners.forEach((listener) => listener());
        };
        node.onprocessorerror = () => fail("Le traitement vocal a été interrompu.");
        node.port.onmessage = ({ data }) => {
          if (data.type === "ready") { available = true; clearTimeout(timeout); resolve(); }
          else if (data.type === "error") fail(data.reason);
        };
      });
    } catch (error) { dispose(); throw error; }
    const latency = estimateMeeWavPitchCorrectionLatency(context.sampleRate);
    return {
      input: node, output: node,
      update(parameters) {
        active = available && parameters.tuneEnabled;
        node.port.postMessage({ type: "parameters", value: androidVoiceParameters(parameters) });
      },
      getHealth: () => ({ available, active, reason, ...latency }),
      subscribeHealth(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      dispose,
    };
  },
};
