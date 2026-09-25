export type FranceRegionNavigationView = "position" | "city" | "country" | "globe";

export type AutomaticFranceRegionCityHubPolicyInput = {
  focusedRegionId: string | null;
  minZoom: number;
  nationwideCommuneMinZoom: number;
  view: FranceRegionNavigationView;
  zoom: number;
};

/**
 * The regional navigation overlay is a camera tier, not a country-button side
 * effect. A user who reaches the same altitude over the same region must see
 * the same city hubs after a region click, a wheel zoom or a city fly.
 */
export function shouldResolveAutomaticFranceRegionCityHubs({
  focusedRegionId,
  minZoom,
  nationwideCommuneMinZoom,
  view,
  zoom,
}: AutomaticFranceRegionCityHubPolicyInput) {
  return !focusedRegionId
    && view !== "globe"
    && zoom + 0.05 >= minZoom
    && zoom < nationwideCommuneMinZoom;
}

export type FranceRegionReturnPolicyInput = {
  isParisMetroCityCamera: boolean;
  regionalHandoffZoom: number;
  view: FranceRegionNavigationView;
  zoom: number;
};

/** Return a local city/position scene to its regional navigation tier in place. */
export function shouldReturnLocalViewToFranceRegion({
  isParisMetroCityCamera: _isParisMetroCityCamera,
  regionalHandoffZoom,
  view,
  zoom,
}: FranceRegionReturnPolicyInput) {
  return (view === "city" || view === "position")
    && zoom < regionalHandoffZoom;
}

export type FranceRegionFocusReleasePolicyInput = {
  focusedRegionId: string | null;
  regionalTierMinZoom: number;
  view: FranceRegionNavigationView;
  zoom: number;
};

/**
 * Below the regional navigation tier, country view represents France as a
 * whole. Keeping one region selected there would dim the rest of the country
 * even though its hubs and interaction tier are no longer present.
 */
export function shouldReleaseFranceRegionFocus({
  focusedRegionId,
  regionalTierMinZoom,
  view,
  zoom,
}: FranceRegionFocusReleasePolicyInput) {
  return view === "country"
    && Boolean(focusedRegionId)
    && zoom + 0.05 < regionalTierMinZoom;
}
