import { describe, expect, it } from "vitest";
import {
  getCanonicalScenePath,
  getScenePathForTab,
  getSceneTabFromPathname,
  getSceneArtistPath,
  getSceneArtistReference,
  getScenePlaylistId,
  getScenePlaylistPath,
  getSceneVerticalPath,
  getSceneVerticalVideoId,
  getSceneWatchPath,
  getSceneWatchSlug,
  LEGACY_SHORTS_ROUTE,
  SCENE_EXPLORE_ROUTE,
  SCENE_FOLLOWING_ROUTE,
  SCENE_FULL_SIGNATURE,
  SCENE_NAME,
  SCENE_ROUTE,
  SCENE_SIGNATURE,
  SCENE_STUDIO_ROUTE,
  SCENE_SUBSIGNATURE,
  SCENE_TV_ROUTE,
} from "./sceneContract";

describe("La Scène route contract", () => {
  it("publishes the official identity", () => {
    expect(SCENE_NAME).toBe("La Scène");
    expect(SCENE_SIGNATURE).toBe("Là où le talent règne sur l’algorithme.");
    expect(SCENE_FULL_SIGNATURE).toBe("La Scène — là où le talent règne sur l’algorithme.");
    expect(SCENE_SUBSIGNATURE).toContain("Un flux 100 % musique");
  });

  it("keeps Shorts as a legacy route and normalizes known deep links", () => {
    expect(LEGACY_SHORTS_ROUTE).toBe("/shorts");
    expect(SCENE_ROUTE).toBe("/scene");
    expect(SCENE_FOLLOWING_ROUTE).toBe("/scene/suivis");
    expect(SCENE_TV_ROUTE).toBe("/scene/tv");
    expect(SCENE_EXPLORE_ROUTE).toBe("/scene/explorer");
    expect(SCENE_STUDIO_ROUTE).toBe("/scene/studio");
    expect(getCanonicalScenePath("/shorts")).toBe("/scene");
    expect(getCanonicalScenePath("/shorts/suivis")).toBe("/scene/suivis");
    expect(getCanonicalScenePath("/shorts/abonnements")).toBe("/scene/suivis");
    expect(getCanonicalScenePath("/shorts/following")).toBe("/scene/suivis");
    expect(getCanonicalScenePath("/shorts/explore")).toBe("/scene/explorer");
    expect(getCanonicalScenePath("/shorts/decouvrir")).toBe("/scene/explorer");
    expect(getCanonicalScenePath("/shorts/tv")).toBe("/scene/tv");
    expect(getCanonicalScenePath("/shorts/studio")).toBe(SCENE_STUDIO_ROUTE);
    expect(getCanonicalScenePath("/shorts/video/demo-1")).toBe("/scene/video/demo-1");
  });

  it("resolves public tabs from canonical and historical paths", () => {
    expect(getSceneTabFromPathname("/scene")).toBe("home");
    expect(getSceneTabFromPathname("/scene/suivis")).toBe("following");
    expect(getSceneTabFromPathname("/scene/abonnements")).toBe("following");
    expect(getSceneTabFromPathname("/shorts/following")).toBe("following");
    expect(getSceneTabFromPathname("/scene/tv/programme")).toBe("tv");
    expect(getSceneTabFromPathname("/scene/explorer")).toBe("explore");
    expect(getSceneTabFromPathname("/scene/search")).toBe("explore");
    expect(getSceneTabFromPathname(SCENE_STUDIO_ROUTE)).toBeNull();
    expect(getSceneTabFromPathname("/market")).toBeNull();

    expect(getScenePathForTab("home")).toBe(SCENE_ROUTE);
    expect(getScenePathForTab("following")).toBe(SCENE_FOLLOWING_ROUTE);
    expect(getScenePathForTab("tv")).toBe(SCENE_TV_ROUTE);
    expect(getScenePathForTab("explore")).toBe(SCENE_EXPLORE_ROUTE);
  });

  it("builds a readable canonical watch route", () => {
    const path = getSceneWatchPath("sous-la-lumiere-naya-k");
    expect(path).toBe("/scene/watch/sous-la-lumiere-naya-k");
    expect(getSceneWatchSlug(path)).toBe("sous-la-lumiere-naya-k");
    expect(getSceneWatchSlug("/scene/explorer")).toBeNull();
  });

  it("builds canonical vertical and artist deep links", () => {
    expect(getSceneVerticalPath("vertical-01")).toBe("/scene/vertical/vertical-01");
    expect(getSceneVerticalVideoId("/scene/vertical/vertical-01")).toBe("vertical-01");
    expect(getSceneArtistPath("naya k")).toBe("/scene/artist/naya%20k");
    expect(getSceneArtistReference("/scene/artist/naya%20k")).toBe("naya k");
    expect(getScenePlaylistPath("sessions du soir")).toBe("/scene/playlist/sessions%20du%20soir");
    expect(getScenePlaylistId("/scene/playlist/sessions%20du%20soir")).toBe("sessions du soir");
  });
});
