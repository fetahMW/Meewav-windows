import { describe, expect, it } from "vitest";
import { videoOverlayInsets } from "./placeVideoOverlay";

describe("reactions anchored to visible video", () => {
  it("excludes the side bars of a portrait feed in a landscape tile", () => {
    expect(videoOverlayInsets({ width: 640, height: 360 }, { width: 1080, height: 1920 }))
      .toEqual({ left: 218.75, right: 218.75, top: 0, bottom: 0 });
  });

  it("excludes the top and bottom bars of a landscape feed in a portrait tile", () => {
    expect(videoOverlayInsets({ width: 360, height: 640 }, { width: 1920, height: 1080 }))
      .toEqual({ left: 0, right: 0, top: 218.75, bottom: 218.75 });
  });

  it("tracks the visible crop after smart framing and clips it to the tile", () => {
    const insets = videoOverlayInsets({ width: 400, height: 200 }, { width: 200, height: 200 }, { zoom: 1.1, translateX: -15, translateY: -10 });
    expect(insets?.left).toBeCloseTo(95);
    expect(insets?.right).toBeCloseTo(85);
    expect(insets?.top).toBe(0);
    expect(insets?.bottom).toBe(0);
  });

  it("fills the frame when the feed matches its aspect ratio", () => {
    expect(videoOverlayInsets({ width: 640, height: 360 }, { width: 1920, height: 1080 }))
      .toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("uses the tile fallback while media metadata or a usable layout is unavailable", () => {
    expect(videoOverlayInsets()).toBeUndefined();
    expect(videoOverlayInsets({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toBeUndefined();
    expect(videoOverlayInsets({ width: 640, height: 360 }, { width: NaN, height: 1080 })).toBeUndefined();
  });
});
