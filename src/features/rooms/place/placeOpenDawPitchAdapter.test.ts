import { describe, expect, it } from "vitest";
import {
  isPlaceOpenDawProcessedRouteAvailable,
  placeSettingsToOpenDaw,
} from "./placeOpenDawPitchAdapter";

describe("placeSettingsToOpenDaw", () => {
  it("maps MeeWav labels and live controls to the exact openDAW indices", () => {
    expect(placeSettingsToOpenDaw({
      tuneEnabled: true,
      tuneKey: "F#",
      tuneScale: "Mineure",
      tuneAmount: 0.82,
      tuneSpeed: 0.71,
      tuneHumanize: 0.4,
      tuneSmooth: 0.36,
      tuneShift: -2,
    })).toEqual({
      enabled: true,
      key: 6,
      scale: 2,
      amount: 0.82,
      retune: 0.71,
      smooth: 0.4,
      shift: -2,
    });
  });

  it("falls back to C chromatique for an unknown stored key", () => {
    expect(placeSettingsToOpenDaw({
      tuneEnabled: false,
      tuneKey: "invalid",
      tuneScale: "Chromatique",
      tuneAmount: 1,
      tuneSpeed: 0.5,
      tuneHumanize: 0.6,
      tuneSmooth: 0.6,
      tuneShift: 0,
    })).toMatchObject({ enabled: false, key: 0, scale: 0 });
  });

  it("allows the corrected branch only while the worklet output is live and healthy", () => {
    const healthy = {
      engineReady: true,
      workletReady: true,
      status: "processing" as const,
      outputTrackState: "live" as const,
      fallbackActive: false,
    };
    expect(isPlaceOpenDawProcessedRouteAvailable(healthy)).toBe(true);
    expect(isPlaceOpenDawProcessedRouteAvailable({ ...healthy, outputTrackState: "ended" })).toBe(false);
    expect(isPlaceOpenDawProcessedRouteAvailable({ ...healthy, status: "error" })).toBe(false);
    expect(isPlaceOpenDawProcessedRouteAvailable({ ...healthy, fallbackActive: true })).toBe(false);
  });
});
