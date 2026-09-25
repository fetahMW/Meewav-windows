import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Clock3, Heart, Home, ListVideo, Play, Settings2, Tv, UserRound, UsersRound } from "lucide-react";
import { getSceneArtistPath, getScenePlaylistPath, SCENE_HISTORY_ROUTE, SCENE_PLAYLISTS_ROUTE, SCENE_RECOMMENDATION_SETTINGS_ROUTE, SCENE_STUDIO_ROUTE } from "../shorts/sceneContract";
import { SCENE_WATCH_LATER_PLAYLIST_ID } from "./scenePlaylists";
import type { ShortsVideoItem } from "../shorts/shorts-wall-data";

type Props = {
  active: string;
  subscriptions: ShortsVideoItem[];
  canPublish: boolean;
  onNavigate: () => void;
};

export default function SceneBrowseNavigation({ active, subscriptions, canPublish, onNavigate }: Props) {
  const [showAll, setShowAll] = useState(false);
  const item = (href: string, label: string, Icon: typeof Home, id = href) => (
    <Link to={href} aria-current={active === id ? "page" : undefined} onClick={onNavigate}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </Link>
  );
  return <aside className="scene-browse-nav" id="scene-browse-nav" aria-label="Navigation vidéo">
    <nav aria-label="Découvrir La Scène">
      {item("/scene", "Accueil", Home, "home")}
      {item("/scene/explore?media=vertical", "Shorts", Play, "shorts")}
      {item("/scene/following", "Abonnements", UsersRound, "following")}
    </nav>
    <section aria-label="Tes abonnements">
      <Link className="scene-browse-nav__heading" to="/scene/following" onClick={onNavigate}>Abonnements <ChevronRight /></Link>
      <nav aria-label="Artistes suivis">
        {subscriptions.slice(0, showAll ? subscriptions.length : 7).map((artist) => <Link key={artist.artistId} to={getSceneArtistPath(artist.profileId ?? artist.artistId)} onClick={onNavigate} aria-current={active === artist.artistId ? "page" : undefined}>
          <img src={artist.artistPortrait ?? artist.image} alt="" loading="lazy" /><span>{artist.artist}</span>
        </Link>)}
        {subscriptions.length === 0 && <p>Suis des artistes pour les retrouver ici.</p>}
        {subscriptions.length > 7 && <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}><ChevronDown /><span>{showAll ? "Moins" : "Plus"}</span></button>}
      </nav>
    </section>
    <section aria-label="Ton espace vidéo">
      <Link className="scene-browse-nav__heading" to={SCENE_PLAYLISTS_ROUTE} onClick={onNavigate}>Vous <ChevronRight /></Link>
      <nav aria-label="Ta bibliothèque">
        {item("/profile", "Votre chaîne", UserRound)}
        {item(SCENE_HISTORY_ROUTE, "Historique", Clock3, "history")}
        {item(SCENE_PLAYLISTS_ROUTE, "Playlists", ListVideo, "playlists")}
        {item(getScenePlaylistPath(SCENE_WATCH_LATER_PLAYLIST_ID), "À regarder plus tard", Clock3, "watch-later")}
        {item("/scene/explore?liked=1", "Vidéos J’aime", Heart, "liked")}
        {canPublish && item(SCENE_STUDIO_ROUTE, "Vos vidéos", Play, "studio")}
      </nav>
    </section>
    <nav aria-label="Autres espaces vidéo">
      {item("/scene/tv", "MeeWav TV", Tv)}
      {item(SCENE_RECOMMENDATION_SETTINGS_ROUTE, "Préférences", Settings2)}
    </nav>
  </aside>;
}
