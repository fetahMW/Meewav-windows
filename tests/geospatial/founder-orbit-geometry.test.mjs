import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrbitAnnulusArcPath,
  buildOutsideCircleClipPath,
  collectOrbitDiscBoundaryPoints,
  fitOrbitCircleToBoundaryPoints,
} from "../../src/features/globe/components/founderOrbitGeometry.ts";

function createDiscTester(cx, cy, radius) {
  return (x, y) => Math.hypot(x - cx, y - cy) <= radius;
}

function assertFittedCircle(actual, expected, tolerance = 0.3) {
  assert.ok(actual, "the visible silhouette should produce a circle");
  assert.ok(Math.abs(actual.cx - expected.cx) <= tolerance, `cx ${actual.cx}`);
  assert.ok(Math.abs(actual.cy - expected.cy) <= tolerance, `cy ${actual.cy}`);
  assert.ok(Math.abs(actual.radius - expected.radius) <= tolerance, `radius ${actual.radius}`);
  assert.ok(actual.residual < 0.1, `residual ${actual.residual}`);
}

test("founder orbit fits a fully visible globe silhouette", () => {
  const expected = { cx: 640, cy: 390, radius: 310 };
  const points = collectOrbitDiscBoundaryPoints(
    createDiscTester(expected.cx, expected.cy, expected.radius),
    1280,
    800,
  );
  assertFittedCircle(fitOrbitCircleToBoundaryPoints(points), expected);
});

test("founder orbit remains anchored when the pitched globe centre is below the viewport", () => {
  const expected = { cx: 1024, cy: 920, radius: 900 };
  const points = collectOrbitDiscBoundaryPoints(
    createDiscTester(expected.cx, expected.cy, expected.radius),
    2048,
    720,
  );
  assert.ok(points.length >= 12, "the partial upper arc must be sampled");
  assertFittedCircle(fitOrbitCircleToBoundaryPoints(points), expected, 0.6);
});

test("founder orbit remains anchored when rotation pushes the globe off-centre", () => {
  const expected = { cx: 1510, cy: 610, radius: 720 };
  const points = collectOrbitDiscBoundaryPoints(
    createDiscTester(expected.cx, expected.cy, expected.radius),
    1920,
    900,
  );
  assertFittedCircle(fitOrbitCircleToBoundaryPoints(points), expected, 0.6);
});

test("founder orbit limits pointer capture to the visible elliptical annulus", () => {
  const geometry = {
    cx: 100,
    cy: 100,
    innerRx: 80,
    innerRy: 20,
    outerRx: 120,
    outerRy: 30,
  };

  assert.equal(
    buildOrbitAnnulusArcPath({
      ...geometry,
      startAngleDeg: 0,
      endAngleDeg: 180,
    }),
    "M 220 100 A 120 30 0 0 1 -20 100 L 20 100 A 80 20 0 0 0 180 100 Z",
  );
  assert.equal(
    buildOrbitAnnulusArcPath({
      ...geometry,
      startAngleDeg: 180,
      endAngleDeg: 360,
    }),
    "M -20 100 A 120 30 0 0 1 220 100 L 180 100 A 80 20 0 0 0 20 100 Z",
  );
  assert.equal(
    buildOutsideCircleClipPath(300, 200, 100, 100, 50),
    "M 0 0 H 300 V 200 H 0 Z M 50 100 A 50 50 0 1 0 150 100 A 50 50 0 1 0 50 100 Z",
  );
});
