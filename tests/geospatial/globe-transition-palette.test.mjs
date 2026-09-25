import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("water keeps one permanent dark color across globe, country and local views", async () => {
  const [paletteSource, componentSource, styleSource] = await Promise.all([
    readFile("src/features/globe/maplibre/crepusculeUrbainPalette.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/maplibre/meewavMapLibreStyle.ts", "utf8"),
  ]);

  assert.match(paletteSource, /PERMANENT_WATER_COLOR\s*=\s*"#0B0330"/);
  assert.match(paletteSource, /main:\s*PERMANENT_WATER_COLOR/);
  assert.match(paletteSource, /water:\s*PERMANENT_WATER_COLOR/);
  assert.doesNotMatch(paletteSource, /#531BFF/);
  assert.match(componentSource, /WATER_LAYER_ID,\s*"fill-color",\s*WATER_COLORS\.main/);
  assert.match(componentSource, /WATER_LAYER_ID,\s*"fill-color",\s*GLOBE_PRESENTATION_WATER_COLOR/);
  assert.match(styleSource, /id:\s*"water"[\s\S]{0,500}"fill-color":\s*GLOBE_PRESENTATION_COLORS\.water/);
});

test("globe mode suppresses polar coastline outline artifacts", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const artifactLayerList = componentSource.match(
    /const GLOBE_WATER_ARTIFACT_LAYER_IDS = \[[\s\S]+?\];/,
  )?.[0] ?? "";

  assert.match(artifactLayerList, /"meewav-globe-coast-contact-shadow"/);
  assert.match(artifactLayerList, /"meewav-globe-coast-cold-rim"/);
  assert.match(
    componentSource,
    /setGlobeCountryReferenceVisibility[\s\S]{0,500}setGlobeWaterArtifactLayersVisible\(map, !visible\)/,
  );
});

test("founder orbit fits the rendered globe disc before using analytical fallbacks", async () => {
  const orbitSource = await readFile("src/features/globe/components/MeewavFounderOrbit.tsx", "utf8");
  const resolverStart = orbitSource.indexOf("function estimateGlobeGeometry");
  const resolverEnd = orbitSource.indexOf("function getProjectedGlobeCenter", resolverStart);
  const geometryResolver = orbitSource.slice(resolverStart, resolverEnd);

  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);
  assert.match(geometryResolver, /estimateSurfaceDiscGeometry\(map, width, height, center\)/);
  assert.match(geometryResolver, /getProjectedTransformGlobeRadius\(map, height\)/);
  assert.ok(
    geometryResolver.indexOf("estimateSurfaceDiscGeometry")
      < geometryResolver.indexOf("getProjectedTransformGlobeRadius"),
    "the visible MapLibre disc must win over the oversized analytical radius",
  );
  assert.match(orbitSource, /modelViewProjectionMatrix/);
  assert.match(orbitSource, /const clipX = safeNumber\(matrix\[12\]/);
  assert.match(orbitSource, /const clipY = safeNumber\(matrix\[13\]/);
});

test("regional luminous city hubs disappear before an urban fly starts", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");

  assert.match(componentSource, /onBeforeFly: \(target\) => \{[\s\S]{0,900}target\.zoom >= FRANCE_URBAN_AREA_LAYER_MAX_ZOOM/);
  assert.match(componentSource, /target\.zoom >= FRANCE_URBAN_AREA_LAYER_MAX_ZOOM[\s\S]{0,300}FRANCE_URBAN_AREA_LAYER_IDS/);
  assert.match(componentSource, /FRANCE_URBAN_AREA_LAYER_IDS[\s\S]{0,180}setLayerVisibilityIfPresent\(map, layerId, false\)/);
  assert.match(componentSource, /applyPostLandingMode: \(\) => \{[\s\S]{0,900}applyFranceRegionFocus/);
});

test("globe and country share one France presentation and manual dezoom only reveals the shell in place", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/maplibre/meewavMapLibreStyle.ts", "utf8"),
  ]);

  assert.match(componentSource, /function applyGlobeCountryPresentationLight/);
  assert.match(componentSource, /function applyCountryWorldPresentation[\s\S]{0,500}applyGlobeCountryPresentationLight\(map\)/);
  assert.match(componentSource, /function applyGlobeWorldPresentation[\s\S]{0,900}applyGlobeCountryPresentationLight\(map\)/);
  assert.match(styleSource, /"fill-opacity": \["interpolate", \["linear"\], \["zoom"\], 4, 0\.93, 5\.8, 0\.93/);
  assert.doesNotMatch(componentSource, /maybeExitToGlobe/);
  assert.doesNotMatch(componentSource, /goToGlobeOverview\(\);/);
  assert.match(componentSource, /LOCAL_TO_GLOBE_SHELL_REVEAL_ZOOM\s*=\s*4\.35/);
  const passiveShellHandoff = componentSource.match(
    /const revealGlobeShellInPlace = \(\) => \{[\s\S]+?\n\s*};\n\n\s*const scheduleGlobeShellReveal/,
  )?.[0] ?? "";
  assert.match(passiveShellHandoff, /activeMapViewRef\.current = "globe"/);
  assert.match(passiveShellHandoff, /setActiveMapView\("globe"\)/);
  assert.match(passiveShellHandoff, /revealGlobeBrandLogoNow\(\)/);
  assert.doesNotMatch(passiveShellHandoff, /flyTo|easeTo|jumpTo|goToGlobeOverview/);
  assert.match(componentSource, /onGlobe=\{goToGlobeOverview\}/);
});
