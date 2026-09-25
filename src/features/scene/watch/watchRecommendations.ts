import { scenePrivateKey } from "../scenePrivateStorage";
import type { ShortsVideoItem } from "../../shorts/shorts-wall-data";
import { sceneWatchHistoryRepository } from "../sceneWatchHistory";
import { readSceneRecommendationPreferences } from "../recommendations/sceneRecommendationPreferences";

const DISMISSED_KEY = "meewav:scene:dismissed-videos:v1";
export function readDismissedVideos(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(scenePrivateKey(DISMISSED_KEY)) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(-200) : []; } catch { return []; }
}
export function restoreDismissedVideos(ids: string[]) {
  try { localStorage.setItem(scenePrivateKey(DISMISSED_KEY), JSON.stringify(ids.slice(-200))); } catch { /* Current view still restores the selection. */ }
}
export function dismissVideo(id: string) {
  const ids = [...new Set([...readDismissedVideos(), id])].slice(-200);
  try { localStorage.setItem(scenePrivateKey(DISMISSED_KEY), JSON.stringify(ids)); } catch { /* Current view still hides the video. */ }
  return ids;
}
export function watchRecommendations(items: ShortsVideoItem[], current: ShortsVideoItem, dismissed: string[] = []) {
  const preferences = readSceneRecommendationPreferences();
  const history = new Map((preferences.personalizationEnabled && preferences.historyEnabled ? sceneWatchHistoryRepository.read() : []).map((entry) => [entry.videoId, entry]));
  const seen = new Set<string>();
  const excluded = new Set([...readDismissedVideos(), ...dismissed]);
  const candidates = items.filter((item) => {
    if (seen.has(item.id) || item.id === current.id || item.format === "portrait" || item.presentationFormat === "vertical" || excluded.has(item.id) || preferences.hiddenArtistIds.includes(item.artistId ?? item.artist)) return false;
    seen.add(item.id); return true;
  });
  const score = (item: ShortsVideoItem) => (history.get(item.id)?.completed ? -20 : 0) + (item.artist === current.artist ? 4 : 0) + (item.role === current.role ? 2 : 0);
  candidates.sort((a, b) => score(b) - score(a));
  const ranked: ShortsVideoItem[] = [];
  while (candidates.length) {
    const differentArtist = ranked.length > 0 ? candidates.findIndex((item) => item.artist !== ranked[ranked.length - 1].artist) : 0;
    ranked.push(...candidates.splice(Math.max(0, differentArtist), 1));
  }
  return ranked;
}
