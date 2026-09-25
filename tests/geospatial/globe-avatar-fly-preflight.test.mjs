import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPath = "src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts";
const typesPath = "src/features/globe/selectedExtrusion/selectedZoneExtrusionTypes.ts";
const globePath = "src/features/globe/components/GlobeMapV2.tsx";
const avatarLayersPath = "src/map/avatarLayers.ts";

test("destination avatars are prepared synchronously without changing the fly camera", async () => {
  const [controller, types, globe] = await Promise.all([
    readFile(controllerPath, "utf8"),
    readFile(typesPath, "utf8"),
    readFile(globePath, "utf8"),
  ]);

  assert.match(types, /SELECTED_ZONE_AVATAR_PREFLIGHT_EVENT\s*=\s*"meewav:selected-zone-avatar-preflight"/u);

  const flyStart = controller.indexOf("private async flyToZone(");
  const flyEnd = controller.indexOf("private async", flyStart + 1);
  const flyBlock = controller.slice(flyStart, flyEnd < 0 ? undefined : flyEnd);
  const stopIndex = flyBlock.indexOf("this.map.stop()");
  const preflightIndex = flyBlock.indexOf("SELECTED_ZONE_AVATAR_PREFLIGHT_EVENT");
  const flyToIndex = flyBlock.indexOf("this.map.flyTo({");

  assert.ok(stopIndex >= 0, "the previous camera motion must be stopped first");
  assert.ok(preflightIndex > stopIndex, "preflight must run after stop so an old moveend cannot undo it");
  assert.ok(flyToIndex > preflightIndex, "the destination filter must be installed before flyTo starts");

  const handlerStart = globe.indexOf("const preflightDestinationAvatars = (rawEvent: Event) => {");
  const handlerEnd = globe.indexOf("window.addEventListener(", handlerStart);
  const handler = globe.slice(handlerStart, handlerEnd);
  assert.match(handler, /setExactFilterIfChanged\([\s\S]*?PROFILE_ICON_RENDER_LAYER_IDS\[0\]/u);
  assert.match(handler, /setExactFilterIfChanged\([\s\S]*?PROFILE_ICON_HIT_LAYER_ID/u);
  assert.match(handler, /setExactFilterIfChanged\([\s\S]*?AVATAR_VISIBLE_LABELS_LAYER_ID/u);
  assert.match(handler, /getOnboardingFlyHiddenProfileClause\(\)/u);
  assert.doesNotMatch(
    handler,
    /moveLayer|moveAvatarLayersToTop|triggerRepaint|requestAnimationFrame|setTimeout/u,
    "preflight must keep the three interactive layers aligned without scheduling GPU work",
  );
});

test("MVT landing refresh avoids dead layer writes and duplicate aura cycles", async () => {
  const [globe, avatarLayers] = await Promise.all([
    readFile(globePath, "utf8"),
    readFile(avatarLayersPath, "utf8"),
  ]);

  const stableStart = globe.indexOf("function scheduleStableAvatarSelection(");
  const stableEnd = globe.indexOf("function ", stableStart + 16);
  const stableBlock = globe.slice(stableStart, stableEnd);
  assert.match(stableBlock, /if \(isMvtAvatarSourceActive\(\)\) \{[\s\S]*?return;/u);
  assert.doesNotMatch(
    stableBlock.match(/if \(isMvtAvatarSourceActive\(\)\) \{[\s\S]*?\n\s*\}/u)?.[0] ?? "",
    /showAllGeoJsonAvatarPoints/u,
  );
  assert.match(
    globe,
    /function isMvtAvatarSourceActive\(\): boolean \{\s*return shouldUseVectorTileServer\(\);\s*\}/u,
  );
  assert.match(
    globe,
    /avatarSourceMode === "env" && shouldUseVectorTileServer\(\)/u,
    "the production env mode must use the effective vector-tile pipeline",
  );

  const hideListStart = globe.indexOf("for (const otherLayerId of [", globe.indexOf("function showAllGeoJsonAvatarPoints("));
  const hideListEnd = globe.indexOf("]) {", hideListStart);
  const hideList = globe.slice(hideListStart, hideListEnd);
  assert.doesNotMatch(hideList, /meewav-avatar-current-user-aura/u);

  const refreshStart = avatarLayers.indexOf("export function refreshAvatarTilesAfterViewSwitch(");
  const refreshEnd = avatarLayers.indexOf("function ", refreshStart + 16);
  const refreshBlock = avatarLayers.slice(refreshStart, refreshEnd);
  assert.match(refreshBlock, /getLayoutProperty\(layerId, "visibility"\) !== "visible"/u);
  assert.doesNotMatch(refreshBlock, /triggerRepaint/u);
});

test("pinned avatar source survives transient layer repair failures", async () => {
  const globe = await readFile(globePath, "utf8");
  const syncStart = globe.indexOf("function syncProfilePinRepereLayers(");
  const syncEnd = globe.indexOf("function ", syncStart + 16);
  const syncBlock = globe.slice(syncStart, syncEnd);

  const firstDataWrite = syncBlock.indexOf("setProfilePinRepereSourceData(map, pins)");
  const ensureLayers = syncBlock.indexOf("ensureProfilePinRepereLayers(map)");
  const secondDataWrite = syncBlock.indexOf("setProfilePinRepereSourceData(map, pins)", firstDataWrite + 1);
  assert.ok(firstDataWrite >= 0 && firstDataWrite < ensureLayers);
  assert.ok(secondDataWrite > ensureLayers);
  assert.match(globe, /mapInstance\.on\("idle", syncPinnedReperesAfterMapSettles\)/u);
  assert.match(globe, /mapInstance\.on\("moveend", syncPinnedReperesAfterMapSettles\)/u);
  assert.match(globe, /setLayoutPropertyIfChanged\(map, layerId, "visibility", "visible"\)/u);
  assert.match(
    globe,
    /effectiveFilter == null && currentFilter == null/u,
    "an absent MapLibre filter must not be rewritten on every idle event",
  );
});
