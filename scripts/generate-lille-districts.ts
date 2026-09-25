import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";
import { groupHumanNamedZones } from "./geo/lib/group-human-zones.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "lille-quartiers.geojson");

const LILLE_COMMUNE_CODE = "59350";
const EXPECTED_LILLE_IRIS_COUNT = 84;
const EXPECTED_LILLE_HUMAN_ZONE_COUNT = 61;
const EXPECTED_LILLE_QUARTER_COUNT = 10;
const IRIS_WFS_URL = "https://data.geopf.fr/wfs/ows";
const IRIS_DATASET_URL = "https://geoservices.ign.fr/contoursiris";
const LILLE_QUARTERS_DATASET_URL = "https://www.lille.fr/Participer/Participation-citoyenne/Les-instances-citoyennes/Conseils-de-quartier";
const LILLE_BBOX = [2.95, 50.55, 3.18, 50.72] as const;
const LILLE_QUARTERS = {
  "01": "Lille-Centre",
  "02": "Vieux-Lille",
  "03": "Vauban-Esquermes",
  "04": "Wazemmes",
  "05": "Lille-Moulins",
  "06": "Faubourg de Bethune",
  "07": "Lille-Sud",
  "08": "Bois-Blancs",
  "09": "Saint-Maurice Pellevoisin",
  "10": "Fives",
} as const;

function slugify(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function visitCoordinates(coordinates: unknown, callback: (coordinate: [number, number]) => void) {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
    callback([Number(coordinates[0]), Number(coordinates[1])]);
    return;
  }
  for (const child of coordinates) visitCoordinates(child, callback);
}

function getGeometryBbox(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  visitCoordinates(geometry.coordinates, ([lng, lat]) => {
    bbox[0] = Math.min(bbox[0], lng);
    bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lng);
    bbox[3] = Math.max(bbox[3], lat);
  });
  if (!bbox.every(Number.isFinite)) throw new Error("Invalid geometry bounds");
  return bbox;
}

function assertPolygonFeature(
  feature: GeoJSON.Feature,
  label: string,
): asserts feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>> {
  if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
    throw new Error(`Invalid polygon geometry for ${label}`);
  }
  const bbox = getGeometryBbox(feature.geometry);
  if (bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) {
    throw new Error(`Geometry is not WGS84 for ${label}: ${bbox.join(",")}`);
  }
}

function isInside(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  coordinates: [number, number],
) {
  return booleanPointInPolygon(point(coordinates), feature);
}

function getInteriorLabelPoint(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) {
  const bbox = getGeometryBbox(feature.geometry);
  const centroid = geoCentroid(feature) as [number, number];
  const bboxCenter: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  if (centroid.every(Number.isFinite) && isInside(feature, centroid)) return centroid;
  if (isInside(feature, bboxCenter)) return bboxCenter;

  const target = centroid.every(Number.isFinite) ? centroid : bboxCenter;
  const width = Math.max(1e-9, bbox[2] - bbox[0]);
  const height = Math.max(1e-9, bbox[3] - bbox[1]);
  let best: [number, number] | null = null;
  let bestDistance = Infinity;

  for (let row = 1; row < 48; row += 1) {
    for (let column = 1; column < 48; column += 1) {
      const candidate: [number, number] = [
        bbox[0] + width * column / 48,
        bbox[1] + height * row / 48,
      ];
      if (!isInside(feature, candidate)) continue;
      const distance = ((candidate[0] - target[0]) / width) ** 2
        + ((candidate[1] - target[1]) / height) ** 2;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }

  if (!best) throw new Error(`Unable to place a label inside ${String(feature.properties?.nom_iris ?? "IRIS")}`);
  return best;
}

function metersPerLngAtLat(latitude: number) {
  return 111320 * Math.cos(latitude * Math.PI / 180);
}

function ringAreaMeters(ring: GeoJSON.Position[]) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const latitude = ring.reduce((sum, coordinate) => sum + Number(coordinate[1]), 0) / ring.length;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lngA, latA] = ring[index];
    const [lngB, latB] = ring[index + 1];
    const xA = lngA * metersPerLngAtLat(latitude);
    const yA = latA * 110540;
    const xB = lngB * metersPerLngAtLat(latitude);
    const yB = latB * 110540;
    area += xA * yB - xB * yA;
  }
  return area / 2;
}

function polygonAreaMeters(coordinates: GeoJSON.Position[][]) {
  if (!coordinates.length) return 0;
  const outer = Math.abs(ringAreaMeters(coordinates[0]));
  const holes = coordinates.slice(1).reduce((sum, ring) => sum + Math.abs(ringAreaMeters(ring)), 0);
  return Math.max(0, outer - holes);
}

function geometryAreaMeters(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  return geometry.type === "Polygon"
    ? polygonAreaMeters(geometry.coordinates)
    : geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaMeters(polygon), 0);
}

async function fetchJson(url: URL | string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/geo+json, application/json",
      "user-agent": "Meewav-Web Lille districts generator/1.0",
    },
  });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchIrisCollection() {
  const url = new URL(IRIS_WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", "STATISTICALUNITS.IRIS:contours_iris");
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("COUNT", "500");
  url.searchParams.set("BBOX", `${LILLE_BBOX.join(",")},EPSG:4326`);
  url.searchParams.set("SRSNAME", "EPSG:4326");
  return fetchJson(url);
}

function normalizeIris(
  feature: GeoJSON.Feature,
  colorIndex: number,
) {
  const properties = feature.properties ?? {};
  const communeCode = String(properties.code_insee ?? "").trim();
  const irisCode = String(properties.code_iris ?? "").trim();
  const localIrisCode = String(properties.iris ?? "").trim();
  const label = String(properties.nom_iris ?? "").trim();
  if (communeCode !== LILLE_COMMUNE_CODE || !irisCode || !localIrisCode || !label) {
    throw new Error(`Invalid Lille IRIS: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, label);

  const parentCode = localIrisCode.slice(0, 2) as keyof typeof LILLE_QUARTERS;
  const parentLabel = LILLE_QUARTERS[parentCode];
  if (!parentLabel) throw new Error(`IRIS ${irisCode} is outside Lille's 10 municipal quarters`);

  const zoneId = `lille_${irisCode}_${slugify(label)}`;
  const [labelLng, labelLat] = getInteriorLabelPoint(feature);
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: irisCode,
      arrondissementCode: parentCode,
      colorIndex,
      parentZoneId: `lille_parent_${parentCode}_${slugify(parentLabel)}`,
      parentCode,
      parentLabel,
      territoryType: "iris",
      source: "IGN / INSEE - Contours IRIS WFS Géoplateforme",
      sourceYear: "2026",
      officialId: irisCode,
      sourceCleabs: String(properties.cleabs ?? ""),
      communeCode,
      irisCode: localIrisCode,
      irisType: String(properties.type_iris ?? ""),
      officialAreaM2: geometryAreaMeters(feature.geometry),
      labelLng,
      labelLat,
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

async function main() {
  const irisPayload = await fetchIrisCollection();

  const irisFeatures = (Array.isArray(irisPayload?.features) ? irisPayload.features : [])
    .filter((feature: GeoJSON.Feature) => {
      const properties = feature.properties ?? {};
      const localIrisCode = String(properties.iris ?? "");
      return String(properties.code_insee ?? "") === LILLE_COMMUNE_CODE
        && Object.prototype.hasOwnProperty.call(LILLE_QUARTERS, localIrisCode.slice(0, 2));
    }) as GeoJSON.Feature[];
  if (irisFeatures.length !== EXPECTED_LILLE_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_LILLE_IRIS_COUNT} central Lille IRIS, received ${irisFeatures.length}`);
  }

  irisFeatures.sort((left, right) => String(left.properties?.code_iris).localeCompare(String(right.properties?.code_iris)));
  const features = irisFeatures.map((feature, index) => normalizeIris(feature, index % 8));
  const zoneIds = new Set(features.map((feature) => feature.properties.zoneId));
  if (zoneIds.size !== features.length) throw new Error("Duplicate Lille IRIS zone IDs");

  const parentCodes = new Set(features.map((feature) => feature.properties.parentCode));
  if (parentCodes.size !== EXPECTED_LILLE_QUARTER_COUNT) {
    throw new Error(`Expected all ${EXPECTED_LILLE_QUARTER_COUNT} Lille quarters to own IRIS, received ${parentCodes.size}`);
  }

  const baseCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "IGN / INSEE Contours IRIS and Ville de Lille municipal quarters",
      datasetId: "STATISTICALUNITS.IRIS:contours_iris / Ville de Lille 10 conseils de quartier",
      datasetUrl: IRIS_DATASET_URL,
      parentDatasetUrl: LILLE_QUARTERS_DATASET_URL,
      parentSourceYear: "2026",
      license: "Licence Ouverte / Open Licence",
      sourceYear: "2026",
      featureCount: features.length,
      parentCount: parentCodes.size,
    },
    features,
  };
  const collection = groupHumanNamedZones(baseCollection, {
    cityId: "lille",
    communeCode: LILLE_COMMUNE_CODE,
    communeName: "Lille",
    source: "IGN / INSEE Contours IRIS and Ville de Lille municipal quarters",
    sourceYear: "2026",
    stripTrailingNumber: true,
    labelOverrides: {
      "Lille Centre": "Lille-Centre",
      "Vieux Lille": "Vieux-Lille",
    },
    expectedFeatureCount: EXPECTED_LILLE_HUMAN_ZONE_COUNT,
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated ${collection.features.length} human Lille zones from ${features.length} official IRIS polygons at ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
