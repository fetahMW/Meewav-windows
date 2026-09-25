import { afterEach, describe, expect, it } from "vitest";
import { canAdvancePlayback, initialWatchTime, resolveNextPlayback } from "./scenePlaybackPolicy";
import { setScenePrivateScope } from "../scenePrivateStorage";
import { scenePlaylistRepository } from "../scenePlaylists";
import { sceneWatchHistoryRepository } from "../sceneWatchHistory";
const policy = { currentId: "a", queue: ["missing", "b"], playlist: { id: "list", title: "Live", ids: ["a", "c", "d"], index: 0 }, repeat: "off" as const, recommendationId: "e", autoplay: false, available: new Set(["a", "b", "c", "d", "e"]) };
afterEach(() => { document.body.innerHTML = ""; setScenePrivateScope("legacy"); });
describe("Contrat de lecture V3", () => {
 it("priorise la file explicite puis la playlist, même sans recommandations automatiques", () => {
  expect(resolveNextPlayback(policy)).toEqual({ id: "b", source: "file" });
  expect(resolveNextPlayback({ ...policy, queue: [] })).toEqual({ id: "c", source: "playlist" });
  expect(resolveNextPlayback({ ...policy, queue: [], playlist: null })).toBeNull();
 });
 it("répète naturellement un titre mais Suivant quitte cette répétition", () => {
  expect(resolveNextPlayback({ ...policy, repeat: "one" })).toEqual({ id: "a", source: "répétition" });
  expect(resolveNextPlayback({ ...policy, repeat: "one", manual: true })).toEqual({ id: "b", source: "file" });
 });
 it("boucle une playlist seulement sur demande et ignore les médias absents", () => {
  const end = { ...policy, queue: [], playlist: { ...policy.playlist, index: 2 }, currentId: "d" };
  expect(resolveNextPlayback(end)).toBeNull();
  expect(resolveNextPlayback({ ...end, repeat: "all" })).toEqual({ id: "a", source: "playlist" });
 });
 it("bloque l’enchaînement pendant la saisie, un brouillon, une modale ou la consultation sous le lecteur", () => {
  expect(canAdvancePlayback()).toBe(true);
  document.body.innerHTML = '<input aria-label="Recherche"><section class="scene-inline-comments"><textarea></textarea></section>';
  document.querySelector("input")!.focus(); expect(canAdvancePlayback()).toBe(false);
  document.querySelector("input")!.blur(); document.querySelector("textarea")!.value = "Message en cours"; expect(canAdvancePlayback()).toBe(false);
  document.body.innerHTML = '<div role="dialog"></div>'; expect(canAdvancePlayback()).toBe(false);
  document.body.innerHTML = '<div class="shorts-player-layer is-watch"><div class="shorts-player-frame"></div></div>';
  expect(canAdvancePlayback()).toBe(false);
 });
 it("reprend un concert inachevé mais redémarre une chanson ou une vidéo terminée", () => {
  const history = { videoId: "a", currentTime: 123, duration: 7200, completed: false, updatedAt: new Date().toISOString() };
  expect(initialWatchTime(null, history)).toBe(123);
  expect(initialWatchTime(null, { ...history, duration: 240 })).toBe(0);
  expect(initialWatchTime(null, { ...history, completed: true })).toBe(0);
  expect(initialWatchTime("45", history)).toBe(45);
 });
 it("ne mélange pas les playlists et la progression de deux comptes ni celles d’un visiteur", () => {
  setScenePrivateScope("test-v3-alice"); scenePlaylistRepository.clear(); sceneWatchHistoryRepository.clear();
  const list = scenePlaylistRepository.create("Privée Alice")!; scenePlaylistRepository.addVideo(list.id, "a");
  sceneWatchHistoryRepository.upsertProgress({ videoId: "a", currentTime: 25, duration: 100 });
  setScenePrivateScope("test-v3-bob"); scenePlaylistRepository.clear(); sceneWatchHistoryRepository.clear();
  expect(scenePlaylistRepository.read().some((item) => item.title === "Privée Alice")).toBe(false);
  expect(sceneWatchHistoryRepository.read()).toHaveLength(0);
  setScenePrivateScope("test-v3-alice"); expect(scenePlaylistRepository.get(list.id)?.videoIds).toEqual(["a"]); expect(sceneWatchHistoryRepository.read()[0].currentTime).toBe(25);
 });
});
