import { describe, expect, it } from "vitest";
import { resolveVoiceCorrectionRouteState } from "./openDawVoiceCorrectionEngine";

describe("resolveVoiceCorrectionRouteState", () => {
  it("reports capture loss instead of a dry fallback when the microphone has ended", () => {
    expect(resolveVoiceCorrectionRouteState({
      runtimeFailed: true,
      inputTrackState: "ended",
      corrected: false,
    })).toEqual({
      status: "error",
      fallbackActive: false,
    });
  });

  it("keeps the dry fallback only while the original microphone track is live", () => {
    expect(resolveVoiceCorrectionRouteState({
      runtimeFailed: true,
      inputTrackState: "live",
      corrected: false,
    })).toEqual({
      status: "fallback",
      fallbackActive: true,
    });
  });
});
