import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { placeTwistAudio } from "./placeTwistAudio";

class TestAudio {
  currentTime = 0;
  duration = 27;
  paused = true;
  preload = "";
  volume = 0;
  ontimeupdate: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) { created.push(this); }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}
const created: TestAudio[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  created.length = 0;
  vi.stubGlobal("Audio", TestAudio);
});
afterEach(() => {
  placeTwistAudio.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("countdown media cue", () => {
  it("releases exactly at duration minus one second, once, using the media clock", async () => {
    const release = vi.fn();
    const ended = vi.fn();
    await placeTwistAudio.play("countdown", ended, release);
    const audio = created[0];
    vi.advanceTimersByTime(60_000); // buffering does not advance the media clock
    expect(release).not.toHaveBeenCalled();
    audio.currentTime = 25.99;
    audio.ontimeupdate?.();
    expect(release).not.toHaveBeenCalled();
    audio.currentTime = 26;
    vi.advanceTimersByTime(25);
    expect(release).toHaveBeenCalledTimes(1);
    audio.ontimeupdate?.();
    audio.currentTime = 27;
    audio.onended?.();
    expect(release).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits through a pause and releases after resume", async () => {
    const release = vi.fn();
    await placeTwistAudio.play("countdown", undefined, release);
    const audio = created[0];
    await placeTwistAudio.pause();
    audio.currentTime = 26;
    vi.advanceTimersByTime(20_000);
    expect(release).not.toHaveBeenCalled();
    await placeTwistAudio.resume();
    vi.advanceTimersByTime(25);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown metadata until the actual duration is available", async () => {
    const release = vi.fn();
    await placeTwistAudio.play("countdown", undefined, release);
    const audio = created[0];
    audio.duration = NaN;
    audio.currentTime = 9;
    vi.advanceTimersByTime(100);
    expect(release).not.toHaveBeenCalled();
    audio.duration = 10;
    vi.advanceTimersByTime(25);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(["stop", "replace", "error"])("invalidates the old cue on %s", async (action) => {
    const release = vi.fn();
    const failed = vi.fn();
    await placeTwistAudio.play("countdown", undefined, release, failed);
    const audio = created[0];
    const staleUpdate = audio.ontimeupdate;
    const staleEnd = audio.onended;
    if (action === "stop") placeTwistAudio.stop();
    if (action === "replace") await placeTwistAudio.play("heartbeat");
    if (action === "error") audio.onerror?.();
    audio.currentTime = 26;
    audio.paused = false;
    staleUpdate?.();
    staleEnd?.();
    vi.advanceTimersByTime(60_000);
    expect(release).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(failed).toHaveBeenCalledTimes(action === "error" ? 1 : 0);
  });
});
