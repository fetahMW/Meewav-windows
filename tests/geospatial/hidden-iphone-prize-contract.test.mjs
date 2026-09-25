import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const layerSource = readFileSync(
  "src/features/globe/maplibre/hiddenFranceGiftLayer.ts",
  "utf8",
);
const componentSource = readFileSync(
  "src/features/globe/components/HiddenFranceIphonePrize.tsx",
  "utf8",
);
const globeSource = readFileSync(
  "src/features/globe/components/GlobeMapV2.tsx",
  "utf8",
);

test("the optimized iPhone model is shipped and configured as an isolated hidden reward", () => {
  const assetPath = "public/models/hidden-rewards/iphone_16_optimized.glb";
  assert.equal(existsSync(assetPath), true);
  assert.ok(statSync(assetPath).size > 100_000);
  assert.match(layerSource, /lngLat:\s*\[6\.35775,\s*44\.92162\]/u);
  assert.match(layerSource, /heightMeters:\s*0\.42/u);
  assert.match(layerSource, /closeCameraMaxZoom:\s*24/u);
  assert.match(layerSource, /hitRadiusPx:\s*28/u);
  assert.match(layerSource, /"circle-opacity":\s*0/u);
  assert.match(layerSource, /"circle-stroke-width":\s*0/u);
});

test("shtata000 is wired before ordinary Globe search and mounts the iPhone prize", () => {
  assert.match(componentSource, /HIDDEN_IPHONE_SECRET_SEARCH_COMMAND\s*=\s*"SHTATA000"/u);
  assert.match(globeSource, /if \(isHiddenFranceIphoneSearchCommand\(trimmedSearch\)\)[\s\S]{0,700}requestHiddenFranceIphoneSecretFocus\(\)/u);
  assert.match(globeSource, /<HiddenFranceIphonePrize map=\{mapInstance\} \/>/u);
});

test("clicking the prize announces the exact iPhone 16 win", () => {
  assert.match(
    componentSource,
    /Félicitations, vous venez de gagner l’iPhone 16\./u,
  );
  assert.match(componentSource, /controller\.setInteractive\(false\)[\s\S]{0,100}controller\.celebrate\(\)/u);
  assert.match(componentSource, /controllerRef\.current\?\.dismiss\(\)/u);
});
