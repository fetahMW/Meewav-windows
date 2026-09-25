import workletUrl from "./superpoweredVoice.worklet.js?worker&url";
import wasmUrl from "@superpoweredsdk/web/dist/superpowered-npm.wasm?url";
import type { PlacePitchCorrectionAdapter } from "./placeLocalAudioEngine";

const loadedContexts = new WeakMap<AudioContext, Promise<void>>();
let wasmPromise: Promise<ArrayBuffer> | undefined;

export const superpoweredVoiceAdapter: PlacePitchCorrectionAdapter = {
  id: "meewav.superpowered.voice.v1",
  handlesReverb: true,
  async create(context) {
    const licenseKey = import.meta.env.VITE_SUPERPOWERED_LICENSE_KEY
      || (import.meta.env.DEV ? "ExampleLicenseKey-WillExpire-OnNextUpdate" : "");
    if (!licenseKey) throw new Error("La licence Superpowered Web doit être configurée pour cette version.");
    let loaded = loadedContexts.get(context);
    if (!loaded) {
      loaded = context.audioWorklet.addModule(workletUrl).catch((error) => { loadedContexts.delete(context); throw error; });
      loadedContexts.set(context, loaded);
    }
    wasmPromise ??= fetch(wasmUrl).then((response) => {
      if (!response.ok) throw new Error("Chargement du moteur vocal impossible.");
      return response.arrayBuffer();
    }).catch((error) => { wasmPromise = undefined; throw error; });
    const [, wasm] = await Promise.all([loaded, wasmPromise]);
    const node = new AudioWorkletNode(context, "meewav-superpowered-voice", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers",
      processorOptions: { wasm, licenseKey },
    });
    let available = false;
    let reason: string | null = null;
    const listeners = new Set<() => void>();
    const dispose = () => { node.port.postMessage({ type: "dispose" }); node.disconnect(); node.port.close(); listeners.clear(); };
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Le moteur vocal ne répond pas.")), 15_000);
        node.onprocessorerror = () => {
          available = false; reason = "Traitement vocal interrompu.";
          clearTimeout(timer); reject(new Error(reason)); listeners.forEach((listener) => listener());
        };
        node.port.onmessage = ({ data }) => {
          if (data.type === "ready") { available = true; clearTimeout(timer); resolve(); }
          if (data.type === "error") { available = false; reason = data.reason; clearTimeout(timer); reject(new Error(data.reason)); listeners.forEach((listener) => listener()); }
        };
      });
    } catch (error) { dispose(); throw error; }
    return {
      input: node, output: node,
      update: (value) => node.port.postMessage({ type: "parameters", value }),
      getHealth: () => ({ available, active: available, reason }),
      subscribeHealth: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      dispose,
    };
  },
};
