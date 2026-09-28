import { describe, expect, it } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import { createRoomsHomeDemoState } from "../home/roomsHome.fixtureAdapter";
import { ROOMS_HOME_CATALOG } from "../home/roomsHome.fixtures";

describe("Loge viewer demonstration arrival", () => {
  const viewerId = PLACE_DEMO_PROFILES.viewerA.id;
  it("starts at the welcome without inventing a request", () => {
    expect(createPlaceDemoState(viewerId, "loge").queue.some(person => person.profile.id === viewerId)).toBe(false);
  });
  it("keeps the same welcome when arriving from a home card", () => {
    const card = ROOMS_HOME_CATALOG.find(room => room.roomType === "loge")!;
    expect(createRoomsHomeDemoState(card, viewerId).queue.some(person => person.profile.id === viewerId)).toBe(false);
  });
  it("preserves host moderation fixtures and other room scenarios", () => {
    expect(createPlaceDemoState(PLACE_DEMO_PROFILES.host.id, "loge").queue.some(person => person.profile.id === viewerId)).toBe(true);
    expect(createPlaceDemoState(viewerId, "place").queue.some(person => person.profile.id === viewerId)).toBe(true);
  });
});
