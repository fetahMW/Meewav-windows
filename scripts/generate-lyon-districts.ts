import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "lyon-quartiers.geojson");

const EXPECTED_LYON_IRIS_COUNT = 185;
const EXPECTED_COUNCIL_DISTRICT_COUNT = 36;
const LYON_ARRONDISSEMENT_PATTERN = /^6938[1-9]$/;
const DATA_GRAND_LYON_OGC_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections";
const IRIS_COLLECTION_ID = "metropole-de-lyon:ter_territoire.teriris_ge_latest";
const COUNCIL_DISTRICT_COLLECTION_ID = "ville-de-lyon:vdl_vie_citoyenne.perimetre_de_quartier";
const IRIS_DATASET_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections/metropole-de-lyon%3Ater_territoire.teriris_ge_latest";
const COUNCIL_DISTRICT_DATASET_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections/ville-de-lyon%3Avdl_vie_citoyenne.perimetre_de_quartier";

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

  if (!best) throw new Error(`Unable to place a label inside ${String(feature.properties?.libelle ?? "IRIS")}`);
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

function getCollectionItemsUrl(collectionId: string) {
  const encodedId = encodeURIComponent(collectionId);
  return `${DATA_GRAND_LYON_OGC_URL}/${encodedId}/items?f=application%2Fgeo%2Bjson&limit=1000`;
}

async function fetchJson(url: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "Meewav-Web Lyon districts generator/1.0",
        },
      });
      if (response.ok) return response.json();
      const error = new Error(`Unable to download ${url}: HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError ?? new Error(`Unable to download ${url}`);
}

function getCouncilDistrictForIris(
  irisFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  councilDistricts: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>>,
) {
  const candidates = [geoCentroid(irisFeature) as [number, number], getInteriorLabelPoint(irisFeature)];
  for (const candidate of candidates) {
    const councilDistrict = councilDistricts.find((feature) => isInside(feature, candidate));
    if (councilDistrict) return councilDistrict;
  }
  throw new Error(`Unable to assign IRIS ${String(irisFeature.properties?.codeiris ?? "unknown")} to a Lyon council district`);
}

function normalizeIris(
  feature: GeoJSON.Feature,
  councilDistricts: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>>,
  colorIndex: number,
) {
  const properties = feature.properties ?? {};
  const arrondissementCode = String(properties.insee ?? "").trim();
  const irisCode = String(properties.codeiris ?? "").trim();
  const localIrisCode = irisCode.slice(-4);
  const officialLabel = String(properties.libelle ?? "").trim();
  if (!LYON_ARRONDISSEMENT_PATTERN.test(arrondissementCode) || !irisCode || !localIrisCode || !officialLabel) {
    throw new Error(`Invalid Lyon IRIS: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, officialLabel);

  const councilDistrict = getCouncilDistrictForIris(feature, councilDistricts);
  const parentCode = String(councilDistrict.properties.code ?? "").trim();
  const parentLabel = String(councilDistrict.properties.nom ?? "").trim();
  const arrondissementNumber = Number(councilDistrict.properties.numero_arrondissement);
  if (!parentCode || !parentLabel || !Number.isInteger(arrondissementNumber)) {
    throw new Error(`Invalid Lyon council district for ${officialLabel}`);
  }

  const label = officialLabel === "Mairie" ? `Mairie — ${parentLabel}` : officialLabel;
  const zoneId = `lyon_${irisCode}_${slugify(label)}`;
  const [labelLng, labelLat] = getInteriorLabelPoint(feature);
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: irisCode,
      arrondissementCode,
      colorIndex,
      parentZoneId: `lyon_parent_${parentCode}_${slugify(parentLabel)}`,
      parentCode,
      parentLabel,
      territoryType: "iris",
      source: "Data Grand Lyon - Contours IRIS Grande Echelle",
      sourceYear: "2026",
      officialId: irisCode,
      officialLabel,
      ...(label !== officialLabel ? { labelDisambiguation: "official-parent-label" } : {}),
      communeCode: arrondissementCode,
      irisCode: localIrisCode,
      irisType: String(properties.type ?? ""),
      arrondissementNumber,
      officialAreaM2: geometryAreaMeters(feature.geometry),
      labelLng,
      labelLat,
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

async function main() {
  const [irisPayload, councilDistrictPayload] = await Promise.all([
    fetchJson(getCollectionItemsUrl(IRIS_COLLECTION_ID)),
    fetchJson(getCollectionItemsUrl(COUNCIL_DISTRICT_COLLECTION_ID)),
  ]);

  const councilDistrictFeatures = (Array.isArray(councilDistrictPayload?.features)
    ? councilDistrictPayload.features
    : []) as GeoJSON.Feature[];
  if (councilDistrictFeatures.length !== EXPECTED_COUNCIL_DISTRICT_COUNT) {
    throw new Error(`Expected ${EXPECTED_COUNCIL_DISTRICT_COUNT} Lyon council districts, received ${councilDistrictFeatures.length}`);
  }
  for (const feature of councilDistrictFeatures) {
    assertPolygonFeature(feature, String(feature.properties?.nom ?? "council district"));
  }
  const councilDistricts = councilDistrictFeatures as Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>>;

  const irisFeatures = (Array.isArray(irisPayload?.features) ? irisPayload.features : [])
    .filter((feature: GeoJSON.Feature) => LYON_ARRONDISSEMENT_PATTERN.test(String(feature.properties?.insee ?? ""))) as GeoJSON.Feature[];
  if (irisFeatures.length !== EXPECTED_LYON_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_LYON_IRIS_COUNT} Lyon IRIS, received ${irisFeatures.length}`);
  }

  irisFeatures.sort((left, right) => String(left.properties?.codeiris).localeCompare(String(right.properties?.codeiris)));
  const features = irisFeatures.map((feature, index) => normalizeIris(feature, councilDistricts, index % 8));
  const zoneIds = new Set(features.map((feature) => feature.properties.zoneId));
  if (zoneIds.size !== features.length) throw new Error("Duplicate Lyon IRIS zone IDs");

  const parentCodes = new Set(features.map((feature) => feature.properties.parentCode));
  if (parentCodes.size !== EXPECTED_COUNCIL_DISTRICT_COUNT) {
    throw new Error(`Expected all ${EXPECTED_COUNCIL_DISTRICT_COUNT} Lyon council districts to own IRIS, received ${parentCodes.size}`);
  }

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Data Grand Lyon - Contours IRIS and Ville de Lyon council districts",
      datasetId: IRIS_COLLECTION_ID,
      datasetUrl: IRIS_DATASET_URL,
      parentDatasetId: COUNCIL_DISTRICT_COLLECTION_ID,
      parentDatasetUrl: COUNCIL_DISTRICT_DATASET_URL,
      parentSourceDate: "2023-11-13",
      license: "Licence Ouverte / Open Licence",
      sourceYear: "2026",
      featureCount: features.length,
      parentCount: parentCodes.size,
    },
    features,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated ${features.length} official Lyon IRIS polygons at ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
