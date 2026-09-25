import type {
  PlaceNativePitchProvider,
  PlacePitchProvider,
  PlaceWebPitchProvider,
} from "./place.types";

export function isNativePitchProvider(provider: PlacePitchProvider): provider is PlaceNativePitchProvider {
  return provider === "antares.autotune"
    || provider === "sixthsample.spoton"
    || provider === "auburnsounds.graillon3";
}

export function isWebPitchProvider(provider: PlacePitchProvider): provider is PlaceWebPitchProvider {
  return provider === "opendaw" || provider === "meewav_test";
}

/**
 * A correction engine explicitly selected inside La Place owns the monitoring
 * route. A stale/global desktop-engine connection must never steal the
 * M’écouter action from openDAW or the MeeWav AudioWorklet.
 */
export function resolvePlaceMonitoringRoute(
  provider: PlacePitchProvider,
  nativeEngineMonitoringReady: boolean,
) {
  if (isNativePitchProvider(provider)) return "vst3_local" as const;
  if (isWebPitchProvider(provider)) return "place_web_audio" as const;
  return nativeEngineMonitoringReady ? "desktop_engine" as const : "place_web_audio" as const;
}
