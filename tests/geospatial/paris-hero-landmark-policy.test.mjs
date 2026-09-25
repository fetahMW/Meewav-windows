import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const keptParisLayers = [
  "eiffel-tower-glb-landmark",
  "notre-dame-glb-landmark",
  "montparnasse-tower-glb-landmark",
];

const retiredParisModules = [
  "arcTriompheLayer.ts",
  "invalidesLayer.ts",
  "louvrePyramidLayer.ts",
  "obeliskLayer.ts",
  "palaisGarnierLayer.ts",
  "pantheonLayer.ts",
  "sacreCoeurLayer.ts",
];

const retiredParisAssets = [
  "009.glb",
  "010.glb",
  "011.glb",
  "arc_de_triomphe_violet_light.glb",
  "invalides_violet_light.glb",
  "obelisk_louxor_violet_light.glb",
  "palais_garnier_violet_light.glb",
  "pantheon_violet_light.glb",
  "pyramide_du_louvre_violet_light.glb",
  "sacre_coeur_violet_light.glb",
];

test("Paris keeps exactly Eiffel, Montparnasse and Notre-Dame GLB layers", () => {
  const registry = read("src/features/globe/maplibre/heroLandmarkRegistry.ts");
  const parisRegistry = registry.match(
    /export const PARIS_HERO_LANDMARK_LAYER_IDS = \[([\s\S]*?)\] as const;/,
  )?.[1] ?? "";
  const registeredLayers = [...parisRegistry.matchAll(/"([^"]+-glb-landmark)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(registeredLayers, keptParisLayers);
  assert.match(registry, /decode only the three Paris landmarks/);
  assert.match(registry, /PARIS_HERO_LANDMARK_LAYER_IDS\.includes/);
});

test("retired Paris modules and assets are physically removed", () => {
  for (const moduleName of retiredParisModules) {
    assert.equal(
      existsSync(resolve(root, "src/features/globe/maplibre", moduleName)),
      false,
      `${moduleName} must not remain importable`,
    );
  }
  for (const assetName of retiredParisAssets) {
    assert.equal(
      existsSync(resolve(root, "public/models/hero-landmarks", assetName)),
      false,
      `${assetName} must not remain downloadable`,
    );
  }
});

test("non-Paris landmarks stay isolated from the Paris overview", () => {
  const component = read("src/features/globe/components/GlobeMapV2.tsx");
  const registry = read("src/features/globe/maplibre/heroLandmarkRegistry.ts");

  assert.doesNotMatch(component, /ensure(?:ArcTriomphe|Invalides|LouvrePyramid|Obelisk|PalaisGarnier|Pantheon|SacreCoeur)Layer/);
  assert.match(component, /removeRetiredParisHeroLandmarkLayers\(map\)/);
  assert.match(registry, /"stade-de-france-glb-landmark"/);
  assert.match(registry, /"saint-claude-bonneville-glb-landmark"/);
  assert.match(registry, /Non-Paris landmarks remain available solely for their own city/);
});
