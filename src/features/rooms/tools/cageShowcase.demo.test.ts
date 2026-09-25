import { expect, it } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";

it("requires preparation before backstage and stage, while queue returns preserve registration", () => {
  const state = createRoomToolsFixture("cage");
  initializeCageShowcase(state);
  const person = state.cage!.runtime!.participants[0];
  expect(() => moveCageDemoGuest(state, person.id, "backstage", "host")).toThrow("Green House");
  expect(() => moveCageDemoGuest(state, person.id, "onstage", "host")).toThrow("coulisses");
  moveCageDemoGuest(state, person.id, "accepted", "host");
  expect(person.status).toBe("GREENHOUSE");
  expect(Object.values(person.readiness).every(Boolean)).toBe(false);
  expect(() => moveCageDemoGuest(state, person.id, "backstage", "host")).toThrow("Green House");
  moveCageDemoGuest(state, person.id, "ready", "host");
  moveCageDemoGuest(state, person.id, "backstage", "host");
  person.seed = 3;
  moveCageDemoGuest(state, person.id, "accepted", "host");
  expect(person).toMatchObject({ status: "WAITING", guestStatus: "waiting", registered: true, seed: 3 });
  moveCageDemoGuest(state, person.id, "accepted", "host");
  moveCageDemoGuest(state, person.id, "ready", "host");
  moveCageDemoGuest(state, person.id, "backstage", "host");
  moveCageDemoGuest(state, person.id, "onstage", "host");
  expect(person.guestStatus).toBe("on_stage");
});
