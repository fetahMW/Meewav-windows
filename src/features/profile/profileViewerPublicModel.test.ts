import { describe, expect, it } from "vitest";
import {
  canAccessPublicProfileStats,
  resolvePublicProfileViewerFixture,
  type PublicProfileFixtureSeed,
} from "./profileViewerPublicModel";

const baseSeed: PublicProfileFixtureSeed = {
  profileId: "miko-reve",
  name: "Miko Rêve",
  grade: 3,
  role: "Productrice · Hyperpop",
  location: "Paris · Île-de-France",
  registrationStatus: "registered",
  statsPublished: true,
};

describe("public profile viewer model", () => {
  it("keeps grade 1 outside registration and public statistics", () => {
    const fixture = resolvePublicProfileViewerFixture({
      ...baseSeed,
      profileId: "premier-parcours",
      grade: 1,
      registrationStatus: "not_registered",
    });

    expect(fixture.registrationStatus).toBe("not_registered");
    expect(fixture.canViewStats).toBe(false);
    expect(fixture.stats).toBeNull();
    expect(fixture.nextRoom).toBeNull();
    expect(fixture.marketplaceListings).toEqual([]);
    expect(canAccessPublicProfileStats(1, "not_registered")).toBe(false);
  });

  it.each([2, 3, 4, 5, 6] as const)(
    "registers grade %s and exposes public, non-transactional stats",
    (grade) => {
      const fixture = resolvePublicProfileViewerFixture({
        ...baseSeed,
        profileId: `paris-grade-${grade}`,
        grade,
      });

      expect(fixture.registrationStatus).toBe("registered");
      expect(fixture.canViewStats).toBe(true);
      expect(fixture.stats).not.toBeNull();
      expect(canAccessPublicProfileStats(grade, "registered")).toBe(true);
      expect(canAccessPublicProfileStats(grade, "not_registered")).toBe(false);
    },
  );

  it("is deterministic for an identical public seed", () => {
    const first = resolvePublicProfileViewerFixture(baseSeed);
    const second = resolvePublicProfileViewerFixture({ ...baseSeed });

    expect(second).toEqual(first);
  });

  it("requires published aggregates independently from grade and registration", () => {
    const fixture = resolvePublicProfileViewerFixture({
      ...baseSeed,
      grade: 5,
      registrationStatus: "registered",
      statsPublished: false,
    });

    expect(fixture.canViewStats).toBe(false);
    expect(fixture.stats).toBeNull();
    expect(canAccessPublicProfileStats(5, "registered", false)).toBe(false);
  });

  it("only exposes price and 24-hour variation for an active token", () => {
    const active = resolvePublicProfileViewerFixture({ ...baseSeed, grade: 4 }).token;
    const inactive = resolvePublicProfileViewerFixture({ ...baseSeed, grade: 2 }).token;

    expect(active.status).toBe("active");
    expect(active).toHaveProperty("currentValueMinor");
    expect(active).toHaveProperty("change24hBasisPoints");
    expect(inactive.status).toBe("eligible");
    expect(inactive).not.toHaveProperty("currentValueMinor");
    expect(inactive).not.toHaveProperty("change24hBasisPoints");
  });

  it("builds a rich Paris variant from local media within the requested limits", () => {
    const fixture = resolvePublicProfileViewerFixture(baseSeed);
    const audioSources = fixture.media.audios.map((item) => item.sourceUrl).sort();

    expect(fixture.isRichVariant).toBe(true);
    expect(fixture.editorialImageUrl).toBe(
      "/images/profile-viewer/paris-singer-producer-studio-v1.webp",
    );
    expect(fixture.media.videos.length).toBeGreaterThanOrEqual(5);
    expect(fixture.media.videos.length).toBeLessThanOrEqual(6);
    expect(fixture.media.audios.length).toBeLessThanOrEqual(4);
    expect(audioSources).toHaveLength(4);
    expect(audioSources).toContain("/media/preprofile-demo/hazy-after-hours.mp3");
    expect(audioSources).toContain("/media/preprofile-demo/tech-house-vibes.mp3");
    expect(audioSources).toContain("/media/profile-demo/guitar-session-audio.mp3");
    expect(audioSources).toContain("/media/profile-demo/vocal-session-audio.mp3");
    expect(fixture.media.audios.every((item) => (
      item.title.includes("démonstration")
      && item.creditLabel.includes("non attribué")
    ))).toBe(true);
  });

  it("contains a project, milestones, room and Marketplace listing but no private payload", () => {
    const fixture = resolvePublicProfileViewerFixture({ ...baseSeed, grade: 4 });
    const publicKeys = new Set<string>();
    const collectKeys = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      Object.entries(value).forEach(([key, child]) => {
        publicKeys.add(key.toLocaleLowerCase("fr-FR"));
        collectKeys(child);
      });
    };
    collectKeys(fixture);

    expect(fixture.project.milestones).toHaveLength(3);
    expect(fixture.nextRoom?.access).toBe("free");
    expect(fixture.marketplaceListings).toHaveLength(1);
    expect(fixture.marketplaceListings[0]?.href).toBe("/market");
    expect(publicKeys).not.toContain("email");
    expect(publicKeys).not.toContain("wallet");
    expect(publicKeys).not.toContain("transactions");
    expect(publicKeys).not.toContain("purchasehistory");
  });
});
