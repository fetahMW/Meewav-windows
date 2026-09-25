import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "trappes-quartiers.geojson");
const DATASET_ID = "contour-des-quartiers-iris-ca-saint-quentin-en-yvelines";
const DATASET_PAGE_URL = `https://opendata.sqy.fr/datasets/${DATASET_ID}`;
const DATASET_FILE_URL = "https://opendata.sqy.fr/data-fair/api/v1/datasets/exm-sh08l8cb6fg8lwnw2i1q/data-files/Contour_des_quartiers_IRIS_-_CA_Saint-Quentin-en-Yvelines-6.geojson";
const TRAPPES_COMMUNE_CODE = "78621";
const EXPECTED_SOURCE_FEATURE_COUNT = 89;
const EXPECTED_TRAPPES_IRIS_COUNT = 12;
const MIN_EXPECTED_OFFICIAL_AREA_M2 = 13_000_000;
const MAX_EXPECTED_OFFICIAL_AREA_M2 = 14_500_000;
const PRODUCT_LABEL_BY_OFFICIAL_ID = new Map([
  ["786210101", "Centre Ouest"],
  ["786210102", "Centre Est et Village"],
  ["786210103", "Boissière"],
  ["786210104", "Sand Pergaud Verlaine"],
  ["786210105", "Camus Cocteau"],
  ["786210106", "Carco Marot de Lurçat à Renoir"],
  ["786210107", "Van Gogh Montaigne France Ravel"],
  ["786210108", "Cité Nouvelle Barbusse"],
  ["786210109", "Wallon Védrines"],
  ["786210110", "Commune Lagrange"],
  ["786210111", "Langevin Thorez Farge"],
  ["786210112", "Macé ZAC Trappes Élancourt"],
]);

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatProductLabel(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("fr-FR"));
}

function visitCoordinates(coordinates, callback) {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
    callback(coordinates);
    return;
  }
  for (const item of coordinates) visitCoordinates(item, callback);
}

function getGeometryBbox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  visitCoordinates(geometry.coordinates, ([lng, lat]) => {
    bbox[0] = Math.min(bbox[0], lng);
    bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lng);
    bbox[3] = Math.max(bbox[3], lat);
  });
  if (!bbox.every(Number.isFinite)) throw new Error("Invalid Trappes IRIS geometry bounds");
  return bbox;
}

function isInside(feature, coordinates) {
  return booleanPointInPolygon(point(coordinates), feature);
}

function getInteriorLabelPoint(feature) {
  const bbox = getGeometryBbox(feature.geometry);
  const centroid = geoCentroid(feature);
  const bboxCenter = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  if (centroid.every(Number.isFinite) && isInside(feature, centroid)) return centroid;
  if (isInside(feature, bboxCenter)) return bboxCenter;

  const target = centroid.every(Number.isFinite) ? centroid : bboxCenter;
  const width = Math.max(1e-9, bbox[2] - bbox[0]);
  const height = Math.max(1e-9, bbox[3] - bbox[1]);
  let best = null;
  let bestDistance = Infinity;

  for (let row = 1; row < 40; row += 1) {
    for (let column = 1; column < 40; column += 1) {
      const candidate = [
        bbox[0] + width * column / 40,
        bbox[1] + height * row / 40,
      ];
      if (!isInside(feature, candidate)) continue;
      const normalizedDistance = ((candidate[0] - target[0]) / width) ** 2
        + ((candidate[1] - target[1]) / height) ** 2;
      if (normalizedDistance < bestDistance) {
        best = candidate;
        bestDistance = normalizedDistance;
      }
    }
  }

  if (!best) throw new Error(`Unable to place a label inside ${feature.properties?.NOM_IRIS ?? "Trappes IRIS"}`);
  return best;
}

function normalizeIris(sourceFeature, colorIndex) {
  const properties = sourceFeature.properties ?? {};
  const officialId = String(properties.DCOMIRIS ?? "").trim();
  const officialLabel = String(properties.NOM_IRIS ?? "").trim();
  const communeCode = String(properties.DEPCOM ?? "").trim();
  const communeLabel = String(properties.NOM_COM ?? "").trim();
  const geometry = sourceFeature.geometry;

  if (!officialId || !officialLabel || communeCode !== TRAPPES_COMMUNE_CODE || communeLabel !== "TRAPPES") {
    throw new Error(`Invalid Trappes IRIS attributes: ${JSON.stringify({ officialId, officialLabel, communeCode, communeLabel })}`);
  }
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    throw new Error(`Invalid geometry for Trappes IRIS ${officialId}`);
  }

  const label = PRODUCT_LABEL_BY_OFFICIAL_ID.get(officialId) ?? formatProductLabel(officialLabel);
  const labelFeature = { type: "Feature", properties, geometry };
  const [labelLng, labelLat] = getInteriorLabelPoint(labelFeature);
  const zoneId = `trappes_${officialId}_${slugify(label)}`;

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: officialId,
      arrondissementCode: communeCode,
      colorIndex,
      parentZoneId: `trappes_commune_${communeCode}`,
      parentCode: communeCode,
      parentLabel: "Trappes",
      territoryType: "iris",
      source: "Saint-Quentin-en-Yvelines Open Data (IGN - INSEE, Contours...Iris)",
      sourceYear: "2015",
      officialId,
      officialLabel,
      communeCode,
      officialAreaM2: Number(properties["SHAPE.AREA"]) || undefined,
      labelLng,
      labelLat,
    },
    geometry,
  };
}

async function main() {
  const response = await fetch(DATASET_FILE_URL, {
    headers: { "user-agent": "Meewav-Web Trappes districts generator/1.0" },
  });
  if (!response.ok) {
    throw new Error(`SQY Trappes IRIS data failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const sourceFeatures = Array.isArray(payload.features) ? payload.features : [];
  if (sourceFeatures.length !== EXPECTED_SOURCE_FEATURE_COUNT) {
    throw new Error(`Expected ${EXPECTED_SOURCE_FEATURE_COUNT} SQY IRIS features, received ${sourceFeatures.length}`);
  }

  const trappesFeatures = sourceFeatures
    .filter((feature) => String(feature.properties?.DEPCOM ?? "") === TRAPPES_COMMUNE_CODE)
    .sort((a, b) => String(a.properties?.DCOMIRIS ?? "").localeCompare(String(b.properties?.DCOMIRIS ?? "")));
  if (trappesFeatures.length !== EXPECTED_TRAPPES_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_TRAPPES_IRIS_COUNT} Trappes IRIS features, received ${trappesFeatures.length}`);
  }

  const officialAreaM2 = trappesFeatures.reduce(
    (total, feature) => total + (Number(feature.properties?.["SHAPE.AREA"]) || 0),
    0,
  );
  if (officialAreaM2 < MIN_EXPECTED_OFFICIAL_AREA_M2 || officialAreaM2 > MAX_EXPECTED_OFFICIAL_AREA_M2) {
    throw new Error(`Unexpected Trappes official area: ${officialAreaM2} m2`);
  }

  const features = trappesFeatures.map((feature, index) => normalizeIris(feature, index % 8));
  const zoneIds = new Set(features.map((feature) => feature.properties.zoneId));
  if (zoneIds.size !== features.length) throw new Error("Duplicate Trappes IRIS zone IDs");

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Saint-Quentin-en-Yvelines Open Data - IGN / INSEE Contours...Iris",
      sourceYear: "2015",
      datasetId: DATASET_ID,
      datasetUrl: DATASET_PAGE_URL,
      sourceFileUrl: DATASET_FILE_URL,
      license: "Licence Ouverte / Open Licence version 2.0",
      communeCode: TRAPPES_COMMUNE_CODE,
      officialAreaM2,
      featureCount: features.length,
    },
    features,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated ${features.length} official Trappes IRIS polygons at ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
