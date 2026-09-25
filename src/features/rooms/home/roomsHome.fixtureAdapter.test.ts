import { describe, expect, it } from "vitest";
import { PLACE_DEMO_PROFILES } from "../place/place.fixtures";
import { ROOMS_HOME_CATALOG } from "./roomsHome.fixtures";
import { createRoomsHomeDemoState } from "./roomsHome.fixtureAdapter";

describe("createRoomsHomeDemoState", () => {
  it("opens every room category with only its host on stage", () => {
    for (const selected of ROOMS_HOME_CATALOG) {
      const room = createRoomsHomeDemoState(selected, PLACE_DEMO_PROFILES.viewerA.id);
      const stage = room.participants.filter(p => p.status === "host" || p.status === "onstage");
      expect(stage).toHaveLength(1);
      expect(stage[0].profile.id).toBe(room.host.id);
    }
  });
  it("preserves the identity of the selected accueil Room", () => {
    const selected = ROOMS_HOME_CATALOG[17];
    const room = createRoomsHomeDemoState(selected);

    expect(room.id).toBe(selected.id);
    expect(room.title).toBe(selected.title);
    expect(room.host.id).toBe(selected.hostId);
    expect(room.host.displayName).toBe(selected.hostName);
    expect(room.participantsCount).toBe(selected.viewerCount);
    expect(room.participants.find((participant) => participant.status === "host")?.imageUrl)
      .toBe(selected.thumbnail);
  });

  it("keeps a viewer identity distinct from the selected Room host", () => {
    const selected = ROOMS_HOME_CATALOG.find((room) => room.roomType === "place")
      ?? ROOMS_HOME_CATALOG[0];
    const room = createRoomsHomeDemoState(selected, PLACE_DEMO_PROFILES.viewerA.id);

    expect(room.host.id).toBe(selected.hostId);
    expect(room.currentUserProfile?.id).toBe(PLACE_DEMO_PROFILES.viewerA.id);
    expect(room.currentUserProfile?.id).not.toBe(room.host.id);
  });
});
