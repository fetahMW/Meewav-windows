import { beforeEach, describe, expect, it } from "vitest";
import {
  createSceneWatchHistoryRepository,
  LEGACY_SHORTS_WATCH_HISTORY_STORAGE_KEYS,
  parseSceneWatchHistory,
  SCENE_WATCH_HISTORY_STORAGE_KEY,
  type SceneWatchHistoryStorage,
} from "./sceneWatchHistory";

const FIRST_DATE = "2026-08-07T08:00:00.000Z";

describe("sceneWatchHistory", () => {
  beforeEach(() => window.localStorage.clear());

  it("validates persisted rows, de-duplicates videos and accepts the legacy array shape", () => {
    const parsed = parseSceneWatchHistory(JSON.stringify([
      {
        videoId: "scene-1",
        currentTime: 12,
        duration: 100,
        completed: false,
        updatedAt: FIRST_DATE,
      },
      {
        videoId: "scene-1",
        currentTime: 18,
        duration: 100,
        completed: false,
        updatedAt: "2026-08-07T09:00:00.000Z",
      },
      { videoId: "invalid", currentTime: "12", duration: 100 },
    ]));

    expect(parsed).toEqual([expect.objectContaining({
      videoId: "scene-1",
      currentTime: 18,
      completed: false,
    })]);
    expect(parseSceneWatchHistory("{cassé")).toEqual([]);
    expect(parseSceneWatchHistory(JSON.stringify({ version: 99, entries: [] }))).toEqual([]);
  });

  it("upserts, orders and bounds progress history", () => {
    let minute = 0;
    const repository = createSceneWatchHistoryRepository({
      storage: window.localStorage,
      maxEntries: 2,
      now: () => new Date(`2026-08-07T08:0${minute++}:00.000Z`),
    });

    repository.upsertProgress({ videoId: "one", currentTime: 10, duration: 100 });
    repository.upsertProgress({ videoId: "two", currentTime: 20, duration: 100 });
    repository.upsertProgress({ videoId: "three", currentTime: 30, duration: 100 });
    repository.upsertProgress({ videoId: "two", currentTime: 40, duration: 100 });

    expect(repository.read().map((entry) => entry.videoId)).toEqual(["two", "three"]);
    expect(repository.read()[0]).toMatchObject({ currentTime: 40, duration: 100 });
    expect(JSON.parse(
      window.localStorage.getItem(SCENE_WATCH_HISTORY_STORAGE_KEY) ?? "{}",
    )).toMatchObject({ version: 1 });
  });

  it("excludes completed videos from Continue until playback starts again", () => {
    let timestamp = 0;
    const repository = createSceneWatchHistoryRepository({
      storage: null,
      now: () => new Date(1_800_000_000_000 + timestamp++ * 1_000),
    });

    repository.upsertProgress({ videoId: "scene-1", currentTime: 44, duration: 100 });
    expect(repository.getContinueWatching().map((entry) => entry.videoId)).toEqual(["scene-1"]);

    repository.markCompleted("scene-1");
    expect(repository.getContinueWatching()).toEqual([]);

    repository.upsertProgress({ videoId: "scene-1", currentTime: 1, duration: 100 });
    expect(repository.read()[0]).toMatchObject({ completed: false });
    expect(repository.read()[0].replayedAt).toBeDefined();
    expect(repository.getContinueWatching()).toEqual([]);

    repository.upsertProgress({ videoId: "scene-1", currentTime: 8, duration: 100 });
    expect(repository.getContinueWatching().map((entry) => entry.videoId)).toEqual(["scene-1"]);
  });

  it("migrates the first valid legacy Shorts history into the La Scène key", () => {
    window.localStorage.setItem(
      LEGACY_SHORTS_WATCH_HISTORY_STORAGE_KEYS[0],
      JSON.stringify([{
        videoId: "legacy-short",
        currentTime: 20,
        duration: 90,
        completed: false,
        updatedAt: FIRST_DATE,
      }]),
    );
    const repository = createSceneWatchHistoryRepository({ storage: window.localStorage });

    expect(repository.read().map((entry) => entry.videoId)).toEqual(["legacy-short"]);
    expect(window.localStorage.getItem(SCENE_WATCH_HISTORY_STORAGE_KEY)).toContain("legacy-short");
  });

  it("remains usable when localStorage access fails", () => {
    const failingStorage: SceneWatchHistoryStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    const repository = createSceneWatchHistoryRepository({
      storage: failingStorage,
      now: () => new Date(FIRST_DATE),
    });

    expect(() => repository.upsertProgress({
      videoId: "memory-only",
      currentTime: 15,
      duration: 80,
    })).not.toThrow();
    expect(repository.getContinueWatching()).toEqual([
      expect.objectContaining({ videoId: "memory-only", currentTime: 15 }),
    ]);
    expect(() => repository.clear()).not.toThrow();
    expect(repository.read()).toEqual([]);
  });

  it("does not classify the opening seconds or invalid input as resumable", () => {
    const repository = createSceneWatchHistoryRepository({
      storage: null,
      now: () => new Date(FIRST_DATE),
    });

    expect(repository.upsertProgress({ videoId: "", currentTime: 2, duration: 100 })).toBeNull();
    expect(repository.upsertProgress({
      videoId: "bad-duration",
      currentTime: 2,
      duration: Number.NaN,
    })).toBeNull();
    repository.upsertProgress({ videoId: "opening", currentTime: 2, duration: 100 });
    repository.upsertProgress({ videoId: "near-end", currentTime: 96, duration: 100 });

    expect(repository.getContinueWatching()).toEqual([]);
    expect(repository.read().find((entry) => entry.videoId === "near-end")?.completed).toBe(true);
  });
});
