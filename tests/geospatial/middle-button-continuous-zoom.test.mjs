import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runs click-wheel zoom as one continuous camera gesture", async () => {
  const [componentSource, avatarLayerSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/map/avatarLayers.ts", "utf8"),
  ]);
  const functionStart = componentSource.indexOf("function installGoogleEarthMiddleLinearZoom");
  const functionEnd = componentSource.indexOf("function lerp", functionStart);
  const middleZoomSource = componentSource.slice(functionStart, functionEnd);
  const frameStart = middleZoomSource.indexOf("const frame =");
  const frameEnd = middleZoomSource.indexOf("const ensureFrame =", frameStart);
  const frameSource = middleZoomSource.slice(frameStart, frameEnd);

  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  assert.match(middleZoomSource, /transform\.setZoom\(zoom\)/);
  assert.match(middleZoomSource, /mapWithInternals\._update\(false\)/);
  assert.doesNotMatch(frameSource, /map\.jumpTo\(/);
  assert.doesNotMatch(frameSource, /applyCameraPitchLimit\(/);
  assert.match(middleZoomSource, /map\.fire\("movestart"[\s\S]{0,160}map\.fire\("zoomstart"/);
  assert.match(middleZoomSource, /map\.fire\("move"[\s\S]{0,160}map\.fire\("zoom"/);
  assert.match(middleZoomSource, /map\.fire\("zoomend"[\s\S]{0,160}map\.fire\("moveend"/);
  assert.match(middleZoomSource, /window\.addEventListener\("blur", handleWindowBlur\)/);

  assert.match(componentSource, /mapInstance\.isEasing\(\) \|\| isContinuousZoomingRef\.current/);
  assert.match(componentSource, /continuousZoomOwner: "wheel" \| "middle" \| "right" \| null/);
  assert.match(componentSource, /continuousZoomOwner !== "middle"/);
  assert.doesNotMatch(componentSource, /canHandleZoom:[\s\S]{0,360}continuousZoomOwner !== "wheel"/);
  assert.match(componentSource, /continuousZoomOwner = "right"/);
  assert.match(avatarLayerSource, /isWheelZoomingRef = isContinuousZoomingRef/);
});
