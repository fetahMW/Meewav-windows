export const SCENE_NAME = "La Scène";
export const SCENE_ROUTE = "/scene";
export const SCENE_FOLLOWING_ROUTE = `${SCENE_ROUTE}/suivis`;
export const SCENE_TV_ROUTE = `${SCENE_ROUTE}/tv`;
export const SCENE_EXPLORE_ROUTE = `${SCENE_ROUTE}/explorer`;
export const SCENE_STUDIO_ROUTE = `${SCENE_ROUTE}/studio`;
export const SCENE_WATCH_ROUTE = `${SCENE_ROUTE}/watch`;
export const SCENE_VERTICAL_ROUTE = `${SCENE_ROUTE}/vertical`;
export const SCENE_ARTIST_ROUTE = `${SCENE_ROUTE}/artist`;
export const SCENE_SEARCH_ROUTE = `${SCENE_ROUTE}/search`;
export const SCENE_UPLOAD_ROUTE = `${SCENE_ROUTE}/upload`;
export const SCENE_HISTORY_ROUTE = `${SCENE_ROUTE}/history`;
export const SCENE_PLAYLISTS_ROUTE = `${SCENE_ROUTE}/playlists`;
export const SCENE_PLAYLIST_ROUTE = `${SCENE_ROUTE}/playlist`;
export const SCENE_RECOMMENDATION_SETTINGS_ROUTE = `${SCENE_ROUTE}/recommendation-settings`;
export const LEGACY_SHORTS_ROUTE = "/shorts";

export type SceneRouteTab = "home" | "following" | "tv" | "explore";

export const SCENE_SIGNATURE = "Là où le talent règne sur l’algorithme.";
export const SCENE_FULL_SIGNATURE = `${SCENE_NAME} — là où le talent règne sur l’algorithme.`;
export const SCENE_SUBSIGNATURE =
  "Un flux 100 % musique conçu pour faire émerger les créations, les performances et les artistes.";

const SCENE_ROUTE_ALIASES: Readonly<Record<string, SceneRouteTab>> = {
  "": "home",
  accueil: "home",
  home: "home",
  suivis: "following",
  abonnements: "following",
  following: "following",
  tv: "tv",
  explorer: "explore",
  explore: "explore",
  decouvrir: "explore",
  search: "explore",
};

function normalizePathname(pathname: string) {
  const normalized = pathname.trim().replace(/\/+$/, "");
  return normalized || "/";
}

function getFirstNestedSegment(pathname: string, root: string) {
  const normalized = normalizePathname(pathname);
  if (normalized === root) return "";
  if (!normalized.startsWith(`${root}/`)) return null;
  return normalized.slice(root.length + 1).split("/")[0]?.toLocaleLowerCase("fr-FR") ?? "";
}

export function getScenePathForTab(tab: SceneRouteTab) {
  if (tab === "following") return SCENE_FOLLOWING_ROUTE;
  if (tab === "tv") return SCENE_TV_ROUTE;
  if (tab === "explore") return SCENE_EXPLORE_ROUTE;
  return SCENE_ROUTE;
}

export function getSceneWatchPath(slug: string) {
  return `${SCENE_WATCH_ROUTE}/${encodeURIComponent(slug)}`;
}

export function getSceneWatchSlug(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (!normalized.startsWith(`${SCENE_WATCH_ROUTE}/`)) return null;
  const rawSlug = normalized.slice(SCENE_WATCH_ROUTE.length + 1).split("/")[0] ?? "";
  if (!rawSlug) return null;
  try {
    return decodeURIComponent(rawSlug);
  } catch {
    return rawSlug;
  }
}

function getDecodedSceneRouteValue(pathname: string, route: string) {
  const normalized = normalizePathname(pathname);
  if (!normalized.startsWith(`${route}/`)) return null;
  const rawValue = normalized.slice(route.length + 1).split("/")[0] ?? "";
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function getSceneVerticalPath(videoId: string) {
  return `${SCENE_VERTICAL_ROUTE}/${encodeURIComponent(videoId)}`;
}

export function getSceneVerticalVideoId(pathname: string) {
  return getDecodedSceneRouteValue(pathname, SCENE_VERTICAL_ROUTE);
}

export function getSceneArtistPath(artistId: string) {
  return `${SCENE_ARTIST_ROUTE}/${encodeURIComponent(artistId)}`;
}

export function getSceneArtistReference(pathname: string) {
  return getDecodedSceneRouteValue(pathname, SCENE_ARTIST_ROUTE);
}

export function getScenePlaylistPath(playlistId: string) {
  return `${SCENE_PLAYLIST_ROUTE}/${encodeURIComponent(playlistId)}`;
}

export function getScenePlaylistId(pathname: string) {
  return getDecodedSceneRouteValue(pathname, SCENE_PLAYLIST_ROUTE);
}

/** Resolves canonical and historical deep links without exposing Shorts in UI. */
export function getSceneTabFromPathname(pathname: string): SceneRouteTab | null {
  const canonicalSegment = getFirstNestedSegment(pathname, SCENE_ROUTE);
  if (canonicalSegment !== null) return SCENE_ROUTE_ALIASES[canonicalSegment] ?? null;

  const legacySegment = getFirstNestedSegment(pathname, LEGACY_SHORTS_ROUTE);
  if (legacySegment !== null) return SCENE_ROUTE_ALIASES[legacySegment] ?? null;

  return null;
}

/**
 * Converts a legacy Shorts URL to the canonical La Scène route. Known old
 * deep links are normalized; unknown nested paths remain available during the
 * migration. Search parameters and hashes are appended by the caller.
 */
export function getCanonicalScenePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  const legacySegment = getFirstNestedSegment(normalized, LEGACY_SHORTS_ROUTE);

  if (legacySegment !== null) {
    const knownTab = SCENE_ROUTE_ALIASES[legacySegment];
    if (knownTab) return getScenePathForTab(knownTab);
    return `${SCENE_ROUTE}${normalized.slice(LEGACY_SHORTS_ROUTE.length)}`;
  }

  return SCENE_ROUTE;
}
