import { scopedSceneRepository, scopedSceneStorage } from "./scenePrivateStorage";
export const SCENE_WATCH_HISTORY_STORAGE_KEY = "meewav:scene:watch-history:v1";

export const LEGACY_SHORTS_WATCH_HISTORY_STORAGE_KEYS = [
  "meewav:shorts:watch-history:v1",
  "meewav:shorts:watch-history",
] as const;

export const SCENE_WATCH_HISTORY_LIMIT = 60;
export const SCENE_CONTINUE_MIN_SECONDS = 3;

const SCENE_WATCH_HISTORY_VERSION = 1;
const COMPLETE_RATIO = 0.95;
const COMPLETE_REMAINING_SECONDS = 10;

export type SceneWatchHistoryEntry = {
  videoId: string;
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
  completedAt?: string;
  replayedAt?: string;
};

export type SceneWatchProgressInput = {
  videoId: string;
  currentTime: number;
  duration: number;
  completed?: boolean;
  updatedAt?: string;
};

type SceneWatchHistoryDocument = {
  version: typeof SCENE_WATCH_HISTORY_VERSION;
  entries: SceneWatchHistoryEntry[];
};

export type SceneWatchHistoryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type SceneWatchHistoryRepository = {
  read: () => SceneWatchHistoryEntry[];
  upsertProgress: (input: SceneWatchProgressInput) => SceneWatchHistoryEntry | null;
  markCompleted: (
    videoId: string,
    duration?: number,
    updatedAt?: string,
  ) => SceneWatchHistoryEntry | null;
  getContinueWatching: () => SceneWatchHistoryEntry[];
  remove: (videoId: string) => void;
  clear: () => void;
};

export type CreateSceneWatchHistoryRepositoryOptions = {
  /** Pass null to deliberately use the in-memory, SSR-safe fallback. */
  storage?: SceneWatchHistoryStorage | null;
  storageKey?: string;
  legacyStorageKeys?: readonly string[];
  maxEntries?: number;
  now?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, value) * 100) / 100;
}

function isPlaybackComplete(currentTime: number, duration: number) {
  if (duration <= 0) return false;
  const ratioComplete = currentTime / duration >= COMPLETE_RATIO;
  const nearEndOfLongVideo = duration >= 60
    && duration - currentTime <= COMPLETE_REMAINING_SECONDS;
  return ratioComplete || nearEndOfLongVideo;
}

function parseEntry(value: unknown): SceneWatchHistoryEntry | null {
  if (!isRecord(value)) return null;
  const videoId = typeof value.videoId === "string" ? value.videoId.trim() : "";
  const currentTime = normalizeSeconds(value.currentTime);
  const duration = normalizeSeconds(value.duration);
  if (
    !videoId
    || videoId.length > 240
    || currentTime === null
    || duration === null
    || duration <= 0
    || !isValidIsoDate(value.updatedAt)
  ) {
    return null;
  }

  const normalizedCurrentTime = Math.min(currentTime, duration);
  const completed = value.completed === true
    || isPlaybackComplete(normalizedCurrentTime, duration);
  const completedAt = isValidIsoDate(value.completedAt)
    ? value.completedAt
    : completed
      ? value.updatedAt
      : undefined;
  const replayedAt = isValidIsoDate(value.replayedAt) ? value.replayedAt : undefined;

  return {
    videoId,
    currentTime: normalizedCurrentTime,
    duration,
    completed,
    updatedAt: value.updatedAt,
    ...(completedAt ? { completedAt } : {}),
    ...(replayedAt ? { replayedAt } : {}),
  };
}

function sortByMostRecent(entries: readonly SceneWatchHistoryEntry[]) {
  return [...entries].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

/**
 * Accepts both the versioned La Scène document and the old Shorts array shape.
 * Invalid rows are ignored instead of breaking the media home.
 */
export function parseSceneWatchHistory(serialized: string | null | undefined) {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    const candidates = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed)
        && parsed.version === SCENE_WATCH_HISTORY_VERSION
        && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

    const unique = new Map<string, SceneWatchHistoryEntry>();
    for (const candidate of candidates) {
      const entry = parseEntry(candidate);
      if (!entry) continue;
      const previous = unique.get(entry.videoId);
      if (!previous || Date.parse(entry.updatedAt) > Date.parse(previous.updatedAt)) {
        unique.set(entry.videoId, entry);
      }
    }
    return sortByMostRecent([...unique.values()]);
  } catch {
    return [];
  }
}

function resolveBrowserStorage(): SceneWatchHistoryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function serialize(entries: SceneWatchHistoryEntry[]): SceneWatchHistoryDocument {
  return {
    version: SCENE_WATCH_HISTORY_VERSION,
    entries,
  };
}

export function createSceneWatchHistoryRepository(
  options: CreateSceneWatchHistoryRepositoryOptions = {},
): SceneWatchHistoryRepository {
  const storage = options.storage === undefined
    ? resolveBrowserStorage()
    : options.storage;
  const storageKey = options.storageKey ?? SCENE_WATCH_HISTORY_STORAGE_KEY;
  const legacyStorageKeys = options.legacyStorageKeys
    ?? LEGACY_SHORTS_WATCH_HISTORY_STORAGE_KEYS;
  const maxEntries = Math.min(
    Math.max(Math.floor(options.maxEntries ?? SCENE_WATCH_HISTORY_LIMIT), 1),
    500,
  );
  const now = options.now ?? (() => new Date());
  let memoryEntries: SceneWatchHistoryEntry[] = [];
  let hydrated = false;

  const safeReadKey = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const safePersist = (entries: SceneWatchHistoryEntry[]) => {
    memoryEntries = sortByMostRecent(entries).slice(0, maxEntries);
    try {
      storage?.setItem(storageKey, JSON.stringify(serialize(memoryEntries)));
    } catch {
      // Private browsing, quotas and SSR must not interrupt playback.
    }
  };

  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;

    const canonicalRaw = safeReadKey(storageKey);
    if (canonicalRaw !== null) {
      memoryEntries = parseSceneWatchHistory(canonicalRaw).slice(0, maxEntries);
      return;
    }

    for (const legacyKey of legacyStorageKeys) {
      const legacyRaw = safeReadKey(legacyKey);
      if (legacyRaw === null) continue;
      const migrated = parseSceneWatchHistory(legacyRaw).slice(0, maxEntries);
      memoryEntries = migrated;
      if (migrated.length > 0) safePersist(migrated);
      return;
    }
  };

  const read = () => {
    hydrate();
    return memoryEntries.map((entry) => ({ ...entry }));
  };

  const upsertProgress = (input: SceneWatchProgressInput) => {
    const videoId = input.videoId.trim();
    const currentTime = normalizeSeconds(input.currentTime);
    const duration = normalizeSeconds(input.duration);
    const fallbackTimestamp = now().toISOString();
    const updatedAt = isValidIsoDate(input.updatedAt)
      ? input.updatedAt
      : fallbackTimestamp;

    if (
      !videoId
      || videoId.length > 240
      || currentTime === null
      || duration === null
      || duration <= 0
    ) {
      return null;
    }

    const entries = read();
    const previous = entries.find((entry) => entry.videoId === videoId);
    const boundedCurrentTime = Math.min(currentTime, duration);
    const completed = input.completed === true
      || isPlaybackComplete(boundedCurrentTime, duration);
    const replayed = Boolean(previous?.completed && !completed);
    const next: SceneWatchHistoryEntry = {
      videoId,
      currentTime: boundedCurrentTime,
      duration,
      completed,
      updatedAt,
      ...(completed
        ? { completedAt: previous?.completedAt ?? updatedAt }
        : {}),
      ...((replayed || previous?.replayedAt)
        ? { replayedAt: replayed ? updatedAt : previous?.replayedAt }
        : {}),
    };

    safePersist([next, ...entries.filter((entry) => entry.videoId !== videoId)]);
    return { ...next };
  };

  const markCompleted = (
    videoId: string,
    duration?: number,
    updatedAt?: string,
  ) => {
    const previous = read().find((entry) => entry.videoId === videoId.trim());
    const nextDuration = normalizeSeconds(duration) ?? previous?.duration ?? null;
    if (nextDuration === null || nextDuration <= 0) return null;
    return upsertProgress({
      videoId,
      currentTime: nextDuration,
      duration: nextDuration,
      completed: true,
      updatedAt,
    });
  };

  const getContinueWatching = () => read().filter((entry) => (
    !entry.completed
    && entry.currentTime >= SCENE_CONTINUE_MIN_SECONDS
    && entry.currentTime < entry.duration
  ));

  const remove = (videoId: string) => {
    safePersist(read().filter((entry) => entry.videoId !== videoId.trim()));
  };

  const clear = () => {
    hydrated = true;
    memoryEntries = [];
    try {
      storage?.removeItem(storageKey);
      for (const legacyKey of legacyStorageKeys) storage?.removeItem(legacyKey);
    } catch {
      // Clearing optional demo history must remain best-effort.
    }
  };

  return {
    read,
    upsertProgress,
    markCompleted,
    getContinueWatching,
    remove,
    clear,
  };
}

/** Default browser repository used by the La Scène demo. */
export const sceneWatchHistoryRepository = scopedSceneRepository<SceneWatchHistoryRepository>((identity) => createSceneWatchHistoryRepository({ storage: scopedSceneStorage(identity) }));
