import { describe, expect, it } from "vitest";
import { ALL_SHORTS_VIDEOS, SHORTS_WALLS } from "../shorts/shorts-wall-data";
import {
  SCENE_CONTENT_TYPE_OPTIONS,
  SCENE_ARTIST_ROLE_OPTIONS,
  SCENE_GRADE_OPTIONS,
  SCENE_GUEST_DEFAULT_FILTERS,
  SCENE_STYLE_OPTIONS,
  countActiveSceneFilters,
  discoverSceneVideos,
  filterSceneVideos,
  getSceneDefaultFilters,
  mergeSceneFiltersIntoSearch,
  parseSceneDuration,
  parseSceneFilterSearch,
  parseSceneViewCount,
  sceneFiltersToSearchParams,
  sceneVideoFromShortsItem,
  sortSceneVideos,
  type SceneFilterState,
  type SceneVideoRecord,
} from "./sceneDiscoveryModel";

const NOW = new Date("2026-08-07T12:00:00.000Z");

function video(overrides: Partial<SceneVideoRecord> = {}): SceneVideoRecord {
  return {
    id: "video-1",
    title: "Nuit sur Casablanca",
    artistId: "nassim",
    artistName: "Nassim Halim",
    contentType: "performance",
    presentationFormat: "landscape",
    artistRoles: ["avatar_24"],
    styles: ["rai"],
    durationSeconds: 228,
    publicationState: "published",
    publishedAt: "2026-08-06T12:00:00.000Z",
    country: "France",
    region: "Provence-Alpes-Côte d’Azur",
    city: "Marseille",
    grade: 3,
    viewCount: 184_000,
    likeCount: 12_400,
    relevanceScore: 20,
    ...overrides,
  };
}

describe("La Scène filter configuration", () => {
  it("exposes the complete video taxonomy and the six existing grades", () => {
    expect(SCENE_CONTENT_TYPE_OPTIONS.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "clip",
      "performance",
      "dj-set",
      "room-replay",
      "meewav-original",
    ]));
    expect(SCENE_STYLE_OPTIONS).toHaveLength(25);
    expect(SCENE_ARTIST_ROLE_OPTIONS.map(({ key, label }) => `${key}:${label}`)).toEqual([
      "avatar_1:Violoniste",
      "avatar_2:Vidéaste clipper",
      "avatar_5:Studio",
      "avatar_6:Sound designer",
      "avatar_7:Pianiste",
      "avatar_8:Percussionniste",
      "avatar_9:Organisation scénique",
      "avatar_10:Management",
      "avatar_11:Label",
      "avatar_12:Cuivres",
      "avatar_13:Instruments à vent",
      "avatar_14:Ingénieur du son",
      "avatar_15:Guitariste électrique",
      "avatar_16:Guitariste acoustique",
      "avatar_17:DJ",
      "avatar_18:Direction artistique",
      "avatar_19:Danseuse",
      "avatar_20:Danseur",
      "avatar_21:Compositeur",
      "avatar_22:Coach vocal",
      "avatar_23:Chanteuse / rappeuse",
      "avatar_24:Chanteur / rappeur",
      "avatar_25:Beatmaker",
      "avatar_26:Beatboxer",
      "avatar_27:Batteur / batteuse",
      "avatar_28:Bassiste",
      "avatar_29:Auteur / parolier",
      "avatar_30:Accordéoniste",
    ]);
    expect(SCENE_ARTIST_ROLE_OPTIONS.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(["avatar_3", "avatar_4"]),
    );
    expect(SCENE_GRADE_OPTIONS.map(({ label }) => label)).toEqual([
      "Débutant",
      "Émergent",
      "Confirmé",
      "Élite",
      "Maître",
      "Légendaire",
    ]);
  });

  it("defaults guests to relevance and personalized sessions to For You", () => {
    expect(getSceneDefaultFilters().sort).toBe("relevance");
    expect(getSceneDefaultFilters(true).sort).toBe("for-you");
  });
});

describe("La Scène URL filters", () => {
  it("parses repeated values, comma-separated values and ignores invalid values", () => {
    const filters = parseSceneFilterSearch(
      "?q=nassim&type=clip&type=performance,room-replay&type=live&role=avatar_23,avatar_25&role=avatar_4&style=rai&grade=3,6,9&duration=1-5&date=week&sort=recent&city=Marseille",
    );

    expect(filters).toMatchObject({
      query: "nassim",
      contentTypes: ["clip", "performance", "room-replay"],
      artistRoles: ["avatar_23", "avatar_25"],
      styles: ["rai"],
      grades: [3, 6],
      durations: ["1-5"],
      date: "week",
      sort: "recent",
      city: "Marseille",
    });
    expect(filters.contentTypes).not.toContain("live");
  });

  it("uses For You as the configurable default and omits it from the canonical URL", () => {
    const filters = parseSceneFilterSearch("?q=jazz&sort=unknown", { defaultSort: "for-you" });
    expect(filters.sort).toBe("for-you");
    expect(sceneFiltersToSearchParams(filters, { defaultSort: "for-you" }).toString()).toBe("q=jazz");
  });

  it("round-trips filters and preserves shell-owned route parameters", () => {
    const filters: SceneFilterState = {
      ...SCENE_GUEST_DEFAULT_FILTERS,
      query: "session paris",
      contentTypes: ["session", "room-replay"],
      artistRoles: ["avatar_17", "avatar_21"],
      styles: ["jazz", "soul"],
      durations: ["5-20"],
      city: "Paris",
      grades: [2, 4],
      date: "month",
      sort: "most-liked",
    };
    const merged = mergeSceneFiltersIntoSearch("?tab=home&q=old&type=clip", filters);

    expect(merged.get("tab")).toBe("home");
    expect(parseSceneFilterSearch(merged)).toEqual(filters);
    expect(countActiveSceneFilters(filters)).toBe(13);
  });
});

describe("La Scène filtering", () => {
  it("searches without accents across artist, title, style and location", () => {
    const videos = [
      video(),
      video({ id: "electro", title: "Éclat électrique", artistName: "Léa", city: "Nîmes", styles: ["electro"] }),
    ];
    const filters = { ...getSceneDefaultFilters(), query: "lea nimes electro" };
    expect(filterSceneVideos(videos, filters, NOW).map(({ id }) => id)).toEqual(["electro"]);
  });

  it("combines content, duration, place, grade and publication date filters", () => {
    const matching = video({ id: "matching", contentType: "session", durationSeconds: 600, publishedAt: "2026-08-05T10:00:00.000Z" });
    const old = video({ id: "old", contentType: "session", durationSeconds: 600, publishedAt: "2025-01-01T10:00:00.000Z" });
    const wrongType = video({ id: "clip", contentType: "clip", durationSeconds: 600 });
    const filters: SceneFilterState = {
      ...getSceneDefaultFilters(),
      contentTypes: ["session"],
      artistRoles: ["avatar_24"],
      styles: ["rai"],
      durations: ["5-20"],
      country: "France",
      region: "Provence-Alpes-Côte d’Azur",
      city: "Marseille",
      grades: [3],
      date: "week",
    };
    const wrongRole = video({ id: "wrong-role", contentType: "session", durationSeconds: 600, artistRoles: ["avatar_17"] });
    expect(filterSceneVideos([matching, old, wrongType, wrongRole], filters, NOW).map(({ id }) => id)).toEqual(["matching"]);
  });

  it("excludes drafts and removed videos while accepting an explicitly published Room replay", () => {
    const filters = getSceneDefaultFilters();
    const videos = [
      video({ id: "draft", publicationState: "draft" }),
      video({ id: "removed", publicationState: "removed" }),
      video({ id: "replay", contentType: "room-replay", publicationState: "published" }),
    ];
    expect(filterSceneVideos(videos, filters, NOW).map(({ id }) => id)).toEqual(["replay"]);
  });
});

describe("La Scène recommendations", () => {
  it("prioritizes followed artists and musical affinity in For You without using popularity", () => {
    const popular = video({ id: "popular", artistId: "popular", styles: ["pop"], viewCount: 9_000_000, likeCount: 900_000 });
    const followed = video({ id: "followed", artistId: "followed", styles: ["jazz"], viewCount: 40, likeCount: 2 });
    const matchingStyle = video({ id: "style", artistId: "other", styles: ["jazz"], viewCount: 20, likeCount: 1 });
    const sorted = sortSceneVideos(
      [popular, matchingStyle, followed],
      { query: "", sort: "for-you" },
      { followedArtistIds: ["followed"], preferredStyles: ["jazz"] },
    );
    expect(sorted.map(({ id }) => id)).toEqual(["followed", "style", "popular"]);
  });

  it("keeps different artists adjacent in recommendation feeds when possible", () => {
    const ranked = discoverSceneVideos([
      video({ id: "a1", artistId: "a", relevanceScore: 100 }),
      video({ id: "a2", artistId: "a", relevanceScore: 90 }),
      video({ id: "b1", artistId: "b", relevanceScore: 80 }),
    ], getSceneDefaultFilters(), {}, NOW);
    expect(ranked.map(({ id }) => id)).toEqual(["a1", "b1", "a2"]);
  });

  it("supports explicit recent, watched and appreciated sorts without making them defaults", () => {
    const first = video({ id: "first", publishedAt: "2026-08-01T00:00:00.000Z", viewCount: 10, likeCount: 900 });
    const second = video({ id: "second", publishedAt: "2026-08-07T00:00:00.000Z", viewCount: 1_000, likeCount: 20 });
    expect(sortSceneVideos([first, second], { query: "", sort: "recent" })[0].id).toBe("second");
    expect(sortSceneVideos([first, second], { query: "", sort: "most-viewed" })[0].id).toBe("second");
    expect(sortSceneVideos([first, second], { query: "", sort: "most-liked" })[0].id).toBe("first");
  });
});

describe("legacy Shorts adapter", () => {
  it("converts published video fixtures and identifies replay assets without exposing live Rooms", () => {
    const item = SHORTS_WALLS.replays.items[0];
    const adapted = sceneVideoFromShortsItem(item, { publishedAt: "2026-08-06T10:00:00.000Z" });

    expect(adapted.contentType).toBe("room-replay");
    expect(adapted.publicationState).toBe("published");
    expect(adapted.durationSeconds).toBeGreaterThan(0);
    expect(adapted.viewCount).toBeGreaterThan(0);
    expect(Object.keys(adapted)).not.toContain("isLive");

    const dj = sceneVideoFromShortsItem(SHORTS_WALLS["for-you"].items[0]);
    expect(dj.artistRoles).toContain("avatar_17");
  });

  it("parses media duration and localized compact view counts", () => {
    expect(parseSceneDuration("1:02:03")).toBe(3_723);
    expect(parseSceneDuration("3:48")).toBe(228);
    expect(parseSceneViewCount("1,2 k vues")).toBe(1_200);
    expect(parseSceneViewCount("2,4 M vues")).toBe(2_400_000);
  });

  it("uses the explicit publisher content type before legacy text inference", () => {
    const item = {
      ...SHORTS_WALLS["for-you"].items[0],
      title: "Une nuit avec le collectif",
      meta: "Rap · Paris",
      contentTypeLabel: "Documentaire" as const,
    };

    expect(sceneVideoFromShortsItem(item).contentType).toBe("documentary");
  });

  it("gives every Explorer style, city and content format coherent fixture results", () => {
    const catalog = ALL_SHORTS_VIDEOS.map((item) => sceneVideoFromShortsItem(item));
    const defaults = getSceneDefaultFilters();

    for (const { id } of SCENE_STYLE_OPTIONS) {
      const results = filterSceneVideos(catalog, { ...defaults, styles: [id] }, NOW);
      expect(results.length, `style ${id}`).toBeGreaterThan(0);
      expect(results.every((result) => result.styles.includes(id)), `style ${id}`).toBe(true);
    }

    const cities = [...new Set(catalog.map(({ city }) => city).filter(Boolean))] as string[];
    expect(cities.length).toBeGreaterThan(10);
    for (const city of cities) {
      const results = filterSceneVideos(catalog, { ...defaults, city }, NOW);
      expect(results.length, `ville ${city}`).toBeGreaterThan(0);
      expect(results.every((result) => result.city === city), `ville ${city}`).toBe(true);
    }

    for (const { id } of SCENE_CONTENT_TYPE_OPTIONS) {
      const results = filterSceneVideos(catalog, { ...defaults, contentTypes: [id] }, NOW);
      expect(results.length, `format ${id}`).toBeGreaterThan(0);
      expect(results.every((result) => result.contentType === id), `format ${id}`).toBe(true);
    }
  });

  it("maps one exact musical style per fixture without substring collisions", () => {
    const catalog = ALL_SHORTS_VIDEOS.map((item) => sceneVideoFromShortsItem(item));
    const trap = catalog.filter(({ styles }) => styles.includes("trap"));
    const neoClassical = catalog.filter(({ styles }) => styles.includes("neo-classical"));

    expect(catalog.every(({ styles }) => styles.length === 1)).toBe(true);
    expect(trap.length).toBeGreaterThan(0);
    expect(trap.every(({ styles }) => !styles.includes("rap"))).toBe(true);
    expect(neoClassical.length).toBeGreaterThan(0);
    expect(neoClassical.every(({ styles }) => !styles.includes("classical"))).toBe(true);
  });
});
