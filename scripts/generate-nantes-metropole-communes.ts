import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { geoCentroid } from "d3-geo";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMUNES_OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "nantes-metropole-communes.geojson");
const SUBZONES_OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "nantes-metropole-subzones.geojson");

const NANTES_COMMUNE_CODE = "44109";
const EXPECTED_METROPOLE_COMMUNE_COUNT = 24;
const EXPECTED_SURROUNDING_COMMUNE_COUNT = 23;
const EXPECTED_METROPOLE_IRIS_COUNT = 235;
const EXPECTED_SURROUNDING_IRIS_COUNT = 138;

const COMMUNES_DATASET_ID = "244400404_communes-nantes-metropole";
const COMMUNES_DATASET_URL = `https://data.nantesmetropole.fr/explore/dataset/${COMMUNES_DATASET_ID}/`;
const COMMUNES_EXPORT_URL = `https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/${COMMUNES_DATASET_ID}/exports/geojson`;
const IRIS_WFS_URL = "https://data.geopf.fr/wfs/ows";
const GEO_API_COMMUNES_URL = "https://geo.api.gouv.fr/communes";

const METROPOLE_BBOX = [-1.85, 46.95, -1.2, 47.55] as const;
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

async function fetchJson(url: URL | string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/geo+json, application/json",
      "user-agent": "Meewav-Web Nantes Metropole communes generator/1.0",
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
  url.searchParams.set("COUNT", "1000");
  url.searchParams.set("BBOX", `${METROPOLE_BBOX.join(",")},EPSG:4326`);
  url.searchParams.set("SRSNAME", "EPSG:4326");
  return fetchJson(url);
}

async function fetchPopulationByCommuneCode() {
  const url = new URL(GEO_API_COMMUNES_URL);
  url.searchParams.set("codeDepartement", "44");
  url.searchParams.set("fields", "nom,code,population");
  const records = await fetchJson(url) as Array<{ code?: string; population?: number }>;
  return new Map(records.map((record) => [String(record.code ?? ""), Number(record.population) || 0]));
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

function normalizeCommune(
  feature: GeoJSON.Feature,
  populationByCode: Map<string, number>,
) {
  const properties = feature.properties ?? {};
  const code = String(properties.id_insee ?? "").trim();
  const label = String(properties.toponyme ?? properties.nom ?? "").trim();
  if (!code || !label) throw new Error(`Invalid Nantes Metropole commune: ${JSON.stringify(properties)}`);
  assertPolygonFeature(feature, label);

  const zoneId = `nantes_metropole_commune_${code}`;
  const labelPoint = getInteriorLabelPoint(feature);
  const population = populationByCode.get(code) ?? 0;
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
      arrondissementCode: "44",
      colorIndex: getColorIndex(code),
      groundColor: getGroundColor(code),
      isSelectable: true,
      hoverCountLabel: "0",
      parentZoneId: "nantes_metropole",
      parentCode: "nantes_metropole",
      parentLabel: "Nantes Métropole",
      territoryType: "commune",
      paletteFamily: "metropolitan",
      source: "Nantes Métropole Open Data - emprise des communes",
      sourceYear: "2022",
      officialId: String(properties.idobj ?? code),
      communeCode: code,
      officialAreaM2: geometryAreaMeters(feature.geometry),
      population,
      rank: getLabelRank(population),
      labelLng: labelPoint[0],
      labelLat: labelPoint[1],
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
  const communeCode = String(properties.code_insee ?? "").trim();
  const irisCode = String(properties.code_iris ?? "").trim();
  const localIrisCode = String(properties.iris ?? "").trim();
  const label = String(properties.nom_iris ?? "").trim();
  const parentLabel = communeLabelsByCode.get(communeCode) ?? String(properties.nom_commune ?? "").trim();
  if (!communeCode || !irisCode || !label || !parentLabel) {
    throw new Error(`Invalid Nantes Metropole IRIS: ${JSON.stringify(properties)}`);
  }
  assertPolygonFeature(feature, `${parentLabel} / ${label}`);

  const zoneId = `nantes_metropole_subzone_${communeCode}_${localIrisCode}_${slugify(label)}`;
  const labelPoint = getInteriorLabelPoint(feature);
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
      parentZoneId: `nantes_metropole_commune_${communeCode}`,
      parentCode: communeCode,
      parentLabel,
      territoryType: "iris",
      paletteFamily: "metropolitan",
      source: "IGN / INSEE - Contours IRIS WFS Géoplateforme",
      sourceYear: "2026",
      officialId: irisCode,
      sourceCleabs: String(properties.cleabs ?? ""),
      communeCode,
      irisCode: localIrisCode,
      irisType: String(properties.type_iris ?? ""),
      officialAreaM2: geometryAreaMeters(feature.geometry),
      labelLng: labelPoint[0],
      labelLat: labelPoint[1],
    },
    geometry: feature.geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

async function main() {
  const [communesPayload, irisPayload, populationByCode] = await Promise.all([
    fetchJson(COMMUNES_EXPORT_URL),
    fetchIrisCollection(),
    fetchPopulationByCommuneCode(),
  ]);

  const sourceCommunes = Array.isArray(communesPayload?.features) ? communesPayload.features as GeoJSON.Feature[] : [];
  if (sourceCommunes.length !== EXPECTED_METROPOLE_COMMUNE_COUNT) {
    throw new Error(`Expected ${EXPECTED_METROPOLE_COMMUNE_COUNT} Nantes Metropole communes, received ${sourceCommunes.length}`);
  }

  const communeCodes = new Set(sourceCommunes.map((feature) => String(feature.properties?.id_insee ?? "")));
  const sourceIris = (Array.isArray(irisPayload?.features) ? irisPayload.features as GeoJSON.Feature[] : [])
    .filter((feature) => communeCodes.has(String(feature.properties?.code_insee ?? "")));
  if (sourceIris.length !== EXPECTED_METROPOLE_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_METROPOLE_IRIS_COUNT} Nantes Metropole IRIS, received ${sourceIris.length}`);
  }

  const surroundingCommuneFeatures = sourceCommunes
    .filter((feature) => String(feature.properties?.id_insee ?? "") !== NANTES_COMMUNE_CODE)
    .sort((a, b) => String(a.properties?.id_insee).localeCompare(String(b.properties?.id_insee)))
    .map((feature) => normalizeCommune(feature, populationByCode));
  if (surroundingCommuneFeatures.length !== EXPECTED_SURROUNDING_COMMUNE_COUNT) {
    throw new Error(`Expected ${EXPECTED_SURROUNDING_COMMUNE_COUNT} surrounding communes, received ${surroundingCommuneFeatures.length}`);
  }

  const communeLabelsByCode = new Map(
    surroundingCommuneFeatures.map((feature) => [
      String(feature.properties.communeCode),
      String(feature.properties.label),
    ]),
  );
  const surroundingIrisFeatures = sourceIris
    .filter((feature) => String(feature.properties?.code_insee ?? "") !== NANTES_COMMUNE_CODE)
    .sort((a, b) => String(a.properties?.code_iris).localeCompare(String(b.properties?.code_iris)))
    .map((feature, index) => normalizeIris(feature, communeLabelsByCode, index % 8));
  if (surroundingIrisFeatures.length !== EXPECTED_SURROUNDING_IRIS_COUNT) {
    throw new Error(`Expected ${EXPECTED_SURROUNDING_IRIS_COUNT} surrounding IRIS, received ${surroundingIrisFeatures.length}`);
  }

  const communeZoneIds = new Set(surroundingCommuneFeatures.map((feature) => feature.properties.zoneId));
  const subzoneIds = new Set(surroundingIrisFeatures.map((feature) => feature.properties.zoneId));
  if (communeZoneIds.size !== surroundingCommuneFeatures.length) throw new Error("Duplicate Nantes Metropole commune IDs");
  if (subzoneIds.size !== surroundingIrisFeatures.length) throw new Error("Duplicate Nantes Metropole IRIS IDs");
  for (const feature of surroundingIrisFeatures) {
    if (!communeZoneIds.has(feature.properties.parentZoneId)) {
      throw new Error(`Unknown parent ${feature.properties.parentZoneId} for ${feature.properties.zoneId}`);
    }
  }

  const irisCountsByCommune = new Map<string, number>();
  for (const feature of surroundingIrisFeatures) {
    const code = String(feature.properties.communeCode);
    irisCountsByCommune.set(code, (irisCountsByCommune.get(code) ?? 0) + 1);
  }
  const undividedCommuneCodes = [...irisCountsByCommune.entries()]
    .filter(([, count]) => count === 1)
    .map(([code]) => code)
    .sort();

  const generatedAt = new Date().toISOString();
  const communesCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt,
      source: "Nantes Métropole Open Data - Communes de Nantes Métropole",
      datasetId: COMMUNES_DATASET_ID,
      datasetUrl: COMMUNES_DATASET_URL,
      license: "Licence Ouverte / Open Licence",
      featureCount: surroundingCommuneFeatures.length,
      excludedCityCode: NANTES_COMMUNE_CODE,
    },
    features: surroundingCommuneFeatures,
  };
  const subzonesCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt,
      source: "IGN / INSEE - Contours IRIS via Géoplateforme WFS",
      datasetUrl: "https://www.data.gouv.fr/datasets/contours-iris-r-2",
      wfsTypeName: "STATISTICALUNITS.IRIS:contours_iris",
      license: "Licence Ouverte / Open Licence version 2.0",
      featureCount: surroundingIrisFeatures.length,
      parentCommuneCount: surroundingCommuneFeatures.length,
      undividedCommuneCodes,
    },
    features: surroundingIrisFeatures,
  };

  await mkdir(path.dirname(COMMUNES_OUTPUT_PATH), { recursive: true });
  await Promise.all([
    writeFile(COMMUNES_OUTPUT_PATH, `${JSON.stringify(communesCollection)}\n`, "utf8"),
    writeFile(SUBZONES_OUTPUT_PATH, `${JSON.stringify(subzonesCollection)}\n`, "utf8"),
  ]);

  console.log(`Generated ${surroundingCommuneFeatures.length} Nantes Metropole commune polygons.`);
  console.log(`Generated ${surroundingIrisFeatures.length} official IGN/INSEE IRIS subzones.`);
  console.log(`Official single-IRIS communes: ${undividedCommuneCodes.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
