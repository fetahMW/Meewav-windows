import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "nantes-quartiers.geojson");
const MICRO_DISTRICTS_LAYER_URL = "https://naogeow.nantesmetropole.fr/arcgis/rest/services/FondDePlan/FDC_gris_WMS_CC47/MapServer/68";
const MICRO_DISTRICTS_QUERY_URL = `${MICRO_DISTRICTS_LAYER_URL}/query`;
const MACRO_DISTRICTS_DATASET_ID = "244400404_quartiers-communes-nantes-metropole";
const MACRO_DISTRICTS_API_URL = `https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/${MACRO_DISTRICTS_DATASET_ID}/records`;
const EXPECTED_NANTES_DISTRICT_COUNT = 94;

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  if (!bbox.every(Number.isFinite)) throw new Error("Invalid district geometry bounds");
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

  if (!best) throw new Error(`Unable to place a label inside ${feature.properties?.nom ?? "district"}`);
  return best;
}

function normalizeDistrict(sourceFeature, parentLabels, colorIndex) {
  const record = sourceFeature.properties ?? {};
  const officialId = String(record.idobj ?? "").trim();
  const label = String(record.nom ?? "").trim();
  const commune = String(record.libcom ?? "").trim();
  const communeCode = String(record.codcom ?? "").replace(/\.0$/, "");
  const parentCode = String(record.quartier ?? "").trim();
  const parentLabel = parentLabels.get(parentCode) ?? `Quartier ${parentCode}`;
  const geometry = sourceFeature.geometry;

  if (!officialId || !label || !parentCode || commune !== "Nantes") {
    throw new Error(`Invalid Nantes district attributes: ${JSON.stringify({ officialId, label, parentCode, commune })}`);
  }
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    throw new Error(`Invalid geometry for Nantes district ${label}`);
  }

  const labelFeature = {
    type: "Feature",
    properties: record,
    geometry,
  };
  const [labelLng, labelLat] = getInteriorLabelPoint(labelFeature);
  const zoneId = `nantes_${officialId.padStart(4, "0")}_${slugify(label)}`;
  const sourceYear = Number.isFinite(Number(record.date_modification))
    ? String(new Date(Number(record.date_modification)).getUTCFullYear())
    : "2023";

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: officialId,
      arrondissementCode: parentCode,
      colorIndex,
      parentZoneId: `nantes_parent_${parentCode.padStart(2, "0")}_${slugify(parentLabel)}`,
      parentCode,
      parentLabel,
      territoryType: "quartier",
      source: "Nantes Métropole NAOGeoW",
      sourceYear,
      officialId,
      communeCode,
      officialAreaM2: Number(record["st_area(shape)"]) || undefined,
      labelLng,
      labelLat,
    },
    geometry,
  };
}

async function main() {
  const microDistrictsUrl = new URL(MICRO_DISTRICTS_QUERY_URL);
  microDistrictsUrl.searchParams.set("where", "1=1");
  microDistrictsUrl.searchParams.set("outFields", "*");
  microDistrictsUrl.searchParams.set("returnGeometry", "true");
  microDistrictsUrl.searchParams.set("outSR", "4326");
  microDistrictsUrl.searchParams.set("f", "geojson");

  const macroDistrictsUrl = new URL(MACRO_DISTRICTS_API_URL);
  macroDistrictsUrl.searchParams.set("limit", "100");
  macroDistrictsUrl.searchParams.set("where", 'libcom="Nantes"');

  const headers = { "user-agent": "Meewav-Web Nantes districts generator/2.0" };
  const [microResponse, macroResponse] = await Promise.all([
    fetch(microDistrictsUrl, { headers }),
    fetch(macroDistrictsUrl, { headers }),
  ]);
  if (!microResponse.ok || !macroResponse.ok) {
    throw new Error(`Nantes Métropole data failed: micro=${microResponse.status}, macro=${macroResponse.status}`);
  }

  const [microPayload, macroPayload] = await Promise.all([
    microResponse.json(),
    macroResponse.json(),
  ]);
  const sourceFeatures = Array.isArray(microPayload.features) ? microPayload.features : [];
  const macroRecords = Array.isArray(macroPayload.results) ? macroPayload.results : [];
  if (sourceFeatures.length !== EXPECTED_NANTES_DISTRICT_COUNT) {
    throw new Error(`Expected ${EXPECTED_NANTES_DISTRICT_COUNT} Nantes districts, received ${sourceFeatures.length}`);
  }

  const parentLabels = new Map(macroRecords.map((record) => [String(record.idobj), String(record.nom)]));
  sourceFeatures.sort((a, b) => String(a.properties?.idobj).localeCompare(String(b.properties?.idobj)));
  const features = sourceFeatures.map((feature, index) => normalizeDistrict(feature, parentLabels, index % 8));
  const zoneIds = new Set(features.map((feature) => feature.properties.zoneId));
  if (zoneIds.size !== features.length) throw new Error("Duplicate Nantes district IDs");

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Nantes Métropole NAOGeoW - Micro quartier Nantes",
      datasetId: "FondDePlan/FDC_gris_WMS_CC47/MapServer/68",
      datasetUrl: MICRO_DISTRICTS_LAYER_URL,
      license: "Licence Ouverte / Open Licence",
      featureCount: features.length,
    },
    features,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated ${features.length} official Nantes district polygons at ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
