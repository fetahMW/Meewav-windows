#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateCityIris } from "./geo/lib/generate-city-iris.mjs";
import { pointInGeometryInterior } from "./geo/lib/geometry.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wave = Number(process.argv.find((argument) => argument.startsWith("--wave="))?.split("=")[1] ?? 6);
const concurrency = Number(process.argv.find((argument) => argument.startsWith("--concurrency="))?.split("=")[1] ?? 1);
const resume = process.argv.includes("--resume");

if (!Number.isInteger(wave) || wave < 1) throw new Error(`Invalid --wave=${wave}`);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
  throw new Error(`Invalid --concurrency=${concurrency}; expected 1..12`);
}

const catalog = JSON.parse(await readFile(path.join(rootDirectory, "geo/catalog/france-city-iris.json"), "utf8"));
const waveCities = catalog.cities.filter((city) => Number(city.wave) === wave);
if (!waveCities.length) throw new Error(`No cities configured for wave ${wave}`);

async function hasValidGeneratedOutput(city) {
  if (!resume) return false;
  try {
    const collection = JSON.parse(await readFile(path.resolve(rootDirectory, city.outputPath), "utf8"));
    const expectedOutputFeatureCount = Number(city.expectedOutputFeatureCount ?? city.expectedFeatureCount);
    return collection?.type === "FeatureCollection"
      && String(collection.metadata?.communeCode ?? "") === String(city.communeCode)
      && collection.features?.length === expectedOutputFeatureCount
      && collection.features.every((feature) => pointInGeometryInterior(
        [Number(feature.properties?.labelLng), Number(feature.properties?.labelLat)],
        feature.geometry,
      ));
  } catch {
    return false;
  }
}

const alreadyGenerated = new Set();
if (resume) {
  for (const city of waveCities) {
    if (await hasValidGeneratedOutput(city)) alreadyGenerated.add(city.id);
  }
}
const cities = waveCities.filter((city) => !alreadyGenerated.has(city.id));
if (!cities.length) {
  console.log(`Wave ${wave}: all ${waveCities.length} cities already have valid generated outputs`);
  process.exit(0);
}
if (alreadyGenerated.size) {
  console.log(`Wave ${wave}: resuming ${cities.length} missing/invalid cities; ${alreadyGenerated.size} valid outputs kept`);
}

let nextIndex = 0;
const results = [];
const failures = [];

async function worker() {
  while (nextIndex < cities.length) {
    const city = cities[nextIndex];
    nextIndex += 1;
    try {
      const result = await generateCityIris(rootDirectory, city.id);
      results.push({
        id: city.id,
        sourceFeatureCount: result.collection.metadata.sourceFeatureCount ?? result.collection.features.length,
        featureCount: result.collection.features.length,
        outputPath: city.outputPath,
      });
      console.log(`[${results.length + failures.length}/${cities.length}] ${city.name}: ${result.collection.features.length} plaques`);
    } catch (error) {
      failures.push({ id: city.id, error: error?.stack ?? String(error) });
      console.error(`[${results.length + failures.length}/${cities.length}] ${city.name}: FAILED`, error?.message ?? error);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, cities.length) }, () => worker()));
results.sort((left, right) => left.id.localeCompare(right.id));
failures.sort((left, right) => left.id.localeCompare(right.id));

console.log(`Wave ${wave}: ${results.length}/${cities.length} pending cities generated, ${failures.length} failures (${alreadyGenerated.size} valid outputs kept)`);
console.log(`Source IRIS: ${results.reduce((sum, result) => sum + result.sourceFeatureCount, 0)}`);
console.log(`Visible plates: ${results.reduce((sum, result) => sum + result.featureCount, 0)}`);

if (failures.length) {
  process.exitCode = 1;
}
