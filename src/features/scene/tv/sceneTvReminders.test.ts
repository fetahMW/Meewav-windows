import { beforeEach, describe, expect, it } from "vitest";

import {
  readSceneTvReminderIds,
  SCENE_TV_REMINDERS_STORAGE_KEY,
  toggleSceneTvReminder,
  writeSceneTvReminderIds,
} from "./sceneTvReminders";

describe("MeeWav TV reminders", () => {
  beforeEach(() => window.localStorage.clear());

  it("adds and removes one explicit programme reminder", () => {
    const enabled = toggleSceneTvReminder(new Set(), "programme-session");
    expect(enabled.has("programme-session")).toBe(true);

    const disabled = toggleSceneTvReminder(enabled, "programme-session");
    expect(disabled.has("programme-session")).toBe(false);
  });

  it("persists only valid programme identifiers", () => {
    writeSceneTvReminderIds(new Set(["programme-session", "programme-premiere"]));
    expect(readSceneTvReminderIds()).toEqual(new Set([
      "programme-session",
      "programme-premiere",
    ]));

    window.localStorage.setItem(
      SCENE_TV_REMINDERS_STORAGE_KEY,
      JSON.stringify(["programme-session", 42, null]),
    );
    expect(readSceneTvReminderIds()).toEqual(new Set(["programme-session"]));
  });

  it("recovers from malformed storage without breaking the antenna", () => {
    window.localStorage.setItem(SCENE_TV_REMINDERS_STORAGE_KEY, "not-json");
    expect(readSceneTvReminderIds()).toEqual(new Set());
  });
});
