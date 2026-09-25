#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wave = Number(process.argv.find((argument) => argument.startsWith("--wave="))?.split("=")[1] ?? 6);
const explicitPlanArgument = process.argv.find((argument) => argument.startsWith("--plan="));
const explicitPlanPath = explicitPlanArgument?.slice("--plan=".length).trim();
if (explicitPlanArgument && !explicitPlanPath) throw new Error("--plan requires a relative path");
const planPath = explicitPlanPath
  ? path.resolve(rootDirectory, explicitPlanPath)
  : path.join(rootDirectory, `geo/work/france-wave-${wave}-plan.json`);
const auditPaths = process.argv
  .filter((argument) => argument.startsWith("--audit="))
  .map((argument) => path.resolve(rootDirectory, argument.slice("--audit=".length)));
const workDirectory = path.join(rootDirectory, "geo", "work");
const effectiveAuditPaths = auditPaths.length
  ? auditPaths
  : (await readdir(workDirectory))
      .filter((name) => name.startsWith(`france-wave-${wave}-curation-`) && name.endsWith(".json"))
      .sort()
      .map((name) => path.join(workDirectory, name));

if (!effectiveAuditPaths.length) throw new Error(`No curation artifacts found for wave ${wave}`);

const readJson = async (absolutePath) => JSON.parse(await readFile(absolutePath, "utf8"));
const writeJson = async (absolutePath, value) => writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function slugify(value) {
  return fold(value)
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTechnicalLabel(label, cityName) {
  const normalized = fold(label).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedCity = fold(cityName).replace(/[^a-z0-9]+/g, " ").trim();
  return /^(?:nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest))$/u.test(normalized)
    || /^(?:iris|quartier|secteur)\s*\d+$/u.test(normalized)
    || /^s\s*\d+$/u.test(normalized)
    || /^zone\s+s\s*\d+$/u.test(normalized)
    || /^\d+$/u.test(normalized)
    || (
      normalizedCity.length > 0
      && new RegExp(`^${normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d+(?:\\s+.+)?$`, "u").test(normalized)
    );
}

function getOperationSourceIds(operation) {
  return operation.type === "merge"
    ? (operation.sourceIds ?? []).map(String)
    : [String(operation.sourceId ?? "")];
}

function buildFinalDescriptors(city, rule, operations) {
  const operationBySourceId = new Map();
  for (const operation of operations) {
    for (const sourceId of getOperationSourceIds(operation)) operationBySourceId.set(sourceId, operation);
  }
  const grouping = rule.grouping ?? null;
  const descriptors = new Set();
  for (const source of city.officialLabels) {
    const sourceId = String(source.sourceId);
    const operation = operationBySourceId.get(sourceId);
    if (operation?.type === "merge") {
      descriptors.add(`curated:${operation.id}`);
      continue;
    }
    if (operation) {
      descriptors.add(`single:${sourceId}`);
      continue;
    }
    let label = String(source.label).trim();
    let grouped = false;
    if (grouping?.stripTrailingNumber) {
      const match = label.match(/^(.*?)(?:[\s-]+)(\d+)$/u);
      if (match?.[1]?.trim()) {
        label = match[1].trim();
        grouped = true;
      }
    }
    label = grouping?.labelOverrides?.[label] ?? label;
    descriptors.add(grouped || grouping?.mergeExactLabels ? `group:${label}` : `single:${sourceId}`);
  }
  return descriptors;
}

function normalizeOperation(city, rule, rawOperation, officialLabelById, operationIndex) {
  const type = rawOperation.type;
  if (!new Set(["accept", "rename", "merge"]).has(type)) {
    throw new Error(`${city.id} operation ${operationIndex + 1} has unsupported type ${type}`);
  }
  const sourceIds = type === "merge"
    ? (rawOperation.sourceIds ?? []).map(String)
    : [String(rawOperation.sourceId ?? "")];
  if ((type === "merge" && sourceIds.length < 2) || sourceIds.some((sourceId) => !officialLabelById.has(sourceId))) {
    throw new Error(`${city.id} operation ${operationIndex + 1} has invalid exact source IDs`);
  }
  const expectedLabels = rawOperation.expectedLabels
    ?? sourceIds.map((sourceId) => officialLabelById.get(sourceId));
  const outputLabel = type === "accept"
    ? expectedLabels[0]
    : String(rawOperation.label ?? "").trim();
  if (!outputLabel) throw new Error(`${city.id} operation ${operationIndex + 1} has no output label`);
  if (isTechnicalLabel(outputLabel, city.name)) {
    throw new Error(`${city.id} operation ${operationIndex + 1} leaves technical label ${outputLabel}`);
  }
  const fallbackEvidenceRefs = type === "accept"
    ? ["ign-insee-contours-iris-2026", "guide-alpha-editorial-recovery-2026-07-14"]
    : [
        "ign-insee-contours-iris-2026",
        "ign-geoplateforme-toponymy-2026",
        "guide-alpha-editorial-recovery-2026-07-14",
      ];
  const rawEvidenceRefs = Array.isArray(rawOperation.evidenceRefs)
    ? rawOperation.evidenceRefs.map((reference) => String(reference).trim()).filter(Boolean)
    : [];
  const evidenceRefs = [...new Set(rawEvidenceRefs.length ? rawEvidenceRefs : fallbackEvidenceRefs)];
  const operationId = rawOperation.id
    ?? `${city.id}-${sourceIds.join("-")}-${slugify(outputLabel)}`;
  const normalizedOperation = {
    id: operationId,
    type,
    ...(type === "merge" ? { sourceIds, expectedLabels } : {
      sourceId: sourceIds[0],
      expectedLabel: expectedLabels[0],
    }),
    ...(type === "accept" ? {} : { label: outputLabel }),
    ...(rawOperation.outputId ? { outputId: rawOperation.outputId } : {}),
    evidenceRefs,
    rationale: String(rawOperation.rationale ?? rawOperation.justification ?? rule.justification ?? "Guide Alpha exact-ID semantic review"),
  };
  // Evidence produced by the strict semantic resolver is part of the audit
  // contract, not disposable generator metadata. Keep the exact proof objects
  // when projecting a reviewed operation into the runtime curation catalog.
  for (const field of [
    "containedEvidence",
    "containedToponyms",
    "containmentRule",
    "selectionProof",
    "topology",
  ]) {
    if (rawOperation[field] !== undefined) normalizedOperation[field] = rawOperation[field];
  }
  return normalizedOperation;
}

const [plan, ...audits] = await Promise.all([
  readJson(planPath),
  ...effectiveAuditPaths.map(readJson),
]);

function validatePlanContract(rawPlan) {
  if (!Array.isArray(rawPlan?.cities) || rawPlan.cities.length < 1) {
    throw new Error(`Wave ${wave} must contain at least one planned city`);
  }
  if (rawPlan.wave !== undefined && Number(rawPlan.wave) !== wave) {
    throw new Error(`Wave ${wave} plan declares wave ${rawPlan.wave}`);
  }
  const declaredCount = rawPlan.totals?.cities;
  if (
    declaredCount !== undefined
    && (!Number.isInteger(declaredCount) || declaredCount < 1 || declaredCount !== rawPlan.cities.length)
  ) {
    throw new Error(
      `Wave ${wave} declares ${declaredCount} cities but contains ${rawPlan.cities.length}`,
    );
  }

  const cityIds = new Set();
  const communeCodes = new Set();
  for (const [index, city] of rawPlan.cities.entries()) {
    const id = String(city?.id ?? "").trim();
    const name = String(city?.name ?? "").trim();
    const communeCode = String(city?.communeCode ?? "").trim();
    if (!id || !name || !communeCode) {
      throw new Error(`Wave ${wave} planned city ${index + 1} has an incomplete identity`);
    }
    if (cityIds.has(id)) throw new Error(`Wave ${wave} duplicates planned city id ${id}`);
    if (communeCodes.has(communeCode)) {
      throw new Error(`Wave ${wave} duplicates planned commune code ${communeCode}`);
    }
    cityIds.add(id);
    communeCodes.add(communeCode);
  }
  return { cities: rawPlan.cities, cityIds, communeCodes };
}

function indexAuditedCities(rawAudits, planned) {
  for (const [index, audit] of rawAudits.entries()) {
    if (!Array.isArray(audit?.cities)) {
      throw new Error(`Wave ${wave} curation artifact ${index + 1} has no cities array`);
    }
  }
  const cities = rawAudits.flatMap((audit) => audit.cities);
  if (cities.length !== planned.cities.length) {
    throw new Error(`Wave ${wave} has ${cities.length}/${planned.cities.length} audited cities`);
  }

  const byCode = new Map();
  const cityIds = new Set();
  for (const [index, city] of cities.entries()) {
    const id = String(city?.id ?? "").trim();
    const code = String(city?.code ?? city?.communeCode ?? "").trim();
    if (!id || !code) throw new Error(`Wave ${wave} audited city ${index + 1} has an incomplete identity`);
    if (cityIds.has(id)) throw new Error(`Wave ${wave} duplicates audited city id ${id}`);
    if (byCode.has(code)) throw new Error(`Wave ${wave} duplicates audited commune code ${code}`);
    if (!planned.cityIds.has(id) || !planned.communeCodes.has(code)) {
      throw new Error(`Wave ${wave} audit contains unplanned city ${id} (${code})`);
    }
    cityIds.add(id);
    byCode.set(code, city);
  }
  return byCode;
}

const planned = validatePlanContract(plan);
const auditByCode = indexAuditedCities(audits, planned);

const catalogPath = path.join(rootDirectory, "geo/catalog/france-city-iris.json");
const curationPath = path.join(rootDirectory, "geo/catalog/france-city-curation.json");
const [catalog, curationCatalog] = await Promise.all([readJson(catalogPath), readJson(curationPath)]);
const existingCityIds = new Set(catalog.cities.map((city) => city.id));
const existingCommuneCodes = new Set(catalog.cities.map((city) => String(city.communeCode)));
const existingCityIndexById = new Map(catalog.cities.map((city, index) => [city.id, index]));
const existingCityIdByCommuneCode = new Map(catalog.cities.map((city) => [String(city.communeCode), city.id]));
const curationCityById = new Map(curationCatalog.cities.map((city) => [city.cityId, city]));
const curationSourceById = new Map((curationCatalog.sources ?? []).map((source) => [String(source.id), source]));

for (const [auditIndex, audit] of audits.entries()) {
  if (audit.evidenceSources !== undefined && !Array.isArray(audit.evidenceSources)) {
    throw new Error(`Wave ${wave} curation artifact ${auditIndex + 1} has invalid evidenceSources`);
  }
  for (const source of audit.evidenceSources ?? []) {
    const sourceId = String(source?.id ?? "").trim();
    if (!sourceId) throw new Error(`Wave ${wave} curation artifact ${auditIndex + 1} has an unnamed evidence source`);
    if (!curationSourceById.has(sourceId)) curationSourceById.set(sourceId, source);
  }
}

for (const plannedCity of planned.cities) {
  const auditedCity = auditByCode.get(String(plannedCity.communeCode));
  if (!auditedCity || auditedCity.status !== "ready") {
    throw new Error(`${plannedCity.id} is not fully resolved by Guide Alpha`);
  }
  if (auditedCity.id !== plannedCity.id || auditedCity.name !== plannedCity.name) {
    throw new Error(`${plannedCity.communeCode} plan/audit identity mismatch`);
  }
  const existingCityIndex = existingCityIndexById.get(plannedCity.id);
  const existingIdForCode = existingCityIdByCommuneCode.get(plannedCity.communeCode);
  if (existingCityIndex !== undefined || existingIdForCode !== undefined) {
    const existingCity = existingCityIndex === undefined ? null : catalog.cities[existingCityIndex];
    if (
      !existingCity
      || existingIdForCode !== plannedCity.id
      || String(existingCity.communeCode) !== plannedCity.communeCode
      || Number(existingCity.wave) !== wave
    ) {
      throw new Error(`${plannedCity.id} conflicts with an existing city catalog entry`);
    }
  }

  const rule = auditedCity.guideAlphaRule ?? { type: "none" };
  const officialLabels = auditedCity.officialLabels ?? plannedCity.sourceIris.map((source) => ({
    sourceId: source.id,
    label: source.label,
  }));
  const officialLabelById = new Map(officialLabels.map((source) => [String(source.sourceId), String(source.label)]));
  const rawOperations = [...(rule.operations ?? [])];
  const targetedSourceIds = new Set(rawOperations.flatMap(getOperationSourceIds));

  // A reviewed exact official facility or human-qualified directional label is
  // a legitimate Guide Alpha resolution when no licensed polygon crosswalk
  // supports a rename. A direction alone is rejected by isTechnicalLabel.
  for (const anomaly of auditedCity.anomalies ?? []) {
    if (anomaly.severity !== "error") continue;
    for (const sourceId of anomaly.sourceIds ?? []) {
      if (targetedSourceIds.has(String(sourceId))) continue;
      const label = officialLabelById.get(String(sourceId));
      if (!label) throw new Error(`${plannedCity.id} anomaly targets unknown ${sourceId}`);
      if (isTechnicalLabel(label, plannedCity.name)) {
        throw new Error(`${plannedCity.id} still has unresolved technical source ${sourceId} (${label})`);
      }
      rawOperations.push({
        type: "accept",
        sourceId: String(sourceId),
        expectedLabel: label,
        justification: `The exact official IGN/INSEE sector label “${label}” is retained after Guide Alpha review because no licensed official polygon crosswalk supports a safer rename.`,
      });
      targetedSourceIds.add(String(sourceId));
    }
  }

  const operations = rawOperations.map((operation, operationIndex) => normalizeOperation(
    auditedCity,
    rule,
    operation,
    officialLabelById,
    operationIndex,
  ));
  const operationIds = new Set(operations.map((operation) => operation.id));
  if (operationIds.size !== operations.length) throw new Error(`${plannedCity.id} has duplicate curation operation IDs`);
  const expectedFinalFeatureCount = buildFinalDescriptors(
    { ...auditedCity, officialLabels },
    rule,
    operations,
  ).size;

  const outputFileId = plannedCity.id.replaceAll("_", "-");
  const catalogCity = {
    id: plannedCity.id,
    name: plannedCity.name,
    communeCode: plannedCity.communeCode,
    expectedFeatureCount: plannedCity.sourceFeatureCount,
    expectedOutputFeatureCount: expectedFinalFeatureCount,
    ...(rule.grouping ? {
      humanZoneGrouping: {
        ...rule.grouping,
        expectedFeatureCount: expectedFinalFeatureCount,
      },
    } : {}),
    outputPath: `public/map/${outputFileId}-quartiers.geojson`,
    wave,
    population: plannedCity.population,
    runtimeMode: "standalone_split",
  };
  if (existingCityIndex === undefined) {
    catalog.cities.push(catalogCity);
    existingCityIds.add(plannedCity.id);
    existingCommuneCodes.add(plannedCity.communeCode);
    existingCityIndexById.set(plannedCity.id, catalog.cities.length - 1);
    existingCityIdByCommuneCode.set(plannedCity.communeCode, plannedCity.id);
  } else {
    catalog.cities[existingCityIndex] = catalogCity;
  }

  if (operations.length) {
    const sourceRefs = [...new Set([
      ...(Array.isArray(rule.sourceRefs) ? rule.sourceRefs : []),
      ...operations.flatMap((operation) => operation.evidenceRefs ?? []),
    ].map((reference) => String(reference).trim()).filter(Boolean))];
    const unknownSourceRefs = sourceRefs.filter((sourceRef) => !curationSourceById.has(sourceRef));
    if (unknownSourceRefs.length) {
      throw new Error(`${plannedCity.id} references unknown curation evidence sources: ${unknownSourceRefs.join(", ")}`);
    }
    curationCityById.set(plannedCity.id, {
      cityId: plannedCity.id,
      status: "resolved",
      revision: 1,
      expectedFeatureCount: expectedFinalFeatureCount,
      sourceRefs,
      operations,
    });
  }
}

curationCatalog.sources = [...curationSourceById.values()];
curationCatalog.cities = [...curationCityById.values()].sort((left, right) => left.cityId.localeCompare(right.cityId));
await Promise.all([writeJson(catalogPath, catalog), writeJson(curationPath, curationCatalog)]);
console.log(`Applied France wave ${wave}: ${planned.cities.length} cities`);
console.log(`Catalog cities: ${catalog.cities.length}`);
console.log(`Curated cities: ${curationCatalog.cities.length}`);
