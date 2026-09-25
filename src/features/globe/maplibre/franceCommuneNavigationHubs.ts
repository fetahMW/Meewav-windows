import type { Feature, FeatureCollection, Point } from "geojson";
import type { FranceSearchResult } from "./search-france/franceSearchTypes";

export const FRANCE_COMMUNE_NAVIGATION_SOURCE_ID = "france-commune-navigation-hubs";

export type FranceCommuneNavigationBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type FranceCommuneNavigationHubProperties = {
  baseOpacity: number;
  circleRadius: number;
  departmentCode: string;
  departmentName: string;
  glowColor: string;
  glowRadius: number;
  hoverCountLabel: string;
  id: string;
  importance: number;
  labelOpacity: number;
  name: string;
  navigationHub: true;
  pointColor: string;
  pointLevel: "major" | "secondary" | "local";
  population: number;
  regionName: string;
  searchType: "city" | "commune";
  subtitle: string;
  targetBearing: number;
  targetLat: number;
  targetLng: number;
  targetPitch: number;
  targetSpeed: number;
  targetZoom: number;
};

export type FranceCommuneNavigationHubFeature = Feature<
  Point,
  FranceCommuneNavigationHubProperties
> & { id: string };

const GRID_CELL_DEGREES = 0.25;
const COMMUNE_RESULT_ID_PATTERN = /^commune-[0-9A-Z]{5}$/iu;
const METROPOLITAN_FRANCE_BOUNDS: FranceCommuneNavigationBounds = [-6.3, 41.05, 10.1, 51.45];

function compareText(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getGridCoordinate(value: number) {
  return Math.floor(value / GRID_CELL_DEGREES);
}

function getGridKey(longitudeIndex: number, latitudeIndex: number) {
  return `${longitudeIndex}:${latitudeIndex}`;
}

function getPointLevel(result: FranceSearchResult): FranceCommuneNavigationHubProperties["pointLevel"] {
  const population = Number(result.population ?? 0);
  const importance = Number(result.importance ?? 0);
  if (population >= 100_000 || importance >= 78) return "major";
  if (population >= 35_000 || importance >= 64) return "secondary";
  return "local";
}

function getPointStyle(pointLevel: FranceCommuneNavigationHubProperties["pointLevel"]) {
  if (pointLevel === "major") {
    return {
      baseOpacity: 0.94,
      circleRadius: 5.4,
      glowColor: "#33FF91",
      glowRadius: 15,
      labelOpacity: 0.98,
      pointColor: "#D8FFE8",
    };
  }

  if (pointLevel === "secondary") {
    return {
      baseOpacity: 0.88,
      circleRadius: 4.15,
      glowColor: "#24F982",
      glowRadius: 10.5,
      labelOpacity: 0.94,
      pointColor: "#A8FFCA",
    };
  }

  return {
    baseOpacity: 0.82,
    circleRadius: 3.15,
    glowColor: "#16C965",
    glowRadius: 7.2,
    labelOpacity: 0.9,
    pointColor: "#72F5A7",
  };
}

export function createFranceCommuneNavigationHubFeature(
  result: FranceSearchResult,
): FranceCommuneNavigationHubFeature | null {
  if (
    (result.type !== "city" && result.type !== "commune")
    || !COMMUNE_RESULT_ID_PATTERN.test(result.id)
  ) {
    return null;
  }

  const targetLng = Number(result.center?.[0]);
  const targetLat = Number(result.center?.[1]);
  if (!Number.isFinite(targetLng) || !Number.isFinite(targetLat)) return null;
  if (
    targetLng < METROPOLITAN_FRANCE_BOUNDS[0]
    || targetLng > METROPOLITAN_FRANCE_BOUNDS[2]
    || targetLat < METROPOLITAN_FRANCE_BOUNDS[1]
    || targetLat > METROPOLITAN_FRANCE_BOUNDS[3]
  ) {
    return null;
  }

  const pointLevel = getPointLevel(result);
  const pointStyle = getPointStyle(pointLevel);
  const importance = Number.isFinite(Number(result.importance)) ? Number(result.importance) : 0;
  const population = Number.isFinite(Number(result.population)) ? Number(result.population) : 0;

  return {
    type: "Feature",
    id: result.id,
    properties: {
      ...pointStyle,
      departmentCode: String(result.departmentCode ?? ""),
      departmentName: String(result.departmentName ?? ""),
      hoverCountLabel: "Cliquer pour explorer",
      id: result.id,
      importance,
      name: result.label,
      navigationHub: true,
      pointLevel,
      population,
      regionName: String(result.regionName ?? ""),
      searchType: result.type,
      subtitle: result.subtitle,
      targetBearing: Number.isFinite(Number(result.bearing)) ? Number(result.bearing) : 0,
      targetLat,
      targetLng,
      targetPitch: Number.isFinite(Number(result.pitch)) ? Number(result.pitch) : 58,
      targetSpeed: Number.isFinite(Number(result.speed)) ? Number(result.speed) : 1.2,
      targetZoom: Number.isFinite(Number(result.zoom)) ? Number(result.zoom) : 15.2,
    },
    geometry: {
      type: "Point",
      coordinates: [targetLng, targetLat],
    },
  };
}

export function createFranceSearchResultFromCommuneNavigationHub(
  feature: Pick<FranceCommuneNavigationHubFeature, "geometry" | "properties">,
): FranceSearchResult | null {
  const properties = feature.properties;
  const targetLng = Number(properties.targetLng ?? feature.geometry.coordinates[0]);
  const targetLat = Number(properties.targetLat ?? feature.geometry.coordinates[1]);
  if (
    properties.navigationHub !== true
    || !COMMUNE_RESULT_ID_PATTERN.test(String(properties.id))
    || !Number.isFinite(targetLng)
    || !Number.isFinite(targetLat)
  ) {
    return null;
  }

  return {
    id: String(properties.id),
    label: String(properties.name),
    subtitle: String(properties.subtitle ?? "Commune · France"),
    type: properties.searchType === "city" ? "city" : "commune",
    center: [targetLng, targetLat],
    departmentCode: properties.departmentCode || undefined,
    departmentName: properties.departmentName || undefined,
    regionName: properties.regionName || undefined,
    population: Number(properties.population) || 0,
    importance: Number(properties.importance) || 0,
    zoom: Number(properties.targetZoom) || 15.2,
    pitch: Number(properties.targetPitch) || 58,
    bearing: Number(properties.targetBearing) || 0,
    speed: Number(properties.targetSpeed) || 1.2,
    source: "france-commune-navigation-hub",
  };
}

export function padFranceCommuneNavigationBounds(
  bounds: FranceCommuneNavigationBounds,
  paddingRatio = 0.5,
): FranceCommuneNavigationBounds {
  const [rawWest, rawSouth, rawEast, rawNorth] = bounds;
  if (![rawWest, rawSouth, rawEast, rawNorth].every(Number.isFinite)) {
    return METROPOLITAN_FRANCE_BOUNDS;
  }

  const centerLng = (rawWest + rawEast) / 2;
  const centerLat = (rawSouth + rawNorth) / 2;
  const longitudeSpan = Math.min(4.8, Math.max(0.08, rawEast - rawWest) * (1 + paddingRatio * 2));
  const latitudeSpan = Math.min(3.6, Math.max(0.06, rawNorth - rawSouth) * (1 + paddingRatio * 2));

  return [
    clamp(centerLng - longitudeSpan / 2, METROPOLITAN_FRANCE_BOUNDS[0], METROPOLITAN_FRANCE_BOUNDS[2]),
    clamp(centerLat - latitudeSpan / 2, METROPOLITAN_FRANCE_BOUNDS[1], METROPOLITAN_FRANCE_BOUNDS[3]),
    clamp(centerLng + longitudeSpan / 2, METROPOLITAN_FRANCE_BOUNDS[0], METROPOLITAN_FRANCE_BOUNDS[2]),
    clamp(centerLat + latitudeSpan / 2, METROPOLITAN_FRANCE_BOUNDS[1], METROPOLITAN_FRANCE_BOUNDS[3]),
  ];
}

export class FranceCommuneNavigationHubIndex {
  private readonly buckets = new Map<string, FranceCommuneNavigationHubFeature[]>();

  readonly size: number;

  constructor(
    results: readonly FranceSearchResult[],
    options: {
      allowedIds?: ReadonlySet<string>;
      excludedIds?: ReadonlySet<string>;
    } = {},
  ) {
    let size = 0;
    for (const result of results) {
      if (options.allowedIds && !options.allowedIds.has(result.id)) continue;
      if (options.excludedIds?.has(result.id)) continue;
      const feature = createFranceCommuneNavigationHubFeature(result);
      if (!feature) continue;
      const [longitude, latitude] = feature.geometry.coordinates;
      const key = getGridKey(getGridCoordinate(longitude), getGridCoordinate(latitude));
      const bucket = this.buckets.get(key) ?? [];
      bucket.push(feature);
      this.buckets.set(key, bucket);
      size += 1;
    }
    this.size = size;
  }

  query(bounds: FranceCommuneNavigationBounds): FeatureCollection<Point, FranceCommuneNavigationHubProperties> {
    const [west, south, east, north] = bounds;
    if (![west, south, east, north].every(Number.isFinite) || west > east || south > north) {
      return { type: "FeatureCollection", features: [] };
    }

    const features: FranceCommuneNavigationHubFeature[] = [];
    const seenIds = new Set<string>();
    const minimumLongitudeIndex = getGridCoordinate(west);
    const maximumLongitudeIndex = getGridCoordinate(east);
    const minimumLatitudeIndex = getGridCoordinate(south);
    const maximumLatitudeIndex = getGridCoordinate(north);

    for (let longitudeIndex = minimumLongitudeIndex; longitudeIndex <= maximumLongitudeIndex; longitudeIndex += 1) {
      for (let latitudeIndex = minimumLatitudeIndex; latitudeIndex <= maximumLatitudeIndex; latitudeIndex += 1) {
        const bucket = this.buckets.get(getGridKey(longitudeIndex, latitudeIndex));
        if (!bucket) continue;
        for (const feature of bucket) {
          const [longitude, latitude] = feature.geometry.coordinates;
          if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
          if (seenIds.has(feature.id)) continue;
          seenIds.add(feature.id);
          features.push(feature);
        }
      }
    }

    features.sort((first, second) => (
      second.properties.importance - first.properties.importance
      || second.properties.population - first.properties.population
      || compareText(first.properties.name, second.properties.name)
      || compareText(first.id, second.id)
    ));

    return { type: "FeatureCollection", features };
  }
}
