export const AUDIO_ENGINE_API_MAJOR = 1;
export const AUDIO_ENGINE_WEB_CLIENT_VERSION = "1.0.0";
export const AUDIO_ENGINE_SERVICE_NAME = "meewav-audio-engine";

export type AudioEngineConnectionStatus =
  | "idle"
  | "detecting"
  | "pairing"
  | "connecting"
  | "connected"
  | "incompatible"
  | "unavailable"
  | "error"
  | "fallback";

export type AudioEngineTransport = "native" | "web_audio";

export type AudioEngineDevice = {
  id: string;
  kind: "audio_input" | "audio_output" | "midi_input" | "midi_output";
  label: string;
  isDefault: boolean;
  selected: boolean;
  status: "available" | "busy" | "unavailable";
  channels: number;
  sampleRates: number[];
};

export type AudioEnginePlugin = {
  id: string;
  name: string;
  vendor: string;
  version: string;
  /** V1 intentionally exposes only MeeWav built-ins and verified VST3 plugins. */
  format: "builtin" | "vst3";
  status: "ready" | "disabled" | "missing" | "unlicensed" | "scan_error";
  licensed: boolean;
  hasEditor: boolean;
  latencySamples: number;
  capabilities: string[];
};

export type AudioEngineRoomPublication = {
  /** A control-plane connection alone is never evidence of a published Room track. */
  status: "unavailable" | "preparing" | "published";
  roomId: string | null;
  trackId: string | null;
  publisher: "native_webrtc" | "pcm_bridge" | null;
  publishedAt: string | null;
};

export type AudioEngineChain = {
  inputGainDb: number;
  vocalTuning: {
    enabled: boolean;
    provider: string;
    key: string;
    scale: string;
    correctionAmount: number;
    retuneSpeed: number;
    humanize: number;
    formant: number;
  };
  compressor: { provider: string; amount: number };
  reverb: { provider: string; amount: number };
  masterGainDb: number;
};

export type AudioEngineHealth = {
  service: typeof AUDIO_ENGINE_SERVICE_NAME;
  status: "ok" | "degraded";
  apiVersion: string;
  engineVersion: string;
  minWebClientVersion: string;
  maxWebClientVersion: string | null;
  sessionId: string;
  uptimeSeconds: number;
  timestamp: string;
  metersProtocol: "websocket-v1";
  /**
   * `connected` only authenticates the control plane. The browser must keep
   * its current Room microphone until this explicit audio-plane state is
   * `room_ready`.
   */
  audioPlane: "unavailable" | "local_monitor" | "room_ready";
  /**
   * Concrete publication evidence. The Web app may retire its raw microphone
   * only for a `native_webrtc` track published into the current Room.
   */
  roomPublication: AudioEngineRoomPublication;
};

export type AudioEngineCompatibility = {
  compatible: boolean;
  code: "compatible" | "api_major_mismatch" | "client_too_old" | "client_too_new" | "invalid_version";
  reason: string;
};

export type AudioEngineMeterChannel = {
  id: string;
  rmsDb: number;
  peakDb: number;
  clipping: boolean;
};

export type AudioEngineMeterFrame = {
  sequence: number;
  timestamp: string;
  input: AudioEngineMeterChannel[];
  output: AudioEngineMeterChannel[];
};

export type AudioEngineMonitoring = {
  enabled: boolean;
  outputDeviceId: string | null;
  gain: number;
  latencyMs: number;
};

export type AudioEnginePairingTicket = {
  pairingId: string;
  token: string;
  expiresAt: string;
};

export type AudioEngineSessionHandshake = {
  pairingId: string;
  sessionId: string;
  sessionSecret: string;
  /** HMAC-SHA256 proof that the responder consumed the one-use ticket. */
  ticketProof: string;
};

export type AudioEnginePairingContext = {
  /** Browser-generated nonce cryptographically bound into the backend ticket. */
  clientNonce: string;
  /** Exact MeeWav Web origin that initiated the native pairing flow. */
  origin: string;
};

export type AudioEnginePairingTicketProvider = (
  roomId: string,
  context: AudioEnginePairingContext,
) => Promise<AudioEnginePairingTicket>;

export type AudioEngineMetersStatus = "idle" | "connecting" | "streaming" | "stopped" | "error";

export type AudioEngineState = {
  status: AudioEngineConnectionStatus;
  transport: AudioEngineTransport | null;
  endpoint: string | null;
  health: AudioEngineHealth | null;
  compatibility: AudioEngineCompatibility | null;
  devices: AudioEngineDevice[];
  plugins: AudioEnginePlugin[];
  chain: AudioEngineChain | null;
  monitoring: AudioEngineMonitoring | null;
  meterFrame: AudioEngineMeterFrame | null;
  metersStatus: AudioEngineMetersStatus;
  error: string | null;
  lastConnectedAt: string | null;
  fallbackReason: string | null;
};

export type AudioEngineErrorPayload = {
  code: string;
  message: string;
};

export type AudioEngineSuccessEnvelope<T> = {
  ok: true;
  requestId: string;
  data: T;
};

export type AudioEngineFailureEnvelope = {
  ok: false;
  requestId: string;
  error: AudioEngineErrorPayload;
};

export type AudioEngineResponseEnvelope<T> = AudioEngineSuccessEnvelope<T> | AudioEngineFailureEnvelope;

export const INITIAL_AUDIO_ENGINE_STATE: AudioEngineState = {
  status: "idle",
  transport: null,
  endpoint: null,
  health: null,
  compatibility: null,
  devices: [],
  plugins: [],
  chain: null,
  monitoring: null,
  meterFrame: null,
  metersStatus: "idle",
  error: null,
  lastConnectedAt: null,
  fallbackReason: null,
};
