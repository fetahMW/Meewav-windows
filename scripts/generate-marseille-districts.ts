import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoArea, geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "marseille-quartiers.geojson");
const DATASET_ID = "a7104f3c-e487-4af3-82ad-6197cedfaeb1";
const DATASET_URL = `https://data.ampmetropole.fr/explore/dataset/${DATASET_ID}/`;
const EXPORT_URL = `https://data.ampmetropole.fr/api/explore/v2.1/catalog/datasets/${DATASET_ID}/exports/geojson`;
const EXPECTED_DISTRICT_COUNT = 111;
const EXPECTED_ARRONDISSEMENT_COUNT = 16;
const EARTH_RADIUS_METERS = 6_371_008.8;

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
  if (!bbox.every(Number.isFinite)) throw new Error("Invalid Marseille district geometry bounds");
  return bbox;
}

function assertPolygonFeature(
  feature: GeoJSON.Feature,
  label: string,
): asserts feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>> {
  if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
    throw new Error(`Invalid geometry for Marseille district ${label}`);
  }
  const bbox = getGeometryBbox(feature.geometry);
  if (bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) {
    throw new Error(`Marseille district is not WGS84: ${label}`);
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

  if (!best) throw new Error(`Unable to place a label inside ${String(feature.properties?.nom_qua ?? "district")}`);
  return best;
}

function getArrondissementLabel(code: string) {
  const number = Number.parseInt(code.slice(-2), 10);
  if (!Number.isInteger(number) || number < 1 || number > 16) {
    throw new Error(`Invalid Marseille arrondissement code: ${code}`);
  }
  return `Marseille ${number}${number === 1 ? "er" : "e"} arrondissement`;
}

function normalizeDistrict(feature: GeoJSON.Feature, colorIndex: number) {
  const properties = feature.properties ?? {};
  const arrondissementCode = String(properties.depco ?? "").trim();
  const sourceLabel = String(properties.nom_qua ?? "").trim();
  if (!/^132(?:0[1-9]|1[0-6])$/.test(arrondissementCode) || !sourceLabel) {
    throw new Error(`Invalid Marseille district attributes: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, sourceLabel);

  const sourcePoint = properties.geo_point_2d as { lon?: unknown } | undefined;
  const sourceLongitude = Number(sourcePoint?.lon);
  // The AMP export labels both mainland Endoume and the Frioul polygon ENDOUME.
  // Marseille's official nomenclature identifies the western polygon as Les Iles.
  const label = arrondissementCode === "13207"
    && sourceLabel === "ENDOUME"
    && Number.isFinite(sourceLongitude)
    && sourceLongitude < 5.33
    ? "LES ÎLES"
    : sourceLabel;

  const districtSlug = slugify(label);
  const zoneId = `marseille_${arrondissementCode}_${districtSlug}`;
  const parentLabel = getArrondissementLabel(arrondissementCode);
  const [labelLng, labelLat] = getInteriorLabelPoint(feature);
  const officialAreaM2 = geoArea(feature) * EARTH_RADIUS_METERS ** 2;

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label: label.toLocaleLowerCase("fr-FR").replace(/(^|[\s'-])\p{L}/gu, (match) => match.toLocaleUpperCase("fr-FR")),
      districtCode: `${arrondissementCode}_${districtSlug}`,
      arrondissementCode,
      colorIndex,
      parentZoneId: `marseille_parent_${arrondissementCode}`,
      parentCode: arrondissementCode,
      parentLabel,
      territoryType: "quartier",
      source: "Métropole Aix-Marseille-Provence - Liste des quartiers de Marseille",
      sourceYear: "2015",
      officialId: `${arrondissementCode}:${label}`,
      communeCode: "13055",
      officialAreaM2,
      labelLng,
      labelLat,
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

async function main() {
  const response = await fetch(EXPORT_URL, {
    headers: {
      accept: "application/geo+json, application/json",
      "user-agent": "Meewav-Web Marseille districts generator/1.0",
    },
  });
  if (!response.ok) throw new Error(`Unable to download Marseille districts: HTTP ${response.status}`);
  const payload = await response.json();
  const sourceFeatures = Array.isArray(payload?.features) ? payload.features as GeoJSON.Feature[] : [];
  if (sourceFeatures.length !== EXPECTED_DISTRICT_COUNT) {
    throw new Error(`Expected ${EXPECTED_DISTRICT_COUNT} Marseille districts, received ${sourceFeatures.length}`);
  }

  sourceFeatures.sort((left, right) => {
    const arrondissementOrder = String(left.properties?.depco).localeCompare(String(right.properties?.depco));
    return arrondissementOrder || String(left.properties?.nom_qua).localeCompare(String(right.properties?.nom_qua), "fr");
  });
  const features = sourceFeatures.map((feature, index) => normalizeDistrict(feature, index % 8));
  const zoneIds = new Set(features.map((feature) => feature.properties.zoneId));
  const arrondissementCodes = new Set(features.map((feature) => feature.properties.arrondissementCode));
  if (zoneIds.size !== features.length) throw new Error("Duplicate Marseille district IDs");
  if (arrondissementCodes.size !== EXPECTED_ARRONDISSEMENT_COUNT) {
    throw new Error(`Expected ${EXPECTED_ARRONDISSEMENT_COUNT} Marseille arrondissements, received ${arrondissementCodes.size}`);
  }

  const areasKm2 = features.map((feature) => feature.properties.officialAreaM2 / 1_000_000).sort((a, b) => a - b);
  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Métropole Aix-Marseille-Provence - Liste des quartiers de Marseille",
      datasetId: DATASET_ID,
      datasetUrl: DATASET_URL,
      sourceGeometryYear: "2015",
      license: "Licence Ouverte 2.0 (Etalab)",
      sourceCorrections: [
        "The western 13207 polygon is labelled ENDOUME in the AMP export and restored to the official Marseille district name LES ÎLES.",
      ],
      featureCount: features.length,
      parentCount: arrondissementCodes.size,
      areaKm2: {
        min: areasKm2[0],
        median: areasKm2[Math.floor(areasKm2.length / 2)],
        mean: areasKm2.reduce((sum, area) => sum + area, 0) / areasKm2.length,
        max: areasKm2.at(-1),
      },
    },
    features,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated ${features.length} official Marseille district polygons at ${OUTPUT_PATH}`);
  console.log(`Arrondissements: ${arrondissementCodes.size}; area km2 min/median/max: ${areasKm2[0].toFixed(3)} / ${areasKm2[Math.floor(areasKm2.length / 2)].toFixed(3)} / ${areasKm2.at(-1)?.toFixed(3)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
