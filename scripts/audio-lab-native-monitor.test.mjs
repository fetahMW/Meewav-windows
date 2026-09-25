import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  audioLabNativeMonitor,
  createNativeMonitorSupervisor,
  createNativeVst3LabPluginInventory,
  scanStandardWindowsPluginBundles,
  scanStandardWindowsVst3Bundles,
  windowsCommonPluginRoots,
} from "./audio-lab-native-monitor.mjs";

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

class FakeChild extends EventEmitter {
  constructor(pid = 4_242) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stdin = new PassThrough();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.killSignals = [];
  }

  kill(signal) {
    this.killSignals.push(signal);
    return true;
  }

  exit(exitCode, signal = null) {
    this.exitCode = exitCode;
    this.signalCode = signal;
    this.emit("exit", exitCode, signal);
  }
}

function createHarness(child, overrides = {}) {
  return createNativeMonitorSupervisor("C:\\meewav-test", {
    platform: "win32",
    executableExists: () => true,
    spawnProcess: () => child,
    audioReadyTimeoutMs: 25,
    controlApplyTimeoutMs: 25,
    gracefulStopTimeoutMs: 2,
    forceStopTimeoutMs: 2,
    ...overrides,
  });
}

test("start waits for the exact audio-ready marker", async () => {
  const child = new FakeChild();
  const supervisor = createHarness(child);
  let settled = false;
  const startPromise = supervisor.start("sixthsample.spoton").finally(() => { settled = true; });

  child.stdout.write("plugin initialized, streams not started yet\n");
  await delay(1);
  assert.equal(settled, false);
  assert.equal(supervisor.snapshot().status, "starting");

  child.stdout.write("MEEWAV_AUDIO_CONTROL_");
  child.stdout.write("READY\n");
  child.stdout.write("MEEWAV_AUDIO_CONTROL_APPLIED revision=2\n");
  const snapshot = await startPromise;
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.audioReady, true);
  assert.match(
    child.stdin.read().toString("utf8"),
    /set bypass=0 input_gain=1\.000000 .* humanize=0\.000000 reverb_enabled=0 reverb_mix=0\.000000 reverb_type=room reverb_duration=1\.200000 reverb_predelay_ms=0\.000000/u,
  );

  child.exit(0);
});

test("exit before the marker rejects startup and releases only the confirmed-dead child", async () => {
  const child = new FakeChild();
  const supervisor = createHarness(child);
  const startPromise = supervisor.start("auburnsounds.graillon3");

  child.exit(7);
  await assert.rejects(startPromise, /avant l’ouverture audio|arrêté pendant/u);
  assert.equal(supervisor.snapshot().status, "error");
  assert.equal(supervisor.snapshot().pid, null);
});

test("an unconfirmed forced stop remains supervised and blocks another start", async () => {
  const child = new FakeChild();
  child.kill = function killWithoutConfirmation(signal) {
    this.killSignals.push(signal);
    throw new Error(`kill failed: ${signal}`);
  };
  const supervisor = createHarness(child);
  const startPromise = supervisor.start("sixthsample.spoton");
  child.stdout.write("MEEWAV_AUDIO_CONTROL_READY\nMEEWAV_AUDIO_CONTROL_APPLIED revision=2\n");
  await startPromise;
  child.stdin.read();

  const stopPromise = supervisor.stop();
  child.stdin.emit("error", new Error("EPIPE"));
  const snapshot = await stopPromise;

  assert.equal(snapshot.status, "stopping");
  assert.equal(snapshot.pid, child.pid);
  assert.equal(snapshot.forcedStop, true);
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
  await assert.rejects(
    supervisor.start("auburnsounds.graillon3"),
    /Arrête le monitoring natif actif/u,
  );

  child.exit(null, "SIGKILL");
});

test("update waits for a strictly newer applied revision", async () => {
  const child = new FakeChild();
  const supervisor = createHarness(child);
  const startPromise = supervisor.start("sixthsample.spoton");
  child.stdout.write("MEEWAV_AUDIO_CONTROL_READY\nMEEWAV_AUDIO_CONTROL_APPLIED revision=2\n");
  await startPromise;

  let settled = false;
  const controls = {
    bypassed: false,
    inputGain: 0.82,
    key: 9,
    scale: 2,
    amount: 0.8,
    retune: 0.7,
    humanize: 0.24,
    reverbEnabled: true,
    reverbMix: 0.37,
    reverbType: "plate",
    reverbDuration: 1.8,
    reverbPreDelayMs: 24,
  };
  const updatePromise = supervisor.update(controls).finally(() => { settled = true; });
  child.stdout.write("MEEWAV_AUDIO_TELEMETRY input_frames=128\n");
  await delay(1);

  assert.equal(settled, false);
  assert.match(
    child.stdin.read().toString("utf8"),
    /input_gain=0\.820000 .* humanize=0\.240000 reverb_enabled=1 reverb_mix=0\.370000 reverb_type=plate reverb_duration=1\.800000 reverb_predelay_ms=24\.000000/u,
  );
  assert.equal(supervisor.snapshot().controlsApplied, false);
  assert.equal(supervisor.snapshot().appliedControlRevision, 2);

  child.stdout.write("MEEWAV_AUDIO_CONTROL_APPLIED revision=3\n");
  const snapshot = await updatePromise;
  assert.equal(snapshot.controlsApplied, true);
  assert.equal(snapshot.appliedControlRevision, 3);
  assert.deepEqual(snapshot.controls, controls);

  child.exit(0);
});

test("update never reuses a sticky acknowledgement", async () => {
  const child = new FakeChild();
  const supervisor = createHarness(child);
  const startPromise = supervisor.start("auburnsounds.graillon3");
  child.stdout.write("MEEWAV_AUDIO_CONTROL_READY\nMEEWAV_AUDIO_CONTROL_APPLIED revision=2\n");
  const started = await startPromise;

  await assert.rejects(
    supervisor.update({
      bypassed: false,
      inputGain: 1,
      key: 4,
      scale: 1,
      amount: 0.6,
      retune: 0.9,
      humanize: 0.1,
      reverbEnabled: true,
      reverbMix: 0.55,
      reverbType: "hall",
      reverbDuration: 3.4,
      reverbPreDelayMs: 48,
    }),
    /n’a pas confirmé/u,
  );
  const snapshot = supervisor.snapshot();
  assert.equal(snapshot.controlsApplied, false);
  assert.equal(snapshot.appliedControlRevision, 2);
  assert.deepEqual(snapshot.controls, started.controls);

  child.exit(0);
});

test("plugin inventory detects candidates without inventing compatibility or licence status", () => {
  const checkedPaths = [];
  const tree = new Map([
    ["C:\\Program Files\\Common Files\\VST3", [
      { name: "Antares", isDirectory: () => true },
      { name: "Spoton.vst3", isDirectory: () => true },
    ]],
    ["C:\\Program Files\\Common Files\\VST3\\Antares", [
      { name: "Auto-Tune Pro.vst3", isDirectory: () => false },
    ]],
  ]);
  const inventory = createNativeVst3LabPluginInventory("C:\\meewav-test", {
    platform: "win32",
    programFiles: "C:\\Program Files",
    commonProgramFiles: "C:\\Program Files\\Common Files",
    pathExists(path) {
      checkedPaths.push(path);
      return path.endsWith("meewav-vst3-live-poc.exe") || tree.has(path);
    },
    readDirectory: (path) => tree.get(path) ?? [],
  });

  assert.deepEqual(inventory.map((plugin) => plugin.id), [
    "antares.autotune",
    "resonantcavity.voloco-producer",
    "sixthsample.spoton",
    "auburnsounds.graillon3",
  ]);
  assert.equal(inventory[0].status, "disabled");
  assert.equal(inventory[0].licensed, false);
  assert.equal(inventory[0].capabilities.includes("detected_local"), true);
  assert.equal(inventory[0].capabilities.includes("probe_required"), true);
  assert.equal(inventory[1].status, "missing");
  assert.equal(inventory[2].status, "disabled");
  assert.equal(inventory[2].licensed, false);
  assert.equal(inventory[3].status, "missing");
  assert.equal(inventory[3].licensed, false);
  assert.equal(checkedPaths.some((path) => path.endsWith("Common Files\\VST3")), true);
  assert.equal(JSON.stringify(inventory).includes("C:\\Program Files"), false);
});

test("the PC scan discovers compatible VST3 bundles in vendor subdirectories without returning paths", () => {
  const tree = new Map([
    ["C:\\Program Files\\Common Files\\VST3", [
      { name: "Sixth Sample", isDirectory: () => true },
      { name: "Auburn Sounds Graillon 3.vst3", isDirectory: () => true },
    ]],
    ["C:\\Program Files\\Common Files\\VST3\\Sixth Sample", [
      { name: "Spoton.vst3", isDirectory: () => true },
    ]],
  ]);
  const bundles = scanStandardWindowsVst3Bundles({
    roots: ["C:\\Program Files\\Common Files\\VST3"],
    pathExists: (path) => tree.has(path),
    readDirectory: (path) => tree.get(path) ?? [],
  });

  assert.deepEqual([...bundles].sort(), ["auburn sounds graillon 3.vst3", "spoton.vst3"]);
  assert.equal(JSON.stringify([...bundles]).includes("C:\\Program Files"), false);
});

test("the Windows scan covers common FL Studio VST3 and VST2 roots without exposing locations", () => {
  const roots = windowsCommonPluginRoots({
    programFiles: "D:\\Apps",
    programFilesX86: "D:\\Apps32",
    commonProgramFiles: "D:\\Shared",
    commonProgramFilesX86: "D:\\Shared32",
    localAppData: "D:\\Local",
    appData: "D:\\Roaming",
    userProfile: "D:\\Users\\Artist",
    systemDrive: "D:",
    vst3Path: "E:\\Audio\\VST3;F:\\Shared\\VST3",
    vst2Path: "E:\\Audio\\VST2",
  });

  assert.equal(roots.some((root) => root.path === "D:\\Shared\\VST3"), true);
  assert.equal(roots.some((root) => root.path === "D:\\Apps\\VstPlugins"), true);
  assert.equal(roots.some((root) => root.path === "D:\\Apps32\\Steinberg\\VstPlugins"), true);
  assert.equal(roots.some((root) => root.path === "D:\\Apps\\Cakewalk\\VstPlugins"), true);
  assert.equal(roots.some((root) => root.path === "D:\\Users\\Artist\\Documents\\VSTPlugins"), true);
  assert.equal(roots.some((root) => root.path === "E:\\Audio\\VST3"), true);
  assert.equal(roots.some((root) => root.path === "E:\\Audio\\VST2"), true);
});

test("the recursive inventory finds nested Auto-Tune Pro and VST2 DLLs but returns names only", () => {
  const tree = new Map([
    ["C:\\Program Files\\Common Files\\VST3", [
      { name: "Antares", isDirectory: () => true },
      { name: "not-a-plugin.dll", isDirectory: () => false },
    ]],
    ["C:\\Program Files\\Common Files\\VST3\\Antares", [
      { name: "Auto-Tune Pro.vst3", isDirectory: () => false },
    ]],
    ["C:\\Program Files\\VstPlugins", [
      { name: "Legacy", isDirectory: () => true },
      { name: "..\\outside.dll", isDirectory: () => false },
    ]],
    ["C:\\Program Files\\VstPlugins\\Legacy", [
      { name: "Vocal Processor.dll", isDirectory: () => false },
    ]],
  ]);
  const plugins = scanStandardWindowsPluginBundles({
    roots: [
      { path: "C:\\Program Files\\Common Files\\VST3", formats: ["vst3"] },
      { path: "C:\\Program Files\\VstPlugins", formats: ["vst2", "vst3"] },
    ],
    pathExists: (path) => tree.has(path),
    readDirectory: (path) => tree.get(path) ?? [],
  });

  assert.deepEqual(plugins, [
    { format: "vst3", name: "Auto-Tune Pro.vst3" },
    { format: "vst2", name: "Vocal Processor.dll" },
  ]);
  assert.equal(JSON.stringify(plugins).includes("C:\\Program Files"), false);
  assert.equal(JSON.stringify(plugins).includes("not-a-plugin.dll"), false);
  assert.equal(JSON.stringify(plugins).includes("outside.dll"), false);
});

test("plugin inventory fails closed when the native host is absent or platform is unsupported", () => {
  const withoutHost = createNativeVst3LabPluginInventory("C:\\meewav-test", {
    platform: "win32",
    programFiles: "C:\\Program Files",
    pathExists(path) {
      return path.endsWith("Spoton.vst3") || path.endsWith("Auburn Sounds Graillon 3.vst3");
    },
  });
  assert.deepEqual(withoutHost.map((plugin) => plugin.status), [
    "disabled",
    "disabled",
    "disabled",
    "disabled",
  ]);

  const unsupported = createNativeVst3LabPluginInventory("/tmp/meewav-test", {
    platform: "darwin",
    pathExists: () => true,
    programFiles: "C:\\Program Files",
  });
  assert.deepEqual(unsupported.map((plugin) => plugin.status), [
    "disabled",
    "disabled",
    "disabled",
    "disabled",
  ]);
});

test("native plugin inventory endpoint is not registered outside audio-lab mode", () => {
  assert.equal(audioLabNativeMonitor({ enabled: false, projectRoot: "C:\\meewav-test" }), null);
});
