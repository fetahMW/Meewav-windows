import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canCaptureViewerSystemAudio,
  captureViewerSystemAudio,
  isSafeViewerCapture,
} from "./viewerSystemCapture";
function stream(surface = "browser", handle = "", audio = true) {
  const track = {
    label: "Music application",
    getSettings: () => ({ displaySurface: surface }),
    getCaptureHandle: () => ({ handle }),
    stop: vi.fn(),
  };
  const sound = { readyState: "live", stop: vi.fn() };
  return {
    getVideoTracks: () => [track],
    getAudioTracks: () => (audio ? [sound] : []),
    getTracks: () => [track, sound],
  } as unknown as MediaStream;
}
afterEach(() => vi.unstubAllGlobals());
describe("system source capture", () => {
  it("rejects MeeWav, full-system capture and silent video-only selections", () => {
    expect(isSafeViewerCapture(stream())).toBe(true);
    expect(isSafeViewerCapture(stream("monitor"))).toBe(false);
    expect(isSafeViewerCapture(stream("browser", "meewav-room-audio"))).toBe(
      false,
    );
    expect(isSafeViewerCapture(stream("browser", "", false))).toBe(false);
  });
  it("hides unsupported/mobile capture", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Chrome Android Mobile",
      mediaDevices: { getDisplayMedia: vi.fn() },
    });
    expect(canCaptureViewerSystemAudio()).toBe(false);
    vi.stubGlobal("navigator", {
      userAgent: "Firefox",
      mediaDevices: { getDisplayMedia: vi.fn() },
    });
    expect(canCaptureViewerSystemAudio()).toBe(false);
  });
  it("excludes the own tab/system and releases every track of an unsafe selection", async () => {
    const unsafe = stream("monitor"),
      request = vi.fn(async () => unsafe);
    vi.stubGlobal("navigator", {
      userAgent: "Chrome/130",
      mediaDevices: { getDisplayMedia: request },
    });
    await expect(captureViewerSystemAudio()).rejects.toThrow("éviter un écho");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        selfBrowserSurface: "exclude",
        systemAudio: "exclude",
      }),
    );
    unsafe
      .getTracks()
      .forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
  });
});
