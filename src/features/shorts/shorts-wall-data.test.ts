import { describe, expect, it } from "vitest";
import {
  SCENE_ARTIST_PORTRAITS,
  SCENE_DEMO_ARTIST_BY_NAME,
  SCENE_DEMO_ARTISTS,
} from "./sceneArtistPortraits";
import {
  ALL_SHORTS_VIDEOS,
  SHORTS_HOME_ORDER,
  SHORTS_WALL_MINIMUM,
  SHORTS_WALLS,
} from "./shorts-wall-data";

describe("La Scène discovery catalog", () => {
  it("provides seven complete discovery walls", () => {
    expect(SHORTS_HOME_ORDER).toHaveLength(7);
    expect(new Set(SHORTS_HOME_ORDER).size).toBe(7);

    for (const wallId of SHORTS_HOME_ORDER) {
      expect(SHORTS_WALLS[wallId].items.length).toBeGreaterThanOrEqual(SHORTS_WALL_MINIMUM);
    }
  });

  it("uses one unique thumbnail reference for every displayed card", () => {
    const imagePaths = ALL_SHORTS_VIDEOS.map((item) => item.image);

    expect(new Set(imagePaths).size).toBe(imagePaths.length);
    expect(imagePaths.every((imagePath) => imagePath.startsWith("/images/shorts/"))).toBe(true);
  });

  it("connects video cards to six compatible demos and keeps one audio visualizer", () => {
    const visualizerItems = ALL_SHORTS_VIDEOS.filter(
      (item) => item.presentationFormat === "audio_visualizer",
    );
    const videoItems = ALL_SHORTS_VIDEOS.filter(
      (item) => item.presentationFormat !== "audio_visualizer",
    );
    const videoPaths = [...new Set(videoItems.map((item) => item.video))];

    expect(videoPaths).toHaveLength(6);
    expect(videoPaths.every((videoPath) => videoPath.startsWith("/media/shorts-demo/"))).toBe(true);
    expect(visualizerItems).toHaveLength(1);
    expect(visualizerItems[0]).toMatchObject({
      audioUrl: "/media/profile-demo/vocal-session-audio.mp3",
      presentationFormat: "audio_visualizer",
      badge: "Audio + visualizer",
    });

    for (const item of videoItems) {
      expect(item.video).toContain(`/${item.format}-`);
    }

    expect(ALL_SHORTS_VIDEOS.filter((item) => item.format === "portrait").length)
      .toBeGreaterThanOrEqual(30);
    expect(ALL_SHORTS_VIDEOS.filter((item) => Boolean(item.secondaryVideo))).toHaveLength(1);
    expect(SHORTS_WALLS.collaborations.items[0]).toMatchObject({
      multicamLayout: "duo",
      presentationFormat: "landscape",
    });
  });

  it("uses a stable dedicated portrait for every artist instead of cropping the video poster", () => {
    const portraitByArtist = new Map<string, string>();

    for (const item of ALL_SHORTS_VIDEOS) {
      expect(item.artistPortrait).toBe(SCENE_ARTIST_PORTRAITS[item.artist as keyof typeof SCENE_ARTIST_PORTRAITS]);
      expect(item.artistPortrait).toMatch(/^\/images\/tremplin\//);
      expect(item.artistPortrait).not.toBe(item.image);

      const previousPortrait = portraitByArtist.get(item.artist);
      if (previousPortrait) expect(item.artistPortrait).toBe(previousPortrait);
      portraitByArtist.set(item.artist, item.artistPortrait ?? "");
    }

    expect(portraitByArtist.size).toBe(Object.keys(SCENE_ARTIST_PORTRAITS).length);
    expect(new Set(portraitByArtist.values()).size).toBe(portraitByArtist.size);
  });

  it("defines every demo artist once with a unique local portrait and identity", () => {
    expect(SCENE_DEMO_ARTISTS).toHaveLength(60);
    expect(new Set(SCENE_DEMO_ARTISTS.map(({ artistId }) => artistId)).size).toBe(60);
    expect(new Set(SCENE_DEMO_ARTISTS.map(({ name }) => name)).size).toBe(60);
    expect(new Set(SCENE_DEMO_ARTISTS.map(({ portrait }) => portrait)).size).toBe(60);

    for (const artist of SCENE_DEMO_ARTISTS) {
      expect(artist.portrait).toMatch(/^\/images\/tremplin\//);
      expect(artist.portrait).not.toMatch(/^\/images\/shorts\//);
      expect(artist.role.trim()).not.toBe("");
      expect(artist.style.trim()).not.toBe("");
      expect(artist.city.trim()).not.toBe("");
      expect(artist.gradeLevel).toBeGreaterThanOrEqual(1);
      expect(artist.gradeLevel).toBeLessThanOrEqual(6);
    }
  });

  it("uses the public Short vocabulary without overloading editorial badges", () => {
    expect(SHORTS_WALLS.vertical.title).toBe("Shorts");
    expect(SHORTS_WALLS.vertical.items.every((item) => item.badge === undefined)).toBe(true);
    expect(ALL_SHORTS_VIDEOS.every((item) => item.badge !== "Artiste IA")).toBe(true);
  });

  it("discloses the same six AI artist identities in portrait and desktop publications", () => {
    const expectedAiArtistIds = [
      "shorts-alya-flow",
      "shorts-mel-rose",
      "shorts-nael",
      "shorts-sacha-beat",
      "shorts-selma-k",
      "shorts-solen",
    ];
    const aiArtistIds = SCENE_DEMO_ARTISTS
      .filter(({ isAiArtist }) => isAiArtist)
      .map(({ artistId }) => artistId)
      .sort();

    expect(aiArtistIds).toEqual(expectedAiArtistIds);
    for (const item of ALL_SHORTS_VIDEOS) {
      expect(Boolean(item.isAiArtist)).toBe(expectedAiArtistIds.includes(item.artistId));
    }

    expect(SHORTS_WALLS.vertical.items[8]).toMatchObject({
      id: "vertical-09",
      artist: "SOLEN",
      isAiArtist: true,
    });
    expect(SHORTS_WALLS["for-you"].items[5]).toMatchObject({
      id: "for-you-06",
      artist: "SELMA K.",
      format: "landscape",
      isAiArtist: true,
    });
    expect(SHORTS_WALLS.trending.items[1]).toMatchObject({
      id: "trending-02",
      artist: "ALYA FLOW",
      isAiArtist: true,
    });
  });

  it("uses credible work titles for the headline and next-up queue", () => {
    const headlineTitles = SHORTS_WALLS.trending.items
      .slice(0, 4)
      .map((item) => item.title);

    expect(headlineTitles).toEqual([
      "Sous la lumière | MeeWav Session",
      "Sans filet (Live Session)",
      "Clair-obscur",
      "Lignes de fuite",
    ]);
    expect(headlineTitles.every((title) => title.length >= 10)).toBe(true);
  });

  it("keeps every occurrence attached to the canonical artist identity and publisher", () => {
    const normalizeIdentity = (value: string) => value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const identitySignatures = new Map<string, Set<string>>();

    for (const item of ALL_SHORTS_VIDEOS) {
      const canonical = SCENE_DEMO_ARTIST_BY_NAME[item.artist as keyof typeof SCENE_DEMO_ARTIST_BY_NAME];

      expect(canonical).toBeDefined();
      expect(item.artistId).toBe(canonical.artistId);
      expect(item.mockArtistId).toBe(item.artistId);
      expect(item.profileId).toBe(item.artistId);
      expect(item.artistId).toBe(`shorts-${normalizeIdentity(item.artist)}`);
      expect(item.artistPortrait).toBe(canonical.portrait);
      expect(item.artistPortrait).not.toBe(item.image);
      expect(item.role).toBe(canonical.role);
      expect(item.city).toBe(canonical.city);
      expect(item.gradeLevel).toBe(canonical.gradeLevel);
      expect(Boolean(item.isAiArtist)).toBe(Boolean(canonical.isAiArtist));
      expect(item.meta.startsWith(`${canonical.style} ·`)).toBe(true);
      expect(item.publisher).toEqual({
        type: "artist",
        artistId: canonical.artistId,
        name: canonical.name,
      });

      const signature = JSON.stringify({
        artistId: item.artistId,
        portrait: item.artistPortrait,
        role: item.role,
        city: item.city,
        style: item.meta.split(" · ")[0],
        gradeLevel: item.gradeLevel,
      });
      const signatures = identitySignatures.get(item.artist) ?? new Set<string>();
      signatures.add(signature);
      identitySignatures.set(item.artist, signatures);
    }

    expect([...identitySignatures.values()].every((signatures) => signatures.size === 1)).toBe(true);
    expect(identitySignatures.size).toBe(SCENE_DEMO_ARTISTS.length);
  });

  it("uses unique work titles without repeating the artist as an artificial prefix", () => {
    const normalize = (value: string) => value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const titleKeys = ALL_SHORTS_VIDEOS.map(({ title }) => normalize(title));

    expect(new Set(titleKeys).size).toBe(titleKeys.length);
    for (const item of ALL_SHORTS_VIDEOS) {
      expect(normalize(item.title).startsWith(`${normalize(item.artist)} `)).toBe(false);
      expect(item.title).not.toMatch(/à garder dans les favoris|ce détail change|du jour|sans artifice/i);
      expect(item.title.trim().length).toBeGreaterThanOrEqual(8);
    }
  });

  it("declares a real content format and never manufactures a style credit in titles", () => {
    expect(ALL_SHORTS_VIDEOS.every((item) => Boolean(item.contentTypeLabel))).toBe(true);
    expect(ALL_SHORTS_VIDEOS.every((item) => !/ · [^·]+$/.test(item.title))).toBe(true);
  });

  it("keeps live Rooms out of La Scène and exposes only artist-published replays", () => {
    const wallIds = SHORTS_HOME_ORDER as readonly string[];
    const replayWall = SHORTS_WALLS.replays;

    expect(wallIds).not.toContain("rooms");
    expect(wallIds).not.toContain("live");
    expect(replayWall.description).toContain("Le direct reste dans Rooms");
    expect(replayWall.description).toContain("publie son replay");
    expect(replayWall.description).toContain("rejoint La Scène");
    expect(replayWall.items.every((item) => item.badge === "Replay de Room")).toBe(true);
    expect(replayWall.items.every((item) => item.meta.endsWith("Replay de Room"))).toBe(true);
    expect(ALL_SHORTS_VIDEOS.every((item) => item.badge !== "En direct")).toBe(true);
  });
});
