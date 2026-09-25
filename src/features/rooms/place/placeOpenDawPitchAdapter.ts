import { createOpenDawVoiceCorrectionEngine } from "../voice-correction/openDawVoiceCorrectionEngine";
import type { VoiceCorrectionEngineDiagnostics } from "../voice-correction/VoiceCorrectionEngine";
import {
  OPENDAW_VOICE_CORRECTION_KEYS,
  OPENDAW_VOICE_CORRECTION_SCALES,
  type VoiceCorrectionKeyIndex,
  type VoiceCorrectionScaleIndex,
  type VoiceCorrectionSettings,
} from "../voice-correction/voiceCorrection.types";
import type {
  PlacePitchCorrectionAdapter,
  PlacePitchCorrectionParameters,
} from "./placeLocalAudioEngine";

export function isPlaceOpenDawProcessedRouteAvailable(
  diagnostics: Pick<
    VoiceCorrectionEngineDiagnostics,
    "engineReady" | "workletReady" | "status" | "outputTrackState" | "fallbackActive"
  >,
) {
  return diagnostics.engineReady
    && diagnostics.workletReady
    && diagnostics.status !== "error"
    && diagnostics.outputTrackState === "live"
    && !diagnostics.fallbackActive;
}

function keyIndex(value: string): VoiceCorrectionKeyIndex {
  const index = OPENDAW_VOICE_CORRECTION_KEYS.indexOf(
    value as (typeof OPENDAW_VOICE_CORRECTION_KEYS)[number],
  );
  return (index < 0 ? 0 : index) as VoiceCorrectionKeyIndex;
}

function scaleIndex(value: PlacePitchCorrectionParameters["tuneScale"]): VoiceCorrectionScaleIndex {
  const index = OPENDAW_VOICE_CORRECTION_SCALES.indexOf(value);
  return (index < 0 ? 0 : index) as VoiceCorrectionScaleIndex;
}

export function placeSettingsToOpenDaw(
  parameters: PlacePitchCorrectionParameters,
): VoiceCorrectionSettings {
  return {
    enabled: parameters.tuneEnabled,
    key: keyIndex(parameters.tuneKey),
    scale: scaleIndex(parameters.tuneScale),
    amount: parameters.tuneAmount,
    retune: parameters.tuneSpeed,
    // The public Humanisation control is openDAW's `smooth` parameter.
    smooth: parameters.tuneHumanize,
    shift: parameters.tuneShift,
  };
}

/**
 * Bridges the existing Room AudioNode insertion point to openDAW's
 * MediaStream-based monitoring output. The openDAW engine owns neither the
 * Room AudioContext nor the original microphone track.
 */
export const openDawPitchCorrectionAdapter: PlacePitchCorrectionAdapter = {
  id: "opendaw.voice-correction.0.0.11",
  async create(context) {
    const input = context.createGain();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const output = context.createGain();
    input.channelCount = 1;
    input.channelCountMode = "explicit";
    input.channelInterpretation = "discrete";
    dryGain.channelCount = 1;
    wetGain.channelCount = 1;
    output.channelCount = 1;
    const inputDestination = context.createMediaStreamDestination();
    input.connect(inputDestination);
    input.connect(dryGain);
    dryGain.connect(output);
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    const engine = createOpenDawVoiceCorrectionEngine();
    try {
      await engine.initialize({ audioContext: context });
      await engine.connectInput(inputDestination.stream);
      const processedStream = engine.getProcessedStream();
      const processedTrack = processedStream?.getAudioTracks()[0];
      if (!processedStream || !processedTrack || processedTrack.readyState !== "live") {
        throw new Error("Le moteur openDAW n'a produit aucune piste audio exploitable.");
      }
      const processedSource = context.createMediaStreamSource(processedStream);
      processedSource.connect(wetGain);
      wetGain.connect(output);
      let disposed = false;
      let correctionRequested = false;
      let latestDiagnostics = engine.getDiagnostics();
      const healthListeners = new Set<() => void>();
      const processedRouteAvailable = () => isPlaceOpenDawProcessedRouteAvailable(latestDiagnostics);
      const applySafeRoute = () => {
        const corrected = correctionRequested && processedRouteAvailable();
        dryGain.gain.cancelScheduledValues(context.currentTime);
        wetGain.gain.cancelScheduledValues(context.currentTime);
        // An exact switch avoids dry/wet doubling and guarantees that a DSP or
        // output-track failure returns the Room graph to the original signal.
        dryGain.gain.setValueAtTime(corrected ? 0 : 1, context.currentTime);
        wetGain.gain.setValueAtTime(corrected ? 1 : 0, context.currentTime);
      };
      const unsubscribeDiagnostics = engine.subscribeDiagnostics((diagnostics) => {
        latestDiagnostics = diagnostics;
        applySafeRoute();
        healthListeners.forEach((listener) => listener());
      });

      return {
        input,
        output,
        update(parameters) {
          if (disposed) return;
          correctionRequested = parameters.tuneEnabled;
          const settings = placeSettingsToOpenDaw(parameters);
          applySafeRoute();
          void Promise.all([
            engine.updateSettings(settings),
            engine.setBypass(!parameters.tuneEnabled),
          ]).catch(() => {
            correctionRequested = false;
            applySafeRoute();
            healthListeners.forEach((listener) => listener());
          });
        },
        getHealth() {
          const available = processedRouteAvailable();
          return {
            available,
            active: available && correctionRequested && latestDiagnostics.status === "processing",
            reason: available
              ? null
              : latestDiagnostics.error ?? latestDiagnostics.fallbackReason ?? "Le moteur openDAW est indisponible.",
          };
        },
        subscribeHealth(listener) {
          healthListeners.add(listener);
          listener();
          return () => healthListeners.delete(listener);
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          unsubscribeDiagnostics();
          healthListeners.clear();
          try { input.disconnect(); } catch { /* Already detached. */ }
          try { dryGain.disconnect(); } catch { /* Already detached. */ }
          try { wetGain.disconnect(); } catch { /* Already detached. */ }
          try { processedSource.disconnect(); } catch { /* Already detached. */ }
          try { output.disconnect(); } catch { /* Already detached. */ }
          inputDestination.stream.getTracks().forEach((track) => track.stop());
          await engine.dispose().catch(() => undefined);
        },
      };
    } catch (error) {
      try { input.disconnect(); } catch { /* Already detached. */ }
      try { dryGain.disconnect(); } catch { /* Already detached. */ }
      try { wetGain.disconnect(); } catch { /* Already detached. */ }
      try { output.disconnect(); } catch { /* Already detached. */ }
      inputDestination.stream.getTracks().forEach((track) => track.stop());
      await engine.dispose().catch(() => undefined);
      throw error;
    }
  },
};
