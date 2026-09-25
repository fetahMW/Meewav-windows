import { describe, expect, it, vi } from "vitest";
import {
  buildVoiceCorrectionMicrophoneConstraints,
  formatLatency,
  linearAmplitudeToDb,
  meterPercentFromDb,
  selectRecordingMimeType,
} from "./voiceCorrectionLab.utils";

describe("voice correction lab helpers", () => {
  it("requests a mono music capture without browser voice processing", () => {
    expect(buildVoiceCorrectionMicrophoneConstraints("mic-42", "music")).toEqual({
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48_000 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        deviceId: { exact: "mic-42" },
      },
      video: false,
    });
  });

  it("can explicitly re-enable browser processing for diagnostics", () => {
    const constraints = buildVoiceCorrectionMicrophoneConstraints(null, "browser-assisted");
    expect(constraints.audio).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(constraints.audio).not.toHaveProperty("deviceId");
  });

  it("normalizes real analyser amplitudes into the meter range", () => {
    expect(linearAmplitudeToDb(1)).toBe(0);
    expect(linearAmplitudeToDb(0)).toBe(-72);
    expect(meterPercentFromDb(-72)).toBe(0);
    expect(meterPercentFromDb(0)).toBe(100);
  });

  it("does not fabricate an unavailable latency", () => {
    expect(formatLatency(null)).toBe("Non mesurée");
    expect(formatLatency(4.25)).toBe("4.3 ms");
    expect(formatLatency(24.8)).toBe("25 ms");
  });

  it("selects only a MIME type supported by the current browser", () => {
    const original = globalThis.MediaRecorder;
    const isTypeSupported = vi.fn((value: string) => value === "audio/webm");
    vi.stubGlobal("MediaRecorder", { isTypeSupported });
    expect(selectRecordingMimeType()).toBe("audio/webm");
    vi.stubGlobal("MediaRecorder", original);
  });
});
