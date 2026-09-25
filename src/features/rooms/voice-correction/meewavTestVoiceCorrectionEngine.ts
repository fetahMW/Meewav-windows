import type {
  PlacePitchCorrectionAdapter,
  PlacePitchCorrectionParameters,
  PlacePitchCorrectionProcessor,
} from "../place/placeLocalAudioEngine";
import { VoiceCorrectionHeadphoneOutput } from "./voiceCorrectionHeadphoneOutput";
import { meewavPitchCorrectionAdapter } from "../place/placeMeeWavPitchAdapter";
import { estimateMeeWavPitchCorrectionLatency } from "../place/meewavPitchCorrectionProfile";
import type {
  VoiceCorrectionDiagnosticsListener,
  VoiceCorrectionEngine,
  VoiceCorrectionEngineDiagnostics,
  VoiceCorrectionInitializeOptions,
  VoiceCorrectionMeterSnapshot,
} from "./VoiceCorrectionEngine";
import { normalizeVoiceCorrectionSettings } from "./voiceCorrection.presets";
import {
  voiceCorrectionKeyLabel,
  voiceCorrectionScaleLabel,
  type VoiceCorrectionSettings,
} from "./voiceCorrection.types";

const WORKLET_PATH = "/audio/meewav-pitch-correction.worklet.js";

function rms(analyser: AnalyserNode | null) {
  if (!analyser) return 0;
  const values = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(values);
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.min(1, Math.sqrt(sum / values.length));
}

const INITIAL_SETTINGS: VoiceCorrectionSettings = {
  enabled: true,
  key: 0,
  scale: 0,
  amount: 1,
  retune: 0.5,
  shift: 0,
  smooth: 0.6,
};

const INITIAL_DIAGNOSTICS: VoiceCorrectionEngineDiagnostics = {
  status: "idle",
  engineReady: false,
  workletReady: false,
  crossOriginIsolated: typeof window !== "undefined" && window.crossOriginIsolated,
  sampleRate: null,
  baseLatencyMs: null,
  outputLatencyMs: null,
  estimatedDspLatencyMs: null,
  cpuLoadPercent: null,
  inputTrackState: null,
  outputTrackState: null,
  bypass: true,
  monitoring: false,
  processedSignalState: "unverified",
  monitoringState: "off",
  localOutputProof: "not-run",
  fallbackActive: false,
  fallbackReason: null,
  error: null,
  resources: [{
    path: WORKLET_PATH,
    mediaType: "text/javascript",
    status: "pending",
    httpStatus: null,
    error: null,
  }],
};

export function meewavTestPitchParameters(
  settings: VoiceCorrectionSettings,
  bypass: boolean,
): PlacePitchCorrectionParameters {
  const normalized = normalizeVoiceCorrectionSettings(settings);
  return {
    tuneEnabled: normalized.enabled && !bypass,
    tuneKey: voiceCorrectionKeyLabel(normalized.key),
    tuneScale: voiceCorrectionScaleLabel(normalized.scale),
    tuneAmount: normalized.amount,
    tuneSpeed: normalized.retune,
    tuneHumanize: normalized.smooth,
    tuneSmooth: normalized.smooth,
    tuneShift: normalized.shift,
  };
}

class MeeWavTestVoiceCorrectionEngine implements VoiceCorrectionEngine {
  private diagnostics: VoiceCorrectionEngineDiagnostics = structuredClone(INITIAL_DIAGNOSTICS);
  private readonly listeners = new Set<VoiceCorrectionDiagnosticsListener>();
  private context: AudioContext | null = null;
  private ownsContext = false;
  private inputStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private outputBus: GainNode | null = null;
  private output: VoiceCorrectionHeadphoneOutput | null = null;
  private processor: PlacePitchCorrectionProcessor | null = null;
  private processorHealthUnsubscribe: (() => void) | null = null;
  private processorErrorNode: AudioWorkletNode | null = null;
  private settings = { ...INITIAL_SETTINGS };
  private bypass = true;
  private monitoring = false;
  private runtimeFailed = false;
  private signalTimer: number | null = null;
  private processedSilenceSince: number | null = null;
  private outputEndedListener: (() => void) | null = null;
  private disposed = false;
  private readonly adapter: PlacePitchCorrectionAdapter;
  private readonly playMonitoringProofTone: boolean;

  constructor(adapter: PlacePitchCorrectionAdapter, playMonitoringProofTone: boolean) {
    this.adapter = adapter;
    this.playMonitoringProofTone = playMonitoringProofTone;
  }

  async initialize(options: VoiceCorrectionInitializeOptions = {}) {
    this.assertUsable();
    if (this.diagnostics.engineReady) return;
    const context = options.audioContext ?? new AudioContext({ latencyHint: "interactive", sampleRate: 48_000 });
    this.ownsContext = !options.audioContext;
    this.context = context;
    if (!context.audioWorklet) {
      const message = "AudioWorklet n’est pas disponible dans ce navigateur.";
      this.patchDiagnostics({ status: "error", error: message, fallbackActive: true, fallbackReason: message });
      throw new Error(message);
    }
    if (context.state === "suspended") await context.resume();
    const pitchLatency = estimateMeeWavPitchCorrectionLatency(context.sampleRate);
    this.patchDiagnostics({
      status: "ready",
      engineReady: true,
      sampleRate: context.sampleRate,
      baseLatencyMs: Number.isFinite(context.baseLatency) ? context.baseLatency * 1_000 : null,
      outputLatencyMs: "outputLatency" in context && Number.isFinite(context.outputLatency)
        ? context.outputLatency * 1_000
        : null,
      estimatedDspLatencyMs: pitchLatency.estimatedDspLatencyMs,
      error: null,
      fallbackActive: false,
      fallbackReason: null,
    });
  }

  async connectInput(stream: MediaStream) {
    this.assertReady();
    const context = this.context!;
    const restoreMonitoring = this.monitoring;
    await this.disposeGraph();
    const inputTrack = stream.getAudioTracks().find((track) => track.readyState === "live");
    if (!inputTrack) throw new Error("Le microphone ne contient aucune piste audio active.");
    try {
      const inputSource = context.createMediaStreamSource(stream);
      const inputAnalyser = context.createAnalyser();
      const dryGain = context.createGain();
      const wetGain = context.createGain();
      const outputBus = context.createGain();
      for (const node of [dryGain, wetGain, outputBus]) {
        node.channelCount = 1;
        node.channelCountMode = "explicit";
        node.channelInterpretation = "discrete";
      }
      inputAnalyser.fftSize = 512;
      const output = new VoiceCorrectionHeadphoneOutput(context, outputBus);
      this.inputSource = inputSource;
      this.inputAnalyser = inputAnalyser;
      this.dryGain = dryGain;
      this.wetGain = wetGain;
      this.outputBus = outputBus;
      this.output = output;
      this.inputStream = stream;
      this.runtimeFailed = false;
      inputSource.connect(inputAnalyser);
      inputAnalyser.connect(dryGain);
      dryGain.connect(outputBus);
      wetGain.connect(outputBus);
      const outputTrack = output.outputTrack;
      this.outputEndedListener = () => {
        // The MediaStream branch and the hardware branch share the same final
        // bus, but the hardware branch can outlive a stopped destination
        // track. Stop it explicitly so diagnostics never claim "off" while
        // sound is still reaching the headphones.
        output.disableMonitoring();
        this.monitoring = false;
        this.patchDiagnostics({ monitoring: false, monitoringState: "interrupted" });
        this.activateFallback(
          "output_ended",
          "La sortie MeeWav s’est arrêtée. Réactive le retour casque pour continuer.",
        );
      };
      outputTrack?.addEventListener("ended", this.outputEndedListener, { once: true });
      inputTrack.addEventListener("ended", this.handleInputEnded, { once: true });

      let processorFailure: unknown = null;
      try {
        const processor = await this.adapter.create(context);
        this.processor = processor;
        inputAnalyser.connect(processor.input);
        processor.output.connect(wetGain);
        processor.update(meewavTestPitchParameters(this.settings, this.bypass));
        this.processorHealthUnsubscribe = processor.subscribeHealth?.(() => {
          const health = processor.getHealth?.();
          if (health && (!health.available || !health.active)) {
            this.activateFallback(
              "worklet_failed",
              health.reason ?? "Le processeur MeeWav s’est arrêté.",
            );
          }
        }) ?? null;
        if (typeof AudioWorkletNode !== "undefined" && processor.output instanceof AudioWorkletNode) {
          this.processorErrorNode = processor.output;
          this.processorErrorNode.addEventListener("processorerror", this.handleProcessorError, { once: true });
        }
      } catch (error) {
        processorFailure = error;
        this.runtimeFailed = true;
        this.processorHealthUnsubscribe?.();
        this.processorHealthUnsubscribe = null;
        this.processorErrorNode?.removeEventListener("processorerror", this.handleProcessorError);
        this.processorErrorNode = null;
        if (this.processor) {
          try { inputAnalyser.disconnect(this.processor.input); } catch { /* Not connected. */ }
          try { this.processor.output.disconnect(); } catch { /* Not connected. */ }
          await Promise.resolve(this.processor.dispose()).catch(() => undefined);
          this.processor = null;
        }
      }

      this.applyRoute();
      if (restoreMonitoring) await output.enableMonitoring();
      this.startSignalDiagnostics();
      if (processorFailure !== null) {
        const message = processorFailure instanceof Error ? processorFailure.message : String(processorFailure);
        this.patchDiagnostics({
          status: "fallback",
          workletReady: false,
          inputTrackState: inputTrack.readyState,
          outputTrackState: outputTrack?.readyState ?? null,
          bypass: this.bypass,
          monitoring: restoreMonitoring && output.getSnapshot().monitoring,
          monitoringState: restoreMonitoring ? "fallback" : "off",
          processedSignalState: "silent",
          fallbackActive: true,
          fallbackReason: "initialization_failed",
          error: `Le moteur MeeWav est indisponible (${message}). La voix originale reste active.`,
          resources: [{
            path: WORKLET_PATH,
            mediaType: "text/javascript",
            status: "invalid",
            httpStatus: null,
            error: message,
          }],
        });
        return;
      }
      this.patchDiagnostics({
        status: this.bypass || !this.settings.enabled ? "bypassed" : "processing",
        workletReady: true,
        inputTrackState: inputTrack.readyState,
        outputTrackState: outputTrack?.readyState ?? null,
        bypass: this.bypass,
        monitoring: restoreMonitoring && output.getSnapshot().monitoring,
        monitoringState: restoreMonitoring ? "active" : "off",
        processedSignalState: this.bypass || !this.settings.enabled ? "unverified" : "waiting_for_input",
        fallbackActive: false,
        fallbackReason: null,
        error: null,
        resources: [{
          path: WORKLET_PATH,
          mediaType: "text/javascript",
          status: "loaded",
          httpStatus: 200,
          error: null,
        }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.disposeGraph();
      this.patchDiagnostics({
        status: "error",
        workletReady: false,
        inputTrackState: inputTrack.readyState,
        outputTrackState: null,
        monitoring: false,
        monitoringState: "interrupted",
        fallbackActive: false,
        fallbackReason: message,
        error: message,
        resources: [{
          path: WORKLET_PATH,
          mediaType: "text/javascript",
          status: "invalid",
          httpStatus: null,
          error: message,
        }],
      });
      throw error;
    }
  }

  async updateSettings(settings: VoiceCorrectionSettings) {
    this.assertReady();
    this.settings = normalizeVoiceCorrectionSettings(settings);
    this.processor?.update(meewavTestPitchParameters(this.settings, this.bypass));
    this.applyRoute();
  }

  async setBypass(bypass: boolean) {
    this.assertReady();
    this.bypass = bypass;
    this.processor?.update(meewavTestPitchParameters(this.settings, bypass));
    this.processedSilenceSince = null;
    this.applyRoute();
  }

  async setMonitoring(enabled: boolean) {
    this.assertReady();
    if (this.monitoring === enabled) return;
    if (!enabled) {
      this.output?.disableMonitoring();
      this.monitoring = false;
      this.patchDiagnostics({ monitoring: false, monitoringState: "off" });
      return;
    }
    const output = this.output;
    if (!output || !this.inputStream?.getAudioTracks().some((track) => track.readyState === "live")) {
      throw new Error("Le graphe audio MeeWav n’est pas connecté au microphone.");
    }
    this.patchDiagnostics({ monitoring: false, monitoringState: "starting" });
    try {
      await output.enableMonitoring({ playProofTone: this.playMonitoringProofTone });
      this.monitoring = true;
      const snapshot = output.getSnapshot();
      this.patchDiagnostics({
        monitoring: snapshot.monitoring,
        monitoringState: snapshot.monitoring ? (this.runtimeFailed ? "fallback" : "active") : "interrupted",
        localOutputProof: snapshot.localOutputProof,
      });
    } catch (error) {
      this.monitoring = false;
      const snapshot = output.getSnapshot();
      this.patchDiagnostics({
        monitoring: false,
        monitoringState: "interrupted",
        localOutputProof: snapshot.localOutputProof,
      });
      throw error;
    }
  }

  getDryStream() { return this.inputStream; }
  getProcessedStream() { return this.output?.stream ?? null; }
  getMeterSnapshot(): VoiceCorrectionMeterSnapshot {
    return {
      input: rms(this.inputAnalyser),
      output: this.output?.readOutputLevel() ?? 0,
    };
  }
  getDiagnostics() { return structuredClone(this.diagnostics); }

  subscribeDiagnostics(listener: VoiceCorrectionDiagnosticsListener) {
    this.listeners.add(listener);
    listener(this.getDiagnostics());
    return () => this.listeners.delete(listener);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    await this.disposeGraph();
    if (this.ownsContext && this.context && this.context.state !== "closed") {
      await this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.patchDiagnostics({
      status: "disposed",
      engineReady: false,
      workletReady: false,
      inputTrackState: null,
      outputTrackState: null,
      monitoring: false,
      monitoringState: "off",
    });
    this.listeners.clear();
  }

  private readonly handleInputEnded = () => {
    this.monitoring = false;
    this.output?.disableMonitoring();
    this.patchDiagnostics({
      status: "error",
      inputTrackState: "ended",
      monitoring: false,
      monitoringState: "interrupted",
      fallbackActive: false,
      fallbackReason: "Le microphone s’est arrêté.",
      error: "Le microphone s’est arrêté.",
    });
  };

  private readonly handleProcessorError = () => {
    this.activateFallback(
      "worklet_failed",
      "Le processeur MeeWav s’est interrompu. La voix originale a été restaurée.",
    );
  };

  private async disposeGraph() {
    this.stopSignalDiagnostics();
    const inputTrack = this.inputStream?.getAudioTracks()[0];
    inputTrack?.removeEventListener("ended", this.handleInputEnded);
    const outputTrack = this.output?.outputTrack;
    if (outputTrack && this.outputEndedListener) {
      outputTrack.removeEventListener("ended", this.outputEndedListener);
    }
    this.outputEndedListener = null;
    this.processorHealthUnsubscribe?.();
    this.processorHealthUnsubscribe = null;
    this.processorErrorNode?.removeEventListener("processorerror", this.handleProcessorError);
    this.processorErrorNode = null;
    try { this.inputSource?.disconnect(); } catch { /* Already disconnected. */ }
    if (this.processor) {
      try { this.processor.output.disconnect(); } catch { /* Already disconnected. */ }
      await this.processor.dispose();
    }
    this.output?.dispose();
    for (const node of [this.inputAnalyser, this.dryGain, this.wetGain, this.outputBus]) {
      try { node?.disconnect(); } catch { /* Already disconnected. */ }
    }
    this.inputSource = null;
    this.inputAnalyser = null;
    this.dryGain = null;
    this.wetGain = null;
    this.outputBus = null;
    this.output = null;
    this.processor = null;
    this.inputStream = null;
  }

  private applyRoute() {
    const context = this.context;
    if (!context || !this.dryGain || !this.wetGain) {
      this.patchDiagnostics({ bypass: this.bypass });
      return;
    }
    const corrected = Boolean(
      this.processor
      && this.inputStream?.getAudioTracks().some((track) => track.readyState === "live")
      && this.settings.enabled
      && !this.bypass
      && !this.runtimeFailed,
    );
    this.dryGain.gain.cancelScheduledValues(context.currentTime);
    this.wetGain.gain.cancelScheduledValues(context.currentTime);
    this.dryGain.gain.setValueAtTime(corrected ? 0 : 1, context.currentTime);
    this.wetGain.gain.setValueAtTime(corrected ? 1 : 0, context.currentTime);
    const inputTrackState = this.inputStream?.getAudioTracks()[0]?.readyState ?? null;
    this.patchDiagnostics({
      status: this.runtimeFailed && inputTrackState === "live"
        ? "fallback"
        : inputTrackState
          ? corrected ? "processing" : "bypassed"
          : "ready",
      bypass: this.bypass,
      inputTrackState,
      outputTrackState: this.output?.outputTrack?.readyState ?? null,
      fallbackActive: this.runtimeFailed && inputTrackState === "live",
      processedSignalState: corrected
        ? this.diagnostics.processedSignalState === "detected" ? "detected" : "waiting_for_input"
        : this.runtimeFailed ? this.diagnostics.processedSignalState : "unverified",
      monitoringState: this.monitoring
        ? this.runtimeFailed ? "fallback" : "active"
        : this.diagnostics.monitoringState,
    });
  }

  private activateFallback(reason: string, message: string) {
    if (this.disposed || this.runtimeFailed) return;
    this.runtimeFailed = true;
    this.processedSilenceSince = null;
    this.patchDiagnostics({
      workletReady: reason === "worklet_failed" ? false : this.diagnostics.workletReady,
      processedSignalState: "silent",
      fallbackReason: reason,
      error: message,
    });
    this.applyRoute();
  }

  private startSignalDiagnostics() {
    this.stopSignalDiagnostics();
    if (typeof window === "undefined") return;
    this.signalTimer = window.setInterval(() => this.sampleSignalHealth(), 125);
  }

  private stopSignalDiagnostics() {
    if (this.signalTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.signalTimer);
    }
    this.signalTimer = null;
    this.processedSilenceSince = null;
  }

  private sampleSignalHealth() {
    if (this.runtimeFailed || this.bypass || !this.settings.enabled || !this.processor) {
      this.processedSilenceSince = null;
      return;
    }
    const { input, output } = this.getMeterSnapshot();
    const inputIsClearlyAudible = input > 0.008;
    if (!inputIsClearlyAudible) {
      this.processedSilenceSince = null;
      if (this.diagnostics.processedSignalState !== "waiting_for_input") {
        this.patchDiagnostics({ processedSignalState: "waiting_for_input" });
      }
      return;
    }
    const processedIsSilent = output < 0.00063 && output < input * 0.063;
    if (!processedIsSilent) {
      this.processedSilenceSince = null;
      if (this.diagnostics.processedSignalState !== "detected") {
        this.patchDiagnostics({ processedSignalState: "detected" });
      }
      return;
    }
    const now = performance.now();
    if (this.processedSilenceSince === null) {
      this.processedSilenceSince = now;
      return;
    }
    if (now - this.processedSilenceSince < 1_000) return;
    this.activateFallback(
      "processed_silent",
      "La correction MeeWav ne produit aucun signal. La voix originale a été restaurée.",
    );
  }

  private patchDiagnostics(patch: Partial<VoiceCorrectionEngineDiagnostics>) {
    this.diagnostics = { ...this.diagnostics, ...patch };
    const snapshot = this.getDiagnostics();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private assertReady() {
    this.assertUsable();
    if (!this.context || !this.diagnostics.engineReady) throw new Error("Le moteur MeeWav test n’est pas initialisé.");
  }

  private assertUsable() {
    if (this.disposed) throw new Error("Le moteur MeeWav test est fermé.");
  }
}

export function createMeeWavTestVoiceCorrectionEngine(options?: {
  adapter?: PlacePitchCorrectionAdapter;
  playMonitoringProofTone?: boolean;
}): VoiceCorrectionEngine {
  return new MeeWavTestVoiceCorrectionEngine(
    options?.adapter ?? meewavPitchCorrectionAdapter,
    options?.playMonitoringProofTone ?? true,
  );
}
