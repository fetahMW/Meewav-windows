import { describe, expect, it, vi } from "vitest";
import {
  createMeeWavMediaSessionCoordinator,
  MEEWAV_MEDIA_SOURCE_KINDS,
  type MeeWavMediaPauseContext,
} from "./mediaSessionCoordinator";

describe("MeeWavMediaSessionCoordinator", () => {
  it("supports every MeeWav playback surface", () => {
    expect(MEEWAV_MEDIA_SOURCE_KINDS).toEqual([
      "scene_video",
      "scene_audio",
      "scene_tv",
      "room",
      "global_audio",
    ]);
  });

  it("arbitrates one slot across all five source kinds", () => {
    const coordinator = createMeeWavMediaSessionCoordinator();
    const pauses = MEEWAV_MEDIA_SOURCE_KINDS.map(() => vi.fn());

    MEEWAV_MEDIA_SOURCE_KINDS.forEach((source, index) => {
      coordinator.claim({ source, id: `${source}-player`, pause: pauses[index] });
    });

    pauses.slice(0, -1).forEach((pause) => expect(pause).toHaveBeenCalledOnce());
    expect(pauses[pauses.length - 1]).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().active?.source.kind).toBe("global_audio");
  });

  it("keeps exactly one claim and pauses the previous source", () => {
    const videoPause = vi.fn<(context: MeeWavMediaPauseContext) => void>();
    const tvPause = vi.fn<(context: MeeWavMediaPauseContext) => void>();
    const coordinator = createMeeWavMediaSessionCoordinator({ now: () => 1234 });

    const video = coordinator.claim({
      source: "scene_video",
      id: "watch-player:video-42",
      mediaId: "video-42",
      pause: videoPause,
    });
    const tv = coordinator.claim({
      source: "scene_tv",
      id: "tv-main",
      pause: tvPause,
    });

    expect(videoPause).toHaveBeenCalledOnce();
    expect(videoPause).toHaveBeenCalledWith(expect.objectContaining({
      reason: "superseded",
      source: video.source,
      nextSource: tv.source,
    }));
    expect(tvPause).not.toHaveBeenCalled();
    expect(video.isCurrent()).toBe(false);
    expect(tv.isCurrent()).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({
      revision: 2,
      active: { token: tv.token, source: tv.source, state: "active", claimedAt: 1234 },
    });
  });

  it("makes stale releases harmless when one owner reclaims its slot", () => {
    const firstPause = vi.fn();
    const currentPause = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator();
    const first = coordinator.claim({ source: "room", id: "room-player", pause: firstPause });
    const current = coordinator.claim({ source: "room", id: "room-player", pause: currentPause });

    expect(firstPause).not.toHaveBeenCalled();
    expect(first.release()).toBe(false);
    expect(current.isCurrent()).toBe(true);
    expect(coordinator.getSnapshot().active?.token).toBe(current.token);
  });

  it("pauses idempotently, retains ownership, and can be reclaimed to resume", () => {
    const pause = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator();
    const first = coordinator.claim({ source: "global_audio", id: "footer-player", pause });

    expect(coordinator.pause("route_change")).toBe(true);
    expect(coordinator.pause("route_change")).toBe(false);
    expect(pause).toHaveBeenCalledOnce();
    expect(first.isCurrent()).toBe(true);
    expect(coordinator.getSnapshot().active?.state).toBe("paused");

    const resumed = coordinator.claim({ source: "global_audio", id: "footer-player", pause });
    expect(first.isCurrent()).toBe(false);
    expect(resumed.isCurrent()).toBe(true);
    expect(coordinator.getSnapshot().active?.state).toBe("active");
    expect(pause).toHaveBeenCalledOnce();
  });

  it("releases the current source and pauses by default", () => {
    const pause = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator();
    const lease = coordinator.claim({ source: "scene_audio", id: "profile-preview", pause });

    expect(coordinator.release(lease)).toBe(true);
    expect(pause).toHaveBeenCalledWith(expect.objectContaining({ reason: "released" }));
    expect(coordinator.getSnapshot().active).toBeNull();
    expect(lease.release()).toBe(false);
  });

  it("can release naturally ended media without pausing it again", () => {
    const pause = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator();
    const lease = coordinator.claim({ source: "scene_video", id: "ended-video", pause });

    expect(lease.release({ pause: false })).toBe(true);
    expect(pause).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().active).toBeNull();
  });

  it("isolates synchronous and asynchronous pause errors", async () => {
    const onError = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator({ onError });
    coordinator.claim({
      source: "scene_video",
      id: "broken-sync",
      pause: () => { throw new Error("sync pause failed"); },
    });

    expect(() => coordinator.claim({
      source: "scene_tv",
      id: "broken-async",
      pause: () => Promise.reject(new Error("async pause failed")),
    })).not.toThrow();
    expect(coordinator.pause()).toBe(true);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "sync pause failed" }),
      expect.objectContaining({ phase: "pause", reason: "superseded" }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "async pause failed" }),
      expect.objectContaining({ phase: "pause", reason: "system" }),
    );
  });

  it("publishes stable snapshots and isolates subscriber failures", () => {
    const onError = vi.fn();
    const coordinator = createMeeWavMediaSessionCoordinator({ onError });
    const listener = vi.fn();
    coordinator.subscribe(() => { throw new Error("subscriber failed"); });
    const unsubscribe = coordinator.subscribe(listener);

    const before = coordinator.getSnapshot();
    const lease = coordinator.claim({ source: "scene_audio", id: "preview", pause: vi.fn() });
    const claimed = coordinator.getSnapshot();
    lease.pause();
    const paused = coordinator.getSnapshot();
    unsubscribe();
    lease.release();

    expect(before).not.toBe(claimed);
    expect(claimed).not.toBe(paused);
    expect(Object.isFrozen(claimed)).toBe(true);
    expect(Object.isFrozen(claimed.active)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "subscriber failed" }),
      expect.objectContaining({ phase: "listener" }),
    );
  });

  it("works without window, document, navigator or HTML media classes", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("HTMLMediaElement", undefined);
    try {
      const coordinator = createMeeWavMediaSessionCoordinator();
      const pause = vi.fn();

      expect(() => {
        const lease = coordinator.claim({ source: "scene_tv", id: "server-render", pause });
        lease.pause("system");
        lease.release({ pause: false });
      }).not.toThrow();
      expect(pause).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects an empty playback-instance id", () => {
    const coordinator = createMeeWavMediaSessionCoordinator();
    expect(() => coordinator.claim({
      source: "scene_video",
      id: "   ",
      pause: vi.fn(),
    })).toThrow("Un identifiant de session média est obligatoire.");
  });
});
