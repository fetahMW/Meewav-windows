#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const waveArgument = process.argv.find((argument) => argument.startsWith("--wave="));
const wave = waveArgument ? Number(waveArgument.split("=")[1]) : null;

if (wave !== null && (!Number.isInteger(wave) || wave < 1)) {
  throw new Error(`Invalid --wave=${wave}; expected a positive integer`);
}

const readJson = async (relativePath) => JSON.parse(
  await readFile(path.join(rootDirectory, relativePath), "utf8"),
);

const catalogPath = "geo/catalog/france-city-iris.json";
const datasetsPath = "geo/catalog/existing-datasets.json";
const [catalog, existingDatasets] = await Promise.all([
  readJson(catalogPath),
  readJson(datasetsPath),
]);

if (!Array.isArray(catalog.cities) || !Array.isArray(existingDatasets.datasets)) {
  throw new Error("Invalid France city or existing dataset catalog");
}

const selectedCities = catalog.cities.filter((city) => (
  wave === null || Number(city.wave) === wave
));
if (!selectedCities.length) {
  throw new Error(wave === null ? "No France cities found" : `No France cities found for wave ${wave}`);
}

const datasetById = new Map(existingDatasets.datasets.map((dataset) => [dataset.id, dataset]));
let inserted = 0;
let updated = 0;

for (const city of selectedCities) {
  const inputPath = String(city.outputPath ?? "").trim();
  if (!inputPath) throw new Error(`${city.id} has no outputPath`);
  await access(path.join(rootDirectory, inputPath));

  const collection = await readJson(inputPath);
  const expectedVisibleCount = Number(
    city.expectedOutputFeatureCount
      ?? city.humanZoneCuration?.expectedFeatureCount
      ?? city.humanZoneGrouping?.expectedFeatureCount
      ?? city.expectedFeatureCount,
  );
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${city.id} output is not a FeatureCollection`);
  }
  if (collection.features.length !== expectedVisibleCount) {
    throw new Error(
      `${city.id} expected ${expectedVisibleCount} visible plates, received ${collection.features.length}`,
    );
  }
  if (String(collection.metadata?.communeCode ?? "") !== String(city.communeCode)) {
    throw new Error(`${city.id} output communeCode does not match the catalog`);
  }

  const fileId = path.basename(inputPath, path.extname(inputPath)).replace(/-quartiers$/, "");
  const dataset = {
    id: `${fileId}-districts`,
    group: city.id,
    inputPath,
    role: "districts",
    administrativeSourceType: city.runtimeMode === "single_plate" ? "commune" : "iris",
    musicSourceType: "official",
    communeCode: String(city.communeCode),
    communeName: city.name,
    sourceProvider: catalog.source.provider,
    sourceVintage: String(catalog.source.vintage),
    license: catalog.source.license,
    status: "validated",
    quality: "official",
    runtimeMode: "national",
  };

  if (datasetById.has(dataset.id)) updated += 1;
  else inserted += 1;
  datasetById.set(dataset.id, dataset);
}

const selectedIds = new Set(selectedCities.map((city) => (
  `${path.basename(city.outputPath, path.extname(city.outputPath)).replace(/-quartiers$/, "")}-districts`
)));
const untouched = existingDatasets.datasets.filter((dataset) => !selectedIds.has(dataset.id));
const selected = [...datasetById.values()]
  .filter((dataset) => selectedIds.has(dataset.id))
  .sort((left, right) => String(left.group).localeCompare(String(right.group), "fr"));
existingDatasets.datasets = [...untouched, ...selected];

await writeFile(
  path.join(rootDirectory, datasetsPath),
  `${JSON.stringify(existingDatasets, null, 2)}\n`,
  "utf8",
);

console.log(
  `Synchronized ${selected.length} France city datasets${wave === null ? "" : ` for wave ${wave}`}: ${inserted} inserted, ${updated} updated`,
);
