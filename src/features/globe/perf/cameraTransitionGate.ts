import type { Map as MapLibreMap } from "maplibre-gl";

type DeferredTask = {
  id: string;
  run: () => void | Promise<void>;
  timeoutMs?: number;
};

const CAMERA_ACTIVE_CLASS = "globe-camera-active";

let cameraBusy = false;
let queue = new Map<string, DeferredTask>();
let flushTimer: number | null = null;

export function isMeewavCameraBusy() {
  return cameraBusy;
}

export function beginMeewavCameraTransition(_reason: string) {
  cameraBusy = true;

  if (typeof document !== "undefined") {
    document.documentElement.classList.add(CAMERA_ACTIVE_CLASS);
  }

  if (flushTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function endMeewavCameraTransition(_reason = "camera-end") {
  cameraBusy = false;

  if (typeof window === "undefined") {
    flushDeferredCameraTasks();
    return;
  }

  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushDeferredCameraTasks();

    window.setTimeout(() => {
      if (!cameraBusy) {
        document.documentElement.classList.remove(CAMERA_ACTIVE_CLASS);
      }
    }, 120);
  }, 220);
}

export function deferUntilCameraIdle(task: DeferredTask) {
  if (!cameraBusy) {
    scheduleIdleTask(task);
    return;
  }

  queue.set(task.id, task);
}

export function installMeewavCameraActivityClass(map: MapLibreMap) {
  let removeTimer: number | null = null;

  const markBusy = () => {
    cameraBusy = true;
    if (typeof document !== "undefined") {
      document.documentElement.classList.add(CAMERA_ACTIVE_CLASS);
    }
    if (removeTimer !== null) {
      window.clearTimeout(removeTimer);
      removeTimer = null;
    }
  };

  const markSettled = () => {
    if (removeTimer !== null) {
      window.clearTimeout(removeTimer);
    }

    removeTimer = window.setTimeout(() => {
      removeTimer = null;
      if (map.isMoving() || map.isZooming() || map.isRotating()) return;
      cameraBusy = false;
      flushDeferredCameraTasks();
      document.documentElement.classList.remove(CAMERA_ACTIVE_CLASS);
    }, 140);
  };

  map.on("movestart", markBusy);
  map.on("zoomstart", markBusy);
  map.on("rotatestart", markBusy);
  map.on("pitchstart", markBusy);
  map.on("moveend", markSettled);
  map.on("zoomend", markSettled);
  map.on("rotateend", markSettled);
  map.on("pitchend", markSettled);
  map.on("idle", markSettled);

  return () => {
    if (removeTimer !== null) {
      window.clearTimeout(removeTimer);
    }
    map.off("movestart", markBusy);
    map.off("zoomstart", markBusy);
    map.off("rotatestart", markBusy);
    map.off("pitchstart", markBusy);
    map.off("moveend", markSettled);
    map.off("zoomend", markSettled);
    map.off("rotateend", markSettled);
    map.off("pitchend", markSettled);
    map.off("idle", markSettled);
    document.documentElement.classList.remove(CAMERA_ACTIVE_CLASS);
  };
}

function flushDeferredCameraTasks() {
  const tasks = Array.from(queue.values());
  queue = new Map();

  let index = 0;
  const runNext = () => {
    const task = tasks[index++];
    if (!task) return;

    scheduleIdleTask({
      ...task,
      run: async () => {
        try {
          await task.run();
        } finally {
          runNext();
        }
      },
    });
  };

  runNext();
}

function scheduleIdleTask(task: DeferredTask) {
  if (typeof window === "undefined") {
    void task.run();
    return;
  }

  const run = () => void task.run();
  const requestIdle = (window as any).requestIdleCallback as
    | ((callback: () => void, options?: { timeout?: number }) => number)
    | undefined;

  if (requestIdle) {
    requestIdle(run, { timeout: task.timeoutMs ?? 1200 });
    return;
  }

  window.setTimeout(run, 32);
}
