export type LngLatPair = [number, number];
export type LngLatBoundsArray = [number, number, number, number];

export type SelectedZoneId = string;

export const SELECTED_ZONE_AVATAR_PREFLIGHT_EVENT = "meewav:selected-zone-avatar-preflight" as const;

export type SelectedZoneAvatarPreflightDetail = {
  selectedZoneId: SelectedZoneId;
  selectedZoneLabel: string | null;
};

export const ACTIVE_COMMUNE_GROUND_COLOR = "#1B1234" as const;

export const SELECTED_ZONE_NAVIGATION_ROLES = ["active", "neighbor", "normal"] as const;
export type SelectedZoneNavigationRole = typeof SELECTED_ZONE_NAVIGATION_ROLES[number];

export const SELECTED_ZONE_NAVIGATION_SURFACES = ["parent", "subdivision"] as const;
export type SelectedZoneNavigationSurface = typeof SELECTED_ZONE_NAVIGATION_SURFACES[number];

export type CommuneNavigationContextCandidate = {
  readonly id: string;
  readonly center: readonly [longitude: number, latitude: number];
  readonly bbox?: readonly [west: number, south: number, east: number, north: number];
};

export type CommuneNavigationContextSelection = {
  readonly activeId: string;
  readonly activeCenter: readonly [longitude: number, latitude: number];
  readonly activeBounds?: readonly [west: number, south: number, east: number, north: number];
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly candidates: readonly CommuneNavigationContextCandidate[];
  readonly maximumCandidates?: number;
};

const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;
const MAPLIBRE_TILE_SIZE = 512;
const COMMUNE_BOUNDS_ADJACENCY_TOLERANCE_KM = 0.25;
export const MAX_COMMUNE_NAVIGATION_NEIGHBORS = 12;

function getNavigationContextDistanceKm(
  from: readonly [number, number],
  to: readonly [number, number],
) {
  const latitudeRadians = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  const longitudeKm = (to[0] - from[0]) * 111.32 * Math.cos(latitudeRadians);
  const latitudeKm = (to[1] - from[1]) * 110.574;
  return Math.hypot(longitudeKm, latitudeKm);
}

function getNavigationContextBoundsDistanceKm(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
) {
  const longitudeGap = Math.max(0, left[0] - right[2], right[0] - left[2]);
  const latitudeGap = Math.max(0, left[1] - right[3], right[1] - left[3]);
  const latitudeRadians = (
    (left[1] + left[3] + right[1] + right[3]) / 4
  ) * (Math.PI / 180);
  return Math.hypot(
    longitudeGap * 111.32 * Math.cos(latitudeRadians),
    latitudeGap * 110.574,
  );
}

/**
 * Selects only the configured communes that can fit in the destination fly's
 * visible footprint. The radius comes from zoom and viewport width, never
 * from population, area, IRIS count, or a small/large-city classification.
 */
export function selectCommuneNavigationContextCandidates({
  activeId,
  activeCenter,
  activeBounds,
  zoom,
  viewportWidth,
  candidates,
  maximumCandidates = MAX_COMMUNE_NAVIGATION_NEIGHBORS,
}: CommuneNavigationContextSelection) {
  const safeZoom = Number.isFinite(zoom) ? Math.max(0, zoom) : 12;
  const safeViewportWidth = Number.isFinite(viewportWidth)
    ? Math.max(MAPLIBRE_TILE_SIZE, viewportWidth)
    : 1280;
  const latitudeScale = Math.max(0.25, Math.cos(activeCenter[1] * (Math.PI / 180)));
  const viewportWidthKm = (
    EARTH_CIRCUMFERENCE_METERS
    * latitudeScale
    * (safeViewportWidth / MAPLIBRE_TILE_SIZE)
    / (2 ** safeZoom)
  ) / 1000;
  const visibleRadiusKm = Math.max(3, viewportWidthKm * 0.68);
  const longitudeRadius = visibleRadiusKm / (111.32 * latitudeScale);
  const latitudeRadius = visibleRadiusKm / 110.574;
  const visibleBounds = [
    activeCenter[0] - longitudeRadius,
    activeCenter[1] - latitudeRadius,
    activeCenter[0] + longitudeRadius,
    activeCenter[1] + latitudeRadius,
  ] as const;

  return candidates
    .filter((candidate) => candidate.id !== activeId)
    .map((candidate) => {
      const centerDistanceKm = getNavigationContextDistanceKm(activeCenter, candidate.center);
      const touchesActiveBounds = Boolean(
        activeBounds
        && candidate.bbox
        && getNavigationContextBoundsDistanceKm(activeBounds, candidate.bbox)
          <= COMMUNE_BOUNDS_ADJACENCY_TOLERANCE_KM,
      );
      const intersectsVisibleBounds = Boolean(
        candidate.bbox
        && getNavigationContextBoundsDistanceKm(visibleBounds, candidate.bbox)
          <= COMMUNE_BOUNDS_ADJACENCY_TOLERANCE_KM,
      );
      const bboxDistanceKm = candidate.bbox
        ? getNavigationContextBoundsDistanceKm(
          [activeCenter[0], activeCenter[1], activeCenter[0], activeCenter[1]],
          candidate.bbox,
        )
        : centerDistanceKm;
      return {
        ...candidate,
        distanceKm: touchesActiveBounds ? 0 : Math.min(centerDistanceKm, bboxDistanceKm),
        isInNavigationContext: touchesActiveBounds
          || intersectsVisibleBounds
          || centerDistanceKm <= visibleRadiusKm,
      };
    })
    .filter((candidate) => candidate.isInNavigationContext)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, maximumCandidates));
}

export function normalizeSelectedZoneNavigationRole(value: unknown): SelectedZoneNavigationRole {
  return typeof value === "string"
    && (SELECTED_ZONE_NAVIGATION_ROLES as readonly string[]).includes(value)
    ? value as SelectedZoneNavigationRole
    : "normal";
}

export function normalizeSelectedZoneNavigationSurface(
  value: unknown,
  territoryType?: unknown,
): SelectedZoneNavigationSurface {
  if (
    typeof value === "string"
    && (SELECTED_ZONE_NAVIGATION_SURFACES as readonly string[]).includes(value)
  ) {
    return value as SelectedZoneNavigationSurface;
  }
  return territoryType === "commune" ? "parent" : "subdivision";
}

type OfficialIrisFeatureLike = {
  properties?: Record<string, unknown> | null;
};

/**
 * A commune is a true one-plate commune only when its sole official IRIS says
 * so. Feature count alone is deliberately insufficient: one unresolved or
 * product subdivision must never be promoted to a fake commune plate.
 */
export function isOfficialSingleIrisCommune(features: readonly OfficialIrisFeatureLike[]) {
  if (features.length !== 1) return false;

  const properties = features[0]?.properties ?? {};
  const irisType = String(properties.irisType ?? properties.type_iris ?? "").trim().toUpperCase();
  const officialId = String(properties.officialId ?? properties.code_iris ?? "").trim();
  const irisCode = String(properties.irisCode ?? "").trim();

  return irisType === "Z" || officialId.endsWith("0000") || irisCode.endsWith("0000");
}

export type SelectedZoneDefinition = {
  zoneId: SelectedZoneId;
  label: string;
  districtCode: string;
  arrondissementCode: string;
  bbox?: LngLatBoundsArray;
};

export type SelectedZonePolygonProperties = {
  zoneId: SelectedZoneId;
  label: string;
  districtCode: string;
  arrondissementCode: string;
  colorIndex: number;
  groundColor: string;
  isSelectable: boolean;
  hoverCountLabel: string;
  parentZoneId?: string;
  parentCode?: string;
  parentLabel?: string;
  territoryType?: "department" | "commune" | "commune_deleguee" | "quartier" | "iris" | "qpv";
  paletteFamily?: "city" | "metropolitan";
  navigationRole: SelectedZoneNavigationRole;
  navigationSurface: SelectedZoneNavigationSurface;
  officialId?: string;
  communeCode?: string;
  communeName?: string;
  irisCode?: string;
  irisType?: string;
  runtimeMode?: "single_plate";
  contextDimmed?: boolean;
  preserveParentOverviewColor?: boolean;
  navigationTargetCityId?: string;
  source?: string;
  sourceYear?: string;
  labelLng?: number;
  labelLat?: number;
};

export type SelectedZonePolygonFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  SelectedZonePolygonProperties
>;

export type SelectedZoneExtrusionDebugState = {
  selectedZoneId: SelectedZoneId | null;
  selectedZoneLabel: string | null;
  runtimeMode: "single_plate" | null;
  hoveredZoneId: SelectedZoneId | null;
  zoneSourceId: string;
  grandParisParentFocus: string | null;
  avatarsExpected: 0;
  updatedAt: number;
};

export const SELECTED_ZONE_POLYGONS_SOURCE_ID = "selected-zone-polygons";
export const SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID = "selected-zone-polygons-render";
export const SELECTED_ZONE_LABEL_POINTS_SOURCE_ID = "selected-zone-label-points";
export const SELECTED_ZONE_HITBOX_LAYER_ID = "selected-zone-hitbox";
export const SELECTED_ZONE_FILL_LAYER_ID = "selected-zone-fill";
export const SELECTED_ZONE_INTERIOR_LIGHT_LAYER_ID = "selected-zone-interior-light";
export const SELECTED_ZONE_HOVER_GLOW_LAYER_ID = "selected-zone-hover-glow";
export const SELECTED_ZONE_OUTLINE_LAYER_ID = "selected-zone-outline";
export const SELECTED_ZONE_LABEL_LAYER_ID = "selected-zone-labels";

export const SELECTED_ZONE_LABEL_MAX_ZOOM = 15.2;
export const GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM = 17.4;
export const GRAND_PARIS_COMMUNE_CAMERA_MAX_PITCH = 75;

export const EMPTY_ZONE_POLYGONS_COLLECTION: GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  SelectedZonePolygonProperties
> = {
  type: "FeatureCollection",
  features: [],
};

export const EMPTY_ZONE_LABEL_POINTS_COLLECTION: GeoJSON.FeatureCollection<
  GeoJSON.Point,
  SelectedZonePolygonProperties
> = {
  type: "FeatureCollection",
  features: [],
};

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function slugifyParisDistrict(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeParisQuartierZoneId(properties: { c_ar?: unknown; l_qu?: unknown }) {
  const arrondissement = Number(properties.c_ar);
  const quartierName = String(properties.l_qu ?? "quartier");
  const arrondissementPart = Number.isFinite(arrondissement) ? `${String(arrondissement).padStart(2, "0")}e` : "00e";
  return `paris_${arrondissementPart}_${slugifyParisDistrict(quartierName)}`;
}

export function getParisQuartierDisplayName(properties: { l_qu?: unknown }) {
  return String(properties.l_qu ?? "Quartier").replace(/-/g, " ");
}
