import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "grand-paris-communes-overview.geojson");
const PARIS_BOUNDARY_OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "paris-overview-boundary.geojson");
const GEO_API_URL = "https://geo.api.gouv.fr/communes";

const GRAND_PARIS_DEPARTMENT_CODES = ["92", "93", "94"];
const EXTRA_GRAND_PARIS_COMMUNE_CODES = ["95018"];
const GRAND_PARIS_GROUND_ROTATION = [
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

function getColorIndex(code: string) {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = ((hash * 31) + code.charCodeAt(index)) >>> 0;
  }
  return hash % GRAND_PARIS_GROUND_ROTATION.length;
}

function getGroundColor(code: string) {
  const colorIndex = getColorIndex(code);
  return GRAND_PARIS_GROUND_ROTATION[colorIndex % GRAND_PARIS_GROUND_ROTATION.length];
}

function getLabelRank(population: unknown) {
  const value = Number(population);
  if (Number.isFinite(value) && value >= 100000) return 1;
  if (Number.isFinite(value) && value >= 55000) return 2;
  return 3;
}

async function fetchGeoApiCollection(url: URL) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Meewav-Web grand paris overview generator/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`geo.api.gouv.fr failed for ${url.toString()}: ${response.status}`);
  }

  return response.json();
}

function normalizeCommuneFeature(feature) {
  const code = String(feature.properties?.code ?? "");
  if (!code || !feature?.geometry) {
    throw new Error("Invalid commune feature from geo.api.gouv.fr");
  }

  feature.id = `grand_paris_commune_${code}`;
  feature.properties = {
    id: `grand_paris_commune_${code}`,
    code,
    name: feature.properties?.nom ?? code,
    label: feature.properties?.nom ?? code,
    colorIndex: getColorIndex(code),
    groundColor: getGroundColor(code),
    rank: getLabelRank(feature.properties?.population),
    population: feature.properties?.population ?? null,
    departmentCode: feature.properties?.departement?.code ?? "",
    departmentName: feature.properties?.departement?.nom ?? "",
    source: "geo.api.gouv.fr",
  };

  return feature;
}

async function fetchDepartmentCommuneFeatures(departmentCode: string) {
  const url = new URL(GEO_API_URL);
  url.searchParams.set("codeDepartement", departmentCode);
  url.searchParams.set("fields", "nom,code,departement,region,population");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("geometry", "contour");

  const collection = await fetchGeoApiCollection(url);
  return (collection?.features ?? []).map(normalizeCommuneFeature);
}

async function fetchCommuneFeature(code: string) {
  const url = new URL(GEO_API_URL);
  url.searchParams.set("code", code);
  url.searchParams.set("fields", "nom,code,departement,region,population");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("geometry", "contour");

  const collection = await fetchGeoApiCollection(url);
  const feature = collection?.features?.[0];
  if (!feature?.geometry) {
    throw new Error(`Missing commune geometry for ${code}`);
  }
  return normalizeCommuneFeature(feature);
}

async function fetchParisBoundaryFeature() {
  const url = new URL(GEO_API_URL);
  url.searchParams.set("code", "75056");
  url.searchParams.set("fields", "nom,code,departement,region,population");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("geometry", "contour");

  const collection = await fetchGeoApiCollection(url);
  const feature = collection?.features?.[0];
  if (!feature?.geometry) {
    throw new Error("Missing official Paris boundary contour");
  }

  feature.id = "paris_official_boundary_75056";
  feature.properties = {
    id: "paris_official_boundary_75056",
    code: "75056",
    name: "Paris",
    label: "Paris",
    source: "geo.api.gouv.fr",
  };

  return feature;
}

async function main() {
  const features = [];
  for (const departmentCode of GRAND_PARIS_DEPARTMENT_CODES) {
    features.push(...await fetchDepartmentCommuneFeatures(departmentCode));
  }
  for (const communeCode of EXTRA_GRAND_PARIS_COMMUNE_CODES) {
    features.push(await fetchCommuneFeature(communeCode));
  }
  features.sort((a, b) => String(a.properties?.code).localeCompare(String(b.properties?.code)));

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "geo.api.gouv.fr communes geometry=contour, departments 92/93/94 + selected adjacent communes",
      featureCount: features.length,
    },
    features,
  };
  const parisBoundaryCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "geo.api.gouv.fr commune 75056 geometry=contour",
      featureCount: 1,
    },
    features: [await fetchParisBoundaryFeature()],
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  await writeFile(PARIS_BOUNDARY_OUTPUT_PATH, `${JSON.stringify(parisBoundaryCollection)}\n`, "utf8");
  console.log(`Generated ${features.length} Grand Paris commune polygons at ${OUTPUT_PATH}`);
  console.log(`Generated official Paris boundary at ${PARIS_BOUNDARY_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
