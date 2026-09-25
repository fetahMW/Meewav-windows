import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCityRuntimeManifest,
  renderCityRuntimeModule,
} from "../../scripts/geo/generate-city-runtime-manifest.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedModulePath = path.join(
  rootDirectory,
  "src/features/globe/geography/franceGuideAlphaCities.generated.ts",
);
const manifestPromise = buildCityRuntimeManifest(rootDirectory);

test("generated Guide Alpha city runtime manifest covers the complete catalog deterministically", async () => {
  const [manifest, catalog, checkedInSource] = await Promise.all([
    manifestPromise,
    readFile(path.join(rootDirectory, "geo/catalog/france-city-iris.json"), "utf8").then(JSON.parse),
    readFile(generatedModulePath, "utf8"),
  ]);

  assert.equal(manifest.cities.length, catalog.cities.length);
  assert.ok(manifest.cities.length >= 104, "the recovered 104-city baseline must remain covered");
  assert.equal(new Set(manifest.cities.map((city) => city.id)).size, manifest.cities.length);
  assert.equal(
    new Set(manifest.cities.map((city) => city.communeCode)).size,
    manifest.cities.length,
  );
  assert.equal(renderCityRuntimeModule(manifest), checkedInSource);
  assert.equal(
    renderCityRuntimeModule(await buildCityRuntimeManifest(rootDirectory)),
    checkedInSource,
  );
});

test("Orleans camera uses median labels and a guarded central extent", async () => {
  const manifest = await manifestPromise;
  const orleans = manifest.cities.find((city) => city.id === "orleans");

  assert.ok(orleans);
  assert.deepEqual(orleans.center, [1.910074, 47.900662]);
  assert.deepEqual(orleans.bbox, [1.875747, 47.813298, 1.948643, 47.933537]);
  assert.equal(orleans.zoom, 13);
  assert.equal(orleans.subdivisionCount, 45);
  assert.ok(orleans.cameraExtent[0] >= orleans.bbox[0]);
  assert.ok(orleans.cameraExtent[2] <= orleans.bbox[2]);
  assert.ok(orleans.cameraExtent[1] >= orleans.bbox[1]);
  assert.ok(orleans.cameraExtent[3] <= orleans.bbox[3]);
  assert.ok(
    orleans.cameraExtent[2] - orleans.cameraExtent[0]
      < orleans.bbox[2] - orleans.bbox[0],
  );
  assert.ok(
    orleans.cameraExtent[3] - orleans.cameraExtent[1]
      < orleans.bbox[3] - orleans.bbox[1],
  );
});

test("commune registry chooses one O(1) subdivision owner while preserving alternatives", async () => {
  const manifest = await manifestPromise;
  const byCode = new Map(
    manifest.subdivisionRegistry.map((entry) => [entry.communeCode, entry]),
  );

  assert.equal(byCode.size, manifest.subdivisionRegistry.length);

  const aspremont = byCode.get("06006");
  assert.equal(aspremont?.owner, "metropolitan");
  assert.equal(aspremont?.ownerId, "nice");
  assert.equal(aspremont?.subdivisionCount, 1);
  assert.equal(aspremont?.searchFeatureId, "city-aspremont");

  const saintDenis = byCode.get("93066");
  assert.equal(saintDenis?.owner, "grand_paris");
  assert.equal(saintDenis?.ownerId, "grand_paris");
  assert.equal(saintDenis?.subdivisionCount, 10);

  // Standalone Guide Alpha products intentionally override their metropolitan
  // fallback so a search and a metropolitan click resolve to the same plaques.
  const cagnes = byCode.get("06027");
  assert.equal(cagnes?.owner, "standalone");
  assert.equal(cagnes?.ownerId, "cagnes_sur_mer");
  assert.ok(cagnes?.availableOwners.some(({ ownerId }) => ownerId === "nice"));

  const istres = byCode.get("13047");
  assert.equal(istres?.owner, "standalone");
  assert.equal(istres?.ownerId, "istres");
  assert.ok(istres?.availableOwners.some(({ ownerId }) => ownerId === "marseille"));
});
