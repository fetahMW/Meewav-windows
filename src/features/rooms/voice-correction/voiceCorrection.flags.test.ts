import { describe, expect, it } from "vitest";
import {
  isOpenDawVoiceCorrectionEnabled,
  isVoiceCorrectionLabEnabled,
  isVoiceCorrectionRoomEntryEnabled,
  OPENDAW_VOICE_CORRECTION_FLAG,
  resolveOpenDawVoiceCorrectionFlag,
} from "./voiceCorrection.flags";

describe("openDAW voice correction feature flag", () => {
  it("is disabled when the flag is absent", () => {
    expect(resolveOpenDawVoiceCorrectionFlag({})).toBe(false);
  });

  it("is enabled only by explicit true", () => {
    expect(resolveOpenDawVoiceCorrectionFlag({ [OPENDAW_VOICE_CORRECTION_FLAG]: "true" })).toBe(true);
    expect(resolveOpenDawVoiceCorrectionFlag({ [OPENDAW_VOICE_CORRECTION_FLAG]: true })).toBe(true);
    expect(resolveOpenDawVoiceCorrectionFlag({ [OPENDAW_VOICE_CORRECTION_FLAG]: "false" })).toBe(false);
    expect(resolveOpenDawVoiceCorrectionFlag({ [OPENDAW_VOICE_CORRECTION_FLAG]: "1" })).toBe(false);
  });

  it("uses the exact same gate for the lab and Room entry", () => {
    expect(isVoiceCorrectionLabEnabled).toBe(isOpenDawVoiceCorrectionEnabled);
    expect(isVoiceCorrectionRoomEntryEnabled).toBe(isOpenDawVoiceCorrectionEnabled);
  });
});
