import {
  AUDIO_ENGINE_API_MAJOR,
  AUDIO_ENGINE_WEB_CLIENT_VERSION,
  type AudioEngineChain,
  type AudioEngineDevice,
  type AudioEngineHealth,
  type AudioEngineMonitoring,
  type AudioEnginePairingContext,
  type AudioEnginePairingTicket,
  type AudioEnginePlugin,
  type AudioEngineSessionHandshake,
} from "./audioEngine.types";
import {
  AudioEngineValidationError,
  parseAudioEngineChain,
  parseAudioEngineDevices,
  parseAudioEngineEnvelope,
  parseAudioEngineHealth,
  parseAudioEngineMonitoring,
  parseAudioEnginePairingTicket,
  parseAudioEnginePlugins,
  parseAudioEngineSessionHandshake,
} from "./audioEngine.validators";

const MAX_JSON_RESPONSE_BYTES = 1_048_576;
const EMPTY_BODY_DIGEST_SOURCE = "";
export const DEFAULT_AUDIO_ENGINE_PORTS = [47_191, 47_192, 47_193] as const;

export type AudioEngineClientErrorCode =
  | "timeout"
  | "network"
  | "http"
  | "unauthorized"
  | "invalid_response"
  | "api_error"
  | "not_connected"
  | "unsupported"
  | "disposed";

export class AudioEngineClientError extends Error {
  readonly code: AudioEngineClientErrorCode;
  readonly status: number | null;

  constructor(code: AudioEngineClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "AudioEngineClientError";
    this.code = code;
    this.status = status;
  }
}

type AudioEngineClientOptions = {
  ports?: readonly number[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  parseData: (data: unknown) => T;
  timeoutMs?: number;
  keepalive?: boolean;
};

type SignedRequestMetadata = {
  sessionId: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

function requireCrypto() {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function" || !crypto.subtle) {
    throw new AudioEngineClientError("unsupported", "Web Crypto est requis pour authentifier le moteur audio local.");
  }
  return crypto;
}

function base64Url(data: Uint8Array) {
  let binary = "";
  data.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function randomBase64Url(bytes: number) {
  return base64Url(requireCrypto().getRandomValues(new Uint8Array(bytes)));
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hex(data: ArrayBuffer) {
  return [...new Uint8Array(data)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) throw new AudioEngineClientError("unsupported", "Port loopback MeeWav invalide.");
}

function endpointForPort(port: number) {
  assertPort(port);
  return `http://127.0.0.1:${port}/v1`;
}

export function assertMeeWavLoopbackEndpoint(value: string, allowedPorts: readonly number[] = DEFAULT_AUDIO_ENGINE_PORTS) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AudioEngineClientError("unsupported", "Adresse du moteur local invalide.");
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.username
    || url.password
    || url.pathname.replace(/\/$/u, "") !== "/v1"
    || url.search
    || url.hash
    || !allowedPorts.includes(port)
  ) {
    throw new AudioEngineClientError("unsupported", "Le moteur audio doit utiliser exclusivement un endpoint 127.0.0.1 approuvé.");
  }
  return `${url.origin}/v1`;
}

function requestUrl(endpoint: string, path: string) {
  if (!/^\/[a-z0-9/{}_-]+$/u.test(path)) throw new AudioEngineClientError("unsupported", "Chemin API local invalide.");
  return `${endpoint}${path}`;
}

function currentOrigin() {
  if (typeof window === "undefined") throw new AudioEngineClientError("unsupported", "L’association audio requiert un navigateur.");
  const origin = new URL(window.location.origin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") throw new AudioEngineClientError("unsupported", "Origine Web non supportée pour l’association.");
  return origin.origin;
}

function parseSessionClosed(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { closed?: unknown }).closed !== true) {
    throw new AudioEngineValidationError("Confirmation de fermeture de session locale invalide.");
  }
  return true;
}

export class AudioEngineLoopbackClient {
  private readonly ports: readonly number[];
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly clientNonce = randomBase64Url(24);
  private endpoint: string | null = null;
  private sessionId: string | null = null;
  private hmacKey: CryptoKey | null = null;
  private pairingLaunched = false;
  private disposed = false;

  constructor(options: AudioEngineClientOptions = {}) {
    this.ports = [...new Set(options.ports ?? DEFAULT_AUDIO_ENGINE_PORTS)];
    this.ports.forEach(assertPort);
    this.timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 900, 10_000));
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  get connectedEndpoint() {
    return this.endpoint;
  }

  get hasAuthenticatedSession() {
    return Boolean(this.endpoint && this.sessionId && this.hmacKey);
  }

  getPairingContext(): AudioEnginePairingContext {
    this.assertActive();
    return { clientNonce: this.clientNonce, origin: currentOrigin() };
  }

  launchPairing(ticketValue: AudioEnginePairingTicket) {
    this.assertActive();
    if (typeof document === "undefined" || !document.body) throw new AudioEngineClientError("unsupported", "Le protocole natif requiert un navigateur actif.");
    const ticket = parseAudioEnginePairingTicket(ticketValue);
    const protocol = new URL("meewavaudio://pair");
    protocol.searchParams.set("pairingId", ticket.pairingId);
    protocol.searchParams.set("token", ticket.token);
    protocol.searchParams.set("origin", currentOrigin());
    protocol.searchParams.set("ports", this.ports.join(","));
    protocol.searchParams.set("clientNonce", this.clientNonce);
    protocol.searchParams.set("apiMajor", String(AUDIO_ENGINE_API_MAJOR));
    protocol.searchParams.set("clientVersion", AUDIO_ENGINE_WEB_CLIENT_VERSION);

    const anchor = document.createElement("a");
    anchor.href = protocol.toString();
    anchor.rel = "noreferrer noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    this.pairingLaunched = true;
  }

  async completePairing(ticketValue: AudioEnginePairingTicket, options?: { totalTimeoutMs?: number }) {
    this.assertActive();
    if (!this.pairingLaunched) throw new AudioEngineClientError("unauthorized", "Le protocole desktop doit être lancé par l’utilisateur avant tout accès loopback.");
    const ticket = parseAudioEnginePairingTicket(ticketValue);
    const deadline = Date.now() + Math.max(1_000, Math.min(options?.totalTimeoutMs ?? 12_000, 30_000));
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      this.assertActive();
      for (const port of this.ports) {
        this.assertActive();
        if (Date.now() >= deadline) break;
        const endpoint = endpointForPort(port);
        try {
          const handshake = await this.requestSessionAt(endpoint, ticket.pairingId);
          await this.verifyTicketProof(ticket, handshake);
          await this.attachSession(endpoint, handshake.sessionId, handshake.sessionSecret);
          const health = await this.getHealth();
          return { endpoint: this.endpoint as string, health };
        } catch (error) {
          lastError = error;
          if (error instanceof AudioEngineClientError && (error.code === "disposed" || error.code === "unsupported")) throw error;
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 280));
    }
    throw lastError instanceof Error ? lastError : new AudioEngineClientError("timeout", "Le moteur desktop n’a pas finalisé l’association à temps.");
  }

  async getHealth() {
    const health = await this.request("/health", { parseData: parseAudioEngineHealth });
    if (health.sessionId !== this.sessionId) throw new AudioEngineClientError("unauthorized", "La session locale ne correspond pas à cette page MeeWav.");
    return health;
  }

  async getDevices() {
    return this.request<AudioEngineDevice[]>("/devices", { parseData: parseAudioEngineDevices });
  }

  async getPlugins() {
    return this.request<AudioEnginePlugin[]>("/plugins", { parseData: parseAudioEnginePlugins, timeoutMs: 4_000 });
  }

  async getChain() {
    return this.request<AudioEngineChain>("/chain", { parseData: parseAudioEngineChain });
  }

  async updateChain(chain: AudioEngineChain) {
    const validated = parseAudioEngineChain(chain);
    return this.request<AudioEngineChain>("/chain", {
      method: "PUT",
      body: validated,
      parseData: parseAudioEngineChain,
      timeoutMs: 3_000,
    });
  }

  async setMonitoring(update: { enabled: boolean; outputDeviceId?: string | null; gain?: number }) {
    const path = update.enabled ? "/monitor/start" : "/monitor/stop";
    return this.request<AudioEngineMonitoring>(path, {
      method: "POST",
      body: update.enabled ? { outputDeviceId: update.outputDeviceId ?? null, gain: update.gain ?? 1 } : {},
      parseData: parseAudioEngineMonitoring,
    });
  }

  async closeSession() {
    if (!this.hasAuthenticatedSession) return;
    await this.request("/session/close", {
      method: "POST",
      body: {},
      parseData: parseSessionClosed,
      keepalive: true,
    });
  }

  async createControlWebSocket() {
    const endpoint = this.requireEndpoint();
    const metadata = await this.createSignedMetadata("GET", "/control", EMPTY_BODY_DIGEST_SOURCE);
    const httpUrl = new URL(endpoint);
    const socketUrl = new URL(`${httpUrl.protocol === "https:" ? "wss:" : "ws:"}//${httpUrl.host}/v1/control`);
    if (socketUrl.hostname !== "127.0.0.1" || !this.ports.includes(Number(socketUrl.port))) {
      throw new AudioEngineClientError("unsupported", "Canal de contrôle non loopback refusé.");
    }
    const socket = new WebSocket(socketUrl, "meewav-audio-v1");
    return {
      socket,
      authenticationFrame: JSON.stringify({
        type: "authenticate",
        session: metadata.sessionId,
        timestamp: metadata.timestamp,
        nonce: metadata.nonce,
        signature: metadata.signature,
      }),
    };
  }

  dispose() {
    this.disposed = true;
    this.pairingLaunched = false;
    this.endpoint = null;
    this.sessionId = null;
    this.hmacKey = null;
  }

  private async requestSessionAt(endpointValue: string, pairingId: string) {
    this.assertActive();
    const endpoint = assertMeeWavLoopbackEndpoint(endpointValue, this.ports);
    const requestId = randomBase64Url(16);
    const bodyText = JSON.stringify({
      pairingId,
      clientNonce: this.clientNonce,
      origin: currentOrigin(),
    });
    const response = await this.fetchWithTimeout(requestUrl(endpoint, "/session"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-MeeWav-Audio-Api-Major": String(AUDIO_ENGINE_API_MAJOR),
        "X-MeeWav-Audio-Client-Version": AUDIO_ENGINE_WEB_CLIENT_VERSION,
        "X-Request-Id": requestId,
      },
      body: bodyText,
    }, this.timeoutMs);
    return this.readEnvelope(response, requestId, (value) => parseAudioEngineSessionHandshake(value, pairingId));
  }

  private async attachSession(endpointValue: string, sessionId: string, sessionSecret: string) {
    this.assertActive();
    const cryptoApi = requireCrypto();
    const key = await cryptoApi.subtle.importKey(
      "raw",
      decodeBase64Url(sessionSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    this.assertActive();
    this.endpoint = assertMeeWavLoopbackEndpoint(endpointValue, this.ports);
    this.sessionId = sessionId;
    this.hmacKey = key;
  }

  private async verifyTicketProof(ticket: AudioEnginePairingTicket, handshake: AudioEngineSessionHandshake) {
    this.assertActive();
    const cryptoApi = requireCrypto();
    const proofKey = await cryptoApi.subtle.importKey(
      "raw",
      new TextEncoder().encode(ticket.token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const canonical = [
      ticket.pairingId,
      this.clientNonce,
      currentOrigin(),
      handshake.sessionId,
      handshake.sessionSecret,
    ].join("\n");
    const valid = await cryptoApi.subtle.verify(
      "HMAC",
      proofKey,
      decodeBase64Url(handshake.ticketProof),
      new TextEncoder().encode(canonical),
    );
    this.assertActive();
    if (!valid) throw new AudioEngineClientError("unauthorized", "Le service loopback n’a pas prouvé la consommation du ticket MeeWav.");
  }

  private async request<T>(path: string, options: RequestOptions<T>) {
    this.assertActive();
    const endpoint = this.requireEndpoint();
    const method = options.method ?? "GET";
    const bodyText = options.body === undefined ? "" : JSON.stringify(options.body);
    const requestId = randomBase64Url(16);
    const metadata = await this.createSignedMetadata(method, path, bodyText);
    const response = await this.fetchWithTimeout(requestUrl(endpoint, path), {
      method,
      headers: {
        Accept: "application/json",
        ...(bodyText ? { "Content-Type": "application/json" } : {}),
        "X-MeeWav-Audio-Api-Major": String(AUDIO_ENGINE_API_MAJOR),
        "X-MeeWav-Audio-Client-Version": AUDIO_ENGINE_WEB_CLIENT_VERSION,
        "X-MeeWav-Session": metadata.sessionId,
        "X-MeeWav-Timestamp": metadata.timestamp,
        "X-MeeWav-Nonce": metadata.nonce,
        "X-MeeWav-Signature": metadata.signature,
        "X-Request-Id": requestId,
      },
      body: bodyText || undefined,
      keepalive: options.keepalive,
    }, options.timeoutMs ?? this.timeoutMs);
    return this.readEnvelope(response, requestId, options.parseData);
  }

  private async createSignedMetadata(method: string, path: string, bodyText: string): Promise<SignedRequestMetadata> {
    const sessionId = this.sessionId;
    const key = this.hmacKey;
    if (!sessionId || !key) throw new AudioEngineClientError("not_connected", "Session HMAC du moteur audio absente.");
    const cryptoApi = requireCrypto();
    const timestamp = String(Date.now());
    const nonce = randomBase64Url(18);
    const bodyDigest = hex(await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(bodyText)));
    const canonicalRoute = `/v1${path}`;
    const canonical = `${method.toUpperCase()}\n${canonicalRoute}\n${timestamp}\n${nonce}\n${bodyDigest}`;
    const signature = await cryptoApi.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
    return { sessionId, timestamp, nonce, signature: base64Url(new Uint8Array(signature)) };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
    try {
      return await this.fetchImpl(url, {
        ...init,
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new AudioEngineClientError("timeout", "Le moteur local n’a pas répondu à temps.");
      if (error instanceof AudioEngineClientError) throw error;
      throw new AudioEngineClientError("network", "MeeWav Audio Engine est inaccessible sur 127.0.0.1.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readEnvelope<T>(response: Response, requestId: string, parseData: (data: unknown) => T) {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) throw new AudioEngineClientError("invalid_response", "Le moteur local n’a pas renvoyé du JSON.", response.status);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_RESPONSE_BYTES) throw new AudioEngineClientError("invalid_response", "Réponse du moteur local trop volumineuse.", response.status);
    const text = await this.readBoundedText(response);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AudioEngineClientError("invalid_response", "JSON local invalide.", response.status);
    }
    let envelope;
    try {
      envelope = parseAudioEngineEnvelope(raw, parseData);
    } catch (error) {
      if (error instanceof AudioEngineValidationError) throw new AudioEngineClientError("invalid_response", error.message, response.status);
      throw error;
    }
    if (envelope.requestId !== requestId) throw new AudioEngineClientError("invalid_response", "Identifiant de réponse local incohérent.", response.status);
    if (!envelope.ok) throw new AudioEngineClientError(response.status === 401 ? "unauthorized" : "api_error", envelope.error.message, response.status);
    if (!response.ok) throw new AudioEngineClientError(response.status === 401 ? "unauthorized" : "http", `Erreur locale ${response.status}.`, response.status);
    return envelope.data;
  }

  private async readBoundedText(response: Response) {
    if (!response.body) {
      const fallback = await response.text();
      if (new TextEncoder().encode(fallback).byteLength > MAX_JSON_RESPONSE_BYTES) {
        throw new AudioEngineClientError("invalid_response", "Réponse du moteur local trop volumineuse.", response.status);
      }
      return fallback;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_JSON_RESPONSE_BYTES) {
          await reader.cancel("MeeWav response limit exceeded");
          throw new AudioEngineClientError("invalid_response", "Réponse du moteur local trop volumineuse.", response.status);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new AudioEngineClientError("invalid_response", "Réponse UTF-8 locale invalide.", response.status);
    }
  }

  private requireEndpoint() {
    this.assertActive();
    if (!this.endpoint || !this.sessionId || !this.hmacKey) throw new AudioEngineClientError("not_connected", "Aucun moteur audio local authentifié.");
    return assertMeeWavLoopbackEndpoint(this.endpoint, this.ports);
  }

  private assertActive() {
    if (this.disposed) throw new AudioEngineClientError("disposed", "La session du moteur audio est fermée.");
  }
}
