import { useSyncExternalStore } from "react";
import { placeTwistAudio, type PlaceTwistKind } from "./placeTwistAudio";
import type { PlaceMixerStartRequest } from "./placeMixerStart";

export type CueSide = "start" | "end";
export type CueOrigin = "chrono" | "player" | "both";
export type CueSound = { title: string; builtin?: PlaceTwistKind; source?: string; local?: boolean };
type Cue = { chrono: boolean; player: boolean; sound: CueSound };
type Snapshot = { start: Cue; end: Cue; playing: CueSide | null; waiting: boolean; error: string | null };
const defaults: Record<CueSide, CueSound> = {
  start: { title: "Countdown", builtin: "countdown" },
  end: { title: "Klaxon", builtin: "dj_horn" },
};
const initial = (): Snapshot => ({
  start: { chrono: false, player: false, sound: { ...defaults.start } },
  end: { chrono: false, player: false, sound: { ...defaults.end } },
  playing: null, waiting: false, error: null,
});
let snapshot = initial();
const listeners = new Set<() => void>();
let current: { cancel: () => void } | null = null;
function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
function cancel() { current?.cancel(); }
function matches(cue: Cue, origin: CueOrigin) {
  return ((origin === "chrono" || origin === "both") && cue.chrono)
    || ((origin === "player" || origin === "both") && cue.player);
}

/** One owner for intro/outro playback, including aborts and real media completion. */
function play(side: CueSide, request?: PlaceMixerStartRequest) {
  cancel();
  if (request?.signal?.aborted) { request.cancel(); return; }
  let settled = false;
  const finish = (result: "ended" | "cancelled" | "failed") => {
    if (settled) return;
    settled = true;
    request?.signal?.removeEventListener("abort", abort);
    if (current === job) current = null;
    if (result !== "ended") placeTwistAudio.stop();
    publish({ ...snapshot, playing: null, waiting: false,
      error: result === "failed" ? "Le son n’a pas pu être lu. Réessaie ou choisis un autre fichier." : null });
    if (result === "ended") request?.start();
    else request?.cancel();
  };
  const abort = () => finish("cancelled");
  const job = { cancel: abort };
  current = job;
  request?.signal?.addEventListener("abort", abort, { once: true });
  publish({ ...snapshot, playing: side, waiting: Boolean(request), error: null });
  const sound = snapshot[side].sound;
  const ended = () => finish("ended");
  const failed = () => finish("failed");
  // Wait for the actual end, never a duration estimate or a near-end timer.
  const playback = sound.builtin
    ? placeTwistAudio.play(sound.builtin, ended, undefined, failed)
    : sound.source ? placeTwistAudio.playFile(sound.source, ended, failed) : Promise.reject(new Error("No cue source"));
  void playback.catch(failed);
}

export const placeTransportCues = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  cancel,
  setTarget(side: CueSide, target: "chrono" | "player", enabled: boolean) {
    if (snapshot.playing === side) cancel();
    publish({ ...snapshot, [side]: { ...snapshot[side], [target]: enabled }, error: null });
  },
  replace(side: CueSide, sound: CueSound) {
    if (snapshot.playing === side) cancel();
    const old = snapshot[side].sound;
    if (old.local && old.source && old.source !== sound.source) URL.revokeObjectURL(old.source);
    publish({ ...snapshot, [side]: { ...snapshot[side], sound }, error: null });
  },
  restore(side: CueSide) { this.replace(side, { ...defaults[side] }); },
  preview(side: CueSide) {
    if (snapshot.playing === side) cancel();
    else play(side);
  },
  claimStart(request: PlaceMixerStartRequest) {
    if (!matches(snapshot.start, request.origin ?? "chrono")) return false;
    play("start", request);
    return true;
  },
  end(origin: CueOrigin) { if (matches(snapshot.end, origin)) play("end"); },
  reset() {
    cancel();
    for (const side of ["start", "end"] as const) {
      const sound = snapshot[side].sound;
      if (sound.local && sound.source) URL.revokeObjectURL(sound.source);
    }
    publish(initial());
  },
};

export function usePlaceTransportCues() {
  return useSyncExternalStore(placeTransportCues.subscribe, placeTransportCues.getSnapshot, placeTransportCues.getSnapshot);
}
