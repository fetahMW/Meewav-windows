#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateCityIris } from "./geo/lib/generate-city-iris.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readOption(argumentsList, name, fallback = null) {
  const prefix = `--${name}=`;
  return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasFlag(argumentsList, name) {
  return argumentsList.includes(`--${name}`);
}

async function readJson(absolutePath) {
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function featureFingerprint(feature) {
  return createHash("sha256").update(JSON.stringify(feature)).digest("hex");
}

export async function indexCachedIrisFeatures(cacheDirectory, targetCommuneCodes) {
  const targetCodes = new Set([...targetCommuneCodes].map(String));
  const featuresByCommune = new Map([...targetCodes].map((code) => [code, new Map()]));
  const files = (await readdir(cacheDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(cacheDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
  let inspectedFiles = 0;
  let irisCacheFiles = 0;

  for (const cachePath of files) {
    const payload = await readJson(cachePath);
    inspectedFiles += 1;
    if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) continue;
    const irisFeatures = payload.features.filter((feature) => {
      const properties = feature?.properties ?? {};
      return properties.code_iris && targetCodes.has(String(properties.code_insee ?? ""));
    });
    if (!irisFeatures.length) continue;
    irisCacheFiles += 1;

    for (const feature of irisFeatures) {
      const communeCode = String(feature.properties.code_insee);
      const sourceId = String(feature.properties.code_iris);
      const communeFeatures = featuresByCommune.get(communeCode);
      const previous = communeFeatures.get(sourceId);
      if (previous && featureFingerprint(previous) !== featureFingerprint(feature)) {
        throw new Error(`WFS cache contains conflicting copies of IRIS ${sourceId}`);
      }
      communeFeatures.set(sourceId, feature);
    }
  }

  return { featuresByCommune, inspectedFiles, irisCacheFiles };
}

function getExpectedSourceInventory(plannedCity) {
  const expectedCount = Number(plannedCity.sourceFeatureCount);
  const sources = Array.isArray(plannedCity.sourceIris) ? plannedCity.sourceIris : [];
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || sources.length !== expectedCount) {
    throw new Error(`${plannedCity.id} plan has an invalid exact source inventory`);
  }
  const byId = new Map();
  for (const source of sources) {
    const sourceId = String(source?.id ?? "").trim();
    if (!sourceId || byId.has(sourceId)) {
      throw new Error(`${plannedCity.id} plan has a missing or duplicate exact source IRIS ID`);
    }
    byId.set(sourceId, source);
  }
  return byId;
}

function getOutputSourceIdCounts(collection) {
  const counts = new Map();
  for (const feature of collection.features ?? []) {
    const properties = feature?.properties ?? {};
    const sourceIds = Array.isArray(properties.sourceIrisIds)
      ? properties.sourceIrisIds
      : [properties.officialId];
    for (const rawSourceId of sourceIds) {
      const sourceId = String(rawSourceId ?? "").trim();
      if (!sourceId || sourceId.startsWith("iris-group:")) continue;
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
    }
  }
  return counts;
}

function sameExactIdInventory(expectedById, actualIds) {
  return actualIds.size === expectedById.size
    && [...expectedById.keys()].every((sourceId) => actualIds.has(sourceId));
}

export function validateCachedInventory(city, cachedFeaturesById) {
  const expectedById = getExpectedSourceInventory(city);
  if (!sameExactIdInventory(expectedById, cachedFeaturesById)) {
    const missing = [...expectedById.keys()].filter((sourceId) => !cachedFeaturesById.has(sourceId));
    const unexpected = [...cachedFeaturesById.keys()].filter((sourceId) => !expectedById.has(sourceId));
    return {
      valid: false,
      detail: `${city.id} (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`,
    };
  }
  for (const [sourceId, expected] of expectedById) {
    const properties = cachedFeaturesById.get(sourceId)?.properties ?? {};
    if (String(properties.code_insee ?? "").trim() !== String(city.communeCode)) {
      return { valid: false, detail: `${city.id} (${sourceId} commune drift)` };
    }
    if (String(properties.nom_iris ?? "").trim() !== String(expected.label ?? "").trim()) {
      return { valid: false, detail: `${city.id} (${sourceId} label drift)` };
    }
    if (
      expected.type !== undefined
      && String(properties.type_iris ?? "").trim().toUpperCase() !== String(expected.type).trim().toUpperCase()
    ) {
      return { valid: false, detail: `${city.id} (${sourceId} type drift)` };
    }
  }
  return { valid: true, detail: null };
}

export async function existingOutputIsUsable(root, city, plannedCity) {
  try {
    const collection = await readJson(path.resolve(root, city.outputPath));
    if (
      collection?.type !== "FeatureCollection"
      || String(collection.metadata?.communeCode ?? "") !== String(city.communeCode)
      || !Array.isArray(collection.features)
      || collection.features.length !== Number(city.expectedOutputFeatureCount)
      || Number(collection.metadata?.featureCount) !== Number(city.expectedOutputFeatureCount)
      || (
        collection.metadata?.sourceFeatureCount !== undefined
        && Number(collection.metadata.sourceFeatureCount) !== Number(plannedCity.sourceFeatureCount)
      )
    ) return false;
    const expectedById = getExpectedSourceInventory(plannedCity);
    const outputSourceIdCounts = getOutputSourceIdCounts(collection);
    return sameExactIdInventory(expectedById, outputSourceIdCounts)
      && [...outputSourceIdCounts.values()].every((count) => count === 1);
  } catch {
    return false;
  }
}

export async function generateBatchFromCache({
  root = rootDirectory,
  planPath,
  cacheDirectory,
  generatedAt,
  resume = false,
}) {
  const [plan, catalog] = await Promise.all([
    readJson(planPath),
    readJson(path.join(root, "geo", "catalog", "france-city-iris.json")),
  ]);
  if (!Array.isArray(plan?.cities) || plan.cities.length < 1) {
    throw new Error("The batch plan must contain at least one city");
  }

  const cityById = new Map(catalog.cities.map((city) => [city.id, city]));
  const communeCodes = new Set();
  for (const plannedCity of plan.cities) {
    const catalogCity = cityById.get(plannedCity.id);
    if (!catalogCity || String(catalogCity.communeCode) !== String(plannedCity.communeCode)) {
      throw new Error(`${plannedCity.id} is not applied to the France city catalog`);
    }
    if (communeCodes.has(String(plannedCity.communeCode))) {
      throw new Error(`The batch duplicates commune ${plannedCity.communeCode}`);
    }
    communeCodes.add(String(plannedCity.communeCode));
  }

  const indexed = await indexCachedIrisFeatures(cacheDirectory, communeCodes);
  const missing = plan.cities.flatMap((city) => {
    const inventory = indexed.featuresByCommune.get(String(city.communeCode)) ?? new Map();
    const validation = validateCachedInventory(city, inventory);
    return validation.valid ? [] : [validation.detail];
  });
  if (missing.length) {
    throw new Error(`WFS cache coverage is incomplete: ${missing.slice(0, 20).join(", ")}`);
  }

  let generated = 0;
  let skipped = 0;
  for (const [index, plannedCity] of plan.cities.entries()) {
    const catalogCity = cityById.get(plannedCity.id);
    if (resume && await existingOutputIsUsable(root, catalogCity, plannedCity)) {
      skipped += 1;
      continue;
    }
    const features = [...indexed.featuresByCommune.get(String(plannedCity.communeCode)).values()]
      .sort((left, right) => String(left.properties.code_iris).localeCompare(String(right.properties.code_iris)));
    await generateCityIris(root, plannedCity.id, {
      generatedAt,
      payload: { type: "FeatureCollection", features },
    });
    generated += 1;
    if ((index + 1) % 25 === 0 || index === plan.cities.length - 1) {
      console.log(`Cache batch progress ${index + 1}/${plan.cities.length}`);
    }
  }

  return {
    cities: plan.cities.length,
    generated,
    skipped,
    officialIris: plan.cities.reduce((sum, city) => sum + Number(city.sourceFeatureCount), 0),
    inspectedCacheFiles: indexed.inspectedFiles,
    irisCacheFiles: indexed.irisCacheFiles,
  };
}

async function main(argumentsList = process.argv.slice(2)) {
  const planArgument = readOption(argumentsList, "plan");
  if (!planArgument) {
    throw new Error("Usage: node scripts/generate-france-city-batch-from-wfs-cache.mjs --plan=<path> [--cache-dir=<path>] [--resume]");
  }
  const planPath = path.resolve(rootDirectory, planArgument);
  const cacheDirectory = path.resolve(readOption(
    argumentsList,
    "cache-dir",
    path.join(os.tmpdir(), "france-wave-9-semantic-wfs-cache"),
  ));
  const plan = await readJson(planPath);
  const generatedAt = readOption(argumentsList, "generated-at", plan.generatedAt ?? new Date().toISOString());
  const result = await generateBatchFromCache({
    planPath,
    cacheDirectory,
    generatedAt,
    resume: hasFlag(argumentsList, "resume"),
  });
  console.log(`Generated ${result.generated}/${result.cities} cities from ${result.officialIris} cached official IRIS (${result.skipped} resumed)`);
  console.log(`Inspected ${result.inspectedCacheFiles} cache files; ${result.irisCacheFiles} contained requested IRIS`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
