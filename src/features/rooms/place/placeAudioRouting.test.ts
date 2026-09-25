import { describe, expect, it } from "vitest";
import { resolvePlaceMonitoringRoute } from "./placeAudioRouting";

describe("La Place audio monitoring route", () => {
  it.each(["opendaw", "meewav_test"] as const)(
    "keeps %s on the Place Web Audio graph even if the desktop engine is connected",
    (provider) => {
      expect(resolvePlaceMonitoringRoute(provider, true)).toBe("place_web_audio");
    },
  );

  it.each(["antares.autotune", "sixthsample.spoton", "auburnsounds.graillon3"] as const)(
    "keeps %s on its exclusive local VST3 monitor",
    (provider) => {
      expect(resolvePlaceMonitoringRoute(provider, true)).toBe("vst3_local");
      expect(resolvePlaceMonitoringRoute(provider, false)).toBe("vst3_local");
    },
  );

  it("uses the desktop engine only when no Place pitch provider was selected", () => {
    expect(resolvePlaceMonitoringRoute("none", true)).toBe("desktop_engine");
    expect(resolvePlaceMonitoringRoute("none", false)).toBe("place_web_audio");
  });
});
