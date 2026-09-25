import {
  bboxEquals,
  computeBbox,
  isFinitePosition,
  pointInGeometry,
  validateGeometry,
} from "./geometry.mjs";
import { isUuid } from "./id.mjs";

const ADMINISTRATIVE_SOURCE_TYPES = new Set(["region", "department", "commune", "iris", "local_district"]);
const MUSIC_SOURCE_TYPES = new Set(["official", "merged", "local", "generated", "commune_fallback", "custom"]);
const ZONE_STATUSES = new Set(["draft", "validated", "published"]);
const ZONE_QUALITIES = new Set(["official", "curated", "fallback"]);

function issue(code, path, message, severity = "error") {
  return { code, path, message, severity };
}

function requireNonEmptyString(issues, value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue("field.non_empty_string", path, "Expected a non-empty string"));
  }
}

function requireUuid(issues, value, path, nullable = false) {
  if (nullable && value === null) return;
  if (!isUuid(value)) issues.push(issue("field.uuid", path, "Expected a UUID"));
}

function validateCameraOverride(issues, cameraOverride, path) {
  if (cameraOverride === undefined) return;
  if (!cameraOverride || typeof cameraOverride !== "object" || Array.isArray(cameraOverride)) {
    issues.push(issue("camera.type", path, "Expected a camera override object"));
    return;
  }

  const ranges = {
    zoom: [0, 24],
    pitch: [0, 85],
    bearing: [-360, 360],
    padding: [0, Infinity],
  };
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const value = cameraOverride[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      issues.push(issue("camera.range", `${path}.${key}`, `Expected a value between ${minimum} and ${maximum}`));
    }
  }
}

export function validateAdministrativeZone(zone, path = "administrativeZone") {
  const issues = [];
  if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
    return [issue("zone.type", path, "Expected an AdministrativeZone object")];
  }

  requireUuid(issues, zone.id, `${path}.id`);
  if (!ADMINISTRATIVE_SOURCE_TYPES.has(zone.sourceType)) {
    issues.push(issue("administrative.source_type", `${path}.sourceType`, "Unknown administrative source type"));
  }
  requireNonEmptyString(issues, zone.sourceProvider, `${path}.sourceProvider`);
  requireNonEmptyString(issues, zone.sourceCode, `${path}.sourceCode`);
  requireNonEmptyString(issues, zone.sourceVintage, `${path}.sourceVintage`);
  requireNonEmptyString(issues, zone.officialName, `${path}.officialName`);
  requireUuid(issues, zone.parentId, `${path}.parentId`, true);
  if (zone.communeCode !== null) requireNonEmptyString(issues, zone.communeCode, `${path}.communeCode`);
  issues.push(...validateGeometry(zone.geometry, `${path}.geometry`).map((entry) => ({ ...entry, severity: "error" })));
  return issues;
}

export function validateMusicZone(zone, path = "musicZone") {
  const issues = [];
  if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
    return [issue("zone.type", path, "Expected a MusicZone object")];
  }

  requireUuid(issues, zone.zoneId, `${path}.zoneId`);
  requireNonEmptyString(issues, zone.displayName, `${path}.displayName`);
  requireNonEmptyString(issues, zone.communeCode, `${path}.communeCode`);
  requireNonEmptyString(issues, zone.communeName, `${path}.communeName`);
  requireNonEmptyString(issues, zone.sourceVintage, `${path}.sourceVintage`);
  requireUuid(issues, zone.parentZoneId, `${path}.parentZoneId`, true);

  if (!Array.isArray(zone.aliases)) {
    issues.push(issue("music.aliases.type", `${path}.aliases`, "Expected an array of aliases"));
  } else {
    const normalized = zone.aliases.map((alias) => (typeof alias === "string" ? alias.trim().toLocaleLowerCase("fr") : alias));
    zone.aliases.forEach((alias, index) => requireNonEmptyString(issues, alias, `${path}.aliases[${index}]`));
    if (new Set(normalized).size !== normalized.length) {
      issues.push(issue("music.aliases.duplicate", `${path}.aliases`, "Aliases must be unique", "warning"));
    }
  }

  if (!Array.isArray(zone.sourceZoneIds) || zone.sourceZoneIds.length === 0) {
    issues.push(issue("music.sources.empty", `${path}.sourceZoneIds`, "At least one source zone is required"));
  } else {
    zone.sourceZoneIds.forEach((sourceZoneId, index) => requireUuid(issues, sourceZoneId, `${path}.sourceZoneIds[${index}]`));
    if (new Set(zone.sourceZoneIds).size !== zone.sourceZoneIds.length) {
      issues.push(issue("music.sources.duplicate", `${path}.sourceZoneIds`, "Source zone IDs must be unique"));
    }
  }

  if (!MUSIC_SOURCE_TYPES.has(zone.sourceType)) {
    issues.push(issue("music.source_type", `${path}.sourceType`, "Unknown music zone source type"));
  }
  if (!ZONE_STATUSES.has(zone.status)) {
    issues.push(issue("music.status", `${path}.status`, "Unknown publication status"));
  }
  if (!ZONE_QUALITIES.has(zone.quality)) {
    issues.push(issue("music.quality", `${path}.quality`, "Unknown zone quality"));
  }

  issues.push(...validateGeometry(zone.geometry, `${path}.geometry`).map((entry) => ({ ...entry, severity: "error" })));
  const computedBbox = computeBbox(zone.geometry);
  if (!Array.isArray(zone.bbox) || zone.bbox.length !== 4 || zone.bbox.some((value) => !Number.isFinite(value))) {
    issues.push(issue("music.bbox.type", `${path}.bbox`, "Expected four finite bbox values"));
  } else if (computedBbox && !bboxEquals(zone.bbox, computedBbox)) {
    issues.push(issue("music.bbox.mismatch", `${path}.bbox`, "Stored bbox does not match the geometry"));
  }

  if (!isFinitePosition(zone.center)) {
    issues.push(issue("music.center.invalid", `${path}.center`, "Expected a valid longitude/latitude"));
  }
  if (!isFinitePosition(zone.labelPoint)) {
    issues.push(issue("music.label_point.invalid", `${path}.labelPoint`, "Expected a valid longitude/latitude"));
  } else if (!pointInGeometry(zone.labelPoint, zone.geometry)) {
    issues.push(issue("music.label_point.outside", `${path}.labelPoint`, "Label point must be inside the zone geometry"));
  }

  validateCameraOverride(issues, zone.cameraOverride, `${path}.cameraOverride`);
  return issues;
}

function findParentCycles(zones, idField, parentField) {
  const byId = new Map(zones.map((zone) => [zone[idField], zone]));
  const cycles = [];
  for (const zone of zones) {
    const visited = new Set();
    let cursor = zone;
    while (cursor?.[parentField]) {
      if (visited.has(cursor[parentField])) {
        cycles.push(zone[idField]);
        break;
      }
      visited.add(cursor[parentField]);
      cursor = byId.get(cursor[parentField]);
    }
  }
  return [...new Set(cycles)];
}

export function validateDataset(dataset) {
  const issues = [];
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
    return { valid: false, errors: [issue("dataset.type", "dataset", "Expected a dataset object")], warnings: [], metrics: {} };
  }

  requireUuid(issues, dataset.datasetId, "dataset.datasetId");
  requireNonEmptyString(issues, dataset.version, "dataset.version");
  requireNonEmptyString(issues, dataset.scope, "dataset.scope");
  if (!ZONE_STATUSES.has(dataset.status)) issues.push(issue("dataset.status", "dataset.status", "Unknown dataset status"));
  if (!Number.isFinite(Date.parse(dataset.createdAt))) issues.push(issue("dataset.created_at", "dataset.createdAt", "Expected an ISO date"));
  if (dataset.publishedAt !== null && dataset.publishedAt !== undefined && !Number.isFinite(Date.parse(dataset.publishedAt))) {
    issues.push(issue("dataset.published_at", "dataset.publishedAt", "Expected an ISO date or null"));
  }
  if (!Array.isArray(dataset.sources) || dataset.sources.length === 0) {
    issues.push(issue("dataset.sources.empty", "dataset.sources", "At least one dataset source is required"));
  } else {
    dataset.sources.forEach((source, index) => {
      requireNonEmptyString(issues, source?.provider, `dataset.sources[${index}].provider`);
      requireNonEmptyString(issues, source?.sourceType, `dataset.sources[${index}].sourceType`);
      requireNonEmptyString(issues, source?.vintage, `dataset.sources[${index}].vintage`);
      requireNonEmptyString(issues, source?.license, `dataset.sources[${index}].license`);
    });
  }

  const administrativeZones = Array.isArray(dataset.administrativeZones) ? dataset.administrativeZones : [];
  const musicZones = Array.isArray(dataset.musicZones) ? dataset.musicZones : [];
  if (!Array.isArray(dataset.administrativeZones)) issues.push(issue("dataset.administrative.type", "dataset.administrativeZones", "Expected an array"));
  if (!Array.isArray(dataset.musicZones)) issues.push(issue("dataset.music.type", "dataset.musicZones", "Expected an array"));

  administrativeZones.forEach((zone, index) => issues.push(...validateAdministrativeZone(zone, `dataset.administrativeZones[${index}]`)));
  musicZones.forEach((zone, index) => issues.push(...validateMusicZone(zone, `dataset.musicZones[${index}]`)));

  const administrativeIds = new Set();
  administrativeZones.forEach((zone, index) => {
    if (administrativeIds.has(zone.id)) issues.push(issue("dataset.administrative.duplicate", `dataset.administrativeZones[${index}].id`, "Duplicate administrative zone ID"));
    administrativeIds.add(zone.id);
  });
  administrativeZones.forEach((zone, index) => {
    if (zone.parentId && !administrativeIds.has(zone.parentId)) {
      issues.push(issue("dataset.administrative.parent_missing", `dataset.administrativeZones[${index}].parentId`, "Parent administrative zone does not exist"));
    }
  });

  const musicIds = new Set();
  musicZones.forEach((zone, index) => {
    if (musicIds.has(zone.zoneId)) issues.push(issue("dataset.music.duplicate", `dataset.musicZones[${index}].zoneId`, "Duplicate music zone ID"));
    musicIds.add(zone.zoneId);
    if (zone.parentZoneId && !musicZones.some((candidate) => candidate.zoneId === zone.parentZoneId)) {
      issues.push(issue("dataset.music.parent_missing", `dataset.musicZones[${index}].parentZoneId`, "Parent music zone does not exist"));
    }
    for (const sourceZoneId of zone.sourceZoneIds ?? []) {
      if (!administrativeIds.has(sourceZoneId)) {
        issues.push(issue("dataset.music.source_missing", `dataset.musicZones[${index}].sourceZoneIds`, `Administrative source ${sourceZoneId} does not exist`));
      }
    }
    if (dataset.status === "published" && zone.status !== "published") {
      issues.push(issue("dataset.music.unpublished", `dataset.musicZones[${index}].status`, "A published dataset cannot contain an unpublished music zone"));
    }
  });

  for (const zoneId of findParentCycles(administrativeZones, "id", "parentId")) {
    issues.push(issue("dataset.administrative.parent_cycle", "dataset.administrativeZones", `Parent cycle detected from ${zoneId}`));
  }
  for (const zoneId of findParentCycles(musicZones, "zoneId", "parentZoneId")) {
    issues.push(issue("dataset.music.parent_cycle", "dataset.musicZones", `Parent cycle detected from ${zoneId}`));
  }

  const errors = issues.filter((entry) => entry.severity !== "warning");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      administrativeZoneCount: administrativeZones.length,
      musicZoneCount: musicZones.length,
      sourceCount: Array.isArray(dataset.sources) ? dataset.sources.length : 0,
    },
  };
}
