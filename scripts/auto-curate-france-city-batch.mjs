#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const POLICY_VERSION = 1;
const ALLOWED_IRIS_TYPES = new Set(["H", "A", "D", "Z"]);
const DIRECTION_ONLY_PATTERN = /^(?:centre(?: ville| urbain)?|nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest)|peripherie)$/u;
const GENERIC_TERRITORY_PATTERN = /\b(?:periurbain(?:e|es|s)?|rural(?:e|es|s)?|ecarts? ruraux|collectif(?:s|ive|ives)?|historique(?:s)?|peripherie)\b/u;
const GENERIC_STANDALONE_PATTERN = /^(?:la |le |les |l |un |une )?(?:ville|commune|bourg|village|agglomeration|banlieue|couronne|centre|centre ville|centre urbain|peripherie|quartier|secteur|zone|habitat collectif|ecarts? ruraux)$/u;
const GENERIC_FACILITY_PATTERN = /^(?:la |le |les |l )?(?:gare|aeroport|aerodrome|port|hopital|universite|campus|caserne|stade|cimetiere|chaufferie|technopole|centre commercial|usine)$/u;
const OPERATIONAL_PATTERN = /(?:\b(?:z a|z i|zac|zup)\b|\bzone\b|\b(?:activite|activites|industriel|industrielle|industriels|industrielles|artisanal|artisanale|artisanaux|artisanales|commercial|commerciale|commerciaux|commerciales|economique|economiques)\b)/u;
const PLACEHOLDER_PATTERN = /^(?:n a|na|neant|inconnu|inconnue|sans nom|non renseigne|non renseignee|a definir|indetermine|indeterminee)$/u;

export function fold(value) {
  return String(value ?? "")
    .replace(/œ/giu, (match) => (match === match.toUpperCase() ? "OE" : "oe"))
    .replace(/æ/giu, (match) => (match === match.toUpperCase() ? "AE" : "ae"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createReason(code, detail, source = null) {
  return {
    code,
    detail,
    ...(source ? {
      sourceIds: source.id ? [String(source.id)] : [],
      labels: source.label === undefined ? [] : [String(source.label)],
    } : {}),
  };
}

function deduplicateReasons(reasons) {
  const seen = new Set();
  return reasons.filter((reason) => {
    const key = JSON.stringify([reason.code, reason.sourceIds ?? [], reason.labels ?? [], reason.detail]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getLabelRisks(label, cityName = "", sourceId = "") {
  const source = { id: sourceId, label };
  const rawLabel = typeof label === "string" ? label.trim() : "";
  const normalized = fold(rawLabel);
  const normalizedCity = fold(cityName);
  const risks = [];

  if (!rawLabel) {
    risks.push(createReason("empty_label", "The official IRIS label is empty.", source));
    return risks;
  }
  if (/[\u0000-\u001f\u007f\ufffd]/u.test(rawLabel)) {
    risks.push(createReason("invalid_label_encoding", `The label “${rawLabel}” contains a control or replacement character.`, source));
  }
  if (!/\p{L}/u.test(rawLabel)) {
    risks.push(createReason("non_human_label", `The label “${rawLabel}” contains no human-readable letter.`, source));
  }
  if (/\d/u.test(rawLabel)) {
    risks.push(createReason("numbered_label", `The label “${rawLabel}” contains a number and requires explicit semantic review.`, source));
  }
  if (
    /^(?:iris|quartier|secteur|s)\s*(?:\d+|[a-z])?$/u.test(normalized)
    || /^(?:iris|quartier|secteur|zone|s)\s+\d+(?:\s+.*)?$/u.test(normalized)
  ) {
    risks.push(createReason("technical_inventory_label", `The label “${rawLabel}” is an inventory-style technical label.`, source));
  }
  if (DIRECTION_ONLY_PATTERN.test(normalized)) {
    risks.push(createReason("direction_only_label", `The label “${rawLabel}” is a bare direction or centre/periphery label.`, source));
  }
  if (GENERIC_STANDALONE_PATTERN.test(normalized)) {
    risks.push(createReason("generic_territorial_label", `The label “${rawLabel}” is a generic territorial description.`, source));
  }
  if (GENERIC_TERRITORY_PATTERN.test(normalized)) {
    risks.push(createReason("generic_territorial_label", `The label “${rawLabel}” contains generic territorial wording.`, source));
  }
  if (OPERATIONAL_PATTERN.test(normalized)) {
    risks.push(createReason("operational_label", `The label “${rawLabel}” contains operational or land-use wording.`, source));
  }
  if (GENERIC_FACILITY_PATTERN.test(normalized)) {
    risks.push(createReason("generic_facility_label", `The label “${rawLabel}” is only a generic facility name.`, source));
  }
  if (PLACEHOLDER_PATTERN.test(normalized)) {
    risks.push(createReason("placeholder_label", `The label “${rawLabel}” is a placeholder.`, source));
  }
  if (normalizedCity && normalized === normalizedCity) {
    risks.push(createReason("commune_name_only_label", `The label “${rawLabel}” only repeats the commune name.`, source));
  }
  if (
    normalizedCity
    && normalized.startsWith(`${normalizedCity} `)
    && DIRECTION_ONLY_PATTERN.test(normalized.slice(normalizedCity.length + 1))
  ) {
    risks.push(createReason("technical_directional_label", `The label “${rawLabel}” is only the commune name plus a direction.`, source));
  }

  return deduplicateReasons(risks);
}

function getPlannerRiskReasons(city) {
  const risks = city?.lexicalRisks;
  if (!risks || typeof risks !== "object") return [];
  return Object.entries(risks).flatMap(([category, values]) => (
    Array.isArray(values) && values.length > 0
      ? [createReason(
          `planner_${category}_risk`,
          `The source planner reported ${values.length} ${category} lexical risk(s); automatic acceptance is prohibited.`,
        )]
      : []
  ));
}

function getInventoryReasons(city) {
  const reasons = [];
  const rawCityId = String(city?.id ?? "");
  const rawCityName = String(city?.name ?? "");
  const rawCommuneCode = String(city?.communeCode ?? "");
  const communeCode = rawCommuneCode.trim().toUpperCase();
  const sources = Array.isArray(city?.sourceIris) ? city.sourceIris : [];

  if (!rawCityId.trim()) reasons.push(createReason("missing_city_id", "The city has no stable identifier."));
  else if (rawCityId !== rawCityId.trim() || !/^[a-z0-9_]+$/u.test(rawCityId)) reasons.push(createReason("invalid_city_id", `The city ID “${rawCityId}” is not canonical snake_case.`));
  if (!rawCityName.trim()) reasons.push(createReason("missing_city_name", "The city has no human name."));
  else if (rawCityName !== rawCityName.trim() || /[\u0000-\u001f\u007f\ufffd]/u.test(rawCityName)) reasons.push(createReason("invalid_city_name", "The city name contains surrounding whitespace or invalid characters."));
  if (!/^[0-9A-Z]{5}$/u.test(communeCode)) reasons.push(createReason("invalid_commune_code", `The commune code “${communeCode}” is not an exact five-character INSEE code.`));
  else if (rawCommuneCode !== communeCode) reasons.push(createReason("noncanonical_commune_code", `The commune code “${rawCommuneCode}” is not in canonical exact form.`));
  if (city?.mode !== "standalone_split" || city?.eligibleForSplitCityWave !== true) {
    reasons.push(createReason("ineligible_runtime_mode", "Only an explicitly eligible standalone_split city can be auto-curated."));
  }
  if (city?.classificationReason !== "multiple_official_iris") {
    reasons.push(createReason("unverified_split_classification", "The city is not classified from multiple distinct official IRIS."));
  }
  if (sources.length < 2) reasons.push(createReason("insufficient_official_inventory", "A split city must contain at least two official IRIS."));
  if (!Number.isInteger(city?.sourceFeatureCount) || city.sourceFeatureCount !== sources.length) {
    reasons.push(createReason("source_count_mismatch", `sourceFeatureCount=${city?.sourceFeatureCount ?? "missing"} does not match the ${sources.length} exact source IRIS.`));
  }
  if (!Number.isInteger(city?.distinctOfficialIrisCount) || city.distinctOfficialIrisCount !== sources.length) {
    reasons.push(createReason("distinct_count_mismatch", `distinctOfficialIrisCount=${city?.distinctOfficialIrisCount ?? "missing"} does not match the ${sources.length} exact source IRIS.`));
  }

  const sourceIds = new Map();
  const normalizedLabels = new Map();
  for (const source of sources) {
    const rawSourceId = String(source?.id ?? "");
    const sourceId = rawSourceId.trim().toUpperCase();
    const sourceLabel = typeof source?.label === "string" ? source.label : "";
    const rawLabel = sourceLabel.trim();
    const rawIrisType = String(source?.type ?? "");
    const irisType = rawIrisType.trim().toUpperCase();
    if (!sourceId) {
      reasons.push(createReason("missing_source_id", "An official IRIS has no exact source ID.", source));
    } else {
      sourceIds.set(sourceId, [...(sourceIds.get(sourceId) ?? []), source]);
      if (rawSourceId !== sourceId || !/^[0-9A-Z]{9}$/u.test(sourceId)) {
        reasons.push(createReason("invalid_source_id", `Exact source ID “${rawSourceId}” is not in canonical nine-character form.`, source));
      }
      if (communeCode && !sourceId.startsWith(communeCode)) {
        reasons.push(createReason("source_commune_mismatch", `Exact source ${sourceId} does not belong to commune ${communeCode}.`, source));
      }
    }
    if (sourceLabel !== rawLabel) {
      reasons.push(createReason("noncanonical_label_whitespace", `The label “${sourceLabel}” contains surrounding whitespace.`, source));
    }
    if (!ALLOWED_IRIS_TYPES.has(irisType)) {
      reasons.push(createReason("invalid_iris_type", `Exact source ${sourceId || "<missing>"} has unsupported IRIS type “${irisType || "missing"}”.`, source));
    } else if (rawIrisType !== irisType) {
      reasons.push(createReason("noncanonical_iris_type", `Exact source ${sourceId || "<missing>"} has noncanonical IRIS type “${rawIrisType}”.`, source));
    }
    if (irisType === "Z") {
      reasons.push(createReason("whole_commune_iris", `Exact source ${sourceId || "<missing>"} is a whole-commune Z IRIS and cannot enter a split batch.`, source));
    }
    reasons.push(...getLabelRisks(rawLabel, city?.name, sourceId));
    const normalizedLabel = fold(rawLabel);
    if (normalizedLabel) normalizedLabels.set(normalizedLabel, [...(normalizedLabels.get(normalizedLabel) ?? []), source]);
  }

  for (const [sourceId, duplicateSources] of sourceIds) {
    if (duplicateSources.length > 1) {
      reasons.push({
        code: "duplicate_source_id",
        detail: `Exact source ID ${sourceId} occurs ${duplicateSources.length} times in the city inventory.`,
        sourceIds: [sourceId],
        labels: duplicateSources.map((source) => String(source.label ?? "")),
      });
    }
  }
  for (const [normalizedLabel, duplicateSources] of normalizedLabels) {
    if (duplicateSources.length > 1) {
      reasons.push({
        code: "duplicate_normalized_label",
        detail: `The normalized human label “${normalizedLabel}” occurs ${duplicateSources.length} times.`,
        sourceIds: duplicateSources.map((source) => String(source.id ?? "")),
        labels: duplicateSources.map((source) => String(source.label ?? "")),
      });
    }
  }

  reasons.push(...getPlannerRiskReasons(city));
  return deduplicateReasons(reasons);
}

function getDuplicateValues(cities, selector) {
  const indexesByValue = new Map();
  cities.forEach((city, index) => {
    const value = selector(city);
    if (!value) return;
    indexesByValue.set(value, [...(indexesByValue.get(value) ?? []), index]);
  });
  return new Map([...indexesByValue].filter(([, indexes]) => indexes.length > 1));
}

function getGlobalInventoryOwners(cities) {
  const owners = new Map();
  cities.forEach((city, cityIndex) => {
    for (const source of Array.isArray(city?.sourceIris) ? city.sourceIris : []) {
      const sourceId = String(source?.id ?? "").trim().toUpperCase();
      if (!sourceId) continue;
      owners.set(sourceId, [...(owners.get(sourceId) ?? []), cityIndex]);
    }
  });
  return new Map([...owners].filter(([, indexes]) => new Set(indexes).size > 1));
}

function buildGlobalReasons(cities) {
  const reasonsByIndex = new Map(cities.map((_, index) => [index, []]));
  const duplicateFields = [
    ["duplicate_city_id", "city ID", getDuplicateValues(cities, (city) => fold(city?.id))],
    ["duplicate_commune_code", "commune code", getDuplicateValues(cities, (city) => String(city?.communeCode ?? "").trim().toUpperCase())],
  ];
  for (const [code, description, duplicates] of duplicateFields) {
    for (const [value, indexes] of duplicates) {
      for (const index of indexes) {
        reasonsByIndex.get(index).push(createReason(code, `The ${description} “${value}” occurs in ${indexes.length} input cities.`));
      }
    }
  }
  for (const [sourceId, indexes] of getGlobalInventoryOwners(cities)) {
    for (const index of new Set(indexes)) {
      reasonsByIndex.get(index).push(createReason("cross_city_source_collision", `Exact source ID ${sourceId} occurs in more than one input city.`));
    }
  }
  return reasonsByIndex;
}

export function analyzeCity(city, globalReasons = []) {
  return deduplicateReasons([...getInventoryReasons(city), ...globalReasons]);
}

function makeCurationCity(city) {
  return {
    id: city.id,
    name: city.name,
    code: String(city.communeCode),
    population: Number(city.population ?? 0),
    sourceFeatureCount: city.sourceIris.length,
    officialLabels: city.sourceIris.map((source) => ({
      sourceId: String(source.id),
      label: String(source.label).trim(),
      irisType: String(source.type).trim().toUpperCase(),
    })),
    anomalies: [],
    guideAlphaRule: {
      type: "none",
      justification: "Strict automatic Guide Alpha gate: every exact official label is non-empty, human, unique after normalization, unnumbered, non-technical, non-direction-only and non-operational.",
    },
    status: "ready",
  };
}

function summarizePlan(cities) {
  const classificationReasons = {};
  for (const city of cities) {
    const reason = String(city.classificationReason ?? "unknown");
    classificationReasons[reason] = (classificationReasons[reason] ?? 0) + 1;
  }
  const split = cities.filter((city) => city.mode === "standalone_split").length;
  const singlePlate = cities.filter((city) => city.mode === "single_plate").length;
  const inventoryResolutionRequired = cities.filter((city) => city.mode === "inventory_resolution_required").length;
  return {
    cities: cities.length,
    officialIris: cities.reduce((sum, city) => sum + (city.sourceIris?.length ?? 0), 0),
    split,
    splitWaveEligible: cities.filter((city) => city.eligibleForSplitCityWave === true).length,
    singlePlate,
    singlePlateOutsideSplitWave: singlePlate,
    inventoryResolutionRequired,
    missingOfficialSplit: inventoryResolutionRequired,
    classificationReasons,
    semanticResolutionRequired: 0,
    pendingSemanticReview: 0,
    autoCuratedReady: cities.length,
  };
}

function getInputCities(plan) {
  for (const key of ["cities", "candidates", "communes"]) {
    if (Array.isArray(plan?.[key])) return { key, cities: plan[key] };
  }
  throw new Error("Input plan must contain a cities, candidates or communes array");
}

export function curatePlan(plan, {
  limit = Number.POSITIVE_INFINITY,
  inputPath = "<memory>",
  inputSha256 = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Input plan must be a JSON object");
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit > 0))) {
    throw new Error(`Invalid limit ${limit}; expected a positive integer`);
  }

  const { key: inputCollectionKey, cities: inputCities } = getInputCities(plan);
  const inspectedCount = Math.min(inputCities.length, limit);
  const globalReasons = buildGlobalReasons(inputCities);
  const safeCities = [];
  const exceptionCities = [];

  for (let index = 0; index < inspectedCount; index += 1) {
    const city = inputCities[index];
    const reasons = analyzeCity(city, globalReasons.get(index));
    if (reasons.length === 0) {
      safeCities.push({ ...city, status: "ready" });
    } else {
      exceptionCities.push({
        id: city?.id ?? null,
        name: city?.name ?? null,
        communeCode: city?.communeCode ?? null,
        rank: city?.rank ?? index + 1,
        population: Number(city?.population ?? 0),
        departmentCode: city?.departmentCode ?? null,
        departmentName: city?.departmentName ?? null,
        regionName: city?.regionName ?? null,
        mode: city?.mode ?? null,
        sourceFeatureCount: Array.isArray(city?.sourceIris) ? city.sourceIris.length : 0,
        officialLabels: (Array.isArray(city?.sourceIris) ? city.sourceIris : []).map((source) => ({
          sourceId: String(source?.id ?? ""),
          label: String(source?.label ?? ""),
          irisType: String(source?.type ?? ""),
        })),
        status: "manual_curation_required",
        reasons,
      });
    }
  }

  const deferredCities = inputCities.slice(inspectedCount).map((city, offset) => ({
    id: city?.id ?? null,
    name: city?.name ?? null,
    communeCode: city?.communeCode ?? null,
    rank: city?.rank ?? inspectedCount + offset + 1,
    status: "not_inspected_due_to_limit",
  }));
  const provenance = {
    inputPath,
    ...(inputSha256 ? { inputSha256 } : {}),
    inputSchemaVersion: plan.schemaVersion ?? null,
    inputWave: plan.wave ?? null,
    inputGeneratedAt: plan.generatedAt ?? null,
    inputCollectionKey,
    inputCityCount: inputCities.length,
  };
  const policy = {
    version: POLICY_VERSION,
    decision: "accept-only; never rename, merge, group, drop or invent",
    exactInventory: "Every ready city keeps every exact source IRIS ID, official label and type unchanged.",
    labels: "Ready labels must be non-empty, human, unique after French normalization, unnumbered, non-technical, non-direction-only, non-operational and non-generic.",
    exceptions: "Every ambiguity is quarantined for manual exact-ID Guide Alpha curation.",
  };

  const curation = {
    schemaVersion: 1,
    kind: "guide_alpha_auto_curation",
    wave: plan.wave ?? null,
    batch: "strict-safe-only",
    generatedAt,
    provenance,
    auditPolicy: policy,
    source: plan.source ?? null,
    summary: {
      cities: safeCities.length,
      inputCities: inputCities.length,
      inspectedCities: inspectedCount,
      ready: safeCities.length,
      resolutionRequired: 0,
      manualCurationRequired: exceptionCities.length,
      deferredByLimit: deferredCities.length,
      sourceFeatures: safeCities.reduce((sum, city) => sum + city.sourceIris.length, 0),
      visiblePlates: safeCities.reduce((sum, city) => sum + city.sourceIris.length, 0),
      operations: { accept: 0, rename: 0, merge: 0 },
    },
    cities: safeCities.map(makeCurationCity),
  };

  const safePlan = {
    ...plan,
    generatedAt,
    selection: {
      ...(plan.selection ?? {}),
      requestedCount: safeCities.length,
      scannedCandidateCount: inspectedCount,
      autoCuratedSafeCount: safeCities.length,
      autoCurationExceptionCount: exceptionCities.length,
      sourcePlanRequestedCount: plan.selection?.requestedCount ?? inputCities.length,
    },
    totals: summarizePlan(safeCities),
    deferredCandidates: [],
    autoCuration: {
      policyVersion: POLICY_VERSION,
      generatedAt,
      provenance,
      exceptionCount: exceptionCities.length,
      deferredByLimit: deferredCities.length,
    },
    cities: safeCities,
  };
  if (inputCollectionKey !== "cities") delete safePlan[inputCollectionKey];

  const exceptions = {
    schemaVersion: 1,
    kind: "guide_alpha_auto_curation_exceptions",
    wave: plan.wave ?? null,
    generatedAt,
    provenance,
    auditPolicy: policy,
    summary: {
      inputCities: inputCities.length,
      inspectedCities: inspectedCount,
      readyCities: safeCities.length,
      manualCurationRequired: exceptionCities.length,
      deferredByLimit: deferredCities.length,
    },
    cities: exceptionCities,
    deferredCities,
  };

  if (curation.cities.length !== safePlan.cities.length) {
    throw new Error("Internal error: curation and safe plan city counts differ");
  }
  const curationCodes = curation.cities.map((city) => city.code);
  const safePlanCodes = safePlan.cities.map((city) => String(city.communeCode));
  if (JSON.stringify(curationCodes) !== JSON.stringify(safePlanCodes)) {
    throw new Error("Internal error: curation does not exactly cover the safe plan");
  }
  for (let index = 0; index < safePlan.cities.length; index += 1) {
    const plannedCity = safePlan.cities[index];
    const curatedCity = curation.cities[index];
    const plannedInventory = plannedCity.sourceIris.map((source) => ({
      sourceId: String(source.id),
      label: String(source.label).trim(),
      irisType: String(source.type).trim().toUpperCase(),
    }));
    if (
      curatedCity.id !== plannedCity.id
      || curatedCity.name !== plannedCity.name
      || curatedCity.sourceFeatureCount !== plannedCity.sourceIris.length
      || JSON.stringify(curatedCity.officialLabels) !== JSON.stringify(plannedInventory)
    ) {
      throw new Error(`Internal error: exact-ID inventory drift for ${plannedCity.id}`);
    }
  }

  return { curation, safePlan, exceptions };
}

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function resolveUserPath(value) {
  return path.resolve(rootDirectory, value);
}

function displayPath(absolutePath) {
  const relativePath = path.relative(rootDirectory, absolutePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll(path.sep, "/") : absolutePath;
}

async function writeJson(absolutePath, value) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runCli() {
  const inputArgument = getArgument("input");
  const outputArgument = getArgument("output");
  const exceptionsArgument = getArgument("exceptions");
  const safePlanOutputArgument = getArgument("safe-plan-output");
  const limitArgument = getArgument("limit");
  if (!inputArgument || !outputArgument || !exceptionsArgument || !safePlanOutputArgument) {
    throw new Error("Usage: node scripts/auto-curate-france-city-batch.mjs --input=<plan.json> --output=<curation.json> --exceptions=<exceptions.json> --safe-plan-output=<safe-plan.json> [--limit=<positive integer>]");
  }
  const limit = limitArgument === undefined ? Number.POSITIVE_INFINITY : Number(limitArgument);
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit > 0))) {
    throw new Error(`Invalid --limit=${limitArgument}; expected a positive integer`);
  }

  const inputPath = resolveUserPath(inputArgument);
  const outputPath = resolveUserPath(outputArgument);
  const exceptionsPath = resolveUserPath(exceptionsArgument);
  const safePlanOutputPath = resolveUserPath(safePlanOutputArgument);
  const distinctPaths = new Set([inputPath, outputPath, exceptionsPath, safePlanOutputPath].map((value) => value.toLocaleLowerCase("en-US")));
  if (distinctPaths.size !== 4) throw new Error("Input, curation, exceptions and safe-plan output paths must all be distinct");

  const inputText = await readFile(inputPath, "utf8");
  const inputSha256 = createHash("sha256").update(inputText).digest("hex");
  const plan = JSON.parse(inputText);
  const result = curatePlan(plan, {
    limit,
    inputPath: displayPath(inputPath),
    inputSha256,
  });
  await Promise.all([
    writeJson(outputPath, result.curation),
    writeJson(exceptionsPath, result.exceptions),
    writeJson(safePlanOutputPath, result.safePlan),
  ]);

  console.log("Strict Guide Alpha auto-curation: PASS");
  console.log(`${result.curation.summary.ready}/${result.curation.summary.inspectedCities} inspected cities are ready`);
  console.log(`${result.exceptions.summary.manualCurationRequired} manual exceptions; ${result.exceptions.summary.deferredByLimit} deferred by limit`);
  console.log(`Curation: ${displayPath(outputPath)}`);
  console.log(`Safe plan: ${displayPath(safePlanOutputPath)}`);
  console.log(`Exceptions: ${displayPath(exceptionsPath)}`);
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  await runCli();
}
