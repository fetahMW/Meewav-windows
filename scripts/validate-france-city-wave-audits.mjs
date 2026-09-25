#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wave = Number(process.argv.find((argument) => argument.startsWith("--wave="))?.split("=")[1] ?? 7);
const explicitPlanArgument = process.argv.find((argument) => argument.startsWith("--plan="));
const explicitAuditPaths = process.argv
  .filter((argument) => argument.startsWith("--audit="))
  .map((argument) => path.resolve(rootDirectory, argument.slice("--audit=".length)));

if (!Number.isInteger(wave) || wave < 1) throw new Error(`Invalid --wave=${wave}`);

const workDirectory = path.join(rootDirectory, "geo", "work");
const explicitPlanPath = explicitPlanArgument?.slice("--plan=".length).trim();
if (explicitPlanArgument && !explicitPlanPath) throw new Error("--plan requires a relative path");
const planPath = explicitPlanPath
  ? path.resolve(rootDirectory, explicitPlanPath)
  : path.join(workDirectory, `france-wave-${wave}-plan.json`);
const auditPaths = explicitAuditPaths.length
  ? explicitAuditPaths
  : (await readdir(workDirectory))
      .filter((name) => name.startsWith(`france-wave-${wave}-curation-`) && name.endsWith(".json"))
      .sort()
      .map((name) => path.join(workDirectory, name));

if (!auditPaths.length) throw new Error(`No curation artifacts found for wave ${wave}`);

const readJson = async (absolutePath) => JSON.parse(await readFile(absolutePath, "utf8"));
const [plan, ...audits] = await Promise.all([readJson(planPath), ...auditPaths.map(readJson)]);

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

function fold(value) {
  return String(value ?? "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isOpaqueTechnicalLabel(label, cityName) {
  const normalized = fold(label);
  const normalizedCity = fold(cityName);
  const escapedCity = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^(?:nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest))$/u.test(normalized)
    || /^(?:iris|quartier|secteur)\s*\d+$/u.test(normalized)
    || /^s\s*\d+$/u.test(normalized)
    || /^zone\s+s\s*\d+$/u.test(normalized)
    || /^\d+$/u.test(normalized)
    || (escapedCity.length > 0 && new RegExp(`^${escapedCity}\\s+\\d+(?:\\s+.+)?$`, "u").test(normalized));
}

function getOperationSourceIds(operation) {
  return operation.type === "merge"
    ? (operation.sourceIds ?? []).map(String)
    : [String(operation.sourceId ?? "")];
}

function hasStrictContainedEvidence(operation) {
  if (Array.isArray(operation.containedEvidence) && operation.containedEvidence.length > 0) {
    return operation.containedEvidence.every((evidence) => evidence.strictContainmentVerified === true);
  }
  return operation.containmentRule === "strict_point_in_exact_source_polygon"
    && Array.isArray(operation.containedToponyms)
    && operation.containedToponyms.length > 0
    && operation.containedToponyms.every((toponym) => (
      Array.isArray(toponym.coordinates)
      && toponym.coordinates.length >= 2
      && toponym.coordinates.slice(0, 2).every(Number.isFinite)
    ));
}

const totals = { cities: 0, sourceFeatures: 0, visiblePlates: 0, accept: 0, rename: 0, merge: 0 };

for (const plannedCity of planned.cities) {
  const city = auditByCode.get(String(plannedCity.communeCode));
  if (!city) throw new Error(`${plannedCity.id} is missing from the curation artifacts`);
  if (city.status !== "ready") throw new Error(`${plannedCity.id} is not ready`);
  if (city.id !== plannedCity.id || city.name !== plannedCity.name) {
    throw new Error(`${plannedCity.communeCode} plan/audit identity mismatch`);
  }

  const plannedLabels = new Map(plannedCity.sourceIris.map((source) => [String(source.id), String(source.label)]));
  const auditedLabels = new Map((city.officialLabels ?? []).map((source) => [String(source.sourceId), String(source.label)]));
  if (plannedLabels.size !== plannedCity.sourceFeatureCount || auditedLabels.size !== plannedLabels.size) {
    throw new Error(`${city.id} source feature inventory size mismatch`);
  }
  for (const [sourceId, label] of plannedLabels) {
    if (auditedLabels.get(sourceId) !== label) throw new Error(`${city.id} stale source ${sourceId}`);
  }

  const rule = city.guideAlphaRule ?? { type: "none" };
  const operations = rule.operations ?? [];
  const operationBySourceId = new Map();
  const operationIds = new Set();
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (!["accept", "rename", "merge"].includes(operation.type)) {
      throw new Error(`${city.id} operation ${index + 1} has unsupported type ${operation.type}`);
    }
    const sourceIds = getOperationSourceIds(operation);
    if ((operation.type === "merge" && sourceIds.length < 2) || sourceIds.some((sourceId) => !plannedLabels.has(sourceId))) {
      throw new Error(`${city.id} operation ${index + 1} has invalid exact source IDs`);
    }
    const expectedLabels = operation.type === "merge"
      ? operation.expectedLabels
      : [operation.expectedLabel];
    if (!Array.isArray(expectedLabels) || expectedLabels.length !== sourceIds.length) {
      throw new Error(`${city.id} operation ${index + 1} has no exact expected label inventory`);
    }
    sourceIds.forEach((sourceId, sourceIndex) => {
      if (plannedLabels.get(sourceId) !== expectedLabels[sourceIndex]) {
        throw new Error(`${city.id} operation ${index + 1} expectedLabel drift on ${sourceId}`);
      }
      if (operationBySourceId.has(sourceId)) throw new Error(`${city.id} targets ${sourceId} more than once`);
      operationBySourceId.set(sourceId, operation);
    });
    const operationId = String(operation.id ?? `${operation.type}:${sourceIds.join("+")}`);
    if (operationIds.has(operationId)) throw new Error(`${city.id} duplicates operation ${operationId}`);
    operationIds.add(operationId);
    const outputLabel = operation.type === "accept" ? expectedLabels[0] : String(operation.label ?? "").trim();
    if (!outputLabel || isOpaqueTechnicalLabel(outputLabel, city.name)) {
      throw new Error(`${city.id} operation ${operationId} leaves an opaque technical label`);
    }
    if (
      operation.type === "rename"
      && sourceIds.some((sourceId) => isOpaqueTechnicalLabel(plannedLabels.get(sourceId), city.name))
      && !hasStrictContainedEvidence(operation)
    ) {
      throw new Error(`${city.id} technical rename ${operationId} lacks strict contained official evidence`);
    }
    totals[operation.type] += 1;
  }

  const descriptorByKey = new Map();
  for (const [sourceId, rawLabel] of plannedLabels) {
    const operation = operationBySourceId.get(sourceId);
    let key;
    let label;
    if (operation?.type === "merge") {
      key = `curated:${operation.id ?? getOperationSourceIds(operation).join("+")}`;
      label = String(operation.label).trim();
    } else if (operation?.type === "rename") {
      key = `single:${sourceId}`;
      label = String(operation.label).trim();
    } else if (operation?.type === "accept") {
      key = `single:${sourceId}`;
      label = rawLabel;
    } else {
      label = rawLabel;
      let grouped = false;
      if (rule.grouping?.stripTrailingNumber) {
        const match = label.match(/^(.*?)(?:[\s-]+)(\d+)$/u);
        if (match?.[1]?.trim()) {
          label = match[1].trim();
          grouped = true;
        }
      }
      label = rule.grouping?.labelOverrides?.[label] ?? label;
      key = grouped || rule.grouping?.mergeExactLabels ? `group:${label}` : `single:${sourceId}`;
    }
    if (descriptorByKey.has(key) && descriptorByKey.get(key) !== label) {
      throw new Error(`${city.id} descriptor ${key} has conflicting labels`);
    }
    descriptorByKey.set(key, label);
  }

  const visibleLabels = [...descriptorByKey.values()];
  if (new Set(visibleLabels).size !== visibleLabels.length) {
    throw new Error(`${city.id} still contains duplicate visible human labels`);
  }
  for (const [sourceId, label] of plannedLabels) {
    if (
      /\p{L}[\s-]*\d+$/u.test(label)
      && !operationBySourceId.has(sourceId)
      && !rule.grouping?.stripTrailingNumber
    ) {
      throw new Error(`${city.id} leaves numbered label ${label} without explicit resolution`);
    }
    if (isOpaqueTechnicalLabel(label, city.name)) {
      const operation = operationBySourceId.get(sourceId);
      if (operation?.type !== "rename") throw new Error(`${city.id} does not rename technical source ${sourceId}`);
    }
  }

  totals.cities += 1;
  totals.sourceFeatures += plannedLabels.size;
  totals.visiblePlates += descriptorByKey.size;
}

console.log(`Wave ${wave} Guide Alpha audit artifacts: PASS`);
console.log(`${totals.cities} cities, ${totals.sourceFeatures} official IRIS, ${totals.visiblePlates} visible plates`);
console.log(`${totals.accept} accept, ${totals.rename} rename, ${totals.merge} merge operations`);
