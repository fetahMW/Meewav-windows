import union from "@turf/union";

import {
  computeBbox,
  findRepresentativePoint,
  getPolygons,
  pointInGeometryInterior,
  validateGeometry,
} from "./geometry.mjs";

function stripAccents(value) {
  return String(value)
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ringAreaSquareMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const latitude = ring.reduce((sum, coordinate) => sum + Number(coordinate[1]), 0) / ring.length;
  const longitudeScale = 111_320 * Math.cos(latitude * Math.PI / 180);
  const latitudeScale = 110_540;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    twiceArea += current[0] * longitudeScale * next[1] * latitudeScale
      - next[0] * longitudeScale * current[1] * latitudeScale;
  }
  return twiceArea / 2;
}

function geometryAreaSquareMeters(geometry) {
  return getPolygons(geometry).reduce((sum, polygon) => {
    const exterior = Math.abs(ringAreaSquareMeters(polygon[0]));
    const holes = polygon.slice(1).reduce((holeSum, ring) => holeSum + Math.abs(ringAreaSquareMeters(ring)), 0);
    return sum + Math.max(0, exterior - holes);
  }, 0);
}

function getSourceZoneId(feature) {
  return String(feature?.properties?.officialId ?? feature?.properties?.districtCode ?? feature?.id ?? "").trim();
}

function requiredCurationText(value, context) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${context} is required`);
  return text;
}

function isTechnicalLabel(value, { allowReviewedDirection = false } = {}) {
  const label = String(value ?? "").trim();
  const normalized = stripAccents(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return (!allowReviewedDirection
      && /^(?:nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest))$/u.test(normalized))
    || /^iris(?:[\s_-]*\d+)?$/iu.test(label)
    || /^\d+$/.test(label);
}

function getOperationSourceIds(operation) {
  if (operation.type === "merge") {
    if (!Array.isArray(operation.sourceIds) || operation.sourceIds.length < 2) {
      throw new Error(`${operation.id ?? "Curated merge"} must target at least two exact source IDs`);
    }
    return operation.sourceIds.map((sourceId) => requiredCurationText(sourceId, `${operation.id} sourceId`));
  }
  return [requiredCurationText(operation.sourceId, `${operation.id ?? "Curation operation"} sourceId`)];
}

function buildCurationIndex(collection, options) {
  const curation = options.curation;
  if (!curation) return { operationBySourceId: new Map(), operations: [] };
  if (curation.status !== "resolved") {
    throw new Error(`${options.cityId} curation must be resolved before generation`);
  }
  if (!Number.isInteger(curation.revision) || curation.revision < 1) {
    throw new Error(`${options.cityId} curation revision must be a positive integer`);
  }
  if (!Array.isArray(curation.sources) || curation.sources.length === 0) {
    throw new Error(`${options.cityId} curation must cite at least one provenance source`);
  }
  const sourceRefs = new Set();
  for (const source of curation.sources) {
    const sourceId = requiredCurationText(source.id, `${options.cityId} curation source id`);
    requiredCurationText(source.provider, `${sourceId} provider`);
    requiredCurationText(source.datasetUrl, `${sourceId} datasetUrl`);
    if (sourceRefs.has(sourceId)) throw new Error(`${options.cityId} duplicates curation source ${sourceId}`);
    sourceRefs.add(sourceId);
  }

  const sourceFeatureById = new Map(collection.features.map((feature) => [getSourceZoneId(feature), feature]));
  const operationBySourceId = new Map();
  const operationIds = new Set();
  const operations = Array.isArray(curation.operations) ? curation.operations : [];
  for (const operation of operations) {
    const operationId = requiredCurationText(operation.id, `${options.cityId} curation operation id`);
    if (operationIds.has(operationId)) throw new Error(`${options.cityId} duplicates curation operation ${operationId}`);
    operationIds.add(operationId);
    if (!["accept", "rename", "merge"].includes(operation.type)) {
      throw new Error(`${operationId} has unsupported curation type ${operation.type}`);
    }
    requiredCurationText(operation.rationale, `${operationId} rationale`);
    if (!Array.isArray(operation.evidenceRefs) || operation.evidenceRefs.length === 0) {
      throw new Error(`${operationId} must cite at least one evidence source`);
    }
    for (const evidenceRef of operation.evidenceRefs) {
      if (!sourceRefs.has(evidenceRef)) throw new Error(`${operationId} references unknown evidence source ${evidenceRef}`);
    }
    if (operation.type === "rename" || operation.type === "merge") {
      requiredCurationText(operation.label, `${operationId} output label`);
    }
    const sourceIds = getOperationSourceIds(operation);
    const expectedLabels = operation.type === "merge"
      ? operation.expectedLabels
      : [operation.expectedLabel];
    if (!Array.isArray(expectedLabels) || expectedLabels.length !== sourceIds.length) {
      throw new Error(`${operationId} must provide one expected label per exact source ID`);
    }
    const resolvedLabel = operation.type === "accept" ? expectedLabels[0] : operation.label;
    // Existing exact official directions explicitly accepted by a reviewed
    // legacy curation remain reproducible. A rename or merge may never create
    // a direction-only label; every newly applied wave rejects those earlier.
    if (isTechnicalLabel(resolvedLabel, { allowReviewedDirection: operation.type === "accept" })) {
      throw new Error(`${operationId} must resolve the technical label ${resolvedLabel} to a human place name`);
    }
    sourceIds.forEach((sourceId, index) => {
      const feature = sourceFeatureById.get(sourceId);
      if (!feature) throw new Error(`${operationId} targets missing source zone ${sourceId}`);
      const expectedLabel = requiredCurationText(expectedLabels[index], `${operationId} expected label`);
      const actualLabel = String(feature.properties?.label ?? "").trim();
      if (actualLabel !== expectedLabel) {
        throw new Error(`${operationId} expected ${sourceId} label ${expectedLabel}, received ${actualLabel}`);
      }
      if (operationBySourceId.has(sourceId)) {
        throw new Error(`${sourceId} is targeted by multiple curation operations`);
      }
      operationBySourceId.set(sourceId, operation);
    });
  }
  return { operationBySourceId, operations };
}

function getGroupDescriptor(feature, options, curationIndex) {
  const rawLabel = String(feature?.properties?.label ?? "").trim();
  if (!rawLabel) throw new Error("Every source zone must have a human label before grouping");
  const sourceZoneId = getSourceZoneId(feature);
  const curationOperation = curationIndex.operationBySourceId.get(sourceZoneId);
  if (curationOperation?.type === "merge") {
    return {
      key: `curated:${curationOperation.id}`,
      label: curationOperation.label,
      groupingRule: "curated-exact-source-id-group",
      curationOperation,
    };
  }
  if (curationOperation?.type === "rename") {
    return {
      key: `single:${String(feature.id ?? feature.properties?.zoneId)}`,
      label: curationOperation.label,
      groupingRule: null,
      curationOperation,
    };
  }
  if (curationOperation?.type === "accept") {
    return {
      key: `single:${String(feature.id ?? feature.properties?.zoneId)}`,
      label: rawLabel,
      groupingRule: null,
      curationOperation,
    };
  }
  let label = rawLabel;
  let groupingRule = null;

  if (options.stripTrailingNumber) {
    const match = rawLabel.match(/^(.*?)(?:[\s-]+)(\d+)$/u);
    if (match?.[1]?.trim()) {
      label = match[1].trim();
      groupingRule = "shared-official-label-with-trailing-number";
    }
  }

  label = options.labelOverrides?.[label] ?? label;
  const parentKey = String(feature?.properties?.parentZoneId ?? feature?.properties?.parentCode ?? options.communeCode);
  if (groupingRule || options.mergeExactLabels) {
    return { key: `${parentKey}:${label}`, label, groupingRule: groupingRule ?? "shared-exact-official-label" };
  }
  return { key: `single:${String(feature.id ?? feature.properties?.zoneId)}`, label, groupingRule: null };
}

function mergeGeometry(features, label) {
  if (features.length === 1) return features[0].geometry;
  const merged = union({
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      properties: {},
      geometry: feature.geometry,
    })),
  });
  if (!merged?.geometry) throw new Error(`Unable to merge official source zones for ${label}`);
  const errors = validateGeometry(merged.geometry, label);
  if (errors.length) throw new Error(`${errors[0].path}: ${errors[0].message}`);
  return merged.geometry;
}

function getCurationProperties(descriptor, options) {
  const operation = descriptor.curationOperation;
  if (!operation) return {};
  return {
    curationOperationId: operation.id,
    curationRevision: options.curation.revision,
    curationEvidenceRefs: [...operation.evidenceRefs],
    curationRationale: operation.rationale,
    semanticLabelReviewed: true,
    semanticLabelAccepted: operation.type === "accept",
    semanticResolution: operation.type,
  };
}

function createGroupedFeature(features, descriptor, options, colorIndex) {
  if (features.length === 1 && (
    descriptor.curationOperation
    || !descriptor.groupingRule
    || descriptor.groupingRule === "shared-exact-official-label"
  )) {
    const sourceFeature = features[0];
    return {
      ...sourceFeature,
      properties: {
        ...sourceFeature.properties,
        label: descriptor.label,
        colorIndex,
        ...getCurationProperties(descriptor, options),
      },
    };
  }

  const geometry = mergeGeometry(features, descriptor.label);
  const bbox = computeBbox(geometry);
  const labelPoint = findRepresentativePoint(geometry);
  if (!bbox || !labelPoint || !pointInGeometryInterior(labelPoint, geometry)) {
    throw new Error(`Unable to compute an interior label point for grouped zone ${descriptor.label}`);
  }
  const sourceZoneIds = features.map(getSourceZoneId).sort((left, right) => left.localeCompare(right));
  const first = features[0].properties ?? {};
  const zoneId = descriptor.curationOperation?.outputId
    ?? `${options.cityId}_${options.communeCode}_group_${slugify(descriptor.label)}`;
  const parentZoneIds = new Set(features.map((feature) => String(feature.properties?.parentZoneId ?? "")));
  const parentCodes = new Set(features.map((feature) => String(feature.properties?.parentCode ?? "")));
  const parentLabels = new Set(features.map((feature) => String(feature.properties?.parentLabel ?? "")));
  if (parentZoneIds.size !== 1 || parentCodes.size !== 1 || parentLabels.size !== 1) {
    throw new Error(`Grouped zone ${descriptor.label} crosses an official parent boundary`);
  }

  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label: descriptor.label,
      districtCode: `group:${sourceZoneIds.join("+")}`,
      arrondissementCode: String(first.arrondissementCode ?? first.parentCode ?? options.communeCode),
      colorIndex,
      parentZoneId: String(first.parentZoneId),
      parentCode: String(first.parentCode),
      parentLabel: String(first.parentLabel),
      territoryType: "quartier",
      source: `${String(first.source ?? options.source)} / regroupement déterministe par nom officiel`,
      sourceYear: String(first.sourceYear ?? options.sourceYear),
      officialId: `iris-group:${sourceZoneIds.join("+")}`,
      communeCode: String(first.communeCode ?? options.communeCode),
      communeName: String(first.communeName ?? options.communeName ?? ""),
      officialAreaM2: geometryAreaSquareMeters(geometry),
      labelLng: labelPoint[0],
      labelLat: labelPoint[1],
      bbox,
      groupingRule: descriptor.groupingRule,
      sourceZoneCount: features.length,
      sourceIrisIds: sourceZoneIds,
      sourceIrisLabels: features.map((feature) => String(feature.properties?.label ?? "")).sort((left, right) => left.localeCompare(right)),
      ...getCurationProperties(descriptor, options),
    },
    geometry,
  };
}

export function groupHumanNamedZones(collection, options) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error("groupHumanNamedZones expects a GeoJSON FeatureCollection");
  }
  const curationIndex = buildCurationIndex(collection, options);
  const groups = new Map();
  for (const feature of collection.features) {
    const descriptor = getGroupDescriptor(feature, options, curationIndex);
    const current = groups.get(descriptor.key);
    if (current) current.features.push(feature);
    else groups.set(descriptor.key, { descriptor, features: [feature] });
  }

  const groupedFeatures = [...groups.values()]
    .sort((left, right) => {
      const leftId = getSourceZoneId(left.features[0]);
      const rightId = getSourceZoneId(right.features[0]);
      return leftId.localeCompare(rightId);
    })
    .map((group, index) => createGroupedFeature(group.features, group.descriptor, options, index % 8));

  const labels = groupedFeatures.map((feature) => String(feature.properties.label));
  if (new Set(labels).size !== labels.length) {
    throw new Error(`${options.cityId} still contains duplicate human labels after grouping`);
  }
  const zoneIds = groupedFeatures.map((feature) => String(feature.properties.zoneId));
  if (new Set(zoneIds).size !== zoneIds.length) throw new Error(`${options.cityId} grouped zone IDs are not unique`);
  if (Number.isFinite(options.expectedFeatureCount) && groupedFeatures.length !== options.expectedFeatureCount) {
    throw new Error(`Expected ${options.expectedFeatureCount} human ${options.cityId} zones, received ${groupedFeatures.length}`);
  }

  const groupedZones = groupedFeatures.filter((feature) => Number(feature.properties.sourceZoneCount ?? 1) > 1);
  return {
    ...collection,
    metadata: {
      ...(collection.metadata ?? {}),
      sourceFeatureCount: collection.features.length,
      featureCount: groupedFeatures.length,
      humanLabelContract: "one visible plate per unique official human place name",
      groupingContract: options.curation
        ? "only exact source-ID groups approved by the resolved curation, or source zones sharing the same official name and parent, are merged"
        : "only source zones sharing the same official name and parent are merged",
      groupedZoneCount: groupedZones.length,
      groupedSourceFeatureCount: groupedZones.reduce((sum, feature) => sum + Number(feature.properties.sourceZoneCount), 0),
      ...(options.curation ? {
        curationStatus: options.curation.status,
        curationRevision: options.curation.revision,
        curationSources: options.curation.sources,
        sourceCorrections: curationIndex.operations.map((operation) => ({
          operationId: operation.id,
          type: operation.type,
          sourceIds: getOperationSourceIds(operation),
          expectedLabels: operation.type === "merge" ? operation.expectedLabels : [operation.expectedLabel],
          outputLabel: operation.label ?? operation.expectedLabel,
          evidenceRefs: operation.evidenceRefs,
          rationale: operation.rationale,
        })),
      } : {}),
    },
    features: groupedFeatures,
  };
}
