import {
  ROOMS_HOME_FORMAT_FILTERS,
  type RoomsHomeFormatFilter,
} from "./roomsHome.types";
export type { RoomsHomeFormatFilter } from "./roomsHome.types";

export const ROOMS_HOME_SESSION_STORAGE_KEY = "meewav:rooms-home:session:v1";

export type RoomsHomeSessionSnapshot = {
  format: RoomsHomeFormatFilter;
  homeScrollTop: number;
  railScrollLeftBySlug: Record<string, number>;
  collectionScrollTopBySlug: Record<string, number>;
};

export type RoomsHomeSessionSnapshotUpdate = {
  format?: RoomsHomeFormatFilter;
  homeScrollTop?: number;
  railScrollLeftBySlug?: Record<string, number | null | undefined>;
  collectionScrollTopBySlug?: Record<string, number | null | undefined>;
};

type RoomsHomeSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const FORMAT_FILTERS = new Set<RoomsHomeFormatFilter>(ROOMS_HOME_FORMAT_FILTERS);

const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function createDefaultRoomsHomeSessionSnapshot(): RoomsHomeSessionSnapshot {
  return {
    format: "all",
    homeScrollTop: 0,
    railScrollLeftBySlug: {},
    collectionScrollTopBySlug: {},
  };
}

function getBrowserSessionStorage(): RoomsHomeSessionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeScrollPosition(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeScrollMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, number>>((positions, [slug, position]) => {
    if (slug.length > 0
      && !UNSAFE_RECORD_KEYS.has(slug)
      && typeof position === "number"
      && Number.isFinite(position)
      && position >= 0) {
      positions[slug] = position;
    }
    return positions;
  }, {});
}

function normalizeSnapshot(value: unknown): RoomsHomeSessionSnapshot {
  if (!isRecord(value)) return createDefaultRoomsHomeSessionSnapshot();

  return {
    format: typeof value.format === "string"
      && FORMAT_FILTERS.has(value.format as RoomsHomeFormatFilter)
      ? value.format as RoomsHomeFormatFilter
      : "all",
    homeScrollTop: normalizeScrollPosition(value.homeScrollTop),
    railScrollLeftBySlug: normalizeScrollMap(value.railScrollLeftBySlug),
    collectionScrollTopBySlug: normalizeScrollMap(value.collectionScrollTopBySlug),
  };
}

export function readRoomsHomeSessionSnapshot(
  storage: RoomsHomeSessionStorage | null = getBrowserSessionStorage(),
): RoomsHomeSessionSnapshot {
  if (!storage) return createDefaultRoomsHomeSessionSnapshot();

  try {
    const rawSnapshot = storage.getItem(ROOMS_HOME_SESSION_STORAGE_KEY);
    return rawSnapshot ? normalizeSnapshot(JSON.parse(rawSnapshot) as unknown) : createDefaultRoomsHomeSessionSnapshot();
  } catch {
    return createDefaultRoomsHomeSessionSnapshot();
  }
}

export function writeRoomsHomeSessionSnapshot(
  snapshot: RoomsHomeSessionSnapshot,
  storage: RoomsHomeSessionStorage | null = getBrowserSessionStorage(),
): RoomsHomeSessionSnapshot {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  if (!storage) return normalizedSnapshot;

  try {
    storage.setItem(ROOMS_HOME_SESSION_STORAGE_KEY, JSON.stringify(normalizedSnapshot));
  } catch {
    // Storage can be unavailable (privacy mode, exhausted quota, SSR). The
    // normalized snapshot is still returned so callers keep deterministic UI.
  }
  return normalizedSnapshot;
}

function mergeScrollMap(
  current: Record<string, number>,
  patch: Record<string, number | null | undefined> | undefined,
) {
  if (!patch) return current;

  const next = { ...current };
  Object.entries(patch).forEach(([slug, position]) => {
    if (!slug || UNSAFE_RECORD_KEYS.has(slug)) return;
    if (position === null || position === undefined) {
      delete next[slug];
      return;
    }
    if (Number.isFinite(position) && position >= 0) next[slug] = position;
  });
  return next;
}

export function updateRoomsHomeSessionSnapshot(
  patch: RoomsHomeSessionSnapshotUpdate,
  storage: RoomsHomeSessionStorage | null = getBrowserSessionStorage(),
): RoomsHomeSessionSnapshot {
  const current = readRoomsHomeSessionSnapshot(storage);
  return writeRoomsHomeSessionSnapshot({
    format: patch.format ?? current.format,
    homeScrollTop: patch.homeScrollTop ?? current.homeScrollTop,
    railScrollLeftBySlug: mergeScrollMap(current.railScrollLeftBySlug, patch.railScrollLeftBySlug),
    collectionScrollTopBySlug: mergeScrollMap(
      current.collectionScrollTopBySlug,
      patch.collectionScrollTopBySlug,
    ),
  }, storage);
}

export function resetRoomsHomeSessionSnapshot(
  storage: RoomsHomeSessionStorage | null = getBrowserSessionStorage(),
): RoomsHomeSessionSnapshot {
  if (storage) {
    try {
      storage.removeItem(ROOMS_HOME_SESSION_STORAGE_KEY);
    } catch {
      // Reset remains safe when the browser refuses storage access.
    }
  }
  return createDefaultRoomsHomeSessionSnapshot();
}
