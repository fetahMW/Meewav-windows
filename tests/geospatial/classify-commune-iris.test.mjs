import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMMUNE_IRIS_CLASSIFICATION_REASONS,
  COMMUNE_IRIS_MODES,
  classifyCommuneIrisInventory,
} from "../../scripts/geo/lib/classify-commune-iris.mjs";

const iris = (code, type = "H") => ({
  type: "Feature",
  properties: {
    code_iris: code,
    type_iris: type,
  },
});

test("multiple distinct official IRIS always produce a split commune", () => {
  const result = classifyCommuneIrisInventory([
    iris("123450101"),
    iris("123450102"),
  ]);

  assert.deepEqual(result, {
    mode: COMMUNE_IRIS_MODES.SPLIT,
    reason: COMMUNE_IRIS_CLASSIFICATION_REASONS.MULTIPLE_OFFICIAL_IRIS,
    eligibleForSplitCityWave: true,
    sourceFeatureCount: 2,
    distinctIrisCount: 2,
  });
});

test("a mixed whole-commune marker and split IRIS inventory requires resolution", () => {
  const mixedType = classifyCommuneIrisInventory([
    iris("123450101"),
    iris("123450102", "Z"),
  ]);
  const mixedCode = classifyCommuneIrisInventory([
    iris("123450000"),
    iris("123450101"),
  ]);

  for (const result of [mixedType, mixedCode]) {
    assert.equal(result.mode, COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED);
    assert.equal(result.eligibleForSplitCityWave, false);
    assert.equal(
      result.reason,
      COMMUNE_IRIS_CLASSIFICATION_REASONS.MIXED_WHOLE_COMMUNE_AND_SPLIT_IRIS,
    );
  }
});

test("one official type Z IRIS produces one commune plate", () => {
  const result = classifyCommuneIrisInventory([iris("123450101", "z")]);

  assert.equal(result.mode, COMMUNE_IRIS_MODES.SINGLE_PLATE);
  assert.equal(result.eligibleForSplitCityWave, false);
  assert.equal(result.reason, COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_TYPE_Z);
});

test("one official IRIS whose code ends in 0000 produces one commune plate", () => {
  const result = classifyCommuneIrisInventory([iris("123450000", "H")]);

  assert.equal(result.mode, COMMUNE_IRIS_MODES.SINGLE_PLATE);
  assert.equal(result.reason, COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_CODE_0000);
});

test("the two whole-commune markers are both recorded when present", () => {
  const result = classifyCommuneIrisInventory([iris("123450000", "Z")]);

  assert.equal(result.mode, COMMUNE_IRIS_MODES.SINGLE_PLATE);
  assert.equal(
    result.reason,
    COMMUNE_IRIS_CLASSIFICATION_REASONS.SINGLE_IRIS_TYPE_Z_AND_CODE_0000,
  );
});

test("one non-Z, non-0000 IRIS stays in explicit resolution", () => {
  const result = classifyCommuneIrisInventory([iris("123450101", "H")]);

  assert.equal(result.mode, COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED);
  assert.equal(result.eligibleForSplitCityWave, false);
  assert.equal(result.reason, COMMUNE_IRIS_CLASSIFICATION_REASONS.AMBIGUOUS_SINGLE_IRIS);
});

test("an empty or invalid official inventory never fabricates a plate", () => {
  const empty = classifyCommuneIrisInventory([]);
  const missingCode = classifyCommuneIrisInventory([iris("", "Z")]);
  const duplicateCode = classifyCommuneIrisInventory([
    iris("123450101"),
    iris("123450101"),
  ]);

  assert.equal(empty.mode, COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED);
  assert.equal(empty.reason, COMMUNE_IRIS_CLASSIFICATION_REASONS.MISSING_IRIS_INVENTORY);
  assert.equal(missingCode.mode, COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED);
  assert.equal(
    missingCode.reason,
    COMMUNE_IRIS_CLASSIFICATION_REASONS.INVALID_IRIS_MISSING_CODE,
  );
  assert.equal(duplicateCode.mode, COMMUNE_IRIS_MODES.RESOLUTION_REQUIRED);
  assert.equal(
    duplicateCode.reason,
    COMMUNE_IRIS_CLASSIFICATION_REASONS.INVALID_IRIS_DUPLICATE_CODE,
  );
});

test("normalized planner inventory entries are accepted by the shared classifier", () => {
  const result = classifyCommuneIrisInventory([{ id: "987650000", type: "Z" }]);

  assert.equal(result.mode, COMMUNE_IRIS_MODES.SINGLE_PLATE);
  assert.equal(result.distinctIrisCount, 1);
});

test("the classifier rejects a non-array inventory", () => {
  assert.throws(
    () => classifyCommuneIrisInventory(null),
    /IRIS inventory must be an array/,
  );
});

test("the wave planner fills its quota with multi-IRIS cities and defers mono-plates", async () => {
  const plannerSource = await readFile("scripts/plan-france-city-wave.mjs", "utf8");

  assert.match(plannerSource, /const candidatePool = searchIndex\.results/);
  assert.match(plannerSource, /classification\.eligibleForSplitCityWave/);
  assert.match(plannerSource, /selectedCandidates\.push\(candidate\)/);
  assert.match(plannerSource, /deferredCandidates\.push\(/);
  assert.match(plannerSource, /selectedCandidates\.length < limit/);
  assert.doesNotMatch(
    plannerSource,
    /\.sort\(compareCandidates\)\s*\.slice\(0, limit\)/,
    "classification must happen before the 100-city quota is closed",
  );
});
