import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import turfUnion from "@turf/union";
import { featureCollection as turfFeatureCollection, point as turfPoint } from "@turf/helpers";
import {
  getCrepusculeGroundColor,
  getGrandParisCrepusculeGroundColor,
} from "../maplibre/crepusculeUrbainPalette";
import {
  ensureSelectedZoneExtrusionLayers,
  setSelectedZonePresentation,
} from "./selectedZoneExtrusionLayers";
import { GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID } from "../maplibre/meewavMapLibreStyle";
import { selectStablePointLabelIds } from "../maplibre/stableGeographicLabelPolicy";
import {
  createHoverLabelIconCountsElement,
  updateHoverLabelIconCountsElement,
  type HoverLabelIconCounts,
} from "../maplibre/hoverLabelIconCounts";
import {
  ACTIVE_COMMUNE_GROUND_COLOR,
  EMPTY_ZONE_LABEL_POINTS_COLLECTION,
  EMPTY_ZONE_POLYGONS_COLLECTION,
  GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM,
  SELECTED_ZONE_AVATAR_PREFLIGHT_EVENT,
  SELECTED_ZONE_HITBOX_LAYER_ID,
  SELECTED_ZONE_LABEL_POINTS_SOURCE_ID,
  SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
  SELECTED_ZONE_POLYGONS_SOURCE_ID,
  getParisQuartierDisplayName,
  isOfficialSingleIrisCommune,
  normalizeSelectedZoneNavigationRole,
  normalizeSelectedZoneNavigationSurface,
  normalizeParisQuartierZoneId,
  selectCommuneNavigationContextCandidates,
  slugifyParisDistrict,
  type LngLatBoundsArray,
  type SelectedZoneAvatarPreflightDetail,
  type SelectedZoneExtrusionDebugState,
  type SelectedZoneId,
  type SelectedZonePolygonFeature,
  type SelectedZonePolygonProperties,
} from "./selectedZoneExtrusionTypes";
import {
  MAPLIBRE_ABSOLUTE_MAX_PITCH,
  MAPLIBRE_STANDARD_MAX_PITCH,
} from "../../../map/renderModeManager";
import { AVATAR_VISIBLE_MIN_ZOOM } from "../../../map/avatarLayers";
import {
  BEATMAKER_PRESET,
  getMandatoryAvatarRoleKeys,
  getMaxVisibleCategories,
} from "../filters/avatarVisibilityPresets";
import {
  CITY_SUBDIVISION_CONFIGS,
  getCitySubdivisionConfig,
  getCitySubdivisionConfigForZoneId,
  getMetropolitanCityConfigForCommuneZoneId,
  getMetropolitanCityConfigForSubzoneZoneId,
  getOwningCitySubdivisionConfigForZoneId,
  getStandaloneCitySubdivisionIdForCommuneCode,
  type CitySubdivisionId,
} from "./citySubdivisionConfig";
import { CITY_CAMERA_PRESETS } from "../mapMechanics/flyMechanicsReference";
import { FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID } from "../geography/franceGuideAlphaCities.generated";
import { getRuntimeApiBaseUrl } from "../../../lib/runtimeApiUrl";

const PARIS_QUARTIERS_URL = CITY_SUBDIVISION_CONFIGS.paris.sourceUrl;
const SAINT_DENIS_SUBZONES_URL = "/map/saint-denis-subzones.geojson";
const GRAND_PARIS_SUBZONES_URL = "/map/grand-paris-subzones.geojson";
const GRAND_PARIS_COMMUNES_URL = "/map/grand-paris-communes-overview.geojson";
const AVATAR_API_BASE_URL = getRuntimeApiBaseUrl(import.meta.env.VITE_AVATAR_API_BASE_URL);
const SEINE_SAINT_DENIS_DEPARTMENT_CODE = "93";
const SEINE_SAINT_DENIS_DEPARTMENT_ZONE_ID = "grand_paris_department_93";
const GRAND_PARIS_DEPARTMENT_CODES = new Set(["92", "93", "94", "95"]);
const DEFAULT_SELECTED_ZONE_ID = "paris_18e_goutte_d_or";
const SELECTED_ZONE_HOVER_MIN_ZOOM = 8.2;
const SELECTED_ZONE_CURSOR_LOCK_ATTRIBUTE = "data-meewav-selected-zone-cursor-lock";
const SELECTED_ZONE_LANDING_ZOOM = 15.49;
const SELECTED_ZONE_FORWARD_FLY_MIN_DELTA = 0.75;
const SELECTED_ZONE_LANDING_PITCH = 50;
const SELECTABLE_ZONE_OVERVIEW_PITCH = 42;
const SELECTED_ZONE_DESKTOP_COVER_MIN_ZOOM = 12.5;
const SELECTED_ZONE_DESKTOP_COVER_MAX_ZOOM = 18.2;
const SELECTED_ZONE_DESKTOP_COVER_OVERFLOW_RATIO = 0.45;
const SELECTED_ZONE_DESKTOP_COVER_PADDING_PX = 32;
const GRAND_PARIS_PARENT_OVERVIEW_RETURN_MIN_ZOOM = 12.05;
const GRAND_PARIS_FOCUSED_SUBZONE_COLOR_INDEXES = [2, 6, 1, 5, 3, 0, 4, 7, 9, 11, 8, 10] as const;
// A focused commune must always land beyond the overview-return threshold.
// Otherwise the first moveend restores the solid commune plate and a second
// click is needed before its quartiers remain visible.
const GRAND_PARIS_FOCUSED_COMMUNE_MIN_ZOOM = GRAND_PARIS_PARENT_OVERVIEW_RETURN_MIN_ZOOM + 0.15;
const GRAND_PARIS_FOCUSED_COMMUNE_MAX_ZOOM = 14.75;
const COMMUNE_NAVIGATION_CONTEXT_CONCURRENCY = 4;
const SELECTED_ZONE_DRAG_SUPPRESS_PIXELS = 4;
const SELECTED_ZONE_DRAG_SUPPRESS_CLICK_MS = 220;
const SELECTED_ZONE_STATE_SOURCE_IDS = [
  SELECTED_ZONE_POLYGONS_SOURCE_ID,
  SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
  SELECTED_ZONE_LABEL_POINTS_SOURCE_ID,
] as const;

function clampToMapLibreStandardPitch(pitch: number) {
  if (!Number.isFinite(pitch)) return MAPLIBRE_STANDARD_MAX_PITCH;
  return Math.max(0, Math.min(MAPLIBRE_ABSOLUTE_MAX_PITCH, pitch));
}

const GRAND_PARIS_PARENT_OVERVIEW_VISUAL_LAYER_IDS = [
  "grand-paris-commune-fill",
  "grand-paris-commune-outline",
  "grand-paris-commune-hover-line",
  "grand-paris-commune-labels",
  "grand-paris-secondary-commune-labels",
] as const;
const GRAND_PARIS_PARENT_ACTIVE_OUTLINE_LAYER_IDS = [
  "grand-paris-active-outline-halo",
  "grand-paris-active-outline-line",
] as const;
const GRAND_PARIS_PARENT_OVERVIEW_HITBOX_LAYER_ID = "grand-paris-commune-hitbox";
let activeController: SelectedZoneExtrusionController | null = null;

function getNowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isMapUserNavigationActive() {
  if (typeof window === "undefined") return false;
  return (window as any).__MEEWAV_NAVIGATION_DEBUG__?.isUserNavigating3D === true;
}

function setGrandParisDepartmentFocus(focus: string | null) {
  if (typeof window === "undefined") return;
  if (focus) {
    (window as any).__MEEWAV_GRAND_PARIS_DEPARTMENT_FOCUS__ = focus;
    (window as any).__MEEWAV_FORCE_HIDE_OVERVIEW_TRANSPORT__ = true;
  } else {
    delete (window as any).__MEEWAV_GRAND_PARIS_DEPARTMENT_FOCUS__;
    delete (window as any).__MEEWAV_FORCE_HIDE_OVERVIEW_TRANSPORT__;
  }
}

function getGrandParisDepartmentFocus() {
  if (typeof window === "undefined") return null;
  const focus = (window as any).__MEEWAV_GRAND_PARIS_DEPARTMENT_FOCUS__;
  return typeof focus === "string" && focus ? focus : null;
}

function setGrandParisParentFocus(parentCode: string | null) {
  if (typeof window === "undefined") return;
  if (parentCode) {
    (window as any).__MEEWAV_GRAND_PARIS_PARENT_FOCUS__ = parentCode;
    delete (window as any).__MEEWAV_FORCE_HIDE_OVERVIEW_TRANSPORT__;
  } else {
    delete (window as any).__MEEWAV_GRAND_PARIS_PARENT_FOCUS__;
    delete (window as any).__MEEWAV_FORCE_HIDE_OVERVIEW_TRANSPORT__;
  }
}

function clearGrandParisFocus() {
  setGrandParisDepartmentFocus(null);
  setGrandParisParentFocus(null);
}

function setGrandParisParentOverviewLayersVisible(map: MapLibreMap, visible: boolean) {
  for (const layerId of GRAND_PARIS_PARENT_OVERVIEW_VISUAL_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;

    try {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    } catch {
      // The next controller pass retries after style transitions.
    }
  }

  if (map.getLayer(GRAND_PARIS_PARENT_OVERVIEW_HITBOX_LAYER_ID)) {
    try {
      // The overview hitbox owns the crown only while its commune plates are
      // visible. Once a department opens, the selected-zone hitbox takes over.
      map.setLayoutProperty(GRAND_PARIS_PARENT_OVERVIEW_HITBOX_LAYER_ID, "visibility", visible ? "visible" : "none");
    } catch {
      // The next controller pass retries after style transitions.
    }
  }

  for (const layerId of GRAND_PARIS_PARENT_ACTIVE_OUTLINE_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;

    try {
      map.setLayoutProperty(layerId, "visibility", "visible");
    } catch {
      // Active commune outline is data-driven; visibility is retried next pass.
    }
  }
}

function getGrandParisParentFocus() {
  if (typeof window === "undefined") return null;
  const focus = (window as any).__MEEWAV_GRAND_PARIS_PARENT_FOCUS__;
  return typeof focus === "string" && focus ? focus : null;
}

function cloneGeometry<T extends GeoJSON.Geometry>(geometry: T): T {
  return JSON.parse(JSON.stringify(geometry)) as T;
}

function collectLngLatPairs(coordinates: unknown, result: Array<[number, number]> = []) {
  if (!Array.isArray(coordinates)) return result;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    result.push([coordinates[0], coordinates[1]]);
    return result;
  }

  for (const child of coordinates) {
    collectLngLatPairs(child, result);
  }
  return result;
}

function getGeometryBbox(geometry: GeoJSON.Geometry): LngLatBoundsArray {
  const coordinates = collectLngLatPairs((geometry as { coordinates?: unknown }).coordinates);
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const coordinate of coordinates) {
    west = Math.min(west, coordinate[0]);
    south = Math.min(south, coordinate[1]);
    east = Math.max(east, coordinate[0]);
    north = Math.max(north, coordinate[1]);
  }
  return [west, south, east, north];
}

function getBboxCenter(bbox: LngLatBoundsArray): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function isPointInsidePolygonGeometry(
  coordinate: [number, number],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
) {
  try {
    return booleanPointInPolygon(turfPoint(coordinate), geometry);
  } catch {
    return false;
  }
}

function getGeometryInteriorCenter(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number] {
  const bbox = getGeometryBbox(geometry);
  const bboxCenter = getBboxCenter(bbox);
  if (isPointInsidePolygonGeometry(bboxCenter, geometry)) return bboxCenter;

  const outerRings = geometry.type === "Polygon"
    ? [geometry.coordinates[0]]
    : geometry.coordinates.map((polygon) => polygon[0]);
  for (const ring of outerRings) {
    const coordinates = ring.filter((coordinate) => (
      Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
    ));
    if (!coordinates.length) continue;
    const candidate: [number, number] = [
      coordinates.reduce((sum, coordinate) => sum + coordinate[0], 0) / coordinates.length,
      coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length,
    ];
    if (isPointInsidePolygonGeometry(candidate, geometry)) return candidate;
  }

  const resolution = 24;
  let bestCandidate: [number, number] | null = null;
  let bestDistance = Infinity;
  for (let yIndex = 0; yIndex < resolution; yIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const candidate: [number, number] = [
        bbox[0] + ((xIndex + 0.5) / resolution) * (bbox[2] - bbox[0]),
        bbox[1] + ((yIndex + 0.5) / resolution) * (bbox[3] - bbox[1]),
      ];
      if (!isPointInsidePolygonGeometry(candidate, geometry)) continue;
      const distance = ((candidate[0] - bboxCenter[0]) ** 2) + ((candidate[1] - bboxCenter[1]) ** 2);
      if (distance < bestDistance) {
        bestCandidate = candidate;
        bestDistance = distance;
      }
    }
  }

  const firstCoordinate = outerRings[0]?.[0];
  return bestCandidate ?? (firstCoordinate ? [firstCoordinate[0], firstCoordinate[1]] : bboxCenter);
}

function getFiniteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getParisQuartierLabelLngLat(properties: Record<string, unknown>): [number, number] | null {
  const directLng = getFiniteNumber(properties.labelLng);
  const directLat = getFiniteNumber(properties.labelLat);
  if (directLng !== undefined && directLat !== undefined) return [directLng, directLat];

  const geomXY = properties.geom_x_y;
  if (!geomXY || typeof geomXY !== "object") return null;

  const lng = getFiniteNumber((geomXY as { lon?: unknown; lng?: unknown }).lon ?? (geomXY as { lng?: unknown }).lng);
  const lat = getFiniteNumber((geomXY as { lat?: unknown }).lat);
  return lng !== undefined && lat !== undefined ? [lng, lat] : null;
}

function getSelectedZoneLabelLngLat(feature: GeoJSON.Feature): [number, number] | null {
  const properties = feature.properties ?? {};
  const explicitPoint = getParisQuartierLabelLngLat(properties);
  if (explicitPoint) return explicitPoint;
  if (!feature.geometry) return null;

  if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
    return getGeometryInteriorCenter(feature.geometry);
  }

  const bbox = getGeometryBbox(feature.geometry);
  if (!bbox.every(Number.isFinite)) return null;
  return getBboxCenter(bbox);
}

function createSelectedZoneLabelPointCollection(
  collection: GeoJSON.FeatureCollection,
  zoom = 12.2,
): GeoJSON.FeatureCollection<GeoJSON.Point, SelectedZonePolygonProperties> {
  const seenZoneIds = new Set<string>();
  const features: Array<GeoJSON.Feature<GeoJSON.Point, SelectedZonePolygonProperties>> = [];

  for (const feature of collection.features) {
    const properties = feature.properties as SelectedZonePolygonProperties | undefined;
    if (!properties?.zoneId || seenZoneIds.has(properties.zoneId)) continue;

    const coordinates = getSelectedZoneLabelLngLat(feature);
    if (!coordinates) continue;

    seenZoneIds.add(properties.zoneId);
    features.push({
      type: "Feature",
      id: properties.zoneId,
      properties: { ...properties },
      geometry: {
        type: "Point",
        coordinates,
      },
    });
  }

  // Keep the official zone polygons fully interactive, but submit only a
  // deterministic, geographically spaced subset to the symbol layer. The
  // chosen IDs depend on zoom and source data, never bearing or pitch.
  const selectedLabelIds = selectStablePointLabelIds(features, zoom, 100);
  return {
    type: "FeatureCollection",
    features: features.filter((feature) => selectedLabelIds.has(String(feature.id ?? ""))),
  };
}

const METERS_PER_DEGREE_LAT = 111_320;
const ROUNDED_ZONE_MIN_RADIUS_METERS = 18;
const ROUNDED_ZONE_MAX_RADIUS_METERS = 72;
const ROUNDED_ZONE_STEPS = 5;

type XYPoint = {
  x: number;
  y: number;
};

function getMetersPerDegreeLng(latitude: number) {
  return METERS_PER_DEGREE_LAT * Math.max(0.18, Math.cos((latitude * Math.PI) / 180));
}

function getRingAverageLatitude(ring: GeoJSON.Position[]) {
  if (!ring.length) return 0;
  return ring.reduce((total, point) => total + Number(point[1] ?? 0), 0) / ring.length;
}

function getDistance(a: XYPoint, b: XYPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getUnitVector(from: XYPoint, to: XYPoint): XYPoint | null {
  const distance = getDistance(from, to);
  if (distance < 0.5) return null;

  return {
    x: (to.x - from.x) / distance,
    y: (to.y - from.y) / distance,
  };
}

function getBezierPoint(start: XYPoint, control: XYPoint, end: XYPoint, t: number): XYPoint {
  const inverse = 1 - t;

  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function isSameLngLat(a: GeoJSON.Position | undefined, b: GeoJSON.Position | undefined) {
  if (!a || !b) return false;
  return Math.abs(Number(a[0]) - Number(b[0])) < 0.0000001 && Math.abs(Number(a[1]) - Number(b[1])) < 0.0000001;
}

function getRoundedCornerRadiusMeters(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const [minLng, minLat, maxLng, maxLat] = getGeometryBbox(geometry);
  const centerLat = (minLat + maxLat) / 2;
  const widthMeters = Math.abs(maxLng - minLng) * getMetersPerDegreeLng(centerLat);
  const heightMeters = Math.abs(maxLat - minLat) * METERS_PER_DEGREE_LAT;
  const scaledRadius = Math.min(widthMeters, heightMeters) * 0.08;

  return Math.max(ROUNDED_ZONE_MIN_RADIUS_METERS, Math.min(ROUNDED_ZONE_MAX_RADIUS_METERS, scaledRadius));
}

function roundRingCorners(ring: GeoJSON.Position[], radiusMeters: number): GeoJSON.Position[] {
  const rawRing = isSameLngLat(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : [...ring];
  if (rawRing.length < 4) return ring;

  const averageLat = getRingAverageLatitude(rawRing);
  const metersPerDegreeLng = getMetersPerDegreeLng(averageLat);
  const toXY = (position: GeoJSON.Position): XYPoint => ({
    x: Number(position[0]) * metersPerDegreeLng,
    y: Number(position[1]) * METERS_PER_DEGREE_LAT,
  });
  const toLngLat = (point: XYPoint): GeoJSON.Position => [
    point.x / metersPerDegreeLng,
    point.y / METERS_PER_DEGREE_LAT,
  ];
  const points = rawRing.map(toXY);
  const rounded: XYPoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const previousVector = getUnitVector(current, previous);
    const nextVector = getUnitVector(current, next);

    if (!previousVector || !nextVector) {
      rounded.push(current);
      continue;
    }

    const previousLength = getDistance(current, previous);
    const nextLength = getDistance(current, next);
    const cutDistance = Math.min(radiusMeters, previousLength * 0.38, nextLength * 0.38);

    if (cutDistance < 1.5) {
      rounded.push(current);
      continue;
    }

    const start = {
      x: current.x + previousVector.x * cutDistance,
      y: current.y + previousVector.y * cutDistance,
    };
    const end = {
      x: current.x + nextVector.x * cutDistance,
      y: current.y + nextVector.y * cutDistance,
    };

    rounded.push(start);
    for (let step = 1; step <= ROUNDED_ZONE_STEPS; step += 1) {
      rounded.push(getBezierPoint(start, current, end, step / (ROUNDED_ZONE_STEPS + 1)));
    }
    rounded.push(end);
  }

  if (rounded.length < 4) return ring;

  const roundedRing = rounded.map(toLngLat);
  roundedRing.push(roundedRing[0]);
  return roundedRing;
}

function roundPolygonCorners(polygon: GeoJSON.Position[][], radiusMeters: number): GeoJSON.Position[][] {
  return polygon.map((ring) => roundRingCorners(ring, radiusMeters));
}

function roundGeometryCorners(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const radiusMeters = getRoundedCornerRadiusMeters(geometry);

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: roundPolygonCorners(geometry.coordinates, radiusMeters),
    };
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map((polygon) => roundPolygonCorners(polygon, radiusMeters)),
  };
}

function createRoundedSelectedZoneCollection(collection: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") return feature;
      const zoneId = typeof feature.properties?.zoneId === "string" ? feature.properties.zoneId : "";
      if (isMetropolitanZoneId(zoneId)) return feature;

      return {
        ...feature,
        geometry: roundGeometryCorners(feature.geometry),
      };
    }),
  };
}

function shouldPreserveSelectableZoneRenderGeometry(collection: GeoJSON.FeatureCollection) {
  return collection.features.some((feature) => {
    const zoneId = typeof feature.properties?.zoneId === "string" ? feature.properties.zoneId : "";
    return isGrandParisCommuneZoneId(zoneId) || zoneId.startsWith("grand_paris_");
  });
}

type HoverCardPoint = { x: number; y: number };
type AvatarZoneSummary = {
  total?: number;
  iconCounts?: HoverLabelIconCounts;
};
type CachedAvatarZoneSummary = {
  total?: number;
  iconCounts?: HoverLabelIconCounts;
};
type SelectedZoneFlyTarget = {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  speed?: number;
  curve?: number;
};

function getGrandParisFocusedCommuneFlyTarget(
  map: MapLibreMap,
  feature: SelectedZonePolygonFeature | undefined,
): SelectedZoneFlyTarget | null {
  if (!feature?.geometry) return null;
  const parentCode = String(feature.properties?.districtCode ?? "");
  if (parentCode === "93066") {
    // Product-calibrated Saint-Denis landing (reference capture): the diagonal
    // composition exposes every district while keeping the commune readable.
    return {
      center: [2.36366, 48.93319],
      zoom: 13.62,
      pitch: 45.5,
      bearing: -59.9,
      speed: 0.85,
      curve: 1.24,
    };
  }
  const bbox = getGeometryBbox(feature.geometry);
  // The camera may legitimately look at water or a hole inside a horseshoe-
  // shaped commune. Bbox centering keeps the complete outline visually centered;
  // interior-point enforcement remains reserved for the subsequent district fly.
  const center = getBboxCenter(bbox);
  const camera = typeof (map as any).cameraForBounds === "function"
    ? (map as any).cameraForBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      {
        padding: { top: 108, bottom: 108, left: 112, right: 112 },
        maxZoom: GRAND_PARIS_FOCUSED_COMMUNE_MAX_ZOOM,
      },
    )
    : null;
  const cameraZoom = Number(camera?.zoom);
  const zoom = Number.isFinite(cameraZoom)
    // cameraForBounds fits a flat map, while the landing pitch is 60°. Restore
    // enough apparent scale for the commune to read like the Romainville model.
    ? clampNumber(cameraZoom + 0.45, GRAND_PARIS_FOCUSED_COMMUNE_MIN_ZOOM, GRAND_PARIS_FOCUSED_COMMUNE_MAX_ZOOM)
    : 14.35;

  return {
    center,
    zoom,
    pitch: 60,
    bearing: 0,
    speed: 0.85,
    curve: 1.24,
  };
}

const selectedZoneAvatarSummaryCache = new Map<string, CachedAvatarZoneSummary>();
const STATIC_SELECTED_ZONE_AVATAR_SUMMARY_FALLBACKS: Record<string, CachedAvatarZoneSummary> = {
  paris_20e_charonne: {
    total: 451,
    iconCounts: {
      microphone: 105,
      guitar: 16,
      piano: 22,
      producer: 121,
    },
  },
  charonne: {
    total: 451,
    iconCounts: {
      microphone: 105,
      guitar: 16,
      piano: 22,
      producer: 121,
    },
  },
};

function getActiveArtistFilterQuery() {
  if (typeof window === "undefined") return { roleKeys: [] as string[], gradeLevels: [] as number[] };
  const filters = (window as any).__MEEWAV_ACTIVE_ARTIST_FILTERS__;
  return {
    roleKeys: Array.isArray(filters?.roleKeys) ? filters.roleKeys.map(String).filter(Boolean) : [],
    gradeLevels: Array.isArray(filters?.gradeLevels)
      ? filters.gradeLevels.map(Number).filter((level: number) => Number.isInteger(level) && level >= 1 && level <= 6)
      : [],
  };
}

function getAvatarZoneSummaryCacheKey(zoneId: string | null | undefined, label: string | null | undefined) {
  const zoneKey = String(zoneId ?? "").trim().toLowerCase();
  const labelKey = String(label ?? "").trim().toLocaleLowerCase("fr-FR");
  const filters = getActiveArtistFilterQuery();
  const filterKey = `${filters.roleKeys.join(",")}::${filters.gradeLevels.join(",")}`;
  return zoneKey || labelKey ? `${zoneKey}::${labelKey}::${filterKey}` : "";
}

function hasPositiveIconCounts(iconCounts: HoverLabelIconCounts | undefined) {
  return Object.values(iconCounts ?? {}).some((count) => {
    const numericCount = Number(count);
    return Number.isFinite(numericCount) && numericCount > 0;
  });
}

function hasPositiveAvatarSummary(summary: AvatarZoneSummary | null | undefined) {
  const total = Number(summary?.total);
  return (Number.isFinite(total) && total > 0) || hasPositiveIconCounts(summary?.iconCounts);
}

function getCachedAvatarZoneSummary(zoneId: string | null | undefined, label: string | null | undefined) {
  const cacheKey = getAvatarZoneSummaryCacheKey(zoneId, label);
  return cacheKey ? selectedZoneAvatarSummaryCache.get(cacheKey) ?? null : null;
}

function getStaticAvatarZoneSummaryFallback(zoneId: string | null | undefined, label: string | null | undefined) {
  const zoneKey = String(zoneId ?? "").trim().toLowerCase();
  const labelKey = String(label ?? "").trim().toLocaleLowerCase("fr-FR");

  return STATIC_SELECTED_ZONE_AVATAR_SUMMARY_FALLBACKS[zoneKey]
    ?? STATIC_SELECTED_ZONE_AVATAR_SUMMARY_FALLBACKS[labelKey]
    ?? null;
}

function rememberPositiveAvatarZoneSummary(
  zoneId: string | null | undefined,
  label: string | null | undefined,
  summary: AvatarZoneSummary | null | undefined,
) {
  if (!hasPositiveAvatarSummary(summary)) return null;
  const cacheKey = getAvatarZoneSummaryCacheKey(zoneId, label);
  if (!cacheKey) return null;

  const cachedSummary: CachedAvatarZoneSummary = {
    total: typeof summary?.total === "number" && Number.isFinite(summary.total)
      ? Math.max(0, Math.round(summary.total))
      : undefined,
    iconCounts: summary?.iconCounts ?? {},
  };
  selectedZoneAvatarSummaryCache.set(cacheKey, cachedSummary);
  return cachedSummary;
}

function applyAvatarZoneSummaryToHoverCard(
  countElement: HTMLElement,
  iconCountsElement: HTMLElement,
  summary: AvatarZoneSummary | CachedAvatarZoneSummary | null | undefined,
  fallbackCountLabel: string,
) {
  if (typeof summary?.total === "number" && Number.isFinite(summary.total)) {
    countElement.textContent = formatHoverCount(summary.total);
  } else {
    countElement.textContent = fallbackCountLabel;
  }
  updateHoverLabelIconCountsElement(iconCountsElement, summary?.iconCounts ?? {});
}
type SelectedZoneSelectionOptions = {
  skipCameraMove?: boolean;
};

type TerritoryDescriptor = {
  id: string;
  type: "department" | "commune" | "commune_deleguee" | "quartier" | "iris" | "qpv";
  name: string;
  parentId: string | null;
  aliases: string[];
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bbox: LngLatBoundsArray;
  center: [number, number];
  source: string;
  sourceYear: string;
};

function isGrandParisCommuneZoneId(zoneId: string | null | undefined) {
  return Boolean(zoneId?.startsWith("grand_paris_commune_"));
}

function isGrandParisZoneId(zoneId: string | null | undefined) {
  return Boolean(zoneId?.startsWith("grand_paris_"));
}

function isGrandParisSubzoneZoneId(zoneId: string | null | undefined) {
  return isGrandParisZoneId(zoneId) && !isGrandParisCommuneZoneId(zoneId);
}

function isMetropolitanCommuneZoneId(zoneId: string | null | undefined) {
  return Boolean(getMetropolitanCityConfigForCommuneZoneId(zoneId));
}

function isMetropolitanSubzoneZoneId(zoneId: string | null | undefined) {
  return Boolean(getMetropolitanCityConfigForSubzoneZoneId(zoneId));
}

function isMetropolitanZoneId(zoneId: string | null | undefined) {
  return isMetropolitanCommuneZoneId(zoneId) || isMetropolitanSubzoneZoneId(zoneId);
}

function isSeineSaintDenisCommuneZoneId(zoneId: string | null | undefined) {
  return Boolean(zoneId?.startsWith("grand_paris_commune_93"));
}

function createTerritoryDescriptor(feature: SelectedZonePolygonFeature): TerritoryDescriptor {
  const bbox = getGeometryBbox(feature.geometry);
  return {
    id: feature.properties.zoneId,
    type: feature.properties.territoryType ?? "commune",
    name: feature.properties.label,
    parentId: feature.properties.parentZoneId ?? null,
    aliases: [feature.properties.label, feature.properties.districtCode].filter(Boolean),
    geometry: cloneGeometry(feature.geometry),
    bbox,
    center: getBboxCenter(bbox),
    source: feature.properties.source ?? "geo.api.gouv.fr",
    sourceYear: feature.properties.sourceYear ?? "2026",
  };
}

function setGrandParisActiveOutlineFromSelectedZone(map: MapLibreMap, feature: SelectedZonePolygonFeature | undefined) {
  const source = map.getSource(GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source || !feature?.geometry) return;

  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: feature.properties.zoneId,
        properties: {
          id: feature.properties.zoneId,
          code: feature.properties.districtCode,
          name: feature.properties.label,
        },
        geometry: cloneGeometry(feature.geometry),
      },
    ],
  });
}

function clearGrandParisActiveOutlineFromSelectedZone(map: MapLibreMap) {
  const source = map.getSource(GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

async function fetchSelectedZoneAvatarSummary(
  zoneId: string | null | undefined,
  label: string | null | undefined,
): Promise<AvatarZoneSummary | null> {
  const createUrl = () => {
    const url = new URL(`${AVATAR_API_BASE_URL}/api/avatars/zone-summary`);
    if (zoneId) url.searchParams.set("zoneId", zoneId);
    if (label) url.searchParams.set("name", label);
    return url;
  };
  const rawResponse = await fetch(createUrl().toString(), { cache: "no-store" });
  if (!rawResponse.ok) return null;
  const rawSummary = await rawResponse.json() as AvatarZoneSummary;
  const requiredStyleCount = getMaxVisibleCategories(Number(rawSummary.total ?? 0));
  if (requiredStyleCount === 0) return rawSummary;

  const filters = getActiveArtistFilterQuery();
  const mandatoryRoleKeys = getMandatoryAvatarRoleKeys(
    filters.roleKeys,
    [
      ...BEATMAKER_PRESET.enabledRoleKeys,
      ...Array.from({ length: 30 }, (_, index) => `avatar_${index + 1}`),
    ],
    requiredStyleCount,
  );
  const url = createUrl();
  url.searchParams.set("roleKeys", mandatoryRoleKeys.join(","));
  if (filters.gradeLevels.length > 0) url.searchParams.set("gradeLevels", filters.gradeLevels.join(","));

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;

  return await response.json();
}

function createSelectedZoneHoverCard(map: MapLibreMap) {
  const element = document.createElement("div");
  element.className = "city-zone-hover-card selected-zone-hover-card is-pointer-following";
  element.innerHTML = "<strong></strong><span></span>";
  const iconCountsElement = createHoverLabelIconCountsElement(document);
  element.append(iconCountsElement);
  map.getContainer().appendChild(element);

  const nameElement = element.querySelector("strong") as HTMLElement;
  const contextElement = element.querySelector("span") as HTMLElement;
  let summaryRequestId = 0;

  const move = (point: HoverCardPoint) => {
    element.style.setProperty("--city-zone-hover-x", `${Math.round(point.x)}px`);
    element.style.setProperty("--city-zone-hover-y", `${Math.round(point.y)}px`);
  };

  return {
    show(label: string, countLabel: string, point: HoverCardPoint, zoneId?: string | null) {
      const requestId = ++summaryRequestId;
      const cachedSummary = getCachedAvatarZoneSummary(zoneId, label);
      const fallbackSummary = getStaticAvatarZoneSummaryFallback(zoneId, label);
      nameElement.textContent = label.toLocaleUpperCase("fr-FR");
      applyAvatarZoneSummaryToHoverCard(contextElement, iconCountsElement, cachedSummary ?? fallbackSummary, countLabel);
      move(point);
      element.classList.add("is-visible");

      void fetchSelectedZoneAvatarSummary(zoneId, label)
        .then((summary) => {
          if (!summary || requestId !== summaryRequestId) return;
          const positiveSummary = rememberPositiveAvatarZoneSummary(zoneId, label, summary);
          applyAvatarZoneSummaryToHoverCard(
            contextElement,
            iconCountsElement,
            positiveSummary ?? getCachedAvatarZoneSummary(zoneId, label) ?? summary,
            countLabel,
          );
        })
        .catch(() => {
          // Keep the static label if the local avatar service is not available.
        });
    },
    move,
    hide() {
      summaryRequestId += 1;
      element.classList.remove("is-visible");
    },
    remove() {
      element.remove();
    },
  };
}

function waitForMapEvent(map: MapLibreMap, eventName: string, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    (map as any).once(eventName, finish);
  });
}

function getInitialZoneIdFromSearch(search: string): SelectedZoneId | null {
  const params = new URLSearchParams(search);
  const district = params.get("district") ?? "";
  if (params.get("selectedExtrusionPoc") === "1" && ["goutte-d-or", "goutte-dor", "goutte"].includes(district)) {
    return DEFAULT_SELECTED_ZONE_ID;
  }
  const directZoneId = params.get("selectedZone") ?? params.get("zoneId");
  return directZoneId && /^(paris_\d{2}e|nice|lyon|nantes|marseille|lille|saint_denis|grand_paris)_[a-z0-9_]+$/.test(directZoneId) ? directZoneId : null;
}

function parseLocalizedNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatHoverCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(value))).replace(/\u202f/g, " ");
}

function getHoverCountLabel(properties: Record<string, unknown>, zoneId?: string, label?: string) {
  const directCount = [
    properties.avatarCount,
    properties.avatar_count,
    properties.avatarsCount,
    properties.avatars_count,
    properties.meewavAvatarCount,
    properties.userCount,
    properties.users_count,
  ]
    .map(parseLocalizedNumber)
    .find((value): value is number => value !== null && value >= 0);

  if (directCount !== undefined) return formatHoverCount(directCount);

  const fallbackSummary = getStaticAvatarZoneSummaryFallback(
    zoneId ?? (typeof properties.zoneId === "string" ? properties.zoneId : null),
    label ?? (typeof properties.label === "string" ? properties.label : typeof properties.name === "string" ? properties.name : null),
  );
  if (typeof fallbackSummary?.total === "number" && Number.isFinite(fallbackSummary.total)) {
    return formatHoverCount(fallbackSummary.total);
  }

  return "0";
}

function waitForMilliseconds(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, timeoutMs);
  });
}

function normalizeSelectableZoneFeature(
  sourceFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>,
  colorIndex: number,
): SelectedZonePolygonFeature {
  const properties = sourceFeature.properties ?? {};
  const directZoneId = typeof properties.zoneId === "string" ? properties.zoneId : "";
  const sourceId = typeof properties.id === "string" ? properties.id : "";
  const code = String(properties.code ?? "");
  const departmentCode = String(properties.departmentCode ?? "");
  const isGrandParisCommune = sourceId.startsWith("grand_paris_commune_") || /^9[2345]\d{3}$/.test(code);
  const grandParisDepartmentZoneId = isGrandParisCommune && departmentCode
    ? `grand_paris_department_${departmentCode}`
    : undefined;
  const zoneId = directZoneId
    || (isGrandParisCommune ? sourceId || `grand_paris_commune_${code}` : "")
    || normalizeParisQuartierZoneId(properties);
  const rawColorIndex = Number(properties.colorIndex);
  const normalizedColorIndex = Number.isFinite(rawColorIndex) ? Math.abs(Math.trunc(rawColorIndex)) % 8 : colorIndex % 8;
  const label = typeof properties.label === "string"
    ? properties.label
    : typeof properties.name === "string"
      ? properties.name
      : getParisQuartierDisplayName(properties);
  const territoryType = isGrandParisCommune
    ? "commune"
    : typeof properties.territoryType === "string"
      ? properties.territoryType as SelectedZonePolygonProperties["territoryType"]
      : undefined;
  const officialId = String(properties.officialId ?? properties.code_iris ?? properties.CODE_IRIS ?? "").trim();
  const communeCode = String(
    properties.communeCode
    ?? properties.code_insee
    ?? properties.CODE_INSEE
    ?? properties.parentCode
    ?? (territoryType === "commune" ? code : ""),
  ).trim();
  const communeName = String(properties.communeName ?? properties.parentLabel ?? "").trim();
  const rawIrisCode = String(properties.irisCode ?? "").trim();
  const irisCode = rawIrisCode || (officialId.length >= 4 ? officialId.slice(-4) : "");
  const irisType = String(properties.irisType ?? properties.type_iris ?? properties.TYPE_IRIS ?? "").trim().toUpperCase();
  const groundColor = isGrandParisCommune || zoneId.startsWith("grand_paris_")
    ? getGrandParisCrepusculeGroundColor({
      label,
      zoneId,
      colorIndex: normalizedColorIndex,
      legacyGroundColor: properties.groundColor,
    })
    : typeof properties.groundColor === "string"
      ? properties.groundColor
      : getCrepusculeGroundColor({ label, zoneId, colorIndex: normalizedColorIndex });
  const labelLngLat = getParisQuartierLabelLngLat(properties);

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: String(properties.districtCode ?? properties.c_qu ?? (code || zoneId)),
      arrondissementCode: String(properties.arrondissementCode ?? properties.c_ar ?? departmentCode ?? ""),
      colorIndex: normalizedColorIndex,
      groundColor,
      isSelectable: true,
      hoverCountLabel: getHoverCountLabel(properties, zoneId, label),
      parentZoneId: typeof properties.parentZoneId === "string"
        ? properties.parentZoneId
        : departmentCode === SEINE_SAINT_DENIS_DEPARTMENT_CODE
          ? SEINE_SAINT_DENIS_DEPARTMENT_ZONE_ID
          : grandParisDepartmentZoneId,
      parentCode: typeof properties.parentCode === "string" ? properties.parentCode : departmentCode || undefined,
      parentLabel: typeof properties.parentLabel === "string"
        ? properties.parentLabel
        : departmentCode === SEINE_SAINT_DENIS_DEPARTMENT_CODE
          ? "Seine-Saint-Denis"
          : typeof properties.departmentName === "string"
            ? properties.departmentName
            : undefined,
      territoryType,
      paletteFamily: properties.paletteFamily === "metropolitan"
        ? "metropolitan"
        : properties.paletteFamily === "city"
          ? "city"
          : undefined,
      navigationRole: normalizeSelectedZoneNavigationRole(properties.navigationRole),
      navigationSurface: normalizeSelectedZoneNavigationSurface(properties.navigationSurface, territoryType),
      officialId: officialId || undefined,
      communeCode: communeCode || undefined,
      communeName: communeName || undefined,
      irisCode: irisCode || undefined,
      irisType: irisType || undefined,
      runtimeMode: properties.runtimeMode === "single_plate" ? "single_plate" : undefined,
      navigationTargetCityId: typeof properties.navigationTargetCityId === "string"
        ? properties.navigationTargetCityId
        : undefined,
      source: typeof properties.source === "string" ? properties.source : undefined,
      sourceYear: typeof properties.sourceYear === "string" ? properties.sourceYear : "2026",
      labelLng: labelLngLat?.[0],
      labelLat: labelLngLat?.[1],
    },
    geometry: cloneGeometry(sourceFeature.geometry),
  };
}

async function loadSelectableZonePolygons(
  url = PARIS_QUARTIERS_URL,
  filterFeature?: (feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) => boolean,
): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load selectable zones ${url}: HTTP ${response.status}`);
  }

  const payload = await response.json() as GeoJSON.FeatureCollection;
  const features: SelectedZonePolygonFeature[] = [];

  const sourceFeatures = payload.features
    .filter((feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon")
    .filter((feature) => !filterFeature || filterFeature(feature as GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>))
    .sort((a, b) => Number(a.properties?.c_qu ?? a.properties?.colorIndex ?? 0) - Number(b.properties?.c_qu ?? b.properties?.colorIndex ?? 0)) as Array<
      GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>
    >;

  for (const [colorIndex, sourceFeature] of sourceFeatures.entries()) {
    features.push(normalizeSelectableZoneFeature(sourceFeature, colorIndex));
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function createZoneFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features,
  };
}

type CommuneNavigationPresentation = {
  interactionCollection: GeoJSON.FeatureCollection;
  renderCollection: GeoJSON.FeatureCollection;
  officialSinglePlate: boolean;
};

function withNavigationState(
  feature: GeoJSON.Feature,
  navigationRole: "active" | "neighbor" | "normal",
  navigationSurface: "parent" | "subdivision",
  propertiesOverride: Record<string, unknown> = {},
): GeoJSON.Feature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      navigationRole,
      navigationSurface,
      ...propertiesOverride,
    },
  };
}

function getFeatureCommuneCode(feature: GeoJSON.Feature | undefined) {
  const properties = feature?.properties ?? {};
  return String(
    properties.communeCode
    ?? properties.parentCode
    ?? (properties.territoryType === "commune" ? properties.districtCode ?? properties.code : "")
    ?? "",
  ).trim();
}

function createActiveCommuneNavigationPresentation(
  subdivisionCollection: GeoJSON.FeatureCollection,
  parentFeature: GeoJSON.Feature | undefined,
  scopeId: string,
): CommuneNavigationPresentation {
  const officialSinglePlate = isOfficialSingleIrisCommune(subdivisionCollection.features);
  const soleSubdivision = subdivisionCollection.features[0];

  if (officialSinglePlate && soleSubdivision) {
    const officialProperties = soleSubdivision.properties ?? {};
    const baseFeature = parentFeature ?? soleSubdivision;
    const baseProperties = baseFeature.properties ?? {};
    const communeLabel = String(
      baseProperties.communeName
      ?? baseProperties.label
      ?? officialProperties.communeName
      ?? officialProperties.parentLabel
      ?? officialProperties.label
      ?? "",
    );
    const activeParent = withNavigationState(baseFeature, "active", "parent", {
      label: communeLabel,
      territoryType: "commune",
      groundColor: ACTIVE_COMMUNE_GROUND_COLOR,
      isSelectable: true,
      officialId: officialProperties.officialId,
      communeCode: officialProperties.communeCode ?? getFeatureCommuneCode(baseFeature),
      communeName: officialProperties.communeName ?? communeLabel,
      irisCode: officialProperties.irisCode,
      irisType: officialProperties.irisType,
      contextDimmed: false,
      preserveParentOverviewColor: false,
    });
    const collection = createZoneFeatureCollection([activeParent]);
    return {
      interactionCollection: collection,
      renderCollection: collection,
      officialSinglePlate: true,
    };
  }

  if (!subdivisionCollection.features.length) {
    const activeParent = parentFeature
      ? withNavigationState(parentFeature, "active", "parent", {
        groundColor: ACTIVE_COMMUNE_GROUND_COLOR,
        isSelectable: true,
        contextDimmed: false,
        preserveParentOverviewColor: false,
      })
      : null;
    const collection = createZoneFeatureCollection(activeParent ? [activeParent] : []);
    return {
      interactionCollection: collection,
      renderCollection: collection,
      officialSinglePlate: false,
    };
  }

  const activeSubdivisions = subdivisionCollection.features.map((feature) => (
    withNavigationState(feature, "active", "subdivision", {
      contextDimmed: false,
      preserveParentOverviewColor: true,
    })
  ));
  const backdropBases = parentFeature ? [parentFeature] : subdivisionCollection.features;
  const activeParentBackdrop = backdropBases.map((feature, index) => {
    const backdropZoneId = `navigation_parent_backdrop_${scopeId}_${index}`;
    return {
      ...withNavigationState(feature, "active", "parent", {
        zoneId: backdropZoneId,
        label: "",
        districtCode: backdropZoneId,
        parentZoneId: undefined,
        groundColor: ACTIVE_COMMUNE_GROUND_COLOR,
        isSelectable: false,
        contextDimmed: false,
        preserveParentOverviewColor: false,
      }),
      id: backdropZoneId,
    };
  });

  return {
    interactionCollection: createZoneFeatureCollection(activeSubdivisions),
    renderCollection: createZoneFeatureCollection([
      ...activeParentBackdrop,
      ...activeSubdivisions,
    ]),
    officialSinglePlate: false,
  };
}

function createNeighborNavigationCollection(collection: GeoJSON.FeatureCollection) {
  return createZoneFeatureCollection(collection.features.map((feature) => (
    withNavigationState(feature, "neighbor", "parent", {
      contextDimmed: true,
      preserveParentOverviewColor: false,
    })
  )));
}

function createNormalNavigationCollection(collection: GeoJSON.FeatureCollection) {
  return createZoneFeatureCollection(collection.features.map((feature) => (
    withNavigationState(
      feature,
      "normal",
      normalizeSelectedZoneNavigationSurface(
        feature.properties?.navigationSurface,
        feature.properties?.territoryType,
      ),
    )
  )));
}

function createCityOverviewNavigationPresentation(
  cityId: CitySubdivisionId,
  collection: GeoJSON.FeatureCollection,
): CommuneNavigationPresentation {
  const config = CITY_SUBDIVISION_CONFIGS[cityId];
  const metropolitanArea = config.metropolitanArea;
  const activeSubdivisions = createZoneFeatureCollection(collection.features.filter((feature) => {
    const zoneId = String(feature.properties?.zoneId ?? "");
    if (!zoneId.startsWith(config.zoneIdPrefix)) return false;
    if (metropolitanArea?.communeZoneIdPrefix && zoneId.startsWith(metropolitanArea.communeZoneIdPrefix)) return false;
    if (metropolitanArea?.subzoneZoneIdPrefix && zoneId.startsWith(metropolitanArea.subzoneZoneIdPrefix)) return false;
    return true;
  }));
  const activeCommuneCode = getFeatureCommuneCode(activeSubdivisions.features[0]);
  const cityIdentity = slugifyParisDistrict(String(cityId));
  const activeParentFeature = collection.features.find((feature) => (
    feature.properties?.territoryType === "commune"
    && (
      (activeCommuneCode !== "" && getFeatureCommuneCode(feature) === activeCommuneCode)
      || slugifyParisDistrict(String(feature.properties?.label ?? feature.properties?.name ?? "")) === cityIdentity
    )
  ));
  const contextFeatures = collection.features.filter((feature) => (
    !activeSubdivisions.features.includes(feature) && feature !== activeParentFeature
  ));
  const neighborCollection = createNeighborNavigationCollection(createZoneFeatureCollection(
    contextFeatures.filter((feature) => feature.properties?.territoryType === "commune"),
  ));
  const normalContextCollection = createNormalNavigationCollection(createZoneFeatureCollection(
    contextFeatures.filter((feature) => feature.properties?.territoryType !== "commune"),
  ));
  const activePresentation = createActiveCommuneNavigationPresentation(
    activeSubdivisions,
    activeParentFeature,
    `city_${cityId}`,
  );

  return {
    interactionCollection: mergeZoneFeatureCollections([
      neighborCollection,
      normalContextCollection,
      activePresentation.interactionCollection,
    ]),
    renderCollection: mergeZoneFeatureCollections([
      neighborCollection,
      normalContextCollection,
      activePresentation.renderCollection,
    ]),
    officialSinglePlate: activePresentation.officialSinglePlate,
  };
}

function shiftHexColorLightness(color: string, amount: number) {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const numeric = Number.parseInt(match[1], 16);
  const shift = Math.round(255 * (amount / 100));
  const channel = (value: number) => Math.max(0, Math.min(255, value + shift));
  const red = channel((numeric >> 16) & 0xff);
  const green = channel((numeric >> 8) & 0xff);
  const blue = channel(numeric & 0xff);
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

type MercatorPoint = {
  x: number;
  y: number;
};

type DistrictFlyCameraPlan = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  principalAxisDeg: number;
  targetBearing: number;
  shapeAspect: "vertical" | "horizontal" | "square";
  viewportAspect: number;
  overflowRatio: number;
  coverMode: true;
  reason: string;
};

function normalizeBearing(bearing: number) {
  if (!Number.isFinite(bearing)) return 0;
  let normalized = ((bearing % 360) + 360) % 360;
  if (normalized > 180) normalized -= 360;
  return normalized;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function mercatorX(lng: number) {
  return (lng + 180) / 360;
}

function mercatorY(lat: number) {
  const boundedLat = clampNumber(lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((boundedLat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
}

function lngLatToMercatorPoint(position: GeoJSON.Position): MercatorPoint | null {
  const lng = Number(position[0]);
  const lat = Number(position[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return {
    x: mercatorX(lng),
    y: -mercatorY(lat),
  };
}

function collectMercatorGeometryPoints(coordinates: unknown, result: MercatorPoint[] = []) {
  if (!Array.isArray(coordinates)) return result;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    const point = lngLatToMercatorPoint(coordinates as GeoJSON.Position);
    if (point) result.push(point);
    return result;
  }

  for (const child of coordinates) {
    collectMercatorGeometryPoints(child, result);
  }
  return result;
}

function computePrincipalAxis(points: MercatorPoint[]) {
  if (points.length < 2) {
    return {
      angleDeg: 0,
      ratio: 1,
    };
  }

  const mean = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );
  let xx = 0;
  let yy = 0;
  let xy = 0;

  for (const point of points) {
    const dx = point.x - mean.x;
    const dy = point.y - mean.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }

  xx /= points.length;
  yy /= points.length;
  xy /= points.length;

  const angleRad = 0.5 * Math.atan2(2 * xy, xx - yy);
  const trace = xx + yy;
  const determinantTerm = Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy ** 2));
  const major = Math.max(0, trace / 2 + determinantTerm);
  const minor = Math.max(0, trace / 2 - determinantTerm);
  const ratio = minor > 0 ? Math.sqrt(major / minor) : 99;

  return {
    angleDeg: (angleRad * 180) / Math.PI,
    ratio,
  };
}

function computeRotatedBox(points: MercatorPoint[], bearing: number) {
  const angleRad = (bearing * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    const x = point.x * cos - point.y * sin;
    const y = point.x * sin + point.y * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    width: Math.max(0.000000001, maxX - minX),
    height: Math.max(0.000000001, maxY - minY),
  };
}

function getShapeAspectLabel(axisDeg: number, axisRatio: number): DistrictFlyCameraPlan["shapeAspect"] {
  if (axisRatio < 1.22) return "square";

  const foldedDeg = Math.abs(((axisDeg % 180) + 180) % 180);
  const distanceToHorizontal = Math.min(foldedDeg, Math.abs(180 - foldedDeg));
  const distanceToVertical = Math.abs(90 - foldedDeg);

  return distanceToVertical < distanceToHorizontal ? "vertical" : "horizontal";
}

function scoreDistrictFlyCandidate(params: {
  boxWidth: number;
  boxHeight: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  currentBearing: number;
  bearing: number;
  axisRatio: number;
}) {
  const scale = 512 * (2 ** params.zoom);
  const screenWidth = params.boxWidth * scale;
  const screenHeight = params.boxHeight * scale;
  const widthFill = screenWidth / Math.max(params.viewportWidth, 1);
  const heightFill = screenHeight / Math.max(params.viewportHeight, 1);
  const fillScore = Math.min(widthFill, 1.18) * 1.9 + Math.min(heightFill, 1.08);
  const widthTargetPenalty = Math.abs(widthFill - SELECTED_ZONE_DESKTOP_COVER_OVERFLOW_RATIO) * 0.85;
  const heightOverflowPenalty = Math.max(0, heightFill - 1.28) * 1.25;
  const rotationDelta = Math.abs(normalizeBearing(params.bearing - params.currentBearing));
  const squareRotationPenalty = params.axisRatio < 1.22 ? rotationDelta / 180 : 0;

  return fillScore - widthTargetPenalty - heightOverflowPenalty - squareRotationPenalty;
}

function computeOptimizedDistrictFlyPlan(params: {
  districtGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bbox: LngLatBoundsArray;
  viewportWidth: number;
  viewportHeight: number;
  currentBearing: number;
  targetPitch: number;
  zoneCameraLimit?: { minZoom?: number; maxPitch: number; maxZoom: number } | null;
}): DistrictFlyCameraPlan | null {
  const points = collectMercatorGeometryPoints(params.districtGeometry.coordinates);
  if (points.length < 3) return null;

  const viewportAspect = params.viewportWidth / Math.max(params.viewportHeight, 1);
  const principalAxis = computePrincipalAxis(points);
  const shapeAspect = getShapeAspectLabel(principalAxis.angleDeg, principalAxis.ratio);
  // Keep north stable between adjacent zones. Rotating each district to match its
  // principal axis makes short hops spatially disorienting even when it improves
  // the theoretical polygon fill by a few pixels.
  const candidateBearings = [0];

  const uniqueBearings = Array.from(new Set(candidateBearings.map((bearing) => Math.round(bearing * 10) / 10)));
  const targetViewportWidth = Math.max(1, params.viewportWidth - SELECTED_ZONE_DESKTOP_COVER_PADDING_PX * 2)
    * SELECTED_ZONE_DESKTOP_COVER_OVERFLOW_RATIO;
  const targetViewportHeight = Math.max(1, params.viewportHeight - SELECTED_ZONE_DESKTOP_COVER_PADDING_PX * 2)
    * SELECTED_ZONE_DESKTOP_COVER_OVERFLOW_RATIO;
  let best: { bearing: number; zoom: number; score: number } | null = null;

  for (const bearing of uniqueBearings) {
    const box = computeRotatedBox(points, bearing);
    const widthZoom = Math.log2(targetViewportWidth / (box.width * 512));
    const heightZoom = Math.log2(targetViewportHeight / (box.height * 512));
    // The selected polygon must remain completely legible. The previous
    // "cover" formula deliberately overflowed the viewport, then flyToZone
    // forced z17.05, making 970/984 Paris + Grand Paris leaves impossible to
    // see in full. Large territories now land on their cluster overview;
    // compact territories still naturally resolve to the avatar zoom range.
    const rawZoom = Math.min(widthZoom, heightZoom);
    const maxZoom = Math.min(SELECTED_ZONE_DESKTOP_COVER_MAX_ZOOM, params.zoneCameraLimit?.maxZoom ?? SELECTED_ZONE_DESKTOP_COVER_MAX_ZOOM);
    const zoom = clampNumber(
      rawZoom,
      params.zoneCameraLimit?.minZoom ?? SELECTED_ZONE_DESKTOP_COVER_MIN_ZOOM,
      maxZoom,
    );
    const score = scoreDistrictFlyCandidate({
      boxWidth: box.width,
      boxHeight: box.height,
      zoom,
      viewportWidth: params.viewportWidth,
      viewportHeight: params.viewportHeight,
      currentBearing: params.currentBearing,
      bearing,
      axisRatio: principalAxis.ratio,
    });

    if (!best || score > best.score) {
      best = { bearing, zoom, score };
    }
  }

  if (!best) return null;

  return {
    center: getBboxCenter(params.bbox),
    zoom: best.zoom,
    bearing: normalizeBearing(best.bearing),
    pitch: Math.min(params.targetPitch, params.zoneCameraLimit?.maxPitch ?? MAPLIBRE_STANDARD_MAX_PITCH),
    principalAxisDeg: Number(principalAxis.angleDeg.toFixed(1)),
    targetBearing: normalizeBearing(best.bearing),
    shapeAspect,
    viewportAspect: Number(viewportAspect.toFixed(2)),
    overflowRatio: SELECTED_ZONE_DESKTOP_COVER_OVERFLOW_RATIO,
    coverMode: true,
    reason: "desktop-oriented-district-cover",
  };
}

function filterZoneFeatureCollection(
  collection: GeoJSON.FeatureCollection,
  predicate: (feature: GeoJSON.Feature) => boolean,
): GeoJSON.FeatureCollection {
  return createZoneFeatureCollection(collection.features.filter(predicate));
}

function mergeZoneFeatureCollections(collections: Array<GeoJSON.FeatureCollection | null | undefined>): GeoJSON.FeatureCollection {
  const seenZoneIds = new Set<string>();
  const features: GeoJSON.Feature[] = [];

  for (const collection of collections) {
    for (const feature of collection?.features ?? []) {
      const zoneId = typeof feature.properties?.zoneId === "string" ? feature.properties.zoneId : "";
      if (zoneId && seenZoneIds.has(zoneId)) continue;
      if (zoneId) seenZoneIds.add(zoneId);
      features.push(feature);
    }
  }

  return createZoneFeatureCollection(features);
}

const COMMUNE_NAVIGATION_CONTEXT_CANDIDATES = Object.values(CITY_SUBDIVISION_CONFIGS)
  .flatMap((config) => {
    const center = CITY_CAMERA_PRESETS[config.id]?.center;
    const generatedCity = FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID.get(config.id as any);
    return center
      ? [{
          id: config.id,
          center: [center[0], center[1]] as const,
          bbox: generatedCity?.bbox,
        }]
      : [];
  });

function getFeatureCollectionBbox(collection: GeoJSON.FeatureCollection): LngLatBoundsArray | null {
  if (collection.features.length === 0) return null;
  return collection.features.reduce<LngLatBoundsArray>((bounds, feature) => {
    const featureBounds = getGeometryBbox(feature.geometry);
    return [
      Math.min(bounds[0], featureBounds[0]),
      Math.min(bounds[1], featureBounds[1]),
      Math.max(bounds[2], featureBounds[2]),
      Math.max(bounds[3], featureBounds[3]),
    ];
  }, [Infinity, Infinity, -Infinity, -Infinity]);
}

function getStableCommuneColorIndex(communeCode: string, cityId: CitySubdivisionId) {
  const identity = communeCode || cityId;
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash * 31) + identity.charCodeAt(index)) >>> 0;
  }
  return hash % 8;
}

function createCommuneNavigationParentFeature(
  cityId: CitySubdivisionId,
  collection: GeoJSON.FeatureCollection,
): SelectedZonePolygonFeature | null {
  const polygonFeatures = collection.features.filter((feature): feature is SelectedZonePolygonFeature => (
    feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"
  ));
  const firstFeature = polygonFeatures[0];
  if (!firstFeature) return null;

  let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
  if (polygonFeatures.length === 1) {
    geometry = cloneGeometry(firstFeature.geometry);
  } else {
    try {
      const dissolved = turfUnion(turfFeatureCollection(polygonFeatures.map((feature) => ({
        type: "Feature" as const,
        properties: {},
        geometry: cloneGeometry(feature.geometry),
      }))) as any);
      if (dissolved?.geometry?.type === "Polygon" || dissolved?.geometry?.type === "MultiPolygon") {
        geometry = dissolved.geometry;
      }
    } catch {
      // Invalid source topology must not create false internal commune plates.
      return null;
    }
  }
  if (!geometry) return null;

  const communeCode = getFeatureCommuneCode(firstFeature);
  const label = String(
    firstFeature.properties.communeName
    ?? firstFeature.properties.parentLabel
    ?? CITY_CAMERA_PRESETS[cityId]?.name
    ?? cityId,
  );
  const zoneId = `navigation_commune_parent_${cityId}`;
  const center = getGeometryInteriorCenter(geometry);

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      ...firstFeature.properties,
      zoneId,
      label,
      districtCode: communeCode || zoneId,
      arrondissementCode: communeCode.slice(0, 2),
      colorIndex: getStableCommuneColorIndex(communeCode, cityId),
      groundColor: ACTIVE_COMMUNE_GROUND_COLOR,
      isSelectable: true,
      hoverCountLabel: "Commune",
      parentZoneId: undefined,
      parentCode: undefined,
      parentLabel: undefined,
      territoryType: "commune",
      paletteFamily: "city",
      navigationRole: "normal",
      navigationSurface: "parent",
      officialId: communeCode || undefined,
      communeCode: communeCode || undefined,
      communeName: label,
      irisCode: undefined,
      irisType: undefined,
      contextDimmed: false,
      preserveParentOverviewColor: false,
      navigationTargetCityId: cityId,
      labelLng: center[0],
      labelLat: center[1],
    },
    geometry,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    () => worker(),
  ));
  return results;
}

class SelectedZoneExtrusionController {
  private readonly map: MapLibreMap;
  private selectedZoneId: SelectedZoneId | null = null;
  private hoveredZoneId: SelectedZoneId | null = null;
  private zoneFeatures = new Map<SelectedZoneId, SelectedZonePolygonFeature>();
  private parisZoneCollection: GeoJSON.FeatureCollection | null = null;
  private citySubdivisionCollections = new Map<CitySubdivisionId, GeoJSON.FeatureCollection>();
  private cityOverviewCollectionPromises = new Map<CitySubdivisionId, Promise<GeoJSON.FeatureCollection>>();
  private communeNavigationParentPromises = new Map<
    CitySubdivisionId,
    Promise<SelectedZonePolygonFeature | null>
  >();
  private activeCitySubdivisionId: CitySubdivisionId | null = "paris";
  private metropolitanCommuneCollections = new Map<CitySubdivisionId, GeoJSON.FeatureCollection>();
  private metropolitanSubzoneCollections = new Map<CitySubdivisionId, GeoJSON.FeatureCollection>();
  private activeMetropolitanParent: { cityId: CitySubdivisionId; parentCode: string } | null = null;
  private grandParisSubzoneCollection: GeoJSON.FeatureCollection | null = null;
  private grandParisCommuneCollection: GeoJSON.FeatureCollection | null = null;
  private baseRenderZoneCollection: GeoJSON.FeatureCollection | null = null;
  private baseRenderZoneScopeKey: string | null = null;
  private hoverRenderZoneId: SelectedZoneId | null = null;
  private disposed = false;
  private activeSelectionToken = 0;
  private zonePolygonsPromise: Promise<void> | null = null;
  private isZoneFlyActive = false;
  private isZonePointerDown = false;
  private isZoneDragGesture = false;
  private lastZoneDragEndAt = 0;
  private zonePointerDownPoint: HoverCardPoint | null = null;
  private suppressNextZoneClick = false;
  private hoverCardScreenPoint: HoverCardPoint | null = null;
  private pendingHoverPointerPoint: HoverCardPoint | null = null;
  private hoverPointerFrameId: number | null = null;
  private selectionPresentationSettlePassesRemaining = 0;
  private activeFlyToken = 0;
  private readonly defaultMaxPitch: number;
  private readonly defaultMaxZoom: number;
  private readonly hoverCard: ReturnType<typeof createSelectedZoneHoverCard>;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.defaultMaxPitch = clampToMapLibreStandardPitch(map.getMaxPitch());
    this.defaultMaxZoom = map.getMaxZoom();
    this.hoverCard = createSelectedZoneHoverCard(map);
  }

  install() {
    ensureSelectedZoneExtrusionLayers(this.map);
    this.bindMapEvents();
    this.map.getCanvas().addEventListener("pointermove", this.handleHoverPointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("meewav:national-zone-selected", this.handleNationalZoneSelected as EventListener);
    const hasPersistedCityState = typeof window !== "undefined"
      && Object.prototype.hasOwnProperty.call(window, "__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__");
    const persistedCityConfig = hasPersistedCityState
      ? getCitySubdivisionConfig((window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__)
      : CITY_SUBDIVISION_CONFIGS.paris;
    const selectionToken = ++this.activeSelectionToken;
    this.activeCitySubdivisionId = persistedCityConfig?.id ?? null;
    this.zonePolygonsPromise = persistedCityConfig
      ? this.getCityOverviewCollection(persistedCityConfig.id)
          .then((collection) => {
            if (this.disposed || selectionToken !== this.activeSelectionToken) return;
            const presentation = createCityOverviewNavigationPresentation(
              persistedCityConfig.id,
              collection,
            );
            this.applyZoneFeatureRegistry(presentation.interactionCollection);
            this.setHitboxZoneCollection(presentation.interactionCollection);
            this.setRenderZoneCollection(
              presentation.renderCollection,
              `city-overview:${persistedCityConfig.id}`,
            );
          })
          .catch((error) => {
            console.warn(`[selected-zone-extrusion] Unable to load ${persistedCityConfig.id} overview`, error);
          })
      : Promise.resolve();
    setSelectedZonePresentation(this.map, Boolean(this.selectedZoneId));
    this.writeDebugState();
  }

  cleanup() {
    this.disposed = true;
    this.map.off("mousemove", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseMove);
    this.map.off("mouseleave", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseLeave);
    this.map.off("mousedown", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseDown);
    this.map.off("mouseup", this.handleZoneMouseUp);
    this.map.off("dragstart", this.handleZoneDragStart);
    this.map.off("dragend", this.handleZoneMouseUp);
    this.map.off("click", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneClick);
    this.map.off("zoom", this.handleCameraChange);
    this.map.off("pitch", this.handleCameraChange);
    this.map.off("move", this.handleMapMove);
    this.map.off("moveend", this.handleCameraChange);
    this.map.off("moveend", this.handleCameraSettle);
    this.map.off("idle", this.handleCameraSettle);
    this.map.getCanvas().removeEventListener("pointermove", this.handleHoverPointerMove, true);
    window.removeEventListener("meewav:national-zone-selected", this.handleNationalZoneSelected as EventListener);
    this.activeFlyToken += 1;
    this.isZoneFlyActive = false;
    this.clearHoverState();
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);
    this.restoreDefaultCameraLimits();
    this.communeNavigationParentPromises.clear();
    this.cityOverviewCollectionPromises.clear();
    this.hoverCard.remove();
    this.writeDebugState();
  }

  async selectExtrudedZone(
    zoneId: SelectedZoneId,
    flyTarget?: SelectedZoneFlyTarget,
    options: SelectedZoneSelectionOptions = {},
  ) {
    if (isGrandParisCommuneZoneId(zoneId)) {
      const parentCode = zoneId.replace("grand_paris_commune_", "");
      await this.showGrandParisSubzones(parentCode, flyTarget);
      return;
    }

    const metropolitanParentConfig = getMetropolitanCityConfigForCommuneZoneId(zoneId);
    if (metropolitanParentConfig?.metropolitanArea) {
      const parentCode = zoneId.replace(metropolitanParentConfig.metropolitanArea.communeZoneIdPrefix, "");
      await this.showMetropolitanSubzones(metropolitanParentConfig.id, parentCode, flyTarget);
      return;
    }

    const isGrandParisSubzoneSelection = isGrandParisSubzoneZoneId(zoneId);
    const isMetropolitanSubzoneSelection = isMetropolitanSubzoneZoneId(zoneId);
    if (!isGrandParisSubzoneSelection && !isMetropolitanSubzoneSelection) {
      clearGrandParisFocus();
      this.activeMetropolitanParent = null;
    }

    await this.zonePolygonsPromise?.catch(() => undefined);
    const navigationTargetFeature = this.zoneFeatures.get(zoneId);
    const navigationTargetCityId = navigationTargetFeature?.properties.navigationRole === "neighbor"
      ? navigationTargetFeature.properties.navigationTargetCityId
      : null;
    const navigationTargetConfig = getCitySubdivisionConfig(navigationTargetCityId);
    if (navigationTargetConfig && navigationTargetConfig.id !== this.activeCitySubdivisionId) {
      const activationPromise = this.showCitySelectableZones(navigationTargetConfig.id);
      const targetCollection = await this.getCitySubdivisionCollection(navigationTargetConfig.id);
      if (this.activeCitySubdivisionId !== navigationTargetConfig.id) return;
      const flyPromise = options.skipCameraMove
        ? Promise.resolve()
        : this.flyToFeatureCollection(
          targetCollection,
          flyTarget ?? CITY_CAMERA_PRESETS[navigationTargetConfig.id],
        );
      const [loaded] = await Promise.all([activationPromise, flyPromise]);
      if (!loaded || this.activeCitySubdivisionId !== navigationTargetConfig.id) return;
      return;
    }
    const selectionToken = ++this.activeSelectionToken;

    if (!this.zoneFeatures.has(zoneId)) {
      const datasetLoaded = await this.loadDatasetForZoneId(zoneId, selectionToken);
      if (!datasetLoaded) return;
    }

    if (!this.zoneFeatures.has(zoneId)) {
      console.warn(`[selected-zone-extrusion] Unsupported zone: ${zoneId}`);
      return;
    }

    const activeZoneFeature = this.zoneFeatures.get(zoneId);
    const citySubdivisionConfig = getOwningCitySubdivisionConfigForZoneId(zoneId);
    if (isGrandParisSubzoneSelection) {
      const parentCode = String(activeZoneFeature?.properties.parentCode ?? getGrandParisParentFocus() ?? "");
      if (parentCode && this.grandParisSubzoneCollection) {
        this.applyGlobalParisGrandParisInteraction(this.getGrandParisParentContextRenderCollection(parentCode), parentCode);
      }
    } else if (zoneId.startsWith("paris_") && this.parisZoneCollection && this.grandParisSubzoneCollection) {
      this.applyGlobalParisGrandParisInteraction(this.parisZoneCollection);
    } else if (isMetropolitanSubzoneSelection && citySubdivisionConfig) {
      const parentCode = String(activeZoneFeature?.properties.parentCode ?? "");
      if (parentCode) {
        this.activeMetropolitanParent = { cityId: citySubdivisionConfig.id, parentCode };
        this.applyMetropolitanInteraction(
          citySubdivisionConfig.id,
          this.getMetropolitanParentContextRenderCollection(citySubdivisionConfig.id, parentCode),
          parentCode,
        );
      }
    } else if (citySubdivisionConfig?.metropolitanArea && zoneId.startsWith(citySubdivisionConfig.zoneIdPrefix)) {
      this.activeMetropolitanParent = null;
      const cityOverviewCollection = mergeZoneFeatureCollections([
        this.citySubdivisionCollections.get(citySubdivisionConfig.id),
        this.metropolitanCommuneCollections.get(citySubdivisionConfig.id),
      ]);
      if (cityOverviewCollection.features.length > 0) {
        this.applySelectableZoneCollection(cityOverviewCollection);
      }
    }

    const isGrandParisCommuneSelection = isGrandParisCommuneZoneId(zoneId);
    setGrandParisParentOverviewLayersVisible(
      this.map,
      !isGrandParisCommuneSelection && !isGrandParisSubzoneSelection,
    );

    if (citySubdivisionConfig) {
      this.activeCitySubdivisionId = citySubdivisionConfig.id;
      if (typeof window !== "undefined") {
        (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = citySubdivisionConfig.id;
      }
    }

    this.clearHoverState();
    this.setSelectedState(zoneId);
    setSelectedZonePresentation(this.map, true);
    this.writeDebugState();

    if (isGrandParisSubzoneSelection) {
      setGrandParisDepartmentFocus(null);
      setGrandParisParentFocus(activeZoneFeature?.properties.parentCode ?? getGrandParisParentFocus());
      setGrandParisParentOverviewLayersVisible(this.map, false);
    }

    if (isGrandParisCommuneSelection) {
      setGrandParisActiveOutlineFromSelectedZone(this.map, activeZoneFeature);
    } else if (isGrandParisSubzoneSelection) {
      const parentCode = String(
        activeZoneFeature?.properties.parentCode ?? getGrandParisParentFocus() ?? "",
      );
      const parentFeature = this.grandParisCommuneCollection?.features.find(
        (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") === parentCode,
      ) as SelectedZonePolygonFeature | undefined;
      setGrandParisActiveOutlineFromSelectedZone(this.map, parentFeature);
    } else if (isMetropolitanSubzoneSelection && this.activeMetropolitanParent) {
      const parentFeature = this.metropolitanCommuneCollections
        .get(this.activeMetropolitanParent.cityId)
        ?.features.find(
          (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "")
            === this.activeMetropolitanParent?.parentCode,
        ) as SelectedZonePolygonFeature | undefined;
      setGrandParisActiveOutlineFromSelectedZone(this.map, parentFeature);
    } else {
      clearGrandParisActiveOutlineFromSelectedZone(this.map);
    }

    if (!options.skipCameraMove) {
      await this.flyToZone(zoneId, flyTarget);
    }

    if (this.disposed || selectionToken !== this.activeSelectionToken || this.selectedZoneId !== zoneId) return;
    this.refreshSelectedZoneSelectionPresentation();
    this.writeDebugState();
  }

  async showSaintDenisSubzones(flyTarget?: SelectedZoneFlyTarget) {
    await this.showGrandParisSubzones("93066", flyTarget);
  }

  async showSeineSaintDenisCommunes(flyTarget?: SelectedZoneFlyTarget) {
    return this.showGrandParisDepartmentSubzones(SEINE_SAINT_DENIS_DEPARTMENT_CODE, flyTarget);
  }

  async showGrandParisDepartmentSubzones(departmentCode: string, flyTarget?: SelectedZoneFlyTarget) {
    const normalizedDepartmentCode = String(departmentCode).trim();
    if (!GRAND_PARIS_DEPARTMENT_CODES.has(normalizedDepartmentCode)) return false;

    const selectionToken = ++this.activeSelectionToken;
    setGrandParisParentFocus(null);
    setGrandParisDepartmentFocus(normalizedDepartmentCode);
    this.clearHoverState();
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);

    try {
      const [parisCollection, grandParisSubzones, grandParisCommunes] = await Promise.all([
        this.getParisZoneCollection(),
        this.getGrandParisSubzoneCollection(),
        this.getGrandParisCommuneCollection(),
      ]);
      if (this.disposed || selectionToken !== this.activeSelectionToken) return false;

      this.parisZoneCollection = parisCollection;
      this.grandParisSubzoneCollection = grandParisSubzones;
      this.grandParisCommuneCollection = grandParisCommunes;
      const activeDepartmentSubzones = this.getGrandParisDepartmentSubzoneCollection(normalizedDepartmentCode);
      if (!activeDepartmentSubzones.features.length) {
        clearGrandParisFocus();
        setGrandParisParentOverviewLayersVisible(this.map, true);
        return false;
      }

      const renderCollection = this.getGrandParisDepartmentContextRenderCollection(normalizedDepartmentCode);
      this.applyGlobalParisGrandParisInteraction(
        renderCollection,
        null,
        `grand-paris-department:${normalizedDepartmentCode}`,
      );
      setGrandParisParentOverviewLayersVisible(this.map, false);
      this.writeTerritoryRegistryDebug();
      this.writeDebugState();

      await this.flyToFeatureCollection(
        activeDepartmentSubzones,
        flyTarget ?? this.getGrandParisDepartmentFlyTarget(activeDepartmentSubzones),
      );
      if (
        this.disposed
        || selectionToken !== this.activeSelectionToken
        || getGrandParisDepartmentFocus() !== normalizedDepartmentCode
      ) return false;

      setGrandParisParentOverviewLayersVisible(this.map, false);
      this.setRenderZoneCollection(renderCollection, `grand-paris-department:${normalizedDepartmentCode}`);
      this.writeDebugState();
      return true;
    } catch (error) {
      clearGrandParisFocus();
      setGrandParisParentOverviewLayersVisible(this.map, true);
      console.warn(`[selected-zone-extrusion] Unable to load Grand Paris department ${normalizedDepartmentCode}`, error);
      return false;
    }
  }

  async showGrandParisSubzones(parentCode: string, flyTarget?: SelectedZoneFlyTarget) {
    const normalizedParentCode = String(parentCode);
    const selectionToken = ++this.activeSelectionToken;
    // A commune click is an explicit navigation state: remove the pale overview
    // plate immediately so it cannot cover the dark quartier mosaic while the
    // GeoJSON collection is prepared. The catch path restores it on failure.
    setGrandParisParentOverviewLayersVisible(this.map, false);
    this.clearHoverState();
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);

    try {
      const [parisCollection, grandParisSubzones, grandParisCommunes] = await Promise.all([
        this.getParisZoneCollection(),
        this.getGrandParisSubzoneCollection(),
        this.getGrandParisCommuneCollection(),
      ]);
      if (this.disposed || selectionToken !== this.activeSelectionToken) return false;

      this.parisZoneCollection = parisCollection;
      this.grandParisSubzoneCollection = grandParisSubzones;
      this.grandParisCommuneCollection = grandParisCommunes;
      const activeParentSubzones = this.getGrandParisSubzoneRenderCollection(normalizedParentCode);
      const collection = this.getGrandParisParentContextRenderCollection(normalizedParentCode);
      this.applyGlobalParisGrandParisInteraction(collection, normalizedParentCode);

      if (!activeParentSubzones.features.length) {
        clearGrandParisFocus();
        setGrandParisParentOverviewLayersVisible(this.map, true);
        this.writeDebugState();
        return false;
      }

      setGrandParisDepartmentFocus(null);
      setGrandParisParentFocus(normalizedParentCode);
      setGrandParisParentOverviewLayersVisible(this.map, false);
      const parentFeature = grandParisCommunes.features.find(
        (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") === normalizedParentCode,
      ) as SelectedZonePolygonFeature | undefined;
      setGrandParisActiveOutlineFromSelectedZone(this.map, parentFeature);
      this.writeDebugState();
      const resolvedFlyTarget = getGrandParisFocusedCommuneFlyTarget(this.map, parentFeature) ?? flyTarget;
      // Previous fitBounds/fly operations can leave persistent transform padding.
      // Clear it so "center" means the physical center of the screen for every
      // Grand Paris commune, independently of the path used to reach it.
      this.map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      await this.flyToFeatureCollection(activeParentSubzones, resolvedFlyTarget);
      if (
        this.disposed
        || selectionToken !== this.activeSelectionToken
        || getGrandParisParentFocus() !== normalizedParentCode
      ) return false;

      // Camera settle handlers may temporarily restore the parent overview while
      // the fly crosses its altitude threshold. Reassert the focused collection
      // at landing so the very first click always exposes the commune quartiers.
      setGrandParisParentOverviewLayersVisible(this.map, false);
      this.setGrandParisParentSubzoneRenderCollection(normalizedParentCode);
      this.writeDebugState();
      return true;
    } catch (error) {
      clearGrandParisFocus();
      setGrandParisParentOverviewLayersVisible(this.map, true);
      console.warn(`[selected-zone-extrusion] Unable to load Grand Paris subzones for ${parentCode}`, error);
      return false;
    }
  }

  async showMetropolitanSubzones(
    cityId: CitySubdivisionId,
    parentCode: string,
    flyTarget?: SelectedZoneFlyTarget,
  ) {
    const cityConfig = getCitySubdivisionConfig(cityId);
    if (!cityConfig?.metropolitanArea) return false;

    const normalizedParentCode = String(parentCode);
    const standaloneCityId = getStandaloneCitySubdivisionIdForCommuneCode(normalizedParentCode);
    if (standaloneCityId && standaloneCityId !== cityId) {
      const loaded = await this.showCitySelectableZones(standaloneCityId);
      if (!loaded || this.activeCitySubdivisionId !== standaloneCityId) return false;
      const standaloneCollection = await this.getCityOverviewCollection(standaloneCityId);
      const standaloneFlyTarget = flyTarget
        ?? this.getMetropolitanParentFlyTarget(
          standaloneCollection,
          cityConfig.metropolitanArea.parentCameraMinZoom,
        );
      await this.flyToFeatureCollection(standaloneCollection, standaloneFlyTarget);
      return true;
    }

    const selectionToken = ++this.activeSelectionToken;
    this.activeCitySubdivisionId = cityId;
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = cityId;
    }
    clearGrandParisFocus();
    clearGrandParisActiveOutlineFromSelectedZone(this.map);
    setGrandParisParentOverviewLayersVisible(this.map, true);
    this.clearHoverState();
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);

    try {
      const [cityCollection, communeCollection, subzoneCollection] = await Promise.all([
        this.getCitySubdivisionCollection(cityId),
        this.getMetropolitanCommuneCollection(cityId),
        this.getMetropolitanSubzoneCollection(cityId),
      ]);
      if (this.disposed || selectionToken !== this.activeSelectionToken) return false;

      this.citySubdivisionCollections.set(cityId, cityCollection);
      this.metropolitanCommuneCollections.set(cityId, communeCollection);
      this.metropolitanSubzoneCollections.set(cityId, subzoneCollection);
      const parentFeature = communeCollection.features.find(
        (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") === normalizedParentCode,
      );
      const activeParentSubzones = this.getMetropolitanSubzonesForParent(cityId, normalizedParentCode);
      setGrandParisActiveOutlineFromSelectedZone(this.map, parentFeature as SelectedZonePolygonFeature | undefined);
      const resolvedFlyTarget = flyTarget
        ?? this.getMetropolitanParentFlyTarget(
          activeParentSubzones.features.length > 0
            ? activeParentSubzones
            : parentFeature
              ? createZoneFeatureCollection([parentFeature])
              : EMPTY_ZONE_POLYGONS_COLLECTION,
          cityConfig.metropolitanArea.parentCameraMinZoom,
        );

      if (activeParentSubzones.features.length === 0) {
        this.activeMetropolitanParent = parentFeature
          ? { cityId, parentCode: normalizedParentCode }
          : null;
        const renderCollection = this.getMetropolitanParentContextRenderCollection(cityId, normalizedParentCode);
        this.applyMetropolitanInteraction(cityId, renderCollection, normalizedParentCode);
        if (parentFeature) {
          await this.flyToFeatureCollection(createZoneFeatureCollection([parentFeature]), resolvedFlyTarget);
        }
        this.writeDebugState();
        return Boolean(parentFeature);
      }

      this.activeMetropolitanParent = { cityId, parentCode: normalizedParentCode };
      const renderCollection = this.getMetropolitanParentContextRenderCollection(cityId, normalizedParentCode);
      this.applyMetropolitanInteraction(cityId, renderCollection, normalizedParentCode);
      this.writeDebugState();
      await this.flyToFeatureCollection(activeParentSubzones, resolvedFlyTarget);
      this.writeDebugState();
      return true;
    } catch (error) {
      this.activeMetropolitanParent = null;
      console.warn(`[selected-zone-extrusion] Unable to load ${cityId} metropolitan subzones for ${parentCode}`, error);
      return false;
    }
  }

  async showCitySelectableZones(cityId: CitySubdivisionId) {
    const config = getCitySubdivisionConfig(cityId);
    if (!config) return false;

    const selectionToken = ++this.activeSelectionToken;
    this.activeCitySubdivisionId = cityId;
    this.activeMetropolitanParent = null;
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = cityId;
    }
    clearGrandParisFocus();
    clearGrandParisActiveOutlineFromSelectedZone(this.map);
    setGrandParisParentOverviewLayersVisible(this.map, true);
    this.clearHoverState();
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);

    let loaded = false;
    const loadPromise = this.getCityOverviewCollection(cityId)
      .then((collection) => {
        if (this.disposed || selectionToken !== this.activeSelectionToken) return null;
        const presentation = createCityOverviewNavigationPresentation(cityId, collection);
        this.applyZoneFeatureRegistry(presentation.interactionCollection);
        this.setHitboxZoneCollection(presentation.interactionCollection);
        this.setRenderZoneCollection(presentation.renderCollection, `city-overview:${cityId}`);
        return presentation.interactionCollection;
      });
    this.zonePolygonsPromise = loadPromise
      .then((collection) => {
        loaded = Boolean(collection?.features.length);
      })
      .catch((error) => {
        if (!this.disposed && selectionToken === this.activeSelectionToken) {
          this.applySelectableZoneCollection(EMPTY_ZONE_POLYGONS_COLLECTION);
        }
        console.warn(`[selected-zone-extrusion] Unable to load ${cityId} subdivisions`, error);
      });
    await this.zonePolygonsPromise;
    this.writeDebugState();
    return loaded;
  }

  async preloadCitySelectableZones(cityId: CitySubdivisionId) {
    const config = getCitySubdivisionConfig(cityId);
    if (!config) return false;

    try {
      const collection = await this.getCityOverviewCollection(cityId);
      return Boolean(collection.features.length);
    } catch (error) {
      console.warn(`[selected-zone-extrusion] Unable to preload ${cityId} subdivisions`, error);
      return false;
    }
  }

  async resetToParisSelectableZones() {
    await this.showCitySelectableZones("paris");
  }

  clearCitySelectableZones() {
    this.activeSelectionToken += 1;
    this.activeCitySubdivisionId = null;
    this.activeMetropolitanParent = null;
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = null;
    }
    this.zonePolygonsPromise = Promise.resolve();
    clearGrandParisFocus();
    clearGrandParisActiveOutlineFromSelectedZone(this.map);
    setGrandParisParentOverviewLayersVisible(this.map, true);
    this.clearHoverState();
    this.clearSelectedState();
    this.applySelectableZoneCollection(EMPTY_ZONE_POLYGONS_COLLECTION);
    setSelectedZonePresentation(this.map, false);
    this.writeDebugState();
  }

  clearExtrudedZone() {
    this.activeSelectionToken += 1;
    clearGrandParisFocus();
    setGrandParisParentOverviewLayersVisible(this.map, true);
    this.clearSelectedState();
    setSelectedZonePresentation(this.map, false);
    this.writeDebugState();
  }

  getSelectedExtrudedZone() {
    return this.selectedZoneId;
  }

  getInitialSelectedZoneId(search = typeof window !== "undefined" ? window.location.search : "") {
    return getInitialZoneIdFromSearch(search);
  }

  private bindMapEvents() {
    this.map.on("mousemove", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseMove);
    this.map.on("mouseleave", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseLeave);
    this.map.on("mousedown", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneMouseDown);
    this.map.on("mouseup", this.handleZoneMouseUp);
    this.map.on("dragstart", this.handleZoneDragStart);
    this.map.on("dragend", this.handleZoneMouseUp);
    this.map.on("click", SELECTED_ZONE_HITBOX_LAYER_ID, this.handleZoneClick);
    this.map.on("zoom", this.handleCameraChange);
    this.map.on("pitch", this.handleCameraChange);
    this.map.on("move", this.handleMapMove);
    this.map.on("moveend", this.handleCameraChange);
    this.map.on("moveend", this.handleCameraSettle);
    this.map.on("idle", this.handleCameraSettle);
  }

  private cacheSelectableZoneCollection(url: string, collection: GeoJSON.FeatureCollection, filterFeature?: unknown) {
    if (filterFeature) return;
    for (const config of Object.values(CITY_SUBDIVISION_CONFIGS)) {
      if (url === config.sourceUrl) {
        this.citySubdivisionCollections.set(config.id, collection);
      }
      if (url === config.metropolitanArea?.overviewUrl) {
        this.metropolitanCommuneCollections.set(config.id, collection);
      }
      if (url === config.metropolitanArea?.subzonesUrl) {
        this.metropolitanSubzoneCollections.set(config.id, collection);
      }
    }
    if (url === PARIS_QUARTIERS_URL) {
      this.parisZoneCollection = collection;
    } else if (url === GRAND_PARIS_SUBZONES_URL) {
      this.grandParisSubzoneCollection = collection;
    } else if (url === GRAND_PARIS_COMMUNES_URL) {
      this.grandParisCommuneCollection = collection;
    }
  }

  private async getParisZoneCollection() {
    if (!this.parisZoneCollection) {
      this.parisZoneCollection = await loadSelectableZonePolygons(PARIS_QUARTIERS_URL);
    }
    return this.parisZoneCollection;
  }

  private async getGrandParisSubzoneCollection() {
    if (!this.grandParisSubzoneCollection) {
      this.grandParisSubzoneCollection = await loadSelectableZonePolygons(GRAND_PARIS_SUBZONES_URL);
    }
    return this.grandParisSubzoneCollection;
  }

  private async getGrandParisCommuneCollection() {
    if (!this.grandParisCommuneCollection) {
      this.grandParisCommuneCollection = await loadSelectableZonePolygons(GRAND_PARIS_COMMUNES_URL);
    }
    return this.grandParisCommuneCollection;
  }

  private getGrandParisSubzoneRenderCollection(parentCode: string) {
    const normalizedParentCode = String(parentCode);
    return filterZoneFeatureCollection(
      this.grandParisSubzoneCollection ?? EMPTY_ZONE_POLYGONS_COLLECTION,
      (feature) => String(feature.properties?.parentCode ?? "") === normalizedParentCode,
    );
  }

  private getGrandParisDepartmentSubzoneCollection(departmentCode: string) {
    const normalizedDepartmentCode = String(departmentCode);
    const departmentCommuneCodes = new Set(
      (this.grandParisCommuneCollection?.features ?? [])
        .filter((feature) => String(feature.properties?.departmentCode ?? "") === normalizedDepartmentCode)
        .map((feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? ""))
        .filter(Boolean),
    );

    return filterZoneFeatureCollection(
      this.grandParisSubzoneCollection ?? EMPTY_ZONE_POLYGONS_COLLECTION,
      (feature) => departmentCommuneCodes.has(String(feature.properties?.parentCode ?? "")),
    );
  }

  private createVividGrandParisSubzoneCollection(collection: GeoJSON.FeatureCollection) {
    const usedFocusedColorsByParent = new Map<string, Set<string>>();
    return createZoneFeatureCollection(
      collection.features.map((feature, featureIndex) => {
        const parentCode = String(feature.properties?.parentCode ?? "grand-paris");
        const usedFocusedColors = usedFocusedColorsByParent.get(parentCode) ?? new Set<string>();
        usedFocusedColorsByParent.set(parentCode, usedFocusedColors);
        const rawColorIndex = Number(feature.properties?.colorIndex);
        const stableColorIndex = Number.isFinite(rawColorIndex)
          ? Math.abs(Math.trunc(rawColorIndex))
          : featureIndex;
        const parisColorIndex = GRAND_PARIS_FOCUSED_SUBZONE_COLOR_INDEXES[
          stableColorIndex % GRAND_PARIS_FOCUSED_SUBZONE_COLOR_INDEXES.length
        ];
        const baseColor = getCrepusculeGroundColor({
          label: feature.properties?.label,
          zoneId: feature.properties?.zoneId,
          colorIndex: parisColorIndex,
        });
        let groundColor = baseColor;
        let variation = 0;
        while (usedFocusedColors.has(groundColor.toUpperCase())) {
          variation += 1;
          groundColor = shiftHexColorLightness(baseColor, variation * 6);
        }
        usedFocusedColors.add(groundColor.toUpperCase());

        return withNavigationState(feature, "active", "subdivision", {
          groundColor,
          contextDimmed: false,
          preserveParentOverviewColor: true,
        });
      }),
    );
  }

  private getGrandParisDepartmentContextRenderCollection(departmentCode: string) {
    const normalizedDepartmentCode = String(departmentCode);
    const focusedSubzones = this.createVividGrandParisSubzoneCollection(
      this.getGrandParisDepartmentSubzoneCollection(normalizedDepartmentCode),
    );
    const surroundingGrandParisCommunes = filterZoneFeatureCollection(
      this.grandParisCommuneCollection ?? EMPTY_ZONE_POLYGONS_COLLECTION,
      (feature) => String(feature.properties?.departmentCode ?? "") !== normalizedDepartmentCode,
    );
    const neighborCommunes = createNeighborNavigationCollection(surroundingGrandParisCommunes);
    const dimmedParisContext = createZoneFeatureCollection(
      (this.parisZoneCollection?.features ?? []).map((feature) => (
        withNavigationState(feature, "normal", "subdivision", { contextDimmed: true })
      )),
    );

    return mergeZoneFeatureCollections([
      neighborCommunes,
      dimmedParisContext,
      focusedSubzones,
    ]);
  }

  private getGrandParisDepartmentFlyTarget(
    collection: GeoJSON.FeatureCollection,
  ): SelectedZoneFlyTarget | undefined {
    const bbox = getFeatureCollectionBbox(collection);
    if (!bbox) return undefined;
    const camera = typeof (this.map as any).cameraForBounds === "function"
      ? (this.map as any).cameraForBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          {
            padding: { top: 112, bottom: 148, left: 140, right: 140 },
            maxZoom: 12,
          },
        )
      : null;
    const center: [number, number] = camera?.center
      ? [camera.center.lng ?? camera.center[0], camera.center.lat ?? camera.center[1]]
      : getBboxCenter(bbox);
    const zoom = Number.isFinite(camera?.zoom)
      ? Math.min(12, Math.max(10.85, camera.zoom + 0.12))
      : 11.35;

    return {
      center,
      zoom,
      pitch: 38,
      bearing: 0,
      speed: 0.85,
      curve: 1.35,
    };
  }

  private getGrandParisParentContextRenderCollection(parentCode: string) {
    const normalizedParentCode = String(parentCode);
    const activeParentSubzones = this.getGrandParisSubzoneRenderCollection(normalizedParentCode);
    const surroundingGrandParisCommunes = filterZoneFeatureCollection(
      this.grandParisCommuneCollection ?? EMPTY_ZONE_POLYGONS_COLLECTION,
      (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") !== normalizedParentCode,
    );
    const activeParentFeature = (this.grandParisCommuneCollection?.features ?? []).find(
      (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") === normalizedParentCode,
    );

    // Romainville was the validated prototype. Apply that same presentation to
    // every Grand Paris commune: vivid, distinct subzones over a dimmed context.
    const focusedSubzones = this.createVividGrandParisSubzoneCollection(activeParentSubzones);
    const neighborCommunes = createNeighborNavigationCollection(surroundingGrandParisCommunes);
    const dimmedParisContext = createZoneFeatureCollection(
      (this.parisZoneCollection?.features ?? []).map((feature) => (
        withNavigationState(feature, "normal", "subdivision", {
          contextDimmed: true,
        })
      )),
    );
    const activePresentation = createActiveCommuneNavigationPresentation(
      focusedSubzones,
      activeParentFeature,
      `grand_paris_${normalizedParentCode}`,
    );

    return mergeZoneFeatureCollections([
      neighborCommunes,
      dimmedParisContext,
      activePresentation.renderCollection,
    ]);
  }

  private selectNationalZone(detail: {
    zoneId: string;
    displayName: string;
    communeCode: string;
    communeName: string;
    colorIndex: number;
    groundColor: string;
    runtimeMode?: "single_plate";
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }) {
    const selectionToken = ++this.activeSelectionToken;
    const zoneFeature = normalizeSelectableZoneFeature({
      type: "Feature",
      id: detail.zoneId,
      properties: {
        zoneId: detail.zoneId,
        label: detail.displayName,
        districtCode: detail.zoneId,
        arrondissementCode: detail.communeCode,
        parentCode: detail.communeCode,
        parentLabel: detail.communeName,
        territoryType: "quartier",
        navigationRole: "active",
        navigationSurface: "parent",
        colorIndex: detail.colorIndex,
        groundColor: detail.groundColor,
        runtimeMode: detail.runtimeMode,
      },
      geometry: detail.geometry,
    }, detail.colorIndex);

    this.activeCitySubdivisionId = null;
    this.activeMetropolitanParent = null;
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = null;
    }
    // Clear the previous source feature-state while its registry is still
    // installed. Reusing a cached zone ID later must not resurrect an old
    // active/neighbor/dimmed presentation.
    this.clearHoverState();
    this.clearSelectedState();
    clearGrandParisFocus();
    clearGrandParisActiveOutlineFromSelectedZone(this.map);
    setGrandParisParentOverviewLayersVisible(this.map, true);
    this.applySelectableZoneCollection(createZoneFeatureCollection([zoneFeature]));
    this.setSelectedState(detail.zoneId);
    setSelectedZonePresentation(this.map, true);
    if (selectionToken === this.activeSelectionToken) {
      this.refreshSelectedZoneSelectionPresentation();
      this.writeDebugState();
    }
  }

  private getMetropolitanSubzonesForParent(cityId: CitySubdivisionId, parentCode: string) {
    return filterZoneFeatureCollection(
      this.metropolitanSubzoneCollections.get(cityId) ?? EMPTY_ZONE_POLYGONS_COLLECTION,
      (feature) => String(feature.properties?.parentCode ?? "") === String(parentCode),
    );
  }

  private getMetropolitanParentContextRenderCollection(cityId: CitySubdivisionId, parentCode: string) {
    const activeParentSubzones = this.getMetropolitanSubzonesForParent(cityId, parentCode);
    const communeCollection = this.metropolitanCommuneCollections.get(cityId) ?? EMPTY_ZONE_POLYGONS_COLLECTION;
    const activeParentFeature = communeCollection.features.find(
      (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") === String(parentCode),
    );
    const surroundingCommunes = createNeighborNavigationCollection(filterZoneFeatureCollection(
      communeCollection,
      (feature) => String(feature.properties?.districtCode ?? feature.properties?.code ?? "") !== String(parentCode),
    ));
    const activePresentation = createActiveCommuneNavigationPresentation(
      activeParentSubzones,
      activeParentFeature,
      `metropolitan_${cityId}_${parentCode}`,
    );
    return mergeZoneFeatureCollections([
      surroundingCommunes,
      activePresentation.renderCollection,
    ]);
  }

  private applyMetropolitanInteraction(
    cityId: CitySubdivisionId,
    renderCollection: GeoJSON.FeatureCollection,
    parentCode?: string | null,
  ) {
    const interactionCollection = mergeZoneFeatureCollections([
      this.citySubdivisionCollections.get(cityId),
      this.metropolitanCommuneCollections.get(cityId),
      this.metropolitanSubzoneCollections.get(cityId),
    ]);
    const registryCollection = interactionCollection.features.length > 0 ? interactionCollection : renderCollection;
    this.applyZoneFeatureRegistry(registryCollection);
    this.setHitboxZoneCollection(renderCollection);
    this.setRenderZoneCollection(
      renderCollection,
      parentCode ? `metropolitan-parent:${cityId}:${parentCode}` : `city-overview:${cityId}`,
    );
  }

  private applyZoneFeatureRegistry(collection: GeoJSON.FeatureCollection) {
    this.zoneFeatures.clear();
    for (const feature of collection.features) {
      const zoneId = feature.properties?.zoneId;
      if (zoneId) {
        this.zoneFeatures.set(zoneId, feature as SelectedZonePolygonFeature);
      }
    }
  }

  private setHitboxZoneCollection(collection: GeoJSON.FeatureCollection) {
    const source = this.map.getSource(SELECTED_ZONE_POLYGONS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(collection.features.length > 0 ? collection : EMPTY_ZONE_POLYGONS_COLLECTION);
  }

  private writeRenderZoneCollection(collection: GeoJSON.FeatureCollection) {
    const renderSource = this.map.getSource(SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID) as GeoJSONSource | undefined;
    const labelPointSource = this.map.getSource(SELECTED_ZONE_LABEL_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    const renderCollection = shouldPreserveSelectableZoneRenderGeometry(collection)
      ? collection
      : createRoundedSelectedZoneCollection(collection);
    renderSource?.setData(collection.features.length > 0 ? renderCollection : EMPTY_ZONE_POLYGONS_COLLECTION);
    labelPointSource?.setData(
      collection.features.length > 0
        ? createSelectedZoneLabelPointCollection(collection, this.map.getZoom())
        : EMPTY_ZONE_LABEL_POINTS_COLLECTION,
    );

    if (this.selectedZoneId && this.zoneFeatures.has(this.selectedZoneId)) {
      this.refreshSelectedZoneSelectionPresentation();
    }
  }

  private setRenderZoneCollection(collection: GeoJSON.FeatureCollection, scopeKey?: string) {
    if (scopeKey && this.baseRenderZoneScopeKey === scopeKey && !this.hoverRenderZoneId) return;
    this.baseRenderZoneScopeKey = scopeKey ?? null;
    this.baseRenderZoneCollection = collection;
    this.hoverRenderZoneId = null;
    this.writeRenderZoneCollection(collection);
  }

  private restoreBaseRenderZoneCollection() {
    if (!this.hoverRenderZoneId || !this.baseRenderZoneCollection) return;
    this.hoverRenderZoneId = null;
    this.writeRenderZoneCollection(this.baseRenderZoneCollection);
  }

  private ensureHoveredZoneRendered(zoneId: SelectedZoneId) {
    const baseCollection = this.baseRenderZoneCollection;
    if (!baseCollection) return;

    const baseContainsZone = baseCollection.features.some((feature) => feature.properties?.zoneId === zoneId);
    if (baseContainsZone) {
      this.restoreBaseRenderZoneCollection();
      return;
    }

    if (this.hoverRenderZoneId === zoneId) return;

    const feature = this.zoneFeatures.get(zoneId);
    if (!feature) return;

    const previewCollection = mergeZoneFeatureCollections([
      baseCollection,
      createZoneFeatureCollection([feature]),
    ]);
    this.hoverRenderZoneId = zoneId;
    this.writeRenderZoneCollection(previewCollection);
  }

  private applySelectableZoneCollection(collection: GeoJSON.FeatureCollection) {
    this.applyZoneFeatureRegistry(collection);
    this.setHitboxZoneCollection(collection);
    this.setRenderZoneCollection(collection);
  }

  private applyGlobalParisGrandParisInteraction(
    renderCollection: GeoJSON.FeatureCollection,
    activeParentCode?: string | null,
    renderScopeKey?: string,
  ) {
    const interactionCollection = mergeZoneFeatureCollections([
      this.parisZoneCollection,
      this.grandParisSubzoneCollection,
      this.grandParisCommuneCollection,
    ]);
    const registryCollection = interactionCollection.features.length > 0 ? interactionCollection : renderCollection;
    const hitboxCollection = mergeZoneFeatureCollections([
      renderCollection,
      this.parisZoneCollection,
    ]);

    this.applyZoneFeatureRegistry(registryCollection);
    this.setHitboxZoneCollection(hitboxCollection.features.length > 0 ? hitboxCollection : renderCollection);
    this.setRenderZoneCollection(
      renderCollection,
      renderScopeKey ?? (activeParentCode ? `grand-paris-parent:${activeParentCode}` : "paris"),
    );
  }

  private setGrandParisParentSubzoneRenderCollection(parentCode: string) {
    if (!this.grandParisSubzoneCollection) return;
    const scopeKey = `grand-paris-parent:${parentCode}`;
    // Camera synchronization runs during every move frame. Do not rebuild and
    // recolor the complete Grand Paris render collection while its scope is
    // already active; this is a measurable main-thread/GPU upload regression.
    if (this.baseRenderZoneScopeKey === scopeKey && !this.hoverRenderZoneId) return;
    this.setRenderZoneCollection(
      this.getGrandParisParentContextRenderCollection(parentCode),
      scopeKey,
    );
  }

  private syncGrandParisRenderForCamera() {
    const departmentCode = getGrandParisDepartmentFocus();
    if (departmentCode) {
      // Department navigation is explicit. Camera altitude must never bring the
      // pale commune overview back over its selectable quartier mosaic.
      setGrandParisParentOverviewLayersVisible(this.map, false);
      return;
    }

    const parentCode = (getGrandParisParentFocus()
      ?? (
        this.selectedZoneId && isGrandParisSubzoneZoneId(this.selectedZoneId)
          ? String(this.zoneFeatures.get(this.selectedZoneId)?.properties.parentCode ?? "")
          : ""
      )) || null;
    if (!parentCode) return;

    if (!getGrandParisParentFocus()) {
      setGrandParisParentFocus(parentCode);
    }

    // A focused Grand Paris commune remains a dark, Paris-like subdivision
    // mosaic until an explicit City/country/globe navigation clears the focus.
    // Deriving this from zoom/pitch caused the overview plate to race the fly and
    // intermittently hide Montreuil/93 quartiers after landing.
    setGrandParisParentOverviewLayersVisible(this.map, false);
    this.setGrandParisParentSubzoneRenderCollection(parentCode);
  }

  private writeTerritoryRegistryDebug() {
    if (typeof window === "undefined") return;

    const territories = Array.from(this.zoneFeatures.values())
      .filter((feature) => isSeineSaintDenisCommuneZoneId(feature.properties.zoneId))
      .map(createTerritoryDescriptor);

    if (!territories.length) {
      delete (window as any).__MEEWAV_SEINE_SAINT_DENIS_TERRITORY_REGISTRY__;
      return;
    }

    (window as any).__MEEWAV_SEINE_SAINT_DENIS_TERRITORY_REGISTRY__ = {
      department: {
        id: SEINE_SAINT_DENIS_DEPARTMENT_ZONE_ID,
        type: "department",
        name: "Seine-Saint-Denis",
        parentId: null,
        aliases: ["93", "Seine-Saint-Denis"],
        source: "france-geojson.gregoiredavid.fr + geo.api.gouv.fr",
        sourceYear: "2026",
      },
      territories,
    };
  }

  private setZoneFeatureState(zoneId: SelectedZoneId, state: Record<string, boolean>) {
    for (const sourceId of SELECTED_ZONE_STATE_SOURCE_IDS) {
      if (!this.map.getSource(sourceId)) continue;

      try {
        this.map.setFeatureState({ source: sourceId, id: zoneId }, state);
      } catch {
        // MapLibre can reject transient state writes while sources are refreshing.
      }
    }
  }

  private async replaceSelectableZones(
    url: string,
    selectionToken?: number,
    filterFeature?: (feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) => boolean,
  ) {
    const collection = await loadSelectableZonePolygons(url, filterFeature);
    if (this.disposed || (selectionToken !== undefined && selectionToken !== this.activeSelectionToken)) return null;
    this.cacheSelectableZoneCollection(url, collection, filterFeature);
    this.applySelectableZoneCollection(collection);
    return collection;
  }

  private async loadDatasetForZoneId(zoneId: SelectedZoneId, selectionToken: number) {
    if (this.zoneFeatures.has(zoneId)) return true;
    if (isGrandParisCommuneZoneId(zoneId)) {
      try {
        const collection = await this.replaceSelectableZones(
          GRAND_PARIS_COMMUNES_URL,
          selectionToken,
        );
        if (collection) this.writeTerritoryRegistryDebug();
        return Boolean(collection && this.zoneFeatures.has(zoneId));
      } catch (error) {
        console.warn(`[selected-zone-extrusion] Unable to load Grand Paris commune dataset for ${zoneId}`, error);
        return false;
      }
    }

    const metropolitanCityConfig = getMetropolitanCityConfigForCommuneZoneId(zoneId)
      ?? getMetropolitanCityConfigForSubzoneZoneId(zoneId);
    if (metropolitanCityConfig?.metropolitanArea) {
      try {
        const [cityCollection, communeCollection, subzoneCollection] = await Promise.all([
          this.getCitySubdivisionCollection(metropolitanCityConfig.id),
          this.getMetropolitanCommuneCollection(metropolitanCityConfig.id),
          this.getMetropolitanSubzoneCollection(metropolitanCityConfig.id),
        ]);
        if (this.disposed || selectionToken !== this.activeSelectionToken) return false;

        this.activeCitySubdivisionId = metropolitanCityConfig.id;
        if (typeof window !== "undefined") {
          (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = metropolitanCityConfig.id;
        }
        if (isMetropolitanSubzoneZoneId(zoneId)) {
          const activeFeature = subzoneCollection.features.find((feature) => feature.properties?.zoneId === zoneId);
          const parentCode = String(activeFeature?.properties?.parentCode ?? "");
          if (!parentCode) return false;
          this.activeMetropolitanParent = { cityId: metropolitanCityConfig.id, parentCode };
          this.applyMetropolitanInteraction(
            metropolitanCityConfig.id,
            this.getMetropolitanParentContextRenderCollection(metropolitanCityConfig.id, parentCode),
            parentCode,
          );
        } else {
          this.activeMetropolitanParent = null;
          this.applySelectableZoneCollection(mergeZoneFeatureCollections([cityCollection, communeCollection]));
        }
        return this.zoneFeatures.has(zoneId);
      } catch (error) {
        console.warn(`[selected-zone-extrusion] Unable to load metropolitan dataset for ${zoneId}`, error);
        return false;
      }
    }

    const citySubdivisionConfig = getCitySubdivisionConfigForZoneId(zoneId);
    const url = zoneId.startsWith("saint_denis_")
      ? SAINT_DENIS_SUBZONES_URL
      : zoneId.startsWith("grand_paris_")
        ? GRAND_PARIS_SUBZONES_URL
        : citySubdivisionConfig
          ? citySubdivisionConfig.sourceUrl
          : null;
    if (!url) return false;

    try {
      if (url === GRAND_PARIS_SUBZONES_URL) {
        const [parisCollection, grandParisSubzones, grandParisCommunes] = await Promise.all([
          this.getParisZoneCollection(),
          this.getGrandParisSubzoneCollection(),
          this.getGrandParisCommuneCollection(),
        ]);
        if (this.disposed || selectionToken !== this.activeSelectionToken) return false;
        this.parisZoneCollection = parisCollection;
        this.grandParisSubzoneCollection = grandParisSubzones;
        this.grandParisCommuneCollection = grandParisCommunes;

        const activeFeature = grandParisSubzones.features.find((feature) => feature.properties?.zoneId === zoneId);
        const parentCode = String(activeFeature?.properties?.parentCode ?? "");
        const renderCollection = parentCode
          ? this.getGrandParisParentContextRenderCollection(parentCode)
          : grandParisSubzones;
        this.applyGlobalParisGrandParisInteraction(renderCollection, parentCode);
        return this.zoneFeatures.has(zoneId);
      }

      const collection = await this.replaceSelectableZones(url, selectionToken);
      if (collection && citySubdivisionConfig) {
        this.activeCitySubdivisionId = citySubdivisionConfig.id;
        if (typeof window !== "undefined") {
          (window as any).__MEEWAV_ACTIVE_CITY_SUBDIVISION_ID__ = citySubdivisionConfig.id;
        }
      }
      return Boolean(collection && this.zoneFeatures.has(zoneId));
    } catch (error) {
      console.warn(`[selected-zone-extrusion] Unable to load dataset for ${zoneId}`, error);
      return false;
    }
  }

  private async loadZonePolygons(url: string, selectionToken: number) {
    try {
      const collection = await loadSelectableZonePolygons(url);
      if (this.disposed || selectionToken !== this.activeSelectionToken) return;
      this.cacheSelectableZoneCollection(url, collection);
      this.applySelectableZoneCollection(collection);
    } catch (error) {
      console.warn("[selected-zone-extrusion] Unable to load selectable zones", error);
    }
  }

  private async flyToFeatureCollection(collection: GeoJSON.FeatureCollection, flyTarget?: SelectedZoneFlyTarget) {
    const bboxes = collection.features
      .map((feature) => feature.geometry ? getGeometryBbox(feature.geometry) : null)
      .filter((bbox): bbox is LngLatBoundsArray => Boolean(bbox));
    if (!bboxes.length) return;

    const bbox = bboxes.reduce(
      (acc, item) => [
        Math.min(acc[0], item[0]),
        Math.min(acc[1], item[1]),
        Math.max(acc[2], item[2]),
        Math.max(acc[3], item[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    ) as LngLatBoundsArray;

    let center: [number, number] = flyTarget?.center ? [flyTarget.center[0], flyTarget.center[1]] : getBboxCenter(bbox);
    let zoom = flyTarget?.zoom ?? 13.95;
    const pitch = clampToMapLibreStandardPitch(flyTarget?.pitch ?? SELECTABLE_ZONE_OVERVIEW_PITCH);
    const bearing = flyTarget?.bearing ?? 0;

    if (!flyTarget && typeof (this.map as any).cameraForBounds === "function") {
      const camera = (this.map as any).cameraForBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        {
          padding: { top: 104, bottom: 136, left: 128, right: 128 },
          maxZoom: 14.65,
        },
      );
      if (camera?.center) {
        center = [camera.center.lng ?? camera.center[0] ?? center[0], camera.center.lat ?? camera.center[1] ?? center[1]];
      }
      if (Number.isFinite(camera?.zoom)) {
        zoom = Math.min(14.65, Math.max(13.25, camera.zoom + 0.25));
      }
    }

    const flyToken = ++this.activeFlyToken;
    this.isZoneFlyActive = true;
    try {
      this.map.stop();
      this.map.flyTo({
        center,
        zoom,
        pitch,
        bearing,
        speed: flyTarget?.speed ?? 0.85,
        curve: flyTarget?.curve ?? 1.35,
        essential: true,
      });
      await waitForMapEvent(this.map, "moveend", 9000);
    } finally {
      if (this.activeFlyToken === flyToken) {
        this.isZoneFlyActive = false;
      }
    }
  }

  private handleZoneMouseMove = (event: { features?: MapGeoJSONFeature[]; point?: { x: number; y: number } }) => {
    if (this.map.getZoom() < SELECTED_ZONE_HOVER_MIN_ZOOM) {
      this.clearHoverState();
      this.map.getCanvas().style.cursor = "";
      return;
    }

    const point = event.point ? { x: event.point.x, y: event.point.y } : null;
    if (this.isZonePointerDown && point && this.zonePointerDownPoint) {
      const moved = Math.hypot(point.x - this.zonePointerDownPoint.x, point.y - this.zonePointerDownPoint.y);
      if (moved > SELECTED_ZONE_DRAG_SUPPRESS_PIXELS) {
        this.markZoneGestureAsDrag();
        return;
      }
    }

    if (this.isZoneDragGesture) {
      this.clearHoverState();
      this.map.getCanvas().style.cursor = "grabbing";
      return;
    }

    const feature = event.features?.[0];
    const zoneId = feature?.properties?.zoneId as string | undefined;
    if (!feature || !zoneId || !this.zoneFeatures.has(zoneId)) return;

    if (zoneId === this.selectedZoneId) {
      this.clearHoverState();
      this.setPointerCursorLock(true);
      this.map.getCanvas().style.cursor = this.isZonePointerDown ? "grabbing" : "pointer";
      return;
    }

    if (point) {
      this.hoverCardScreenPoint = point;
    }

    if (this.hoveredZoneId !== zoneId) {
      this.clearHoverState();
      this.hoveredZoneId = zoneId;
      this.ensureHoveredZoneRendered(zoneId);
      this.setZoneFeatureState(zoneId, { hover: true });
      this.showHoverCard(zoneId, point ?? undefined);
      this.writeDebugState();
    } else if (point) {
      this.hoverCard.move(point);
    }

    this.setPointerCursorLock(true);
    this.map.getCanvas().style.cursor = this.isZonePointerDown ? "grabbing" : "pointer";
  };

  private handleHoverPointerMove = (event: PointerEvent) => {
    if (!this.hoveredZoneId || this.isZonePointerDown || this.isZoneDragGesture) return;

    this.pendingHoverPointerPoint = {
      x: event.offsetX,
      y: event.offsetY,
    };
    if (this.hoverPointerFrameId !== null) return;

    this.hoverPointerFrameId = window.requestAnimationFrame(() => {
      this.hoverPointerFrameId = null;
      const point = this.pendingHoverPointerPoint;
      this.pendingHoverPointerPoint = null;
      if (!point || !this.hoveredZoneId || this.isZonePointerDown || this.isZoneDragGesture) return;

      this.hoverCardScreenPoint = point;
      this.hoverCard.move(point);
    });
  };

  private handleNationalZoneSelected = (event: Event) => {
    const detail = (event as CustomEvent<{
      legacyZoneId?: unknown;
      zoneId?: unknown;
      displayName?: unknown;
      communeCode?: unknown;
      communeName?: unknown;
      colorIndex?: unknown;
      groundColor?: unknown;
      runtimeMode?: unknown;
      geometry?: unknown;
    }>).detail;
    const legacyZoneId = typeof detail?.legacyZoneId === "string" ? detail.legacyZoneId : "";
    if (legacyZoneId) {
      void this.selectExtrudedZone(legacyZoneId);
      return;
    }

    const zoneId = typeof detail?.zoneId === "string" ? detail.zoneId : "";
    const geometry = detail?.geometry as GeoJSON.Geometry | undefined;
    if (!zoneId || (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon")) return;
    this.selectNationalZone({
      zoneId,
      displayName: typeof detail.displayName === "string" ? detail.displayName : zoneId,
      communeCode: typeof detail.communeCode === "string" ? detail.communeCode : "",
      communeName: typeof detail.communeName === "string" ? detail.communeName : "",
      colorIndex: Number.isFinite(Number(detail.colorIndex)) ? Number(detail.colorIndex) : 0,
      groundColor: typeof detail.groundColor === "string" ? detail.groundColor : "#43277B",
      runtimeMode: detail.runtimeMode === "single_plate" ? "single_plate" : undefined,
      geometry,
    });
  };

  private handleZoneMouseLeave = () => {
    this.clearHoverState();
    this.map.getCanvas().style.cursor = this.isZonePointerDown ? "grabbing" : "";
    this.writeDebugState();
  };

  private handleZoneMouseDown = (event: { point?: { x: number; y: number } }) => {
    this.isZonePointerDown = true;
    this.isZoneDragGesture = false;
    this.zonePointerDownPoint = event.point ? { x: event.point.x, y: event.point.y } : null;
    this.suppressNextZoneClick = false;
    this.map.getCanvas().style.cursor = "grabbing";
  };

  private handleZoneDragStart = () => {
    if (!this.isZonePointerDown) return;
    this.markZoneGestureAsDrag();
  };

  private handleZoneMouseUp = () => {
    const wasDragGesture = this.isZoneDragGesture || this.suppressNextZoneClick;
    this.isZonePointerDown = false;
    this.zonePointerDownPoint = null;
    this.map.getCanvas().style.cursor = this.hoveredZoneId ? "pointer" : "";
    if (wasDragGesture) {
      this.lastZoneDragEndAt = getNowMs();
    }
    if (wasDragGesture && typeof window !== "undefined") {
      window.setTimeout(() => {
        this.suppressNextZoneClick = false;
        this.isZoneDragGesture = false;
      }, SELECTED_ZONE_DRAG_SUPPRESS_CLICK_MS);
    } else {
      this.suppressNextZoneClick = false;
      this.isZoneDragGesture = false;
    }
  };

  private markZoneGestureAsDrag() {
    this.isZoneDragGesture = true;
    this.suppressNextZoneClick = true;
    this.clearHoverState();
    this.map.getCanvas().style.cursor = "grabbing";
  }

  private handleZoneClick = (event: {
    features?: MapGeoJSONFeature[];
    point?: { x: number; y: number };
    preventDefault?: () => void;
    originalEvent?: Event;
  }) => {
    const now = getNowMs();
    if (
      this.suppressNextZoneClick
      || this.isZoneDragGesture
      || now - this.lastZoneDragEndAt < SELECTED_ZONE_DRAG_SUPPRESS_CLICK_MS
    ) {
      this.suppressNextZoneClick = false;
      this.isZoneDragGesture = false;
      return;
    }

    const feature = event.features?.[0];
    const zoneId = feature?.properties?.zoneId as string | undefined;
    if (!feature || !zoneId || !this.zoneFeatures.has(zoneId)) return;

    event.preventDefault?.();
    event.originalEvent?.preventDefault();
    this.clearHoverState();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("meewav:selected-zone-navigation-start", {
        detail: { zoneId },
      }));
    }
    if (isGrandParisCommuneZoneId(zoneId)) {
      const communeCode = String(
        feature.properties?.districtCode
        ?? zoneId.replace("grand_paris_commune_", ""),
      );
      if (communeCode) {
        void this.showGrandParisSubzones(communeCode);
      }
      return;
    }
    if (isMetropolitanCommuneZoneId(zoneId)) {
      const cityConfig = getMetropolitanCityConfigForCommuneZoneId(zoneId);
      const communeCode = String(
        feature.properties?.districtCode
        ?? zoneId.replace(cityConfig?.metropolitanArea?.communeZoneIdPrefix ?? "", ""),
      );
      if (cityConfig && communeCode) {
        void this.showMetropolitanSubzones(cityConfig.id, communeCode);
      }
      return;
    }
    if (zoneId === this.selectedZoneId) {
      this.writeDebugState();
      return;
    }
    void this.selectExtrudedZone(zoneId);
  };

  private handleCameraChange = () => {
    this.updateHoverCardPosition();
    if (isMapUserNavigationActive()) return;
    this.syncGrandParisRenderForCamera();
    this.refreshSelectedZoneSelectionPresentation(false);
  };

  private handleMapMove = () => {
    this.selectionPresentationSettlePassesRemaining = 2;
    this.updateHoverCardPosition();
  };

  private handleCameraSettle = () => {
    if (this.shouldRestoreParisOverviewAfterZoomOut()) {
      // A manual zoom-out is a natural exit from the focused commune/quartier
      // state. Restore the overview in place: no fly, no recenter, no stale
      // dimmed feature-state left on Paris or the surrounding communes.
      void this.showCitySelectableZones("paris");
      return;
    }
    this.syncGrandParisRenderForCamera();
    if (this.selectionPresentationSettlePassesRemaining > 0) {
      this.selectionPresentationSettlePassesRemaining -= 1;
      this.refreshSelectedZoneSelectionPresentation(false);
    }
  };

  private shouldRestoreParisOverviewAfterZoomOut() {
    if (this.isZoneFlyActive || this.activeCitySubdivisionId !== "paris") return false;

    // Grand Paris drill-down is an explicit navigation mode. It is left through
    // the City/country/globe controls, never as a side effect of a camera settle.
    // This keeps the visible palette and the clickable source in sync.
    if (getGrandParisDepartmentFocus() || getGrandParisParentFocus()) return false;

    const hasParisOrGrandParisSelection = Boolean(
      this.selectedZoneId
      && (this.selectedZoneId.startsWith("paris_") || isGrandParisZoneId(this.selectedZoneId)),
    );
    if (!hasParisOrGrandParisSelection) return false;

    return this.map.getZoom() < GRAND_PARIS_PARENT_OVERVIEW_RETURN_MIN_ZOOM;
  }

  private getMetropolitanParentFlyTarget(
    collection: GeoJSON.FeatureCollection,
    minimumZoom = 13.9,
  ): SelectedZoneFlyTarget | undefined {
    const bboxes = collection.features
      .map((feature) => feature.geometry ? getGeometryBbox(feature.geometry) : null)
      .filter((bbox): bbox is LngLatBoundsArray => Boolean(bbox));
    if (!bboxes.length) return undefined;

    const bbox = bboxes.reduce(
      (acc, item) => [
        Math.min(acc[0], item[0]),
        Math.min(acc[1], item[1]),
        Math.max(acc[2], item[2]),
        Math.max(acc[3], item[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    ) as LngLatBoundsArray;
    const camera = typeof (this.map as any).cameraForBounds === "function"
      ? (this.map as any).cameraForBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          {
            padding: { top: 56, bottom: 78, left: 72, right: 72 },
            maxZoom: GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM,
          },
        )
      : null;
    const center: [number, number] = camera?.center
      ? [camera.center.lng ?? camera.center[0], camera.center.lat ?? camera.center[1]]
      : getBboxCenter(bbox);
    const zoom = Number.isFinite(camera?.zoom)
      ? Math.min(GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM, Math.max(minimumZoom, camera.zoom + 0.18))
      : Math.min(GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM, Math.max(minimumZoom, this.map.getZoom()));

    return {
      center,
      zoom,
      pitch: SELECTABLE_ZONE_OVERVIEW_PITCH,
      bearing: this.map.getBearing(),
      speed: 0.85,
      curve: 1.24,
    };
  }

  private async getCitySubdivisionCollection(cityId: CitySubdivisionId) {
    const cached = this.citySubdivisionCollections.get(cityId);
    if (cached) return cached;
    const config = CITY_SUBDIVISION_CONFIGS[cityId];
    const collection = await loadSelectableZonePolygons(config.sourceUrl);
    this.cacheSelectableZoneCollection(config.sourceUrl, collection);
    return collection;
  }

  private async getMetropolitanCommuneCollection(cityId: CitySubdivisionId) {
    const cached = this.metropolitanCommuneCollections.get(cityId);
    if (cached) return cached;
    const config = CITY_SUBDIVISION_CONFIGS[cityId].metropolitanArea;
    if (!config) return EMPTY_ZONE_POLYGONS_COLLECTION;
    const collection = await loadSelectableZonePolygons(config.overviewUrl);
    this.cacheSelectableZoneCollection(config.overviewUrl, collection);
    return collection;
  }

  private async getMetropolitanSubzoneCollection(cityId: CitySubdivisionId) {
    const cached = this.metropolitanSubzoneCollections.get(cityId);
    if (cached) return cached;
    const config = CITY_SUBDIVISION_CONFIGS[cityId].metropolitanArea;
    if (!config) return EMPTY_ZONE_POLYGONS_COLLECTION;
    const collection = await loadSelectableZonePolygons(config.subzonesUrl);
    this.cacheSelectableZoneCollection(config.subzonesUrl, collection);
    return collection;
  }

  private getCommuneNavigationContextCityIds(
    cityId: CitySubdivisionId,
    activeCollection: GeoJSON.FeatureCollection,
  ) {
    const config = CITY_SUBDIVISION_CONFIGS[cityId];
    if (cityId === "paris" || config.metropolitanArea) return [];
    const bbox = getFeatureCollectionBbox(activeCollection);
    if (!bbox) return [];
    const activeCenter = getBboxCenter(bbox);
    const preset = CITY_CAMERA_PRESETS[cityId];
    const canvas = this.map.getCanvas();
    const viewportWidth = canvas.clientWidth || canvas.width || 1280;

    return selectCommuneNavigationContextCandidates({
      activeId: cityId,
      activeCenter,
      activeBounds: bbox,
      zoom: preset?.zoom ?? this.map.getZoom(),
      viewportWidth,
      candidates: COMMUNE_NAVIGATION_CONTEXT_CANDIDATES,
    })
      .map((candidate) => getCitySubdivisionConfig(candidate.id)?.id)
      .filter((candidateId): candidateId is CitySubdivisionId => Boolean(candidateId));
  }

  private getCommuneNavigationParentFeature(
    cityId: CitySubdivisionId,
    knownCollection?: GeoJSON.FeatureCollection,
  ) {
    const cachedPromise = this.communeNavigationParentPromises.get(cityId);
    if (cachedPromise) return cachedPromise;
    const collectionPromise = knownCollection
      ? Promise.resolve(knownCollection)
      : this.getCitySubdivisionCollection(cityId);
    const parentPromise = collectionPromise
      .then((collection) => createCommuneNavigationParentFeature(cityId, collection))
      .catch((error) => {
        this.communeNavigationParentPromises.delete(cityId);
        throw error;
      });
    this.communeNavigationParentPromises.set(cityId, parentPromise);
    return parentPromise;
  }

  private async getCityOverviewCollection(cityId: CitySubdivisionId) {
    const cachedPromise = this.cityOverviewCollectionPromises.get(cityId);
    if (cachedPromise) return cachedPromise;

    const config = CITY_SUBDIVISION_CONFIGS[cityId];
    const loadPromise = this.getCitySubdivisionCollection(cityId)
      .then(async (cityCollection) => {
        const communeCollection = config.metropolitanArea
          ? await this.getMetropolitanCommuneCollection(cityId)
          : EMPTY_ZONE_POLYGONS_COLLECTION;
        if (config.metropolitanArea || cityId === "paris") {
          return mergeZoneFeatureCollections([cityCollection, communeCollection]);
        }

        const contextCityIds = this.getCommuneNavigationContextCityIds(cityId, cityCollection);
        const [activeParent, contextParents] = await Promise.all([
          this.getCommuneNavigationParentFeature(cityId, cityCollection),
          mapWithConcurrency(
            contextCityIds,
            COMMUNE_NAVIGATION_CONTEXT_CONCURRENCY,
            (contextCityId) => this.getCommuneNavigationParentFeature(contextCityId)
              .catch((error) => {
                console.warn(
                  `[selected-zone-extrusion] Unable to build navigation context for ${contextCityId}`,
                  error,
                );
                return null;
              }),
          ),
        ]);

        return mergeZoneFeatureCollections([
          cityCollection,
          activeParent ? createZoneFeatureCollection([activeParent]) : null,
          createZoneFeatureCollection(contextParents.filter(
            (feature): feature is SelectedZonePolygonFeature => Boolean(feature),
          )),
        ]);
      })
      .catch((error) => {
        this.cityOverviewCollectionPromises.delete(cityId);
        throw error;
      });
    this.cityOverviewCollectionPromises.set(cityId, loadPromise);
    return loadPromise;
  }

  private restoreDefaultCameraLimits() {
    try {
      if (Math.abs(this.map.getMaxPitch() - this.defaultMaxPitch) >= 0.15) {
        this.map.setMaxPitch(this.defaultMaxPitch);
      }
      if (Math.abs(this.map.getMaxZoom() - this.defaultMaxZoom) >= 0.01) {
        this.map.setMaxZoom(this.defaultMaxZoom);
      }
    } catch {
      // Teardown/style swaps can race with MapLibre camera state.
    }
  }

  private getZoneHoverPoint(zoneId: SelectedZoneId): HoverCardPoint | null {
    const feature = this.zoneFeatures.get(zoneId);
    if (!feature) return null;
    const center = getSelectedZoneLabelLngLat(feature) ?? getGeometryInteriorCenter(feature.geometry);
    return this.map.project(center);
  }

  private showHoverCard(zoneId: SelectedZoneId, pointOverride?: HoverCardPoint) {
    const zone = this.zoneFeatures.get(zoneId);
    const point = pointOverride ?? this.getZoneHoverPoint(zoneId);
    if (!zone || !point) {
      this.hoverCard.hide();
      return;
    }
    this.hoverCardScreenPoint = pointOverride ?? null;
      this.hoverCard.show(zone.properties.label, zone.properties.hoverCountLabel, point, zone.properties.zoneId);
  }

  private updateHoverCardPosition() {
    if (!this.hoveredZoneId) return;
    if (this.hoverCardScreenPoint) {
      this.hoverCard.move(this.hoverCardScreenPoint);
      return;
    }
    const point = this.getZoneHoverPoint(this.hoveredZoneId);
    if (point) this.hoverCard.move(point);
  }

  private clearHoverState() {
    this.setPointerCursorLock(false);
    this.cancelHoverPointerTracking();
    this.hoverCard.hide();
    this.hoverCardScreenPoint = null;
    if (!this.hoveredZoneId) return;
    const hoveredZoneId = this.hoveredZoneId;
    this.setZoneFeatureState(
      hoveredZoneId,
      hoveredZoneId === this.selectedZoneId
        ? { hover: false, selected: true, dimmed: false }
        : { hover: false },
    );
    this.hoveredZoneId = null;
    this.restoreBaseRenderZoneCollection();
  }

  private setPointerCursorLock(active: boolean) {
    const canvas = this.map.getCanvas();
    if (active) {
      canvas.setAttribute(SELECTED_ZONE_CURSOR_LOCK_ATTRIBUTE, "true");
    } else {
      canvas.removeAttribute(SELECTED_ZONE_CURSOR_LOCK_ATTRIBUTE);
    }
  }

  private cancelHoverPointerTracking() {
    this.pendingHoverPointerPoint = null;
    if (this.hoverPointerFrameId === null) return;
    window.cancelAnimationFrame(this.hoverPointerFrameId);
    this.hoverPointerFrameId = null;
  }

  private setDimmedState(activeZoneId: SelectedZoneId | null) {
    for (const zoneId of this.zoneFeatures.keys()) {
      this.setZoneFeatureState(zoneId, { dimmed: Boolean(activeZoneId && zoneId !== activeZoneId) });
    }
  }

  private clearSelectedState() {
    if (this.selectedZoneId) {
      this.setZoneFeatureState(this.selectedZoneId, { selected: false });
    }
    this.selectedZoneId = null;
    this.setDimmedState(null);
  }

  private setSelectedState(zoneId: SelectedZoneId) {
    if (this.selectedZoneId && this.selectedZoneId !== zoneId) {
      this.setZoneFeatureState(this.selectedZoneId, { selected: false });
    }
    this.selectedZoneId = zoneId;
    this.setDimmedState(zoneId);
    this.setZoneFeatureState(zoneId, { selected: true, dimmed: false });
  }

  private refreshSelectedZoneSelectionPresentation(refreshDimmedStates = true) {
    if (!this.selectedZoneId || !this.zoneFeatures.has(this.selectedZoneId)) return;
    if (refreshDimmedStates) {
      this.setDimmedState(this.selectedZoneId);
    }
    this.setZoneFeatureState(this.selectedZoneId, { selected: true, dimmed: false });
  }

  private async flyToZone(zoneId: SelectedZoneId, flyTarget?: SelectedZoneFlyTarget) {
    const feature = this.zoneFeatures.get(zoneId);
    if (!feature) {
      await waitForMapEvent(this.map, "idle", 600);
    }

    let center: [number, number] = flyTarget
      ? [flyTarget.center[0], flyTarget.center[1]]
      : [2.3505, 48.8845];
    let zoom = flyTarget?.zoom ?? SELECTED_ZONE_LANDING_ZOOM;
    const metropolitanCameraConfig = getMetropolitanCityConfigForSubzoneZoneId(zoneId)?.metropolitanArea;
    const zoneCameraLimit = isGrandParisZoneId(zoneId) || isMetropolitanSubzoneZoneId(zoneId)
      ? {
        minZoom: metropolitanCameraConfig?.subzoneCameraMinZoom,
        maxPitch: MAPLIBRE_ABSOLUTE_MAX_PITCH,
        maxZoom: Math.min(this.defaultMaxZoom, GRAND_PARIS_COMMUNE_CAMERA_MAX_ZOOM),
      }
      : null;
    let pitch = clampToMapLibreStandardPitch(
      Math.max(flyTarget?.pitch ?? SELECTED_ZONE_LANDING_PITCH, SELECTED_ZONE_LANDING_PITCH),
    );
    let bearing = flyTarget?.bearing ?? 0;

    const zoneFeature = this.zoneFeatures.get(zoneId);
    const bbox = zoneFeature && !flyTarget ? getGeometryBbox(zoneFeature.geometry) : null;
    if (!flyTarget && bbox) {
      center = getBboxCenter(bbox);
    }

    const canvas = this.map.getCanvas();
    const viewportWidth = Math.max(canvas.clientWidth || window.innerWidth || 1, 1);
    const viewportHeight = Math.max(canvas.clientHeight || window.innerHeight || 1, 1);
    const optimizedFlyPlan = !flyTarget && zoneFeature && bbox
      ? computeOptimizedDistrictFlyPlan({
        districtGeometry: zoneFeature.geometry,
        bbox,
        viewportWidth,
        viewportHeight,
        currentBearing: this.map.getBearing(),
        targetPitch: pitch,
        zoneCameraLimit,
      })
      : null;
    if (optimizedFlyPlan) {
      center = optimizedFlyPlan.center;
      zoom = optimizedFlyPlan.zoom;
      bearing = optimizedFlyPlan.bearing;
      pitch = optimizedFlyPlan.pitch;

      const planLog = {
        districtId: zoneId,
        shapeAspect: optimizedFlyPlan.shapeAspect,
        principalAxisDeg: optimizedFlyPlan.principalAxisDeg,
        targetBearing: Number(optimizedFlyPlan.targetBearing.toFixed(1)),
        targetZoom: Number(optimizedFlyPlan.zoom.toFixed(2)),
        center,
        pitch: Number(optimizedFlyPlan.pitch.toFixed(1)),
        coverMode: optimizedFlyPlan.coverMode,
        overflowRatio: optimizedFlyPlan.overflowRatio,
        viewportAspect: optimizedFlyPlan.viewportAspect,
        reason: optimizedFlyPlan.reason,
      };
      if (typeof window !== "undefined") {
        (window as any).__MEEWAV_LAST_DISTRICT_FLY_CAMERA_PLAN__ = planLog;
      }
      if (typeof window !== "undefined" && (window as any).__MEEWAV_CAMERA_DEBUG__ === true) {
        console.warn("[MEEWAV_DISTRICT_FLY_CAMERA_PLAN]", planLog);
      }
    } else if (!flyTarget && bbox && typeof (this.map as any).cameraForBounds === "function") {
      const camera = (this.map as any).cameraForBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        {
          padding: { top: 84, bottom: 118, left: 96, right: 96 },
          maxZoom: SELECTED_ZONE_LANDING_ZOOM,
        },
      );
      if (camera?.center) {
        center[0] = camera.center.lng ?? camera.center[0] ?? center[0];
        center[1] = camera.center.lat ?? camera.center[1] ?? center[1];
      }
      zoom = SELECTED_ZONE_LANDING_ZOOM;
    }
    if (!flyTarget && zoneFeature) {
      const currentZoom = this.map.getZoom();
      if (zoom <= currentZoom + 0.05) {
        const forwardZoom = currentZoom < SELECTED_ZONE_LANDING_ZOOM
          ? Math.max(SELECTED_ZONE_LANDING_ZOOM, currentZoom + SELECTED_ZONE_FORWARD_FLY_MIN_DELTA)
          : currentZoom;
        zoom = Math.min(
          forwardZoom,
          zoneCameraLimit?.maxZoom ?? this.defaultMaxZoom,
        );

        if (typeof window !== "undefined") {
          const lastPlan = (window as any).__MEEWAV_LAST_DISTRICT_FLY_CAMERA_PLAN__;
          if (lastPlan?.districtId === zoneId) {
            lastPlan.targetZoom = Number(zoom.toFixed(2));
            lastPlan.preventedReverseFly = true;
          }
        }
      }
    }
    if (
      zoneFeature
      && isGrandParisSubzoneZoneId(zoneId)
      && !isPointInsidePolygonGeometry(center, zoneFeature.geometry)
    ) {
      center = getGeometryInteriorCenter(zoneFeature.geometry);
    }
    // Every entry path (click, search, deep-link or programmatic target) must land
    // where the exhaustive avatar source is available. Explicit fly targets may
    // customize the camera, but must not silently reopen the old cluster-only view.
    if (zoneFeature) {
      zoom = Math.max(zoom, AVATAR_VISIBLE_MIN_ZOOM + 0.05);
    }
    if (zoneCameraLimit) {
      zoom = Math.min(zoom, zoneCameraLimit.maxZoom);
      pitch = Math.min(pitch, zoneCameraLimit.maxPitch);
    }
    const flyToken = ++this.activeFlyToken;
    this.isZoneFlyActive = true;
    try {
      this.map.stop();
      if (isGrandParisZoneId(zoneId)) {
        this.map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<SelectedZoneAvatarPreflightDetail>(
          SELECTED_ZONE_AVATAR_PREFLIGHT_EVENT,
          {
            detail: {
              selectedZoneId: zoneId,
              selectedZoneLabel: typeof zoneFeature?.properties.label === "string"
                ? zoneFeature.properties.label
                : null,
            },
          },
        ));
      }
      this.map.flyTo({
        center,
        zoom,
        pitch,
        bearing,
        ...(flyTarget
          ? {
            speed: flyTarget.speed ?? 0.85,
            curve: flyTarget.curve ?? 1.35,
          }
          : {
            speed: 0.9,
            curve: 1.42,
          }),
        essential: true,
      });
      await waitForMapEvent(this.map, "moveend", 9000);
      this.refreshSelectedZoneSelectionPresentation();
    } finally {
      if (this.activeFlyToken === flyToken) {
        this.isZoneFlyActive = false;
      }
    }
  }

  private writeDebugState() {
    if (typeof window === "undefined") return;
    const zone = this.selectedZoneId ? this.zoneFeatures.get(this.selectedZoneId) : null;
    const debug: SelectedZoneExtrusionDebugState = {
      selectedZoneId: this.selectedZoneId,
      selectedZoneLabel: zone?.properties.label ?? null,
      runtimeMode: zone?.properties.runtimeMode === "single_plate" ? "single_plate" : null,
      hoveredZoneId: this.hoveredZoneId,
      zoneSourceId: SELECTED_ZONE_POLYGONS_SOURCE_ID,
      grandParisParentFocus: getGrandParisParentFocus(),
      avatarsExpected: 0,
      updatedAt: Date.now(),
    };
    (window as any).__MEEWAV_SELECTED_ZONE_EXTRUSION__ = debug;
    window.dispatchEvent(new CustomEvent("meewav:selected-zone-extrusion-change", {
      detail: debug,
    }));
  }
}

export function installSelectedZoneExtrusionController(map: MapLibreMap): () => void {
  activeController?.cleanup();
  const controller = new SelectedZoneExtrusionController(map);
  activeController = controller;
  controller.install();

  if (typeof window !== "undefined") {
    (window as any).selectExtrudedZone = (
      zoneId: SelectedZoneId,
      flyTarget?: SelectedZoneFlyTarget,
      options?: SelectedZoneSelectionOptions,
    ) => selectExtrudedZone(zoneId, flyTarget, options);
    (window as any).clearExtrudedZone = () => clearExtrudedZone();
    (window as any).getSelectedExtrudedZone = () => getSelectedExtrudedZone();
    (window as any).showSaintDenisSubzones = (flyTarget?: SelectedZoneFlyTarget) => showSaintDenisSubzones(flyTarget);
    (window as any).showSeineSaintDenisCommunes = (flyTarget?: SelectedZoneFlyTarget) => showSeineSaintDenisCommunes(flyTarget);
    (window as any).showGrandParisDepartmentSubzones = (departmentCode: string, flyTarget?: SelectedZoneFlyTarget) => showGrandParisDepartmentSubzones(departmentCode, flyTarget);
    (window as any).showGrandParisSubzones = (parentCode: string, flyTarget?: SelectedZoneFlyTarget) => showGrandParisSubzones(parentCode, flyTarget);
    (window as any).preloadCitySubdivisions = (cityId: CitySubdivisionId) => preloadCitySubdivisions(cityId);
    (window as any).showCitySubdivisions = (cityId: CitySubdivisionId) => showCitySubdivisions(cityId);
    (window as any).clearCitySubdivisions = () => clearCitySubdivisions();
    (window as any).resetSelectedZonesToParis = () => resetSelectedZonesToParis();
  }

  return () => {
    if (activeController === controller) {
      activeController = null;
    }
    controller.cleanup();
    if (typeof window !== "undefined") {
      delete (window as any).selectExtrudedZone;
      delete (window as any).clearExtrudedZone;
      delete (window as any).getSelectedExtrudedZone;
      delete (window as any).showSaintDenisSubzones;
      delete (window as any).showSeineSaintDenisCommunes;
      delete (window as any).showGrandParisDepartmentSubzones;
      delete (window as any).showGrandParisSubzones;
      delete (window as any).preloadCitySubdivisions;
      delete (window as any).showCitySubdivisions;
      delete (window as any).clearCitySubdivisions;
      delete (window as any).resetSelectedZonesToParis;
    }
  };
}

export function selectExtrudedZone(
  zoneId: SelectedZoneId,
  flyTarget?: SelectedZoneFlyTarget,
  options?: SelectedZoneSelectionOptions,
): Promise<void> {
  return activeController?.selectExtrudedZone(zoneId, flyTarget, options) ?? Promise.resolve();
}

export function clearExtrudedZone(): void {
  activeController?.clearExtrudedZone();
}

export function getSelectedExtrudedZone(): SelectedZoneId | null {
  return activeController?.getSelectedExtrudedZone() ?? null;
}

export function showSaintDenisSubzones(flyTarget?: SelectedZoneFlyTarget): Promise<void> {
  return activeController?.showSaintDenisSubzones(flyTarget) ?? Promise.resolve();
}

export function showSeineSaintDenisCommunes(flyTarget?: SelectedZoneFlyTarget): Promise<boolean> {
  return activeController?.showSeineSaintDenisCommunes(flyTarget) ?? Promise.resolve(false);
}

export function showGrandParisDepartmentSubzones(
  departmentCode: string,
  flyTarget?: SelectedZoneFlyTarget,
): Promise<boolean> {
  return activeController?.showGrandParisDepartmentSubzones(departmentCode, flyTarget) ?? Promise.resolve(false);
}

export function showGrandParisSubzones(parentCode: string, flyTarget?: SelectedZoneFlyTarget): Promise<boolean> {
  return activeController?.showGrandParisSubzones(parentCode, flyTarget) ?? Promise.resolve(false);
}

export function showMetropolitanSubzones(
  cityId: CitySubdivisionId,
  parentCode: string,
  flyTarget?: SelectedZoneFlyTarget,
): Promise<boolean> {
  return activeController?.showMetropolitanSubzones(cityId, parentCode, flyTarget) ?? Promise.resolve(false);
}

export function showCitySubdivisions(cityId: CitySubdivisionId): Promise<boolean> {
  return activeController?.showCitySelectableZones(cityId) ?? Promise.resolve(false);
}

export function preloadCitySubdivisions(cityId: CitySubdivisionId): Promise<boolean> {
  return activeController?.preloadCitySelectableZones(cityId) ?? Promise.resolve(false);
}

export function clearCitySubdivisions(): void {
  activeController?.clearCitySelectableZones();
}

export function resetSelectedZonesToParis(): Promise<void> {
  return activeController?.resetToParisSelectableZones() ?? Promise.resolve();
}

export function getInitialSelectedZoneId(search = typeof window !== "undefined" ? window.location.search : "") {
  return getInitialZoneIdFromSearch(search);
}

export { DEFAULT_SELECTED_ZONE_ID };
