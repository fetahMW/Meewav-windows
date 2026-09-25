import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMUNES_OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "lyon-metropole-communes.geojson");
const SUBZONES_OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "lyon-metropole-subzones.geojson");

const LYON_COMMUNE_CODE = "69123";
const LYON_METROPOLE_EPCI_CODE = "200046977";
const EXPECTED_METROPOLE_COMMUNE_COUNT = 58;
const EXPECTED_SURROUNDING_COMMUNE_COUNT = 57;
const EXPECTED_METROPOLE_IRIS_COUNT = 512;
const EXPECTED_SURROUNDING_IRIS_COUNT = 327;

const DATA_GRAND_LYON_OGC_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections";
const COMMUNES_COLLECTION_ID = "metropole-de-lyon:adr_voie_lieu.adrcomgl_2024";
const IRIS_COLLECTION_ID = "metropole-de-lyon:ter_territoire.teriris_ge_latest";
const COMMUNES_DATASET_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections/metropole-de-lyon%3Aadr_voie_lieu.adrcomgl_2024";
const IRIS_DATASET_URL = "https://data.grandlyon.com/geoserver/ogc/features/v1/collections/metropole-de-lyon%3Ater_territoire.teriris_ge_latest";
const EPCI_COMMUNES_API_URL = `https://geo.api.gouv.fr/epcis/${LYON_METROPOLE_EPCI_CODE}/communes`;
const METROPOLE_GROUND_ROTATION = [
  "#855DDD",
  "#6B4BC4",
  "#7B5BD2",
  "#8B63E6",
  "#8060D8",
  "#6E55C6",
  "#7456D4",
  "#5F4AB2",
  "#9B78F2",
  "#8F70E6",
  "#B18EFF",
  "#A47BEE",
  "#9270E4",
] as const;

function slugify(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getColorIndex(value: string) {
  return stableHash(value) % METROPOLE_GROUND_ROTATION.length;
}

function getGroundColor(value: string) {
  return METROPOLE_GROUND_ROTATION[getColorIndex(value)];
}

function getLabelRank(population: unknown) {
  const value = Number(population);
  if (Number.isFinite(value) && value >= 40000) return 1;
  if (Number.isFinite(value) && value >= 15000) return 2;
  return 3;
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

function isInside(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, coordinates: [number, number]) {
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

  if (!best) throw new Error(`Unable to place label inside ${String(feature.properties?.label ?? "zone")}`);
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

async function fetchJson(url: URL | string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "Meewav-Web Lyon Metropole communes generator/1.0",
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

async function fetchCurrentMetropoleCommunes() {
  const url = new URL(EPCI_COMMUNES_API_URL);
  url.searchParams.set("fields", "nom,code,population");
  const records = await fetchJson(url) as Array<{ nom?: string; code?: string; population?: number }>;
  if (!Array.isArray(records) || records.length !== EXPECTED_METROPOLE_COMMUNE_COUNT) {
    throw new Error(`Expected ${EXPECTED_METROPOLE_COMMUNE_COUNT} current EPCI communes, received ${records?.length ?? 0}`);
  }
  return records;
}

function normalizeCommune(
  feature: GeoJSON.Feature,
  currentCommuneByCode: Map<string, { nom?: string; population?: number }>,
) {
  const properties = feature.properties ?? {};
  const code = String(properties.insee ?? "").trim();
  const currentCommune = currentCommuneByCode.get(code);
  const label = String(currentCommune?.nom ?? properties.nom ?? "").trim();
  if (!code || !label || !currentCommune) {
    throw new Error(`Invalid Lyon Metropole commune: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, label);

  const zoneId = `lyon_metropole_commune_${code}`;
  const [labelLng, labelLat] = getInteriorLabelPoint(feature);
  const population = Number(currentCommune.population) || 0;
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      id: zoneId,
      code,
      name: label,
      label,
      districtCode: code,
      arrondissementCode: "69M",
      colorIndex: getColorIndex(code),
      groundColor: getGroundColor(code),
      isSelectable: true,
      hoverCountLabel: "0",
      parentZoneId: "lyon_metropole",
      parentCode: "lyon_metropole",
      parentLabel: "Metropole de Lyon",
      territoryType: "commune",
      paletteFamily: "metropolitan",
      source: "Data Grand Lyon - communes de la Metropole de Lyon a partir de 2024",
      sourceYear: "2024",
      officialId: code,
      communeCode: code,
      officialAreaM2: geometryAreaMeters(feature.geometry),
      population,
      rank: getLabelRank(population),
      labelLng,
      labelLat,
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

function normalizeIris(
  feature: GeoJSON.Feature,
  communeLabelsByCode: Map<string, string>,
  colorIndex: number,
) {
  const properties = feature.properties ?? {};
  const communeCode = String(properties.insee ?? "").trim();
  const irisCode = String(properties.codeiris ?? "").trim();
  const localIrisCode = irisCode.slice(-4);
  const label = String(properties.libelle ?? "").trim();
  const parentLabel = communeLabelsByCode.get(communeCode) ?? "";
  if (!communeCode || !irisCode || !localIrisCode || !label || !parentLabel) {
    throw new Error(`Invalid Lyon Metropole IRIS: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, `${parentLabel} / ${label}`);

  const zoneId = `lyon_metropole_subzone_${communeCode}_${localIrisCode}_${slugify(label)}`;
  const [labelLng, labelLat] = getInteriorLabelPoint(feature);
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: irisCode,
      arrondissementCode: communeCode,
      colorIndex,
      groundColor: getGroundColor(`${communeCode}:${irisCode}`),
      isSelectable: true,
      hoverCountLabel: "0",
      parentZoneId: `lyon_metropole_commune_${communeCode}`,
      parentCode: communeCode,
      parentLabel,
      territoryType: "iris",
      paletteFamily: "metropolitan",
      source: "Data Grand Lyon - Contours IRIS Grande Echelle",
      sourceYear: "2026",
      officialId: irisCode,
      communeCode,
      irisCode: localIrisCode,
      irisType: String(properties.type ?? ""),
      officialAreaM2: geometryAreaMeters(feature.geometry),
      labelLng,
      labelLat,
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

async function main() {
  const [communesPayload, irisPayload, currentCommunes] = await Promise.all([
    fetchJson(getCollectionItemsUrl(COMMUNES_COLLECTION_ID)),
    fetchJson(getCollectionItemsUrl(IRIS_COLLECTION_ID)),
    fetchCurrentMetropoleCommunes(),
  ]);

  const sourceCommunes = (Array.isArray(communesPayload?.features) ? communesPayload.features : []) as GeoJSON.Feature[];
  if (sourceCommunes.length !== EXPECTED_METROPOLE_COMMUNE_COUNT) {
    throw new Error(`Expected ${EXPECTED_METROPOLE_COMMUNE_COUNT} Lyon Metropole communes, received ${sourceCommunes.length}`);
  }

  const currentCommuneByCode = new Map(currentCommunes.map((commune) => [String(commune.code ?? ""), commune]));
  const sourceCommuneCodes = new Set(sourceCommunes.map((feature) => String(feature.properties?.insee ?? "")));
  const missingFromCurrent = [...sourceCommuneCodes].filter((code) => !currentCommuneByCode.has(code));
  const missingFromSource = [...currentCommuneByCode.keys()].filter((code) => !sourceCommuneCodes.has(code));
  if (missingFromCurrent.length || missingFromSource.length) {
    throw new Error(`Open Data/EPCI membership mismatch: current=${missingFromCurrent.join(",")}, source=${missingFromSource.join(",")}`);
  }

  const communeLabelsByCode = new Map(currentCommunes.map((commune) => [String(commune.code ?? ""), String(commune.nom ?? "")]));
  const communeFeatures = sourceCommunes
    .filter((feature) => String(feature.properties?.insee ?? "") !== LYON_COMMUNE_CODE)
    .sort((left, right) => String(left.properties?.insee).localeCompare(String(right.properties?.insee)))
    .map((feature) => normalizeCommune(feature, currentCommuneByCode));
  if (communeFeatures.length !== EXPECTED_SURROUNDING_COMMUNE_COUNT) {
    throw new Error(`Expected ${EXPECTED_SURROUNDING_COMMUNE_COUNT} surrounding communes, received ${communeFeatures.length}`);
  }

  const allIris = (Array.isArray(irisPayload?.features) ? irisPayload.features : []) as GeoJSON.Feature[];
  if (allIris.length !== EXPECTED_METROPOLE_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_METROPOLE_IRIS_COUNT} Lyon Metropole IRIS, received ${allIris.length}`);
  }
  const surroundingCommuneCodes = new Set(communeFeatures.map((feature) => feature.properties.communeCode));
  const surroundingIris = allIris
    .filter((feature) => surroundingCommuneCodes.has(String(feature.properties?.insee ?? "")))
    .sort((left, right) => String(left.properties?.codeiris).localeCompare(String(right.properties?.codeiris)));
  if (surroundingIris.length !== EXPECTED_SURROUNDING_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_SURROUNDING_IRIS_COUNT} surrounding IRIS, received ${surroundingIris.length}`);
  }
  const subzoneFeatures = surroundingIris.map((feature, index) => normalizeIris(feature, communeLabelsByCode, index % 8));

  const communeZoneIds = new Set(communeFeatures.map((feature) => feature.properties.zoneId));
  const subzoneZoneIds = new Set(subzoneFeatures.map((feature) => feature.properties.zoneId));
  if (communeZoneIds.size !== communeFeatures.length || subzoneZoneIds.size !== subzoneFeatures.length) {
    throw new Error("Duplicate Lyon Metropole zone IDs");
  }

  const parentCodesWithChildren = new Set(subzoneFeatures.map((feature) => feature.properties.parentCode));
  const missingParentCodes = communeFeatures
    .map((feature) => feature.properties.communeCode)
    .filter((code) => !parentCodesWithChildren.has(code));
  if (missingParentCodes.length) throw new Error(`Communes without official IRIS: ${missingParentCodes.join(",")}`);

  const parentAreaByCode = new Map(communeFeatures.map((feature) => [
    feature.properties.communeCode,
    Number(feature.properties.officialAreaM2),
  ]));
  const childAreaByCode = new Map<string, number>();
  for (const feature of subzoneFeatures) {
    const code = feature.properties.parentCode;
    childAreaByCode.set(code, (childAreaByCode.get(code) ?? 0) + Number(feature.properties.officialAreaM2));
  }
  const coverageRatios = [...childAreaByCode].map(([code, childArea]) => ({
    code,
    ratio: childArea / Number(parentAreaByCode.get(code)) * 100,
  }));
  const invalidCoverage = coverageRatios.filter(({ ratio }) => !Number.isFinite(ratio) || ratio < 97.5 || ratio > 102.5);
  if (invalidCoverage.length) {
    throw new Error(`Unexpected IRIS/commune coverage: ${JSON.stringify(invalidCoverage)}`);
  }

  const generatedAt = new Date().toISOString();
  const communesCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt,
      source: "Data Grand Lyon - communes de la Metropole de Lyon a partir de 2024",
      datasetId: COMMUNES_COLLECTION_ID,
      datasetUrl: COMMUNES_DATASET_URL,
      membershipSource: EPCI_COMMUNES_API_URL,
      membershipYear: "2026",
      license: "Licence Ouverte / Open Licence",
      sourceYear: "2024",
      featureCount: communeFeatures.length,
      excludedCenterCode: LYON_COMMUNE_CODE,
    },
    features: communeFeatures,
  };
  const subzonesCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt,
      source: "Data Grand Lyon - Contours IRIS Grande Echelle",
      datasetId: IRIS_COLLECTION_ID,
      datasetUrl: IRIS_DATASET_URL,
      license: "Licence Ouverte / Open Licence",
      sourceYear: "2026",
      featureCount: subzoneFeatures.length,
      parentCount: parentCodesWithChildren.size,
      excludedCenterCode: LYON_COMMUNE_CODE,
      minParentCoveragePercent: Math.min(...coverageRatios.map(({ ratio }) => ratio)),
      maxParentCoveragePercent: Math.max(...coverageRatios.map(({ ratio }) => ratio)),
    },
    features: subzoneFeatures,
  };

  await mkdir(path.dirname(COMMUNES_OUTPUT_PATH), { recursive: true });
  await Promise.all([
    writeFile(COMMUNES_OUTPUT_PATH, `${JSON.stringify(communesCollection)}\n`, "utf8"),
    writeFile(SUBZONES_OUTPUT_PATH, `${JSON.stringify(subzonesCollection)}\n`, "utf8"),
  ]);
  console.log(`Generated ${communeFeatures.length} Lyon Metropole communes at ${COMMUNES_OUTPUT_PATH}`);
  console.log(`Generated ${subzoneFeatures.length} official IRIS subzones at ${SUBZONES_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
