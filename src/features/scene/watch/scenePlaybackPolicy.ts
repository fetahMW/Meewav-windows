import type { SceneWatchHistoryEntry } from "../sceneWatchHistory";

export type PlaybackList = { id: string; title: string; ids: string[]; index: number };
export type RepeatMode = "off" | "one" | "all";
export type NextPlayback = { id: string; source: "file" | "playlist" | "recommandation" | "répétition" };
export function resolveNextPlayback({ currentId, queue, playlist, repeat, recommendationId, autoplay, manual = false, available }: { currentId: string; queue: string[]; playlist: PlaybackList | null; repeat: RepeatMode; recommendationId?: string; autoplay: boolean; manual?: boolean; available: Set<string> }): NextPlayback | null {
  if (!manual && repeat === "one") return { id: currentId, source: "répétition" };
  const queued = queue.find((id) => id !== currentId && available.has(id));
  if (queued) return { id: queued, source: "file" };
  if (playlist) {
    const remaining = playlist.ids.slice(playlist.index + 1);
    if (repeat === "all") remaining.push(...playlist.ids.slice(0, playlist.index + 1));
    const id = remaining.find((candidate) => available.has(candidate));
    if (id) return { id, source: id === currentId && !manual ? "répétition" : "playlist" };
  }
  return (autoplay || manual) && recommendationId && available.has(recommendationId) ? { id: recommendationId, source: "recommandation" } : null;
}
/** Product choice: explicit timestamps win; short songs and completed videos restart. */
export function initialWatchTime(explicit: string | null, history?: SceneWatchHistoryEntry) {
  if (explicit !== null && explicit.trim() && Number.isFinite(Number(explicit))) return Math.max(0, Number(explicit));
  return history && !history.completed && history.duration >= 600 ? history.currentTime : 0;
}
/** Re-check at the end and during countdown, not just when autoplay is enabled. */
export function canAdvancePlayback(doc: Document = document) {
  if (doc.hidden) return false;
  if (doc.activeElement?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],details[open]')) return false;
  if (doc.querySelector('[role="dialog"], .scene-comment-composer [disabled][type="submit"]')) return false;
  if ([...doc.querySelectorAll<HTMLTextAreaElement>('.scene-inline-comments textarea')].some((input) => input.value.trim())) return false;
  if (doc.querySelector('.shorts-player-layer.is-miniplayer')) return false;
  const frame = doc.querySelector('.shorts-player-layer.is-watch .shorts-player-frame');
  const context = doc.querySelector('.scene-context-bar');
  return !frame || frame.getBoundingClientRect().bottom > (context?.getBoundingClientRect().bottom ?? 0);
}
