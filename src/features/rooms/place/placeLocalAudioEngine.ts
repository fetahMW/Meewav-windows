import type { PlaceVocalState } from "./place.types";
import { roomMicrophoneConstraint } from "./roomDevicePreferences";

export type PlaceLocalAudioStatus =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "monitoring"
  | "unsupported"
  | "error";

export type PlacePitchCorrectionParameters = Pick<
  PlaceVocalState,
  | "tuneEnabled"
  | "tuneKey"
  | "tuneScale"
  | "tuneAmount"
  | "tuneSpeed"
  | "tuneHumanize"
  | "tuneSmooth"
  | "tuneShift"
> & Partial<Pick<PlaceVocalState, "reverbEnabled" | "reverbAmount">>;

/** Processing boundary shared by native/vendor and experimental local engines. */
export type PlacePitchCorrectionProcessor = {
  input: AudioNode;
  output: AudioNode;
  update: (parameters: PlacePitchCorrectionParameters) => void;
  getHealth?: () => {
    available: boolean;
    active: boolean;
    reason: string | null;
    estimatedDspLatencyMs?: number | null;
    maximumDspLatencyMs?: number | null;
    analysisHistoryMs?: number | null;
    maximumPitchDecisionIntervalMs?: number | null;
  };
  subscribeHealth?: (listener: () => void) => () => void;
  dispose: () => void | Promise<void>;
};

export type PlacePitchCorrectionAdapter = {
  handlesReverb?: boolean;
  id: string;
  create: (context: AudioContext) => Promise<PlacePitchCorrectionProcessor>;
};

export type PlaceLocalAudioSnapshot = {
  status: PlaceLocalAudioStatus;
  error: string | null;
  inputStream: MediaStream | null;
  outputStream: MediaStream | null;
  outputTrack: MediaStreamTrack | null;
  monitoring: boolean;
  pitchCorrection: {
    available: boolean;
    active: boolean;
    adapterId: string | null;
    reason: string | null;
  };
  latency: {
    /** AudioContext values do not include the physical microphone path. */
    baseLatencyMs: number | null;
    outputLatencyMs: number | null;
    /** Algorithmic estimate only; no physical headphone measurement. */
    estimatedDspLatencyMs: number | null;
    estimatedMonitoringLatencyMs: number | null;
  };
};

type PlaceLocalAudioListener = (snapshot: PlaceLocalAudioSnapshot) => void;

type PlaceAudioNodes = {
  inputGain: GainNode;
  highPass: BiquadFilterNode;
  lowShelf: BiquadFilterNode;
  presence: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  compDry: GainNode;
  compWet: GainNode;
  compMakeup: GainNode;
  dynamicsSum: GainNode;
  dry: GainNode;
  reverbPreDelay: DelayNode;
  reverb: ConvolverNode;
  reverbWet: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  monitor: GainNode;
  output: MediaStreamAudioDestinationNode;
};

const PITCH_ENGINE_REQUIRED = "Choisis la correction vocale openDAW ou Autotune MeeWav.";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

function smooth(param: AudioParam, value: number, context: AudioContext, timeConstant = 0.018) {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, timeConstant);
}

function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0xffff_ffff;
  };
}

function createReverbImpulse(context: AudioContext, state: PlaceVocalState) {
  const duration = clamp(state.reverbDuration, 0.2, 5);
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const typeSeed = state.reverbType === "Room" ? 17 : state.reverbType === "Plate" ? 29 : 43;
  const random = seededNoise(typeSeed + Math.round(duration * 100));
  const decayPower = state.reverbType === "Room" ? 3.8 : state.reverbType === "Plate" ? 2.4 : 1.75;
  const diffusion = state.reverbType === "Plate" ? 0.88 : state.reverbType === "Hall" ? 0.72 : 0.62;

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const raw = random() * 2 - 1;
      previous = raw * diffusion + previous * (1 - diffusion);
      const earlyReflection = index < context.sampleRate * 0.09 && index % Math.max(1, Math.round(context.sampleRate * 0.011)) === 0
        ? (1 - progress) * 0.34
        : 0;
      data[index] = (previous + earlyReflection * (channel === 0 ? 1 : -0.82)) * ((1 - progress) ** decayPower);
    }
  }

  return impulse;
}

function mediaErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) return "Impossible d’initialiser le traitement audio local.";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Accès au microphone refusé. Autorise le micro pour activer le retour casque.";
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "Aucun microphone n’a été détecté.";
  if (error.name === "NotReadableError" || error.name === "TrackStartError") return "Le microphone est déjà utilisé ou indisponible.";
  return "Impossible d’ouvrir le microphone sur cet appareil.";
}

async function disposePitchProcessor(processor: PlacePitchCorrectionProcessor | null) {
  if (!processor) return;
  try {
    await processor.dispose();
  } catch {
    // The dry graph must remain usable even when a plugin teardown fails.
  }
}

export class PlaceLocalAudioEngine {
  private settings: PlaceVocalState;
  private pitchAdapter: PlacePitchCorrectionAdapter | null;
  private pitchProcessor: PlacePitchCorrectionProcessor | null = null;
  private pitchProcessorAdapterId: string | null = null;
  private pitchHealthUnsubscribe: (() => void) | null = null;
  private pitchFailureReason: string | null = null;
  private context: AudioContext | null = null;
  private inputStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nodes: PlaceAudioNodes | null = null;
  private listeners = new Set<PlaceLocalAudioListener>();
  private startPromise: Promise<MediaStream> | null = null;
  private status: PlaceLocalAudioStatus = "idle";
  private error: string | null = null;
  private monitoring = false;
  private inputEnabled = true;
  private inputGain = 1;
  private impulseKey = "";
  private impulseTimer: ReturnType<typeof setTimeout> | null = null;
  private inputEndedHandler: (() => void) | null = null;
  private lifecycleToken = 0;
  private pitchAdapterToken = 0;
  private pitchCaptureRequestToken = 0;

  constructor(settings: PlaceVocalState, options?: {
    pitchAdapter?: PlacePitchCorrectionAdapter | null;
    inputGain?: number;
  }) {
    this.settings = { ...settings };
    this.pitchAdapter = options?.pitchAdapter ?? null;
    this.inputGain = clamp(options?.inputGain ?? 1, 0, 1);
  }

  subscribe(listener: PlaceLocalAudioListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PlaceLocalAudioSnapshot {
    const outputStream = this.nodes?.output.stream ?? null;
    const pitchHealth = this.pitchProcessor?.getHealth?.() ?? null;
    const pitchAvailable = Boolean(this.pitchProcessor) && (pitchHealth?.available ?? true);
    const baseLatencyMs = this.context && Number.isFinite(this.context.baseLatency)
      ? this.context.baseLatency * 1_000
      : null;
    const reportedOutputLatency = this.context && "outputLatency" in this.context
      ? this.context.outputLatency
      : null;
    const outputLatencyMs = Number.isFinite(reportedOutputLatency)
      ? Number(reportedOutputLatency) * 1_000
      : null;
    const estimatedDspLatencyMs = Number.isFinite(pitchHealth?.estimatedDspLatencyMs)
      ? Number(pitchHealth?.estimatedDspLatencyMs)
      : null;
    const knownMonitoringParts = [baseLatencyMs, outputLatencyMs, estimatedDspLatencyMs]
      .filter((value): value is number => value !== null);
    return {
      status: this.status,
      error: this.error,
      inputStream: this.inputStream,
      outputStream,
      outputTrack: outputStream?.getAudioTracks()[0] ?? null,
      monitoring: this.monitoring,
      pitchCorrection: {
        available: pitchAvailable,
        active: Boolean(pitchAvailable && this.settings.tuneEnabled && (pitchHealth?.active ?? true)),
        adapterId: this.pitchProcessor ? this.pitchProcessorAdapterId : null,
        reason: pitchHealth?.reason ?? this.pitchFailureReason ?? (this.pitchProcessor ? null : PITCH_ENGINE_REQUIRED),
      },
      latency: {
        baseLatencyMs,
        outputLatencyMs,
        estimatedDspLatencyMs,
        estimatedMonitoringLatencyMs: knownMonitoringParts.length > 0
          ? knownMonitoringParts.reduce((sum, value) => sum + value, 0)
          : null,
      },
    };
  }

  updateSettings(settings: PlaceVocalState) {
    this.settings = { ...settings };
    this.applySettings();
  }

  private handlePitchHealth = () => {
    const health = this.pitchProcessor?.getHealth?.();
    if (health && !health.available) {
      const reason = health.reason ?? "Traitement vocal interrompu. Voix originale restaurée.";
      void this.setPitchAdapter(null).then(() => {
        if (!this.pitchAdapter) { this.pitchFailureReason = reason; this.emit(); }
      });
    } else this.emit();
  };

  async setPitchAdapter(adapter: PlacePitchCorrectionAdapter | null) {
    if (this.pitchAdapter?.id === adapter?.id) return;
    const token = ++this.pitchAdapterToken;
    this.pitchAdapter = adapter;
    const context = this.context;
    const nodes = this.nodes;
    if (!context || !nodes || context.state === "closed") {
      this.emit();
      return;
    }

    let nextProcessor: PlacePitchCorrectionProcessor | null = null;
    let nextFailureReason: string | null = null;
    if (adapter) {
      try {
        nextProcessor = await adapter.create(context);
      } catch (error) {
        nextProcessor = null;
        nextFailureReason = error instanceof Error ? error.message : String(error);
      }
    }
    if (token !== this.pitchAdapterToken || this.context !== context || this.nodes !== nodes) {
      await disposePitchProcessor(nextProcessor);
      return;
    }

    const previousProcessor = this.pitchProcessor;
    try { nodes.presence.disconnect(); } catch { /* The route may already be detached. */ }
    try { previousProcessor?.output.disconnect(); } catch { /* The route may already be detached. */ }
    this.pitchHealthUnsubscribe?.();
    this.pitchHealthUnsubscribe = null;
    this.pitchProcessor = null;
    this.pitchProcessorAdapterId = null;
    // Establish the dry route synchronously before awaiting plugin teardown.
    // A slow or rejected dispose must never create a silence gap in the Room.
    nodes.presence.connect(nodes.compDry);
    nodes.presence.connect(nodes.compressor);
    this.applySettings();
    this.emit();
    await disposePitchProcessor(previousProcessor);
    if (token !== this.pitchAdapterToken || this.context !== context || this.nodes !== nodes) {
      await disposePitchProcessor(nextProcessor);
      return;
    }

    this.pitchFailureReason = nextFailureReason;
    if (nextProcessor) {
      try {
        nodes.presence.disconnect();
        nodes.presence.connect(nextProcessor.input);
        nextProcessor.output.connect(nodes.compDry);
        nextProcessor.output.connect(nodes.compressor);
        this.pitchProcessor = nextProcessor;
        this.pitchProcessorAdapterId = adapter?.id ?? null;
        this.pitchFailureReason = null;
        this.pitchHealthUnsubscribe = nextProcessor.subscribeHealth?.(this.handlePitchHealth) ?? null;
      } catch (error) {
        try { nodes.presence.disconnect(); } catch { /* Keep restoring the dry route. */ }
        try { nextProcessor.output.disconnect(); } catch { /* The candidate may not be connected yet. */ }
        nodes.presence.connect(nodes.compDry);
        nodes.presence.connect(nodes.compressor);
        this.pitchFailureReason = error instanceof Error ? error.message : String(error);
        await disposePitchProcessor(nextProcessor);
      }
    }
    this.applySettings();
    this.emit();
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    this.applyInputGain();
  }

  /** Linear input trim shared by dry, processed, monitor and Room output. */
  setInputGain(gain: number) {
    this.inputGain = clamp(gain, 0, 1);
    this.applyInputGain();
  }

  async startCapture() {
    if (this.nodes?.output.stream && this.context && this.context.state !== "closed") {
      if (this.context.state === "suspended") await this.context.resume();
      return this.nodes.output.stream;
    }
    if (this.startPromise) return this.startPromise;

    const token = ++this.lifecycleToken;
    const pending = this.createGraph(token).finally(() => {
      if (this.startPromise === pending) this.startPromise = null;
    });
    this.startPromise = pending;
    return this.startPromise;
  }

  /**
   * Starts (or repairs) the browser capture with the requested correction
   * adapter already wired. A provider is only considered started once the
   * live graph reports that exact adapter as operational.
   */
  async startCaptureWithPitchAdapter(
    adapter: PlacePitchCorrectionAdapter,
    requestIsCurrent: () => boolean = () => true,
  ) {
    const requestToken = ++this.pitchCaptureRequestToken;
    const captureWasAlreadyRunning = Boolean(
      this.startPromise || (
        this.context
        && this.context.state !== "closed"
        && this.nodes?.output.stream
      ),
    );
    try {
      await this.setPitchAdapter(adapter);
      await this.startCapture();
      const snapshot = this.getSnapshot();
      if (!requestIsCurrent()) throw new Error("Audio capture cancelled");
      if (!snapshot.pitchCorrection.available || snapshot.pitchCorrection.adapterId !== adapter.id) {
        throw new Error(snapshot.pitchCorrection.reason ?? "Le moteur de correction vocale n’est pas opérationnel.");
      }
      return snapshot;
    } catch (error) {
      const requestStillOwnsAdapter = this.pitchCaptureRequestToken === requestToken
        && this.pitchAdapter?.id === adapter.id;
      if (requestStillOwnsAdapter) {
        await this.setPitchAdapter(null);
        if (!captureWasAlreadyRunning && this.pitchCaptureRequestToken === requestToken) {
          await this.stop();
        }
      }
      throw error;
    }
  }

  /** Must only be called from an explicit user action after headphones are connected. */
  async enableHeadphoneMonitoring() {
    await this.startCapture();
    if (!this.context || !this.nodes) throw new Error("Audio graph unavailable");
    if (this.context.state === "suspended") await this.context.resume();
    smooth(this.nodes.monitor.gain, 1, this.context, 0.012);
    this.monitoring = true;
    this.status = "monitoring";
    this.error = null;
    this.emit();
    return this.nodes.output.stream;
  }

  disableHeadphoneMonitoring() {
    if (this.context && this.nodes) smooth(this.nodes.monitor.gain, 0, this.context, 0.01);
    this.monitoring = false;
    if (this.status !== "idle" && this.status !== "unsupported" && this.status !== "error") this.status = "ready";
    this.emit();
  }

  async stop() {
    this.lifecycleToken += 1;
    this.pitchAdapterToken += 1;
    this.pitchCaptureRequestToken += 1;
    this.startPromise = null;
    this.disableHeadphoneMonitoring();
    const stream = this.inputStream;
    const endedHandler = this.inputEndedHandler;
    stream?.getTracks().forEach((track) => {
      if (endedHandler) track.removeEventListener("ended", endedHandler);
      track.stop();
    });
    this.inputEndedHandler = null;
    this.inputStream = null;

    try { this.source?.disconnect(); } catch { /* Already disconnected. */ }
    this.source = null;
    this.pitchHealthUnsubscribe?.();
    this.pitchHealthUnsubscribe = null;
    await this.pitchProcessor?.dispose();
    this.pitchProcessor = null;
    this.pitchProcessorAdapterId = null;
    this.pitchFailureReason = null;
    if (this.nodes) {
      Object.values(this.nodes).forEach((node) => {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      });
    }
    this.nodes = null;
    this.impulseKey = "";
    if (this.impulseTimer) clearTimeout(this.impulseTimer);
    this.impulseTimer = null;

    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    this.status = "idle";
    this.error = null;
    this.emit();
  }

  private async createGraph(token: number) {
    if (typeof window === "undefined" || typeof AudioContext === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.status = "unsupported";
      this.error = "Le traitement audio Web n’est pas disponible dans ce navigateur.";
      this.emit();
      throw new Error(this.error);
    }

    this.status = "requesting_permission";
    this.error = null;
    this.emit();

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let pitchProcessor: PlacePitchCorrectionProcessor | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          ...roomMicrophoneConstraint(),
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48_000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (token !== this.lifecycleToken) throw new Error("Audio capture cancelled");
      context = new AudioContext({ latencyHint: "interactive" });
      if (context.state === "suspended") await context.resume();
      if (token !== this.lifecycleToken) throw new Error("Audio capture cancelled");

      const source = context.createMediaStreamSource(stream);
      const nodes: PlaceAudioNodes = {
        inputGain: context.createGain(),
        highPass: context.createBiquadFilter(),
        lowShelf: context.createBiquadFilter(),
        presence: context.createBiquadFilter(),
        compressor: context.createDynamicsCompressor(),
        compDry: context.createGain(),
        compWet: context.createGain(),
        compMakeup: context.createGain(),
        dynamicsSum: context.createGain(),
        dry: context.createGain(),
        reverbPreDelay: context.createDelay(0.2),
        reverb: context.createConvolver(),
        reverbWet: context.createGain(),
        delay: context.createDelay(2),
        delayFeedback: context.createGain(),
        delayWet: context.createGain(),
        master: context.createGain(),
        limiter: context.createDynamicsCompressor(),
        monitor: context.createGain(),
        output: context.createMediaStreamDestination(),
      };

      nodes.highPass.type = "highpass";
      nodes.lowShelf.type = "lowshelf";
      nodes.presence.type = "peaking";
      nodes.presence.frequency.value = 3_200;
      nodes.presence.Q.value = 0.85;
      nodes.compDry.gain.value = 1;
      nodes.compWet.gain.value = 0;
      nodes.dry.gain.value = 1;
      nodes.reverbWet.gain.value = 0;
      nodes.delayWet.gain.value = 0;
      nodes.delayFeedback.gain.value = 0;
      nodes.monitor.gain.value = 0;
      nodes.limiter.threshold.value = -2;
      nodes.limiter.knee.value = 0;
      nodes.limiter.ratio.value = 20;
      nodes.limiter.attack.value = 0.003;
      nodes.limiter.release.value = 0.08;

      source.connect(nodes.inputGain);
      nodes.inputGain.connect(nodes.highPass);
      nodes.highPass.connect(nodes.lowShelf);
      nodes.lowShelf.connect(nodes.presence);

      let dynamicsInput: AudioNode = nodes.presence;
      let processorAdapterId: string | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const adapter = this.pitchAdapter;
        const adapterToken = this.pitchAdapterToken;
        if (!adapter) break;
        try {
          const candidate = await adapter.create(context);
          if (token !== this.lifecycleToken) {
            await candidate.dispose();
            throw new Error("Audio capture cancelled");
          }
          if (adapterToken !== this.pitchAdapterToken || adapter.id !== this.pitchAdapter?.id) {
            await candidate.dispose();
            continue;
          }
          pitchProcessor = candidate;
          processorAdapterId = adapter.id;
          nodes.presence.connect(candidate.input);
          dynamicsInput = candidate.output;
          this.pitchFailureReason = null;
          break;
        } catch (error) {
          await pitchProcessor?.dispose();
          pitchProcessor = null;
          if (token !== this.lifecycleToken) throw error;
          this.pitchFailureReason = error instanceof Error ? error.message : String(error);
          if (adapterToken === this.pitchAdapterToken) break;
        }
      }

      dynamicsInput.connect(nodes.compDry);
      dynamicsInput.connect(nodes.compressor);
      nodes.compDry.connect(nodes.dynamicsSum);
      nodes.compressor.connect(nodes.compMakeup);
      nodes.compMakeup.connect(nodes.compWet);
      nodes.compWet.connect(nodes.dynamicsSum);

      nodes.dynamicsSum.connect(nodes.dry);
      nodes.dry.connect(nodes.master);
      nodes.dynamicsSum.connect(nodes.reverbPreDelay);
      nodes.reverbPreDelay.connect(nodes.reverb);
      nodes.reverb.connect(nodes.reverbWet);
      nodes.reverbWet.connect(nodes.master);
      nodes.dynamicsSum.connect(nodes.delay);
      nodes.delay.connect(nodes.delayWet);
      nodes.delayWet.connect(nodes.master);
      nodes.delay.connect(nodes.delayFeedback);
      nodes.delayFeedback.connect(nodes.delay);

      nodes.master.connect(nodes.limiter);
      nodes.limiter.connect(nodes.output);
      nodes.limiter.connect(nodes.monitor);
      nodes.monitor.connect(context.destination);

      this.context = context;
      this.inputStream = stream;
      this.source = source;
      this.nodes = nodes;
      this.pitchProcessor = pitchProcessor;
      this.pitchProcessorAdapterId = processorAdapterId;
      this.pitchHealthUnsubscribe = pitchProcessor?.subscribeHealth?.(this.handlePitchHealth) ?? null;
      this.inputEndedHandler = () => { void this.stop(); };
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", this.inputEndedHandler as () => void, { once: true }));
      this.applySettings();
      this.applyInputGain();
      this.status = "ready";
      this.error = null;
      this.emit();
      return nodes.output.stream;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") await context.close().catch(() => undefined);
      await pitchProcessor?.dispose();
      if (token !== this.lifecycleToken) throw error;
      this.inputStream = null;
      this.source = null;
      this.nodes = null;
      this.context = null;
      this.pitchHealthUnsubscribe?.();
      this.pitchHealthUnsubscribe = null;
      await this.pitchProcessor?.dispose();
      this.pitchProcessor = null;
      this.pitchProcessorAdapterId = null;
      this.status = "error";
      this.error = mediaErrorMessage(error);
      this.emit();
      throw error;
    }
  }

  private applySettings() {
    const context = this.context;
    const nodes = this.nodes;
    if (!context || !nodes) return;

    const eqCurves = {
      Clean: { highPass: 72, lows: 0.5, presence: 1.2 },
      Warm: { highPass: 68, lows: 2.2, presence: 0.8 },
      Rap: { highPass: 82, lows: -0.8, presence: 3.2 },
      Trap: { highPass: 88, lows: -1.2, presence: 3.8 },
      Radio: { highPass: 118, lows: -2.5, presence: 4.4 },
    } satisfies Record<PlaceVocalState["preset"], { highPass: number; lows: number; presence: number }>;
    const curve = eqCurves[this.settings.preset] ?? eqCurves.Clean;
    smooth(nodes.highPass.frequency, this.settings.eqEnabled ? curve.highPass : 20, context);
    smooth(nodes.highPass.Q, this.settings.eqEnabled ? 0.72 : 0.1, context);
    smooth(nodes.lowShelf.frequency, 180, context);
    smooth(nodes.lowShelf.gain, this.settings.eqEnabled ? curve.lows : 0, context);
    smooth(nodes.presence.gain, this.settings.eqEnabled ? curve.presence : 0, context);

    const compMix = this.settings.compEnabled ? clamp(this.settings.compAmount, 0, 1) : 0;
    smooth(nodes.compDry.gain, Math.cos(compMix * Math.PI * 0.5), context);
    smooth(nodes.compWet.gain, Math.sin(compMix * Math.PI * 0.5), context);
    smooth(nodes.compressor.threshold, clamp(this.settings.compThresholdDb, -60, 0), context);
    smooth(nodes.compressor.ratio, clamp(this.settings.compRatio, 1, 20), context);
    smooth(nodes.compressor.knee, this.settings.compEnabled ? 8 : 0, context);
    smooth(nodes.compressor.attack, clamp(this.settings.compAttackMs, 1, 1_000) / 1_000, context);
    smooth(nodes.compressor.release, clamp(this.settings.compReleaseMs, 20, 1_000) / 1_000, context);
    smooth(nodes.compMakeup.gain, this.settings.compEnabled ? dbToGain(clamp(this.settings.compMakeupDb, 0, 18)) : 1, context);

    const adapterReverb = Boolean(this.pitchProcessor && this.pitchAdapter?.handlesReverb && this.pitchProcessorAdapterId === this.pitchAdapter.id);
    const reverbAmount = this.settings.reverbEnabled && !adapterReverb ? clamp(this.settings.reverbAmount, 0, 1) : 0;
    const delayAmount = this.settings.delayEnabled ? clamp(this.settings.delayAmount ?? 0, 0, 1) : 0;
    const combinedWet = Math.min(1, Math.hypot(reverbAmount, delayAmount));
    const wetScale = combinedWet > 0 ? Math.sin(combinedWet * Math.PI * 0.5) / Math.hypot(reverbAmount, delayAmount) : 0;
    smooth(nodes.dry.gain, Math.cos(combinedWet * Math.PI * 0.5), context);
    smooth(nodes.reverbWet.gain, reverbAmount * wetScale, context);
    smooth(nodes.delayWet.gain, delayAmount * wetScale, context);
    smooth(nodes.reverbPreDelay.delayTime, clamp(this.settings.reverbPreDelayMs, 0, 180) / 1_000, context);
    smooth(nodes.delay.delayTime, clamp(this.settings.delayTimeMs ?? 280, 20, 1_500) / 1_000, context);
    smooth(nodes.delayFeedback.gain, this.settings.delayEnabled ? clamp(this.settings.delayFeedback ?? 0.24, 0, 0.82) : 0, context);

    if (this.settings.reverbEnabled && !adapterReverb) {
      const nextImpulseKey = `${this.settings.reverbType}:${clamp(this.settings.reverbDuration, 0.2, 5).toFixed(2)}`;
      if (nextImpulseKey !== this.impulseKey) {
        if (this.impulseTimer) clearTimeout(this.impulseTimer);
        const applyImpulse = () => {
          this.impulseTimer = null;
          if (this.context !== context || this.nodes !== nodes || !this.settings.reverbEnabled) return;
          nodes.reverb.buffer = createReverbImpulse(context, this.settings);
          this.impulseKey = `${this.settings.reverbType}:${clamp(this.settings.reverbDuration, 0.2, 5).toFixed(2)}`;
        };
        if (nodes.reverb.buffer) this.impulseTimer = setTimeout(applyImpulse, 90);
        else applyImpulse();
      }
    } else if (this.impulseTimer) {
      clearTimeout(this.impulseTimer);
      this.impulseTimer = null;
    }

    if (this.pitchProcessor) {
      this.pitchProcessor.update({
        tuneEnabled: this.settings.tuneEnabled,
        tuneKey: this.settings.tuneKey,
        tuneScale: this.settings.tuneScale,
        tuneAmount: this.settings.tuneAmount,
        tuneSpeed: this.settings.tuneSpeed,
        tuneHumanize: this.settings.tuneHumanize,
        tuneSmooth: this.settings.tuneSmooth,
        tuneShift: this.settings.tuneShift,
        reverbEnabled: this.settings.reverbEnabled,
        reverbAmount: this.settings.reverbAmount,
      });
    }
    this.emit();
  }

  private applyInputGain() {
    if (!this.context || !this.nodes) return;
    smooth(
      this.nodes.inputGain.gain,
      this.inputEnabled ? this.inputGain : 0,
      this.context,
      0.01,
    );
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
