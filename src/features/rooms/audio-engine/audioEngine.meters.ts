import { AudioEngineLoopbackClient } from "./audioEngine.client";
import {
  type AudioEngineMeterChannel,
  type AudioEngineMeterFrame,
  type AudioEngineMetersStatus,
} from "./audioEngine.types";
import { parseAudioEngineMeterFrame } from "./audioEngine.validators";

export type AudioEngineMeterListener = (frame: AudioEngineMeterFrame) => void;
export type AudioEngineMeterStatusListener = (status: AudioEngineMetersStatus, error: string | null) => void;

export interface AudioEngineMetersStream {
  readonly status: AudioEngineMetersStatus;
  subscribe(listener: AudioEngineMeterListener): () => void;
  subscribeStatus(listener: AudioEngineMeterStatusListener): () => void;
  start(): void;
  stop(): void;
}

abstract class BaseAudioEngineMetersStream implements AudioEngineMetersStream {
  protected frameListeners = new Set<AudioEngineMeterListener>();
  protected statusListeners = new Set<AudioEngineMeterStatusListener>();
  protected currentStatus: AudioEngineMetersStatus = "idle";

  get status() {
    return this.currentStatus;
  }

  subscribe(listener: AudioEngineMeterListener) {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  subscribeStatus(listener: AudioEngineMeterStatusListener) {
    this.statusListeners.add(listener);
    listener(this.currentStatus, null);
    return () => { this.statusListeners.delete(listener); };
  }

  protected emitFrame(frame: AudioEngineMeterFrame) {
    this.frameListeners.forEach((listener) => listener(frame));
  }

  protected setStatus(status: AudioEngineMetersStatus, error: string | null = null) {
    this.currentStatus = status;
    this.statusListeners.forEach((listener) => listener(status, error));
  }

  abstract start(): void;
  abstract stop(): void;
}

/**
 * Authenticated control-channel meters. The session secret never appears in
 * the URL: the first WebSocket frame is an HMAC-signed authentication frame.
 */
export class NativeAudioEngineMetersStream extends BaseAudioEngineMetersStream {
  private readonly client: AudioEngineLoopbackClient;
  private socket: WebSocket | null = null;
  private connectionAttempt = 0;
  private authenticationTimeout: ReturnType<typeof setTimeout> | null = null;
  private authenticated = false;
  private latestFrame: AudioEngineMeterFrame | null = null;
  private animationFrame: number | null = null;
  private lastSequence = -1;

  constructor(client: AudioEngineLoopbackClient) {
    super();
    this.client = client;
  }

  start() {
    if (this.socket || this.currentStatus === "connecting") return;
    const attempt = ++this.connectionAttempt;
    this.setStatus("connecting");
    void this.connect(attempt);
  }

  stop() {
    this.connectionAttempt += 1;
    this.clearAuthenticationTimeout();
    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "MeeWav meter stream stopped");
    if (this.animationFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.latestFrame = null;
    this.lastSequence = -1;
    this.setStatus("stopped");
  }

  private async connect(attempt: number) {
    try {
      const { socket, authenticationFrame } = await this.client.createControlWebSocket();
      if (attempt !== this.connectionAttempt) {
        socket.close(1000, "Stale MeeWav meter connection");
        return;
      }
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (attempt !== this.connectionAttempt || socket !== this.socket) return;
        socket.send(authenticationFrame);
        this.authenticationTimeout = setTimeout(() => {
          if (!this.authenticated && socket === this.socket) socket.close(4001, "Authentication timeout");
        }, 3_000);
      });
      socket.addEventListener("message", (event) => {
        if (attempt !== this.connectionAttempt || socket !== this.socket) return;
        try {
          this.acceptMessage(event.data);
        } catch (error) {
          this.setStatus("error", error instanceof Error ? error.message : "Trame de contrôle invalide.");
          socket.close(4002, "Invalid control frame");
        }
      });
      socket.addEventListener("error", () => {
        if (attempt === this.connectionAttempt && socket === this.socket) {
          this.setStatus("error", "Canal de niveaux du moteur desktop inaccessible.");
        }
      });
      socket.addEventListener("close", (event) => {
        if (attempt !== this.connectionAttempt || socket !== this.socket) return;
        this.clearAuthenticationTimeout();
        this.socket = null;
        this.authenticated = false;
        if (this.currentStatus !== "error") {
          this.setStatus(event.wasClean ? "stopped" : "error", event.wasClean ? null : "Canal de niveaux interrompu.");
        }
      });
    } catch (error) {
      if (attempt === this.connectionAttempt) {
        this.setStatus("error", error instanceof Error ? error.message : "Flux de niveaux interrompu.");
      }
    }
  }

  private acceptMessage(data: unknown) {
    if (typeof data !== "string") throw new Error("Le canal de niveaux refuse les trames binaires non reconnues.");
    if (data.length > 65_536) throw new Error("Trame de niveaux trop volumineuse.");
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      throw new Error("Trame de niveaux JSON invalide.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Trame de contrôle invalide.");
    const message = raw as Record<string, unknown>;
    if (message.type === "authenticated") {
      this.authenticated = true;
      this.clearAuthenticationTimeout();
      this.setStatus("streaming");
      return;
    }
    if (!this.authenticated) throw new Error("Trame reçue avant authentification du canal.");
    if (message.type !== "meters") return;
    const frame = parseAudioEngineMeterFrame(message.data);
    if (frame.sequence <= this.lastSequence) return;
    this.lastSequence = frame.sequence;
    this.latestFrame = frame;
    if (this.animationFrame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      this.animationFrame = requestAnimationFrame(() => this.flushLatest());
    } else {
      this.flushLatest();
    }
  }

  private flushLatest() {
    this.animationFrame = null;
    const frame = this.latestFrame;
    this.latestFrame = null;
    if (frame) this.emitFrame(frame);
  }

  private clearAuthenticationTimeout() {
    if (this.authenticationTimeout !== null) clearTimeout(this.authenticationTimeout);
    this.authenticationTimeout = null;
  }
}

type WebAudioMeterTap = { id: string; analyser: AnalyserNode };

function channelFromAnalyser(tap: WebAudioMeterTap): AudioEngineMeterChannel {
  const values = new Float32Array(tap.analyser.fftSize);
  tap.analyser.getFloatTimeDomainData(values);
  let sum = 0;
  let peak = 0;
  values.forEach((sample) => {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  });
  const rms = Math.sqrt(sum / Math.max(1, values.length));
  const toDb = (linear: number) => Math.max(-180, 20 * Math.log10(Math.max(linear, 1e-9)));
  return {
    id: tap.id,
    rmsDb: toDb(rms),
    peakDb: toDb(peak),
    clipping: peak >= 0.999,
  };
}

/** Real meter source for the existing Web Audio fallback; it never fabricates levels. */
export class WebAudioAnalyserMetersStream extends BaseAudioEngineMetersStream {
  private readonly inputs: WebAudioMeterTap[];
  private readonly outputs: WebAudioMeterTap[];
  private animationFrame: number | null = null;
  private sequence = 0;

  constructor(options: { inputs?: WebAudioMeterTap[]; outputs?: WebAudioMeterTap[] }) {
    super();
    this.inputs = options.inputs ?? [];
    this.outputs = options.outputs ?? [];
  }

  start() {
    if (this.animationFrame !== null) return;
    this.setStatus("streaming");
    const sample = () => {
      this.emitFrame({
        sequence: this.sequence += 1,
        timestamp: new Date().toISOString(),
        input: this.inputs.map(channelFromAnalyser),
        output: this.outputs.map(channelFromAnalyser),
      });
      this.animationFrame = requestAnimationFrame(sample);
    };
    this.animationFrame = requestAnimationFrame(sample);
  }

  stop() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.setStatus("stopped");
  }
}
