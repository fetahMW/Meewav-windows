import {
  AUDIO_ENGINE_SERVICE_NAME,
  type AudioEngineChain,
  type AudioEngineDevice,
  type AudioEngineFailureEnvelope,
  type AudioEngineHealth,
  type AudioEngineMeterChannel,
  type AudioEngineMeterFrame,
  type AudioEngineMonitoring,
  type AudioEngineSessionHandshake,
  type AudioEnginePairingTicket,
  type AudioEnginePlugin,
  type AudioEngineResponseEnvelope,
} from "./audioEngine.types";

export class AudioEngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioEngineValidationError";
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AudioEngineValidationError(`${path} doit être un objet.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string, max = 512) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) throw new AudioEngineValidationError(`${path} doit être une chaîne valide.`);
  return value;
}

function nullableString(value: unknown, path: string, max = 512) {
  if (value === null) return null;
  return stringValue(value, path, max);
}

function numberValue(value: unknown, path: string, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new AudioEngineValidationError(`${path} doit être un nombre valide.`);
  return value;
}

function booleanValue(value: unknown, path: string) {
  if (typeof value !== "boolean") throw new AudioEngineValidationError(`${path} doit être un booléen.`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new AudioEngineValidationError(`${path} contient une valeur non supportée.`);
  return value as T;
}

function isoDate(value: unknown, path: string) {
  const normalized = stringValue(value, path, 64);
  if (!Number.isFinite(Date.parse(normalized))) throw new AudioEngineValidationError(`${path} doit être une date ISO.`);
  return normalized;
}

function stringArray(value: unknown, path: string, maxItems = 64) {
  if (!Array.isArray(value) || value.length > maxItems) throw new AudioEngineValidationError(`${path} doit être une liste bornée.`);
  return value.map((item, index) => stringValue(item, `${path}[${index}]`, 128));
}

export function parseAudioEngineHealth(value: unknown): AudioEngineHealth {
  const source = record(value, "health");
  const service = enumValue(source.service, [AUDIO_ENGINE_SERVICE_NAME] as const, "health.service");
  const audioPlane = source.audioPlane === undefined
    ? "unavailable"
    : enumValue(source.audioPlane, ["unavailable", "local_monitor", "room_ready"] as const, "health.audioPlane");
  const publicationSource = source.roomPublication === undefined
    ? null
    : record(source.roomPublication, "health.roomPublication");
  const roomPublication = publicationSource === null
    ? {
        status: "unavailable" as const,
        roomId: null,
        trackId: null,
        publisher: null,
        publishedAt: null,
      }
    : {
        status: enumValue(publicationSource.status, ["unavailable", "preparing", "published"] as const, "health.roomPublication.status"),
        roomId: nullableString(publicationSource.roomId, "health.roomPublication.roomId", 128),
        trackId: nullableString(publicationSource.trackId, "health.roomPublication.trackId", 256),
        publisher: publicationSource.publisher === null
          ? null
          : enumValue(publicationSource.publisher, ["native_webrtc", "pcm_bridge"] as const, "health.roomPublication.publisher"),
        publishedAt: publicationSource.publishedAt === null
          ? null
          : isoDate(publicationSource.publishedAt, "health.roomPublication.publishedAt"),
      };
  if (
    audioPlane === "room_ready"
    && (roomPublication.status !== "published"
      || !roomPublication.roomId
      || !roomPublication.trackId
      || !roomPublication.publisher
      || !roomPublication.publishedAt)
  ) {
    throw new AudioEngineValidationError("health.audioPlane ne peut être room_ready sans preuve complète de publication Room.");
  }
  if (roomPublication.status !== "published" && (
    roomPublication.trackId !== null
    || roomPublication.publisher !== null
    || roomPublication.publishedAt !== null
  )) {
    throw new AudioEngineValidationError("health.roomPublication contient une piste non publiée incohérente.");
  }
  return {
    service,
    status: enumValue(source.status, ["ok", "degraded"] as const, "health.status"),
    apiVersion: stringValue(source.apiVersion, "health.apiVersion", 32),
    engineVersion: stringValue(source.engineVersion, "health.engineVersion", 32),
    minWebClientVersion: stringValue(source.minWebClientVersion, "health.minWebClientVersion", 32),
    maxWebClientVersion: nullableString(source.maxWebClientVersion, "health.maxWebClientVersion", 32),
    sessionId: stringValue(source.sessionId, "health.sessionId", 128),
    uptimeSeconds: numberValue(source.uptimeSeconds, "health.uptimeSeconds", 0, 31_536_000),
    timestamp: isoDate(source.timestamp, "health.timestamp"),
    metersProtocol: enumValue(source.metersProtocol, ["websocket-v1"] as const, "health.metersProtocol"),
    audioPlane,
    roomPublication,
  };
}

function parseDevice(value: unknown, index: number): AudioEngineDevice {
  const path = `devices[${index}]`;
  const source = record(value, path);
  const sampleRates = source.sampleRates;
  if (!Array.isArray(sampleRates) || sampleRates.length > 16) throw new AudioEngineValidationError(`${path}.sampleRates doit être une liste bornée.`);
  return {
    id: stringValue(source.id, `${path}.id`, 128),
    kind: enumValue(source.kind, ["audio_input", "audio_output", "midi_input", "midi_output"] as const, `${path}.kind`),
    label: stringValue(source.label, `${path}.label`, 256),
    isDefault: booleanValue(source.isDefault, `${path}.isDefault`),
    selected: booleanValue(source.selected, `${path}.selected`),
    status: enumValue(source.status, ["available", "busy", "unavailable"] as const, `${path}.status`),
    channels: numberValue(source.channels, `${path}.channels`, 0, 128),
    sampleRates: sampleRates.map((rate, rateIndex) => numberValue(rate, `${path}.sampleRates[${rateIndex}]`, 8_000, 384_000)),
  };
}

export function parseAudioEngineDevices(value: unknown): AudioEngineDevice[] {
  if (!Array.isArray(value) || value.length > 128) throw new AudioEngineValidationError("devices doit être une liste bornée.");
  const devices = value.map(parseDevice);
  if (new Set(devices.map((device) => device.id)).size !== devices.length) throw new AudioEngineValidationError("devices contient des identifiants dupliqués.");
  return devices;
}

function parsePlugin(value: unknown, index: number): AudioEnginePlugin {
  const path = `plugins[${index}]`;
  const source = record(value, path);
  const plugin: AudioEnginePlugin = {
    id: stringValue(source.id, `${path}.id`, 160),
    name: stringValue(source.name, `${path}.name`, 256),
    vendor: stringValue(source.vendor, `${path}.vendor`, 256),
    version: stringValue(source.version, `${path}.version`, 64),
    format: enumValue(source.format, ["builtin", "vst3"] as const, `${path}.format`),
    status: enumValue(source.status, ["ready", "disabled", "missing", "unlicensed", "scan_error"] as const, `${path}.status`),
    licensed: booleanValue(source.licensed, `${path}.licensed`),
    hasEditor: booleanValue(source.hasEditor, `${path}.hasEditor`),
    latencySamples: numberValue(source.latencySamples, `${path}.latencySamples`, 0, 1_000_000),
    capabilities: stringArray(source.capabilities, `${path}.capabilities`, 64),
  };
  if (plugin.status === "ready" && plugin.format !== "builtin" && !plugin.licensed) {
    throw new AudioEngineValidationError(`${path} ne peut pas être prêt sans licence confirmée.`);
  }
  return plugin;
}

export function parseAudioEnginePlugins(value: unknown): AudioEnginePlugin[] {
  if (!Array.isArray(value) || value.length > 1_024) throw new AudioEngineValidationError("plugins doit être une liste bornée.");
  const plugins = value.map(parsePlugin);
  if (new Set(plugins.map((plugin) => plugin.id)).size !== plugins.length) throw new AudioEngineValidationError("plugins contient des identifiants dupliqués.");
  return plugins;
}

function canonicalProvider(value: unknown, path: string) {
  const provider = stringValue(value, path, 128);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(provider)) throw new AudioEngineValidationError(`${path} doit être un identifiant canonique, jamais un chemin.`);
  return provider;
}

export function parseAudioEngineChain(value: unknown): AudioEngineChain {
  const source = record(value, "chain");
  const tuning = record(source.vocalTuning, "chain.vocalTuning");
  const compressor = record(source.compressor, "chain.compressor");
  const reverb = record(source.reverb, "chain.reverb");
  return {
    inputGainDb: numberValue(source.inputGainDb, "chain.inputGainDb", -60, 24),
    vocalTuning: {
      enabled: booleanValue(tuning.enabled, "chain.vocalTuning.enabled"),
      provider: canonicalProvider(tuning.provider, "chain.vocalTuning.provider"),
      key: stringValue(tuning.key, "chain.vocalTuning.key", 16),
      scale: stringValue(tuning.scale, "chain.vocalTuning.scale", 32),
      correctionAmount: numberValue(tuning.correctionAmount, "chain.vocalTuning.correctionAmount", 0, 1),
      retuneSpeed: numberValue(tuning.retuneSpeed, "chain.vocalTuning.retuneSpeed", 0, 1),
      humanize: numberValue(tuning.humanize, "chain.vocalTuning.humanize", 0, 1),
      formant: numberValue(tuning.formant, "chain.vocalTuning.formant", 0, 1),
    },
    compressor: {
      provider: canonicalProvider(compressor.provider, "chain.compressor.provider"),
      amount: numberValue(compressor.amount, "chain.compressor.amount", 0, 1),
    },
    reverb: {
      provider: canonicalProvider(reverb.provider, "chain.reverb.provider"),
      amount: numberValue(reverb.amount, "chain.reverb.amount", 0, 1),
    },
    masterGainDb: numberValue(source.masterGainDb, "chain.masterGainDb", -60, 12),
  };
}

function parseMeterChannel(value: unknown, path: string): AudioEngineMeterChannel {
  const source = record(value, path);
  return {
    id: stringValue(source.id, `${path}.id`, 128),
    rmsDb: numberValue(source.rmsDb, `${path}.rmsDb`, -180, 24),
    peakDb: numberValue(source.peakDb, `${path}.peakDb`, -180, 24),
    clipping: booleanValue(source.clipping, `${path}.clipping`),
  };
}

export function parseAudioEngineMeterFrame(value: unknown): AudioEngineMeterFrame {
  const source = record(value, "meterFrame");
  if (!Array.isArray(source.input) || source.input.length > 128) throw new AudioEngineValidationError("meterFrame.input doit être une liste bornée.");
  if (!Array.isArray(source.output) || source.output.length > 128) throw new AudioEngineValidationError("meterFrame.output doit être une liste bornée.");
  return {
    sequence: numberValue(source.sequence, "meterFrame.sequence", 0, Number.MAX_SAFE_INTEGER),
    timestamp: isoDate(source.timestamp, "meterFrame.timestamp"),
    input: source.input.map((item, index) => parseMeterChannel(item, `meterFrame.input[${index}]`)),
    output: source.output.map((item, index) => parseMeterChannel(item, `meterFrame.output[${index}]`)),
  };
}

export function parseAudioEngineMonitoring(value: unknown): AudioEngineMonitoring {
  const source = record(value, "monitoring");
  return {
    enabled: booleanValue(source.enabled, "monitoring.enabled"),
    outputDeviceId: nullableString(source.outputDeviceId, "monitoring.outputDeviceId", 128),
    gain: numberValue(source.gain, "monitoring.gain", 0, 2),
    latencyMs: numberValue(source.latencyMs, "monitoring.latencyMs", 0, 5_000),
  };
}

export function parseAudioEnginePairingTicket(value: unknown): AudioEnginePairingTicket {
  const source = record(value, "pairingTicket");
  const ticket = {
    pairingId: stringValue(source.pairingId, "pairingTicket.pairingId", 128),
    token: stringValue(source.token, "pairingTicket.token", 8_192),
    expiresAt: isoDate(source.expiresAt, "pairingTicket.expiresAt"),
  };
  const expiresAt = Date.parse(ticket.expiresAt);
  const remaining = expiresAt - Date.now();
  if (remaining <= 0 || remaining > 60_000) throw new AudioEngineValidationError("Le ticket d’association est expiré ou dépasse 60 secondes.");
  return ticket;
}

export function parseAudioEngineSessionHandshake(value: unknown, expectedPairingId: string): AudioEngineSessionHandshake {
  const source = record(value, "sessionHandshake");
  const result = {
    pairingId: stringValue(source.pairingId, "sessionHandshake.pairingId", 128),
    sessionId: stringValue(source.sessionId, "sessionHandshake.sessionId", 128),
    sessionSecret: stringValue(source.sessionSecret, "sessionHandshake.sessionSecret", 512),
    ticketProof: stringValue(source.ticketProof, "sessionHandshake.ticketProof", 512),
  };
  if (result.pairingId !== expectedPairingId) throw new AudioEngineValidationError("Résultat d’association incohérent.");
  if (result.sessionSecret.length < 43 || !/^[A-Za-z0-9_-]+$/u.test(result.sessionSecret)) {
    throw new AudioEngineValidationError("Secret de session local base64url invalide ou trop court.");
  }
  if (result.ticketProof.length < 43 || !/^[A-Za-z0-9_-]+$/u.test(result.ticketProof)) {
    throw new AudioEngineValidationError("Preuve du ticket d’association invalide ou trop courte.");
  }
  return result;
}

export function parseAudioEngineEnvelope<T>(value: unknown, parseData: (data: unknown) => T): AudioEngineResponseEnvelope<T> {
  const source = record(value, "response");
  const requestId = stringValue(source.requestId, "response.requestId", 128);
  const ok = booleanValue(source.ok, "response.ok");
  if (!ok) {
    const error = record(source.error, "response.error");
    const failure: AudioEngineFailureEnvelope = {
      ok: false,
      requestId,
      error: {
        code: stringValue(error.code, "response.error.code", 128),
        message: stringValue(error.message, "response.error.message", 1_024),
      },
    };
    return failure;
  }
  return { ok: true, requestId, data: parseData(source.data) };
}
