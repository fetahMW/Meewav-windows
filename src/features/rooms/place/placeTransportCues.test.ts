import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { placeTransportCues, type CueOrigin } from "./placeTransportCues";
import { placeTwistAudio } from "./placeTwistAudio";
import { waitForPlaceMixerStart } from "./placeMixerStart";
import { placeRoomTime } from "./placeRoomTime";

beforeEach(() => {
  vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
  vi.spyOn(placeTwistAudio, "playFile").mockResolvedValue();
  vi.spyOn(placeTwistAudio, "stop").mockImplementation(() => {});
});
afterEach(() => {
  placeRoomTime.setEnabled(false);
  placeTransportCues.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared intro/outro associations", () => {
  const cases = [false, true].flatMap(chrono => [false, true].flatMap(player =>
    (["chrono", "player", "both"] as CueOrigin[]).map(origin => ({ chrono, player, origin }))));
  it.each(cases)("gates $origin with chrono=$chrono and player=$player", async ({ chrono, player, origin }) => {
    placeTransportCues.setTarget("start", "chrono", chrono);
    placeTransportCues.setTarget("start", "player", player);
    const controller = new AbortController();
    const waiting = waitForPlaceMixerStart(controller.signal, origin);
    const expected = (origin !== "player" && chrono) || (origin !== "chrono" && player);
    expect(placeTwistAudio.play).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(placeTransportCues.getSnapshot().waiting).toBe(expected);
    if (expected) {
      const call = vi.mocked(placeTwistAudio.play).mock.calls[0];
      expect(call[2]).toBeUndefined(); // never release a second before the actual end
      call[1]?.();
      call[1]?.();
    }
    expect(await waiting).toBe(true);
    expect(placeTransportCues.getSnapshot().waiting).toBe(false);
  });

  it.each(cases)("routes one end sound from $origin with chrono=$chrono and player=$player", ({ chrono, player, origin }) => {
    placeTransportCues.setTarget("end", "chrono", chrono);
    placeTransportCues.setTarget("end", "player", player);
    placeTransportCues.end(origin);
    expect(placeTwistAudio.play).toHaveBeenCalledTimes((origin !== "player" && chrono) || (origin !== "chrono" && player) ? 1 : 0);
  });

  it("never starts the track from a cancelled intro or a stale ended callback", async () => {
    placeTransportCues.setTarget("start", "player", true);
    const controller = new AbortController();
    const ready = waitForPlaceMixerStart(controller.signal, "player");
    const ended = vi.mocked(placeTwistAudio.play).mock.calls[0][1];
    controller.abort();
    ended?.();
    expect(await ready).toBe(false);
    expect(placeTransportCues.getSnapshot().playing).toBeNull();
    expect(placeTwistAudio.stop).toHaveBeenCalledOnce();
  });

  it("supersedes a concurrent start without launching both transports", async () => {
    placeTransportCues.setTarget("start", "chrono", true);
    placeTransportCues.setTarget("start", "player", true);
    const first = waitForPlaceMixerStart(new AbortController().signal, "chrono");
    const stale = vi.mocked(placeTwistAudio.play).mock.calls[0][1];
    const second = waitForPlaceMixerStart(new AbortController().signal, "both");
    stale?.();
    expect(await first).toBe(false);
    expect(placeTransportCues.getSnapshot().waiting).toBe(true);
    vi.mocked(placeTwistAudio.play).mock.calls[1][1]?.();
    expect(await second).toBe(true);
  });

  it("fails closed on a late imported-media error and permits retry", async () => {
    placeTransportCues.replace("start", { title: "Mon intro", source: "https://example.test/intro.mp3" });
    placeTransportCues.setTarget("start", "player", true);
    const ready = waitForPlaceMixerStart(new AbortController().signal, "player");
    const [, ended, failed] = vi.mocked(placeTwistAudio.playFile).mock.calls[0];
    failed?.();
    ended?.();
    expect(await ready).toBe(false);
    expect(placeTransportCues.getSnapshot().error).toContain("n’a pas pu être lu");
    placeTransportCues.preview("start");
    expect(placeTransportCues.getSnapshot()).toMatchObject({ waiting: false, playing: "start", error: null });
  });

  it("replacing an intro cancels its pending launch and releases only owned URLs", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: revoke });
    try {
      placeTransportCues.replace("start", { title: "Intro locale", source: "blob:local", local: true });
      placeTransportCues.setTarget("start", "player", true);
      const ready = waitForPlaceMixerStart(new AbortController().signal, "player");
      placeTransportCues.restore("start");
      expect(await ready).toBe(false);
      expect(revoke).toHaveBeenCalledWith("blob:local");
      expect(placeTransportCues.getSnapshot().start.sound.builtin).toBe("countdown");
    } finally { vi.unstubAllGlobals(); }
  });

  it("plays the end cue once on real timer expiry, not on pause or reset", () => {
    vi.useFakeTimers();
    placeTransportCues.setTarget("end", "chrono", true);
    placeRoomTime.configure(0, 1);
    placeRoomTime.setEnabled(true);
    placeRoomTime.start({ skipCountdown: true });
    vi.advanceTimersByTime(400);
    placeRoomTime.pause();
    expect(placeTwistAudio.play).not.toHaveBeenCalled();
    placeRoomTime.start();
    vi.advanceTimersByTime(800);
    expect(placeTwistAudio.play).toHaveBeenCalledTimes(1);
    expect(vi.mocked(placeTwistAudio.play).mock.calls[0][0]).toBe("dj_horn");
    placeRoomTime.reset();
    vi.advanceTimersByTime(2_000);
    expect(placeTwistAudio.play).toHaveBeenCalledTimes(1);
  });
});
