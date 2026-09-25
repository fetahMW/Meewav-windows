import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOMS_HOME_CATALOG, ROOMS_HOME_COLLECTIONS } from "./roomsHome.fixtures";
import { ROOMS_HOME_ROOM_TYPES } from "./roomsHome.types";

describe("Rooms home fixtures", () => {
  it("defines the seven requested collections in their home order", () => {
    expect(ROOMS_HOME_COLLECTIONS.map(({ title }) => title)).toEqual([
      "Ça fait le buzz maintenant",
      "Pour toi",
      "Tes artistes sont en Room",
      "Battles qui chauffent",
      "Créations & collaborations en direct",
      "Apprendre avec les artistes",
      "Les grands rendez-vous",
    ]);
    expect(ROOMS_HOME_COLLECTIONS).toHaveLength(7);
    expect(ROOMS_HOME_COLLECTIONS.every(({ homeLimit }) => homeLimit === 10)).toBe(true);
    expect(ROOMS_HOME_COLLECTIONS[0].cardSize).toBe("featured");
    expect(ROOMS_HOME_COLLECTIONS.slice(1).every(({ cardSize }) => cardSize === "compact")).toBe(true);
  });

  it("provides a rich deterministic catalog with every required room field", () => {
    expect(ROOMS_HOME_CATALOG.length).toBeGreaterThan(70);

    for (const room of ROOMS_HOME_CATALOG) {
      expect(room).toEqual(expect.objectContaining({
        id: expect.any(String),
        slug: expect.any(String),
        title: expect.any(String),
        roomType: expect.any(String),
        hostId: expect.any(String),
        hostName: expect.any(String),
        hostAvatar: expect.any(String),
        hostRole: expect.any(String),
        musicStyle: expect.any(String),
        thumbnail: expect.any(String),
        videoSource: expect.any(String),
        mediaFormat: expect.stringMatching(/^(horizontal|vertical)$/),
        viewerCount: expect.any(Number),
        buzzScore: expect.any(Number),
        recommendationScore: expect.any(Number),
        engagementScore: expect.any(Number),
        language: expect.any(String),
        country: expect.any(String),
        tags: expect.any(Array),
        startedAt: expect.any(String),
        isFollowedHost: expect.any(Boolean),
        accessType: expect.any(String),
        isJoinable: true,
      }));
      expect(Number.isNaN(Date.parse(room.startedAt))).toBe(false);
      expect(room.viewerCount).toBeGreaterThan(0);
      expect(room.buzzScore).toBeGreaterThanOrEqual(0);
      expect(room.buzzScore).toBeLessThanOrEqual(100);
      expect(room.recommendationScore).toBeGreaterThanOrEqual(0);
      expect(room.recommendationScore).toBeLessThanOrEqual(100);
      expect(room.engagementScore).toBeGreaterThanOrEqual(0);
      expect(room.engagementScore).toBeLessThanOrEqual(100);
    }
  });

  it("keeps identifiers and real local posters unique and stable", () => {
    const ids = ROOMS_HOME_CATALOG.map(({ id }) => id);
    const slugs = ROOMS_HOME_CATALOG.map(({ slug }) => slug);
    const thumbnails = ROOMS_HOME_CATALOG.map(({ thumbnail }) => thumbnail);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(thumbnails).size).toBeGreaterThanOrEqual(100);

    for (const room of ROOMS_HOME_CATALOG) {
      expect(room.thumbnail).toMatch(/^\/images\/shorts\//);
      expect(room.hostAvatar).toMatch(/^\/images\/tremplin\//);
      expect(room.thumbnail).toMatch(/\.webp$/);
      expect(room.hostAvatar).toMatch(/\.webp$/);
      expect(room.videoSource).toMatch(/\.mp4$/);
      expect(existsSync(resolve(process.cwd(), "public", room.thumbnail.slice(1)))).toBe(true);
      expect(existsSync(resolve(process.cwd(), "public", room.hostAvatar.slice(1)))).toBe(true);
      expect(existsSync(resolve(process.cwd(), "public", room.videoSource.slice(1)))).toBe(true);
    }
  });

  it("contains enough live rooms of every type and both media formats", () => {
    for (const roomType of ROOMS_HOME_ROOM_TYPES) {
      const national = ROOMS_HOME_CATALOG.filter((room) => room.roomType === roomType);
      expect(national).toHaveLength(48);
      expect(national.every((room) => room.country === "FR" && room.city)).toBe(true);
      expect(national.filter((room) => room.mediaFormat === "vertical")).toHaveLength(24);
      expect(ROOMS_HOME_CATALOG.filter((room) => room.roomType === roomType).length)
        .toBeGreaterThan(10);
    }

    expect(ROOMS_HOME_CATALOG.filter((room) => room.mediaFormat === "vertical").length)
      .toBeGreaterThan(20);
    expect(ROOMS_HOME_CATALOG.filter((room) => room.mediaFormat === "horizontal").length)
      .toBeGreaterThan(40);
    expect(ROOMS_HOME_CATALOG.filter((room) => room.isFollowedHost).length)
      .toBeGreaterThan(20);
    expect(ROOMS_HOME_CATALOG.every((room) => room.isJoinable)).toBe(true);
  });
});
