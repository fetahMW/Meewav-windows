import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createScenePlaylistRepository,
  LEGACY_SCENE_PLAYLIST_STORAGE_KEYS,
  parseScenePlaylists,
  SCENE_PLAYLISTS_STORAGE_KEY,
  SCENE_WATCH_LATER_PLAYLIST_ID,
  type ScenePlaylistStorage,
} from "./scenePlaylists";

const FIRST_DATE = "2026-08-08T08:00:00.000Z";

describe("scenePlaylists", () => {
  beforeEach(() => window.localStorage.clear());

  it("parses only the versioned document, sanitises rows and de-duplicates videos", () => {
    const parsed = parseScenePlaylists(JSON.stringify({
      version: 1,
      playlists: [{
        id: "favorites",
        title: "  Sessions   favorites  ",
        kind: "custom",
        videoIds: ["video-1", "video-1", "", 42, "video-2"],
        createdAt: FIRST_DATE,
        updatedAt: FIRST_DATE,
      }, {
        id: "bad",
        title: "",
        kind: "custom",
        videoIds: [],
      }],
    }));

    expect(parsed).toEqual([expect.objectContaining({
      id: "favorites",
      title: "Sessions favorites",
      videoIds: ["video-1", "video-2"],
    })]);
    expect(parseScenePlaylists("{cassé")).toEqual([]);
    expect(parseScenePlaylists(JSON.stringify({ version: 7, playlists: [] }))).toEqual([]);
  });

  it("creates a protected Watch Later playlist and manages named playlists", () => {
    let minute = 0;
    const repository = createScenePlaylistRepository({
      storage: window.localStorage,
      now: () => new Date(`2026-08-08T08:0${minute++}:00.000Z`),
      createId: () => "playlist-live-sessions",
    });

    expect(repository.read()).toEqual([expect.objectContaining({
      id: SCENE_WATCH_LATER_PLAYLIST_ID,
      kind: "watch_later",
      title: "À regarder plus tard",
    })]);
    const created = repository.create("  Live   sessions ");
    expect(created).toMatchObject({
      id: "playlist-live-sessions",
      title: "Live sessions",
      kind: "custom",
    });
    expect(repository.create("LIVE SESSIONS")).toBeNull();
    expect(repository.rename(created?.id ?? "", "Concerts du soir")?.title)
      .toBe("Concerts du soir");
    expect(repository.rename(SCENE_WATCH_LATER_PLAYLIST_ID, "À moi")).toBeNull();
    expect(repository.remove(SCENE_WATCH_LATER_PLAYLIST_ID)).toBe(false);
    expect(repository.remove(created?.id ?? "")).toBe(true);
  });

  it("adds, toggles, removes and reorders videos without duplicates", () => {
    let second = 0;
    const repository = createScenePlaylistRepository({
      storage: null,
      now: () => new Date(1_800_000_000_000 + second++ * 1_000),
    });

    repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-a");
    repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-b");
    repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-a");
    expect(repository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
      .toEqual(["video-a", "video-b"]);

    repository.moveVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-a", 1);
    expect(repository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
      .toEqual(["video-b", "video-a"]);
    expect(repository.containsVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-b")).toBe(true);

    repository.toggleVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-b");
    expect(repository.containsVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-b")).toBe(false);
    repository.toggleVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-c");
    expect(repository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
      .toEqual(["video-c", "video-a"]);
  });

  it("migrates the two legacy La Scène actions into distinct useful playlists", () => {
    window.localStorage.setItem(
      LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.watchLater,
      JSON.stringify(["saved-1", "saved-2", "saved-1"]),
    );
    window.localStorage.setItem(
      LEGACY_SCENE_PLAYLIST_STORAGE_KEYS.custom,
      JSON.stringify(["playlist-1", "playlist-2"]),
    );
    const repository = createScenePlaylistRepository({
      storage: window.localStorage,
      now: () => new Date(FIRST_DATE),
    });

    expect(repository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
      .toEqual(["saved-1", "saved-2"]);
    expect(repository.get("playlist-imported")).toMatchObject({
      title: "Ma playlist",
      videoIds: ["playlist-1", "playlist-2"],
    });
    expect(window.localStorage.getItem(SCENE_PLAYLISTS_STORAGE_KEY)).toContain("playlist-imported");
  });

  it("bounds collections, emits immutable snapshots and survives blocked storage", () => {
    const failingStorage: ScenePlaylistStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    const listener = vi.fn();
    let id = 0;
    const repository = createScenePlaylistRepository({
      storage: failingStorage,
      maxPlaylists: 2,
      maxVideosPerPlaylist: 2,
      now: () => new Date(FIRST_DATE),
      createId: () => `playlist-${++id}`,
    });
    const unsubscribe = repository.subscribe(listener);

    expect(() => repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "one")).not.toThrow();
    repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "two");
    repository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "three", 2);
    const playlist = repository.get(SCENE_WATCH_LATER_PLAYLIST_ID);
    expect(playlist?.videoIds).toEqual(["two", "one"]);
    if (playlist) playlist.videoIds.push("mutated-outside");
    expect(repository.containsVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "mutated-outside"))
      .toBe(false);

    expect(repository.create("Première")).not.toBeNull();
    expect(repository.create("Deuxième")).toBeNull();
    expect(listener).toHaveBeenCalled();
    const notified = listener.mock.calls[listener.mock.calls.length - 1]?.[0];
    notified?.[0]?.videoIds.push("observer-mutation");
    expect(repository.containsVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "observer-mutation"))
      .toBe(false);

    unsubscribe();
    expect(() => repository.clear()).not.toThrow();
    expect(repository.read()).toEqual([expect.objectContaining({
      id: SCENE_WATCH_LATER_PLAYLIST_ID,
      videoIds: [],
    })]);
  });
});
