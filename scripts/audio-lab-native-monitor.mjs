import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { resolve, win32 } from "node:path";

const API_PREFIX = "/__meewav_audio_lab/native-monitor";
const TOKEN_META_NAME = "meewav-audio-lab-native-token";
const TOKEN_HEADER_NAME = "x-meewav-audio-lab-token";
const MAX_BODY_BYTES = 2_048;
const LOG_TAIL_BYTES = 16_384;
const GRACEFUL_STOP_TIMEOUT_MS = 3_000;
const FORCE_STOP_TIMEOUT_MS = 1_000;
const AUDIO_READY_TIMEOUT_MS = 15_000;
const CONTROL_APPLY_TIMEOUT_MS = 5_000;
const AUDIO_READY_MARKER = "MEEWAV_AUDIO_CONTROL_READY";
const MAX_PLUGIN_SCAN_ENTRIES = 16_384;
const MAX_PLUGIN_SCAN_DEPTH = 10;

const ALLOWED_PLUGIN_IDS = new Set([
  "antares.autotune",
  "sixthsample.spoton",
  "auburnsounds.graillon3",
]);

const NATIVE_PLUGIN_INVENTORY = Object.freeze([
  Object.freeze({
    id: "antares.autotune",
    name: "Auto-Tune Pro",
    vendor: "Antares",
    version: "11.0.0",
    bundleNames: Object.freeze(["Auto-Tune Pro.vst3", "Auto-Tune.vst3"]),
    latencySamples: 2_670,
    liveControlsVerified: true,
  }),
  Object.freeze({
    id: "resonantcavity.voloco-producer",
    name: "Voloco Producer",
    vendor: "Resonant Cavity",
    version: "inconnue",
    bundleNames: Object.freeze(["Voloco Producer.vst3", "Voloco.vst3"]),
    latencySamples: 0,
    liveControlsVerified: false,
  }),
  Object.freeze({
    id: "sixthsample.spoton",
    name: "Spoton",
    vendor: "Sixth Sample",
    version: "1.1.2",
    bundleNames: Object.freeze(["Spoton.vst3"]),
    latencySamples: 0,
    liveControlsVerified: true,
  }),
  Object.freeze({
    id: "auburnsounds.graillon3",
    name: "Graillon 3",
    vendor: "Auburn Sounds",
    version: "3.2.0",
    bundleNames: Object.freeze(["Auburn Sounds Graillon 3.vst3", "Graillon 3.vst3"]),
    latencySamples: 1_074,
    liveControlsVerified: true,
  }),
]);

const DEFAULT_NATIVE_CONTROLS = Object.freeze({
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

function appendTail(current, chunk) {
  const next = `${current}${chunk.toString("utf8")}`;
  return next.length > LOG_TAIL_BYTES ? next.slice(-LOG_TAIL_BYTES) : next;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = address.toLowerCase();
  return normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "::ffff:127.0.0.1";
}

function singleHeader(value) {
  return Array.isArray(value) ? null : value ?? null;
}

function requestOriginMatchesHost(request, requireOrigin) {
  const host = singleHeader(request.headers.host);
  if (!host) return false;

  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;

  const fetchSite = singleHeader(request.headers["sec-fetch-site"]);
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = singleHeader(request.headers.origin);
  if (requireOrigin && !origin) return false;
  const source = origin ?? singleHeader(request.headers.referer);
  if (!source) return false;

  try {
    const sourceUrl = new URL(source);
    return (sourceUrl.protocol === "http:" || sourceUrl.protocol === "https:")
      && sourceUrl.host === host
      && isLoopbackHostname(sourceUrl.hostname);
  } catch {
    return false;
  }
}

function tokenMatches(request, expectedToken) {
  const received = singleHeader(request.headers[TOKEN_HEADER_NAME]);
  if (!received) return false;
  const expectedBuffer = Buffer.from(expectedToken);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", String(Buffer.byteLength(body)));
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(body);
}

async function readJsonBody(request) {
  const contentType = singleHeader(request.headers["content-type"]);
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    const error = new Error("Le corps doit être envoyé en JSON.");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("La requête dépasse la taille autorisée.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Le corps JSON est invalide.");
    error.statusCode = 400;
    throw error;
  }
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validNativeControls(value) {
  return plainObject(value)
    && Object.keys(value).length === 12
    && Object.keys(value).every((key) => [
      "bypassed",
      "inputGain",
      "key",
      "scale",
      "amount",
      "retune",
      "humanize",
      "reverbEnabled",
      "reverbMix",
      "reverbType",
      "reverbDuration",
      "reverbPreDelayMs",
    ].includes(key))
    && typeof value.bypassed === "boolean"
    && Number.isFinite(value.inputGain)
    && value.inputGain >= 0
    && value.inputGain <= 1
    && Number.isInteger(value.key)
    && value.key >= 0
    && value.key <= 11
    && Number.isInteger(value.scale)
    && value.scale >= 0
    && value.scale <= 7
    && Number.isFinite(value.amount)
    && value.amount >= 0
    && value.amount <= 1
    && Number.isFinite(value.retune)
    && value.retune >= 0
    && value.retune <= 1
    && Number.isFinite(value.humanize)
    && value.humanize >= 0
    && value.humanize <= 1
    && typeof value.reverbEnabled === "boolean"
    && Number.isFinite(value.reverbMix)
    && value.reverbMix >= 0
    && value.reverbMix <= 1
    && ["room", "plate", "hall"].includes(value.reverbType)
    && Number.isFinite(value.reverbDuration)
    && value.reverbDuration >= 0.2
    && value.reverbDuration <= 5
    && Number.isFinite(value.reverbPreDelayMs)
    && value.reverbPreDelayMs >= 0
    && value.reverbPreDelayMs <= 180;
}

function nativeControlCommand(controls) {
  return `set bypass=${controls.bypassed ? 1 : 0} input_gain=${controls.inputGain.toFixed(6)} key=${controls.key} scale=${controls.scale} amount=${controls.amount.toFixed(6)} retune=${controls.retune.toFixed(6)} humanize=${controls.humanize.toFixed(6)} reverb_enabled=${controls.reverbEnabled ? 1 : 0} reverb_mix=${controls.reverbMix.toFixed(6)} reverb_type=${controls.reverbType} reverb_duration=${controls.reverbDuration.toFixed(6)} reverb_predelay_ms=${controls.reverbPreDelayMs.toFixed(6)}\n`;
}

function nativeHostExecutablePath(projectRoot) {
  return resolve(
    projectRoot,
    "apps",
    "meewav-audio-engine",
    "build-vst3-poc",
    "Release",
    "meewav-vst3-live-poc.exe",
  );
}

function nonEmptyPath(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function appendPluginRoot(roots, path, formats) {
  const normalized = nonEmptyPath(path);
  if (!normalized) return;
  const safeFormats = [...new Set(formats)].filter((format) => format === "vst2" || format === "vst3");
  if (safeFormats.length === 0) return;
  roots.push({
    path: win32.normalize(normalized),
    formats: safeFormats,
  });
}

function appendEnvironmentPluginRoots(roots, value, formats) {
  const paths = nonEmptyPath(value)?.split(";") ?? [];
  for (const path of paths) appendPluginRoot(roots, path, formats);
}

/**
 * Windows does not have a single VST2 registry. DAWs therefore search a
 * conventional set of locations and let advanced users add trusted roots.
 * These roots are built only in the local Node bridge; the browser can neither
 * provide nor read them.
 */
export function windowsCommonPluginRoots(options = {}) {
  const roots = [];
  const programFiles = options.programFiles ?? process.env.ProgramFiles ?? null;
  const programFilesX86 = options.programFilesX86 ?? process.env["ProgramFiles(x86)"] ?? null;
  const commonProgramFiles = options.commonProgramFiles ?? process.env.CommonProgramFiles ?? null;
  const commonProgramFilesX86 = options.commonProgramFilesX86
    ?? process.env["CommonProgramFiles(x86)"]
    ?? null;
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA ?? null;
  const appData = options.appData ?? process.env.APPDATA ?? null;
  const userProfile = options.userProfile ?? process.env.USERPROFILE ?? null;
  const systemDrive = options.systemDrive ?? process.env.SystemDrive ?? "C:";

  const addFromBase = (base, suffix, formats) => {
    const normalizedBase = nonEmptyPath(base);
    if (normalizedBase) appendPluginRoot(roots, win32.join(normalizedBase, ...suffix), formats);
  };

  // VST3 standard locations, plus the user-local variants used by several
  // independent installers.
  addFromBase(commonProgramFiles, ["VST3"], ["vst3"]);
  addFromBase(commonProgramFilesX86, ["VST3"], ["vst3"]);
  addFromBase(programFiles, ["Common Files", "VST3"], ["vst3"]);
  addFromBase(programFilesX86, ["Common Files", "VST3"], ["vst3"]);
  addFromBase(localAppData, ["Programs", "Common", "VST3"], ["vst3"]);
  addFromBase(localAppData, ["VST3"], ["vst3"]);
  addFromBase(appData, ["VST3"], ["vst3"]);

  // Common VST2 roots used by FL Studio, Cubase, Cakewalk, Studio One and
  // older vendor installers. DLLs found here are inventory-only: this bridge
  // never LoadLibrary()s them.
  for (const base of [programFiles, programFilesX86]) {
    addFromBase(base, ["VstPlugins"], ["vst2", "vst3"]);
    addFromBase(base, ["Steinberg", "VstPlugins"], ["vst2", "vst3"]);
    addFromBase(base, ["Common Files", "VST2"], ["vst2"]);
    addFromBase(base, ["Common Files", "Steinberg", "VST2"], ["vst2"]);
    addFromBase(base, ["Cakewalk", "VstPlugins"], ["vst2", "vst3"]);
    addFromBase(base, ["PreSonus", "Vstplugins"], ["vst2", "vst3"]);
    addFromBase(base, ["Native Instruments", "VSTPlugins 64 bit"], ["vst2"]);
    addFromBase(base, ["Native Instruments", "VSTPlugins 32 bit"], ["vst2"]);
  }
  addFromBase(userProfile, ["Documents", "VSTPlugins"], ["vst2", "vst3"]);
  addFromBase(userProfile, ["VSTPlugins"], ["vst2", "vst3"]);
  addFromBase(systemDrive, ["VSTPlugins"], ["vst2", "vst3"]);
  addFromBase(systemDrive, ["Vst64"], ["vst2", "vst3"]);

  // Optional paths are trusted local bridge configuration, never request
  // data. This mirrors the extra search paths a user may configure in a DAW.
  appendEnvironmentPluginRoots(
    roots,
    options.vst3Path ?? process.env.VST3_PATH,
    ["vst3"],
  );
  appendEnvironmentPluginRoots(
    roots,
    options.vst2Path ?? process.env.VST2_PATH ?? process.env.VST_PATH,
    ["vst2", "vst3"],
  );
  for (const extraRoot of options.extraRoots ?? []) {
    if (typeof extraRoot === "string") {
      appendPluginRoot(roots, extraRoot, ["vst2", "vst3"]);
    } else if (extraRoot && typeof extraRoot === "object") {
      appendPluginRoot(roots, extraRoot.path, extraRoot.formats ?? ["vst2", "vst3"]);
    }
  }

  const uniqueRoots = new Map();
  for (const root of roots) {
    const key = root.path.toLowerCase();
    const existing = uniqueRoots.get(key);
    if (existing) {
      existing.formats = [...new Set([...existing.formats, ...root.formats])];
    } else {
      uniqueRoots.set(key, root);
    }
  }
  return [...uniqueRoots.values()];
}

function windowsStandardVst3Roots(options = {}) {
  return windowsCommonPluginRoots(options)
    .filter((root) => root.formats.includes("vst3"))
    .map((root) => root.path);
}

function sanitizedPluginFileName(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return null;
  if (value === "." || value === ".." || win32.basename(value) !== value) return null;
  if (/[\u0000-\u001F\u007F]/u.test(value)) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Scans only operating-system standard VST3 roots. The result contains bundle
 * names, never paths, and traversal is bounded to keep a damaged directory or
 * an unexpectedly large installation from blocking the local bridge.
 */
export function scanStandardWindowsPluginBundles(options = {}) {
  const pathExists = options.pathExists ?? existsSync;
  const readDirectory = options.readDirectory
    ?? ((path) => readdirSync(path, { withFileTypes: true }));
  const configuredRoots = options.roots ?? windowsCommonPluginRoots(options);
  const roots = configuredRoots.map((root) => typeof root === "string"
    ? { path: win32.normalize(root), formats: ["vst3"] }
    : {
        path: win32.normalize(root.path),
        formats: [...new Set(root.formats ?? ["vst2", "vst3"])],
      });
  const pending = roots.map((root) => ({ ...root, depth: 0 }));
  const plugins = new Map();
  let inspectedEntries = 0;

  while (pending.length > 0 && inspectedEntries < MAX_PLUGIN_SCAN_ENTRIES) {
    const current = pending.shift();
    if (!current || !pathExists(current.path)) continue;
    let entries;
    try {
      entries = readDirectory(current.path);
    } catch {
      continue;
    }
    for (const entry of entries) {
      inspectedEntries += 1;
      if (inspectedEntries > MAX_PLUGIN_SCAN_ENTRIES) break;
      const name = sanitizedPluginFileName(typeof entry === "string" ? entry : entry?.name);
      if (!name) continue;
      const childPath = win32.join(current.path, name);
      const lowerName = name.toLowerCase();
      if (current.formats.includes("vst3") && lowerName.endsWith(".vst3")) {
        plugins.set(`vst3:${lowerName}`, Object.freeze({ format: "vst3", name }));
        continue;
      }
      if (current.formats.includes("vst2") && lowerName.endsWith(".dll")) {
        plugins.set(`vst2:${lowerName}`, Object.freeze({ format: "vst2", name }));
        continue;
      }
      const isDirectory = typeof entry !== "string" && typeof entry?.isDirectory === "function"
        && entry.isDirectory();
      if (isDirectory && current.depth < MAX_PLUGIN_SCAN_DEPTH) {
        pending.push({
          path: childPath,
          formats: current.formats,
          depth: current.depth + 1,
        });
      }
    }
  }
  return [...plugins.values()];
}

/**
 * Compatibility wrapper retained for callers that only need VST3 names.
 * Its return value is intentionally path-free.
 */
export function scanStandardWindowsVst3Bundles(options = {}) {
  return new Set(scanStandardWindowsPluginBundles(options)
    .filter((plugin) => plugin.format === "vst3")
    .map((plugin) => plugin.name.toLowerCase()));
}

/**
 * Returns a deliberately bounded public inventory. Paths are resolved only
 * inside engine-owned standard VST3 roots and are never included in the result.
 */
export function createNativeVst3LabPluginInventory(projectRoot, options = {}) {
  const hostPlatform = options.platform ?? process.platform;
  const pathExists = options.pathExists ?? options.executableExists ?? existsSync;
  const hostAvailable = hostPlatform === "win32"
    && pathExists(nativeHostExecutablePath(projectRoot));
  const roots = hostPlatform === "win32" ? windowsStandardVst3Roots(options) : [];
  const discoveredBundles = hostPlatform === "win32"
    ? scanStandardWindowsVst3Bundles({
        ...options,
        roots,
        pathExists,
      })
    : new Set();

  return NATIVE_PLUGIN_INVENTORY.map((plugin) => {
    // Exact root checks remain as a fail-safe if directory enumeration is
    // denied, while the recursive scan also detects vendor subdirectories.
    const bundleAvailable = hostPlatform === "win32" && (
      plugin.bundleNames.some((bundleName) => discoveredBundles.has(bundleName.toLowerCase()))
      || roots.some((root) => plugin.bundleNames.some(
        (bundleName) => pathExists(win32.join(root, bundleName)),
      ))
    );
    const detectedCandidate = hostAvailable && bundleAvailable && plugin.liveControlsVerified;
    return {
      id: plugin.id,
      name: plugin.name,
      vendor: plugin.vendor,
      version: bundleAvailable ? "inconnue" : plugin.version,
      format: "vst3",
      // A filename scan is not proof that a native module can load, that its
      // architecture matches, or that the vendor licence is activated. The
      // explicit start action performs the sandboxed metadata/class-ID probe
      // before this candidate can become the active local monitor.
      status: bundleAvailable ? "disabled" : hostAvailable ? "missing" : "disabled",
      licensed: false,
      hasEditor: false,
      latencySamples: 0,
      capabilities: [
        "pitch_correction",
        "laboratory_only",
        ...(plugin.liveControlsVerified ? ["local_monitoring"] : ["compatibility_unverified"]),
        ...(bundleAvailable ? ["detected_local"] : []),
        ...(detectedCandidate ? ["probe_required", "native_host_available"] : []),
      ],
    };
  });
}

function latestAppliedControlRevision(output) {
  let latest = 0;
  for (const match of output.matchAll(/MEEWAV_AUDIO_CONTROL_APPLIED revision=(\d+)/g)) {
    const revision = Number(match[1]);
    if (Number.isSafeInteger(revision) && revision > latest) latest = revision;
  }
  return latest;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", handleExit);
      resolveExit(false);
    }, timeoutMs);
    const handleExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once("exit", handleExit);
  });
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForAudioReady(child, timeoutMs, isAlreadyReady) {
  return new Promise((resolveReady, rejectReady) => {
    let output = "";
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.removeListener("data", handleData);
      child.removeListener("error", handleError);
      child.removeListener("exit", handleExit);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveReady();
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectReady(error);
    };
    const handleData = (chunk) => {
      output = appendTail(output, chunk);
      if ((output.includes(AUDIO_READY_MARKER) && latestAppliedControlRevision(output) > 0)
        || isAlreadyReady()) {
        resolveOnce();
      }
    };
    const handleError = (error) => {
      rejectOnce(new Error("Le processus de monitoring natif n’a pas pu démarrer.", { cause: error }));
    };
    const handleExit = (exitCode, signal) => {
      rejectOnce(new Error(
        `Le monitoring natif s’est arrêté avant l’ouverture audio (code ${exitCode ?? "inconnu"}, signal ${signal ?? "aucun"}).`,
      ));
    };
    const timer = setTimeout(() => {
      rejectOnce(new Error("Le plugin ou le périphérique audio n’a pas répondu dans le délai prévu."));
    }, timeoutMs);

    child.stdout?.on("data", handleData);
    child.once("error", handleError);
    child.once("exit", handleExit);
    if (isAlreadyReady()) resolveOnce();
  });
}

function waitForControlApplied(child, timeoutMs, isAlreadyApplied) {
  return new Promise((resolveApplied, rejectApplied) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.removeListener("data", handleData);
      child.stdin?.removeListener("error", handleInputError);
      child.removeListener("error", handleError);
      child.removeListener("exit", handleExit);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveApplied();
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectApplied(error);
    };
    const handleData = () => {
      if (isAlreadyApplied()) resolveOnce();
    };
    const handleInputError = (error) => {
      rejectOnce(new Error("Le canal de contrôle natif a refusé les réglages.", { cause: error }));
    };
    const handleError = (error) => {
      rejectOnce(new Error("Le processus de monitoring natif a rejeté les réglages.", { cause: error }));
    };
    const handleExit = (exitCode, signal) => {
      rejectOnce(new Error(
        `Le monitoring natif s’est arrêté avant d’appliquer les réglages (code ${exitCode ?? "inconnu"}, signal ${signal ?? "aucun"}).`,
      ));
    };
    const timer = setTimeout(() => {
      rejectOnce(new Error("Le VST3 natif n’a pas confirmé l’application des réglages."));
    }, timeoutMs);

    child.stdout?.on("data", handleData);
    child.stdin?.once("error", handleInputError);
    child.once("error", handleError);
    child.once("exit", handleExit);
    if (isAlreadyApplied()) resolveOnce();
  });
}

function createNativeMonitorSupervisor(projectRoot, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  const pathExists = options.pathExists ?? options.executableExists ?? existsSync;
  const hostPlatform = options.platform ?? process.platform;
  const readyTimeoutMs = options.audioReadyTimeoutMs ?? AUDIO_READY_TIMEOUT_MS;
  const controlApplyTimeoutMs = options.controlApplyTimeoutMs ?? CONTROL_APPLY_TIMEOUT_MS;
  const gracefulStopTimeoutMs = options.gracefulStopTimeoutMs ?? GRACEFUL_STOP_TIMEOUT_MS;
  const forceStopTimeoutMs = options.forceStopTimeoutMs ?? FORCE_STOP_TIMEOUT_MS;
  const executablePath = nativeHostExecutablePath(projectRoot);
  let child = null;
  let pendingControlAfterRevision = null;
  let controlUpdateTail = Promise.resolve();
  let state = {
    status: "idle",
    audioReady: false,
    controlsApplied: false,
    appliedControlRevision: 0,
    pluginId: null,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    exitCode: null,
    signal: null,
    forcedStop: false,
    message: null,
    controls: { ...DEFAULT_NATIVE_CONTROLS },
    stdoutTail: "",
    stderrTail: "",
  };

  const snapshot = () => ({ ...state });

  const terminateTarget = async (target) => {
    if (!target.pid || hasExited(target)) return { exited: true, forcedStop: false };

    try {
      if (target.stdin?.writable) target.stdin.end("STOP\n");
    } catch {
      // The signal fallbacks below still retain supervision until exit.
    }

    let exited = await waitForExit(target, gracefulStopTimeoutMs);
    let forcedStop = false;
    if (!exited) {
      forcedStop = true;
      try {
        target.kill("SIGTERM");
      } catch {
        // A failed signal is not proof of process death; keep supervising it.
      }
      exited = await waitForExit(target, forceStopTimeoutMs);
    }
    if (!exited) {
      try {
        target.kill("SIGKILL");
      } catch {
        // A failed signal is not proof of process death; keep supervising it.
      }
      exited = await waitForExit(target, forceStopTimeoutMs);
    }
    return { exited: exited || hasExited(target), forcedStop };
  };

  const recordExit = (target, exitCode, signal) => {
    if (child !== target) return;
    pendingControlAfterRevision = null;
    const stoppedByRequest = state.status === "stopping";
    state = {
      ...state,
      status: stoppedByRequest || exitCode === 0 ? "stopped" : "error",
      audioReady: false,
      controlsApplied: false,
      pid: null,
      stoppedAt: new Date().toISOString(),
      exitCode,
      signal,
      message: stoppedByRequest || exitCode === 0
        ? null
        : `Le monitoring natif s’est arrêté avec le code ${exitCode ?? "inconnu"}.`,
    };
    child = null;
  };

  const start = async (pluginId, controls = DEFAULT_NATIVE_CONTROLS) => {
    if (hostPlatform !== "win32") {
      const error = new Error("Le POC VST3 live est disponible uniquement sous Windows x64.");
      error.statusCode = 501;
      throw error;
    }
    if (!ALLOWED_PLUGIN_IDS.has(pluginId)) {
      const error = new Error("Ce plugin n’est pas autorisé dans le laboratoire natif.");
      error.statusCode = 400;
      throw error;
    }
    if (!validNativeControls(controls)) {
      const error = new Error("Les réglages natifs sont invalides ou non pris en charge.");
      error.statusCode = 400;
      throw error;
    }
    if (child && hasExited(child)) child = null;
    if (child) {
      const error = new Error(state.pluginId === pluginId
        ? "Ce monitoring natif est déjà actif."
        : "Arrête le monitoring natif actif avant de choisir un autre plugin.");
      error.statusCode = 409;
      throw error;
    }
    if (!pathExists(executablePath)) {
      const error = new Error("Le POC VST3 live n’est pas compilé. Construis d’abord meewav-vst3-live-poc.");
      error.statusCode = 503;
      throw error;
    }

    state = {
      status: "starting",
      audioReady: false,
      controlsApplied: false,
      appliedControlRevision: 0,
      pluginId,
      pid: null,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      signal: null,
      forcedStop: false,
      message: null,
      controls: { ...controls },
      stdoutTail: "",
      stderrTail: "",
    };

    let target;
    try {
      target = spawnProcess(executablePath, [
        "--plugin",
        pluginId,
        "--confirm-headphones",
        "--control-stdin",
      ], {
        cwd: projectRoot,
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        status: "error",
        stoppedAt: new Date().toISOString(),
        message,
      };
      const launchError = new Error(message, { cause: error });
      launchError.statusCode = 503;
      throw launchError;
    }
    child = target;
    pendingControlAfterRevision = 0;
    controlUpdateTail = Promise.resolve();
    state = { ...state, pid: target.pid ?? null };
    target.stdin?.on("error", (error) => {
      if (child !== target) return;
      const message = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        message: `Le canal de contrôle natif a échoué : ${message}`,
        stderrTail: appendTail(state.stderrTail, `\nstdin: ${message}`),
      };
    });
    target.stdout?.on("data", (chunk) => {
      if (child !== target) return;
      const stdoutTail = appendTail(state.stdoutTail, chunk);
      const appliedControlRevision = Math.max(
        state.appliedControlRevision,
        latestAppliedControlRevision(stdoutTail),
      );
      let controlsApplied = state.controlsApplied;
      if (pendingControlAfterRevision !== null
        && appliedControlRevision > pendingControlAfterRevision) {
        pendingControlAfterRevision = null;
        controlsApplied = true;
      }
      state = {
        ...state,
        stdoutTail,
        audioReady: state.audioReady || stdoutTail.includes(AUDIO_READY_MARKER),
        controlsApplied,
        appliedControlRevision,
      };
    });
    target.stderr?.on("data", (chunk) => {
      if (child === target) state = { ...state, stderrTail: appendTail(state.stderrTail, chunk) };
    });
    target.on("error", (error) => {
      if (child !== target) return;
      const message = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        status: target.pid ? state.status : "error",
        audioReady: target.pid ? state.audioReady : false,
        pid: target.pid ?? null,
        stoppedAt: target.pid ? state.stoppedAt : new Date().toISOString(),
        message,
      };
      // A post-spawn error (for example, a failed kill) is not proof that the
      // native process died. Only release the handle when no process existed.
      if (!target.pid) child = null;
    });
    target.once("exit", (exitCode, signal) => recordExit(target, exitCode, signal));

    try {
      if (!target.stdin?.writable) {
        throw new Error("Le canal de contrôle natif n’est pas disponible.");
      }
      target.stdin.write(nativeControlCommand(controls));
      await waitForAudioReady(
        target,
        readyTimeoutMs,
        () => child === target && state.audioReady && state.controlsApplied
          && state.appliedControlRevision > 0,
      );
      if (child !== target || hasExited(target) || state.status === "stopping") {
        throw new Error("Le monitoring natif s’est arrêté pendant son initialisation audio.");
      }
      state = {
        ...state,
        status: "running",
        audioReady: true,
        controlsApplied: true,
        pid: target.pid ?? null,
      };
      return snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pendingControlAfterRevision = null;
      const cancelledByStop = state.status === "stopping";
      const termination = await terminateTarget(target);
      const processStillSupervised = child === target && !termination.exited;
      if (termination.exited && child === target) child = null;
      if (child === target || child === null) {
        state = {
          ...state,
          status: processStillSupervised ? "stopping" : cancelledByStop ? "stopped" : "error",
          audioReady: processStillSupervised ? state.audioReady : false,
          controlsApplied: processStillSupervised ? state.controlsApplied : false,
          pid: processStillSupervised ? target.pid ?? state.pid : null,
          stoppedAt: processStillSupervised ? null : new Date().toISOString(),
          forcedStop: termination.forcedStop,
          message: processStillSupervised
            ? `${message} L’arrêt du processus natif n’est pas confirmé ; tout nouveau lancement reste bloqué.`
            : cancelledByStop ? null : message,
        };
      }
      const launchError = new Error(state.message ?? message, { cause: error });
      launchError.statusCode = 503;
      throw launchError;
    }
  };

  const performUpdate = async (controls) => {
    const target = child;
    if (!target || hasExited(target) || state.status !== "running" || !state.audioReady) {
      const error = new Error("Démarre le monitoring natif avant de modifier ses réglages.");
      error.statusCode = 409;
      throw error;
    }
    if (!target.stdin?.writable) {
      const error = new Error("Le canal de contrôle natif n’est plus disponible.");
      error.statusCode = 503;
      throw error;
    }
    const previousAppliedRevision = state.appliedControlRevision;
    pendingControlAfterRevision = previousAppliedRevision;
    state = { ...state, controlsApplied: false, message: null };
    try {
      target.stdin.write(nativeControlCommand(controls));
      await waitForControlApplied(
        target,
        controlApplyTimeoutMs,
        () => child === target
          && state.controlsApplied
          && state.appliedControlRevision > previousAppliedRevision,
      );
    } catch (error) {
      pendingControlAfterRevision = null;
      const detail = error instanceof Error ? error.message : String(error);
      state = {
        ...state,
        controlsApplied: false,
        message: detail,
      };
      const controlError = new Error(`Impossible de transmettre les réglages au VST3 natif. ${detail}`, {
        cause: error,
      });
      controlError.statusCode = 503;
      throw controlError;
    }
    state = { ...state, controls: { ...controls }, message: null };
    return snapshot();
  };

  const update = async (controls) => {
    if (!validNativeControls(controls)) {
      const error = new Error("Les réglages natifs sont invalides ou non pris en charge.");
      error.statusCode = 400;
      throw error;
    }
    const operation = controlUpdateTail.then(() => performUpdate(controls));
    controlUpdateTail = operation.catch(() => undefined);
    return operation;
  };

  const stop = async () => {
    const target = child;
    if (!target || target.exitCode !== null || target.signalCode !== null) {
      child = null;
      if (state.status !== "error") {
        state = {
          ...state,
          status: state.pluginId ? "stopped" : "idle",
          audioReady: false,
          controlsApplied: false,
          pid: null,
        };
      }
      return snapshot();
    }

    pendingControlAfterRevision = null;
    state = { ...state, status: "stopping", forcedStop: false, message: null };
    const termination = await terminateTarget(target);
    if (!termination.exited && child === target) {
      state = {
        ...state,
        status: "stopping",
        audioReady: state.audioReady,
        controlsApplied: state.controlsApplied,
        pid: target.pid ?? state.pid,
        forcedStop: termination.forcedStop,
        message: "L’arrêt du processus natif n’est pas confirmé ; tout nouveau lancement reste bloqué.",
      };
    } else if (termination.exited && child === target) {
      child = null;
      state = {
        ...state,
        status: "stopped",
        audioReady: false,
        controlsApplied: false,
        pid: null,
        stoppedAt: new Date().toISOString(),
        forcedStop: termination.forcedStop,
      };
    }
    return snapshot();
  };

  const plugins = () => createNativeVst3LabPluginInventory(projectRoot, {
    platform: hostPlatform,
    pathExists,
    programFiles: options.programFiles,
  });

  return { snapshot, plugins, start, update, stop };
}

function routeSuffix(request) {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    return pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : null;
  } catch {
    return null;
  }
}

export function audioLabNativeMonitor({ enabled, projectRoot }) {
  if (!enabled) return null;
  const token = randomBytes(32).toString("base64url");
  const supervisor = createNativeMonitorSupervisor(projectRoot);

  return {
    name: "meewav-audio-lab-native-monitor",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [{
          tag: "meta",
          attrs: { name: TOKEN_META_NAME, content: token },
          injectTo: "head-prepend",
        }];
      },
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const suffix = routeSuffix(request);
        if (suffix === null) return next();

        const mutation = suffix === "start" || suffix === "update" || suffix === "stop";
        if (!isLoopbackAddress(request.socket.remoteAddress)
          || !requestOriginMatchesHost(request, mutation)
          || !tokenMatches(request, token)) {
          sendJson(response, 403, { error: "Accès au monitoring natif refusé." });
          return;
        }

        try {
          if (suffix === "status" && request.method === "GET") {
            sendJson(response, 200, supervisor.snapshot());
            return;
          }
          if (suffix === "plugins" && request.method === "GET") {
            sendJson(response, 200, supervisor.plugins());
            return;
          }
          if (suffix === "start" && request.method === "POST") {
            const body = await readJsonBody(request);
            if (!plainObject(body)
              || Object.keys(body).some((key) => key !== "pluginId" && key !== "headphonesConfirmed" && key !== "controls")
              || body.headphonesConfirmed !== true
              || typeof body.pluginId !== "string"
              || !validNativeControls(body.controls)) {
              sendJson(response, 400, { error: "Confirme le casque et choisis un plugin autorisé." });
              return;
            }
            sendJson(response, 200, await supervisor.start(body.pluginId, body.controls));
            return;
          }
          if (suffix === "update" && request.method === "POST") {
            const body = await readJsonBody(request);
            if (!plainObject(body)
              || Object.keys(body).length !== 1
              || !validNativeControls(body.controls)) {
              sendJson(response, 400, { error: "Les réglages natifs sont invalides ou non pris en charge." });
              return;
            }
            sendJson(response, 200, await supervisor.update(body.controls));
            return;
          }
          if (suffix === "stop" && request.method === "POST") {
            const body = await readJsonBody(request);
            if (!plainObject(body) || Object.keys(body).length !== 0) {
              sendJson(response, 400, { error: "La requête d’arrêt doit être vide." });
              return;
            }
            sendJson(response, 200, await supervisor.stop());
            return;
          }
          sendJson(response, 405, { error: "Méthode non autorisée." });
        } catch (error) {
          sendJson(response, Number.isInteger(error?.statusCode) ? error.statusCode : 500, {
            error: error instanceof Error ? error.message : "Erreur du monitoring natif.",
          });
        }
      });

      server.httpServer?.once("close", () => {
        void supervisor.stop();
      });
    },
  };
}

export {
  API_PREFIX as AUDIO_LAB_NATIVE_MONITOR_API_PREFIX,
  TOKEN_HEADER_NAME as AUDIO_LAB_NATIVE_MONITOR_TOKEN_HEADER,
  TOKEN_META_NAME as AUDIO_LAB_NATIVE_MONITOR_TOKEN_META,
  createNativeMonitorSupervisor,
};
