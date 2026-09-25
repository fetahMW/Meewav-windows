export const MON_GLOBE_NAME = "Mon Globe";
export const MON_GLOBE_ROUTE = "/globe";

export type MonGlobeInitialDestination = "startup" | "host-position";

export const MON_GLOBE_HOST_POSITION_NAVIGATION_STATE = Object.freeze({
  monGlobeDestination: "host-position" as const,
});

export function getMonGlobeInitialDestination(
  navigationState: unknown,
): MonGlobeInitialDestination {
  if (
    navigationState
    && typeof navigationState === "object"
    && "monGlobeDestination" in navigationState
    && navigationState.monGlobeDestination === "host-position"
  ) {
    return "host-position";
  }

  return "startup";
}

export const MON_GLOBE_ALIASES = [
  "/mon-globe",
  "/monglobe",
  "/mon_globe",
  "/my-globe",
] as const;

export const DEPRECATED_MAP_ROUTES = [
  "/task-globe",
  "/taskglobe",
  "/cartoon-globe-test",
  "/globe-ios",
  "/globe-v2",
  "/globe-standard",
  "/globe-engine-test",
  "/globe-geojson-test",
  "/globe-mvt-test",
  "/globe-overlay-test",
  "/globe-legacy-fluid",
  "/globe-legacy",
] as const;
