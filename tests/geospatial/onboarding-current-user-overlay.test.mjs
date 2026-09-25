import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const overlayPath = "src/features/globe/onboarding/onboardingCurrentUserOverlay.ts";
const visualContractPath = "src/map/avatarVisualContract.ts";
const avatarLayersPath = "src/map/avatarLayers.ts";
const globeMapPath = "src/features/globe/components/GlobeMapV2.tsx";
const canvasOverlayPath = "src/features/globe/hooks/useCanvasAvatarOverlay.tsx";
const selectedZoneControllerPath = "src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts";

test("authenticated host keeps the Paris zoom rule and renders at 2.5x", async () => {
  const [overlay, visualContract, avatarLayers, globeMap, canvasOverlay] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(visualContractPath, "utf8"),
    readFile(avatarLayersPath, "utf8"),
    readFile(globeMapPath, "utf8"),
    readFile(canvasOverlayPath, "utf8"),
  ]);

  assert.match(visualContract, /MVT_STANDARD_AVATAR_ICON_SIZE\s*=\s*0\.112/u);
  assert.match(visualContract, /HOST_AVATAR_SIZE_MULTIPLIER\s*=\s*2\.5/u);
  assert.match(visualContract, /AVATAR_VISIBLE_MIN_ZOOM\s*=\s*15/u);
  assert.match(avatarLayers, /CHARONNE_STRESS_AVATAR_ICON_SIZE\s*=\s*MVT_STANDARD_AVATAR_ICON_SIZE/u);
  assert.match(avatarLayers, /export \{ AVATAR_VISIBLE_MIN_ZOOM \} from "\.\/avatarVisualContract"/u);
  assert.match(
    globeMap,
    /MVT_AVATAR_STRESS_ICON_SIZE_EXPRESSION[\s\S]*?MVT_STANDARD_AVATAR_ICON_SIZE[\s\S]*?HOST_AVATAR_SIZE_MULTIPLIER/u,
  );
  assert.match(
    avatarLayers,
    /currentUserScaleExpression[\s\S]*?HOST_AVATAR_SIZE_MULTIPLIER[\s\S]*?normalSizeExpression/u,
  );
  assert.match(
    canvasOverlay,
    /currentScale\s*=\s*avatar\.isCurrentUser \? HOST_AVATAR_SIZE_MULTIPLIER : 1/u,
  );
  assert.match(overlay, /"icon-size":\s*MVT_STANDARD_AVATAR_ICON_SIZE \* HOST_AVATAR_SIZE_MULTIPLIER/u);
  assert.equal(
    overlay.match(/minzoom:\s*AVATAR_VISIBLE_MIN_ZOOM/gu)?.length,
    4,
    "host avatar, two ground rings and label must share the Paris zoom threshold",
  );
});

test("onboarding host remains fixed on the selected scene centre", async () => {
  const overlay = await readFile(overlayPath, "utf8");

  assert.match(overlay, /type:\s*"Point"\s+as const/u);
  assert.match(
    overlay,
    /return \[payload\.scene\.center\[0\], payload\.scene\.center\[1\]\]/u,
  );
  assert.match(overlay, /coordinates:\s*sceneCenter/u);
  assert.doesNotMatch(
    overlay,
    /features:\s*payload\.profile\.visible\s*\?/u,
    "the owner host must remain locally visible when public visibility is off",
  );
  assert.doesNotMatch(overlay, /getParisLandmarkSafeAvatarLngLat/u);
  assert.match(overlay, /"symbol-placement":\s*"point"/u);
  assert.match(overlay, /"icon-pitch-alignment":\s*"viewport"/u);
  assert.doesNotMatch(overlay, /map\.(?:on|once)\(|map\.project\(|new\s+(?:maplibregl\.)?Marker|setLngLat/u);
});

test("host base label hides while its enlarged profile overlay is open", async () => {
  const [overlay, globeMap] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(globeMapPath, "utf8"),
  ]);

  assert.match(overlay, /ONBOARDING_CURRENT_USER_SOURCE_ID/u);
  assert.match(
    overlay,
    /"text-opacity":\s*\[[\s\S]*?\["feature-state", AVATAR_PREPROFILE_LABEL_HIDDEN_STATE\][\s\S]*?0,[\s\S]*?1/u,
  );
  assert.match(
    globeMap,
    /map\.getSource\(ONBOARDING_CURRENT_USER_SOURCE_ID\)[\s\S]*?targets\.push\(\{ source: ONBOARDING_CURRENT_USER_SOURCE_ID, id: profileId \}\)/u,
  );
  assert.match(
    globeMap,
    /setOnboardingCurrentUserBaseVisibility\(activeMap, !next\?\.isCurrentUser\)/u,
  );
  assert.match(
    overlay,
    /const BASE_AVATAR_LAYER_IDS = \[[\s\S]*?ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID,[\s\S]*?LABEL_LAYER_ID,[\s\S]*?\] as const/u,
  );
  assert.match(overlay, /overlayVisibilityByMap\.get\(map\) !== true\) return/u);
  assert.doesNotMatch(
    overlay,
    /requestAnimationFrame|map\.(?:on|once)\("(?:move|zoom|rotate|pitch|render)/u,
  );
});

test("authenticated host follows the selected district visibility rule", async () => {
  const globeMap = await readFile(globeMapPath, "utf8");
  const syncStart = globeMap.indexOf("const syncOnboardingAvatar = (");
  const syncEnd = globeMap.indexOf("const syncWhenCanonicalAvatarTileArrives", syncStart);
  const syncBlock = globeMap.slice(syncStart, syncEnd);

  assert.match(syncBlock, /const selectedZoneId = getControllerSelectedExtrudedZone\(\)/u);
  assert.match(
    syncBlock,
    /if \(selectedZoneId !== payload\.scene\.zoneId\) \{[\s\S]*?hideOnboardingCurrentUserOverlay\(mapInstance\);[\s\S]*?return;/u,
  );
  assert.match(globeMap, /meewav:selected-zone-extrusion-change/u);
  assert.doesNotMatch(syncBlock, /map\.(?:project|unproject)\(/u);
});

test("pending onboarding arrival cannot render the destination avatar before moveend confirmation", async () => {
  const [overlay, globeMap, canvasOverlay] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(globeMapPath, "utf8"),
    readFile(canvasOverlayPath, "utf8"),
  ]);

  const startupSyncStart = globeMap.indexOf("const syncOnboardingAvatar = (");
  const startupSyncEnd = globeMap.indexOf("syncOnboardingAvatar();", startupSyncStart);
  const startupSync = globeMap.slice(startupSyncStart, startupSyncEnd);
  assert.match(startupSync, /peekPendingMusicSceneArrival\(\)/u);
  assert.match(startupSync, /hideOnboardingCurrentUserOverlay\(mapInstance\)/u);
  assert.ok(
    startupSync.indexOf("peekPendingMusicSceneArrival()")
      < startupSync.indexOf("syncOnboardingCurrentUserOverlay(mapInstance, payload"),
    "pending-arrival guard must run before the first overlay creation",
  );

  const refreshStart = globeMap.indexOf("const refreshOnboardingAvatar =");
  const refreshEnd = globeMap.indexOf("const completePendingArrivalWhenReady", refreshStart);
  const refresh = globeMap.slice(refreshStart, refreshEnd);
  assert.match(refresh, /if \(!cameraArrivalConfirmed\)/u);
  assert.match(refresh, /hideOnboardingCurrentUserOverlay\(mapInstance\)/u);
  assert.ok(
    refresh.indexOf("if (!cameraArrivalConfirmed)")
      < refresh.indexOf("syncOnboardingCurrentUserOverlay("),
    "idle/OAuth refreshes must remain gated until camera arrival",
  );

  assert.match(
    globeMap,
    /const confirmCameraArrival = \(\) => \{[\s\S]*?cameraArrivalConfirmed = true;[\s\S]*?setOnboardingFlyProfileHidden\(mapInstance, payload\.profile\.profileId, false\);[\s\S]*?refreshOnboardingAvatar\(\)/u,
  );
  assert.match(
    globeMap,
    /setOnboardingFlyProfileHidden\(mapInstance, pendingPayload\.profile\.profileId, true\);[\s\S]*?hideOnboardingCurrentUserOverlay\(mapInstance\)/u,
  );
  assert.match(globeMap, /ONBOARDING_FLY_CANONICAL_AVATAR_LAYER_IDS/u);
  assert.match(globeMap, /getOnboardingFlyHiddenProfileClause/u);
  assert.match(globeMap, /onboardingFlySuppressionNeedsRepair/u);
  assert.match(globeMap, /!filterContainsClause\(filter, hiddenClause\)/u);
  assert.match(globeMap, /\["get", "profile_id"\]/u);
  assert.match(globeMap, /setOnboardingFlyHiddenProfileId\(map, onboardingFlyHiddenProfileId\)/u);
  assert.match(overlay, /setLayoutProperty\(layerId, "visibility", "none"\)/u);
  assert.match(overlay, /setLayoutProperty\(layerId, "visibility", nextVisibility\)/u);
  assert.match(overlay, /ONBOARDING_FLY_HIDDEN_PROFILE_MAP_PROPERTY/u);
  assert.match(canvasOverlay, /getOnboardingFlyHiddenProfileId\(map\)/u);
  assert.match(canvasOverlay, /avatars\.filter\(\(avatar\) => avatar\.id !== onboardingHiddenProfileId\)/u);
  assert.match(canvasOverlay, /meewav:onboarding-avatar-visibility/u);

  const startupStart = globeMap.indexOf("const startAtHostPosition = () => {");
  const startupEnd = globeMap.indexOf("const beginStartupFly = () => {", startupStart);
  const startupBlock = globeMap.slice(startupStart, startupEnd);
  assert.match(startupBlock, /const pendingOnboardingArrival = peekPendingMusicSceneArrival\(\)/u);
  assert.match(startupBlock, /setOnboardingFlyProfileHidden\([\s\S]*?pendingOnboardingArrival\.profile\.profileId[\s\S]*?true/u);
  assert.ok(
    startupBlock.indexOf("setOnboardingFlyProfileHidden(") < startupBlock.indexOf("map.jumpTo({"),
    "the fresh profile must be suppressed before the first startup camera jump",
  );
});

test("onboarding and canonical current-user markers reuse the horizontal Paris ground repere", async () => {
  const [overlay, visualContract, avatarLayers, globeMap] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(visualContractPath, "utf8"),
    readFile(avatarLayersPath, "utf8"),
    readFile(globeMapPath, "utf8"),
  ]);

  assert.match(visualContract, /AVATAR_GROUND_REPERE_PITCH_ALIGNMENT\s*=\s*"map"/u);
  assert.match(visualContract, /AVATAR_GROUND_REPERE_PITCH_SCALE\s*=\s*"map"/u);
  assert.match(visualContract, /AVATAR_GROUND_REPERE_OUTER_RADIUS/u);
  assert.match(visualContract, /AVATAR_GROUND_REPERE_INNER_RADIUS/u);

  for (const source of [overlay, avatarLayers, globeMap]) {
    assert.match(source, /AVATAR_GROUND_REPERE_OUTER_RADIUS/u);
    assert.match(source, /AVATAR_GROUND_REPERE_INNER_RADIUS/u);
  }
  for (const source of [overlay, avatarLayers]) {
    assert.match(source, /AVATAR_GROUND_REPERE_PITCH_ALIGNMENT/u);
    assert.match(source, /AVATAR_GROUND_REPERE_PITCH_SCALE/u);
  }
  assert.doesNotMatch(
    overlay,
    /"circle-pitch-(?:alignment|scale)":\s*"viewport"/u,
  );
});

test("authenticated host overlay remains authoritative after the canonical MVT avatar arrives", async () => {
  const [overlay, globeMap] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(globeMapPath, "utf8"),
  ]);

  assert.match(
    overlay,
    /querySourceFeatures\(CANONICAL_AVATAR_SOURCE_ID,[\s\S]*?sourceLayer:\s*CANONICAL_AVATAR_SOURCE_LAYER/u,
  );
  assert.match(overlay, /filter:\s*\["==",\s*\["get",\s*"profile_id"\],\s*profileId\]/u);
  assert.match(overlay, /canonicalProfileIdsByMap/u);
  assert.match(
    overlay,
    /canonicalProfileAvailable\s*=\s*isOnboardingProfileAvailableInCanonicalAvatarSource\([\s\S]*?ensureOnboardingCurrentUserOverlay\(map, payload\)/u,
  );
  const syncStart = overlay.indexOf("export function syncOnboardingCurrentUserOverlay");
  const syncBlock = overlay.slice(syncStart);
  assert.doesNotMatch(syncBlock, /removeOnboardingCurrentUserOverlay\(map\)/u);
  assert.match(syncBlock, /canonicalProfileAvailable\s*\?\s*"canonical"/u);
  assert.match(globeMap, /buildCanonicalHostSuppressionClause/u);
  assert.match(globeMap, /CURRENT_HOST_FILTER_PROFILE_ID,[\s\S]*?authenticatedUserId/u);
  assert.match(globeMap, /event\.sourceId !== "meewav-avatars"/u);
  assert.match(globeMap, /mapInstance\.on\("sourcedata", syncWhenCanonicalAvatarTileArrives\)/u);
  assert.match(globeMap, /mapInstance\.off\("sourcedata", syncWhenCanonicalAvatarTileArrives\)/u);
  assert.match(globeMap, /MAX_CANONICAL_AVATAR_LOOKUPS\s*=\s*8/u);
  assert.match(globeMap, /canonicalLookupAttempts >= MAX_CANONICAL_AVATAR_LOOKUPS/u);
  assert.match(globeMap, /sourceSyncTimer = window\.setTimeout\([\s\S]*?240\)/u);
});

test("unchanged onboarding fallback does not mutate MapLibre or force another frame", async () => {
  const overlay = await readFile(overlayPath, "utf8");

  assert.match(overlay, /overlayPayloadSignatures\.get\(map\) !== payloadSignature/u);
  assert.match(overlay, /if \(mutated\) map\.triggerRepaint\(\)/u);
  assert.doesNotMatch(overlay, /existingSource\.setData\(data\);\s*\} else/u);
  assert.doesNotMatch(overlay, /\n\s*map\.triggerRepaint\(\);\s*\n\}/u);
});

test("host avatar click opens its profile without falling through to the district fly", async () => {
  const globeMap = await readFile(globeMapPath, "utf8");

  assert.match(
    globeMap,
    /handleProfileIconClickCapture[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?commitSelectedProfileIcon\(next\)/u,
  );
  assert.match(
    globeMap,
    /canvas\.addEventListener\("click", handleProfileIconClickCapture, \{ capture: true \}\)/u,
  );
  assert.match(
    globeMap,
    /canvas\.removeEventListener\("click", handleProfileIconClickCapture, \{ capture: true \}\)/u,
  );
});

test("selected district owns map clicks and Ma position explicitly restores the host", async () => {
  const globeMap = await readFile(globeMapPath, "utf8");

  assert.match(
    globeMap,
    /clickTargetsSelectableMusicZone[\s\S]*?queryRenderedFeatures\(point,[\s\S]*?SELECTED_ZONE_HITBOX_LAYER_ID/u,
    "district ownership must be resolved from the zone hitbox on the click itself",
  );
  assert.match(
    globeMap,
    /handleFranceUrbanAreaClick[\s\S]*?event\.originalEvent\?\.defaultPrevented[\s\S]*?clickTargetsSelectableMusicZone\(mapInstance, event\.point\)[\s\S]*?return;/u,
  );
  assert.match(
    globeMap,
    /handleNativePlaceClick[\s\S]*?event\.originalEvent\?\.defaultPrevented[\s\S]*?clickTargetsSelectableMusicZone\(mapInstance, event\.point\)[\s\S]*?return;/u,
  );
  assert.match(
    globeMap,
    /const goToHostPosition = \(\) => \{[\s\S]*?commitSelectedProfileIcon\(null\)/u,
  );
  assert.match(
    globeMap,
    /const showHostPositionMarker = \(\) => \{[\s\S]*?getControllerSelectedExtrudedZone\(\) !== payload\.scene\.zoneId[\s\S]*?setOnboardingCurrentUserBaseVisibility\(map, true\)[\s\S]*?ensureOnboardingCurrentUserOverlay\(map, payload\)/u,
  );
});

test("the latest fly command wins without blanking Paris subdivisions", async () => {
  const [globeMap, selectedZoneController] = await Promise.all([
    readFile(globeMapPath, "utf8"),
    readFile(selectedZoneControllerPath, "utf8"),
  ]);
  const hostNavigationBlock = globeMap.slice(
    globeMap.indexOf("const goToHostPosition"),
    globeMap.indexOf("const goToCityOverview"),
  );

  assert.match(
    globeMap,
    /!options\.restoreCitySubdivisions[\s\S]{0,220}clearCitySubdivisions/u,
    "the previous district collection must stay rendered until its atomic replacement is ready",
  );
  assert.match(
    globeMap,
    /const goToCityOverview[\s\S]{0,1800}navigationToken !== communeSubdivisionEntryTokenRef\.current[\s\S]{0,300}premiumFlyToPreset\(targetCity\)/u,
  );
  assert.match(
    hostNavigationBlock,
    /const isCurrentNavigation[\s\S]*?navigationToken === communeSubdivisionEntryTokenRef\.current/u,
  );
  assert.match(
    hostNavigationBlock,
    /selectControllerExtrudedZone\([\s\S]*?skipCameraMove: true/u,
  );
  assert.doesNotMatch(
    hostNavigationBlock,
    /setTimeout\([\s\S]*?450/u,
    "an interrupted Ma position fly must never restart itself 450 ms later",
  );
  assert.match(
    selectedZoneController,
    /CustomEvent\("meewav:selected-zone-navigation-start"[\s\S]{0,120}detail: \{ zoneId \}/u,
  );
  assert.match(
    globeMap,
    /addEventListener\("meewav:selected-zone-navigation-start", claimNavigationForSelectedZoneClick\)/u,
  );
});
