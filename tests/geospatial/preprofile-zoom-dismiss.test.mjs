import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dezoom closes the selected avatar popup at the avatar visibility threshold", async () => {
  const [componentSource, avatarLayerSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/map/avatarLayers.ts", "utf8"),
  ]);

  assert.match(avatarLayerSource, /export \{ AVATAR_VISIBLE_MIN_ZOOM \} from "\.\/avatarVisualContract"/u);
  assert.match(componentSource, /AVATAR_VISIBLE_MIN_ZOOM/u);

  const effectStart = componentSource.indexOf("const dismissSelectedProfileWhenAvatarsDisappear = () =>");
  const effectEnd = componentSource.indexOf("const activePreProfileIcon = selectedProfileIcon", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, "missing popup dezoom dismissal effect");

  const effectSource = componentSource.slice(effectStart, effectEnd);
  assert.match(effectSource, /mapInstance\.getZoom\(\) >= AVATAR_VISIBLE_MIN_ZOOM/u);
  assert.match(effectSource, /commitSelectedProfileIcon\(null\)/u);
  assert.match(effectSource, /setProfileIconHoverSourceData\(mapInstance, null\)/u);
  assert.match(effectSource, /setProfileIconCursorLock\(mapInstance, false\)/u);
  assert.match(effectSource, /mapInstance\.on\("zoom", dismissSelectedProfileWhenAvatarsDisappear\)/u);
  assert.match(effectSource, /mapInstance\.on\("zoomend", dismissSelectedProfileWhenAvatarsDisappear\)/u);
  assert.match(effectSource, /mapInstance\.off\("zoom", dismissSelectedProfileWhenAvatarsDisappear\)/u);
  assert.match(effectSource, /mapInstance\.off\("zoomend", dismissSelectedProfileWhenAvatarsDisappear\)/u);
});

test("a delayed avatar search result cannot reopen the pre-profile below the avatar zoom threshold", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const activationStart = componentSource.indexOf("const activateAvatarSearchHover = (result: AvatarSearchResult) =>");
  const activationEnd = componentSource.indexOf("const focusAvatarSearchResult = (result: AvatarSearchResult) =>", activationStart);

  assert.ok(activationStart >= 0, "avatar search activation helper must exist");
  assert.ok(activationEnd > activationStart, "avatar search activation helper must remain bounded");

  const activationSource = componentSource.slice(activationStart, activationEnd);
  assert.match(activationSource, /map\.getZoom\(\) < AVATAR_VISIBLE_MIN_ZOOM/u);
  assert.match(activationSource, /commitSelectedProfileIcon\(next\)/u);
  assert.ok(
    activationSource.indexOf("map.getZoom() < AVATAR_VISIBLE_MIN_ZOOM")
      < activationSource.indexOf("commitSelectedProfileIcon(next)"),
    "the zoom guard must run before a delayed search selection is committed",
  );
});

test("a cached avatar cannot be picked again after dezoom hides the avatar layers", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const queryStart = componentSource.indexOf("const queryProfileIconAtPoint = (point:");
  const queryEnd = componentSource.indexOf("const updateOverlayPosition = () =>", queryStart);

  assert.ok(queryStart >= 0, "avatar picking helper must exist");
  assert.ok(queryEnd > queryStart, "avatar picking helper must remain bounded");

  const querySource = componentSource.slice(queryStart, queryEnd);
  assert.match(querySource, /mapInstance\.getZoom\(\) < AVATAR_VISIBLE_MIN_ZOOM/u);
  assert.ok(
    querySource.indexOf("mapInstance.getZoom() < AVATAR_VISIBLE_MIN_ZOOM")
      < querySource.indexOf("visibleProfileIconFeaturesRef.current"),
    "the zoom guard must reject picking before the cached-feature fallback",
  );
});
