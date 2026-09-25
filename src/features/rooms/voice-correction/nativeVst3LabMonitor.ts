import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";
import { parseAudioEnginePlugins } from "../audio-engine/audioEngine.validators";

export const NATIVE_VST3_LAB_PLUGIN_IDS = [
  "antares.autotune",
  "sixthsample.spoton",
  "auburnsounds.graillon3",
] as const;

const NATIVE_VST3_LAB_INVENTORY_PLUGIN_IDS = [
  ...NATIVE_VST3_LAB_PLUGIN_IDS,
  "resonantcavity.voloco-producer",
] as const;

export type NativeVst3LabPluginId = typeof NATIVE_VST3_LAB_PLUGIN_IDS[number];
export type NativeVst3LabMonitorStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export type NativeVst3LabControls = {
  bypassed: boolean;
  /** Linear microphone input trim applied before the VST3. */
  inputGain: number;
  key: number;
  scale: number;
  amount: number;
  retune: number;
  humanize: number;
  reverbEnabled: boolean;
  reverbMix: number;
  reverbType: "room" | "plate" | "hall";
  reverbDuration: number;
  reverbPreDelayMs: number;
};

export const DEFAULT_NATIVE_VST3_LAB_CONTROLS: Readonly<NativeVst3LabControls> = Object.freeze({
  bypassed: false,
  inputGain: 1,
  key: 0,
  scale: 0,
  amount: 1,
  retune: 0.5,
  humanize: 0,
  reverbEnabled: false,
  reverbMix: 0,
  reverbType: "room",
  reverbDuration: 1.2,
  reverbPreDelayMs: 0,
});

export type NativeVst3LabMonitorSnapshot = {
  status: NativeVst3LabMonitorStatus;
  audioReady: boolean;
  pluginId: NativeVst3LabPluginId | null;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  forcedStop: boolean;
  message: string | null;
  stdoutTail: string;
  stderrTail: string;
};

const API_PREFIX = "/__meewav_audio_lab/native-monitor";
const TOKEN_META_NAME = "meewav-audio-lab-native-token";
const TOKEN_HEADER_NAME = "x-meewav-audio-lab-token";
const REQUEST_TIMEOUT_MS = 22_000;

function isPluginId(value: unknown): value is NativeVst3LabPluginId {
  return typeof value === "string"
    && (NATIVE_VST3_LAB_PLUGIN_IDS as readonly string[]).includes(value);
}

function isInventoryPluginId(value: unknown) {
  return typeof value === "string"
    && (NATIVE_VST3_LAB_INVENTORY_PLUGIN_IDS as readonly string[]).includes(value);
}

function nullableString(value: unknown, name: string) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Réponse native invalide : ${name}.`);
  return value;
}

function nullableNumber(value: unknown, name: string) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Réponse native invalide : ${name}.`);
  }
  return value;
}

function monitorSnapshot(value: unknown): NativeVst3LabMonitorSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Réponse native invalide.");
  }
  const source = value as Record<string, unknown>;
  const allowedStatuses: readonly string[] = ["idle", "starting", "running", "stopping", "stopped", "error"];
  if (typeof source.status !== "string" || !allowedStatuses.includes(source.status)) {
    throw new Error("Réponse native invalide : status.");
  }
  if (source.pluginId !== null && !isPluginId(source.pluginId)) {
    throw new Error("Réponse native invalide : pluginId.");
  }
  if (typeof source.audioReady !== "boolean"
    || typeof source.forcedStop !== "boolean"
    || typeof source.stdoutTail !== "string"
    || typeof source.stderrTail !== "string") {
    throw new Error("Réponse native invalide : diagnostics.");
  }
  return {
    status: source.status as NativeVst3LabMonitorStatus,
    audioReady: source.audioReady,
    pluginId: source.pluginId as NativeVst3LabPluginId | null,
    pid: nullableNumber(source.pid, "pid"),
    startedAt: nullableString(source.startedAt, "startedAt"),
    stoppedAt: nullableString(source.stoppedAt, "stoppedAt"),
    exitCode: nullableNumber(source.exitCode, "exitCode"),
    signal: nullableString(source.signal, "signal"),
    forcedStop: source.forcedStop,
    message: nullableString(source.message, "message"),
    stdoutTail: source.stdoutTail,
    stderrTail: source.stderrTail,
  };
}

function sessionToken() {
  const token = document.querySelector<HTMLMetaElement>(`meta[name="${TOKEN_META_NAME}"]`)?.content.trim();
  if (!token) {
    throw new Error("Le lanceur natif est indisponible. Ouvre La Place avec npm run dev:place-audio.");
  }
  return token;
}

async function requestNative<T>(
  suffix: "plugins" | "status" | "start" | "update" | "stop",
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  parsePayload: (payload: unknown) => T,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_PREFIX}/${suffix}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        [TOKEN_HEADER_NAME]: sessionToken(),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "same-origin",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new Error("Le lanceur natif a renvoyé une réponse inattendue.");
    }
    const payload = await response.json() as unknown;
    if (!response.ok) {
      const message = payload !== null
        && typeof payload === "object"
        && !Array.isArray(payload)
        && typeof (payload as Record<string, unknown>).error === "string"
        ? (payload as Record<string, string>).error
        : `Le lanceur natif a refusé la requête (${response.status}).`;
      throw new Error(message);
    }
    return parsePayload(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new Error("Le lanceur natif ne répond pas.") as Error & { cause?: unknown };
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function requestMonitor(
  suffix: "status" | "start" | "update" | "stop",
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
) {
  return requestNative(suffix, init, monitorSnapshot);
}

function nativeLabPlugins(value: unknown): AudioEnginePlugin[] {
  const plugins = parseAudioEnginePlugins(value);
  if (plugins.length > NATIVE_VST3_LAB_INVENTORY_PLUGIN_IDS.length
    || plugins.some((plugin) => !isInventoryPluginId(plugin.id))) {
    throw new Error("Réponse native invalide : inventaire de plugins non autorisé.");
  }
  return plugins;
}

function validatedControls(controls: NativeVst3LabControls): NativeVst3LabControls {
  if (typeof controls.bypassed !== "boolean"
    || !Number.isFinite(controls.inputGain)
    || controls.inputGain < 0
    || controls.inputGain > 1
    || !Number.isInteger(controls.key)
    || controls.key < 0
    || controls.key > 11
    || !Number.isInteger(controls.scale)
    || controls.scale < 0
    || controls.scale > 7
    || !Number.isFinite(controls.amount)
    || controls.amount < 0
    || controls.amount > 1
    || !Number.isFinite(controls.retune)
    || controls.retune < 0
    || controls.retune > 1
    || !Number.isFinite(controls.humanize)
    || controls.humanize < 0
    || controls.humanize > 1
    || typeof controls.reverbEnabled !== "boolean"
    || !Number.isFinite(controls.reverbMix)
    || controls.reverbMix < 0
    || controls.reverbMix > 1
    || !["room", "plate", "hall"].includes(controls.reverbType)
    || !Number.isFinite(controls.reverbDuration)
    || controls.reverbDuration < 0.2
    || controls.reverbDuration > 5
    || !Number.isFinite(controls.reverbPreDelayMs)
    || controls.reverbPreDelayMs < 0
    || controls.reverbPreDelayMs > 180) {
    throw new Error("Réglages VST3 natifs invalides ou non pris en charge.");
  }
  return {
    bypassed: controls.bypassed,
    inputGain: controls.inputGain,
    key: controls.key,
    scale: controls.scale,
    amount: controls.amount,
    retune: controls.retune,
    humanize: controls.humanize,
    reverbEnabled: controls.reverbEnabled,
    reverbMix: controls.reverbMix,
    reverbType: controls.reverbType,
    reverbDuration: controls.reverbDuration,
    reverbPreDelayMs: controls.reverbPreDelayMs,
  };
}

export function getNativeVst3LabMonitorStatus() {
  return requestMonitor("status", { method: "GET" });
}

export function getNativeVst3LabPlugins(): Promise<AudioEnginePlugin[]> {
  return requestNative("plugins", { method: "GET" }, nativeLabPlugins);
}

export function startNativeVst3LabMonitor(
  pluginId: NativeVst3LabPluginId,
  controls: NativeVst3LabControls = DEFAULT_NATIVE_VST3_LAB_CONTROLS,
) {
  if (!isPluginId(pluginId)) throw new Error("Plugin vocal natif non autorisé.");
  return requestMonitor("start", {
    method: "POST",
    body: { pluginId, headphonesConfirmed: true, controls: validatedControls(controls) },
  });
}

export function updateNativeVst3LabMonitorControls(controls: NativeVst3LabControls) {
  return requestMonitor("update", {
    method: "POST",
    body: { controls: validatedControls(controls) },
  });
}

export function stopNativeVst3LabMonitor() {
  return requestMonitor("stop", { method: "POST", body: {} });
}
