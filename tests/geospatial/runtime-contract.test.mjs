import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("keeps legacy as the safe default and supports the three migration modes", async () => {
  const module = await importTypeScriptModule("src/features/globe/geography/geoPipelineMode.ts");
  assert.equal(module.resolveGeoPipelineMode({}), "legacy");
  assert.equal(module.resolveGeoPipelineMode({ configuredMode: "national" }), "national");
  assert.equal(module.resolveGeoPipelineMode({ configuredMode: "comparison" }), "comparison");
  assert.equal(module.resolveGeoPipelineMode({ legacyBooleanFlag: "true" }), "national");
  assert.equal(module.resolveGeoPipelineMode({
    configuredMode: "legacy",
    search: "?geoPipeline=comparison",
    allowQueryOverride: true,
  }), "comparison");
  assert.equal(module.resolveGeoPipelineMode({
    configuredMode: "legacy",
    search: "?geoPipeline=unsupported",
    allowQueryOverride: true,
  }), "legacy");
});

test("exposes one generic source and exactly five fixed MapLibre layers", async () => {
  const contract = await importTypeScriptModule("src/features/globe/geography/nationalGeoContract.ts");
  assert.equal(contract.NATIONAL_GEO_SOURCE_ID, "meewav-national-zones");
  assert.deepEqual(contract.NATIONAL_GEO_LAYER_IDS, [
    "music-zones-fill",
    "music-zones-outline",
    "music-zones-hitarea",
    "music-zones-extrusion",
    "music-zones-label",
  ]);
  assert.equal(
    contract.NATIONAL_GEO_DEFAULT_ARCHIVE_URL,
    "/map/national/2026.1-prototype/france-zones.pmtiles?v=2026.2-montpellier-test",
  );
});

test("national search adapter and pipeline exchange only a stable zoneId", async () => {
  const [componentSource, pipelineSource, adapterSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8"),
    readFile("src/features/globe/geography/nationalGeoSearchAdapter.ts", "utf8"),
  ]);
  assert.match(adapterSource, /id: record\.zoneId/);
  assert.match(adapterSource, /source: NATIONAL_ZONE_SEARCH_SOURCE/);
  assert.doesNotMatch(adapterSource, /legacyZoneId/);
  assert.match(componentSource, /new CustomEvent\("meewav:national-search-zone-selected"[\s\S]{0,240}zoneId:\s*result\.id/);
  assert.doesNotMatch(componentSource, /national-search-zone-selected[\s\S]{0,160}legacyZoneId/);
  assert.match(pipelineSource, /handleNationalSearchSelection/);
  assert.match(pipelineSource, /CustomEvent<\{ zoneId\?: unknown \}>/);
  assert.match(pipelineSource, /pendingSearchZoneId/);
  assert.match(pipelineSource, /querySourceFeatures/);
});

test("smooths the wheel without remapping the existing mouse commands", async () => {
  const [componentSource, wheelSpringSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/camera/criticalWheelZoom.ts", "utf8"),
  ]);

  assert.match(componentSource, /dragPan:\s*true/);
  assert.match(componentSource, /event\.button !== 1 \|\| !options\.canHandleZoom\(\)/);
  assert.match(componentSource, /event\.button === 2/);
  assert.match(componentSource, /event\.button === 0 && event\.ctrlKey/);
  assert.match(componentSource, /scrollZoom\.setZoomRate\(GOOGLE_EARTH_TRACKPAD_ZOOM_RATE\)/);
  assert.match(componentSource, /scrollZoom\.setWheelZoomRate\(GOOGLE_EARTH_WHEEL_ZOOM_RATE\)/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_ZOOM_RATE\s*=\s*1\s*\/\s*320/);
  assert.match(componentSource, /predictedWheelTargetZoom/);
  assert.match(componentSource, /stepExponentialWheelCoast\([\s\S]{0,100}GOOGLE_EARTH_WHEEL_COAST_DRAG/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_IMPULSE_VELOCITY_FACTOR\s*=\s*18/);
  assert.match(wheelSpringSource, /maximumScalePerFrame[\s\S]{0,120}Math\.exp\(-Math\.abs\(accumulatedDelta \* zoomRate\)\)/);
  assert.doesNotMatch(componentSource, /GOOGLE_EARTH_FINE_ZOOM_FACTOR|event\.altKey/);
});

test("opens avatar focus only on click and closes it when dezoom hides the avatars", async () => {
  const [componentSource, canvasSource, bubbleSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/hooks/useCanvasAvatarOverlay.tsx", "utf8"),
    readFile("src/features/globe/components/HoverPreProfileBubble.tsx", "utf8"),
  ]);

  assert.match(componentSource, /const activePreProfileIcon = selectedProfileIcon/);
  assert.match(componentSource, /const handleMapClick[\s\S]{0,900}commitSelectedProfileIcon\(null\)[\s\S]{0,300}commitSelectedProfileIcon\(next\)/);
  assert.match(componentSource, /canvas\.addEventListener\("pointerdown", handleMapPointerDown, \{ capture: true \}\)/);
  assert.match(componentSource, /if \(queryProfileIconAtPoint\(point\)\) return;[\s\S]{0,240}commitSelectedProfileIcon\(null\)/);
  assert.doesNotMatch(componentSource, /document\.addEventListener\("pointerdown", clearPreProfileOnOutsidePointerDown/);
  assert.doesNotMatch(componentSource, /setRetainedPreProfileIcon|setHoveredProfileIcon/);
  assert.match(componentSource, /anchorLngLat=\{activePreProfileIcon\?\.lngLat \?\? null\}/);
  assert.match(componentSource, /hideDuringCamera=\{false\}/);
  assert.match(componentSource, /mapInstance\.getZoom\(\) >= AVATAR_VISIBLE_MIN_ZOOM[\s\S]{0,240}commitSelectedProfileIcon\(null\)/);

  assert.match(canvasSource, /if \(!avatar\) \{[\s\S]{0,240}onAvatarSelectionChange\?\.\(null\)/);
  assert.match(canvasSource, /addEventListener\("pointerdown", handlePointerDown, \{ capture: true \}\)/);
  assert.match(canvasSource, /onAvatarSelectionChange\?\.\(\{[\s\S]{0,180}screenX: avatar\.x,[\s\S]{0,80}screenY: avatar\.y/);
  assert.doesNotMatch(canvasSource, /if \(hoveredAvatar\) \{/);
  assert.match(bubbleSource, /map\.on\("move", followSelectedAvatar\)/);
  assert.doesNotMatch(bubbleSource, /setLayoutRevision|Math\.round\(initialLayout\.left \+ liveAnchor/);
  assert.match(bubbleSource, /GAP_FROM_AVATAR\s*=\s*-20/);
  assert.match(bubbleSource, /initialLayout\.left \+ liveAnchor\.x - originalTrackingAnchor\.x/);
  assert.match(bubbleSource, /initialLayout\.top \+ liveAnchor\.y - originalTrackingAnchor\.y/);
});

test("keeps foreground names visible and recomputes a host-anchored three-row depth while rotating", async () => {
  const [componentSource, layerSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/map/avatarLayers.ts", "utf8"),
  ]);

  assert.match(layerSource, /VITE_AVATAR_LABEL_MODE === "collision" \? "collision" : "all"/);
  assert.match(layerSource, /"text-allow-overlap": !collisionLabelMode/);
  assert.match(layerSource, /existingLabelLayer\.source !== expectedLabelSourceId[\s\S]{0,180}removeLayer\(AVATAR_VISIBLE_LABELS_LAYER_ID\)/);
  assert.match(componentSource, /const labelDepthPolicy = getAvatarLabelDepthPolicy\(\{[\s\S]{0,180}zoom: map\.getZoom\(\)/);
  assert.match(componentSource, /const isForegroundLabel = yRatio >= labelDepthPolicy\.foregroundYRatio/);
  assert.match(componentSource, /if \(!isPriorityLabel && yRatio < labelDepthPolicy\.cutoffYRatio\) continue/);
  assert.match(componentSource, /getAvatarLabelOpacity\(labelDepthPolicy, yRatio, isPriorityLabel\)/);
  assert.match(componentSource, /const selectionRank = isPriorityLabel \? -1000000 : -screenY/);
  assert.match(componentSource, /const sortKey = isPriorityLabel \? 1000000 : screenY/);
  assert.match(componentSource, /\.\.\.foregroundCandidates,[\s\S]{0,100}\.\.\.middleCandidates,/);
  assert.doesNotMatch(componentSource, /middleCandidates\.slice/);
  assert.match(componentSource, /function getRuntimeAvatarLabelBaseMapFilter\(\)[\s\S]{0,180}AVATAR_LABEL_MODE === "collision" \? getAvatarLabelBaseMapFilter\(\) : null/);
  assert.match(componentSource, /function getRuntimeAvatarLabelMapFilter\(\)[\s\S]{0,360}appendActiveArtistMapFilter\(baseFilter\) : null/);
  assert.match(componentSource, /setFilterIfChanged\(map, PROFILE_ICON_NAMES_LAYER_ID, getRuntimeAvatarLabelMapFilter\(\)\)/);
  assert.match(componentSource, /setFilterIfChanged\(map, AVATAR_VISIBLE_LABELS_LAYER_ID, getRuntimeAvatarLabelMapFilter\(\)\)/);
  assert.match(componentSource, /const scheduleVisibleAvatarLabelsDuringManualMove = \(\) => \{[\s\S]{0,120}mapInstance\.isEasing\(\)/);
  assert.match(componentSource, /mapInstance\.on\("move", scheduleVisibleAvatarLabelsDuringManualMove\)/);
  assert.match(componentSource, /mapInstance\.off\("move", scheduleVisibleAvatarLabelsDuringManualMove\)/);
});

test("keeps district fly animation free of avatar relayout and reveals names at landing", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");

  assert.doesNotMatch(componentSource, /__meewav_artist_facets_loading__/);
  assert.match(
    componentSource,
    /PROVISIONAL_ARTIST_FILTER_CATEGORY_MAXIMUM\s*=\s*getMaxVisibleCategories\(Number\.MAX_SAFE_INTEGER\)/,
  );
  assert.match(
    componentSource,
    /currentZoneProfileTotal === null[\s\S]{0,100}\? PROVISIONAL_ARTIST_FILTER_CATEGORY_MAXIMUM/,
  );

  const filterReapplyStart = componentSource.indexOf("    const scheduleFilterReapply = () => {");
  const easingGuard = componentSource.indexOf("    if (mapInstance.isEasing()) {", filterReapplyStart);
  const moveEndListener = componentSource.indexOf(
    'mapInstance.once("moveend", initialMoveEndHandler)',
    easingGuard,
  );
  const directFilterFallback = componentSource.indexOf("      applyFilters();", moveEndListener);
  const pipelineListener = componentSource.indexOf(
    'window.addEventListener("meewav:avatar-pipeline-changed", scheduleFilterReapply)',
    filterReapplyStart,
  );
  assert.ok(filterReapplyStart >= 0, "artist-filter reapply scheduling must remain explicit");
  assert.ok(easingGuard > filterReapplyStart, "native camera easing must be detected before filter mutation");
  assert.ok(moveEndListener > easingGuard, "avatar relayout must wait for the active fly to land");
  assert.ok(directFilterFallback > moveEndListener, "filters must remain immediate when there is no fly");
  assert.ok(directFilterFallback < pipelineListener, "the initial filter must never wait for a map idle event");
  assert.match(componentSource, /mapInstance\.off\("moveend", initialMoveEndHandler\)/);

  assert.doesNotMatch(componentSource, /delay\s*===\s*1800/);
  assert.match(
    componentSource,
    /for \(const delay of \[260, 900, 1800\]\)[\s\S]{0,260}\(\) => wakeCityAvatars\(`city-view-active:\$\{delay\}`\)/,
  );

  assert.match(
    componentSource,
    /const refreshWhenAvatarTilesArrive = \(event:[^)]+\) => \{[\s\S]{0,180}event\.sourceId !== "meewav-avatars" \|\| event\.sourceDataType !== "content"[\s\S]{0,120}scheduleVisibleAvatarLabelsRefresh\(\)/,
  );
  assert.match(componentSource, /mapInstance\.on\("sourcedata", refreshWhenAvatarTilesArrive\)/);
  assert.match(componentSource, /mapInstance\.off\("sourcedata", refreshWhenAvatarTilesArrive\)/);
});

test("reveals Grand Paris commune quartiers on the first fly", async () => {
  const [controllerSource, componentSource] = await Promise.all([
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
  ]);

  assert.match(
    controllerSource,
    /GRAND_PARIS_FOCUSED_COMMUNE_MIN_ZOOM\s*=\s*GRAND_PARIS_PARENT_OVERVIEW_RETURN_MIN_ZOOM\s*\+\s*0\.15/,
  );

  const focusStart = controllerSource.indexOf("  async showGrandParisSubzones(");
  const focusEnd = controllerSource.indexOf("  async showMetropolitanSubzones(", focusStart);
  const focusSource = controllerSource.slice(focusStart, focusEnd);
  const flyEnd = focusSource.indexOf("await this.flyToFeatureCollection(activeParentSubzones, resolvedFlyTarget)");
  const hideOverview = focusSource.indexOf("setGrandParisParentOverviewLayersVisible(this.map, false)", flyEnd);
  const restoreQuartiers = focusSource.indexOf(
    "this.setGrandParisParentSubzoneRenderCollection(normalizedParentCode)",
    flyEnd,
  );

  assert.ok(flyEnd >= 0, "the commune fly must remain explicit");
  assert.ok(hideOverview > flyEnd, "the solid commune plate must be hidden again at first landing");
  assert.ok(restoreQuartiers > flyEnd, "the quartier collection must be restored at first landing");
  const cameraSyncStart = controllerSource.indexOf("  private syncGrandParisRenderForCamera() {");
  const cameraSyncEnd = controllerSource.indexOf("  private writeTerritoryRegistryDebug()", cameraSyncStart);
  const cameraSyncSource = controllerSource.slice(cameraSyncStart, cameraSyncEnd);
  assert.ok(cameraSyncStart >= 0 && cameraSyncEnd > cameraSyncStart, "Grand Paris camera sync must exist");
  assert.match(cameraSyncSource, /setGrandParisParentOverviewLayersVisible\(this\.map, false\)/);
  assert.match(cameraSyncSource, /this\.setGrandParisParentSubzoneRenderCollection\(parentCode\)/);
  assert.doesNotMatch(controllerSource, /shouldShowGrandParisParentOverviewOnCamera/);

  assert.match(
    componentSource,
    /showGrandParisSubzones as showControllerGrandParisSubzones/,
  );
  const avatarZoneFilterStart = componentSource.indexOf("function buildSelectedAvatarZoneFilterClause(");
  const avatarZoneFilterEnd = componentSource.indexOf("function hasActiveArtistFilters(", avatarZoneFilterStart);
  const avatarZoneFilterSource = componentSource.slice(avatarZoneFilterStart, avatarZoneFilterEnd);
  assert.match(avatarZoneFilterSource, /paris_charonne/);
  assert.match(avatarZoneFilterSource, /\["literal", exactZoneIds\]/);
  assert.doesNotMatch(avatarZoneFilterSource, /zone_name|district_name/);
  const communeFlyStart = componentSource.indexOf("async function flyToGrandParisCommune(");
  const communeFlyEnd = componentSource.indexOf("function isTerrainTileError(", communeFlyStart);
  const communeFlySource = componentSource.slice(communeFlyStart, communeFlyEnd);
  assert.match(
    communeFlySource,
    /await showControllerGrandParisSubzones\(communeCode, communeFlyTarget\)/,
  );
  assert.doesNotMatch(communeFlySource, /clearGrandParisParcelLevelState|window as any\)\.showGrandParisSubzones/);

  const cityOverviewStart = componentSource.indexOf("  const goToCityOverview = () => {");
  const cityOverviewEnd = componentSource.indexOf("  const goToCountryOverview = () => {", cityOverviewStart);
  const cityOverviewSource = componentSource.slice(cityOverviewStart, cityOverviewEnd);
  assert.match(cityOverviewSource, /isLeavingGrandParisDrilldown/);
  assert.match(cityOverviewSource, /:\s*"paris"\) as PremiumFlyPresetName/);
  assert.match(cityOverviewSource, /activeCitySearchResultRef\.current = null/);
});

test("keeps the zoomed district hover label on the pointer without layout-bound motion", async () => {
  const [controllerSource, componentSource, cssSource] = await Promise.all([
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/styles/globe-v2.css", "utf8"),
  ]);

  const hoverCardStart = controllerSource.indexOf("function createSelectedZoneHoverCard");
  const hoverCardEnd = controllerSource.indexOf("function waitForMapEvent", hoverCardStart);
  const hoverCardSource = controllerSource.slice(hoverCardStart, hoverCardEnd);
  assert.doesNotMatch(hoverCardSource, /style\.(?:left|top)\s*=/);
  assert.match(hoverCardSource, /--city-zone-hover-x/);
  assert.match(hoverCardSource, /--city-zone-hover-y/);

  assert.match(controllerSource, /addEventListener\("pointermove", this\.handleHoverPointerMove, \{\s*capture: true,\s*passive: true,/);
  assert.match(controllerSource, /requestAnimationFrame[\s\S]{0,500}pendingHoverPointerPoint[\s\S]{0,300}hoverCard\.move\(point\)/);
  assert.match(controllerSource, /removeEventListener\("pointermove", this\.handleHoverPointerMove, true\)/);
  assert.match(controllerSource, /cancelAnimationFrame\(this\.hoverPointerFrameId\)/);

  assert.match(cssSource, /\.city-zone-hover-card\.is-pointer-following\s*\{[\s\S]{0,500}translate:\s*var\(--city-zone-hover-x[\s\S]{0,180}transition:\s*opacity/);
  assert.match(cssSource, /\.city-zone-hover-card\.is-pointer-following\s*\{[\s\S]{0,700}backdrop-filter:\s*none/);

  const grandParisMoveStart = componentSource.indexOf("const handleGrandParisMove");
  const grandParisMoveEnd = componentSource.indexOf("const handleGrandParisLeave", grandParisMoveStart);
  const grandParisMoveSource = componentSource.slice(grandParisMoveStart, grandParisMoveEnd);
  assert.match(grandParisMoveSource, /currentId !== previousId[\s\S]{0,300}hoverCard\.show/);
  assert.match(grandParisMoveSource, /else \{\s*hoverCard\.move/);
});

test("routes every new Guide Alpha city through one premium fly and first-landing restore", async () => {
  const [componentSource, configSource, flySource, premiumSource, controllerSource, searchIndexSource, nationalSearchPayload, waveFive, recovered] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/selectedExtrusion/citySubdivisionConfig.ts", "utf8"),
    readFile("src/features/globe/mapMechanics/flyMechanicsReference.ts", "utf8"),
    readFile("src/features/globe/maplibre/navigation/premiumFly.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("src/features/globe/maplibre/search-france/franceCityIndex.ts", "utf8"),
    readFile("public/search/france-communes-index.json", "utf8").then(JSON.parse),
    importTypeScriptModule("src/features/globe/geography/franceGuideAlphaWaveFive.ts"),
    importTypeScriptModule("src/features/globe/geography/franceGuideAlphaRecoveredCities.ts"),
  ]);
  const cities = [
    { id: "montpellier", communeCode: "34172" },
    { id: "toulouse", communeCode: "31555" },
    { id: "bordeaux", communeCode: "33063" },
    { id: "strasbourg", communeCode: "67482" },
    { id: "rennes", communeCode: "35238" },
    { id: "reims", communeCode: "51454" },
    { id: "grenoble", communeCode: "38185" },
    { id: "rouen", communeCode: "76540" },
    { id: "toulon", communeCode: "83137" },
    { id: "saint_etienne", featureId: "saint-etienne", fileId: "saint-etienne", communeCode: "42218" },
    { id: "le_havre", featureId: "le-havre", fileId: "le-havre", communeCode: "76351" },
    { id: "dijon", communeCode: "21231" },
    { id: "angers", communeCode: "49007" },
    { id: "nimes", communeCode: "30189" },
    { id: "clermont_ferrand", featureId: "clermont-ferrand", fileId: "clermont-ferrand", communeCode: "63113" },
    { id: "le_mans", featureId: "le-mans", fileId: "le-mans", communeCode: "72181" },
    { id: "aix_en_provence", featureId: "aix-en-provence", fileId: "aix-en-provence", communeCode: "13001" },
    { id: "brest", communeCode: "29019" },
    { id: "tours", communeCode: "37261" },
    { id: "amiens", communeCode: "80021" },
    { id: "perpignan", communeCode: "66136" },
    { id: "metz", communeCode: "57463" },
    { id: "limoges", communeCode: "87085" },
    { id: "besancon", communeCode: "25056" },
    { id: "mulhouse", communeCode: "68224" },
    { id: "caen", communeCode: "14118" },
    { id: "nancy", communeCode: "54395" },
    { id: "avignon", communeCode: "84007" },
    { id: "poitiers", communeCode: "86194" },
    { id: "pau", communeCode: "64445" },
    { id: "la_rochelle", featureId: "la-rochelle", fileId: "la-rochelle", communeCode: "17300" },
    { id: "calais", communeCode: "62193" },
    { id: "dunkerque", communeCode: "59183" },
    { id: "saint_nazaire", featureId: "saint-nazaire", fileId: "saint-nazaire", communeCode: "44184" },
    { id: "troyes", communeCode: "10387" },
    { id: "valence", communeCode: "26362" },
    { id: "chambery", communeCode: "73065" },
    { id: "niort", communeCode: "79191" },
    { id: "lorient", communeCode: "56121" },
    { id: "quimper", communeCode: "29232" },
    { id: "montauban", communeCode: "82121" },
    { id: "beauvais", communeCode: "60057" },
    { id: "vannes", communeCode: "56260" },
    { id: "cholet", communeCode: "49099" },
    { id: "la_roche_sur_yon", featureId: "la-roche-sur-yon", fileId: "la-roche-sur-yon", communeCode: "85191" },
    { id: "bayonne", communeCode: "64102" },
  ];
  const waveFourCityIds = new Set([
    "troyes", "valence", "chambery", "niort", "lorient", "quimper",
    "montauban", "beauvais", "vannes", "cholet", "la_roche_sur_yon", "bayonne",
  ]);
  for (const city of cities) {
    const fileId = city.fileId ?? city.id;
    const featureId = city.featureId ?? city.id;
    assert.match(configSource, new RegExp(`${city.id}: \\{[\\s\\S]{0,180}sourceUrl: "/map/${fileId}-quartiers\\.geojson"`));
    assert.match(flySource, new RegExp(`${city.id}: \\{[\\s\\S]{0,180}name: "${city.id}"`));
    assert.match(componentSource, new RegExp(`"city-${featureId}": "${city.id}"`));
    assert.match(componentSource, new RegExp(`featureId === "city-${featureId}" \\|\\| featureId === "commune-${city.communeCode}"`));
    if (waveFourCityIds.has(city.id)) {
      assert.match(searchIndexSource, new RegExp(`id: "city-${featureId}"`));
    }
  }
  assert.match(premiumSource, /export type PremiumFlyPresetName = CitySubdivisionId;/);

  const waveFiveCities = waveFive.GUIDE_ALPHA_WAVE_FIVE_CITIES;
  const recoveredCities = recovered.GUIDE_ALPHA_RECOVERED_CITIES;
  const nationalSearchIds = new Set(nationalSearchPayload.results.map((result) => result.id));
  assert.equal(waveFiveCities.length, 48);
  assert.equal(recoveredCities.length, 11);
  assert.equal(cities.length + 6 + waveFiveCities.length + recoveredCities.length, 111);
  assert.equal(new Set(waveFiveCities.map((city) => city.id)).size, 48);
  assert.equal(Object.keys(waveFive.GUIDE_ALPHA_WAVE_FIVE_PRESET_BY_FEATURE_ID).length, 96);
  assert.equal(Object.keys(waveFive.GUIDE_ALPHA_WAVE_FIVE_CAMERA_PRESETS).length, 48);

  for (const city of waveFiveCities) {
    const collection = JSON.parse(await readFile(`public${city.sourceUrl}`, "utf8"));
    assert.equal(collection.metadata.communeCode, city.communeCode);
    assert.deepEqual(collection.metadata.bbox, [...city.bbox]);
    assert.ok(city.center[0] >= city.bbox[0] && city.center[0] <= city.bbox[2]);
    assert.ok(city.center[1] >= city.bbox[1] && city.center[1] <= city.bbox[3]);
    assert.equal(city.zoneIdPrefix, `${city.id}_`);
    assert.equal(waveFive.getGuideAlphaWaveFiveCityIdForFeatureId(city.featureId), city.id);
    assert.equal(waveFive.getGuideAlphaWaveFiveCityIdForFeatureId(`commune-${city.communeCode}`), city.id);
    assert.equal(nationalSearchIds.has(`commune-${city.communeCode}`), true, `${city.id} is missing from national search`);
  }

  assert.equal(new Set(recoveredCities.map((city) => city.id)).size, 11);
  assert.equal(Object.keys(recovered.GUIDE_ALPHA_RECOVERED_PRESET_BY_FEATURE_ID).length, 22);
  assert.equal(Object.keys(recovered.GUIDE_ALPHA_RECOVERED_CAMERA_PRESETS).length, 11);
  for (const city of recoveredCities) {
    const collection = JSON.parse(await readFile(`public${city.sourceUrl}`, "utf8"));
    assert.equal(collection.metadata.communeCode, city.communeCode);
    assert.deepEqual(collection.metadata.bbox, [...city.bbox]);
    assert.equal(collection.metadata.curationStatus, "resolved");
    assert.ok(city.center[0] >= city.bbox[0] && city.center[0] <= city.bbox[2]);
    assert.ok(city.center[1] >= city.bbox[1] && city.center[1] <= city.bbox[3]);
    assert.equal(
      collection.features.some((feature) => booleanPointInPolygon(turfPoint(city.center), feature)),
      true,
      `${city.id} camera center must land inside one visible subdivision`,
    );
    assert.equal(city.zoneIdPrefix, `${city.id}_`);
    assert.equal(recovered.getGuideAlphaRecoveredCityIdForFeatureId(city.featureId), city.id);
    assert.equal(recovered.getGuideAlphaRecoveredCityIdForFeatureId(`commune-${city.communeCode}`), city.id);
    assert.equal(nationalSearchIds.has(`commune-${city.communeCode}`), true, `${city.id} is missing from national search`);
  }

  assert.match(configSource, /FRANCE_GUIDE_ALPHA_GENERATED_CITIES\.map/);
  assert.match(configSource, /\.\.\.GUIDE_ALPHA_GENERATED_SUBDIVISION_CONFIGS/);
  assert.match(flySource, /\.\.\.GUIDE_ALPHA_GENERATED_CAMERA_PRESETS/);
  assert.match(componentSource, /\.\.\.GUIDE_ALPHA_GENERATED_PRESET_BY_FEATURE_ID/);
  assert.match(componentSource, /GUIDE_ALPHA_GENERATED_PRESET_BY_FEATURE_ID\[featureId\]/);
  assert.match(componentSource, /FRANCE_COMMUNE_SUBDIVISION_BY_FEATURE_ID\.get\(result\.id\)/);
  assert.match(componentSource, /showControllerMetropolitanSubzones/);
  assert.match(componentSource, /const subdivisionCityId = getCitySubdivisionIdForTarget\(knownPresetName, featureId\);/);
  assert.match(componentSource, /setActiveCityChip\(subdivisionCityId \?\? knownPresetName \?\? ""\)/);
  assert.match(componentSource, /if \(subdivisionCityId\) \{[\s\S]{0,180}premiumFlyToPreset\(subdivisionCityId\)[\s\S]{0,180}restoreCitySubdivisionsAfterCityFly\(mapInstance, subdivisionCityId\)/);
  assert.match(componentSource, /restoreCitySubdivisionsAfterCityFly\(mapInstance, subdivisionCityId\)/);
  assert.match(componentSource, /map\.once\("moveend", runRestore\)/);
  assert.match(componentSource, /fallbackId = window\.setTimeout\(runRestore, 2800\)/);
  assert.match(componentSource, /if \(map\?\.isMoving\(\)\) \{[\s\S]{0,220}window\.setTimeout\(runRestore, 600\)[\s\S]{0,220}return;/);
  assert.match(componentSource, /preloadCitySubdivisions\(cityId\)[\s\S]{0,500}const restoreToken/);
  assert.match(componentSource, /map\.once\("moveend", runRestore\)/);
  assert.match(componentSource, /cancelPendingCitySubdivisionRestore\(\)/);
  assert.match(controllerSource, /async preloadCitySelectableZones\(cityId: CitySubdivisionId\)[\s\S]{0,300}this\.getCityOverviewCollection\(cityId\)/);
  assert.match(controllerSource, /cityOverviewCollectionPromises\.get\(cityId\)[\s\S]{0,5000}cityOverviewCollectionPromises\.set\(cityId, loadPromise\)/);
});

test("metropolitan commune entrances reuse curated standalone city subdivisions", async () => {
  const [configSource, controllerSource, niceLegacy, marseilleLegacy, cagnes, istres] = await Promise.all([
    readFile("src/features/globe/selectedExtrusion/citySubdivisionConfig.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("public/map/nice-metropole-subzones.geojson", "utf8").then(JSON.parse),
    readFile("public/map/marseille-metropole-subzones.geojson", "utf8").then(JSON.parse),
    readFile("public/map/cagnes-sur-mer-quartiers.geojson", "utf8").then(JSON.parse),
    readFile("public/map/istres-quartiers.geojson", "utf8").then(JSON.parse),
  ]);

  assert.match(configSource, /GUIDE_ALPHA_STANDALONE_CITY_ID_BY_COMMUNE_CODE/);
  assert.match(configSource, /getStandaloneCitySubdivisionIdForCommuneCode/);
  assert.match(controllerSource, /const standaloneCityId = getStandaloneCitySubdivisionIdForCommuneCode\(normalizedParentCode\)/);
  assert.match(controllerSource, /await this\.showCitySelectableZones\(standaloneCityId\)/);
  assert.match(controllerSource, /await this\.getCityOverviewCollection\(standaloneCityId\)/);
  assert.match(controllerSource, /await this\.flyToFeatureCollection\(standaloneCollection, standaloneFlyTarget\)/);

  const labelsForParent = (collection, parentCode) => collection.features
    .filter((feature) => String(feature.properties?.parentCode ?? "") === parentCode)
    .map((feature) => String(feature.properties?.label ?? ""));
  const labels = (collection) => collection.features.map((feature) => String(feature.properties?.label ?? ""));

  assert.equal(labelsForParent(niceLegacy, "06027").includes("Le Nord-Est"), true);
  assert.equal(labels(cagnes).includes("La Maure"), true);
  assert.equal(labelsForParent(marseilleLegacy, "13047").includes("Prépaou 2"), true);
  assert.equal(labels(istres).includes("Le Clos de Flore"), true);
  assert.equal(labels(istres).includes("Éco-Pôle du Tubé Ouest"), true);
});

test("navigation state, never city size, owns the active and neighbor color contract", async () => {
  const [contract, generatedCities, typeSource, layerSource, controllerSource, nationalSource] = await Promise.all([
    importTypeScriptModule("src/features/globe/selectedExtrusion/selectedZoneExtrusionTypes.ts"),
    importTypeScriptModule("src/features/globe/geography/franceGuideAlphaCities.generated.ts"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionTypes.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8"),
  ]);

  assert.equal(contract.ACTIVE_COMMUNE_GROUND_COLOR, "#1B1234");
  assert.deepEqual(contract.SELECTED_ZONE_NAVIGATION_ROLES, ["active", "neighbor", "normal"]);
  assert.equal(contract.normalizeSelectedZoneNavigationRole("active"), "active");
  assert.equal(contract.normalizeSelectedZoneNavigationRole("neighbor"), "neighbor");
  assert.equal(contract.normalizeSelectedZoneNavigationRole("small"), "normal");

  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { irisType: "Z", officialId: "123450001" } },
  ]), true);
  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { irisType: "H", officialId: "123450000" } },
  ]), true);
  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { type_iris: "Z", code_iris: "123450000" } },
  ]), true);
  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { irisType: "H", officialId: "123450101" } },
  ]), false);

  const navigationCandidates = generatedCities.FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => ({
    id: city.id,
    center: city.center,
    bbox: city.bbox,
  }));
  const orleans = generatedCities.FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID.get("orleans");
  const olivet = generatedCities.FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID.get("olivet");
  assert.ok(orleans);
  assert.ok(olivet);
  const visibleFromOrleans = contract.selectCommuneNavigationContextCandidates({
    activeId: orleans.id,
    activeCenter: orleans.center,
    zoom: orleans.zoom,
    viewportWidth: 2048,
    candidates: navigationCandidates,
  });
  const visibleFromOlivet = contract.selectCommuneNavigationContextCandidates({
    activeId: olivet.id,
    activeCenter: olivet.center,
    zoom: olivet.zoom,
    viewportWidth: 2048,
    candidates: navigationCandidates,
  });
  assert.equal(visibleFromOrleans.some((candidate) => candidate.id === "olivet"), true);
  assert.equal(visibleFromOlivet.some((candidate) => candidate.id === "orleans"), true);
  assert.equal(visibleFromOrleans.some((candidate) => candidate.id === "orleans"), false);
  assert.equal(visibleFromOlivet.some((candidate) => candidate.id === "olivet"), false);
  const touchingLargeCommune = contract.selectCommuneNavigationContextCandidates({
    activeId: "active-large-commune",
    activeCenter: [0.1, 0.1],
    activeBounds: [0, 0, 1, 1],
    zoom: 18,
    viewportWidth: 512,
    candidates: [{
      id: "touching-large-commune",
      center: [1.9, 0.9],
      bbox: [1, 0, 2, 1],
    }],
  });
  assert.equal(touchingLargeCommune[0]?.id, "touching-large-commune");
  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { label: "Unresolved product zone" } },
  ]), false);
  assert.equal(contract.isOfficialSingleIrisCommune([
    { properties: { irisType: "Z", officialId: "123450000" } },
    { properties: { irisType: "H", officialId: "123450101" } },
  ]), false);

  assert.match(typeSource, /navigationRole: SelectedZoneNavigationRole/);
  assert.match(typeSource, /navigationSurface: SelectedZoneNavigationSurface/);
  assert.match(layerSource, /activeParentNavigationState[\s\S]{0,900}ACTIVE_COMMUNE_GROUND_COLOR/);
  assert.match(layerSource, /neighborNavigationState[\s\S]{0,180}neighborCommuneColorExpression/);
  assert.match(controllerSource, /officialId: officialId \|\| undefined/);
  assert.match(controllerSource, /communeCode: communeCode \|\| undefined/);
  assert.match(controllerSource, /irisCode: irisCode \|\| undefined/);
  assert.match(controllerSource, /irisType: irisType \|\| undefined/);
  assert.match(controllerSource, /createActiveCommuneNavigationPresentation\([\s\S]{0,3000}officialSinglePlate/);
  assert.match(controllerSource, /withNavigationState\(feature, "active", "subdivision"/);
  assert.match(controllerSource, /withNavigationState\(feature, "neighbor", "parent"/);
  assert.match(controllerSource, /navigation_parent_backdrop_/);
  assert.match(controllerSource, /COMMUNE_NAVIGATION_CONTEXT_CONCURRENCY\s*=\s*4/);
  assert.match(controllerSource, /turfUnion\(turfFeatureCollection/);
  assert.match(controllerSource, /getCommuneNavigationParentFeature/);
  assert.match(controllerSource, /selectCommuneNavigationContextCandidates\(\{/);
  assert.match(controllerSource, /navigationTargetFeature\?\.properties\.navigationRole === "neighbor"/);
  assert.match(controllerSource, /this\.activeCitySubdivisionId !== navigationTargetConfig\.id/);
  assert.match(controllerSource, /contextCityIds,[\s\S]{0,160}COMMUNE_NAVIGATION_CONTEXT_CONCURRENCY/);
  assert.match(controllerSource, /const activationPromise = this\.showCitySelectableZones\(navigationTargetConfig\.id\)/);
  assert.match(controllerSource, /const \[loaded\] = await Promise\.all\(\[activationPromise, flyPromise\]\)/);
  assert.match(controllerSource, /FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID[\s\S]{0,160}bbox: generatedCity\?\.bbox/);
  assert.doesNotMatch(controllerSource, /france-communes-index\.json/);

  assert.match(nationalSource, /selectedState,\s*\n\s*ACTIVE_COMMUNE_GROUND_COLOR/);
  assert.match(nationalSource, /neighborState,\s*\n\s*neighborCommuneColorExpression/);
  assert.match(nationalSource, /neighbor: !isSelected && neighborEligible/);
  assert.match(nationalSource, /queryRenderedFeatures\(undefined, \{ layers: \[NATIONAL_GEO_FILL_LAYER_ID\] \}\)/);
  assert.match(nationalSource, /territoryType === "commune" \|\| territoryType === "commune_deleguee"/);
  assert.match(nationalSource, /clearNationalNavigationContext\(\)/);
  assert.match(nationalSource, /contextualTargets\.clear\(\)/);
  assert.doesNotMatch(nationalSource, /dimmedState[\s\S]{0,120}#1B1234/);

  const renderingContractSource = `${typeSource}\n${layerSource}\n${controllerSource}\n${nationalSource}`;
  assert.doesNotMatch(renderingContractSource, /small(?:City|Commune|Town)?Palette/i);
  assert.doesNotMatch(renderingContractSource, /navigationRole[^\n]*(?:population|officialArea|featureCount)/i);
  assert.doesNotMatch(renderingContractSource, /(?:population|officialArea|featureCount)[^\n]*navigationRole/i);
  assert.doesNotMatch(typeSource, /selectCommuneNavigationContextCandidates[\s\S]{0,1800}population/i);
});

test("opening a pre-profile fades unpinned avatars and lets visitors restore them from the popup", async () => {
  const [componentSource, preProfileSource, avatarLayerSource, cssSource, preProfileCssSource, persistenceSource, monGlobeSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/components/preProfile/HoverPreProfileContent.tsx", "utf8"),
    readFile("src/map/avatarLayers.ts", "utf8"),
    readFile("src/features/globe/styles/globe-v2.css", "utf8"),
    readFile("src/features/globe/components/preProfile/HoverPreProfileContent.css", "utf8"),
    readFile("src/features/globe/consultedProfilePersistence.ts", "utf8"),
    readFile("src/features/globe/MonGlobe.tsx", "utf8"),
  ]);

  assert.match(preProfileSource, /onConsult\?: \(artistId: string, kind: "profile" \| "audio" \| "video"\) => void/);
  assert.match(preProfileSource, /handleShortSelect[\s\S]{0,180}onConsult\?\.\(artist\.id, "video"\)/);
  assert.match(preProfileSource, /if \(!isAlreadyPlaying\) onConsult\?\.\(artist\.id, "audio"\)/);
  assert.match(preProfileSource, /onConsult\?\.\(artist\.id, "profile"\)[\s\S]{0,100}onOpenProfile\?\.\(artist\.id\)/);

  assert.match(componentSource, /if \(!activePreProfileIcon \|\| activePreProfileIcon\.isCurrentUser\) return;[\s\S]{0,120}if \(activePreProfilePinnedColor\) return;[\s\S]{0,120}handlePreProfileConsult\(activePreProfileIcon\.profileId\)/);
  assert.match(componentSource, /handleRestoreConsultedAvatar[\s\S]{0,420}currentIds\.filter\(\(currentId\) => currentId !== profileId\)/);
  assert.match(componentSource, /if \(normalizedFocusedProfileId === profileId\) continue;/);
  assert.match(componentSource, /function syncFocusedAvatarLabelFeatureState\(map: MapLibreMap, profileId: string \| null\)[\s\S]{0,1300}map\.setFeatureState\(target, \{ \[AVATAR_PREPROFILE_LABEL_HIDDEN_STATE\]: true \}\)/);
  assert.match(componentSource, /syncFocusedAvatarLabelFeatureState\(activeMap, next\?\.profileId \?\? null\);[\s\S]{0,100}selectedProfileIconRef\.current = next/);
  assert.match(componentSource, /PROFILE_PIN_REPERE_LABEL_LAYER_ID[\s\S]{0,1600}\["feature-state", AVATAR_PREPROFILE_LABEL_HIDDEN_STATE\]/);
  assert.match(componentSource, /AVATAR_VISIBLE_LABELS_LAYER_ID,[\s\S]{0,140}"text-opacity",[\s\S]{0,100}getAvatarLabelTextOpacityExpression\(\)/);
  assert.match(componentSource, /getAvatarLabelTextOpacityExpression\("collision"\)/);
  assert.doesNotMatch(componentSource, /suppressVisibleAvatarLabelImmediately/);
  assert.match(componentSource, /consultedProfileIdsRef\.current\.includes\(next\.profileId\)[\s\S]{0,180}!profilePinReperesRef\.current\.some/);
  assert.match(componentSource, /activePreProfileShowsRestore = activePreProfileIsConsulted && selectedProfileWasConsultedOnOpen/);
  assert.match(componentSource, /showRestoreAvatar=\{activePreProfileShowsRestore\}[\s\S]{0,320}onRestoreAvatar=\{handleRestoreConsultedAvatar\}/);
  assert.match(componentSource, /showName\s*\n\s*isConsulted=\{activePreProfileShowsRestore\}/);

  assert.match(componentSource, /consultedLabelIds\.has\(profileId\) && !isPinnedLabel && !isCurrentUserLabel/);
  assert.match(componentSource, /consultedProfileIds,\s*\n\s*\}\);/);
  assert.match(componentSource, /buildConsultedProfilesMapLibreFilterClause\(consultedProfileIds, pinnedProfileIds\)/);
  assert.match(componentSource, /syncConsultedAvatarVisualState\([\s\S]{0,180}consultedProfileIds[\s\S]{0,180}profilePinReperes\.map/);
  assert.match(componentSource, /role="switch"[\s\S]{0,180}aria-checked=\{hideConsultedProfiles\}/);
  assert.match(componentSource, /getProfileIconImageUrl\(role\.key\)/);
  assert.match(componentSource, /readConsultedProfileIds\(authenticatedUserId\)/);
  assert.match(componentSource, /persistConsultedProfileIds\(authenticatedUserId, consultedProfileIds\)/);
  assert.match(componentSource, /persistHideConsultedProfilesPreference\(authenticatedUserId, hideConsultedProfiles\)/);
  assert.match(componentSource, /function useFilterDrawerDragScroll\(\)/);
  assert.match(componentSource, /drag\.startScrollTop - totalDeltaY/);
  assert.match(componentSource, /suppressNextClickRef\.current[\s\S]{0,240}event\.preventDefault\(\)[\s\S]{0,100}event\.stopPropagation\(\)/);
  assert.match(componentSource, /onPointerDown=\{handleArtistFilterPointerDown\}[\s\S]{0,320}onClickCapture=\{handleArtistFilterClickCapture\}/);
  assert.match(componentSource, /const toggleAllArtistRolesDraft = \(\) => \{[\s\S]{0,760}\.slice\(0, selectableArtistRoleCount\)/);
  assert.match(componentSource, /className=\{`artist-filter-bulk-toggle[\s\S]{0,300}aria-pressed=\{draftHasEverySelectableArtistRole\}/);
  assert.match(componentSource, /draftHasEverySelectableArtistRole \? "Tout désélectionner" : "Tout sélectionner"/);
  assert.match(componentSource, /const selectableArtistRoleCount = Math\.min\([\s\S]{0,140}currentZoneCategoryMaximum[\s\S]{0,100}ARTIST_ROLE_KEYS\.length/);
  assert.doesNotMatch(componentSource, /hasEveryArtistRoleSelected/);

  assert.match(avatarLayerSource, /CONSULTED_AVATAR_ICON_SUFFIX = "-consulted"/);
  assert.match(avatarLayerSource, /CONSULTED_AVATAR_OPACITY = 0\.5/);
  assert.match(avatarLayerSource, /AVATAR_PREPROFILE_LABEL_HIDDEN_STATE = "preprofileLabelHidden"/);
  assert.match(avatarLayerSource, /getAvatarLabelTextOpacityExpression[\s\S]{0,520}\["feature-state", AVATAR_PREPROFILE_LABEL_HIDDEN_STATE\][\s\S]{0,120}\n\s*0,/);
  assert.match(avatarLayerSource, /function createConsultedAvatarIconData\([\s\S]{0,520}grayscalePixels\[offset \+ 2\] = luminance/);
  assert.match(avatarLayerSource, /map\.addImage\([\s\S]{0,120}consultedIconId[\s\S]{0,160}createConsultedAvatarIconData\(iconData\)/);
  assert.match(avatarLayerSource, /export function syncConsultedAvatarVisualState\([\s\S]{0,300}!pinnedIds\.has\(profileId\)/);
  assert.match(avatarLayerSource, /\["!=", \["get", "is_current_user"\], true\][\s\S]{0,180}\["concat", baseIconExpression, CONSULTED_AVATAR_ICON_SUFFIX\]/);
  assert.match(avatarLayerSource, /setPaintProperty\(layerId, "icon-opacity", opacityExpression/);
  assert.match(preProfileSource, /showRestoreAvatar && \([\s\S]{0,360}onRestoreAvatar\?\.\(artist\.id\)/);
  assert.match(preProfileSource, /Rétablir l’avatar/);
  assert.match(preProfileSource, /!showRestoreAvatar && \([\s\S]{0,220}mw-preprofile__pin/);
  assert.match(preProfileCssSource, /\.mw-preprofile__restore-avatar\s*\{[\s\S]{0,520}linear-gradient/);
  assert.match(cssSource, /\.profile-icon-hover-overlay\.is-consulted \.profile-icon-hover-overlay__sprite\s*\{[\s\S]{0,100}opacity: 0\.6;[\s\S]{0,80}filter: grayscale\(1\)/);

  assert.match(cssSource, /\.artist-filter-panel\.side-panel\s*\{[\s\S]{0,1200}translate3d\(calc\(-100% - 32px\), 0, 0\)/);
  assert.match(cssSource, /\.artist-filter-panel\.side-panel\.is-open\s*\{[\s\S]{0,180}translate3d\(0, 0, 0\)/);
  assert.match(cssSource, /\.artist-filter-option__avatar img/);
  assert.match(cssSource, /\.artist-filter-panel__body\.is-drag-scrolling[\s\S]{0,180}cursor: grabbing/);
  assert.match(cssSource, /\.artist-filter-bulk-toggle\.is-active\s*\{[\s\S]{0,260}rgba\(82, 96, 255/);
  assert.match(cssSource, /\.artist-filter-option\.is-active \.artist-filter-option__check\s*\{[\s\S]{0,220}#596cff/);

  assert.match(persistenceSource, /meewav:consulted-profile-ids/);
  assert.match(persistenceSource, /getConsultedProfileIdsStorageKey\(userId:[\s\S]{0,300}:\$\{ownerId\}:\$\{STORAGE_VERSION\}/);
  assert.match(persistenceSource, /if \(!key \|\| !storage\) return \[\];/);
  assert.doesNotMatch(persistenceSource, /current_user_fetah/);
  assert.match(monGlobeSource, /supabase\.auth\.getSession\(\)/);
  assert.match(monGlobeSource, /supabase\.auth\.onAuthStateChange/);
  assert.match(monGlobeSource, /key=\{persistenceOwner\}/);
  assert.match(monGlobeSource, /localPreviewOwnerId[\s\S]*?readCurrentMusicSceneProfile\(\)[\s\S]*?LOCAL_PREVIEW_FETAH_HOST\.profileId/);
  assert.match(monGlobeSource, /profileOwnerId = authenticatedUserId \?\? localPreviewOwnerId/);
  assert.match(monGlobeSource, /authenticatedUserId=\{profileOwnerId\}/);
});

test("inactive national zones never create a coplanar extrusion surface", async () => {
  const pipelineSource = await readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8");
  assert.match(pipelineSource, /filter: activeExtrusionFilter\(\[\]\)/);
  assert.match(pipelineSource, /activeExtrusionFilter\(\[hoverOnlyTarget\]\)/);
  assert.match(pipelineSource, /hoverState,\s*0\.6/);
  assert.doesNotMatch(pipelineSource, /selectedState,\s*3/);
  assert.doesNotMatch(pipelineSource, /"fill-extrusion-height": 0,/);
});

test("national and district selection share polygon layers without a building runtime", async () => {
  const [
    pipelineSource,
    controllerSource,
    layerSource,
    typeSource,
    componentSource,
    styleSource,
    configSource,
    cssSource,
  ] = await Promise.all([
    readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionTypes.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/maplibre/meewavMapLibreStyle.ts", "utf8"),
    readFile("src/features/globe/selectedExtrusion/citySubdivisionConfig.ts", "utf8"),
    readFile("src/features/globe/styles/globe-v2.css", "utf8"),
  ]);

  // National selections still hand their canonical geometry to the shared
  // district controller; legacy IDs keep using the normal district API.
  assert.match(pipelineSource, /collectNationalZoneGeometry/);
  assert.match(pipelineSource, /loadNationalZoneDetailGeometry/);
  assert.match(pipelineSource, /\.\/zone-details\/\$\{encodeURIComponent/);
  assert.match(pipelineSource, /meewav:national-zone-selected/);
  assert.match(pipelineSource, /geometry,/);
  assert.match(controllerSource, /addEventListener\("meewav:national-zone-selected", this\.handleNationalZoneSelected/);
  assert.match(controllerSource, /removeEventListener\("meewav:national-zone-selected", this\.handleNationalZoneSelected/);
  assert.match(controllerSource, /private handleNationalZoneSelected/);
  assert.match(controllerSource, /private selectNationalZone/);
  assert.match(controllerSource, /void this\.selectExtrudedZone\(legacyZoneId\)/);
  assert.match(controllerSource, /this\.map\.on\("click", SELECTED_ZONE_HITBOX_LAYER_ID, this\.handleZoneClick\)/);
  assert.match(controllerSource, /\(window as any\)\.selectExtrudedZone/);
  assert.match(controllerSource, /__MEEWAV_SELECTED_ZONE_EXTRUSION__/);

  for (const id of [
    "selected-zone-polygons",
    "selected-zone-polygons-render",
    "selected-zone-label-points",
    "selected-zone-hitbox",
    "selected-zone-fill",
    "selected-zone-interior-light",
    "selected-zone-hover-glow",
    "selected-zone-outline",
    "selected-zone-labels",
  ]) {
    assert.match(typeSource, new RegExp(`=[\\s]*["']${id}["']`), id);
  }
  assert.match(layerSource, /promoteId:\s*"zoneId"/);
  assert.match(layerSource, /type:\s*"fill"/);
  assert.match(layerSource, /type:\s*"line"/);
  assert.match(layerSource, /type:\s*"symbol"/);

  // The new direction has no generic or selected-building loading, layers or UX.
  await assert.rejects(
    access("src/features/globe/selectedExtrusion/selectedZoneBuildingLoader.ts"),
    (error) => error?.code === "ENOENT",
  );
  assert.doesNotMatch(controllerSource, /selectedZoneBuildingLoader|loadBuildingsForZone|preloadZoneBuildings|applyBuildings|toggleSelectedZoneBuildings/);
  assert.doesNotMatch(layerSource + typeSource, /SELECTED_DISTRICT_BUILDINGS|selected-district-buildings|SEINE_SAINT_DENIS_SELECTED_BUILDINGS|fill-extrusion/);
  assert.doesNotMatch(configSource, /usesDedicatedSelectedBuildings|keepsNativeCityBuildings|preloadsBuildingsOnHover/);
  assert.doesNotMatch(componentSource, /buildingRiseAnimation|BUILDING_TARGET_LAYER_IDS|preloadZoneBuildings|toggleSelectedZoneBuildings|buildingsToggleAvailable|map-control-button--buildings|building-picker-panel/);
  assert.doesNotMatch(cssSource, /map-control-button--buildings|building-picker-panel/);
  assert.doesNotMatch(styleSource, /["']source-layer["']\s*:\s*["']building["']/);
});

test("data-only territories keep selection and camera inside the national runtime", async () => {
  const pipelineSource = await readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8");
  assert.match(pipelineSource, /runtime_mode === "national"/);
  assert.match(pipelineSource, /focusNationalFeature\(map, feature\)/);
  assert.match(pipelineSource, /map\.fitBounds/);
  assert.match(pipelineSource, /BASEMAP_LOCAL_LABEL_LAYER_IDS/);
  assert.match(pipelineSource, /"visibility", "none"/);
});

test("national labels use one point feature instead of every polygon tile fragment", async () => {
  const pipelineSource = await readFile("src/features/globe/geography/nationalGeoPipeline.ts", "utf8");
  const buildSource = await readFile("scripts/geo/lib/build-zones.mjs", "utf8");
  assert.match(pipelineSource, /\["get", "record_type"\], "label"/);
  assert.match(buildSource, /type: "Point", coordinates: zone\.labelPoint/);
  assert.match(buildSource, /record_type: label \? "label" : "zone"/);
});

test("commune navigation renders green labels at overview altitude and delegates every click to the official fly flow", async () => {
  const [componentSource, hubSource, registrySource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/maplibre/franceCommuneNavigationHubs.ts", "utf8"),
    readFile("src/features/globe/geography/franceSinglePlateRegistry.ts", "utf8"),
  ]);

  assert.match(hubSource, /FRANCE_COMMUNE_NAVIGATION_SOURCE_ID\s*=\s*"france-commune-navigation-hubs"/);
  assert.match(hubSource, /navigationHub:\s*true/);
  assert.match(hubSource, /pointColor:\s*"#72F5A7"/);
  assert.match(hubSource, /glowColor:\s*"#16C965"/);
  assert.match(hubSource, /options\.allowedIds && !options\.allowedIds\.has\(result\.id\)/);
  assert.match(hubSource, /GRID_CELL_DEGREES\s*=\s*0\.25/);

  assert.match(componentSource, /FRANCE_NATIONWIDE_COMMUNE_RENDER_ENABLED\s*=\s*true/);
  assert.match(componentSource, /FRANCE_NATIONWIDE_COMMUNE_LAYER_MIN_ZOOM\s*=\s*11\.45/);
  assert.match(componentSource, /FRANCE_NATIONWIDE_COMMUNE_LAYER_MAX_ZOOM\s*=\s*20\.01/);
  assert.match(componentSource, /FRANCE_URBAN_AREA_LAYER_MAX_ZOOM\s*=\s*11\.45/);
  assert.match(componentSource, /\.\.\.FRANCE_REGION_CITY_COMMUNE_NAVIGATION_ID_SET/);
  assert.doesNotMatch(componentSource, /new FranceCommuneNavigationHubIndex\([\s\S]{0,250}excludedIds:/);
  assert.equal((componentSource.match(/source:\s*FRANCE_COMMUNE_NAVIGATION_SOURCE_ID/g) ?? []).length, 4);
  assert.equal(
    (componentSource.match(/maxzoom:\s*FRANCE_NATIONWIDE_COMMUNE_LAYER_MAX_ZOOM/g) ?? []).length,
    4,
    "all green navigation surfaces must remain available at a tight city landing",
  );
  assert.match(componentSource, /"text-field": \["get", "name"\]/);
  assert.match(componentSource, /"text-allow-overlap": true/);
  assert.match(componentSource, /"text-ignore-placement": true/);

  const syncBlock = componentSource.match(/const syncVisibleCommuneNavigationHubs = \(reason:[\s\S]+?\r?\n\s*\};\r?\n\s*const scheduleSyncVisibleCommuneNavigationHubs/)?.[0] ?? "";
  assert.match(syncBlock, /padFranceCommuneNavigationBounds/);
  assert.doesNotMatch(syncBlock, /mapInstance\.project/);
  assert.match(syncBlock, /selectStablePointLabelIds\(visibleCandidates, zoom\)/);
  assert.match(syncBlock, /stableLabel:/);
  assert.match(syncBlock, /mapInstance\.getZoom\(\) < FRANCE_NATIONWIDE_COMMUNE_LAYER_MAX_ZOOM/);
  assert.match(syncBlock, /source\.setData/);
  assert.match(componentSource, /mapInstance\.on\("moveend", handleMoveEnd\)/);
  assert.match(componentSource, /mapInstance\.on\("zoomend", handleZoomEnd\)/);
  assert.doesNotMatch(componentSource, /mapInstance\.on\("rotateend", scheduleSyncVisibleCommuneNavigationHubs\)/);
  assert.doesNotMatch(componentSource, /mapInstance\.on\("idle", scheduleSyncVisibleCommuneNavigationHubs\)/);
  assert.doesNotMatch(componentSource, /mapInstance\.on\("move", scheduleSyncVisibleCommuneNavigationHubs\)/);

  assert.match(componentSource, /createFranceSearchResultFromCommuneNavigationHub\(navigationFeature\)/);
  assert.match(componentSource, /if \(navigationResult\) \{[\s\S]{0,500}selectFranceSearchResult\(navigationResult\);[\s\S]{0,80}return;/);
  assert.match(componentSource, /\^commune-\[0-9A-Z\]\{5\}\$[\s\S]{0,700}selectFranceSearchResult\(\{/);
  assert.match(registrySource, /loadFranceSinglePlateCommuneIds/);
  assert.match(registrySource, /Object\.keys\(runtimeIndex\.communes\)/);
});
