import { scenePrivateKey } from "../scenePrivateStorage";
import { useCallback, useEffect, useState } from "react";
import type { PlaybackList, RepeatMode } from "./scenePlaybackPolicy";

const KEY = "meewav:scene:playback-queue:v1";
export function parsePlaybackQueue(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "null");
    return { ids: Array.isArray(parsed?.ids) ? [...new Set<string>(parsed.ids.filter((id: unknown) => typeof id === "string"))].slice(0, 100) : [], autoplay: parsed?.autoplay === true };
  } catch { return { ids: [] as string[], autoplay: false }; }
}
export function moveQueuedVideo(ids: string[], id: string, direction: -1 | 1) {
  const index = ids.indexOf(id), target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
export function useScenePlaybackQueue() {
  const [state, setState] = useState(() => { try { return parsePlaybackQueue(sessionStorage.getItem(scenePrivateKey(KEY))); } catch { return parsePlaybackQueue(null); } });
  useEffect(() => { try { sessionStorage.setItem(scenePrivateKey(KEY), JSON.stringify(state)); } catch { /* Retain current-session playback even if storage is unavailable. */ } }, [state]);
  const [playlist, setPlaylist] = useState<PlaybackList | null>(null);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const startPlaylist = useCallback((id: string, title: string, ids: string[], currentId: string) => setPlaylist({ id, title, ids, index: ids.indexOf(currentId) }), []);
  const advancePlaylist = useCallback((id: string) => setPlaylist((list) => {
    if (!list) return list;
    const nextIndex = list.ids.indexOf(id, list.index + 1);
    return { ...list, index: nextIndex >= 0 ? nextIndex : list.ids.indexOf(id) };
  }), []);
  const shufflePlaylist = useCallback(() => setPlaylist((list) => {
    if (!list) return list;
    const tail = list.ids.slice(list.index + 1);
    for (let index = tail.length - 1; index > 0; index--) { const target = Math.floor(Math.random() * (index + 1)); [tail[index], tail[target]] = [tail[target], tail[index]]; }
    return { ...list, ids: [...list.ids.slice(0, list.index + 1), ...tail] };
  }), []);
  const add = useCallback((id: string) => setState((s) => ({ ...s, ids: [...s.ids.filter((value) => value !== id), id].slice(-100) })), []);
  const remove = useCallback((id: string) => setState((s) => ({ ...s, ids: s.ids.filter((value) => value !== id) })), []);
  const move = useCallback((id: string, direction: -1 | 1) => setState((s) => ({ ...s, ids: moveQueuedVideo(s.ids, id, direction) })), []);
  const clear = useCallback(() => setState((s) => ({ ...s, ids: [] })), []);
  const setAutoplay = useCallback((autoplay: boolean) => setState((s) => ({ ...s, autoplay })), []);
  return { ...state, add, remove, move, clear, setAutoplay, playlist, repeat, setRepeat, startPlaylist, advancePlaylist, shufflePlaylist, stopPlaylist: () => setPlaylist(null) };
}
export type ScenePlaybackQueue = ReturnType<typeof useScenePlaybackQueue>;
