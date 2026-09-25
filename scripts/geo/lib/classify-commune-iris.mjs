export const COMMUNE_IRIS_MODES = Object.freeze({
  SPLIT: "standalone_split",
  SINGLE_PLATE: "single_plate",
  RESOLUTION_REQUIRED: "resolution_required",
});

export const COMMUNE_IRIS_CLASSIFICATION_REASONS = Object.freeze({
  MULTIPLE_OFFICIAL_IRIS: "multiple_official_iris",
  SINGLE_IRIS_TYPE_Z: "single_iris_type_z",
  SINGLE_IRIS_CODE_0000: "single_iris_code_0000",
  SINGLE_IRIS_TYPE_Z_AND_CODE_0000: "single_iris_type_z_and_code_0000",
  AMBIGUOUS_SINGLE_IRIS: "single_iris_without_type_z_or_code_0000",
  MISSING_IRIS_INVENTORY: "missing_iris_inventory",
  INVALID_IRIS_MISSING_CODE: "invalid_iris_inventory_missing_code",
  INVALID_IRIS_DUPLICATE_CODE: "invalid_iris_inventory_duplicate_code",
  MIXED_WHOLE_COMMUNE_AND_SPLIT_IRIS: "mixed_whole_commune_and_split_iris",
});

function readIrisProperty(feature, sourceProperty, normalizedProperty) {
  return feature?.properties?.[sourceProperty]
    ?? feature?.[sourceProperty]
    ?? feature?.[normalizedProperty]
    ?? "";
}

function normalizeIris(feature) {
  return {
    code: String(readIrisProperty(feature, "code_iris", "id")).trim(),
    type: String(readIrisProperty(feature, "type_iris", "type")).trim().toUpperCase(),
  };
}

function createClassification(mode, reason, inventory, extra = {}) {
  return Object.freeze({
    mode,
    reason,
    eligibleForSplitCityWave: mode === COMMUNE_IRIS_MODES.SPLIT,
    sourceFeatureCount: inventory.length,
    distinctIrisCount: new Set(inventory.map(({ code }) => code).filter(Boolean)).size,
    ...extra,
  });
}

/**
 * Classifies a commune from its official INSEE IRIS inventory only.
 * Population, area and projected capacity are deliberately excluded.
 */
export function classifyCommuneIrisInventory(features) {
  if (!Array.isArray(features)) {
    throw new TypeError("IRIS inventory must be an array");
  }

  const inventory = features.map(normalizeIris);
  if (inventory.length === 0) {
    return createClassification(
      COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.MISSING_IRIS_INVENTORY,
      inventory,
    );
  }

  if (inventory.some(({ code }) => !code)) {
    return createClassification(
      COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.INVALID_IRIS_MISSING_CODE,
      inventory,
    );
  }

  const distinctCodes = new Set(inventory.map(({ code }) => code));
  if (distinctCodes.size !== inventory.length) {
    return createClassification(
      COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.INVALID_IRIS_DUPLICATE_CODE,
      inventory,
    );
  }

  if (
    inventory.length >= 2
    && inventory.some(({ code, type }) => type === "Z" || code.endsWith("0000"))
  ) {
    return createClassification(
      COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.MIXED_WHOLE_COMMUNE_AND_SPLIT_IRIS,
      inventory,
    );
  }

  if (inventory.length >= 2) {
    return createClassification(
      COMMUNE_IRIS_MODES.SPLIT,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.MULTIPLE_OFFICIAL_IRIS,
      inventory,
    );
  }

  const [{ code, type }] = inventory;
  const hasTypeZ = type === "Z";
  const hasWholeCommuneCode = code.endsWith("0000");

  if (hasTypeZ && hasWholeCommuneCode) {
    return createClassification(
      COMMUNE_IRIS_MODES.SINGLE_PLATE,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_TYPE_Z_AND_CODE_0000,
      inventory,
    );
  }
  if (hasTypeZ) {
    return createClassification(
      COMMUNE_IRIS_MODES.SINGLE_PLATE,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_TYPE_Z,
      inventory,
    );
  }
  if (hasWholeCommuneCode) {
    return createClassification(
      COMMUNE_IRIS_MODES.SINGLE_PLATE,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_CODE_0000,
      inventory,
    );
  }

  return createClassification(
    COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED,
    COMMUNE_IRIS_CLASSIFICATION_REASONS.AMBIGUOUS_SINGLE_IRIS,
    inventory,
  );
}
