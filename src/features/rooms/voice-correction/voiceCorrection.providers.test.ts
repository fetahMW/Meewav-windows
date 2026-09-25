import { describe, expect, it } from "vitest";
import {
  NATIVE_VST3_VOICE_CORRECTION_PROVIDERS,
  VOICE_CORRECTION_PROVIDERS,
  nativeVst3VoiceCorrectionProvider,
  voiceCorrectionProvider,
} from "./voiceCorrection.providers";

describe("voice correction providers", () => {
  it("exposes exactly the two engines that are really wired", () => {
    expect(VOICE_CORRECTION_PROVIDERS.map((provider) => provider.id)).toEqual(["opendaw", "meewav_test"]);
    expect(voiceCorrectionProvider("opendaw").label).toBe("Autotune openDAW");
    expect(voiceCorrectionProvider("meewav_test").label).toBe("Autotune MeeWav test");
  });

  it("lists the three verified native VST3 separately from Web engines", () => {
    expect(NATIVE_VST3_VOICE_CORRECTION_PROVIDERS.map((provider) => provider.id)).toEqual([
      "antares.autotune",
      "sixthsample.spoton",
      "auburnsounds.graillon3",
    ]);
    expect(nativeVst3VoiceCorrectionProvider("antares.autotune").version).toBe("11.0.0");
    expect(nativeVst3VoiceCorrectionProvider("sixthsample.spoton").version).toBe("1.1.2");
    expect(nativeVst3VoiceCorrectionProvider("auburnsounds.graillon3").version).toBe("3.2.0");
  });
});
