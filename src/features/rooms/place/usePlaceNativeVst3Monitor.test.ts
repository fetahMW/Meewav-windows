import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NativeVst3LabControls,
  NativeVst3LabMonitorSnapshot,
  NativeVst3LabPluginId,
} from "../voice-correction/nativeVst3LabMonitor";
import { usePlaceNativeVst3Monitor } from "./usePlaceNativeVst3Monitor";

const nativeMonitorApi = vi.hoisted(() => ({
  getStatus: vi.fn(),
  start: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../voice-correction/nativeVst3LabMonitor", async (importOriginal) => {
  const original = await importOriginal<typeof import("../voice-correction/nativeVst3LabMonitor")>();
  return {
    ...original,
    getNativeVst3LabMonitorStatus: nativeMonitorApi.getStatus,
    startNativeVst3LabMonitor: nativeMonitorApi.start,
    updateNativeVst3LabMonitorControls: nativeMonitorApi.update,
    stopNativeVst3LabMonitor: nativeMonitorApi.stop,
  };
});

const CONTROLS: NativeVst3LabControls = {
  bypassed: false,
  inputGain: 0.74,
  key: 4,
  scale: 2,
  amount: 0.72,
  retune: 0.38,
  humanize: 0.44,
  reverbEnabled: true,
  reverbMix: 0.28,
  reverbType: "plate",
  reverbDuration: 1.8,
  reverbPreDelayMs: 24,
};

function monitorSnapshot(
  status: NativeVst3LabMonitorSnapshot["status"],
  pluginId: NativeVst3LabPluginId | null = null,
  overrides: Partial<NativeVst3LabMonitorSnapshot> = {},
): NativeVst3LabMonitorSnapshot {
  const running = status === "running";
  return {
    status,
    audioReady: running,
    pluginId,
    pid: running ? 4_208 : null,
    startedAt: running ? "2026-08-11T12:00:00.000Z" : null,
    stoppedAt: status === "stopped" ? "2026-08-11T12:01:00.000Z" : null,
    exitCode: null,
    signal: null,
    forcedStop: false,
    message: null,
    stdoutTail: "",
    stderrTail: "",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubEnv("MODE", "audio-lab");
  nativeMonitorApi.getStatus.mockResolvedValue(monitorSnapshot("stopped"));
  nativeMonitorApi.start.mockImplementation((pluginId: NativeVst3LabPluginId) => (
    Promise.resolve(monitorSnapshot("running", pluginId))
  ));
  nativeMonitorApi.update.mockResolvedValue(monitorSnapshot("running", "sixthsample.spoton"));
  nativeMonitorApi.stop.mockResolvedValue(monitorSnapshot("stopped"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("usePlaceNativeVst3Monitor", () => {
  it("does not query or start the native monitor on mount", () => {
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());

    expect(result.current.available).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.snapshot).toBeNull();
    expect(nativeMonitorApi.getStatus).not.toHaveBeenCalled();
    expect(nativeMonitorApi.start).not.toHaveBeenCalled();
    expect(nativeMonitorApi.stop).not.toHaveBeenCalled();
  });

  it("refreshes an already-running monitor without claiming or restarting it", async () => {
    nativeMonitorApi.getStatus.mockResolvedValue(
      monitorSnapshot("running", "sixthsample.spoton"),
    );
    const { result, unmount } = renderHook(() => usePlaceNativeVst3Monitor());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.activePluginId).toBe("sixthsample.spoton");
    expect(result.current.snapshot?.audioReady).toBe(true);
    expect(result.current.error).toBeNull();

    unmount();
    await Promise.resolve();
    expect(nativeMonitorApi.stop).not.toHaveBeenCalled();
  });

  it("keeps busy true while an explicit start is pending", async () => {
    const pendingStatus = deferred<NativeVst3LabMonitorSnapshot>();
    nativeMonitorApi.getStatus.mockReturnValueOnce(pendingStatus.promise);
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());
    let startPromise!: Promise<NativeVst3LabMonitorSnapshot>;

    act(() => {
      startPromise = result.current.start("sixthsample.spoton", CONTROLS);
    });
    expect(result.current.busy).toBe(true);
    expect(nativeMonitorApi.start).not.toHaveBeenCalled();

    pendingStatus.resolve(monitorSnapshot("stopped"));
    await act(async () => {
      await startPromise;
    });

    expect(nativeMonitorApi.start).toHaveBeenCalledWith("sixthsample.spoton", CONTROLS);
    expect(result.current.busy).toBe(false);
    expect(result.current.activePluginId).toBe("sixthsample.spoton");
  });

  it("waits for a confirmed stop before starting a different plugin", async () => {
    const pendingStop = deferred<NativeVst3LabMonitorSnapshot>();
    nativeMonitorApi.getStatus.mockImplementation(async () => (
      monitorSnapshot("running", "sixthsample.spoton")
    ));
    nativeMonitorApi.stop.mockReturnValueOnce(pendingStop.promise);
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());
    let switchPromise!: Promise<NativeVst3LabMonitorSnapshot>;

    act(() => {
      switchPromise = result.current.start("auburnsounds.graillon3", CONTROLS);
    });

    await waitFor(() => expect(nativeMonitorApi.stop).toHaveBeenCalledTimes(1));
    expect(nativeMonitorApi.start).not.toHaveBeenCalled();

    pendingStop.resolve(monitorSnapshot("stopped"));
    await act(async () => {
      await switchPromise;
    });

    expect(nativeMonitorApi.start).toHaveBeenCalledWith("auburnsounds.graillon3", CONTROLS);
    expect(nativeMonitorApi.stop.mock.invocationCallOrder[0]).toBeLessThan(
      nativeMonitorApi.start.mock.invocationCallOrder[0],
    );
    expect(result.current.activePluginId).toBe("auburnsounds.graillon3");
  });

  it("refuses to start another plugin when the previous stop is unconfirmed", async () => {
    nativeMonitorApi.getStatus.mockResolvedValue(
      monitorSnapshot("running", "sixthsample.spoton"),
    );
    nativeMonitorApi.stop.mockResolvedValueOnce(
      monitorSnapshot("stopping", "sixthsample.spoton", {
        audioReady: false,
        pid: 4_208,
      }),
    );
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());

    await act(async () => {
      await expect(result.current.start("auburnsounds.graillon3", CONTROLS))
        .rejects.toThrow(/ne s’est pas arrêté proprement/u);
    });

    expect(nativeMonitorApi.start).not.toHaveBeenCalled();
    expect(result.current.activePluginId).toBeNull();
    expect(result.current.error).toMatch(/Aucun autre plugin n’a été lancé/u);
  });

  it("updates the active plugin and stops it explicitly", async () => {
    nativeMonitorApi.getStatus.mockResolvedValue(
      monitorSnapshot("running", "sixthsample.spoton"),
    );
    nativeMonitorApi.update.mockResolvedValue(
      monitorSnapshot("running", "sixthsample.spoton"),
    );
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());

    await act(async () => {
      await result.current.update(CONTROLS);
    });
    expect(nativeMonitorApi.update).toHaveBeenCalledWith(CONTROLS);
    expect(result.current.activePluginId).toBe("sixthsample.spoton");

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.activePluginId).toBeNull();
    expect(result.current.snapshot?.status).toBe("stopped");
  });

  it("stops a monitor owned by the hook when the component unmounts", async () => {
    const { result, unmount } = renderHook(() => usePlaceNativeVst3Monitor());

    await act(async () => {
      await result.current.start("sixthsample.spoton", CONTROLS);
    });
    expect(nativeMonitorApi.stop).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(nativeMonitorApi.stop).toHaveBeenCalledTimes(1));
  });

  it("fails closed outside audio-lab mode without calling the native API", async () => {
    vi.stubEnv("MODE", "test");
    const { result } = renderHook(() => usePlaceNativeVst3Monitor());

    expect(result.current.available).toBe(false);
    await act(async () => {
      await expect(result.current.start("sixthsample.spoton", CONTROLS))
        .rejects.toThrow(/npm run dev:place-audio/u);
    });

    expect(nativeMonitorApi.getStatus).not.toHaveBeenCalled();
    expect(nativeMonitorApi.start).not.toHaveBeenCalled();
    expect(nativeMonitorApi.stop).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/uniquement/u);
  });
});
