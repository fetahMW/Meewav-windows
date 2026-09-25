#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { auditFrontendTerritorialCoupling, compareAuditToBaseline } from "./lib/audit.mjs";
import { buildZonesTileset } from "./lib/build-zones.mjs";
import { buildGeographySearchIndex } from "./lib/build-search-index.mjs";
import { buildPostgisImport } from "./lib/import-postgis.mjs";
import { importLocalDistricts } from "./lib/import-local-districts.mjs";
import { curateDatasetFiles } from "./lib/curate.mjs";
import { writeExistingGroupArtifacts } from "./lib/migrate-existing.mjs";
import { prepareGeographyRelease } from "./lib/publish.mjs";
import { validateDataset } from "./lib/validate.mjs";

const rootDirectory = process.cwd();

function hasFlag(name) {
  return process.argv.includes(name);
}

function getOption(name, fallback = undefined) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return fallback;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function printIssues(entries, stream = console.error) {
  for (const entry of entries) {
    stream(`${entry.severity?.toUpperCase() ?? "ERROR"} ${entry.code} ${entry.path}: ${entry.message}`);
  }
}

async function runAudit() {
  const audit = await auditFrontendTerritorialCoupling(rootDirectory);
  const baselinePath = path.join(rootDirectory, "geo", "catalog", "frontend-coupling-baseline.json");
  const baseline = (await fileExists(baselinePath)) ? await readJson(baselinePath) : null;
  const regressions = baseline ? compareAuditToBaseline(audit, baseline) : [];
  const result = { ...audit, baselineFound: Boolean(baseline), regressions };

  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Scanned ${audit.scannedFileCount} frontend files.`);
    console.log(`city-* literals: ${audit.totals.cityIdLiterals}`);
    console.log(`commune-* literals: ${audit.totals.communeIdLiterals}`);
    console.log(`territorial prefix literals: ${audit.totals.territorialPrefixLiterals}`);
    console.log(`prefix branches: ${audit.totals.prefixBranches}`);
    console.log(`total coupling signals: ${audit.totals.total}`);
    console.log(baseline ? `Baseline: ${path.relative(rootDirectory, baselinePath)}` : "Baseline: not created yet");
    for (const entry of audit.files.slice(0, 10)) console.log(`  ${entry.total.toString().padStart(4)}  ${entry.file}`);
  }

  if (regressions.length > 0) {
    console.error("Frontend territorial coupling increased:");
    regressions.forEach((entry) => console.error(`  ${entry.metric}: ${entry.baseline} -> ${entry.current} (+${entry.increase})`));
    process.exitCode = 1;
  }
}

async function runValidate() {
  const scope = getOption("--scope");
  const scopedInput = scope ? path.join("geo", "output", `${scope}.canonical.json`) : null;
  const inputPaths = process.argv.slice(3).filter((argument, index, arguments_) => (
    !argument.startsWith("--") && !arguments_[index - 1]?.startsWith("--")
  ));
  if (scopedInput && inputPaths.length === 0) inputPaths.push(scopedInput);
  if (inputPaths.length === 0) {
    const schemas = [
      "geo/schema/administrative-zone.schema.json",
      "geo/schema/music-zone.schema.json",
      "geo/schema/dataset-version.schema.json",
    ];
    for (const schemaPath of schemas) await readJson(path.join(rootDirectory, schemaPath));
    console.log(`Parsed ${schemas.length} canonical JSON schemas successfully.`);
    console.log("Pass one or more canonical dataset JSON paths to validate their content.");
    return;
  }

  let failed = false;
  for (const inputPath of inputPaths) {
    const absolutePath = path.resolve(rootDirectory, inputPath);
    const dataset = await readJson(absolutePath);
    const result = validateDataset(dataset);
    console.log(`${inputPath}: ${result.valid ? "VALID" : "INVALID"} (${result.metrics.administrativeZoneCount ?? 0} administrative, ${result.metrics.musicZoneCount ?? 0} music zones)`);
    printIssues(result.warnings, console.warn);
    printIssues(result.errors);
    if (!result.valid) failed = true;
  }
  if (failed) process.exitCode = 1;
}

async function runImport() {
  const scope = getOption("--scope", "all");
  const version = getOption("--version");
  const inputPath = getOption("--input");
  if (scope === "france" && !inputPath) {
    throw new Error("France import requires --input <validated-canonical-dataset.json>; implicit national download is intentionally disabled");
  }
  const result = await buildPostgisImport(rootDirectory, {
    scope,
    version,
    vintage: getOption("--vintage"),
    inputPath,
    outputDirectory: getOption("--out"),
  });
  console.log(`Prepared transactional PostGIS import for ${result.manifest.musicZoneCount} music zones.`);
  console.log(`SQL: ${path.relative(rootDirectory, result.sqlPath)} (${result.manifest.sqlBytes} bytes)`);
  console.log(`Manifest: ${path.relative(rootDirectory, result.manifestPath)}`);
  console.log("No database connection was opened; apply the SQL explicitly after review.");
}

async function runFetchLocal() {
  const configPath = getOption("--config");
  if (!configPath) throw new Error("fetch-local requires --config <territory-import.json>");
  const result = await importLocalDistricts(rootDirectory, configPath);
  console.log(`Imported ${result.collection.features.length} official local districts.`);
  console.log(`Dataset: ${result.configuration.datasetUrl}`);
  console.log(`GeoJSON: ${path.relative(rootDirectory, result.outputPath)}`);
}

async function runCurate() {
  const inputPath = getOption("--input");
  const communeCode = getOption("--commune");
  const templatePath = getOption("--template");
  const overridePath = getOption("--override");
  const outputPath = getOption("--out");
  if (!inputPath) throw new Error("curate requires --input <canonical-dataset.json>");
  if (templatePath) {
    if (!communeCode) throw new Error("curate --template requires --commune <code>");
    const result = await curateDatasetFiles(rootDirectory, { inputPath, communeCode, templatePath });
    console.log(`Curation template: ${path.relative(rootDirectory, result.templatePath)} (${result.template.decisions.length} zones)`);
    return;
  }
  if (!overridePath || !outputPath) throw new Error("curate apply requires --override <file.json> --out <canonical.json>");
  const result = await curateDatasetFiles(rootDirectory, {
    inputPath,
    overridePath,
    outputPath,
    version: getOption("--version"),
  });
  console.log(`Applied ${result.applied.length} curation decisions.`);
  console.log(`Canonical output: ${path.relative(rootDirectory, result.outputPath)}`);
  console.log(`Validation: VALID (${result.dataset.musicZones.length} music zones)`);
}

async function runPublish() {
  const scope = getOption("--scope", "all");
  const version = getOption("--version");
  const inputPath = getOption("--input");
  if (scope === "france" && !inputPath) {
    throw new Error("France publish requires --input <validated-canonical-dataset.json>");
  }
  const result = await prepareGeographyRelease(rootDirectory, {
    scope,
    version,
    inputPath,
    outputDirectory: getOption("--out"),
    minimumZoom: getOption("--minzoom"),
    maximumZoom: getOption("--maxzoom"),
    maximumAllowedTileBytes: getOption("--max-tile-bytes"),
  });
  console.log(`Prepared immutable release candidate ${result.releaseManifest.version}.`);
  console.log(`Directory: ${path.relative(rootDirectory, result.releaseDirectory)}`);
  console.log(`Zones: ${result.releaseManifest.counts.musicZones}; tiles: ${result.releaseManifest.counts.vectorTiles}.`);
  console.log("Runtime remains legacy; database activation and CDN deployment are explicit separate operations.");
}

async function runMigrateExisting() {
  const group = getOption("--city", getOption("--scope"));
  if (!group) throw new Error("migrate-existing requires --city <name> or --scope all");
  const version = getOption("--version");
  const result = await writeExistingGroupArtifacts(rootDirectory, group, { version });
  console.log(`Converted ${result.report.musicZoneCount} zones for ${group}.`);
  console.log(`Canonical dataset: ${path.relative(rootDirectory, result.outputPath)}`);
  console.log(`Legacy mapping: ${path.relative(rootDirectory, result.mappingPath)}`);
  console.log(`Migration report: ${path.relative(rootDirectory, result.reportPath)}`);
  console.log(`Validation: ${result.validation.valid ? "VALID" : "INVALID"} (${result.validation.errors.length} errors, ${result.validation.warnings.length} warnings)`);
  printIssues(result.validation.warnings, console.warn);
  printIssues(result.validation.errors);
  if (!result.validation.valid) process.exitCode = 1;
}

async function runBuildZones() {
  const scope = getOption("--scope", "paris");
  const version = getOption("--version");
  const maximumZoom = getOption("--maxzoom");
  const minimumZoom = getOption("--minzoom");
  const result = await buildZonesTileset(rootDirectory, scope, { version, maximumZoom, minimumZoom });
  console.log(`Built ${result.manifest.tileCount} MVT tiles for ${scope}.`);
  console.log(`PMTiles: ${path.relative(rootDirectory, result.archivePath)} (${result.manifest.bytes} bytes)`);
  console.log(`Manifest: ${path.relative(rootDirectory, result.manifestPath)}`);
  console.log(`SHA-256: ${result.manifest.sha256}`);
  console.log(`Largest tile: ${result.manifest.maximumTileBytes} bytes`);
  console.log(`Source layers: ${result.inspection.layerNames.join(", ")}`);
}

async function runBuildSearchIndex() {
  const scope = getOption("--scope", "all");
  const version = getOption("--version");
  const result = await buildGeographySearchIndex(rootDirectory, scope, { version });
  console.log(`Indexed ${result.manifest.zoneCount} zones for ${scope}.`);
  console.log(`Search index: ${path.relative(rootDirectory, result.indexPath)} (${result.manifest.bytes} bytes)`);
  console.log(`Manifest: ${path.relative(rootDirectory, result.manifestPath)}`);
  console.log(`SHA-256: ${result.manifest.sha256}`);
}

const command = process.argv[2];
if (command === "audit") {
  await runAudit();
} else if (command === "validate") {
  await runValidate();
} else if (command === "migrate-existing") {
  await runMigrateExisting();
} else if (command === "build-zones") {
  await runBuildZones();
} else if (command === "build-index") {
  await runBuildSearchIndex();
} else if (command === "import") {
  await runImport();
} else if (command === "fetch-local") {
  await runFetchLocal();
} else if (command === "publish") {
  await runPublish();
} else if (command === "curate") {
  await runCurate();
} else {
  console.error("Usage: node scripts/geo/cli.mjs <audit|validate|migrate-existing|build-zones|build-index|fetch-local|import|publish|curate> [options]");
  process.exitCode = 1;
}
