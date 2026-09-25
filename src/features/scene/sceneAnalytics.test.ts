import { describe, expect, it, vi } from "vitest";
import {
  SCENE_ANALYTICS_EVENT_NAME,
  trackSceneAnalytics,
} from "./sceneAnalytics";

describe("trackSceneAnalytics", () => {
  it("publishes one typed MeeWav analytics event", () => {
    const listener = vi.fn();
    window.addEventListener(SCENE_ANALYTICS_EVENT_NAME, listener);

    trackSceneAnalytics({ event: "video_50", mediaId: "video-1" });

    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      event: "video_50",
      mediaId: "video-1",
    });
    window.removeEventListener(SCENE_ANALYTICS_EVENT_NAME, listener);
  });
});
