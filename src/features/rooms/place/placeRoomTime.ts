import { useSyncExternalStore } from "react";
import { requestPlaceMixerStart } from "./placeMixerStart";

export type PlaceRoomTimeStatus = "idle" | "running" | "paused" | "complete";

export type PlaceRoomTimeSnapshot = {
  enabled: boolean;
  status: PlaceRoomTimeStatus;
  durationSeconds: number;
  remainingMs: number;
};

const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let lastTickAt = 0;
let pendingStart: AbortController | null = null;
let snapshot: PlaceRoomTimeSnapshot = {
  enabled: false,
  status: "idle",
  durationSeconds: 180,
  remainingMs: 180_000,
};

function publish(next: PlaceRoomTimeSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function stopTicker() {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
}

function cancelPendingStart() {
  pendingStart?.abort();
  pendingStart = null;
}

function completeCountdown() {
  stopTicker();
  publish({ ...snapshot, status: "complete", remainingMs: 0 });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("meewav:mixer-chrono-ended", {
      detail: { durationSeconds: snapshot.durationSeconds },
    }));
    window.setTimeout(() => {
      if (snapshot.status !== "complete") return;
      publish({ ...snapshot, status: "idle", remainingMs: snapshot.durationSeconds * 1_000 });
    }, 180);
  }
}

function tick() {
  if (snapshot.status !== "running") return;
  const now = Date.now();
  const remainingMs = Math.max(0, snapshot.remainingMs - (now - lastTickAt));
  lastTickAt = now;
  if (remainingMs <= 0) {
    completeCountdown();
    return;
  }
  publish({ ...snapshot, remainingMs });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatPlaceRoomTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export const placeRoomTime = {
  getSnapshot: () => snapshot,
  subscribe,
  configure(minutes: number, seconds: number) {
    cancelPendingStart();
    const safeMinutes = Math.max(0, Math.min(99, Math.floor(Number.isFinite(minutes) ? minutes : 0)));
    const safeSeconds = Math.max(0, Math.min(59, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
    const durationSeconds = Math.max(1, safeMinutes * 60 + safeSeconds);
    stopTicker();
    publish({ ...snapshot, status: "idle", durationSeconds, remainingMs: durationSeconds * 1_000 });
  },
  setEnabled(enabled: boolean) {
    cancelPendingStart();
    stopTicker();
    publish({
      ...snapshot,
      enabled,
      status: "idle",
      remainingMs: snapshot.durationSeconds * 1_000,
    });
  },
  start({ skipCountdown = false }: { skipCountdown?: boolean } = {}) {
    if (!snapshot.enabled || snapshot.status === "running" || pendingStart) return;
    const controller = new AbortController();
    pendingStart = controller;
    const remainingMs = snapshot.status === "complete" || snapshot.remainingMs <= 0
      ? snapshot.durationSeconds * 1_000
      : snapshot.remainingMs;
    const startNow = () => {
      if (controller.signal.aborted || !snapshot.enabled || snapshot.status === "running") return;
      pendingStart = null;
      lastTickAt = Date.now();
      publish({ ...snapshot, status: "running", remainingMs });
      stopTicker();
      ticker = setInterval(tick, 100);
    };
    if (skipCountdown || snapshot.status === "paused") startNow();
    else requestPlaceMixerStart(startNow, controller.signal, () => {
      if (pendingStart === controller) pendingStart = null;
    });
  },
  pause() {
    cancelPendingStart();
    if (snapshot.status !== "running") return;
    tick();
    stopTicker();
    if (snapshot.remainingMs > 0) publish({ ...snapshot, status: "paused" });
  },
  reset() {
    cancelPendingStart();
    stopTicker();
    publish({ ...snapshot, status: "idle", remainingMs: snapshot.durationSeconds * 1_000 });
  },
};

export function usePlaceRoomTime() {
  return useSyncExternalStore(placeRoomTime.subscribe, placeRoomTime.getSnapshot, placeRoomTime.getSnapshot);
}
