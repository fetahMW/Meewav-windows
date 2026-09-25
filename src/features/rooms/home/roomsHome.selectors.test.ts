import { describe, expect, it } from "vitest";
import { ROOMS_HOME_COLLECTIONS } from "./roomsHome.fixtures";
import {
  getRoomsHomeCollectionBySlug,
  getRoomsHomeCollectionItems,
  getRoomsHomeRailItems,
  getRoomsHomeRails,
} from "./roomsHome.selectors";

describe("Rooms home selectors", () => {
  it("builds exactly seven default rails with exactly ten cards each", () => {
    const rails = getRoomsHomeRails();

    expect(rails).toHaveLength(7);
    expect(rails.map(({ collection }) => collection.slug)).toEqual(
      ROOMS_HOME_COLLECTIONS.map(({ slug }) => slug),
    );
    expect(rails.every(({ items }) => items.length === 10)).toBe(true);
  });

  it("orders buzz and recommendation walls from their simulated scores", () => {
    const buzz = getRoomsHomeCollectionItems("buzz-maintenant");
    const recommendations = getRoomsHomeCollectionItems("pour-toi");

    for (let index = 1; index < buzz.length; index += 1) {
      expect(buzz[index - 1].buzzScore).toBeGreaterThanOrEqual(buzz[index].buzzScore);
    }
    for (let index = 1; index < recommendations.length; index += 1) {
      expect(recommendations[index - 1].recommendationScore)
        .toBeGreaterThanOrEqual(recommendations[index].recommendationScore);
    }
  });

  it("derives each editorial wall from the central room fields", () => {
    const followed = getRoomsHomeCollectionItems("artistes-en-room");
    const battles = getRoomsHomeCollectionItems("battles-qui-chauffent");
    const creations = getRoomsHomeCollectionItems("creations-collaborations");
    const learning = getRoomsHomeCollectionItems("apprendre-avec-les-artistes");
    const events = getRoomsHomeCollectionItems("grands-rendez-vous");

    expect(followed.every((room) => room.isFollowedHost && room.isJoinable)).toBe(true);
    expect(battles.every((room) => room.roomType === "cage")).toBe(true);
    expect(creations.every((room) => room.roomType === "wave" || room.roomType === "place")).toBe(true);
    expect(learning.every((room) => room.roomType === "classe")).toBe(true);
    expect(events.every((room) => room.roomType === "loge" || room.roomType === "scene")).toBe(true);
  });

  it("gives every Voir plus wall more content than its home rail", () => {
    for (const collection of ROOMS_HOME_COLLECTIONS) {
      expect(getRoomsHomeCollectionItems(collection.slug).length)
        .toBeGreaterThan(collection.homeLimit);
      expect(getRoomsHomeRailItems(collection.slug)).toHaveLength(collection.homeLimit);
    }
  });

  it("filters both home rails and collection walls by the true media format", () => {
    for (const collection of ROOMS_HOME_COLLECTIONS) {
      const verticalRail = getRoomsHomeRailItems(collection.slug, "vertical");
      const horizontalRail = getRoomsHomeRailItems(collection.slug, "horizontal");
      expect(verticalRail).toHaveLength(10);
      expect(horizontalRail).toHaveLength(10);
      expect(verticalRail.every(
        (room) => room.mediaFormat === "vertical",
      )).toBe(true);
      expect(horizontalRail.every(
        (room) => room.mediaFormat === "horizontal",
      )).toBe(true);
      expect(getRoomsHomeCollectionItems(collection.slug, "horizontal").every(
        (room) => room.mediaFormat === "horizontal",
      )).toBe(true);
    }
  });

  it("avoids visible duplicates between consecutive default rails", () => {
    const rails = getRoomsHomeRails();

    for (let index = 1; index < rails.length; index += 1) {
      const previousIds = new Set(rails[index - 1].items.map((room) => room.id));
      expect(rails[index].items.filter((room) => previousIds.has(room.id))).toHaveLength(0);
    }
  });

  it("returns safe empty results for an unknown collection route", () => {
    expect(getRoomsHomeCollectionBySlug("inconnue")).toBeUndefined();
    expect(getRoomsHomeCollectionItems("inconnue")).toEqual([]);
    expect(getRoomsHomeRailItems("inconnue")).toEqual([]);
  });
});
