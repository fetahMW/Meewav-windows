import { scopedSceneRepository, scopedSceneStorage } from "./scenePrivateStorage";
export const SCENE_PLAYLISTS_STORAGE_KEY = "meewav:scene:playlists:v1";

export const LEGACY_SCENE_PLAYLIST_STORAGE_KEYS = {
  watchLater: "meewav:shorts:selection",
  custom: "meewav:scene:playlist:demo",
} as const;

export const SCENE_WATCH_LATER_PLAYLIST_ID = "watch-later";
export const SCENE_MAX_PLAYLISTS = 30;
export const SCENE_MAX_VIDEOS_PER_PLAYLIST = 500;

const SCENE_PLAYLISTS_VERSION = 1;
const MAX_TITLE_LENGTH = 80;
const MAX_VIDEO_ID_LENGTH = 240;

export type ScenePlaylistKind = "watch_later" | "custom";

export type ScenePlaylist = {
  id: string;
  title: string;
  kind: ScenePlaylistKind;
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
};

type ScenePlaylistsDocument = {
  version: typeof SCENE_PLAYLISTS_VERSION;
  playlists: ScenePlaylist[];
};

export type ScenePlaylistStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type ScenePlaylistRepository = {
  read: () => ScenePlaylist[];
  get: (playlistId: string) => ScenePlaylist | null;
  create: (title: string) => ScenePlaylist | null;
  rename: (playlistId: string, title: string) => ScenePlaylist | null;
  remove: (playlistId: string) => boolean;
  addVideo: (playlistId: string, videoId: string, index?: number) => ScenePlaylist | null;
  removeVideo: (playlistId: string, videoId: string) => ScenePlaylist | null;
  toggleVideo: (playlistId: string, videoId: string) => ScenePlaylist | null;
  moveVideo: (playlistId: string, videoId: string, targetIndex: number) => ScenePlaylist | null;
  containsVideo: (playlistId: string, videoId: string) => boolean;
  clear: () => void;
  subscribe: (listener: (playlists: ScenePlaylist[]) => void) => () => void;
};

export type CreateScenePlaylistRepositoryOptions = {
  /** Pass null for SSR or an in-memory-only preview. */
  storage?: ScenePlaylistStorage | null;
  storageKey?: string;
  now?: () => Date;
  createId?: () => string;
  maxPlaylists?: number;
  maxVideosPerPlaylist?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/gu, " ").slice(0, maxLength);
}

function normalizeVideoIds(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const candidate of value) {
    const videoId = normalizeText(candidate, MAX_VIDEO_ID_LENGTH);
    if (!videoId || unique.has(videoId)) continue;
    unique.add(videoId);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

function clonePlaylist(playlist: ScenePlaylist): ScenePlaylist {
  return { ...playlist, videoIds: [...playlist.videoIds] };
}

function sortPlaylists(playlists: readonly ScenePlaylist[]) {
  return [...playlists].sort((left, right) => {
    if (left.kind === "watch_later") return -1;
    if (right.kind === "watch_later") return 1;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function parsePlaylist(
  value: unknown,
  maxVideosPerPlaylist: number,
): ScenePlaylist | null {
  if (!isRecord(value)) return null;
  const id = normalizeText(value.id, 120);
  const title = normalizeText(value.title, MAX_TITLE_LENGTH);
  const kind = value.kind === "watch_later" || value.kind === "custom"
    ? value.kind
    : null;
  if (!id || !title || !kind || !isValidIsoDate(value.createdAt) || !isValidIsoDate(value.updatedAt)) {
    return null;
  }
  return {
    id: kind === "watch_later" ? SCENE_WATCH_LATER_PLAYLIST_ID : id,
    title: kind === "watch_later" ? "À regarder plus tard" : title,
    kind,
    videoIds: normalizeVideoIds(value.videoIds, maxVideosPerPlaylist),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseScenePlaylists(
  serialized: string | null | undefined,
  maxVideosPerPlaylist = SCENE_MAX_VIDEOS_PER_PLAYLIST,
) {
  if (!serialized) return [];
  try {
    const document: unknown = JSON.parse(serialized);
    if (
      !isRecord(document)
      || document.version !== SCENE_PLAYLISTS_VERSION
      || !Array.isArray(document.playlists)
    ) return [];

    const unique = new Map<string, ScenePlaylist>();
    for (const candidate of document.playlists) {
      const playlist = parsePlaylist(candidate, maxVideosPerPlaylist);
      if (!playlist) continue;
      const previous = unique.get(playlist.id);
      if (!previous || Date.parse(playlist.updatedAt) > Date.parse(previous.updatedAt)) {
        unique.set(playlist.id, playlist);
      }
    }
    return sortPlaylists([...unique.values()]);
  } catch {
    return [];
  }
}

function resolveBrowserStorage(): ScenePlaylistStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `playlist-${crypto.randomUUID()}`;
  }
  return `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createScenePlaylistRepository(
  options: CreateScenePlaylistRepositoryOptions = {},
): ScenePlaylistRepository {
  const storage = options.storage === undefined ? resolveBrowserStorage() : options.storage;
  const storageKey = options.storageKey ?? SCENE_PLAYLISTS_STORAGE_KEY;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? defaultId;
  const maxPlaylists = Math.min(Math.max(Math.floor(
    options.maxPlaylists ?? SCENE_MAX_PLAYLISTS,
  ), 1), 100);
  const maxVideosPerPlaylist = Math.min(Math.max(Math.floor(
    options.maxVideosPerPlaylist ?? SCENE_MAX_VIDEOS_PER_PLAYLIST,
  ), 1), 2_000);
  const listeners = new Set<(playlists: ScenePlaylist[]) => void>();
  let memoryPlaylists: ScenePlaylist[] = [];
  let hydrated = false;

  const safeReadKey = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const snapshot = () => sortPlaylists(memoryPlaylists).map(clonePlaylist);

  const publish = () => {
    const current = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(current.map(clonePlaylist));
      } catch {
        // One observer must never break playlist persistence for the others.
      }
    });
  };

  const persist = (playlists: readonly ScenePlaylist[]) => {
    memoryPlaylists = sortPlaylists(playlists).slice(0, maxPlaylists).map(clonePlaylist);
    const document: ScenePlaylistsDocument = {
      version: SCENE_PLAYLISTS_VERSION,
      playlists: memoryPlaylists,
    };
    try {
      storage?.setItem(storageKey, JSON.stringify(document));
    } catch {
      // Storage quota/private mode must not break the current media session.
    }
    publish();
  };

  const buildWatchLater = (videoIds: string[], timestamp: string): ScenePlaylist => ({
    id: SCENE_WATCH_LATER_PLAYLIST_ID,
    title: "À regarder plus tard",
    kind: "watch_later",
    videoIds: normalizeVideoIds(videoIds, maxVideosPerPlaylist),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    const canonical = parseScenePlaylists(safeReadKey(storageKey), maxVideosPerPlaylist);
    if (canonical.length > 0) {
      memoryPlaylists = canonical.slice(0, maxPlaylists);
      return;
    }

    const timestamp = now().toISOString();
    const watchLaterIds = normalizeVideoIds(
      (() => {
        try {
          return JSON.parse(safeReadKey(LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.watchLater) ?? "[]");
        } catch {
          return [];
        }
      })(),
      maxVideosPerPlaylist,
    );
    const customIds = normalizeVideoIds(
      (() => {
        try {
          return JSON.parse(safeReadKey(LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.custom) ?? "[]");
        } catch {
          return [];
        }
      })(),
      maxVideosPerPlaylist,
    );
    memoryPlaylists = [buildWatchLater(watchLaterIds, timestamp)];
    if (customIds.length > 0 && maxPlaylists > 1) {
      memoryPlaylists.push({
        id: "playlist-imported",
        title: "Ma playlist",
        kind: "custom",
        videoIds: customIds,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (watchLaterIds.length > 0 || customIds.length > 0) persist(memoryPlaylists);
  };

  const read = () => {
    hydrate();
    if (!memoryPlaylists.some((playlist) => playlist.kind === "watch_later")) {
      const timestamp = now().toISOString();
      memoryPlaylists.unshift(buildWatchLater([], timestamp));
    }
    return snapshot();
  };

  const get = (playlistId: string) => {
    const normalizedId = normalizeText(playlistId, 120);
    const playlist = read().find((candidate) => candidate.id === normalizedId);
    return playlist ? clonePlaylist(playlist) : null;
  };

  const findTitleCollision = (title: string, exceptId?: string) => read().some((playlist) => (
    playlist.id !== exceptId
    && playlist.title.localeCompare(title, "fr-FR", { sensitivity: "accent" }) === 0
  ));

  const create = (rawTitle: string) => {
    const title = normalizeText(rawTitle, MAX_TITLE_LENGTH);
    const playlists = read();
    if (!title || playlists.length >= maxPlaylists || findTitleCollision(title)) return null;
    const timestamp = now().toISOString();
    const playlist: ScenePlaylist = {
      id: normalizeText(createId(), 120) || defaultId(),
      title,
      kind: "custom",
      videoIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (playlists.some((candidate) => candidate.id === playlist.id)) return null;
    persist([...playlists, playlist]);
    return clonePlaylist(playlist);
  };

  const update = (
    playlistId: string,
    transform: (playlist: ScenePlaylist) => ScenePlaylist | null,
  ) => {
    const playlists = read();
    const index = playlists.findIndex((playlist) => playlist.id === playlistId);
    if (index < 0) return null;
    const next = transform(clonePlaylist(playlists[index]));
    if (!next) return null;
    playlists[index] = next;
    persist(playlists);
    return clonePlaylist(next);
  };

  const rename = (playlistId: string, rawTitle: string) => {
    const title = normalizeText(rawTitle, MAX_TITLE_LENGTH);
    if (!title || findTitleCollision(title, playlistId)) return null;
    return update(playlistId, (playlist) => {
      if (playlist.kind === "watch_later") return null;
      return { ...playlist, title, updatedAt: now().toISOString() };
    });
  };

  const remove = (playlistId: string) => {
    const playlists = read();
    const playlist = playlists.find((candidate) => candidate.id === playlistId);
    if (!playlist || playlist.kind === "watch_later") return false;
    persist(playlists.filter((candidate) => candidate.id !== playlistId));
    return true;
  };

  const addVideo = (playlistId: string, rawVideoId: string, index = 0) => {
    const videoId = normalizeText(rawVideoId, MAX_VIDEO_ID_LENGTH);
    if (!videoId) return null;
    return update(playlistId, (playlist) => {
      const withoutDuplicate = playlist.videoIds.filter((candidate) => candidate !== videoId);
      const targetIndex = Math.max(0, Math.min(Math.floor(index), withoutDuplicate.length));
      withoutDuplicate.splice(targetIndex, 0, videoId);
      return {
        ...playlist,
        videoIds: withoutDuplicate.slice(0, maxVideosPerPlaylist),
        updatedAt: now().toISOString(),
      };
    });
  };

  const removeVideo = (playlistId: string, rawVideoId: string) => {
    const videoId = normalizeText(rawVideoId, MAX_VIDEO_ID_LENGTH);
    if (!videoId) return null;
    return update(playlistId, (playlist) => ({
      ...playlist,
      videoIds: playlist.videoIds.filter((candidate) => candidate !== videoId),
      updatedAt: now().toISOString(),
    }));
  };

  const containsVideo = (playlistId: string, rawVideoId: string) => {
    const videoId = normalizeText(rawVideoId, MAX_VIDEO_ID_LENGTH);
    return Boolean(videoId && get(playlistId)?.videoIds.includes(videoId));
  };

  const toggleVideo = (playlistId: string, videoId: string) => (
    containsVideo(playlistId, videoId)
      ? removeVideo(playlistId, videoId)
      : addVideo(playlistId, videoId)
  );

  const moveVideo = (playlistId: string, rawVideoId: string, rawTargetIndex: number) => {
    const videoId = normalizeText(rawVideoId, MAX_VIDEO_ID_LENGTH);
    if (!videoId || !Number.isFinite(rawTargetIndex)) return null;
    return update(playlistId, (playlist) => {
      if (!playlist.videoIds.includes(videoId)) return null;
      const reordered = playlist.videoIds.filter((candidate) => candidate !== videoId);
      const targetIndex = Math.max(0, Math.min(Math.floor(rawTargetIndex), reordered.length));
      reordered.splice(targetIndex, 0, videoId);
      return { ...playlist, videoIds: reordered, updatedAt: now().toISOString() };
    });
  };

  const clear = () => {
    hydrated = true;
    const timestamp = now().toISOString();
    memoryPlaylists = [buildWatchLater([], timestamp)];
    try {
      storage?.removeItem(storageKey);
      storage?.removeItem(LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.watchLater);
      storage?.removeItem(LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.custom);
    } catch {
      // Clearing optional local preferences remains best-effort.
    }
    publish();
  };

  const subscribe = (listener: (playlists: ScenePlaylist[]) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    read,
    get,
    create,
    rename,
    remove,
    addVideo,
    removeVideo,
    toggleVideo,
    moveVideo,
    containsVideo,
    clear,
    subscribe,
  };
}

/** Browser repository shared by every future La Scène surface. */
export const scenePlaylistRepository = scopedSceneRepository<ScenePlaylistRepository>((identity) => createScenePlaylistRepository({ storage: scopedSceneStorage(identity) }));
