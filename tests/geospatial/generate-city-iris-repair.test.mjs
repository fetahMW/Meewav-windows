import assert from "node:assert/strict";
import test from "node:test";
import { repairOfficialGeometry } from "../../scripts/geo/lib/generate-city-iris.mjs";
import { computeBbox, validateGeometry } from "../../scripts/geo/lib/geometry.mjs";

test("repairs an official self-intersection by boundary-preserving polygonal self-union", () => {
  const bowtie = {
    type: "Polygon",
    coordinates: [[[0, 0], [3, 2], [0, 3], [2, 0], [0, 0]]],
  };
  const repaired = repairOfficialGeometry(bowtie, "bowtie");
  assert.equal(repaired.method, "polygonal_self_union");
  assert.deepEqual(computeBbox(repaired.geometry), computeBbox(bowtie));
  assert.deepEqual(validateGeometry(repaired.geometry, "repaired"), []);
});

test("does not hide non-repairable official topology errors", () => {
  const openRing = {
    type: "Polygon",
    coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]],
  };
  assert.throws(
    () => repairOfficialGeometry(openRing, "open"),
    /Ring is not closed/u,
  );
});
