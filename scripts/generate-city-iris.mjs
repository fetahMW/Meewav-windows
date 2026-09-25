#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateCityIris } from "./geo/lib/generate-city-iris.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cityArgument = process.argv.find((argument) => argument.startsWith("--city="));
const cityId = cityArgument?.slice("--city=".length) || process.argv[2];
if (!cityId) throw new Error("Usage: node scripts/generate-city-iris.mjs --city=<city-id>");

const result = await generateCityIris(rootDirectory, cityId);
const areas = result.collection.metadata.areaStatsM2;
const sourceCount = result.collection.metadata.sourceFeatureCount ?? result.collection.features.length;
console.log(`Generated ${result.collection.features.length} human ${result.city.name} zones from ${sourceCount} official IRIS at ${result.outputPath}`);
console.log(`Area m2 min/avg/max: ${areas.minimum.toFixed(0)} / ${areas.average.toFixed(0)} / ${areas.maximum.toFixed(0)}`);
