import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import ts from "typescript";

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const { findInteriorVisualCenter } = await importTypeScriptModule(
  "src/features/auth/musicSceneVisualCenter.ts",
);

function distanceToSegmentMeters(position, start, end) {
  const latitude = position[1] * Math.PI / 180;
  const longitudeScale = Math.cos(latitude);
  const project = ([lng, lat]) => [lng * longitudeScale * 111_320, lat * 111_320];
  const [px, py] = project(position);
  const [ax, ay] = project(start);
  const [bx, by] = project(end);
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function boundaryClearanceMeters(position, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return Math.min(...polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map(
    (start, index) => distanceToSegmentMeters(position, start, ring[(index + 1) % ring.length]),
  ))));
}

test("moves Bellecour-Antonin Gourju well away from its legacy label edge", async () => {
  const lyon = JSON.parse(await readFile("public/map/lyon-quartiers.geojson", "utf8"));
  const bellecour = lyon.features.find(
    (feature) => feature.properties?.label === "Bellecour-Antonin Gourju",
  );
  assert.ok(bellecour, "Bellecour-Antonin Gourju must remain in the Lyon fixture");

  const legacyLabel = [bellecour.properties.labelLng, bellecour.properties.labelLat];
  const visualCenter = findInteriorVisualCenter(bellecour.geometry, { precisionMeters: 0.25 });
  assert.ok(visualCenter);
  assert.equal(booleanPointInPolygon(point(visualCenter), bellecour, { ignoreBoundary: true }), true);

  const legacyClearance = boundaryClearanceMeters(legacyLabel, bellecour.geometry);
  const visualClearance = boundaryClearanceMeters(visualCenter, bellecour.geometry);
  assert.ok(
    visualClearance > legacyClearance * 1.8,
    `expected a clearly safer center (${visualClearance.toFixed(1)}m vs ${legacyClearance.toFixed(1)}m)`,
  );
});

test("uses the interior visual center for every polygon-backed auth scene", async () => {
  const selection = await readFile("src/features/auth/musicSceneSelection.ts", "utf8");
  assert.match(selection, /import \{ findInteriorVisualCenter \} from "\.\/musicSceneVisualCenter"/u);
  assert.match(selection, /const visualCenter = findInteriorVisualCenter\(polygonGeometry\);\s*if \(visualCenter\) return visualCenter;/u);
  assert.match(selection, /getFeatureCenter\(properties, feature\.geometry, bbox, city\.result\.center\)/u);
  assert.ok(
    selection.indexOf("findInteriorVisualCenter(polygonGeometry)") < selection.indexOf("properties.labelLng"),
    "the generated label point must remain a fallback, not the host anchor",
  );
});

test("never places the visual center inside a polygon hole", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
    ],
  };
  const hole = {
    type: "Polygon",
    coordinates: [geometry.coordinates[1]],
  };

  const visualCenter = findInteriorVisualCenter(geometry, { precisionMeters: 20 });
  assert.ok(visualCenter);
  assert.equal(booleanPointInPolygon(point(visualCenter), geometry, { ignoreBoundary: true }), true);
  assert.equal(booleanPointInPolygon(point(visualCenter), hole), false);
  assert.ok(boundaryClearanceMeters(visualCenter, geometry) > 110_000);
});

test("chooses the safest component of a MultiPolygon", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      [[[10, 0], [16, 0], [16, 4], [10, 4], [10, 0]]],
    ],
  };

  const visualCenter = findInteriorVisualCenter(geometry, { precisionMeters: 20 });
  assert.ok(visualCenter);
  assert.equal(booleanPointInPolygon(point(visualCenter), geometry, { ignoreBoundary: true }), true);
  assert.ok(visualCenter[0] > 10 && visualCenter[0] < 16);
  assert.ok(Math.abs(visualCenter[1] - 2) < 0.01);
});

test("returns null instead of a border point for a zero-area geometry", () => {
  assert.equal(findInteriorVisualCenter({
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]],
  }), null);
});
