export type CityOverviewTransportPolicyInput = {
  altitudeMeters: number;
  hideMinAltitudeMeters: number;
  forceHidden: boolean;
  selectedZoneId: unknown;
  selectedZoneRuntimeMode: unknown;
};

export type CityOverviewTransportPolicy = {
  hideTransport: boolean;
  hideRoads: boolean;
  selectedSinglePlateActive: boolean;
};

/**
 * Transport visibility is a discrete presentation state. Re-evaluating it on
 * every `move` frame competes with MapLibre's render loop, while toggling road
 * details at `movestart` makes scripted flies visibly pop. Static style zoom
 * ranges own road LOD; runtime visibility only settles after camera changes.
 */
export const CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS = [
  "moveend",
  "zoomend",
  "pitchend",
] as const;

/**
 * Keeps the overview deliberately sparse while guaranteeing that an active
 * single-plate commune exposes its real road network. The local navigation
 * state must win over a stale overview flag left by a previous department fly.
 */
export function resolveCityOverviewTransportPolicy({
  altitudeMeters,
  hideMinAltitudeMeters,
  forceHidden,
  selectedZoneId,
  selectedZoneRuntimeMode,
}: CityOverviewTransportPolicyInput): CityOverviewTransportPolicy {
  const selectedSinglePlateActive = typeof selectedZoneId === "string"
    && selectedZoneId.length > 0
    && selectedZoneRuntimeMode === "single_plate";
  const hideTransport = forceHidden || altitudeMeters > hideMinAltitudeMeters;
  const hideRoads = selectedSinglePlateActive ? false : hideTransport;

  return {
    hideTransport,
    // A single-plate selection is already a local scene. Roads are part of
    // that scene even when its rural bbox produces a high camera altitude.
    hideRoads,
    selectedSinglePlateActive,
  };
}
