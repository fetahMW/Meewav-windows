import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTRUSION_OUTPUT_PATH = path.join(ROOT_DIR, "public", "geo", "france-regions-metropole-simplified.geojson");
const OUTLINE_OUTPUT_PATH = path.join(ROOT_DIR, "public", "geo", "france-regions-metropole-outline.geojson");
const LABELS_OUTPUT_PATH = path.join(ROOT_DIR, "public", "geo", "france-regions-metropole-labels.geojson");
const EXTRUSION_SOURCE_URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";
const OUTLINE_SOURCE_URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions.geojson";
const EXTRUSION_SIMPLIFICATION_TOLERANCE = 0.032;
const OUTLINE_SIMPLIFICATION_TOLERANCE = 0.008;

type Position = [number, number];

type RegionStyle = {
  regionId: string;
  name: string;
  plateColor: string;
  plateHeight: number;
  plateBase: number;
  labelLng: number;
  labelLat: number;
  priority: number;
};

const REGION_STYLE_BY_CODE: Record<string, RegionStyle> = {
  "11": {
    regionId: "ile-de-france",
    name: "Île-de-France",
    plateColor: "#855DDD",
    plateHeight: 15000,
    plateBase: 0,
    labelLng: 2.45,
    labelLat: 48.68,
    priority: 1,
  },
  "32": {
    regionId: "hauts-de-france",
    name: "Hauts-de-France",
    plateColor: "#6B4BC4",
    plateHeight: 12000,
    plateBase: 0,
    labelLng: 2.85,
    labelLat: 50.26,
    priority: 2,
  },
  "28": {
    regionId: "normandie",
    name: "Normandie",
    plateColor: "#7B5BD2",
    plateHeight: 9000,
    plateBase: 0,
    labelLng: 0.15,
    labelLat: 49.08,
    priority: 3,
  },
  "53": {
    regionId: "bretagne",
    name: "Bretagne",
    plateColor: "#8B63E6",
    plateHeight: 10800,
    plateBase: 0,
    labelLng: -2.85,
    labelLat: 48.18,
    priority: 3,
  },
  "52": {
    regionId: "pays-de-la-loire",
    name: "Pays de la Loire",
    plateColor: "#8060D8",
    plateHeight: 9500,
    plateBase: 0,
    labelLng: -0.95,
    labelLat: 47.42,
    priority: 3,
  },
  "24": {
    regionId: "centre-val-de-loire",
    name: "Centre-Val de Loire",
    plateColor: "#6E55C6",
    plateHeight: 8000,
    plateBase: 0,
    labelLng: 1.55,
    labelLat: 47.45,
    priority: 4,
  },
  "44": {
    regionId: "grand-est",
    name: "Grand Est",
    plateColor: "#7456D4",
    plateHeight: 11500,
    plateBase: 0,
    labelLng: 5.65,
    labelLat: 48.72,
    priority: 2,
  },
  "27": {
    regionId: "bourgogne-franche-comte",
    name: "Bourgogne-Franche-Comté",
    plateColor: "#5F4AB2",
    plateHeight: 6800,
    plateBase: 0,
    labelLng: 4.75,
    labelLat: 47.25,
    priority: 4,
  },
  "84": {
    regionId: "auvergne-rhone-alpes",
    name: "Auvergne-Rhône-Alpes",
    plateColor: "#9B78F2",
    plateHeight: 14000,
    plateBase: 0,
    labelLng: 4.62,
    labelLat: 45.55,
    priority: 2,
  },
  "75": {
    regionId: "nouvelle-aquitaine",
    name: "Nouvelle-Aquitaine",
    plateColor: "#8F70E6",
    plateHeight: 12100,
    plateBase: 0,
    labelLng: -0.18,
    labelLat: 45.25,
    priority: 3,
  },
  "76": {
    regionId: "occitanie",
    name: "Occitanie",
    plateColor: "#B18EFF",
    plateHeight: 5000,
    plateBase: 0,
    labelLng: 2.15,
    labelLat: 43.75,
    priority: 3,
  },
  "93": {
    regionId: "provence-alpes-cote-d-azur",
    name: "Provence-Alpes-Côte d’Azur",
    plateColor: "#A47BEE",
    plateHeight: 4050,
    plateBase: 0,
    labelLng: 6.2,
    labelLat: 43.95,
    priority: 2,
  },
  "94": {
    regionId: "corse",
    name: "Corse",
    plateColor: "#9270E4",
    plateHeight: 3400,
    plateBase: 0,
    labelLng: 9.08,
    labelLat: 42.12,
    priority: 3,
  },
};

function collectPositions(value: unknown, positions: Position[] = []) {
  if (!Array.isArray(value)) return positions;

  if (
    value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
  ) {
    positions.push([value[0], value[1]]);
    return positions;
  }

  value.forEach((child) => collectPositions(child, positions));
  return positions;
}

function getPointSegmentDistanceSquared(point: Position, start: Position, end: Position) {
  const segmentLng = end[0] - start[0];
  const segmentLat = end[1] - start[1];
  const segmentLengthSquared = segmentLng * segmentLng + segmentLat * segmentLat;
  if (segmentLengthSquared === 0) {
    const lng = point[0] - start[0];
    const lat = point[1] - start[1];
    return lng * lng + lat * lat;
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * segmentLng + (point[1] - start[1]) * segmentLat) / segmentLengthSquared,
    ),
  );
  const projectedLng = start[0] + projection * segmentLng;
  const projectedLat = start[1] + projection * segmentLat;
  const distanceLng = point[0] - projectedLng;
  const distanceLat = point[1] - projectedLat;
  return distanceLng * distanceLng + distanceLat * distanceLat;
}

function simplifyLine(points: Position[], tolerance: number) {
  if (points.length <= 2) return points;

  const toleranceSquared = tolerance * tolerance;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop()!;
    let farthestIndex = -1;
    let farthestDistance = 0;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = getPointSegmentDistanceSquared(points[index], points[startIndex], points[endIndex]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }

    if (farthestIndex !== -1 && farthestDistance > toleranceSquared) {
      keep[farthestIndex] = true;
      stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function simplifyRing(ring: unknown, tolerance: number): unknown {
  if (!Array.isArray(ring) || ring.length < 4) return ring;

  const positions = ring
    .filter((point): point is Position => (
      Array.isArray(point)
      && typeof point[0] === "number"
      && typeof point[1] === "number"
    ))
    .map((point) => [point[0], point[1]] as Position);
  if (positions.length < 4) return ring;

  const openRing = positions.slice(0, -1);
  const simplified = simplifyLine(openRing, tolerance);
  if (simplified.length < 3) return ring;

  return [...simplified, simplified[0]];
}

function simplifyGeometry(geometry: GeoJSON.Geometry, tolerance: number) {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, tolerance)) as Position[][],
    } as GeoJSON.Polygon;
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => (
        polygon.map((ring) => simplifyRing(ring, tolerance)) as Position[][]
      )),
    } as GeoJSON.MultiPolygon;
  }

  return geometry;
}

function roundCoordinates(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(5));
  if (Array.isArray(value)) return value.map(roundCoordinates);
  return value;
}

function getGeometryBbox(geometry: GeoJSON.Geometry) {
  const positions = collectPositions((geometry as { coordinates?: unknown }).coordinates);
  if (!positions.length) {
    throw new Error("Unable to compute bbox for a region without coordinates");
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  positions.forEach(([lng, lat]) => {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  });

  return [
    Number(west.toFixed(5)),
    Number(south.toFixed(5)),
    Number(east.toFixed(5)),
    Number(north.toFixed(5)),
  ] as const;
}

async function main() {
  const [extrusionResponse, outlineResponse] = await Promise.all([
    fetch(EXTRUSION_SOURCE_URL),
    fetch(OUTLINE_SOURCE_URL),
  ]);
  if (!extrusionResponse.ok) {
    throw new Error(`Unable to fetch France region extrusion source: ${extrusionResponse.status} ${extrusionResponse.statusText}`);
  }
  if (!outlineResponse.ok) {
    throw new Error(`Unable to fetch France region outline source: ${outlineResponse.status} ${outlineResponse.statusText}`);
  }

  const extrusionSource = await extrusionResponse.json() as GeoJSON.FeatureCollection;
  const outlineSource = await outlineResponse.json() as GeoJSON.FeatureCollection;
  const createRegionFeature = (
    sourceFeature: GeoJSON.Feature,
    geometryTransform: (geometry: GeoJSON.Geometry) => GeoJSON.Geometry,
  ) => {
    const code = String(sourceFeature.properties?.code ?? "");
    const style = REGION_STYLE_BY_CODE[code];
    if (!style) return null;
    if (!sourceFeature.geometry) {
      throw new Error(`Region ${style.regionId} has no geometry`);
    }

    const bbox = getGeometryBbox(sourceFeature.geometry);
    const transformedGeometry = geometryTransform(sourceFeature.geometry);
    const geometry = {
      ...transformedGeometry,
      coordinates: roundCoordinates((transformedGeometry as { coordinates?: unknown }).coordinates),
    } as GeoJSON.Geometry;

    return {
      type: "Feature",
      id: style.regionId,
      properties: {
        ...style,
        sourceCode: code,
        bboxWest: bbox[0],
        bboxSouth: bbox[1],
        bboxEast: bbox[2],
        bboxNorth: bbox[3],
      },
      geometry,
    } satisfies GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
  };

  const extrusionFeatures = extrusionSource.features
    .map((sourceFeature) => createRegionFeature(
      sourceFeature,
      (geometry) => simplifyGeometry(geometry, EXTRUSION_SIMPLIFICATION_TOLERANCE),
    ))
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => feature !== null);
  const outlineFeatures = outlineSource.features
    .map((sourceFeature) => createRegionFeature(
      sourceFeature,
      (geometry) => simplifyGeometry(geometry, OUTLINE_SIMPLIFICATION_TOLERANCE),
    ))
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => feature !== null);

  const sortByPriority = (
    a: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>,
    b: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>,
  ) => Number(a.properties.priority) - Number(b.properties.priority);

  const extrusionOutput = {
    type: "FeatureCollection",
    metadata: {
      generatedBy: "scripts/generate-france-region-plates.ts",
      source: EXTRUSION_SOURCE_URL,
      simplificationTolerance: EXTRUSION_SIMPLIFICATION_TOLERANCE,
      featureCount: extrusionFeatures.length,
      regionLevel: "metropolitan-france-regions",
      displayMode: "country-region-plates-extrusion",
    },
    features: extrusionFeatures.sort(sortByPriority),
  } satisfies GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

  const outlineOutput = {
    type: "FeatureCollection",
    metadata: {
      generatedBy: "scripts/generate-france-region-plates.ts",
      source: OUTLINE_SOURCE_URL,
      simplificationTolerance: OUTLINE_SIMPLIFICATION_TOLERANCE,
      featureCount: outlineFeatures.length,
      regionLevel: "metropolitan-france-regions",
      displayMode: "country-region-plates-outline",
    },
    features: outlineFeatures.sort(sortByPriority),
  } satisfies GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

  await mkdir(path.dirname(EXTRUSION_OUTPUT_PATH), { recursive: true });
  await writeFile(EXTRUSION_OUTPUT_PATH, `${JSON.stringify(extrusionOutput, null, 2)}\n`);
  await writeFile(OUTLINE_OUTPUT_PATH, `${JSON.stringify(outlineOutput, null, 2)}\n`);

  const labelsOutput = {
    type: "FeatureCollection",
    metadata: {
      generatedBy: "scripts/generate-france-region-plates.ts",
      source: "/geo/france-regions-metropole-simplified.geojson",
      featureCount: extrusionFeatures.length,
      displayMode: "country-region-ground-labels",
    },
    features: extrusionFeatures.map((plateFeature) => ({
      type: "Feature",
      id: `${plateFeature.properties.regionId}-label`,
      properties: {
        regionId: plateFeature.properties.regionId,
        name: plateFeature.properties.name,
        priority: plateFeature.properties.priority,
      },
      geometry: {
        type: "Point",
        coordinates: [
          plateFeature.properties.labelLng,
          plateFeature.properties.labelLat,
        ],
      },
    })),
  } satisfies GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>;

  await writeFile(LABELS_OUTPUT_PATH, `${JSON.stringify(labelsOutput, null, 2)}\n`);
  console.log(`Generated ${extrusionFeatures.length} France region extrusion plates at ${EXTRUSION_OUTPUT_PATH}`);
  console.log(`Generated ${outlineFeatures.length} France region outlines at ${OUTLINE_OUTPUT_PATH}`);
  console.log(`Generated ${extrusionFeatures.length} France region labels at ${LABELS_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
