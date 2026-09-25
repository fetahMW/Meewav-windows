const CONSULTED_PROFILE_IDS_STORAGE_PREFIX = "meewav:consulted-profile-ids";
const HIDE_CONSULTED_PROFILES_STORAGE_PREFIX = "meewav:hide-consulted-profiles";
const STORAGE_VERSION = "v2";
const MAX_STORED_CONSULTED_PROFILE_IDS = 500;

function normalizeStorageOwnerId(userId: string | null | undefined) {
  const normalized = String(userId ?? "").trim();
  return normalized || null;
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsultedProfileIdsStorageKey(userId: string | null | undefined) {
  const ownerId = normalizeStorageOwnerId(userId);
  return ownerId
    ? `${CONSULTED_PROFILE_IDS_STORAGE_PREFIX}:${ownerId}:${STORAGE_VERSION}`
    : null;
}

export function getHideConsultedProfilesStorageKey(userId: string | null | undefined) {
  const ownerId = normalizeStorageOwnerId(userId);
  return ownerId
    ? `${HIDE_CONSULTED_PROFILES_STORAGE_PREFIX}:${ownerId}:${STORAGE_VERSION}`
    : null;
}

export function normalizeConsultedProfileIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return [...new Set(input
    .map((profileId) => String(profileId ?? "").trim())
    .filter(Boolean))]
    .slice(-MAX_STORED_CONSULTED_PROFILE_IDS);
}

export function readConsultedProfileIds(userId: string | null | undefined) {
  const key = getConsultedProfileIdsStorageKey(userId);
  const storage = getBrowserStorage();
  if (!key || !storage) return [];

  try {
    const stored = storage.getItem(key);
    return normalizeConsultedProfileIds(stored ? JSON.parse(stored) : null);
  } catch {
    return [];
  }
}

export function persistConsultedProfileIds(
  userId: string | null | undefined,
  profileIds: string[],
) {
  const key = getConsultedProfileIdsStorageKey(userId);
  const storage = getBrowserStorage();
  if (!key || !storage) return;

  try {
    storage.setItem(key, JSON.stringify(normalizeConsultedProfileIds(profileIds)));
  } catch {
    // The visual consultation history remains available for the current render.
  }
}

export function readHideConsultedProfilesPreference(userId: string | null | undefined) {
  const key = getHideConsultedProfilesStorageKey(userId);
  const storage = getBrowserStorage();
  if (!key || !storage) return false;

  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function persistHideConsultedProfilesPreference(
  userId: string | null | undefined,
  hidden: boolean,
) {
  const key = getHideConsultedProfilesStorageKey(userId);
  const storage = getBrowserStorage();
  if (!key || !storage) return;

  try {
    storage.setItem(key, String(hidden));
  } catch {
    // This is a non-critical map preference.
  }
}
