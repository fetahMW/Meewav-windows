import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ListVideo,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SCENE_WATCH_LATER_PLAYLIST_ID,
  scenePlaylistRepository,
  type ScenePlaylist,
} from "../scenePlaylists";
import "./scene-playlists-view.css";

export type ScenePlaylistVideo = {
  id: string;
  title: string;
  artist: string;
  image: string;
  alt: string;
  duration: string;
};

type Props = {
  videos: readonly ScenePlaylistVideo[];
  selectedPlaylistId?: string | null;
  onSelectPlaylist: (playlistId: string) => void;
  onPlay: (videoId: string, playlist?: ScenePlaylist) => void;
  onBack: () => void;
  onNotify: (message: string) => void;
};

export default function ScenePlaylistsView({
  videos,
  selectedPlaylistId,
  onSelectPlaylist,
  onPlay,
  onBack,
  onNotify,
}: Props) {
  const [playlists, setPlaylists] = useState<ScenePlaylist[]>(() => scenePlaylistRepository.read());
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => scenePlaylistRepository.subscribe(setPlaylists), []);

  const activePlaylist = playlists.find(({ id }) => id === selectedPlaylistId)
    ?? playlists.find(({ id }) => id === SCENE_WATCH_LATER_PLAYLIST_ID)
    ?? playlists[0]
    ?? null;
  const videosById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
  const playlistVideos = activePlaylist?.videoIds.map((id) => videosById.get(id) ?? { id, title: "Vidéo indisponible", artist: "Ce contenu ne peut pas être lu.", image: "", alt: "", duration: "" }) ?? [];


  const createPlaylist = () => {
    const created = scenePlaylistRepository.create(newTitle);
    if (!created) {
      onNotify("Choisis un nom unique pour cette playlist.");
      return;
    }
    setNewTitle("");
    onSelectPlaylist(created.id);
    onNotify(`Playlist « ${created.title} » créée.`);
  };

  return (
    <section className="scene-playlists-view" aria-labelledby="scene-playlists-title">
      <header>
        <button type="button" onClick={onBack}><ArrowLeft /> La Scène</button>
        <div><span>Bibliothèque personnelle</span><h1 id="scene-playlists-title">Tes playlists</h1><p>Playlists conservées sur cet appareil pour ce compte.</p></div>
        <strong>{playlists.length} playlist{playlists.length > 1 ? "s" : ""}</strong>
      </header>

      <div className="scene-playlists-view__layout">
        <aside aria-label="Mes playlists">
          <form onSubmit={(event) => { event.preventDefault(); createPlaylist(); }}>
            <input
              value={newTitle}
              maxLength={80}
              placeholder="Nouvelle playlist"
              aria-label="Nom de la nouvelle playlist"
              onChange={(event) => setNewTitle(event.currentTarget.value)}
            />
            <button type="submit" aria-label="Créer la playlist" disabled={!newTitle.trim()}><Plus /></button>
          </form>
          <nav>
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={playlist.id === activePlaylist?.id ? "is-active" : ""}
                aria-current={playlist.id === activePlaylist?.id ? "page" : undefined}
                onClick={() => onSelectPlaylist(playlist.id)}
              >
                <ListVideo />
                <span><strong>{playlist.title}</strong><small>{playlist.videoIds.length} vidéo{playlist.videoIds.length > 1 ? "s" : ""}</small></span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="scene-playlists-view__content" aria-live="polite">
          {activePlaylist ? (
            <>
              <header>
                {editingId === activePlaylist.id ? (
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const renamed = scenePlaylistRepository.rename(activePlaylist.id, editingTitle);
                    if (renamed) { setEditingId(null); onNotify("Playlist renommée."); }
                  }}>
                    <input value={editingTitle} aria-label="Nouveau nom de la playlist" onChange={(event) => setEditingTitle(event.currentTarget.value)} />
                    <button type="submit">Enregistrer</button>
                    <button type="button" aria-label="Annuler le renommage" onClick={() => setEditingId(null)}><X /></button>
                  </form>
                ) : (
                  <div><span>Playlist</span><h2>{activePlaylist.title}</h2></div>
                )}
                {activePlaylist.kind === "custom" && editingId !== activePlaylist.id ? (
                  <div>
                    <button type="button" onClick={() => { setEditingId(activePlaylist.id); setEditingTitle(activePlaylist.title); }}><Pencil /> Renommer</button>
                    <button type="button" className="is-danger" onClick={() => {
                      scenePlaylistRepository.remove(activePlaylist.id);
                      onSelectPlaylist(SCENE_WATCH_LATER_PLAYLIST_ID);
                      onNotify("Playlist supprimée.");
                    }}><Trash2 /> Supprimer</button>
                  </div>
                ) : null}
              </header>

              {playlistVideos.length ? (
                <ol>
                  {playlistVideos.map((video, index) => (
                    <li key={video.id}>
                      <button type="button" disabled={!video.image} className="scene-playlists-view__media" onClick={() => onPlay(video.id, activePlaylist)}>
                        {video.image ? <img src={video.image} alt={video.alt} loading="lazy" /> : <span aria-label="Média indisponible"><ListVideo /></span>}
                        <span><Play fill="currentColor" /></span><small>{video.duration}</small>
                      </button>
                      <div><strong>{video.title}</strong><span>{video.artist}</span></div>
                      <div className="scene-playlists-view__row-actions">
                        <button type="button" aria-label={`Monter ${video.title}`} disabled={index === 0} onClick={() => scenePlaylistRepository.moveVideo(activePlaylist.id, video.id, index - 1)}><ArrowUp /></button>
                        <button type="button" aria-label={`Descendre ${video.title}`} disabled={index === playlistVideos.length - 1} onClick={() => scenePlaylistRepository.moveVideo(activePlaylist.id, video.id, index + 1)}><ArrowDown /></button>
                        <button type="button" aria-label={`Retirer ${video.title}`} onClick={() => scenePlaylistRepository.removeVideo(activePlaylist.id, video.id)}><X /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="scene-playlists-view__empty"><ListVideo /><h2>Cette playlist est prête.</h2><p>Ajoute une création depuis le menu d’une vidéo.</p></div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}
