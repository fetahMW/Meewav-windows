export type TremplinPersistedSet = "followed-artists" | "read-updates" | "room-reminders";

const STORAGE_VERSION = "v2";
const LEGACY_KEYS: Partial<Record<TremplinPersistedSet, string>> = {
  "followed-artists": "meewav:tremplin:demo:followed-artists",
  "read-updates": "meewav:tremplin:demo:read-updates",
};

export function getTremplinStorageKey(kind: TremplinPersistedSet, scope: string) {
  return `meewav:tremplin:${STORAGE_VERSION}:${encodeURIComponent(scope)}:${kind}`;
}

export function readTremplinPersistedSet(kind: TremplinPersistedSet, scope: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const key = getTremplinStorageKey(kind, scope);
    let serialized = window.localStorage.getItem(key);
    const legacyKey = scope.startsWith("preview:") || scope === "guest" ? LEGACY_KEYS[kind] : undefined;
    if (serialized === null && legacyKey) {
      serialized = window.localStorage.getItem(legacyKey);
      if (serialized !== null) window.localStorage.setItem(key, serialized);
    }
    const stored = JSON.parse(serialized ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string" && value.length > 0) : []);
  } catch {
    return new Set<string>();
  }
}

export function writeTremplinPersistedSet(kind: TremplinPersistedSet, scope: string, values: Iterable<string>) {
  if (typeof window === "undefined") return;
  const normalized = [...new Set(values)].filter(Boolean).sort();
  window.localStorage.setItem(getTremplinStorageKey(kind, scope), JSON.stringify(normalized));
}
