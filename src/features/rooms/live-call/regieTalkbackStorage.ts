const REGIE_TARGET_PREFIX = "meewav:room-regie-target:v1";

function keyForRoom(roomId: string) {
  return `${REGIE_TARGET_PREFIX}:${roomId}`;
}

export function readRegieTalkbackTarget(roomId: string) {
  if (typeof window === "undefined" || !roomId) return null;
  try {
    return window.localStorage.getItem(keyForRoom(roomId));
  } catch {
    return null;
  }
}

export function writeRegieTalkbackTarget(roomId: string, profileId: string | null) {
  if (typeof window === "undefined" || !roomId) return;
  try {
    if (profileId) window.localStorage.setItem(keyForRoom(roomId), profileId);
    else window.localStorage.removeItem(keyForRoom(roomId));
  } catch {
    // The in-memory gate remains authoritative for this session.
  }
}
