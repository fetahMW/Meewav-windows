import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBbox,
  findRepresentativePoint,
  pointInGeometry,
  pointInGeometryInterior,
  ringHasSelfIntersection,
  validateGeometry,
} from "../../scripts/geo/lib/geometry.mjs";

const square = {
  type: "Polygon",
  coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]],
};

test("computes bbox and an interior representative point", () => {
  assert.deepEqual(computeBbox(square), [2, 48, 3, 49]);
  const labelPoint = findRepresentativePoint(square);
  assert.deepEqual(labelPoint, [2.5, 48.5]);
  assert.equal(pointInGeometry(labelPoint, square), true);
  assert.equal(pointInGeometryInterior(labelPoint, square), true);
});

test("representative points never fall back to a concave polygon boundary", () => {
  const concaveMultiPolygon = {
    type: "MultiPolygon",
    coordinates: [[[
      [0, 0],
      [4, 0],
      [4, 4],
      [3, 4],
      [3, 1],
      [1, 1],
      [1, 4],
      [0, 4],
      [0, 0],
    ]]],
  };

  const formerBoundaryFallback = [2, 0];
  assert.equal(pointInGeometry(formerBoundaryFallback, concaveMultiPolygon), true);
  assert.equal(pointInGeometryInterior(formerBoundaryFallback, concaveMultiPolygon), false);

  const labelPoint = findRepresentativePoint(concaveMultiPolygon);
  assert.deepEqual(labelPoint, [0.5, 2]);
  assert.equal(pointInGeometryInterior(labelPoint, concaveMultiPolygon), true);
});

test("rejects open rings and self intersections", () => {
  const bowTie = [[2, 48], [3, 49], [3, 48], [2, 49], [2, 48]];
  assert.equal(ringHasSelfIntersection(bowTie), true);
  const issues = validateGeometry({ type: "Polygon", coordinates: [bowTie] });
  assert.equal(issues.some((entry) => entry.code === "geometry.ring.self_intersection"), true);

  const open = { type: "Polygon", coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49]]] };
  assert.equal(validateGeometry(open).some((entry) => entry.code === "geometry.ring.open"), true);
});

test("a point inside a hole is not inside the polygon", () => {
  const polygonWithHole = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]],
    ],
  };
  assert.equal(pointInGeometry([0.5, 0.5], polygonWithHole), true);
  assert.equal(pointInGeometry([2, 2], polygonWithHole), false);
});
