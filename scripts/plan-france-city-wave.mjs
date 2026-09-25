#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  COMMUNE_IRIS_MODES,
  classifyCommuneIrisInventory,
} from "./geo/lib/classify-commune-iris.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const limit = Number(process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1] ?? 100);
const wave = Number(process.argv.find((argument) => argument.startsWith("--wave="))?.split("=")[1] ?? 6);
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="))?.split("=")[1]
  ?? `geo/work/france-wave-${wave}-plan.json`;

if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error(`Invalid --limit=${limit}; expected an integer between 1 and 500`);
}

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(rootDirectory, relativePath), "utf8"));

function normalizeText(value) {
  return String(value ?? "")
    .replace(/œ/giu, (match) => (match === match.toUpperCase() ? "OE" : "oe"))
    .replace(/æ/giu, (match) => (match === match.toUpperCase() ? "AE" : "ae"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCommuneCode(feature) {
  const properties = feature?.properties ?? {};
  return String(properties.communeCode ?? properties.code ?? properties.districtCode ?? "").trim();
}

function isMetropolitanFranceResult(result) {
  const departmentCode = String(result.departmentCode ?? "").toUpperCase();
  return departmentCode === "2A" || departmentCode === "2B" || /^\d{2}$/.test(departmentCode);
}

function compareCandidates(first, second) {
  const populationDifference = Number(second.population ?? 0) - Number(first.population ?? 0);
  if (populationDifference) return populationDifference;
  const labelDifference = String(first.name).localeCompare(String(second.name), "fr", { sensitivity: "base" });
  if (labelDifference) return labelDifference;
  return String(first.id).localeCompare(String(second.id));
}

function createWfsUrl(source, communeCodes) {
  const url = new URL(source.wfsUrl);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", source.typeName);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("COUNT", "10000");
  url.searchParams.set("CQL_FILTER", `code_insee IN (${communeCodes.map((code) => `'${code}'`).join(",")})`);
  url.searchParams.set("PROPERTYNAME", "code_insee,nom_commune,code_iris,nom_iris,type_iris");
  return url;
}

async function fetchIrisInventory(source, candidates) {
  const features = [];
  const batchSize = 40;
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const url = createWfsUrl(source, batch.map((candidate) => candidate.communeCode));
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": `Meewav-Web France city wave ${wave} planner/1.0`,
      },
    });
    if (!response.ok) throw new Error(`WFS inventory failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      throw new Error("WFS inventory is not a FeatureCollection");
    }
    features.push(...payload.features);
  }
  return features;
}

function getLexicalRisks(labels, cityName) {
  const normalizedCounts = new Map();
  const numbered = [];
  const technical = [];
  const operational = [];
  const directional = [];
  const generic = [];
  const normalizedCity = normalizeText(cityName).replace(/[^a-z0-9]+/g, " ").trim();
  const escapedCity = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cityPrefixedStatisticalPattern = escapedCity.length > 0
    ? new RegExp(`^${escapedCity}\\s+\\d+(?:\\s+.+)?$`, "u")
    : null;

  for (const label of labels) {
    const normalized = normalizeText(label).replace(/[^a-z0-9]+/g, " ").trim();
    normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
    if (
      /^(?:iris|quartier|secteur|s)\s*[-_. ]?\s*\d+$/iu.test(label)
      || /^\d+$/u.test(label)
      || cityPrefixedStatisticalPattern?.test(normalized)
    ) technical.push(label);
    if (/\b(?:z\s*[ai]|zac|zone)(?:\b|\s)/u.test(normalized)) operational.push(label);
    if (/^(?:nord|sud|est|ouest|nord est|nord ouest|sud est|sud ouest)$/u.test(normalized)) directional.push(label);
    if (/^(?:centre|centre ville|centre urbain|historique|collectif|economique|peripherie|ecarts ruraux|zone urbaine|zone periurbaine|zone rurale|campagne)$/u.test(normalized)) generic.push(label);
    if (/\d+\s*$/u.test(label)) numbered.push(label);
  }

  return {
    technical,
    numbered,
    duplicates: [...normalizedCounts.entries()].filter(([, count]) => count > 1).map(([label, count]) => ({ label, count })),
    operational,
    directional,
    generic,
  };
}

const [searchIndex, cityCatalog, existingDatasets] = await Promise.all([
  readJson("public/search/france-communes-index.json"),
  readJson("geo/catalog/france-city-iris.json"),
  readJson("geo/catalog/existing-datasets.json"),
]);

const coveredCodes = new Set(cityCatalog.cities.map((city) => String(city.communeCode)));
for (const dataset of existingDatasets.datasets) {
  if (dataset.communeCode) coveredCodes.add(String(dataset.communeCode));
  if (dataset.role !== "communes" || !dataset.inputPath) continue;
  const collection = await readJson(dataset.inputPath);
  for (const feature of collection.features ?? []) {
    const code = getCommuneCode(feature);
    if (code) coveredCodes.add(code);
  }
}

const candidatePool = searchIndex.results
  .filter((result) => result.type === "city" || result.type === "commune")
  .filter(isMetropolitanFranceResult)
  .map((result) => ({
    id: slugify(result.label),
    name: result.label,
    featureId: result.id,
    communeCode: String(result.id).replace(/^commune-/, ""),
    population: Number(result.population ?? 0),
    departmentCode: String(result.departmentCode ?? ""),
    departmentName: String(result.departmentName ?? ""),
    regionName: String(result.regionName ?? ""),
    searchCenter: result.center,
  }))
  .filter((candidate) => candidate.communeCode && !coveredCodes.has(candidate.communeCode))
  .sort(compareCandidates);

if (candidatePool.length < limit) {
  throw new Error(`Expected at least ${limit} uncovered candidates, found ${candidatePool.length}`);
}

const featuresByCommuneCode = new Map();
const classificationByCommuneCode = new Map();
const selectedCandidates = [];
const deferredCandidates = [];
const scannedCandidates = [];
const scanBatchSize = Math.max(40, Math.min(200, limit));

for (let offset = 0; offset < candidatePool.length && selectedCandidates.length < limit; offset += scanBatchSize) {
  const batch = candidatePool.slice(offset, offset + scanBatchSize);
  const inventoryFeatures = await fetchIrisInventory(cityCatalog.source, batch);
  const batchFeaturesByCommuneCode = new Map();
  for (const feature of inventoryFeatures) {
    const code = String(feature?.properties?.code_insee ?? "");
    if (!batchFeaturesByCommuneCode.has(code)) batchFeaturesByCommuneCode.set(code, []);
    batchFeaturesByCommuneCode.get(code).push(feature);
  }

  for (const candidate of batch) {
    const features = (batchFeaturesByCommuneCode.get(candidate.communeCode) ?? [])
      .sort((first, second) => String(first.properties?.code_iris).localeCompare(String(second.properties?.code_iris)));
    const classification = classifyCommuneIrisInventory(features);
    featuresByCommuneCode.set(candidate.communeCode, features);
    classificationByCommuneCode.set(candidate.communeCode, classification);
    scannedCandidates.push(candidate);

    if (classification.eligibleForSplitCityWave) {
      selectedCandidates.push(candidate);
    } else {
      deferredCandidates.push({
        ...candidate,
        sourceFeatureCount: classification.sourceFeatureCount,
        distinctOfficialIrisCount: classification.distinctIrisCount,
        mode: classification.mode,
        classificationReason: classification.reason,
        sourceIris: features.map((feature) => ({
          id: String(feature.properties?.code_iris ?? ""),
          label: String(feature.properties?.nom_iris ?? ""),
          type: String(feature.properties?.type_iris ?? ""),
        })),
      });
    }

    // The population-sorted boundary is the first candidate that completes the
    // requested multi-IRIS wave. Candidates below it belong to the next wave,
    // even when the final WFS batch already fetched their inventory.
    if (selectedCandidates.length === limit) break;
  }
}

if (selectedCandidates.length !== limit) {
  throw new Error(
    `Expected ${limit} uncovered multi-IRIS communes, found ${selectedCandidates.length} after scanning ${scannedCandidates.length}`,
  );
}

const plannedCities = selectedCandidates.map((candidate, index) => {
  const features = (featuresByCommuneCode.get(candidate.communeCode) ?? [])
    .sort((first, second) => String(first.properties?.code_iris).localeCompare(String(second.properties?.code_iris)));
  const labels = features.map((feature) => String(feature.properties?.nom_iris ?? "").trim());
  const lexicalRisks = getLexicalRisks(labels, candidate.name);
  const classification = classificationByCommuneCode.get(candidate.communeCode)
    ?? classifyCommuneIrisInventory(features);
  const mode = classification.mode;
  const requiresExplicitSemanticResolution = lexicalRisks.technical.length > 0
    || lexicalRisks.numbered.length > 0
    || lexicalRisks.duplicates.length > 0
    || lexicalRisks.operational.length > 0
    || lexicalRisks.directional.length > 0
    || lexicalRisks.generic.length > 0;
  return {
    rank: index + 1,
    ...candidate,
    sourceFeatureCount: features.length,
    distinctOfficialIrisCount: classification.distinctIrisCount,
    mode,
    classificationReason: classification.reason,
    eligibleForSplitCityWave: classification.eligibleForSplitCityWave,
    status: mode === COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED || requiresExplicitSemanticResolution
      ? "resolution_required"
      : "pending_semantic_review",
    sourceIris: features.map((feature) => ({
      id: String(feature.properties?.code_iris ?? ""),
      label: String(feature.properties?.nom_iris ?? ""),
      type: String(feature.properties?.type_iris ?? ""),
    })),
    lexicalRisks,
  };
});

const modeTotals = {
  split: plannedCities.filter((city) => city.mode === COMMUNE_IRIS_MODES.SPLIT).length,
  singlePlate: plannedCities.filter((city) => city.mode === COMMUNE_IRIS_MODES.SINGLE_PLATE).length,
  inventoryResolutionRequired: plannedCities.filter(
    (city) => city.mode === COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
  ).length,
};
if (modeTotals.split + modeTotals.singlePlate + modeTotals.inventoryResolutionRequired !== plannedCities.length) {
  throw new Error("IRIS classification totals do not cover every planned commune exactly once");
}

const classificationReasons = Object.fromEntries(
  [...new Set(plannedCities.map((city) => city.classificationReason))]
    .sort((first, second) => first.localeCompare(second))
    .map((reason) => [reason, plannedCities.filter((city) => city.classificationReason === reason).length]),
);

const output = {
  schemaVersion: 1,
  wave,
  generatedAt: new Date().toISOString(),
  selection: {
    order: "population desc, French label asc, commune code asc",
    geographicScope: "metropolitan France and Corsica",
    eligibility: "multiple distinct official INSEE IRIS",
    excludedDirectCommuneCount: coveredCodes.size,
    requestedCount: limit,
    scannedCandidateCount: scannedCandidates.length,
    deferredSinglePlateCount: deferredCandidates.filter(
      (candidate) => candidate.mode === COMMUNE_IRIS_MODES.SINGLE_PLATE,
    ).length,
    deferredInventoryResolutionCount: deferredCandidates.filter(
      (candidate) => candidate.mode === COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
    ).length,
  },
  source: cityCatalog.source,
  totals: {
    cities: plannedCities.length,
    officialIris: plannedCities.reduce((sum, city) => sum + city.sourceFeatureCount, 0),
    split: modeTotals.split,
    splitWaveEligible: modeTotals.split,
    singlePlate: modeTotals.singlePlate,
    singlePlateOutsideSplitWave: modeTotals.singlePlate,
    inventoryResolutionRequired: modeTotals.inventoryResolutionRequired,
    // Backward-compatible aggregate retained for existing wave tooling.
    missingOfficialSplit: modeTotals.inventoryResolutionRequired,
    classificationReasons,
    semanticResolutionRequired: plannedCities.filter((city) => city.status === "resolution_required").length,
    pendingSemanticReview: plannedCities.filter((city) => city.status === "pending_semantic_review").length,
  },
  deferredCandidates,
  cities: plannedCities,
};

const outputPath = path.resolve(rootDirectory, outputArgument);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Planned France wave ${wave}: ${output.totals.cities} cities, ${output.totals.officialIris} official IRIS`);
console.log(`Modes: ${output.totals.split} split, ${output.totals.singlePlate} single plate, ${output.totals.inventoryResolutionRequired} inventory resolutions`);
console.log(`Semantic preflight: ${output.totals.semanticResolutionRequired} explicit resolutions, ${output.totals.pendingSemanticReview} standard reviews`);
console.log(outputPath);
