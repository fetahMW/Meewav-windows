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
 * Experimental monophonic pitch correction. It is an opt-in MeeWav test
 * engine and makes no equivalence claim with third-party commercial DSP.
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
    return {
      input: node,
      output: node,
      update(parameters) {
        sendParameters(node, parameters);
      },
      getHealth() {
        return {
          available: true,
          active: true,
          reason: null,
          estimatedDspLatencyMs: latency.estimatedDspLatencyMs,
          maximumDspLatencyMs: latency.maximumDspLatencyMs,
          analysisHistoryMs: latency.analysisHistoryMs,
          maximumPitchDecisionIntervalMs: latency.maximumPitchDecisionIntervalMs,
        };
      },
      dispose() {
        node.port.onmessage = null;
        node.port.close();
        try { node.disconnect(); } catch { /* Already detached. */ }
      },
    };
  },
};
