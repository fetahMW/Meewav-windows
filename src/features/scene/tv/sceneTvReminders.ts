const SCENE_TV_REMINDERS_STORAGE_KEY = "meewav:scene-tv:reminders";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readSceneTvReminderIds(): Set<string> {
  if (!canUseStorage()) return new Set();

  try {
    const stored = JSON.parse(window.localStorage.getItem(SCENE_TV_REMINDERS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return new Set();
    return new Set(stored.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function writeSceneTvReminderIds(reminderIds: ReadonlySet<string>) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      SCENE_TV_REMINDERS_STORAGE_KEY,
      JSON.stringify([...reminderIds]),
    );
  } catch {
    // The reminder remains available for the current render when storage is blocked.
  }
}

export function toggleSceneTvReminder(
  reminderIds: ReadonlySet<string>,
  programId: string,
): Set<string> {
  const next = new Set(reminderIds);
  if (next.has(programId)) next.delete(programId);
  else next.add(programId);
  return next;
}

export { SCENE_TV_REMINDERS_STORAGE_KEY };
