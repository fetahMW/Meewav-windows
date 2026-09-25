import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, MoreVertical, X } from "lucide-react";
import type { ShortsVideoItem } from "../../shorts/shorts-wall-data";
import type { ScenePlaybackQueue } from "./useScenePlaybackQueue";
import { readSceneRecommendationPreferences, writeSceneRecommendationPreferences } from "../recommendations/sceneRecommendationPreferences";
import { trackSceneAnalytics } from "../sceneAnalytics";
import { watchRecommendations, dismissVideo, readDismissedVideos, restoreDismissedVideos } from "./watchRecommendations";
import { sceneWatchHistoryRepository } from "../sceneWatchHistory";
import { getSceneWatchPath } from "../../shorts/sceneContract";
import { sceneVideoSlug } from "./sceneVideoLink";
import { scenePlaylistRepository } from "../scenePlaylists";

type Props = { nextSource?: string; nextTitle?: string; current: ShortsVideoItem; items: ShortsVideoItem[]; queue: ScenePlaybackQueue; onPlay: (item: ShortsVideoItem) => void; onSave: (item: ShortsVideoItem) => void; savedIds: Set<string>; onPreferencesChange: () => void; countdown: number | null; onCancelAutoplay: () => void };
export default function SceneWatchSidebar({ nextSource, nextTitle, current, items, queue, onPlay, onSave, savedIds, onPreferencesChange, countdown, onCancelAutoplay }: Props) {
  const [count, setCount] = useState(12);
  const [hidden, setHidden] = useState<string[]>(readDismissedVideos);
  const [preferences, setPreferences] = useState(readSceneRecommendationPreferences);
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeMenus = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      sidebar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
        if (event instanceof KeyboardEvent || !menu.contains(event.target as Node)) {
          menu.open = false;
          if (event instanceof KeyboardEvent) menu.querySelector("summary")?.focus();
        }
      });
    };
    document.addEventListener("pointerdown", closeMenus); document.addEventListener("keydown", closeMenus);
    return () => { document.removeEventListener("pointerdown", closeMenus); document.removeEventListener("keydown", closeMenus); };
  }, []);
  const videos = useMemo(() => watchRecommendations(items, current, hidden), [items, current.id, hidden, preferences]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setCount((n) => Math.min(n + 12, videos.length)); }, { rootMargin: "350px" });
    observer.observe(element); return () => observer.disconnect();
  }, [videos.length, count]);
  const watched = new Map(sceneWatchHistoryRepository.read().map((entry) => [entry.videoId, entry]));
  const play = (item: ShortsVideoItem) => { queue.remove(item.id); onPlay(item); };
  return <aside id="scene-watch-next" tabIndex={-1} ref={sidebar} className="scene-watch-sidebar" aria-label="Recommandations et file d’attente">
    <header><h2>À suivre</h2><label className="scene-autoplay"><input type="checkbox" checked={queue.autoplay} onChange={(e) => queue.setAutoplay(e.target.checked)} /> Recommandations automatiques</label></header>
    {nextTitle && <p className="scene-next-origin">Ensuite · {nextSource} : <strong>{nextTitle}</strong></p>}
    <div className="scene-playback-policy"><label>Répétition <select aria-label="Répétition" value={queue.repeat} onChange={(event) => queue.setRepeat(event.target.value as "off" | "one" | "all")}><option value="off">Désactivée</option><option value="one">Ce titre</option><option value="all" disabled={!queue.playlist}>La playlist</option></select></label></div>
    {queue.playlist && <section className="scene-watch-queue"><strong>Playlist · {queue.playlist.title}</strong><p>{queue.playlist.index + 1} / {queue.playlist.ids.length}</p><button onClick={queue.shufflePlaylist}>Mélanger la suite</button><button onClick={queue.stopPlaylist}>Quitter la playlist</button></section>}
    {countdown !== null && <div className="scene-autoplay-countdown" role="status">Prochaine vidéo dans {countdown} s <button onClick={onCancelAutoplay}>Annuler</button></div>}
    {queue.ids.length > 0 && <section className="scene-watch-queue" aria-label="File d’attente"><header><strong>File de cette session · {queue.ids.length}</strong><button onClick={queue.clear}>Vider</button></header>{queue.ids.map((id, index) => {
      const item = items.find((video) => video.id === id); if (!item) return <div key={id}><span>{index + 1}. Vidéo indisponible · ignorée à la lecture</span><button aria-label="Retirer la vidéo indisponible" onClick={() => queue.remove(id)}><X /></button></div>;
      return <div key={id}><button className="scene-queue-title" onClick={() => play(item)}>{index + 1}. {item.title}</button><button aria-label={`Monter ${item.title}`} disabled={index === 0} onClick={() => queue.move(id, -1)}><ArrowUp /></button><button aria-label={`Descendre ${item.title}`} disabled={index === queue.ids.length - 1} onClick={() => queue.move(id, 1)}><ArrowDown /></button><button aria-label={`Retirer ${item.title}`} onClick={() => queue.remove(id)}><X /></button></div>;
    })}</section>}
    {message && <p role="status">{message}</p>}
    {undo && <button onClick={() => { undo(); setUndo(null); setMessage("Préférence annulée."); onPreferencesChange(); }}>Annuler le masquage</button>}
    {videos.slice(0, count).map((item) => <article className="scene-watch-suggestion" key={item.id}>
      <a href={getSceneWatchPath(sceneVideoSlug(item))} className="scene-watch-suggestion__play" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); play(item); }} aria-label={`Regarder ${item.title} de ${item.artist}`}><span className="scene-watch-suggestion__image"><img src={item.image} alt="" loading="lazy" /><small>{item.duration}</small>{watched.has(item.id) && <i className="scene-watch-suggestion__progress" style={{ width: `${Math.min(100, watched.get(item.id)!.currentTime / Math.max(1, watched.get(item.id)!.duration) * 100)}%` }} />}</span><span><strong>{item.title}</strong><small>{item.artist}</small><small>{item.views}{watched.get(item.id)?.completed ? " · Déjà vue" : ""}</small></span></a>
      <details className="scene-watch-suggestion__menu"><summary aria-label={`Options pour ${item.title}`}><MoreVertical /></summary><div>
        <button onClick={() => { queue.add(item.id); setMessage("Vidéo ajoutée à la file d’attente."); }}><ListPlus /> Ajouter à la file</button>
        <button aria-pressed={savedIds.has(item.id)} onClick={() => onSave(item)}>{savedIds.has(item.id) ? "Retirer de À regarder plus tard" : "À regarder plus tard"}</button>
        <label>Enregistrer dans une playlist<select aria-label={`Playlist pour ${item.title}`} value="" onChange={(e) => { if (e.target.value) { const result = scenePlaylistRepository.addVideo(e.target.value, item.id); setMessage(result ? "Vidéo enregistrée dans la playlist." : "Playlist indisponible. Choisis une autre playlist."); } }}><option value="">Choisir une playlist</option>{scenePlaylistRepository.read().map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}</option>)}</select></label>
        <button onClick={() => { setUndo(() => () => { restoreDismissedVideos(hidden); setHidden(hidden); }); setHidden(dismissVideo(item.id)); setMessage("Cette vidéo ne sera plus proposée."); onPreferencesChange(); trackSceneAnalytics({ event: "not_interested", mediaId: item.id }); }}>Pas intéressé</button>
        <button onClick={() => { setUndo(() => () => setPreferences(writeSceneRecommendationPreferences(preferences))); setMessage("Cet artiste ne sera plus proposé."); setPreferences(writeSceneRecommendationPreferences({ ...preferences, hiddenArtistIds: [...preferences.hiddenArtistIds, item.artistId ?? item.artist] })); onPreferencesChange(); }}>Ne plus recommander cet artiste</button>
      </div></details>
    </article>)}
    {count < videos.length && <div ref={sentinel}><button className="scene-watch-load-more" onClick={() => setCount((n) => n + 12)}>Plus de recommandations</button></div>}
    {videos.length === 0 && <p>Aucune autre vidéo à proposer pour le moment.</p>}
  </aside>;
}
