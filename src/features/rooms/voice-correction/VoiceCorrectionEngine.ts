import type { VoiceCorrectionSettings } from "./voiceCorrection.types";

export type VoiceCorrectionEngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "processing"
  | "bypassed"
  | "fallback"
  | "error"
  | "disposed";

export type VoiceCorrectionResourceState = {
  path: string;
  mediaType: string;
  status: "pending" | "available" | "missing" | "invalid" | "loaded";
  httpStatus: number | null;
  error: string | null;
};

export type VoiceCorrectionEngineDiagnostics = {
  status: VoiceCorrectionEngineStatus;
  engineReady: boolean;
  workletReady: boolean;
  crossOriginIsolated: boolean;
  sampleRate: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  /** DSP delay reported or measured for the selected engine, when available. */
  estimatedDspLatencyMs: number | null;
  cpuLoadPercent: number | null;
  inputTrackState: MediaStreamTrackState | null;
  outputTrackState: MediaStreamTrackState | null;
  bypass: boolean;
  monitoring: boolean;
  /** Physical track state is insufficient: a destination track can be live while carrying zeros. */
  processedSignalState?: VoiceCorrectionProcessedSignalState;
  /** Truthful state of the direct Web Audio headphone path. */
  monitoringState?: VoiceCorrectionMonitoringState;
  /** Result of the short audible local-output proof used by the laboratory. */
  localOutputProof?: "not-run" | "passed" | "failed";
  fallbackActive: boolean;
  fallbackReason: string | null;
  error: string | null;
  resources: ReadonlyArray<VoiceCorrectionResourceState>;
};

export type VoiceCorrectionMeterSnapshot = {
  input: number;
  output: number;
};

export type VoiceCorrectionProcessedSignalState =
  | "unverified"
  | "waiting_for_input"
  | "detected"
  | "silent";

export type VoiceCorrectionMonitoringState =
  | "off"
  | "starting"
  | "active"
  | "fallback"
  | "interrupted";

export type VoiceCorrectionInitializeOptions = {
  audioContext?: AudioContext;
  assetBaseUrl?: string;
};

export type VoiceCorrectionDiagnosticsListener = (
  diagnostics: VoiceCorrectionEngineDiagnostics,
) => void;

/**
 * MeeWav boundary around every local voice-correction implementation.
 *
 * React and Room components must only depend on this interface. In particular,
 * they never manipulate vendor graphs, Worklet nodes or WASM URLs.
 */
export interface VoiceCorrectionEngine {
  initialize(options?: VoiceCorrectionInitializeOptions): Promise<void>;
  connectInput(stream: MediaStream): Promise<void>;
  updateSettings(settings: VoiceCorrectionSettings): Promise<void>;
  setBypass(bypass: boolean): Promise<void>;
  setMonitoring(enabled: boolean): Promise<void>;
  getDryStream(): MediaStream | null;
  getProcessedStream(): MediaStream | null;
  getMeterSnapshot(): VoiceCorrectionMeterSnapshot;
  getDiagnostics(): VoiceCorrectionEngineDiagnostics;
  subscribeDiagnostics(listener: VoiceCorrectionDiagnosticsListener): () => void;
  dispose(): Promise<void>;
}
