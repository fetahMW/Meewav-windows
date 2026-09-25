#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  COMMUNE_IRIS_MODES,
  classifyCommuneIrisInventory,
} from "./geo/lib/classify-commune-iris.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDirectory = path.resolve(path.dirname(scriptPath), "..");
const DEFAULT_OUTPUT = "geo/work/france-iris-national-inventory.json";
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function readOption(argumentsList, name, fallback) {
  const prefix = `--${name}=`;
  return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function readPositiveIntegerOption(argumentsList, name, fallback, maximum) {
  const value = Number(readOption(argumentsList, name, fallback));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid --${name}=${value}; expected an integer between 1 and ${maximum}`);
  }
  return value;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/œ/giu, (match) => (match === match.toUpperCase() ? "OE" : "oe"))
    .replace(/æ/giu, (match) => (match === match.toUpperCase() ? "AE" : "ae"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function normalizeWords(value) {
  return normalizeText(value)
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWords(value).replace(/\s+/g, "_");
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
  return String(first.communeCode).localeCompare(String(second.communeCode));
}

function compareSourceIris(first, second) {
  const codeDifference = String(first.id).localeCompare(String(second.id));
  if (codeDifference) return codeDifference;
  const labelDifference = String(first.label).localeCompare(String(second.label), "fr", { sensitivity: "variant" });
  if (labelDifference) return labelDifference;
  return String(first.type).localeCompare(String(second.type));
}

/**
 * This is deliberately stricter than the historical wave planner. All matching
 * happens after accent/apostrophe/punctuation folding, so labels such as
 * "Zone d’Activités", "Économique" and "Nord-Ouest" cannot escape review.
 */
export function getLexicalRisks(labels, cityName) {
  const normalizedCounts = new Map();
  const numbered = [];
  const technical = [];
  const operational = [];
  const directional = [];
  const normalizedCity = normalizeWords(cityName);
  const escapedCity = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cityPrefixedStatisticalPattern = escapedCity.length > 0
    ? new RegExp(`^${escapedCity}\\s+\\d+(?:\\s+.+)?$`, "u")
    : null;

  for (const rawLabel of labels) {
    const label = String(rawLabel ?? "").trim();
    const normalized = normalizeWords(label);
    normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);

    if (
      /^(?:iris|quartier|secteur|s)\s*\d+$/u.test(normalized)
      || /^\d+$/u.test(normalized)
      || cityPrefixedStatisticalPattern?.test(normalized)
    ) technical.push(label);

    if (
      /\b(?:z a|z i|zac)\b/u.test(normalized)
      || /\bzone (?:industrielle|artisanale|d activites?|urbaine|periurbaine|rurale)\b/u.test(normalized)
      || /\b(?:economique|collectif|historique)\b/u.test(normalized)
    ) operational.push(label);

    if (
      /^(?:centre(?: ville| urbain)?|nord|sud|est|ouest|nord est|nord ouest|sud est|sud ouest)$/u.test(normalized)
    ) directional.push(label);

    if (/\d+$/u.test(normalized)) numbered.push(label);
  }

  return {
    technical,
    numbered,
    duplicates: [...normalizedCounts.entries()]
      .filter(([, count]) => count > 1)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([label, count]) => ({ label, count })),
    operational,
    directional,
  };
}

export function hasLexicalRisk(lexicalRisks) {
  return Object.values(lexicalRisks).some((risks) => risks.length > 0);
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url, { retries, timeoutMs, userAgent }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json", "user-agent": userAgent },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`WFS inventory failed with HTTP ${response.status}`);
        error.status = response.status;
        if (!RETRYABLE_HTTP_STATUSES.has(response.status)) throw error;
        lastError = error;
      } else {
        const payload = await response.json();
        if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
          throw new Error("WFS inventory is not a FeatureCollection");
        }
        return payload;
      }
    } catch (error) {
      if (error?.status && !RETRYABLE_HTTP_STATUSES.has(error.status)) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < retries) {
      const retryAfterMs = Math.min(8_000, 350 * (2 ** attempt)) + Math.floor(Math.random() * 150);
      await wait(retryAfterMs);
    }
  }
  throw lastError ?? new Error("WFS inventory request failed");
}

async function fetchInventoryBatch(source, communeCodes, options) {
  try {
    const payload = await fetchJsonWithRetry(createWfsUrl(source, communeCodes), options);
    return payload.features;
  } catch (error) {
    if ((error?.status === 400 || error?.status === 414) && communeCodes.length > 1) {
      const middle = Math.ceil(communeCodes.length / 2);
      const [first, second] = await Promise.all([
        fetchInventoryBatch(source, communeCodes.slice(0, middle), options),
        fetchInventoryBatch(source, communeCodes.slice(middle), options),
      ]);
      return [...first, ...second];
    }
    throw error;
  }
}

function normalizeSourceIris(feature) {
  const properties = feature?.properties ?? feature ?? {};
  return {
    id: String(properties.code_iris ?? properties.id ?? "").trim(),
    label: String(properties.nom_iris ?? properties.label ?? "").trim(),
    type: String(properties.type_iris ?? properties.type ?? "").trim().toUpperCase(),
  };
}

async function readJson(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(rootDirectory, relativeOrAbsolutePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function collectCoveredCodes(cityCatalog, existingDatasets) {
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
  return coveredCodes;
}

function createCandidates(searchIndex, coveredCodes) {
  const candidates = searchIndex.results
    .filter((result) => result.type === "city" || result.type === "commune")
    .filter(isMetropolitanFranceResult)
    .map((result) => ({
      id: slugify(result.label),
      name: String(result.label),
      featureId: String(result.id),
      communeCode: String(result.id).replace(/^commune-/, ""),
      population: Number(result.population ?? 0),
      departmentCode: String(result.departmentCode ?? ""),
      departmentName: String(result.departmentName ?? ""),
      regionName: String(result.regionName ?? ""),
      searchCenter: result.center,
    }))
    .filter((candidate) => candidate.communeCode && !coveredCodes.has(candidate.communeCode))
    .sort(compareCandidates);

  const uniqueCodes = new Set(candidates.map((candidate) => candidate.communeCode));
  if (uniqueCodes.size !== candidates.length) {
    throw new Error(`Search index contains ${candidates.length - uniqueCodes.size} duplicate metropolitan commune codes`);
  }
  return candidates;
}

function createFingerprint(source, candidates) {
  const input = {
    source: {
      wfsUrl: source.wfsUrl,
      typeName: source.typeName,
      vintage: source.vintage,
    },
    candidates: candidates.map((candidate) => [
      candidate.communeCode,
      candidate.name,
      candidate.population,
      candidate.departmentCode,
      candidate.departmentName,
      candidate.regionName,
      candidate.searchCenter,
    ]),
  };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function readResumeRecords(partialPath, fingerprint) {
  let contents;
  try {
    contents = await readFile(partialPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const lines = contents.split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return new Map();
  const header = JSON.parse(lines[0]);
  if (header.kind !== "france_iris_inventory_partial" || header.inputFingerprint !== fingerprint) {
    throw new Error(`Resume checkpoint does not match current inputs: ${partialPath}`);
  }
  const inventories = new Map();
  for (const line of lines.slice(1)) {
    const record = JSON.parse(line);
    for (const [communeCode, sourceIris] of Object.entries(record.inventories ?? {})) {
      inventories.set(communeCode, sourceIris);
    }
  }
  return inventories;
}

async function initializePartial(partialPath, fingerprint, shouldResume) {
  if (shouldResume) return;
  const header = {
    schemaVersion: 1,
    kind: "france_iris_inventory_partial",
    inputFingerprint: fingerprint,
  };
  await writeFile(partialPath, `${JSON.stringify(header)}\n`, "utf8");
}

async function runBatches({ candidates, source, inventories, partialPath, batchSize, concurrency, retries, timeoutMs }) {
  const missingCandidates = candidates.filter((candidate) => !inventories.has(candidate.communeCode));
  const batches = [];
  for (let offset = 0; offset < missingCandidates.length; offset += batchSize) {
    batches.push(missingCandidates.slice(offset, offset + batchSize));
  }
  let nextBatchIndex = 0;
  let completedBatches = 0;
  let checkpointWrite = Promise.resolve();

  async function worker() {
    while (nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const batch = batches[batchIndex];
      const communeCodes = batch.map((candidate) => candidate.communeCode);
      const features = await fetchInventoryBatch(source, communeCodes, {
        retries,
        timeoutMs,
        userAgent: "Meewav-Web national IRIS inventory cache/1.0",
      });
      const byCommuneCode = Object.fromEntries(communeCodes.map((code) => [code, []]));
      for (const feature of features) {
        const code = String(feature?.properties?.code_insee ?? "").trim();
        if (Object.hasOwn(byCommuneCode, code)) byCommuneCode[code].push(normalizeSourceIris(feature));
      }
      for (const sourceIris of Object.values(byCommuneCode)) sourceIris.sort(compareSourceIris);

      // One append is atomic enough for a single Node process and records empty
      // inventories too, which makes interrupted runs exactly resumable.
      // Serialize checkpoint writes even when network workers run concurrently;
      // this guarantees that two large NDJSON records can never interleave.
      checkpointWrite = checkpointWrite.then(() => (
        appendFile(partialPath, `${JSON.stringify({ inventories: byCommuneCode })}\n`, "utf8")
      ));
      await checkpointWrite;
      for (const [code, sourceIris] of Object.entries(byCommuneCode)) inventories.set(code, sourceIris);
      completedBatches += 1;
      if (completedBatches === 1 || completedBatches % 10 === 0 || completedBatches === batches.length) {
        console.log(`IRIS inventory: ${inventories.size}/${candidates.length} communes cached (${completedBatches}/${batches.length} new batches)`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
}

function createOutput({ searchIndex, cityCatalog, coveredCodes, candidates, inventories, fingerprint }) {
  const communes = candidates.map((candidate, index) => {
    const sourceIris = inventories.get(candidate.communeCode) ?? [];
    const classification = classifyCommuneIrisInventory(sourceIris);
    const lexicalRisks = getLexicalRisks(sourceIris.map((iris) => iris.label), candidate.name);
    const semanticRisk = hasLexicalRisk(lexicalRisks);
    return {
      rank: index + 1,
      ...candidate,
      sourceFeatureCount: classification.sourceFeatureCount,
      distinctOfficialIrisCount: classification.distinctIrisCount,
      mode: classification.mode,
      classificationReason: classification.reason,
      eligibleForSplitCityWave: classification.eligibleForSplitCityWave,
      semanticStatus: semanticRisk ? "semantic_risk" : "clean",
      sourceIris,
      lexicalRisks,
    };
  });

  const countMode = (mode) => communes.filter((commune) => commune.mode === mode).length;
  const countRisk = (risk) => communes.filter((commune) => commune.lexicalRisks[risk].length > 0).length;
  const classificationReasons = Object.fromEntries(
    [...new Set(communes.map((commune) => commune.classificationReason))]
      .sort((first, second) => first.localeCompare(second))
      .map((reason) => [reason, communes.filter((commune) => commune.classificationReason === reason).length]),
  );
  const coveredMetropolitanCount = searchIndex.results
    .filter((result) => result.type === "city" || result.type === "commune")
    .filter(isMetropolitanFranceResult)
    .filter((result) => coveredCodes.has(String(result.id).replace(/^commune-/, "")))
    .length;

  return {
    schemaVersion: 1,
    kind: "france_iris_national_inventory_cache",
    inputFingerprint: fingerprint,
    selection: {
      order: "population desc, French label asc, commune code asc",
      geographicScope: "metropolitan France and Corsica",
      searchIndexVersion: searchIndex.version,
      indexedMetropolitanCommunes: coveredMetropolitanCount + communes.length,
      coveredMetropolitanCommunesExcluded: coveredMetropolitanCount,
      remainingCommunes: communes.length,
    },
    source: cityCatalog.source,
    summary: {
      communes: communes.length,
      officialIris: communes.reduce((sum, commune) => sum + commune.sourceFeatureCount, 0),
      split: countMode(COMMUNE_IRIS_MODES.SPLIT),
      singlePlate: countMode(COMMUNE_IRIS_MODES.SINGLE_PLATE),
      resolutionRequired: countMode(COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED),
      clean: communes.filter((commune) => commune.semanticStatus === "clean").length,
      semanticRisk: communes.filter((commune) => commune.semanticStatus === "semantic_risk").length,
      splitClean: communes.filter(
        (commune) => commune.mode === COMMUNE_IRIS_MODES.SPLIT && commune.semanticStatus === "clean",
      ).length,
      splitSemanticRisk: communes.filter(
        (commune) => commune.mode === COMMUNE_IRIS_MODES.SPLIT && commune.semanticStatus === "semantic_risk",
      ).length,
      classificationReasons,
      communesWithLexicalRisk: {
        technical: countRisk("technical"),
        numbered: countRisk("numbered"),
        duplicates: countRisk("duplicates"),
        operational: countRisk("operational"),
        directional: countRisk("directional"),
      },
    },
    communes,
  };
}

export function createGuideAlphaSplitPlan(cache, { wave, semanticStatus, generatedAt }) {
  if (!Number.isInteger(wave) || wave < 1) throw new Error(`Invalid --wave=${wave}`);
  if (!new Set(["clean", "semantic_risk"]).has(semanticStatus)) {
    throw new Error(`Unsupported Guide Alpha semantic subset: ${semanticStatus}`);
  }
  if (!Array.isArray(cache?.communes)) throw new Error("National IRIS cache has no communes array");

  const allSplitCommunes = cache.communes.filter((commune) => commune.mode === COMMUNE_IRIS_MODES.SPLIT);
  const idCounts = new Map();
  for (const commune of allSplitCommunes) {
    idCounts.set(commune.id, (idCounts.get(commune.id) ?? 0) + 1);
  }
  const resolvedIdByCommuneCode = new Map();
  const usedIds = new Set();
  for (const commune of allSplitCommunes) {
    const baseId = idCounts.get(commune.id) > 1 ? `${commune.id}_${commune.communeCode}` : commune.id;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    resolvedIdByCommuneCode.set(commune.communeCode, id);
  }

  const selectedCommunes = allSplitCommunes.filter(
    (commune) => commune.mode === COMMUNE_IRIS_MODES.SPLIT
      && commune.semanticStatus === semanticStatus,
  );
  const cities = selectedCommunes.map((commune, index) => {
    const { semanticStatus: _semanticStatus, rank: _nationalRank, ...plannedCity } = commune;
    return {
      rank: index + 1,
      ...plannedCity,
      id: resolvedIdByCommuneCode.get(commune.communeCode),
      status: semanticStatus === "semantic_risk" ? "resolution_required" : "pending_semantic_review",
    };
  });
  const officialIris = cities.reduce((sum, city) => sum + city.sourceFeatureCount, 0);
  const excludedCovered = Number(cache.selection?.coveredMetropolitanCommunesExcluded ?? 0);
  const nationalSinglePlateCount = Number(cache.summary?.singlePlate ?? 0);
  const nationalInventoryResolutionCount = Number(cache.summary?.resolutionRequired ?? 0);
  const otherSemanticSubsetCount = allSplitCommunes.length - cities.length;

  return {
    schemaVersion: 1,
    wave,
    // The source index snapshot time is stable, unlike the wall clock. Reusing
    // the same cache therefore emits byte-identical plans.
    generatedAt: generatedAt ?? null,
    selection: {
      order: cache.selection?.order ?? "population desc, French label asc, commune code asc",
      geographicScope: cache.selection?.geographicScope ?? "metropolitan France and Corsica",
      eligibility: semanticStatus === "clean"
        ? "multiple distinct official INSEE IRIS with no strict lexical risk"
        : "multiple distinct official INSEE IRIS requiring explicit semantic resolution",
      semanticSubset: semanticStatus,
      sourceCacheFingerprint: cache.inputFingerprint,
      excludedDirectCommuneCount: excludedCovered,
      requestedCount: cities.length,
      scannedCandidateCount: allSplitCommunes.length,
      deferredSinglePlateCount: 0,
      deferredInventoryResolutionCount: 0,
      deferredOtherSemanticSubsetCount: otherSemanticSubsetCount,
      nationalInventoryContext: {
        remainingCommunes: Number(cache.summary?.communes ?? cache.communes.length),
        split: allSplitCommunes.length,
        singlePlate: nationalSinglePlateCount,
        inventoryResolutionRequired: nationalInventoryResolutionCount,
      },
    },
    source: cache.source,
    totals: {
      cities: cities.length,
      officialIris,
      split: cities.length,
      splitWaveEligible: cities.length,
      singlePlate: 0,
      singlePlateOutsideSplitWave: 0,
      inventoryResolutionRequired: 0,
      missingOfficialSplit: 0,
      classificationReasons: {
        multiple_official_iris: cities.length,
      },
      semanticResolutionRequired: semanticStatus === "semantic_risk" ? cities.length : 0,
      pendingSemanticReview: semanticStatus === "clean" ? cities.length : 0,
    },
    deferredCandidates: [],
    cities,
  };
}

async function writeGuideAlphaPlan(cache, outputArgument, options) {
  const outputPath = path.resolve(rootDirectory, outputArgument);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const plan = createGuideAlphaSplitPlan(cache, options);
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(
    `Guide Alpha ${options.semanticStatus} plan: ${plan.totals.cities} cities, ${plan.totals.officialIris} official IRIS`,
  );
  console.log(outputPath);
  return plan;
}

async function main(argumentsList = process.argv.slice(2)) {
  const outputArgument = readOption(argumentsList, "output", DEFAULT_OUTPUT);
  const cleanSplitPlanOutput = readOption(argumentsList, "clean-split-plan-output", undefined);
  const riskSplitPlanOutput = readOption(argumentsList, "risk-split-plan-output", undefined);
  const hasPlanOutput = cleanSplitPlanOutput !== undefined || riskSplitPlanOutput !== undefined;
  const wave = Number(readOption(argumentsList, "wave", 9));
  if (hasPlanOutput && (!Number.isInteger(wave) || wave < 1)) throw new Error(`Invalid --wave=${wave}`);
  if (cleanSplitPlanOutput === "") throw new Error("--clean-split-plan-output requires a path");
  if (riskSplitPlanOutput === "") throw new Error("--risk-split-plan-output requires a path");
  if (cleanSplitPlanOutput && riskSplitPlanOutput
      && path.resolve(rootDirectory, cleanSplitPlanOutput) === path.resolve(rootDirectory, riskSplitPlanOutput)) {
    throw new Error("Clean and risk Guide Alpha plans require different output paths");
  }
  const batchSize = readPositiveIntegerOption(argumentsList, "batch-size", 150, 300);
  const concurrency = readPositiveIntegerOption(argumentsList, "concurrency", 3, 8);
  const retries = readPositiveIntegerOption(argumentsList, "retries", 6, 12);
  const timeoutMs = readPositiveIntegerOption(argumentsList, "timeout-ms", 60_000, 300_000);
  const shouldResume = argumentsList.includes("--resume");
  const force = argumentsList.includes("--force");
  const outputPath = path.resolve(rootDirectory, outputArgument);
  const partialPath = `${outputPath}.partial.ndjson`;

  const [searchIndex, cityCatalog, existingDatasets] = await Promise.all([
    readJson("public/search/france-communes-index.json"),
    readJson("geo/catalog/france-city-iris.json"),
    readJson("geo/catalog/existing-datasets.json"),
  ]);
  const coveredCodes = await collectCoveredCodes(cityCatalog, existingDatasets);
  const candidates = createCandidates(searchIndex, coveredCodes);
  const fingerprint = createFingerprint(cityCatalog.source, candidates);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let output;
  if (!force) {
    try {
      const cachedOutput = await readJson(outputPath);
      const exactFingerprint = cachedOutput.inputFingerprint === fingerprint;
      const sourceCompatibleSnapshot = hasPlanOutput
        && cachedOutput.kind === "france_iris_national_inventory_cache"
        && cachedOutput.selection?.searchIndexVersion === searchIndex.version
        && cachedOutput.source?.wfsUrl === cityCatalog.source?.wfsUrl
        && cachedOutput.source?.typeName === cityCatalog.source?.typeName
        && cachedOutput.source?.vintage === cityCatalog.source?.vintage;
      if (cachedOutput.kind === "france_iris_national_inventory_cache"
          && (exactFingerprint || sourceCompatibleSnapshot)) {
        console.log(
          exactFingerprint
            ? `National IRIS inventory cache is current: ${outputPath}`
            : `Using source-compatible national IRIS cache snapshot for plan derivation: ${outputPath}`,
        );
        console.log(JSON.stringify(cachedOutput.summary, null, 2));
        output = cachedOutput;
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }

  if (!output) {
    const inventories = shouldResume ? await readResumeRecords(partialPath, fingerprint) : new Map();
    await initializePartial(partialPath, fingerprint, shouldResume && inventories.size > 0);
    console.log(`Caching ${candidates.length} remaining metropolitan communes (${inventories.size} resumed)`);
    await runBatches({
      candidates,
      source: cityCatalog.source,
      inventories,
      partialPath,
      batchSize,
      concurrency,
      retries,
      timeoutMs,
    });
    if (inventories.size !== candidates.length) {
      throw new Error(`Incomplete national IRIS inventory: ${inventories.size}/${candidates.length}`);
    }

    output = createOutput({
      searchIndex,
      cityCatalog,
      coveredCodes,
      candidates,
      inventories,
      fingerprint,
    });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    await unlink(partialPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    console.log(`National IRIS inventory cached: ${output.summary.communes} communes, ${output.summary.officialIris} official IRIS`);
    console.log(`Modes: ${output.summary.split} split, ${output.summary.singlePlate} single plate, ${output.summary.resolutionRequired} resolution required`);
    console.log(`Semantics: ${output.summary.clean} clean, ${output.summary.semanticRisk} semantic-risk`);
    console.log(outputPath);
  }

  const planOptions = { wave, generatedAt: searchIndex.generatedAt ?? null };
  if (cleanSplitPlanOutput) {
    await writeGuideAlphaPlan(output, cleanSplitPlanOutput, { ...planOptions, semanticStatus: "clean" });
  }
  if (riskSplitPlanOutput) {
    await writeGuideAlphaPlan(output, riskSplitPlanOutput, { ...planOptions, semanticStatus: "semantic_risk" });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
