import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NATIVE_VST3_LAB_CONTROLS,
  getNativeVst3LabMonitorStatus,
  startNativeVst3LabMonitor,
  stopNativeVst3LabMonitor,
  updateNativeVst3LabMonitorControls,
  type NativeVst3LabControls,
  type NativeVst3LabMonitorSnapshot,
  type NativeVst3LabPluginId,
} from "../voice-correction/nativeVst3LabMonitor";

const AUDIO_LAB_ONLY_MESSAGE =
  "Le monitoring VST3 natif est disponible uniquement avec npm run dev:place-audio.";
const STOP_NOT_CONFIRMED_MESSAGE =
  "Le monitoring VST3 précédent ne s’est pas arrêté proprement. Aucun autre plugin n’a été lancé.";
const NO_ACTIVE_PLUGIN_MESSAGE = "Aucun plugin VST3 natif n’est actif.";

type SnapshotOperation = () => Promise<NativeVst3LabMonitorSnapshot>;

export type UsePlaceNativeVst3MonitorResult = {
  snapshot: NativeVst3LabMonitorSnapshot | null;
  available: boolean;
  busy: boolean;
  error: string | null;
  activePluginId: NativeVst3LabPluginId | null;
  refresh: () => Promise<NativeVst3LabMonitorSnapshot>;
  start: (
    pluginId: NativeVst3LabPluginId,
    controls?: NativeVst3LabControls,
  ) => Promise<NativeVst3LabMonitorSnapshot>;
  update: (controls: NativeVst3LabControls) => Promise<NativeVst3LabMonitorSnapshot>;
  stop: () => Promise<NativeVst3LabMonitorSnapshot>;
};

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Le monitoring VST3 natif n’a pas pu exécuter cette action.");
}

function ownsNativeProcess(snapshot: NativeVst3LabMonitorSnapshot): boolean {
  return snapshot.pid !== null
    || snapshot.status === "starting"
    || snapshot.status === "running"
    || snapshot.status === "stopping";
}

function isConfirmedStopped(snapshot: NativeVst3LabMonitorSnapshot): boolean {
  return snapshot.pid === null
    && snapshot.status !== "starting"
    && snapshot.status !== "running"
    && snapshot.status !== "stopping";
}

function isActive(snapshot: NativeVst3LabMonitorSnapshot | null): snapshot is NativeVst3LabMonitorSnapshot & {
  pluginId: NativeVst3LabPluginId;
} {
  return snapshot?.status === "running"
    && snapshot.audioReady
    && snapshot.pluginId !== null;
}

/**
 * Serial controller for the native Spoton/Graillon monitor used by La Place.
 *
 * It deliberately performs no request on mount. A native monitor starts only
 * after an explicit `start` call, and a plugin switch cannot happen until the
 * previous native process reports a terminal state.
 */
export function usePlaceNativeVst3Monitor(): UsePlaceNativeVst3MonitorResult {
  const audioLabMode = import.meta.env.MODE === "audio-lab";
  const [snapshot, setSnapshot] = useState<NativeVst3LabMonitorSnapshot | null>(null);
  const [available, setAvailable] = useState(audioLabMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const snapshotRef = useRef<NativeVst3LabMonitorSnapshot | null>(null);
  const ownsMonitorRef = useRef(false);
  const pendingCountRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const commitSnapshot = useCallback((next: NativeVst3LabMonitorSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) {
      setSnapshot(next);
      setAvailable(true);
    }
    return next;
  }, []);

  const enqueue = useCallback((operation: SnapshotOperation) => {
    pendingCountRef.current += 1;
    if (mountedRef.current) setBusy(true);

    const result = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );

    return result.finally(() => {
      pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
      if (mountedRef.current && pendingCountRef.current === 0) setBusy(false);
    });
  }, []);

  const run = useCallback((operation: SnapshotOperation) => enqueue(async () => {
    if (mountedRef.current) setError(null);
    try {
      return await operation();
    } catch (caught) {
      const operationError = normalizeError(caught);
      if (mountedRef.current) setError(operationError.message);
      throw operationError;
    }
  }), [enqueue]);

  const assertAudioLabMode = useCallback(() => {
    if (!audioLabMode) throw new Error(AUDIO_LAB_ONLY_MESSAGE);
  }, [audioLabMode]);

  const readStatus = useCallback(async () => {
    try {
      return commitSnapshot(await getNativeVst3LabMonitorStatus());
    } catch (caught) {
      if (mountedRef.current) setAvailable(false);
      throw caught;
    }
  }, [commitSnapshot]);

  const refresh = useCallback(() => run(async () => {
    assertAudioLabMode();
    return readStatus();
  }), [assertAudioLabMode, readStatus, run]);

  const start = useCallback((
    pluginId: NativeVst3LabPluginId,
    controls: NativeVst3LabControls = DEFAULT_NATIVE_VST3_LAB_CONTROLS,
  ) => run(async () => {
    assertAudioLabMode();

    // Always read the supervisor first: a monitor can survive a page refresh.
    const current = await readStatus();
    if (ownsNativeProcess(current)) {
      const stopped = commitSnapshot(await stopNativeVst3LabMonitor());
      ownsMonitorRef.current = !isConfirmedStopped(stopped);
      if (!isConfirmedStopped(stopped)) throw new Error(STOP_NOT_CONFIRMED_MESSAGE);
    }

    // If the request times out after spawning, unmount cleanup must still try
    // to stop the possibly-owned process.
    ownsMonitorRef.current = true;
    const started = commitSnapshot(await startNativeVst3LabMonitor(pluginId, controls));
    return started;
  }), [assertAudioLabMode, commitSnapshot, readStatus, run]);

  const update = useCallback((controls: NativeVst3LabControls) => run(async () => {
    assertAudioLabMode();
    const current = snapshotRef.current ?? await readStatus();
    if (!isActive(current)) throw new Error(NO_ACTIVE_PLUGIN_MESSAGE);

    const updated = commitSnapshot(await updateNativeVst3LabMonitorControls(controls));
    ownsMonitorRef.current = true;
    return updated;
  }), [assertAudioLabMode, commitSnapshot, readStatus, run]);

  const stop = useCallback(() => run(async () => {
    assertAudioLabMode();
    const stopped = commitSnapshot(await stopNativeVst3LabMonitor());
    ownsMonitorRef.current = !isConfirmedStopped(stopped);
    if (!isConfirmedStopped(stopped)) throw new Error(STOP_NOT_CONFIRMED_MESSAGE);
    return stopped;
  }), [assertAudioLabMode, commitSnapshot, run]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      // Queue cleanup behind an in-flight start so a late native process can
      // never outlive the Place component that explicitly launched it.
      const cleanup = async () => {
        if (!audioLabMode || !ownsMonitorRef.current) return;
        try {
          const stopped = await stopNativeVst3LabMonitor();
          ownsMonitorRef.current = !isConfirmedStopped(stopped);
        } catch {
          // There is no mounted UI left to receive this error. The native
          // supervisor remains the final safety boundary for its child process.
        }
      };
      const cleanupResult = operationQueueRef.current.then(cleanup, cleanup);
      operationQueueRef.current = cleanupResult.then(
        () => undefined,
        () => undefined,
      );
    };
  }, [audioLabMode]);

  return {
    snapshot,
    available,
    busy,
    error,
    activePluginId: isActive(snapshot) ? snapshot.pluginId : null,
    refresh,
    start,
    update,
    stop,
  };
}

export default usePlaceNativeVst3Monitor;
