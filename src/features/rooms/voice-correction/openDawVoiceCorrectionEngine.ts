import type {
  SampleLoaderManager,
  SoundfontLoaderManager,
} from "@opendaw/studio-adapters";
import type {
  AudioWorklets,
  EngineWorklet,
  Project,
  ProjectEnv,
  SampleService,
  SoundfontService,
} from "@opendaw/studio-core";
import type { AutotuneDeviceBox, AudioUnitBox } from "@opendaw/studio-boxes";
import { VoiceCorrectionHeadphoneOutput } from "./voiceCorrectionHeadphoneOutput";
import type {
  VoiceCorrectionDiagnosticsListener,
  VoiceCorrectionEngine,
  VoiceCorrectionEngineDiagnostics,
  VoiceCorrectionInitializeOptions,
  VoiceCorrectionMeterSnapshot,
  VoiceCorrectionResourceState,
} from "./VoiceCorrectionEngine";
import {
  DEFAULT_VOICE_CORRECTION_SETTINGS,
  normalizeVoiceCorrectionSettings,
} from "./voiceCorrection.presets";
import type { VoiceCorrectionSettings } from "./voiceCorrection.types";

const OPENDAW_ASSET_VERSION = "0.0.11";
const DEFAULT_ASSET_BASE = `/opendaw-wasm/${OPENDAW_ASSET_VERSION}`;
const OPENDAW_DSP_LATENCY_SAMPLES = 1_280;

export function resolveVoiceCorrectionRouteState(input: {
  runtimeFailed: boolean;
  inputTrackState: MediaStreamTrackState | null;
  corrected: boolean;
}) {
  if (input.runtimeFailed) {
    const dryFallbackAvailable = input.inputTrackState === "live";
    return {
      status: dryFallbackAvailable ? "fallback" as const : "error" as const,
      fallbackActive: dryFallbackAvailable,
    };
  }
  return {
    status: input.inputTrackState
      ? input.corrected ? "processing" as const : "bypassed" as const
      : "ready" as const,
    fallbackActive: false,
  };
}

type OpenDawManifest = {
  assetVersion: string;
  files: Array<{
    path: string;
    mediaType: string;
  }>;
};

type OpenDawRuntimeModules = {
  core: typeof import("@opendaw/studio-core");
  wasm: typeof import("@opendaw/studio-core-wasm");
  adapters: typeof import("@opendaw/studio-adapters");
  boxes: typeof import("@opendaw/studio-boxes");
  enums: typeof import("@opendaw/studio-enums");
  std: typeof import("@opendaw/lib-std");
};

const wasmProcessorContexts = new WeakSet<BaseAudioContext>();
const audioWorkletsByContext = new WeakMap<BaseAudioContext, AudioWorklets>();
let installedAssetBase: string | null = null;
let wasmReadinessPromise: Promise<boolean> | null = null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function waitForWorkletReady(worklet: EngineWorklet, timeoutMs = 15_000) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let rejectOnProcessorError: ((event: Event) => void) | null = null;
  try {
    await Promise.race([
      worklet.isReady(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Le processeur audio openDAW n'a pas répondu sous ${timeoutMs / 1_000} secondes.`)),
          timeoutMs,
        );
      }),
      new Promise<never>((_, reject) => {
        rejectOnProcessorError = (event) => reject(new Error(
          event instanceof ErrorEvent
            ? errorMessage(event.error ?? event.message)
            : "Le processeur audio openDAW s'est arrêté pendant son initialisation.",
        ));
        worklet.addEventListener("error", rejectOnProcessorError, { once: true });
        worklet.addEventListener("processorerror", rejectOnProcessorError, { once: true });
      }),
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    if (rejectOnProcessorError) {
      worklet.removeEventListener("error", rejectOnProcessorError);
      worklet.removeEventListener("processorerror", rejectOnProcessorError);
    }
  }
}

function normalizedAssetBase(value: string | undefined) {
  const base = value?.trim() || DEFAULT_ASSET_BASE;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function rms(analyser: AnalyserNode | null) {
  if (!analyser) return 0;
  const values = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(values);
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.min(1, Math.sqrt(sum / values.length));
}

function isExpectedMediaType(path: string, expected: string, received: string) {
  const value = received.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (path.endsWith(".wasm")) return value === "application/wasm";
  if (path.endsWith(".js")) {
    return value === "text/javascript"
      || value === "application/javascript"
      || value === "text/ecmascript"
      || value === "application/ecmascript";
  }
  return value === expected.toLowerCase();
}

async function loadRuntimeModules(): Promise<OpenDawRuntimeModules> {
  const [core, wasm, adapters, boxes, enums, std] = await Promise.all([
    import("@opendaw/studio-core"),
    import("@opendaw/studio-core-wasm"),
    import("@opendaw/studio-adapters"),
    import("@opendaw/studio-boxes"),
    import("@opendaw/studio-enums"),
    import("@opendaw/lib-std"),
  ]);
  return { core, wasm, adapters, boxes, enums, std };
}

async function inspectAssets(assetBase: string): Promise<Array<VoiceCorrectionResourceState>> {
  const manifestUrl = `${assetBase}/manifest.json`;
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest openDAW introuvable (${response.status}) : ${manifestUrl}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("text/html")) {
    throw new Error("Le chemin du manifest openDAW renvoie une page HTML.");
  }
  const manifest = await response.json() as OpenDawManifest;
  if (manifest.assetVersion !== OPENDAW_ASSET_VERSION || !Array.isArray(manifest.files)) {
    throw new Error(`Manifest openDAW incompatible (attendu ${OPENDAW_ASSET_VERSION}).`);
  }

  return Promise.all(manifest.files.map(async ({ path, mediaType }) => {
    const url = `${assetBase}/${path}`;
    const state: VoiceCorrectionResourceState = {
      path,
      mediaType,
      status: "pending",
      httpStatus: null,
      error: null,
    };
    try {
      let assetResponse = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (assetResponse.status === 405 || assetResponse.status === 501) {
        assetResponse = await fetch(url, {
          cache: "no-store",
          headers: { Range: "bytes=0-3" },
        });
      }
      state.httpStatus = assetResponse.status;
      if (!assetResponse.ok) {
        state.status = "missing";
        state.error = `HTTP ${assetResponse.status}`;
        return state;
      }
      const actualMediaType = assetResponse.headers.get("content-type") ?? "";
      if (!isExpectedMediaType(path, mediaType, actualMediaType)) {
        state.status = "invalid";
        state.error = actualMediaType.toLowerCase().includes("text/html")
          ? "Le serveur a renvoyé du HTML."
          : `MIME ${actualMediaType || "absent"} (attendu ${mediaType}).`;
        return state;
      }
      state.status = "available";
      return state;
    } catch (error) {
      state.status = "missing";
      state.error = errorMessage(error);
      return state;
    }
  }));
}

function createUnavailableManagers(): {
  sampleManager: SampleLoaderManager;
  soundfontManager: SoundfontLoaderManager;
} {
  const unavailable = () => {
    throw new Error("Ce laboratoire vocal ne charge ni sample ni soundfont.");
  };
  return {
    sampleManager: {
      getOrCreate: unavailable,
      record: () => undefined,
      invalidate: () => undefined,
      remove: () => undefined,
      register: () => ({ terminate: () => undefined }),
    },
    soundfontManager: {
      getOrCreate: unavailable,
      invalidate: () => undefined,
      remove: () => undefined,
    },
  };
}

class OpenDawVoiceCorrectionEngine implements VoiceCorrectionEngine {
  private diagnostics: VoiceCorrectionEngineDiagnostics = {
    status: "idle",
    engineReady: false,
    workletReady: false,
    crossOriginIsolated: typeof window !== "undefined" && window.crossOriginIsolated === true,
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
    resources: [],
  };

  private readonly listeners = new Set<VoiceCorrectionDiagnosticsListener>();
  private modules: OpenDawRuntimeModules | null = null;
  private context: AudioContext | null = null;
  private ownsContext = false;
  private project: Project | null = null;
  private worklet: EngineWorklet | null = null;
  private audioUnit: AudioUnitBox | null = null;
  private correctionBox: AutotuneDeviceBox | null = null;
  private inputStream: MediaStream | null = null;
  private inputTrack: MediaStreamTrack | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputBus: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetInput: GainNode | null = null;
  private wetSplitter: ChannelSplitterNode | null = null;
  private wetGain: GainNode | null = null;
  private outputBus: GainNode | null = null;
  private output: VoiceCorrectionHeadphoneOutput | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private settings: VoiceCorrectionSettings = { ...DEFAULT_VOICE_CORRECTION_SETTINGS };
  private bypass = true;
  private monitoring = false;
  private runtimeFailed = false;
  private workletFailed = false;
  private disposed = false;
  private cpuTimer: number | null = null;
  private signalTimer: number | null = null;
  private processedSilenceSince: number | null = null;
  private inputEndedListener: (() => void) | null = null;
  private outputEndedListener: (() => void) | null = null;
  private workletErrorListener: ((event: Event) => void) | null = null;
  private initializationPromise: Promise<void> | null = null;
  private initializationGeneration = 0;

  initialize(options: VoiceCorrectionInitializeOptions = {}) {
    this.assertNotDisposed();
    if (this.diagnostics.engineReady) return Promise.resolve();
    if (this.initializationPromise) return this.initializationPromise;
    const generation = ++this.initializationGeneration;
    const pending = this.initializeRuntime(options, generation).finally(() => {
      if (this.initializationPromise === pending) this.initializationPromise = null;
    });
    this.initializationPromise = pending;
    return pending;
  }

  private async initializeRuntime(options: VoiceCorrectionInitializeOptions, generation: number) {
    this.patchDiagnostics({ status: "initializing", error: null, fallbackActive: false, fallbackReason: null });
    const assetBase = normalizedAssetBase(options.assetBaseUrl);

    try {
      const resources = await inspectAssets(assetBase);
      this.assertInitializationActive(generation);
      this.patchDiagnostics({ resources });
      const invalid = resources.filter(({ status }) => status !== "available");
      if (invalid.length > 0) {
        throw new Error(`Ressources openDAW invalides : ${invalid.map(({ path }) => path).join(", ")}`);
      }
      if (typeof window === "undefined" || window.crossOriginIsolated !== true) {
        throw new Error("La page doit être isolée (COOP/COEP) pour utiliser le moteur vocal openDAW.");
      }
      if (typeof AudioWorkletNode === "undefined") {
        throw new Error("AudioWorklet n’est pas disponible dans ce navigateur.");
      }

      this.modules = await loadRuntimeModules();
      this.assertInitializationActive(generation);
      const context = options.audioContext ?? new AudioContext({
        latencyHint: "interactive",
        sampleRate: 48_000,
      });
      this.context = context;
      this.ownsContext = !options.audioContext;
      if (context.state === "suspended") await context.resume();
      this.assertInitializationActive(generation);

      const { WasmEngine } = this.modules.wasm;
      const processorUrl = `${assetBase}/wasm-processor.js`;
      if (installedAssetBase !== null && installedAssetBase !== assetBase) {
        throw new Error(`Le moteur openDAW est déjà associé au bundle ${installedAssetBase}.`);
      }
      if (installedAssetBase === null) {
        WasmEngine.install({
          processorUrl,
          offlineWorkerUrl: `${assetBase}/wasm-offline-worker.js`,
          wasmUrl: assetBase,
        });
        installedAssetBase = assetBase;
      }

      if (WasmEngine.isReady()) {
        if (!wasmProcessorContexts.has(context)) {
          await context.audioWorklet.addModule(processorUrl);
          wasmProcessorContexts.add(context);
        }
      } else {
        const ownsReadiness = wasmReadinessPromise === null;
        if (!wasmReadinessPromise) {
          const pendingReadiness = WasmEngine.ensureReady(context);
          wasmReadinessPromise = pendingReadiness;
          void pendingReadiness.then(
            (ready) => {
              if (!ready && wasmReadinessPromise === pendingReadiness) wasmReadinessPromise = null;
            },
            () => {
              if (wasmReadinessPromise === pendingReadiness) wasmReadinessPromise = null;
            },
          );
        }
        const ready = await wasmReadinessPromise;
        if (!ready) throw new Error("Le moteur WASM openDAW n’a pas pu être initialisé.");
        if (ownsReadiness) wasmProcessorContexts.add(context);
        if (!wasmProcessorContexts.has(context)) {
          await context.audioWorklet.addModule(processorUrl);
          wasmProcessorContexts.add(context);
        }
      }
      this.assertInitializationActive(generation);

      let audioWorklets = audioWorkletsByContext.get(context);
      if (!audioWorklets) {
        this.modules.core.AudioWorklets.install(`${assetBase}/processors.js`);
        audioWorklets = await this.modules.core.AudioWorklets.createFor(context);
        audioWorkletsByContext.set(context, audioWorklets);
      }
      this.assertInitializationActive(generation);

      this.createGraph(audioWorklets);
      await waitForWorkletReady(this.worklet!);
      this.assertInitializationActive(generation);
      this.patchDiagnostics({
        status: "ready",
        engineReady: true,
        workletReady: true,
        crossOriginIsolated: true,
        sampleRate: context.sampleRate,
        baseLatencyMs: Number.isFinite(context.baseLatency) ? context.baseLatency * 1_000 : null,
        outputLatencyMs: Number.isFinite(context.outputLatency) ? context.outputLatency * 1_000 : null,
        estimatedDspLatencyMs: (OPENDAW_DSP_LATENCY_SAMPLES / context.sampleRate) * 1_000,
        outputTrackState: this.output?.outputTrack?.readyState ?? null,
        resources: resources.map((resource) => ({
          ...resource,
          status: resource.path === "wasm-offline-worker.js" ? "available" : "loaded",
        })),
      });
      this.startCpuDiagnostics();
    } catch (error) {
      await this.cleanupRuntime();
      if (!this.disposed) {
        this.patchDiagnostics({
          status: "error",
          engineReady: false,
          workletReady: false,
          error: errorMessage(error),
          fallbackActive: false,
          fallbackReason: "initialization_failed",
        });
      }
      throw error;
    }
  }

  async connectInput(stream: MediaStream) {
    this.assertReady();
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("Le flux choisi ne contient aucune piste microphone.");
    if (track.readyState === "ended") throw new Error("La piste microphone est déjà terminée.");

    this.disconnectInput();
    const context = this.context!;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const inputBus = context.createGain();
    inputBus.channelCount = 1;
    inputBus.channelCountMode = "explicit";
    inputBus.channelInterpretation = "discrete";
    source.connect(inputBus);
    inputBus.connect(this.dryGain!);
    inputBus.connect(this.inputAnalyser!);
    this.worklet!.registerMonitoringSource(this.audioUnit!.address.uuid, inputBus, 1, this.wetInput!);

    this.inputStream = stream;
    this.inputTrack = track;
    this.inputSource = source;
    this.inputBus = inputBus;
    this.inputEndedListener = () => this.activateFallback(
      "microphone_ended",
      "La piste microphone s’est arrêtée. Réactive le microphone pour continuer.",
    );
    track.addEventListener("ended", this.inputEndedListener, { once: true });
    // A processorerror is terminal for this worklet. Replacing the microphone
    // must not pretend that a dead processor has recovered.
    this.runtimeFailed = this.workletFailed;
    if (!this.runtimeFailed) {
      this.patchDiagnostics({ fallbackActive: false, fallbackReason: null, error: null });
    }
    this.applyRoute();
    this.startSignalDiagnostics();
  }

  async updateSettings(settings: VoiceCorrectionSettings) {
    this.assertNotDisposed();
    this.settings = normalizeVoiceCorrectionSettings(settings);
    if (this.correctionBox && this.project) {
      const box = this.correctionBox;
      const graph = this.project.boxGraph;
      graph.beginTransaction();
      try {
        box.enabled.setValue(this.settings.enabled);
        box.key.setValue(this.settings.key);
        box.scale.setValue(this.settings.scale);
        box.amount.setValue(this.settings.amount);
        box.retune.setValue(this.settings.retune);
        box.shift.setValue(this.settings.shift);
        box.smooth.setValue(this.settings.smooth);
      } finally {
        graph.endTransaction();
      }
    }
    this.applyRoute();
  }

  async setBypass(bypass: boolean) {
    this.assertNotDisposed();
    this.bypass = bypass;
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
    if (!output || this.inputTrack?.readyState !== "live") {
      throw new Error("Le graphe audio openDAW n’est pas connecté au microphone.");
    }
    this.patchDiagnostics({ monitoring: false, monitoringState: "starting" });
    try {
      await output.enableMonitoring({ playProofTone: true });
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

  getDryStream() {
    return this.inputStream;
  }

  getProcessedStream() {
    return this.output?.stream ?? null;
  }

  getMeterSnapshot(): VoiceCorrectionMeterSnapshot {
    return {
      input: rms(this.inputAnalyser),
      output: this.output?.readOutputLevel() ?? 0,
    };
  }

  getDiagnostics() {
    return {
      ...this.diagnostics,
      resources: this.diagnostics.resources.map((resource) => ({ ...resource })),
    };
  }

  subscribeDiagnostics(listener: VoiceCorrectionDiagnosticsListener) {
    this.listeners.add(listener);
    listener(this.getDiagnostics());
    return () => this.listeners.delete(listener);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.initializationGeneration += 1;
    const pendingInitialization = this.initializationPromise;
    if (pendingInitialization) await pendingInitialization.catch(() => undefined);
    this.disconnectInput();
    await this.cleanupRuntime();
    this.monitoring = false;
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

  private createGraph(audioWorklets: AudioWorklets) {
    const { adapters, boxes, core, enums, std } = this.modules!;
    const context = this.context!;
    const skeleton = adapters.ProjectSkeleton.empty({
      createOutputMaximizer: false,
      createDefaultUser: false,
    });
    const { boxGraph } = skeleton;
    boxGraph.beginTransaction();
    let audioUnit: AudioUnitBox;
    let correctionBox: AutotuneDeviceBox;
    try {
      const capture = boxes.CaptureAudioBox.create(boxGraph, std.UUID.generate(), (box) => {
        box.requestChannels.setValue(1);
      });
      audioUnit = adapters.AudioUnitFactory.create(
        skeleton,
        enums.AudioUnitType.Instrument,
        std.Option.wrap(capture),
      );
      correctionBox = boxes.AutotuneDeviceBox.create(boxGraph, std.UUID.generate(), (box) => {
        box.host.refer(audioUnit.audioEffects);
        box.index.setValue(0);
        box.label.setValue("MeeWav Voice Correction");
        box.enabled.setValue(this.settings.enabled);
        box.key.setValue(this.settings.key);
        box.scale.setValue(this.settings.scale);
        box.amount.setValue(this.settings.amount);
        box.retune.setValue(this.settings.retune);
        box.shift.setValue(this.settings.shift);
        box.smooth.setValue(this.settings.smooth);
      });
    } finally {
      boxGraph.endTransaction();
    }

    const managers = createUnavailableManagers();
    const env: ProjectEnv = {
      audioContext: context,
      audioWorklets,
      sampleManager: managers.sampleManager,
      soundfontManager: managers.soundfontManager,
      // This minimal graph has no assets. These services are required by the
      // Project type but are deliberately unreachable in this laboratory.
      sampleService: {} as SampleService,
      soundfontService: {} as SoundfontService,
    };
    const project = core.Project.fromSkeleton(env, skeleton, false);
    const worklet = audioWorklets.createEngine({ project });
    project.engine.setWorklet(worklet);

    const dryGain = context.createGain();
    const wetInput = context.createGain();
    const wetSplitter = context.createChannelSplitter(2);
    const wetGain = context.createGain();
    const outputBus = context.createGain();
    const inputAnalyser = context.createAnalyser();

    for (const monoNode of [dryGain, wetGain, outputBus]) {
      monoNode.channelCount = 1;
      monoNode.channelCountMode = "explicit";
      monoNode.channelInterpretation = "discrete";
    }
    inputAnalyser.fftSize = 512;
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    wetInput.connect(wetSplitter);
    wetSplitter.connect(wetGain, 0, 0);
    dryGain.connect(outputBus);
    wetGain.connect(outputBus);
    const output = new VoiceCorrectionHeadphoneOutput(context, outputBus);

    this.project = project;
    this.worklet = worklet;
    this.audioUnit = audioUnit;
    this.correctionBox = correctionBox;
    this.dryGain = dryGain;
    this.wetInput = wetInput;
    this.wetSplitter = wetSplitter;
    this.wetGain = wetGain;
    this.outputBus = outputBus;
    this.output = output;
    this.inputAnalyser = inputAnalyser;

    const outputTrack = output.outputTrack;
    this.outputEndedListener = () => {
      // A MediaStreamDestination track may end while the direct hardware
      // branch is still connected. Cut that branch before publishing the
      // interruption so UI and audible state remain identical.
      output.disableMonitoring();
      this.monitoring = false;
      this.patchDiagnostics({ monitoring: false, monitoringState: "interrupted" });
      this.activateFallback(
        "output_ended",
        "La sortie corrigée s’est arrêtée. Réactive le retour casque pour continuer.",
      );
    };
    outputTrack?.addEventListener("ended", this.outputEndedListener, { once: true });

    this.workletErrorListener = (event) => this.activateFallback(
      "worklet_failed",
      event instanceof ErrorEvent ? errorMessage(event.error ?? event.message) : "Le processeur audio s’est arrêté.",
    );
    worklet.addEventListener("error", this.workletErrorListener);
    worklet.addEventListener("processorerror", this.workletErrorListener);
  }

  private disconnectInput() {
    this.stopSignalDiagnostics();
    if (this.inputTrack && this.inputEndedListener) {
      this.inputTrack.removeEventListener("ended", this.inputEndedListener);
    }
    this.inputEndedListener = null;
    if (this.worklet && this.audioUnit && this.inputBus) {
      try {
        this.worklet.unregisterMonitoringSource(this.audioUnit.address.uuid);
      } catch {
        // A failed worklet may already have destroyed its monitoring router.
      }
    }
    try { this.inputSource?.disconnect(); } catch { /* already disconnected */ }
    try { this.inputBus?.disconnect(); } catch { /* already disconnected */ }
    this.inputStream = null;
    this.inputTrack = null;
    this.inputSource = null;
    this.inputBus = null;
    this.patchDiagnostics({ inputTrackState: null });
  }

  private applyRoute() {
    const context = this.context;
    if (!context || !this.dryGain || !this.wetGain) {
      this.patchDiagnostics({ bypass: this.bypass });
      return;
    }
    const corrected = Boolean(
      this.inputTrack
      && this.inputTrack.readyState === "live"
      && this.settings.enabled
      && !this.bypass
      && !this.runtimeFailed,
    );
    const inputTrackState = this.inputTrack?.readyState ?? null;
    const routeState = resolveVoiceCorrectionRouteState({
      runtimeFailed: this.runtimeFailed,
      inputTrackState,
      corrected,
    });
    this.dryGain.gain.cancelScheduledValues(context.currentTime);
    this.wetGain.gain.cancelScheduledValues(context.currentTime);
    // Exact switch: the dry and corrected paths are never intentionally mixed.
    this.dryGain.gain.setValueAtTime(corrected ? 0 : 1, context.currentTime);
    this.wetGain.gain.setValueAtTime(corrected ? 1 : 0, context.currentTime);
    this.patchDiagnostics({
      status: routeState.status,
      bypass: this.bypass,
      fallbackActive: routeState.fallbackActive,
      inputTrackState,
      outputTrackState: this.output?.outputTrack?.readyState ?? null,
      processedSignalState: corrected
        ? this.diagnostics.processedSignalState === "detected" ? "detected" : "waiting_for_input"
        : this.runtimeFailed ? this.diagnostics.processedSignalState : "unverified",
      monitoringState: this.monitoring
        ? this.runtimeFailed ? "fallback" : "active"
        : this.diagnostics.monitoringState,
    });
  }

  private activateFallback(reason: string, message: string) {
    if (this.disposed) return;
    if (reason === "worklet_failed") this.workletFailed = true;
    this.runtimeFailed = true;
    const dryFallbackAvailable = this.inputTrack?.readyState === "live";
    if (!dryFallbackAvailable) {
      this.monitoring = false;
      this.output?.disableMonitoring();
    }
    this.patchDiagnostics({
      workletReady: reason === "worklet_failed" ? false : this.diagnostics.workletReady,
      monitoring: dryFallbackAvailable ? this.diagnostics.monitoring : false,
      monitoringState: dryFallbackAvailable && this.monitoring ? "fallback" : "interrupted",
      processedSignalState: "silent",
      fallbackActive: dryFallbackAvailable,
      fallbackReason: reason,
      error: message,
    });
    this.applyRoute();
  }

  private startCpuDiagnostics() {
    if (typeof window === "undefined") return;
    this.cpuTimer = window.setInterval(() => {
      const value = this.worklet?.cpuLoad.getValue();
      this.patchDiagnostics({
        cpuLoadPercent: typeof value === "number" && Number.isFinite(value) ? value : null,
        inputTrackState: this.inputTrack?.readyState ?? null,
        outputTrackState: this.output?.outputTrack?.readyState ?? null,
      });
    }, 1_000);
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
    const corrected = Boolean(
      this.inputTrack?.readyState === "live"
      && this.settings.enabled
      && !this.bypass
      && !this.runtimeFailed,
    );
    if (!corrected) {
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
      "La correction openDAW ne produit aucun signal. La voix originale a été restaurée.",
    );
  }

  private async cleanupRuntime() {
    this.stopSignalDiagnostics();
    if (this.cpuTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.cpuTimer);
      this.cpuTimer = null;
    }
    if (this.worklet && this.workletErrorListener) {
      this.worklet.removeEventListener("error", this.workletErrorListener);
      this.worklet.removeEventListener("processorerror", this.workletErrorListener);
    }
    this.workletErrorListener = null;
    const outputTrack = this.output?.outputTrack;
    if (outputTrack && this.outputEndedListener) {
      outputTrack.removeEventListener("ended", this.outputEndedListener);
    }
    this.outputEndedListener = null;
    try { this.project?.engine.releaseWorklet(); } catch { /* best effort */ }
    try { this.project?.terminate(); } catch { /* best effort */ }
    for (const node of [
      this.inputSource,
      this.inputBus,
      this.dryGain,
      this.wetInput,
      this.wetSplitter,
      this.wetGain,
      this.outputBus,
      this.inputAnalyser,
    ]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
    this.output?.dispose();

    const context = this.context;
    const ownsContext = this.ownsContext;
    this.project = null;
    this.worklet = null;
    this.audioUnit = null;
    this.correctionBox = null;
    this.dryGain = null;
    this.wetInput = null;
    this.wetSplitter = null;
    this.wetGain = null;
    this.outputBus = null;
    this.output = null;
    this.inputAnalyser = null;
    this.context = null;
    this.ownsContext = false;
    if (ownsContext && context && context.state !== "closed") {
      try { await context.close(); } catch { /* best effort */ }
    }
  }

  private patchDiagnostics(patch: Partial<VoiceCorrectionEngineDiagnostics>) {
    this.diagnostics = { ...this.diagnostics, ...patch };
    const snapshot = this.getDiagnostics();
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertReady() {
    this.assertNotDisposed();
    if (!this.context || !this.worklet || !this.output) {
      throw new Error("Le moteur Autotune n’est pas initialisé.");
    }
  }

  private assertNotDisposed() {
    if (this.disposed) throw new Error("Le moteur Autotune est fermé.");
  }

  private assertInitializationActive(generation: number) {
    if (this.disposed || generation !== this.initializationGeneration) {
      throw new DOMException("Initialisation de l’Autotune annulée.", "AbortError");
    }
  }
}

export function createOpenDawVoiceCorrectionEngine(): VoiceCorrectionEngine {
  return new OpenDawVoiceCorrectionEngine();
}

export {
  DEFAULT_ASSET_BASE as OPENDAW_VOICE_CORRECTION_ASSET_BASE,
  OPENDAW_ASSET_VERSION as OPENDAW_VOICE_CORRECTION_ASSET_VERSION,
  OPENDAW_DSP_LATENCY_SAMPLES,
};
