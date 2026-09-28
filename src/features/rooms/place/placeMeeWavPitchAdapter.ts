import type {
  PlacePitchCorrectionAdapter,
  PlacePitchCorrectionParameters,
} from "./placeLocalAudioEngine";
import {
  estimateMeeWavPitchCorrectionLatency,
  MEEWAV_PITCH_CORRECTION_PROFILE,
} from "./meewavPitchCorrectionProfile";

const WORKLET_URL = "/audio/meewav-pitch-correction.worklet.js";
const loadedContexts = new WeakMap<AudioContext, Promise<void>>();

function loadWorklet(context: AudioContext) {
  const existing = loadedContexts.get(context);
  if (existing) return existing;
  const pending = context.audioWorklet.addModule(WORKLET_URL).catch((error) => {
    loadedContexts.delete(context);
    throw error;
  });
  loadedContexts.set(context, pending);
  return pending;
}

function sendParameters(node: AudioWorkletNode, parameters: PlacePitchCorrectionParameters) {
  node.port.postMessage({
    type: "parameters",
    value: parameters,
  });
}

/**
 * MeeWav's monophonic YIN correction, shared with the native Android engine.
 */
export const meewavPitchCorrectionAdapter: PlacePitchCorrectionAdapter = {
  id: "meewav.pitch-correction.experimental.v1",
  async create(context) {
    if (!context.audioWorklet) throw new Error("AudioWorklet n’est pas disponible dans ce navigateur.");
    await loadWorklet(context);
    const node = new AudioWorkletNode(context, "meewav-pitch-correction", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: MEEWAV_PITCH_CORRECTION_PROFILE,
    });
    const latency = estimateMeeWavPitchCorrectionLatency(context.sampleRate);
    let available = true;
    let enabled = false;
    const listeners = new Set<() => void>();
    node.onprocessorerror = () => {
      available = false;
      listeners.forEach((listener) => listener());
    };
    return {
      input: node,
      output: node,
      update(parameters) {
        if (!available) return;
        enabled = parameters.tuneEnabled;
        sendParameters(node, parameters);
      },
      getHealth() {
        return {
          available,
          active: available && enabled,
          reason: available ? null : "L’autotune MeeWav a été interrompu. Relance la correction vocale.",
          estimatedDspLatencyMs: latency.estimatedDspLatencyMs,
          maximumDspLatencyMs: latency.maximumDspLatencyMs,
          analysisHistoryMs: latency.analysisHistoryMs,
          maximumPitchDecisionIntervalMs: latency.maximumPitchDecisionIntervalMs,
        };
      },
      subscribeHealth(listener) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      dispose() {
        node.onprocessorerror = null;
        listeners.clear();
        node.port.onmessage = null;
        node.port.close();
        try { node.disconnect(); } catch { /* Already detached. */ }
      },
    };
  },
};
