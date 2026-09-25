import {
  Activity,
  CheckCircle2,
  CircleStop,
  Cpu,
  Download,
  FlaskConical,
  Gauge,
  Headphones,
  Mic2,
  Radio,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  TestTube2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VoiceCorrectionEngine,
  VoiceCorrectionEngineDiagnostics,
} from "./VoiceCorrectionEngine";
import { createOpenDawVoiceCorrectionEngine } from "./openDawVoiceCorrectionEngine";
import { createMeeWavTestVoiceCorrectionEngine } from "./meewavTestVoiceCorrectionEngine";
import {
  DEFAULT_VOICE_CORRECTION_SETTINGS,
  VOICE_CORRECTION_PRESETS,
  voiceCorrectionPreset,
} from "./voiceCorrection.presets";
import {
  OPENDAW_VOICE_CORRECTION_KEYS,
  OPENDAW_VOICE_CORRECTION_SCALES,
  VOICE_CORRECTION_PUBLIC_NAME,
  type VoiceCorrectionPresetId,
  type VoiceCorrectionSettings,
} from "./voiceCorrection.types";
import {
  runVoiceCorrectionLoopbackProof,
  startPairedVoiceCorrectionRecording,
  type VoiceCorrectionLoopbackResult,
  type VoiceCorrectionRecordingSession,
} from "./voiceCorrectionLab.media";
import {
  createVoiceCorrectionLabReport,
  resolveVoiceCorrectionComparisonRoute,
  serializeVoiceCorrectionLabReportCsv,
  serializeVoiceCorrectionLabReportJson,
  type VoiceCorrectionComparisonRoute,
} from "./voiceCorrectionLab.report";
import {
  buildVoiceCorrectionMicrophoneConstraints,
  formatLatency,
  linearAmplitudeToDb,
  meterPercentFromDb,
  readableMediaError,
  type VoiceCorrectionCaptureMode,
} from "./voiceCorrectionLab.utils";
import {
  NATIVE_VST3_VOICE_CORRECTION_PROVIDERS,
  VOICE_CORRECTION_PROVIDERS,
  nativeVst3VoiceCorrectionProvider,
  voiceCorrectionProvider,
  type NativeVst3VoiceCorrectionProviderId,
  type VoiceCorrectionProviderId,
} from "./voiceCorrection.providers";
import {
  getNativeVst3LabMonitorStatus,
  startNativeVst3LabMonitor,
  stopNativeVst3LabMonitor,
  updateNativeVst3LabMonitorControls,
  type NativeVst3LabControls,
  type NativeVst3LabMonitorSnapshot,
} from "./nativeVst3LabMonitor";
import { VoiceCorrectionAbxPanel } from "./VoiceCorrectionAbxPanel";
import "./voice-correction-lab.css";

type LabStatus = "idle" | "requesting" | "ready" | "fallback" | "error";

type MeterGraph = {
  inputSource: MediaStreamAudioSourceNode;
  inputAnalyser: AnalyserNode;
  outputSource: MediaStreamAudioSourceNode | null;
  outputAnalyser: AnalyserNode | null;
  inputValues: Float32Array<ArrayBuffer>;
  outputValues: Float32Array<ArrayBuffer> | null;
};

type DirectMonitorGraph = {
  dryStream: MediaStream;
  drySource: MediaStreamAudioSourceNode;
  dryGain: GainNode;
};

type RecordingUrls = { dry: string; processed: string; durationMs: number };

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
  bypass: false,
  monitoring: false,
  processedSignalState: "unverified",
  monitoringState: "off",
  localOutputProof: "not-run",
  fallbackActive: false,
  fallbackReason: null,
  error: null,
  resources: [],
};

const STATUS_LABELS: Record<LabStatus, string> = {
  idle: "Microphone inactif",
  requesting: "Activation…",
  ready: "Traitement actif",
  fallback: "Voix originale disponible",
  error: "Erreur",
};

function processedSignalLabel(state: VoiceCorrectionEngineDiagnostics["processedSignalState"]) {
  if (state === "waiting_for_input") return "En attente d’une voix";
  if (state === "detected") return "Signal présent · correction non prouvée";
  if (state === "silent") return "Silencieux";
  return "Non vérifié";
}

function monitoringStateLabel(state: VoiceCorrectionEngineDiagnostics["monitoringState"]) {
  if (state === "starting") return "Démarrage du bus";
  if (state === "active") return "Bus Web actif";
  if (state === "fallback") return "Bus Web actif · signal sec";
  if (state === "interrupted") return "Bus Web interrompu";
  return "Coupé";
}

function localOutputProofLabel(state: VoiceCorrectionEngineDiagnostics["localOutputProof"]) {
  if (state === "passed") return "Bus interne détecté";
  if (state === "failed") return "Bus interne non détecté";
  return "Non lancé";
}

let nativeLabMountGeneration = 0;

function audioContextConstructor() {
  return window.AudioContext;
}

function readAnalyserDb(analyser: AnalyserNode, values: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(values);
  let sum = 0;
  for (const value of values) sum += value * value;
  return linearAmplitudeToDb(Math.sqrt(sum / Math.max(1, values.length)));
}

function createMeterGraph(
  context: AudioContext,
  dryStream: MediaStream,
  processedStream: MediaStream | null,
): MeterGraph {
  const inputSource = context.createMediaStreamSource(dryStream);
  const inputAnalyser = context.createAnalyser();
  inputAnalyser.fftSize = 1024;
  inputAnalyser.smoothingTimeConstant = 0.72;
  inputSource.connect(inputAnalyser);

  let outputSource: MediaStreamAudioSourceNode | null = null;
  let outputAnalyser: AnalyserNode | null = null;
  if (processedStream?.getAudioTracks().some((track) => track.readyState === "live")) {
    outputSource = context.createMediaStreamSource(processedStream);
    outputAnalyser = context.createAnalyser();
    outputAnalyser.fftSize = 1024;
    outputAnalyser.smoothingTimeConstant = 0.72;
    outputSource.connect(outputAnalyser);
  }
  return {
    inputSource,
    inputAnalyser,
    outputSource,
    outputAnalyser,
    inputValues: new Float32Array(inputAnalyser.fftSize),
    outputValues: outputAnalyser ? new Float32Array(outputAnalyser.fftSize) : null,
  };
}

function disposeMeterGraph(graph: MeterGraph | null) {
  graph?.inputSource.disconnect();
  graph?.inputAnalyser.disconnect();
  graph?.outputSource?.disconnect();
  graph?.outputAnalyser?.disconnect();
}

function latencyFromContext(context: AudioContext | null) {
  if (!context) return { base: null, output: null };
  return {
    base: Number.isFinite(context.baseLatency) ? context.baseLatency * 1_000 : null,
    output: "outputLatency" in context && Number.isFinite(context.outputLatency)
      ? context.outputLatency * 1_000
      : null,
  };
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  return (
    <label className="voice-correction-lab__slider">
      <span><strong>{props.label}</strong><output>{props.value}{props.suffix}</output></span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        aria-label={props.label}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="voice-correction-lab__meter">
      <span><strong>{label}</strong><output>{value.toFixed(1)} dB</output></span>
      <i aria-hidden="true"><b style={{ width: `${meterPercentFromDb(value)}%` }} /></i>
    </div>
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function nativeMonitorDiagnostic(log: string, label: "capture" | "render" | "reported latency") {
  return log.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? null;
}

function nativeMonitorLevel(log: string, key: "input_peak_dbfs" | "output_peak_dbfs") {
  const telemetryLines = log.split(/\r?\n/u)
    .filter((line) => line.startsWith("MEEWAV_AUDIO_TELEMETRY"));
  const latest = telemetryLines[telemetryLines.length - 1];
  if (!latest) return null;
  const raw = latest.match(new RegExp(`(?:^|\\s)${key}=(-?\\d+(?:\\.\\d+)?)`))?.[1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function nativeMonitorLevelLabel(value: number | null) {
  if (value === null) return "En attente de signal";
  if (value <= -90) return "Aucun signal détecté";
  return `${value.toFixed(1)} dBFS`;
}

function nativeMonitorOwnsAudio(snapshot: NativeVst3LabMonitorSnapshot | null) {
  return snapshot?.status === "starting"
    || snapshot?.status === "running"
    || snapshot?.status === "stopping";
}

function nativeControls(
  settings: VoiceCorrectionSettings,
  bypassed: boolean,
): NativeVst3LabControls {
  return {
    bypassed: bypassed || !settings.enabled,
    inputGain: 1,
    key: settings.key,
    scale: settings.scale,
    amount: settings.amount,
    retune: settings.retune,
    humanize: settings.smooth,
    reverbEnabled: false,
    reverbMix: 0,
    reverbType: "room",
    reverbDuration: 1.2,
    reverbPreDelayMs: 0,
  };
}

function nativeMonitorIsReady(
  snapshot: NativeVst3LabMonitorSnapshot | null,
  available: boolean | null,
) {
  return available === true && snapshot?.status === "running" && snapshot.audioReady === true;
}

function downloadLabReport(filename: string, content: string, mediaType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mediaType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function labErrorHeading(message: string, status: LabStatus) {
  if (message.startsWith("Test WebRTC local")) return "Test WebRTC interrompu";
  if (message.startsWith("La sortie corrigée")) return "Son original restauré";
  if (status === "fallback") return "Son original restauré";
  if (message.startsWith("Enregistrement impossible")) return "Enregistrement interrompu";
  if (message.startsWith("Retour casque impossible")) return "Retour casque indisponible";
  if (message.startsWith("Comparaison impossible")) return "Comparaison indisponible";
  return "Capture audio interrompue";
}

export function VoiceCorrectionLabPage({
  engineFactory,
  engineFactories,
}: {
  engineFactory?: () => VoiceCorrectionEngine;
  engineFactories?: Partial<Record<VoiceCorrectionProviderId, () => VoiceCorrectionEngine>>;
}) {
  const [status, setStatus] = useState<LabStatus>("idle");
  const [selectedProviderId, setSelectedProviderId] = useState<VoiceCorrectionProviderId>("opendaw");
  const [activeProviderId, setActiveProviderId] = useState<VoiceCorrectionProviderId | null>(null);
  const [selectedNativeProviderId, setSelectedNativeProviderId] = useState<NativeVst3VoiceCorrectionProviderId | null>(null);
  const [nativeCommandStatus, setNativeCommandStatus] = useState<string | null>(null);
  const [nativeMonitor, setNativeMonitor] = useState<NativeVst3LabMonitorSnapshot | null>(null);
  const [nativeMonitorAvailable, setNativeMonitorAvailable] = useState<boolean | null>(null);
  const [nativeMonitorBusy, setNativeMonitorBusy] = useState(false);
  const [nativeMonitorError, setNativeMonitorError] = useState<string | null>(null);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const [providerSwitching, setProviderSwitching] = useState(false);
  const [comparisonSwitching, setComparisonSwitching] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<VoiceCorrectionCaptureMode>("music");
  const [settings, setSettings] = useState<VoiceCorrectionSettings>({
    ...DEFAULT_VOICE_CORRECTION_SETTINGS,
    enabled: true,
  });
  const [profileId, setProfileId] = useState<VoiceCorrectionPresetId | null>(null);
  const [bypass, setBypassState] = useState(false);
  const [monitoring, setMonitoringState] = useState(false);
  const [monitoringBusy, setMonitoringBusy] = useState(false);
  const [inputDb, setInputDb] = useState(-72);
  const [outputDb, setOutputDb] = useState(-72);
  const [diagnostics, setDiagnostics] = useState<VoiceCorrectionEngineDiagnostics>(INITIAL_DIAGNOSTICS);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingUrls, setRecordingUrls] = useState<RecordingUrls | null>(null);
  const [loopbackBusy, setLoopbackBusy] = useState(false);
  const [loopbackResult, setLoopbackResult] = useState<VoiceCorrectionLoopbackResult | null>(null);

  const engineRef = useRef<VoiceCorrectionEngine | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const dryStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const meterGraphRef = useRef<MeterGraph | null>(null);
  const directMonitorGraphRef = useRef<DirectMonitorGraph | null>(null);
  const monitoringRef = useRef(false);
  const monitoringOperationRef = useRef(false);
  const providerSwitchingRef = useRef(false);
  const comparisonSwitchingRef = useRef(false);
  const nativeMonitorRef = useRef<NativeVst3LabMonitorSnapshot | null>(null);
  const nativeStatusRequestGenerationRef = useRef(0);
  const nativeOperationGenerationRef = useRef(0);
  const nativeOperationBusyRef = useRef(false);
  const nativeControlUpdateRef = useRef<Promise<unknown>>(Promise.resolve());
  const meterAnimationRef = useRef<number | null>(null);
  const recordingSessionRef = useRef<VoiceCorrectionRecordingSession | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingUrlsRef = useRef<RecordingUrls | null>(null);
  const mountedRef = useRef(true);
  const activationGenerationRef = useRef(0);

  const setMonitoring = useCallback((enabled: boolean) => {
    monitoringRef.current = enabled;
    setMonitoringState(enabled);
  }, []);

  const createEngineForProvider = useCallback((providerId: VoiceCorrectionProviderId) => {
    const configuredFactory = engineFactories?.[providerId];
    if (configuredFactory) return configuredFactory();
    if (providerId === "opendaw") return (engineFactory ?? createOpenDawVoiceCorrectionEngine)();
    return createMeeWavTestVoiceCorrectionEngine();
  }, [engineFactories, engineFactory]);

  const dryAvailable = Boolean(dryStreamRef.current?.getAudioTracks().some((track) => track.readyState === "live"));
  const processedAvailable = Boolean(processedStreamRef.current?.getAudioTracks().some((track) => track.readyState === "live"));
  const correctionAvailable = processedAvailable
    && diagnostics.engineReady
    && diagnostics.inputTrackState === "live"
    && diagnostics.status !== "error"
    && !diagnostics.fallbackActive;
  const active = status === "ready" || status === "fallback";
  const busy = status === "requesting" || providerSwitching || comparisonSwitching;
  const selectedProvider = voiceCorrectionProvider(selectedProviderId);
  const activeProvider = activeProviderId ? voiceCorrectionProvider(activeProviderId) : null;
  const selectedNativeProvider = selectedNativeProviderId
    ? nativeVst3VoiceCorrectionProvider(selectedNativeProviderId)
    : null;
  const nativeMonitorActive = nativeMonitorOwnsAudio(nativeMonitor);
  const nativeMonitorReady = nativeMonitorIsReady(nativeMonitor, nativeMonitorAvailable);
  const nativeMonitorProvider = nativeMonitor?.pluginId
    ? nativeVst3VoiceCorrectionProvider(nativeMonitor.pluginId)
    : null;
  const nativeMode = Boolean(selectedNativeProvider || nativeMonitorActive);
  const requestedRoute: VoiceCorrectionComparisonRoute = bypass ? "dry" : "processed";
  const selectedRoute = nativeMode || (!dryAvailable && !processedAvailable)
    ? requestedRoute
    : resolveVoiceCorrectionComparisonRoute({
      requestedRoute,
      processedAvailable,
      diagnostics,
    });
  const nativeCaptureDevice = nativeMonitorDiagnostic(nativeMonitor?.stdoutTail ?? "", "capture");
  const nativeRenderDevice = nativeMonitorDiagnostic(nativeMonitor?.stdoutTail ?? "", "render");
  const nativeReportedLatency = nativeMonitorDiagnostic(nativeMonitor?.stdoutTail ?? "", "reported latency");
  const nativeInputPeak = nativeMonitorLevel(nativeMonitor?.stdoutTail ?? "", "input_peak_dbfs");
  const nativeOutputPeak = nativeMonitorLevel(nativeMonitor?.stdoutTail ?? "", "output_peak_dbfs");

  const commitNativeMonitor = useCallback((snapshot: NativeVst3LabMonitorSnapshot) => {
    nativeMonitorRef.current = snapshot;
    setNativeMonitor(snapshot);
    if (nativeMonitorOwnsAudio(snapshot) && snapshot.pluginId) {
      setSelectedNativeProviderId(snapshot.pluginId);
      setError(null);
    }
  }, []);

  const refreshNativeMonitor = useCallback(async () => {
    const requestGeneration = ++nativeStatusRequestGenerationRef.current;
    try {
      const snapshot = await getNativeVst3LabMonitorStatus();
      if (!mountedRef.current || nativeStatusRequestGenerationRef.current !== requestGeneration) return;
      commitNativeMonitor(snapshot);
      setNativeMonitorAvailable(true);
      if (snapshot.status === "idle" || snapshot.status === "stopped" || snapshot.status === "error") {
        setHeadphonesConfirmed(false);
      }
      if (snapshot.status === "error") {
        setNativeMonitorError(snapshot.message || snapshot.stderrTail.trim() || "Le retour natif s’est arrêté.");
      } else {
        setNativeMonitorError(null);
      }
    } catch (nativeError) {
      if (!mountedRef.current || nativeStatusRequestGenerationRef.current !== requestGeneration) return;
      if (nativeMonitorOwnsAudio(nativeMonitorRef.current)) {
        // Keep ownership information so the user can still request an explicit
        // stop, but never continue to claim that audio is actually ready.
        setNativeMonitorAvailable(false);
        setNativeMonitorError(`État du retour momentanément indisponible : ${readableMediaError(nativeError)}`);
        return;
      }
      setNativeMonitorAvailable(false);
      nativeMonitorRef.current = null;
      setNativeMonitor(null);
      setNativeMonitorError(readableMediaError(nativeError));
    }
  }, [commitNativeMonitor]);

  const copyNativeCommand = useCallback(async () => {
    if (!selectedNativeProvider) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(selectedNativeProvider.command);
      setNativeCommandStatus("Commande copiée");
    } catch {
      setNativeCommandStatus("Copie indisponible · sélectionne la commande ci-dessous");
    }
  }, [selectedNativeProvider]);

  const revokeRecordings = useCallback(() => {
    const current = recordingUrlsRef.current;
    recordingUrlsRef.current = null;
    if (current) {
      URL.revokeObjectURL(current.dry);
      URL.revokeObjectURL(current.processed);
    }
    setRecordingUrls(null);
  }, []);

  useEffect(() => () => {
    const current = recordingUrlsRef.current;
    recordingUrlsRef.current = null;
    if (current) {
      URL.revokeObjectURL(current.dry);
      URL.revokeObjectURL(current.processed);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const available = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "audioinput");
    if (!mountedRef.current) return;
    setDevices(available);
    setSelectedDeviceId((current) => current ?? available[0]?.deviceId ?? null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshDevices().catch(() => undefined);
    return () => { mountedRef.current = false; };
  }, [refreshDevices]);

  useEffect(() => {
    void refreshNativeMonitor();
  }, [refreshNativeMonitor]);

  useEffect(() => {
    if (!nativeMonitorActive || nativeMonitorBusy) return undefined;
    const timer = window.setInterval(() => { void refreshNativeMonitor(); }, 750);
    return () => window.clearInterval(timer);
  }, [nativeMonitorActive, nativeMonitorBusy, refreshNativeMonitor]);

  useEffect(() => {
    if (!nativeMonitorReady) return undefined;
    const nextControls = nativeControls(settings, bypass);
    const timer = window.setTimeout(() => {
      nativeControlUpdateRef.current = nativeControlUpdateRef.current
        .catch(() => undefined)
        .then(() => updateNativeVst3LabMonitorControls(nextControls))
        .catch((nativeError: unknown) => {
          if (mountedRef.current) {
            setNativeMonitorError(`Réglage natif impossible : ${readableMediaError(nativeError)}`);
          }
        });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [bypass, nativeMonitorReady, settings]);

  const stopMetering = useCallback(() => {
    if (meterAnimationRef.current !== null) cancelAnimationFrame(meterAnimationRef.current);
    meterAnimationRef.current = null;
    disposeMeterGraph(meterGraphRef.current);
    meterGraphRef.current = null;
    setInputDb(-72);
    setOutputDb(-72);
  }, []);

  const startMetering = useCallback((graph: MeterGraph) => {
    stopMetering();
    meterGraphRef.current = graph;
    const sample = () => {
      if (meterGraphRef.current !== graph) return;
      setInputDb(readAnalyserDb(graph.inputAnalyser, graph.inputValues));
      setOutputDb(graph.outputAnalyser && graph.outputValues
        ? readAnalyserDb(graph.outputAnalyser, graph.outputValues)
        : -72);
      meterAnimationRef.current = requestAnimationFrame(sample);
    };
    meterAnimationRef.current = requestAnimationFrame(sample);
  }, [stopMetering]);

  const stopDirectMonitoring = useCallback(() => {
    const graph = directMonitorGraphRef.current;
    directMonitorGraphRef.current = null;
    if (!graph) return;
    try { graph.dryGain.gain.value = 0; } catch { /* Context already closed. */ }
    try { graph.drySource.disconnect(); } catch { /* Already disconnected. */ }
    try { graph.dryGain.disconnect(); } catch { /* Already disconnected. */ }
  }, []);

  const updateDiagnostics = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      const graph = directMonitorGraphRef.current;
      const dryTrack = dryStreamRef.current?.getAudioTracks()[0] ?? null;
      const dryTrackIsLive = dryTrack?.readyState === "live";
      const contextIsRunning = contextRef.current?.state === "running";
      const directMonitorAudible = Boolean(
        monitoringRef.current
        && graph
        && graph.dryStream === dryStreamRef.current
        && dryTrackIsLive
        && contextIsRunning,
      );
      setDiagnostics({
        ...INITIAL_DIAGNOSTICS,
        crossOriginIsolated: window.crossOriginIsolated,
        status: dryTrackIsLive ? "fallback" : "idle",
        inputTrackState: dryTrack?.readyState ?? null,
        monitoring: directMonitorAudible,
        monitoringState: directMonitorAudible ? "fallback" : "off",
        processedSignalState: dryTrackIsLive ? "silent" : "unverified",
        fallbackActive: dryTrackIsLive,
      });
      if (monitoringRef.current && (!graph || !dryTrackIsLive || !contextIsRunning)) {
        stopDirectMonitoring();
        setMonitoring(false);
      }
      return;
    }
    const next = engine.getDiagnostics();
    setDiagnostics(next);
    if (next.status === "error" || next.inputTrackState === "ended") setStatus("error");
    else if (next.fallbackActive || next.status === "fallback") setStatus("fallback");
    else if (next.engineReady && next.outputTrackState === "live") setStatus("ready");
    if (next.error) setError(next.error);
    const engineMonitorAudible = next.monitoring
      && next.inputTrackState === "live"
      && next.outputTrackState === "live"
      && contextRef.current?.state === "running";
    if (
      monitoringRef.current
      && !providerSwitchingRef.current
      && !monitoringOperationRef.current
      && !directMonitorGraphRef.current
      && !engineMonitorAudible
    ) {
      void engine.setMonitoring(false).catch(() => undefined);
      setMonitoring(false);
    }
  }, [setMonitoring, stopDirectMonitoring]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(updateDiagnostics, 500);
    return () => clearInterval(timer);
  }, [active, updateDiagnostics]);

  useEffect(() => {
    if (!monitoring) return undefined;
    const context = contextRef.current;
    if (!context) return undefined;
    const handleStateChange = () => {
      if (
        !monitoringRef.current
        || monitoringOperationRef.current
        || providerSwitchingRef.current
        || context.state === "running"
      ) return;
      stopDirectMonitoring();
      void engineRef.current?.setMonitoring(false).catch(() => undefined);
      setMonitoring(false);
      setError("Retour casque impossible : la sortie audio du navigateur s’est interrompue.");
    };
    context.addEventListener("statechange", handleStateChange);
    return () => context.removeEventListener("statechange", handleStateChange);
  }, [monitoring, setMonitoring, stopDirectMonitoring]);

  const setDirectMonitoring = useCallback(async (
    enabled: boolean,
    route: VoiceCorrectionComparisonRoute = "dry",
  ) => {
    if (!enabled) {
      stopDirectMonitoring();
      return;
    }
    if (route !== "dry") {
      throw new Error("Le retour direct de secours ne peut diffuser que la piste originale.");
    }
    const context = contextRef.current;
    const dryStream = dryStreamRef.current;
    if (!context || !dryStream?.getAudioTracks().some((track) => track.readyState === "live")) {
      throw new Error("La piste microphone originale n’est pas disponible.");
    }
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      throw new Error("La sortie audio du navigateur n’est pas active.");
    }
    let graph = directMonitorGraphRef.current;
    if (graph?.dryStream !== dryStream) {
      stopDirectMonitoring();
      graph = null;
    }
    if (!graph) {
      const drySource = context.createMediaStreamSource(dryStream);
      const dryGain = context.createGain();
      dryGain.gain.setValueAtTime(0, context.currentTime);
      drySource.connect(dryGain);
      dryGain.connect(context.destination);
      graph = {
        dryStream,
        drySource,
        dryGain,
      };
      directMonitorGraphRef.current = graph;
    }
    graph.dryGain.gain.setValueAtTime(1, context.currentTime);
  }, [stopDirectMonitoring]);

  const enableWebMonitoring = useCallback(async (
    engine: VoiceCorrectionEngine | null,
    route: VoiceCorrectionComparisonRoute,
    streamOverride: MediaStream | null = null,
  ) => {
    const context = contextRef.current;
    if (!context) throw new Error("Le contexte audio n’est pas disponible.");
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") throw new Error("La sortie audio du navigateur n’est pas active.");

    if (!engine) {
      if (route !== "dry") throw new Error("La piste corrigée n’est pas disponible.");
      // This graph exists only when no engine owns an output bus (for example
      // after an initialization failure). With an engine, dry and corrected
      // monitoring always use that engine's single final headphone bus.
      await setDirectMonitoring(true, "dry");
      return;
    }

    const processedStream = streamOverride ?? processedStreamRef.current;
    if (route === "processed" && !processedStream?.getAudioTracks().some((track) => track.readyState === "live")) {
      throw new Error("La piste corrigée n’est pas disponible.");
    }
    stopDirectMonitoring();
    await engine.setBypass(route === "dry");
    await engine.setMonitoring(true);
  }, [setDirectMonitoring, stopDirectMonitoring]);

  const reset = useCallback(async (options: {
    preserveConfiguration?: boolean;
    preserveProviderSwitching?: boolean;
  } = {}) => {
    activationGenerationRef.current += 1;
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    if (recordingSessionRef.current) {
      await recordingSessionRef.current.stop().catch(() => undefined);
      recordingSessionRef.current = null;
    }
    setRecording(false);
    setMonitoring(false);
    monitoringOperationRef.current = false;
    setMonitoringBusy(false);
    comparisonSwitchingRef.current = false;
    setComparisonSwitching(false);
    stopDirectMonitoring();
    stopMetering();
    const engine = engineRef.current;
    engineRef.current = null;
    setActiveProviderId(null);
    if (engine) await engine.dispose().catch(() => undefined);
    stopStream(dryStreamRef.current);
    dryStreamRef.current = null;
    processedStreamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    revokeRecordings();
    setLoopbackResult(null);
    if (!options.preserveConfiguration) {
      setSettings({ ...DEFAULT_VOICE_CORRECTION_SETTINGS, enabled: true });
      setProfileId(null);
      setBypassState(false);
      setCaptureMode("music");
    }
    setStatus("idle");
    if (!options.preserveProviderSwitching) {
      providerSwitchingRef.current = false;
      setProviderSwitching(false);
    }
    setError(null);
    setDiagnostics({ ...INITIAL_DIAGNOSTICS, crossOriginIsolated: window.crossOriginIsolated });
  }, [revokeRecordings, setMonitoring, stopDirectMonitoring, stopMetering]);

  useEffect(() => () => {
    void reset();
  }, [reset]);

  const activateMicrophone = useCallback(async (
    requestedDeviceId = selectedDeviceId,
    requestedCaptureMode = captureMode,
    requestedMonitoring = monitoringRef.current,
  ) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Ce navigateur ne donne pas accès au microphone.");
      setStatus("error");
      return;
    }
    setStatus("requesting");
    setError(null);
    setLoopbackResult(null);
    const previousStream = dryStreamRef.current;
    const generation = ++activationGenerationRef.current;
    const isCurrentActivation = () => mountedRef.current
      && activationGenerationRef.current === generation;
    let nextStream: MediaStream | null = null;
    let nextEngine: VoiceCorrectionEngine | null = null;
    let nextContext: AudioContext | null = null;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia(
        buildVoiceCorrectionMicrophoneConstraints(requestedDeviceId, requestedCaptureMode),
      );
      if (!isCurrentActivation()) {
        stopStream(nextStream);
        return;
      }
      const currentEngine = engineRef.current;
      const currentContext = contextRef.current;
      if (
        currentEngine
        && currentContext
        && activeProviderId === selectedProviderId
        && currentEngine.getDiagnostics().engineReady
      ) {
        await currentContext.resume();
        if (!isCurrentActivation()) {
          stopStream(nextStream);
          return;
        }
        await currentEngine.connectInput(nextStream);
        if (!isCurrentActivation()) {
          stopStream(nextStream);
          return;
        }
        const processedStream = currentEngine.getProcessedStream();
        if (!processedStream?.getAudioTracks().length) throw new Error("Le moteur n’a produit aucune piste audio corrigée.");
        dryStreamRef.current = nextStream;
        processedStreamRef.current = processedStream;
        startMetering(createMeterGraph(currentContext, nextStream, processedStream));
        stopDirectMonitoring();
        stopStream(previousStream);
        if (requestedMonitoring) {
          try {
            await enableWebMonitoring(currentEngine, bypass ? "dry" : "processed");
            setMonitoring(true);
          } catch (monitorError) {
            setMonitoring(false);
            setError(`Retour casque impossible : ${readableMediaError(monitorError)}`);
          }
        }
        setDiagnostics(currentEngine.getDiagnostics());
        setStatus("ready");
        await refreshDevices();
        return;
      }
      const AudioContextClass = audioContextConstructor();
      // Let the browser open the hardware-native rate, as the proven La Place
      // graph does. The microphone still requests 48 kHz ideally, while the
      // AudioContext avoids failing on devices locked to another rate.
      nextContext = new AudioContextClass({ latencyHint: "interactive" });
      await nextContext.resume();
      nextEngine = createEngineForProvider(selectedProviderId);
      await nextEngine.initialize({ audioContext: nextContext });
      if (!isCurrentActivation()) {
        await nextEngine.dispose().catch(() => undefined);
        stopStream(nextStream);
        if (nextContext.state !== "closed") await nextContext.close().catch(() => undefined);
        return;
      }
      await nextEngine.updateSettings(settings);
      await nextEngine.setBypass(bypass);
      await nextEngine.connectInput(nextStream);
      if (!isCurrentActivation()) {
        await nextEngine.dispose().catch(() => undefined);
        stopStream(nextStream);
        if (nextContext.state !== "closed") await nextContext.close().catch(() => undefined);
        return;
      }
      const processedStream = nextEngine.getProcessedStream();
      if (!processedStream?.getAudioTracks().length) throw new Error("Le moteur n’a produit aucune piste audio corrigée.");

      const previousEngine = engineRef.current;
      const previousContext = contextRef.current;
      engineRef.current = nextEngine;
      setActiveProviderId(selectedProviderId);
      contextRef.current = nextContext;
      dryStreamRef.current = nextStream;
      processedStreamRef.current = processedStream;
      startMetering(createMeterGraph(nextContext, nextStream, processedStream));
      stopDirectMonitoring();
      stopStream(previousStream);
      if (previousEngine && previousEngine !== nextEngine) await previousEngine.dispose().catch(() => undefined);
      if (previousContext && previousContext !== nextContext && previousContext.state !== "closed") {
        await previousContext.close().catch(() => undefined);
      }
      if (requestedMonitoring) {
        try {
          await enableWebMonitoring(nextEngine, bypass ? "dry" : "processed");
          setMonitoring(true);
        } catch (monitorError) {
          setMonitoring(false);
          setError(`Retour casque impossible : ${readableMediaError(monitorError)}`);
        }
      }
      setDiagnostics(nextEngine.getDiagnostics());
      setStatus("ready");
      await refreshDevices();
    } catch (activationError) {
      if (!isCurrentActivation()) {
        if (nextEngine && engineRef.current !== nextEngine) await nextEngine.dispose().catch(() => undefined);
        if (nextStream && dryStreamRef.current !== nextStream) stopStream(nextStream);
        if (nextContext && contextRef.current !== nextContext && nextContext.state !== "closed") {
          await nextContext.close().catch(() => undefined);
        }
        return;
      }
      const message = readableMediaError(activationError);
      if (nextEngine && engineRef.current !== nextEngine) await nextEngine.dispose().catch(() => undefined);
      const nextDryTrackIsLive = nextStream?.getAudioTracks().some((track) => track.readyState === "live") === true;
      const previousDryTrackIsLive = previousStream?.getAudioTracks().some((track) => track.readyState === "live") === true;
      const dryFallbackActive = nextDryTrackIsLive || previousDryTrackIsLive;
      if (nextDryTrackIsLive && nextStream && nextContext) {
        const previousEngine = engineRef.current;
        const previousContext = contextRef.current;
        engineRef.current = null;
        contextRef.current = nextContext;
        dryStreamRef.current = nextStream;
        processedStreamRef.current = null;
        startMetering(createMeterGraph(nextContext, nextStream, null));
        stopDirectMonitoring();
        stopStream(previousStream);
        if (previousEngine) await previousEngine.dispose().catch(() => undefined);
        if (previousContext && previousContext !== nextContext && previousContext.state !== "closed") {
          await previousContext.close().catch(() => undefined);
        }
        setStatus("fallback");
      } else if (previousDryTrackIsLive) {
        if (nextContext && nextContext.state !== "closed") await nextContext.close().catch(() => undefined);
        if (nextStream) stopStream(nextStream);
        setStatus("fallback");
      } else {
        if (nextContext && nextContext.state !== "closed") await nextContext.close().catch(() => undefined);
        if (nextStream) stopStream(nextStream);
        setStatus("error");
      }
      setError(message);
      setDiagnostics({
        ...(nextEngine?.getDiagnostics() ?? INITIAL_DIAGNOSTICS),
        crossOriginIsolated: window.crossOriginIsolated,
        status: dryFallbackActive ? "fallback" : "error",
        inputTrackState: dryFallbackActive ? "live" : null,
        fallbackActive: dryFallbackActive,
        fallbackReason: message,
        error: message,
      });
      if (requestedMonitoring && dryFallbackActive) {
        try {
          const fallbackEngine = engineRef.current;
          if (fallbackEngine) {
            setBypassState(true);
            await enableWebMonitoring(fallbackEngine, "dry");
          } else {
            await setDirectMonitoring(true, "dry");
          }
          setMonitoring(true);
        } catch (monitorError) {
          stopDirectMonitoring();
          setMonitoring(false);
          setError(`Retour casque impossible : ${readableMediaError(monitorError)}`);
        }
      } else if (!dryFallbackActive) {
        setMonitoring(false);
      }
    }
  }, [activeProviderId, bypass, captureMode, createEngineForProvider, enableWebMonitoring, refreshDevices, selectedDeviceId, selectedProviderId, setDirectMonitoring, setMonitoring, settings, startMetering, stopDirectMonitoring]);

  const selectProvider = useCallback(async (nextProviderId: VoiceCorrectionProviderId) => {
    if (
      nextProviderId === selectedProviderId
      || providerSwitchingRef.current
      || comparisonSwitchingRef.current
      || monitoringOperationRef.current
      || recording
    ) return;
    const dryStream = dryStreamRef.current;
    const context = contextRef.current;
    const previousEngine = engineRef.current;
    const previousProviderId = activeProviderId ?? selectedProviderId;
    revokeRecordings();
    setLoopbackResult(null);

    if (!active || !dryStream || !context || !previousEngine) {
      setSelectedProviderId(nextProviderId);
      setActiveProviderId(null);
      setError(null);
      return;
    }

    const generation = ++activationGenerationRef.current;
    let nextEngine: VoiceCorrectionEngine | null = null;
    const shouldRestoreMonitoring = monitoringRef.current;
    providerSwitchingRef.current = true;
    setProviderSwitching(true);
    setStatus("requesting");
    setError(null);
    try {
      if (shouldRestoreMonitoring) await previousEngine.setMonitoring(false);
      nextEngine = createEngineForProvider(nextProviderId);
      await nextEngine.initialize({ audioContext: context });
      await nextEngine.updateSettings(settings);
      await nextEngine.setBypass(bypass);
      await nextEngine.connectInput(dryStream);
      const nextProcessedStream = nextEngine.getProcessedStream();
      const nextProcessedTrack = nextProcessedStream?.getAudioTracks().find((track) => track.readyState === "live");
      if (!nextProcessedStream || !nextProcessedTrack) {
        throw new Error("Le nouveau moteur n’a produit aucune piste audio active.");
      }
      if (shouldRestoreMonitoring && monitoringRef.current) {
        await enableWebMonitoring(nextEngine, bypass ? "dry" : "processed", nextProcessedStream);
      }
      if (!mountedRef.current || activationGenerationRef.current !== generation) {
        await nextEngine.dispose().catch(() => undefined);
        return;
      }

      engineRef.current = nextEngine;
      processedStreamRef.current = nextProcessedStream;
      setSelectedProviderId(nextProviderId);
      setActiveProviderId(nextProviderId);
      startMetering(createMeterGraph(context, dryStream, nextProcessedStream));
      const nextDiagnostics = nextEngine.getDiagnostics();
      setDiagnostics(nextDiagnostics);
      setStatus(nextDiagnostics.fallbackActive ? "fallback" : "ready");
      await previousEngine.dispose().catch(() => undefined);
    } catch (switchError) {
      if (nextEngine && engineRef.current !== nextEngine) await nextEngine.dispose().catch(() => undefined);
      if (shouldRestoreMonitoring && monitoringRef.current) {
        try {
          await enableWebMonitoring(previousEngine, bypass ? "dry" : "processed");
        } catch {
          setMonitoring(false);
        }
      }
      setSelectedProviderId(previousProviderId);
      setActiveProviderId(previousProviderId);
      const previousDiagnostics = previousEngine.getDiagnostics();
      setDiagnostics(previousDiagnostics);
      setStatus(previousDiagnostics.fallbackActive ? "fallback" : "ready");
      setError(`Changement de moteur impossible : ${readableMediaError(switchError)}`);
    } finally {
      providerSwitchingRef.current = false;
      if (mountedRef.current && activationGenerationRef.current === generation) setProviderSwitching(false);
    }
  }, [active, activeProviderId, bypass, createEngineForProvider, enableWebMonitoring, recording, revokeRecordings, selectedProviderId, setMonitoring, settings, startMetering]);

  const selectNativeProvider = useCallback(async (
    nextProviderId: NativeVst3VoiceCorrectionProviderId,
  ) => {
    if (
      nextProviderId === selectedNativeProviderId
      || providerSwitchingRef.current
      || comparisonSwitchingRef.current
      || monitoringOperationRef.current
      || nativeOperationBusyRef.current
      || nativeMonitorOwnsAudio(nativeMonitorRef.current)
      || recording
    ) return;

    providerSwitchingRef.current = true;
    setProviderSwitching(true);
    setError(null);
    try {
      const webAudioExists = Boolean(
        engineRef.current
        || contextRef.current
        || dryStreamRef.current
        || directMonitorGraphRef.current,
      );
      if (webAudioExists) {
        // Do not enter nativeMode until the Web graph and its microphone have
        // genuinely been released. The native UI must never mask an audible
        // Web engine that is still running underneath it.
        await reset({
          preserveConfiguration: true,
          preserveProviderSwitching: true,
        });
      }
      if (!mountedRef.current) return;
      setSelectedNativeProviderId(nextProviderId);
      setNativeCommandStatus(null);
      setNativeMonitorError(null);
      setHeadphonesConfirmed(false);
    } finally {
      providerSwitchingRef.current = false;
      if (mountedRef.current) setProviderSwitching(false);
    }
  }, [recording, reset, selectedNativeProviderId]);

  const updateSettings = useCallback((next: VoiceCorrectionSettings, nextProfileId: VoiceCorrectionPresetId | null = null) => {
    setSettings(next);
    setProfileId(nextProfileId);
    const engine = engineRef.current;
    if (!engine) return;
    void engine.updateSettings(next).then(updateDiagnostics).catch((settingsError: unknown) => {
      setError(readableMediaError(settingsError));
    });
  }, [updateDiagnostics]);

  const changeSetting = useCallback(<Key extends keyof VoiceCorrectionSettings,>(
    key: Key,
    value: VoiceCorrectionSettings[Key],
  ) => updateSettings({ ...settings, [key]: value }), [settings, updateSettings]);

  const applyProfile = useCallback((id: VoiceCorrectionPresetId) => {
    const profile = voiceCorrectionPreset(id);
    updateSettings({ ...profile, key: settings.key, scale: settings.scale }, id);
  }, [settings.key, settings.scale, updateSettings]);

  const selectComparisonRoute = useCallback(async (route: VoiceCorrectionComparisonRoute) => {
    if (
      comparisonSwitchingRef.current
      || providerSwitchingRef.current
      || monitoringOperationRef.current
    ) return false;
    const nextBypass = route === "dry";
    if (nativeMode) {
      setBypassState(nextBypass);
      setNativeMonitorError(null);
      return true;
    }
    if (route === "processed" && !correctionAvailable) {
      setError("La voix corrigée n’est pas disponible. La sortie sèche reste sélectionnée.");
      return false;
    }
    if (nextBypass === bypass) return true;
    const previousBypass = bypass;
    const engine = engineRef.current;
    comparisonSwitchingRef.current = true;
    setComparisonSwitching(true);
    setBypassState(nextBypass);
    try {
      await engine?.setBypass(nextBypass);
      if (monitoringRef.current) await enableWebMonitoring(engine, route);
      setError(null);
      updateDiagnostics();
      return true;
    } catch (routeError) {
      setBypassState(previousBypass);
      try {
        await engine?.setBypass(previousBypass);
        if (monitoringRef.current) {
          await enableWebMonitoring(engine, previousBypass ? "dry" : "processed");
        }
      } catch {
        stopDirectMonitoring();
        await engine?.setMonitoring(false).catch(() => undefined);
        setMonitoring(false);
      }
      setError(`Comparaison impossible : ${readableMediaError(routeError)}`);
      return false;
    } finally {
      comparisonSwitchingRef.current = false;
      if (mountedRef.current) setComparisonSwitching(false);
    }
  }, [bypass, correctionAvailable, enableWebMonitoring, nativeMode, setMonitoring, stopDirectMonitoring, updateDiagnostics]);

  const toggleMonitoring = useCallback(async () => {
    if (
      monitoringOperationRef.current
      || providerSwitchingRef.current
      || comparisonSwitchingRef.current
      || nativeMonitorOwnsAudio(nativeMonitorRef.current)
    ) return;
    const engine = engineRef.current;
    const next = !monitoringRef.current;
    monitoringOperationRef.current = true;
    setMonitoringBusy(true);
    try {
      if (next) {
        const dryTrackIsLive = dryStreamRef.current?.getAudioTracks()
          .some((track) => track.readyState === "live") === true;
        if (!dryTrackIsLive) {
          // The listening action is sufficient on its own. Users should not
          // have to discover and press a separate microphone button first.
          await activateMicrophone(selectedDeviceId, captureMode, true);
          return;
        }
        await enableWebMonitoring(engine, selectedRoute);
      } else {
        stopDirectMonitoring();
        await engine?.setMonitoring(false);
      }
      setMonitoring(next);
      setError(null);
      updateDiagnostics();
    } catch (monitorError) {
      if (next) {
        stopDirectMonitoring();
        await engine?.setMonitoring(false).catch(() => undefined);
        setMonitoring(false);
      } else {
        // A failed shutdown must never leave a visual "active" state backed by
        // an already-disconnected dry graph.
        setMonitoring(false);
      }
      setError(`Retour casque impossible : ${readableMediaError(monitorError)}`);
    } finally {
      monitoringOperationRef.current = false;
      if (mountedRef.current) setMonitoringBusy(false);
    }
  }, [activateMicrophone, captureMode, enableWebMonitoring, selectedDeviceId, selectedRoute, setDirectMonitoring, setMonitoring, stopDirectMonitoring, updateDiagnostics]);

  const stopNativeMonitoring = useCallback(async () => {
    if (nativeOperationBusyRef.current) return false;
    nativeOperationBusyRef.current = true;
    const operationGeneration = ++nativeOperationGenerationRef.current;
    nativeStatusRequestGenerationRef.current += 1;
    setNativeMonitorBusy(true);
    setNativeMonitorError(null);
    try {
      const snapshot = await stopNativeVst3LabMonitor();
      if (mountedRef.current && nativeOperationGenerationRef.current === operationGeneration) {
        commitNativeMonitor(snapshot);
        setNativeMonitorAvailable(true);
        setHeadphonesConfirmed(false);
      }
      return true;
    } catch (nativeError) {
      if (mountedRef.current) setNativeMonitorError(readableMediaError(nativeError));
      return false;
    } finally {
      if (nativeOperationGenerationRef.current === operationGeneration) {
        nativeOperationBusyRef.current = false;
        if (mountedRef.current) setNativeMonitorBusy(false);
      }
    }
  }, [commitNativeMonitor]);

  const startNativeMonitoring = useCallback(async () => {
    if (!selectedNativeProvider || !headphonesConfirmed || nativeOperationBusyRef.current) return;
    nativeOperationBusyRef.current = true;
    const operationGeneration = ++nativeOperationGenerationRef.current;
    nativeStatusRequestGenerationRef.current += 1;
    const hadWebCapture = dryStreamRef.current?.getAudioTracks().some((track) => track.readyState === "live") === true;
    const restoreWebMonitoring = monitoringRef.current;
    const rollbackDeviceId = selectedDeviceId;
    const rollbackCaptureMode = captureMode;
    let releasedWebAudio = false;
    setNativeMonitorBusy(true);
    setNativeMonitorError(null);
    try {
      // WASAPI must own a single capture/monitoring route during this proof.
      // Release the browser graph first to prevent feedback, doubling and a
      // microphone-device conflict with the native host.
      if (active || monitoringRef.current || dryStreamRef.current) {
        await reset({ preserveConfiguration: true });
        releasedWebAudio = true;
      }
      if (!mountedRef.current || nativeOperationGenerationRef.current !== operationGeneration) return;
      const snapshot = await startNativeVst3LabMonitor(
        selectedNativeProvider.id,
        nativeControls(settings, bypass),
      );
      if (!mountedRef.current || nativeOperationGenerationRef.current !== operationGeneration) {
        await stopNativeVst3LabMonitor().catch(() => undefined);
        return;
      }
      commitNativeMonitor(snapshot);
      setNativeMonitorAvailable(true);
    } catch (nativeError) {
      if (mountedRef.current && nativeOperationGenerationRef.current === operationGeneration) {
        const nativeMessage = readableMediaError(nativeError);
        setNativeMonitorAvailable(true);
        setNativeMonitorError(nativeMessage);
        if (releasedWebAudio && hadWebCapture) {
          setSelectedNativeProviderId(null);
          setMonitoring(restoreWebMonitoring);
          await activateMicrophone(rollbackDeviceId, rollbackCaptureMode, restoreWebMonitoring);
          if (mountedRef.current && nativeOperationGenerationRef.current === operationGeneration) {
            setError(`Retour natif impossible : ${nativeMessage} Le moteur Web a été restauré.`);
          }
        }
      }
    } finally {
      if (nativeOperationGenerationRef.current === operationGeneration) {
        nativeOperationBusyRef.current = false;
        if (mountedRef.current) setNativeMonitorBusy(false);
      }
    }
  }, [activateMicrophone, active, bypass, captureMode, commitNativeMonitor, headphonesConfirmed, reset, selectedDeviceId, selectedNativeProvider, setMonitoring, settings]);

  const resetEverything = useCallback(async () => {
    await reset();
    const stopped = nativeMonitorActive ? await stopNativeMonitoring() : true;
    if (stopped && mountedRef.current) {
      setSelectedNativeProviderId(null);
      setNativeMonitorError(null);
      setHeadphonesConfirmed(false);
    }
  }, [nativeMonitorActive, reset, stopNativeMonitoring]);

  useEffect(() => {
    const generation = ++nativeLabMountGeneration;
    return () => {
      nativeOperationGenerationRef.current += 1;
      nativeStatusRequestGenerationRef.current += 1;
      nativeOperationBusyRef.current = false;
      window.setTimeout(() => {
        if (nativeLabMountGeneration === generation) {
          void stopNativeVst3LabMonitor().catch(() => undefined);
        }
      }, 0);
    };
  }, []);

  const finishRecording = useCallback(async () => {
    const session = recordingSessionRef.current;
    if (!session) return;
    recordingSessionRef.current = null;
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    try {
      const result = await session.stop();
      revokeRecordings();
      const nextUrls = {
        dry: URL.createObjectURL(result.dry),
        processed: URL.createObjectURL(result.processed),
        durationMs: result.durationMs,
      };
      recordingUrlsRef.current = nextUrls;
      setRecordingUrls(nextUrls);
    } catch (recordError) {
      setError(`Enregistrement impossible : ${readableMediaError(recordError)}`);
    } finally {
      setRecording(false);
    }
  }, [revokeRecordings]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      await finishRecording();
      return;
    }
    const dry = dryStreamRef.current;
    const processed = processedStreamRef.current;
    if (!dry || !processed) return;
    try {
      if (selectedRoute !== "processed") {
        const selected = await selectComparisonRoute("processed");
        if (!selected) return;
      }
      revokeRecordings();
      recordingSessionRef.current = startPairedVoiceCorrectionRecording({
        dryStream: dry,
        processedStream: processed,
        maximumDurationMs: 8_000,
      });
      setRecording(true);
      recordingTimerRef.current = setTimeout(() => { void finishRecording(); }, 8_050);
    } catch (recordError) {
      setError(readableMediaError(recordError));
    }
  }, [finishRecording, recording, revokeRecordings, selectComparisonRoute, selectedRoute]);

  const runLoopback = useCallback(async () => {
    const dry = dryStreamRef.current;
    const processed = processedStreamRef.current;
    if (!dry || !processed) return;
    setLoopbackBusy(true);
    setLoopbackResult(null);
    setError(null);
    try {
      setLoopbackResult(await runVoiceCorrectionLoopbackProof({ dryStream: dry, processedStream: processed }));
    } catch (loopbackError) {
      setError(`Test WebRTC local : ${readableMediaError(loopbackError)}`);
    } finally {
      setLoopbackBusy(false);
    }
  }, []);

  const exportLabReport = useCallback((format: "json" | "csv") => {
    const engineDiagnostics = engineRef.current?.getDiagnostics() ?? diagnostics;
    const report = createVoiceCorrectionLabReport({
      engineProvider: activeProviderId ?? selectedProviderId,
      labStatus: status,
      selectedRoute,
      activeProfile: profileId,
      captureMode,
      uiError: error,
      settings,
      inputDb,
      outputDb,
      recordingDurationMs: recordingUrls?.durationMs ?? null,
      loopback: loopbackResult,
      diagnostics: engineDiagnostics,
    });
    const suffix = report.generatedAt.replace(/:/g, "-").replace(".000Z", "Z");
    if (format === "json") {
      downloadLabReport(`meewav-autotune-${suffix}.json`, serializeVoiceCorrectionLabReportJson(report), "application/json");
      return;
    }
    downloadLabReport(`meewav-autotune-${suffix}.csv`, serializeVoiceCorrectionLabReportCsv(report), "text/csv");
  }, [activeProviderId, captureMode, diagnostics, error, inputDb, loopbackResult, outputDb, profileId, recordingUrls?.durationMs, selectedProviderId, selectedRoute, settings, status]);

  const latency = latencyFromContext(contextRef.current);

  return (
    <main className="voice-correction-lab">
      <header className="voice-correction-lab__hero">
        <span className="voice-correction-lab__hero-icon"><TestTube2 aria-hidden="true" /></span>
        <div>
          <small>LABORATOIRE INTERNE · NON DÉPLOYÉ</small>
          <h1>{VOICE_CORRECTION_PUBLIC_NAME}</h1>
          <p>Compare la voix originale et la voix traitée localement avant tout branchement public.</p>
        </div>
        <strong data-status={nativeMonitorReady ? "ready" : status}>
          <i />{nativeMonitorReady
            ? `${nativeMonitorProvider?.shortLabel ?? "VST3"} · retour actif`
            : STATUS_LABELS[status]}
        </strong>
      </header>

      {!window.crossOriginIsolated && selectedProviderId === "opendaw" && !nativeMode ? (
        <div className="voice-correction-lab__notice is-warning" role="alert">
          <ShieldAlert aria-hidden="true" />
          <span><strong>Isolation navigateur manquante</strong>Ouvre ce laboratoire avec <code>npm run dev:audio-lab</code> pour charger l’AudioWorklet et les modules WASM.</span>
        </div>
      ) : null}
      {error ? <div className="voice-correction-lab__notice is-error" role="alert"><ShieldAlert aria-hidden="true" /><span><strong>{labErrorHeading(error, status)}</strong>{error}</span></div> : null}

      <section className="voice-correction-lab__toolbar" aria-label="Activation du laboratoire">
        <button type="button" className="is-primary" onClick={() => { void activateMicrophone(); }} disabled={busy || nativeMonitorBusy || nativeMode}>
          <Mic2 aria-hidden="true" />{active ? "Réactiver le microphone" : "Activer le microphone"}
        </button>
        <button type="button" onClick={() => { void resetEverything(); }} disabled={busy || nativeMonitorBusy || (status === "idle" && !nativeMonitorActive && !selectedNativeProvider && !nativeMonitorError)}>
          <RotateCcw aria-hidden="true" />Réinitialiser complètement
        </button>
      </section>

      <div className="voice-correction-lab__layout">
        <section className="voice-correction-lab__column">
          <article className="voice-correction-lab__panel">
            <header><span><Mic2 aria-hidden="true" /><strong>Entrée</strong></span><em>{dryStreamRef.current ? "Piste sèche conservée" : "En attente"}</em></header>
            <div className="voice-correction-lab__panel-body">
              <label className="voice-correction-lab__field">
                <span>Microphone</span>
                <select
                  value={selectedDeviceId ?? ""}
                  onChange={(event) => {
                    const nextId = event.target.value || null;
                    setSelectedDeviceId(nextId);
                    if (active) void activateMicrophone(nextId);
                  }}
                  disabled={busy || nativeMonitorBusy || nativeMode}
                >
                  {!devices.length ? <option value="">Microphone par défaut</option> : null}
                  {devices.map((device, index) => (
                    <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="voice-correction-lab__segmented">
                <legend>Traitements du navigateur</legend>
                <button type="button" disabled={busy || nativeMonitorBusy || nativeMode} className={captureMode === "music" ? "is-active" : ""} onClick={() => { setCaptureMode("music"); if (active) void activateMicrophone(selectedDeviceId, "music"); }}>Désactivés · musique</button>
                <button type="button" disabled={busy || nativeMonitorBusy || nativeMode} className={captureMode === "browser-assisted" ? "is-active" : ""} onClick={() => { setCaptureMode("browser-assisted"); if (active) void activateMicrophone(selectedDeviceId, "browser-assisted"); }}>Activés · diagnostic</button>
              </fieldset>
              <p className="voice-correction-lab__helper">Mono · 48 kHz demandé · aucun son envoyé au serveur par ce laboratoire.</p>
              <div className="voice-correction-lab__meters">
                <Meter label="Entrée originale" value={inputDb} />
                <Meter label="Sortie corrigée" value={outputDb} />
              </div>
            </div>
          </article>

          <article className="voice-correction-lab__panel">
            <header><span><SlidersHorizontal aria-hidden="true" /><strong>Autotune</strong></span><em>{providerSwitching
              ? "Changement de moteur…"
              : `${selectedNativeProvider?.shortLabel ?? activeProvider?.shortLabel ?? selectedProvider.shortLabel} · ${selectedNativeProvider ? "moteur natif" : selectedRoute === "dry" ? "sortie sèche" : "sortie corrigée"}`}</em></header>
            <div className="voice-correction-lab__panel-body">
              <fieldset className="voice-correction-lab__engine-picker">
                <legend>Choix du moteur Autotune</legend>
                {VOICE_CORRECTION_PROVIDERS.map((provider) => {
                  const selected = !selectedNativeProviderId && provider.id === selectedProviderId;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={selected ? "is-active" : ""}
                      aria-label={`Choisir ${provider.label}`}
                      aria-pressed={selected}
                      disabled={busy || monitoringBusy || recording || nativeMonitorActive || nativeMonitorBusy}
                      onClick={() => {
                        setSelectedNativeProviderId(null);
                        setNativeMonitorError(null);
                        void selectProvider(provider.id);
                      }}
                    >
                      <span className="voice-correction-lab__engine-icon">
                        {provider.id === "opendaw" ? <Cpu aria-hidden="true" /> : <FlaskConical aria-hidden="true" />}
                      </span>
                      <span><strong>{provider.label}</strong><small>{provider.description}</small></span>
                      <em>{selected ? (activeProviderId === provider.id ? "Actif" : "Choisi") : "Choisir"}</em>
                    </button>
                  );
                })}
                {NATIVE_VST3_VOICE_CORRECTION_PROVIDERS.map((provider) => {
                  const selected = provider.id === selectedNativeProviderId;
                  const running = provider.id === nativeMonitor?.pluginId && nativeMonitorReady;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={`is-native${selected ? " is-native-selected" : ""}`}
                      aria-label={`Choisir ${provider.label}`}
                      aria-pressed={selected}
                      disabled={busy || monitoringBusy || recording || nativeMonitorActive || nativeMonitorBusy}
                      onClick={() => {
                        void selectNativeProvider(provider.id);
                      }}
                    >
                      <span className="voice-correction-lab__engine-icon"><Cpu aria-hidden="true" /></span>
                      <span><strong>{provider.label}</strong><small>{provider.description}</small></span>
                      <em>{running ? "Actif" : selected ? "Choisi" : "Natif"}</em>
                    </button>
                  );
                })}
              </fieldset>
              {selectedNativeProvider ? (
                <section className="voice-correction-lab__native-vst3" aria-label={`${selectedNativeProvider.label} · test natif`}>
                  <span>
                    <strong>{selectedNativeProvider.label}</strong>
                    <small>Plugin VST3 {selectedNativeProvider.version} reconnu par l’hôte natif MeeWav.</small>
                  </span>
                  <p>Retour réel via le micro et la sortie audio Windows par défaut. Le moteur Web est libéré avant l’ouverture pour éviter un double retour.</p>
                  {nativeMonitorAvailable === null ? (
                    <p className="voice-correction-lab__native-state" aria-live="polite">Vérification du lanceur local…</p>
                  ) : nativeMonitorAvailable || nativeMonitorActive ? (
                    <>
                      <label className="voice-correction-lab__headphones-confirmation">
                        <input
                          type="checkbox"
                          checked={headphonesConfirmed}
                          disabled={nativeMonitorBusy || nativeMonitorActive}
                          onChange={(event) => setHeadphonesConfirmed(event.target.checked)}
                        />
                        <span><strong>Casque filaire branché</strong><small>Obligatoire pour éviter le larsen.</small></span>
                      </label>
                      <button
                        type="button"
                        className={`voice-correction-lab__wide-action${nativeMonitorActive ? " is-danger" : " is-native-action"}`}
                        onClick={() => { void (nativeMonitorActive ? stopNativeMonitoring() : startNativeMonitoring()); }}
                        disabled={nativeMonitorBusy || (!nativeMonitorActive && !headphonesConfirmed)}
                      >
                        {nativeMonitorActive ? <CircleStop aria-hidden="true" /> : <Headphones aria-hidden="true" />}
                        <span>
                          <strong>{nativeMonitorBusy
                            ? "Connexion au moteur natif…"
                            : nativeMonitorActive
                              ? `Couper le retour ${nativeMonitorProvider?.shortLabel ?? "natif"}`
                              : `Activer le retour ${selectedNativeProvider.shortLabel}`}</strong>
                          <small>{nativeMonitorReady
                            ? bypass
                              ? "Micro → VST3 bypassé → limiteur → casque actif"
                              : "Micro → VST3 corrigé → limiteur → casque actif"
                            : "Le plugin s’ouvre localement, sans envoyer la voix au serveur."}</small>
                        </span>
                      </button>
                      <p className={`voice-correction-lab__native-state${nativeMonitorError ? " is-error" : ""}`} aria-live="polite">
                        {nativeMonitorError
                          ?? (nativeMonitorReady
                            ? `${nativeMonitorProvider?.label ?? "Plugin natif"} fonctionne · PID ${nativeMonitor?.pid ?? "—"}`
                            : "Bypass, intensité, retune, tonalité et gamme seront transmis au VST3.")}
                      </p>
                      {nativeMonitorReady ? (
                        <dl className="voice-correction-lab__native-devices">
                           <div><dt>Entrée</dt><dd>{nativeCaptureDevice ?? "Micro Windows par défaut"}</dd></div>
                           <div><dt>Sortie casque</dt><dd>{nativeRenderDevice ?? "Sortie Windows par défaut"}</dd></div>
                           <div><dt>Niveau micro</dt><dd>{nativeMonitorLevelLabel(nativeInputPeak)}</dd></div>
                           <div><dt>Après le plugin</dt><dd>{nativeMonitorLevelLabel(nativeOutputPeak)}</dd></div>
                           <div><dt>Latence déclarée</dt><dd>{nativeReportedLatency ?? "Mesure indisponible"}</dd></div>
                        </dl>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="voice-correction-lab__native-state is-error">{nativeMonitorError ?? "Le lanceur local n’est pas actif."} Ouvre cette page avec <code>npm run dev:audio-lab</code>.</p>
                      <code>{selectedNativeProvider.command}</code>
                      <div>
                        <button type="button" className="is-compact" onClick={() => { void copyNativeCommand(); }}>Copier la commande de secours</button>
                        <small aria-live="polite">{nativeCommandStatus ?? "Casque filaire requis · arrêt avec Ctrl+C"}</small>
                      </div>
                    </>
                  )}
                </section>
              ) : null}
              <fieldset className="voice-correction-lab__segmented is-three">
                <legend>Profil de comparaison</legend>
                {Object.values(VOICE_CORRECTION_PRESETS).map((profile) => (
                  <button key={profile.id} type="button" disabled={busy || nativeMonitorBusy} className={profileId === profile.id ? "is-active" : ""} aria-pressed={profileId === profile.id} onClick={() => applyProfile(profile.id)}>{profile.label}</button>
                ))}
              </fieldset>
              <div className="voice-correction-lab__select-grid">
                <label className="voice-correction-lab__field"><span>Tonalité</span><select value={settings.key} disabled={busy || nativeMonitorBusy} onChange={(event) => changeSetting("key", Number(event.target.value) as VoiceCorrectionSettings["key"])}>{OPENDAW_VOICE_CORRECTION_KEYS.map((key, index) => <option key={key} value={index}>{key}</option>)}</select></label>
                <label className="voice-correction-lab__field"><span>Gamme</span><select value={settings.scale} disabled={busy || nativeMonitorBusy} onChange={(event) => changeSetting("scale", Number(event.target.value) as VoiceCorrectionSettings["scale"])}>{OPENDAW_VOICE_CORRECTION_SCALES.map((scale, index) => <option key={scale} value={index}>{scale}</option>)}</select></label>
              </div>
              <SliderField label="Intensité de correction" value={Math.round(settings.amount * 100)} min={0} max={100} step={1} suffix=" %" disabled={busy || nativeMonitorBusy} onChange={(value) => changeSetting("amount", value / 100)} />
              <SliderField label="Retune speed" value={Math.round(settings.retune * 100)} min={0} max={100} step={1} suffix=" %" disabled={busy || nativeMonitorBusy} onChange={(value) => changeSetting("retune", value / 100)} />
              <SliderField label={nativeMode ? "Humanisation · non prise en charge" : "Humanisation"} value={Math.round(settings.smooth * 100)} min={0} max={100} step={1} suffix=" %" disabled={busy || nativeMode} onChange={(value) => changeSetting("smooth", value / 100)} />
              {nativeMode ? <p className="voice-correction-lab__helper">Spoton et Graillon ne reçoivent aucune fausse valeur d’humanisation : aucun paramètre équivalent n’est vérifié.</p> : null}
            </div>
          </article>
        </section>

        <section className="voice-correction-lab__column">
          <article className="voice-correction-lab__panel">
            <header><span><Headphones aria-hidden="true" /><strong>Écoute et comparaison</strong></span><em>{nativeMode
              ? nativeMonitorReady ? "Retour natif actif" : "Retour Web coupé"
              : monitoring ? "Retour casque actif" : "Retour casque coupé"}</em></header>
            <div className="voice-correction-lab__panel-body">
              <fieldset className="voice-correction-lab__segmented">
                <legend>Source de comparaison</legend>
                <button type="button" className={selectedRoute === "dry" ? "is-active" : ""} aria-pressed={selectedRoute === "dry"} disabled={(!nativeMode && !dryAvailable) || busy || monitoringBusy || nativeMonitorBusy} onClick={() => { void selectComparisonRoute("dry"); }}>Sec</button>
                <button type="button" className={selectedRoute === "processed" ? "is-active" : ""} aria-pressed={selectedRoute === "processed"} disabled={(!nativeMode && !correctionAvailable) || busy || monitoringBusy || nativeMonitorBusy} onClick={() => { void selectComparisonRoute("processed"); }}>Corrigé</button>
              </fieldset>
              {nativeMode
                ? <p className="voice-correction-lab__route-state" role="status"><Headphones aria-hidden="true" />{nativeMonitorReady
                  ? bypass
                    ? `${nativeMonitorProvider?.label ?? "Plugin natif"} est bypassé : tu écoutes le signal sec.`
                    : `${nativeMonitorProvider?.label ?? "Plugin natif"} traite le retour casque.`
                  : "Le retour Web est réellement coupé pendant la sélection du moteur natif."}</p>
                : diagnostics.fallbackActive || status === "fallback"
                ? <p className="voice-correction-lab__route-state is-fallback" role="status"><ShieldAlert aria-hidden="true" />Fallback sec actif · {diagnostics.fallbackReason ?? error ?? "le traitement corrigé est indisponible"}</p>
                : <p className="voice-correction-lab__route-state" role="status"><CheckCircle2 aria-hidden="true" />{dryAvailable ? `Écoute sélectionnée : ${selectedRoute === "dry" ? "signal sec" : "signal corrigé"}` : "En attente de l’activation du microphone"}</p>}
              <button type="button" className="voice-correction-lab__wide-action" onClick={() => { void toggleMonitoring(); }} disabled={nativeMode || busy || monitoringBusy}>
                {monitoring ? <CircleStop aria-hidden="true" /> : <Headphones aria-hidden="true" />}
                <span><strong>{monitoring
                  ? "Couper le retour"
                  : `${dryAvailable ? "Écouter" : "Activer et écouter"} la voix ${selectedRoute === "dry" ? "sèche" : "corrigée"}`}</strong><small>Utilise un casque filaire pour éviter le larsen.</small></span>
              </button>
              <button type="button" className="voice-correction-lab__wide-action" onClick={toggleRecording} disabled={nativeMode || busy || monitoringBusy || !correctionAvailable}>
                {recording ? <CircleStop aria-hidden="true" /> : <Radio aria-hidden="true" />}
                <span><strong>{recording ? "Arrêter l’enregistrement" : "Enregistrer sec + corrigé"}</strong><small>Déclenchement groupé · deux pistes distinctes · 8 secondes maximum.</small></span>
              </button>
              {recordingUrls ? (
                <>
                  <div className="voice-correction-lab__recordings">
                    <span>Comparaison enregistrée · {(recordingUrls.durationMs / 1_000).toFixed(1)} s</span>
                    <label><strong>Voix originale</strong><audio src={recordingUrls.dry} controls preload="metadata" /></label>
                    <label><strong>Voix corrigée</strong><audio src={recordingUrls.processed} controls preload="metadata" /></label>
                  </div>
                  <VoiceCorrectionAbxPanel
                    key={`${recordingUrls.dry}:${recordingUrls.processed}`}
                    recordings={recordingUrls}
                  />
                </>
              ) : null}
            </div>
          </article>

          <article className="voice-correction-lab__panel">
            <header><span><Activity aria-hidden="true" /><strong>Preuve WebRTC locale</strong></span><em>Aucune Room publique</em></header>
            <div className="voice-correction-lab__panel-body">
              <p className="voice-correction-lab__helper">Crée deux connexions locales, publie la piste originale, puis utilise <code>replaceTrack</code> pour injecter la piste corrigée sans doublage.</p>
              <button type="button" className="voice-correction-lab__wide-action" onClick={() => { void runLoopback(); }} disabled={busy || !correctionAvailable || bypass || loopbackBusy}>
                <Radio aria-hidden="true" />
                <span><strong>{loopbackBusy ? "Test en cours…" : "Tester la piste WebRTC"}</strong><small>La piste distante n’est jamais routée vers les haut-parleurs.</small></span>
              </button>
              {loopbackResult ? (
                <div className="voice-correction-lab__success"><CheckCircle2 aria-hidden="true" /><span><strong>replaceTrack réussi · trafic RTP après remplacement</strong>Avant {loopbackResult.before.packetsSent}/{loopbackResult.before.packetsReceived} · après {loopbackResult.after.packetsSent}/{loopbackResult.after.packetsReceived} · Δ +{loopbackResult.delta.packetsSent}/+{loopbackResult.delta.packetsReceived} paquets · +{loopbackResult.delta.bytesSent}/+{loopbackResult.delta.bytesReceived} octets. Ce test ne prouve pas la qualité audible de la correction.</span></div>
              ) : null}
            </div>
          </article>

          <article className="voice-correction-lab__panel">
            <header><span><Gauge aria-hidden="true" /><strong>Diagnostic réel</strong></span><div className="voice-correction-lab__header-actions"><button type="button" className="is-compact" onClick={updateDiagnostics}><RefreshCcw aria-hidden="true" />Actualiser</button><button type="button" className="is-compact" onClick={() => exportLabReport("json")}><Download aria-hidden="true" />JSON</button><button type="button" className="is-compact" onClick={() => exportLabReport("csv")}><Download aria-hidden="true" />CSV</button></div></header>
            <div className="voice-correction-lab__diagnostics">
              <div><small>{nativeMode ? "MODE AUDIO" : "ISOLATION"}</small><strong>{nativeMode ? "Natif Windows" : diagnostics.crossOriginIsolated ? "Active" : "Absente"}</strong></div>
              <div><small>AUDIOWORKLET</small><strong>{nativeMode ? "Non utilisé" : diagnostics.workletReady ? "Prêt" : "Non prêt"}</strong></div>
              <div><small>{nativeMode ? "VST3 LOCAL" : (activeProviderId ?? selectedProviderId) === "opendaw" ? "WASM" : "DSP LOCAL"}</small><strong>{nativeMode ? nativeMonitorReady ? "Prêt" : "Non prêt" : diagnostics.engineReady ? "Prêt" : "Non prêt"}</strong></div>
              <div><small>MOTEUR AUTOTUNE</small><strong>{nativeMode ? nativeMonitorProvider?.label ?? selectedNativeProvider?.label ?? "Plugin natif" : activeProvider?.label ?? `${selectedProvider.label} · choisi`}</strong></div>
              <div><small>FRÉQUENCE</small><strong>{diagnostics.sampleRate ? `${diagnostics.sampleRate / 1_000} kHz` : "—"}</strong></div>
              <div><small>LATENCE CONTEXTE</small><strong>{formatLatency(diagnostics.baseLatencyMs ?? latency.base)}</strong></div>
              <div><small>LATENCE SORTIE</small><strong>{formatLatency(diagnostics.outputLatencyMs ?? latency.output)}</strong></div>
              <div><small>LATENCE DSP</small><strong>{formatLatency(diagnostics.estimatedDspLatencyMs)}</strong></div>
              <div><small>ÉTAT MOTEUR</small><strong>{nativeMode ? nativeMonitor?.status ?? "sélectionné" : diagnostics.status}</strong></div>
              <div><small>CHARGE DSP</small><strong>{diagnostics.cpuLoadPercent === null ? "Non mesurée" : `${diagnostics.cpuLoadPercent.toFixed(1)} %`}</strong></div>
              <div><small>PISTES</small><strong>{nativeMode ? nativeMonitorReady ? "WASAPI → casque" : "—" : `${diagnostics.inputTrackState ?? "—"} → ${diagnostics.outputTrackState ?? "—"}`}</strong></div>
              <div><small>ROUTE ÉCOUTÉE</small><strong>{nativeMode
                ? bypass ? "Sec · VST3 bypassé" : "Corrigé · VST3 natif"
                : selectedRoute === "dry" ? "Sec" : "Corrigé"}</strong></div>
              <div><small>RETOUR CASQUE WEB</small><strong>{nativeMode ? "Non applicable" : monitoringStateLabel(diagnostics.monitoringState)}</strong></div>
              <div><small>SIGNAL DU BUS TRAITÉ</small><strong>{nativeMode ? "Non mesuré par le Web" : processedSignalLabel(diagnostics.processedSignalState)}</strong></div>
              <div><small>TEST DU BUS LOCAL</small><strong>{nativeMode ? "Non applicable" : localOutputProofLabel(diagnostics.localOutputProof)}</strong></div>
              <div><small>FALLBACK SEC</small><strong>{nativeMode ? "Non applicable" : diagnostics.fallbackActive || status === "fallback" ? "Actif" : "Inactif"}</strong></div>
              <div><small>DERNIÈRE ERREUR</small><strong>{nativeMode ? nativeMonitorError ?? "Aucune" : diagnostics.error ?? error ?? "Aucune"}</strong></div>
            </div>
            {!nativeMode ? (
              <p className="voice-correction-lab__helper">
                Le test 880 Hz confirme uniquement la continuité du bus Web Audio interne. Il ne prouve ni le moteur Autotune, ni la correction de hauteur, ni le casque physique.
              </p>
            ) : null}
            {diagnostics.resources.length ? (
              <div className="voice-correction-lab__resources">
                {diagnostics.resources.map((resource) => (
                  <div key={resource.path}><span><strong>{resource.path.split("/").slice(-1)[0]}</strong><small>{resource.path}</small></span><em data-status={resource.status}>{resource.status}</em></div>
                ))}
              </div>
            ) : <p className="voice-correction-lab__empty">Les ressources chargées apparaîtront après l’activation volontaire du microphone.</p>}
          </article>
        </section>
      </div>
    </main>
  );
}

export default VoiceCorrectionLabPage;
