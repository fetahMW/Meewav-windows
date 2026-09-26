import { expect, it } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";
import { applyCageCompetitionCommand } from "./cageCompetition";
import { DemoRoomToolsRepository } from "./roomTools.service";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";

it("requires preparation before backstage and stage, while queue returns preserve registration", () => {
  const state = createRoomToolsFixture("cage");
  initializeCageShowcase(state);
  const person = state.cage!.runtime!.participants[0];
  expect(() => moveCageDemoGuest(state, person.id, "backstage", "host")).toThrow("OBS MeeWav");
  expect(() => moveCageDemoGuest(state, person.id, "onstage", "host")).toThrow("coulisses");
  moveCageDemoGuest(state, person.id, "accepted", "host");
  expect(person.status).toBe("GREENHOUSE");
  expect(person.registered).toBe(true);
  expect(Object.values(person.readiness).every(Boolean)).toBe(false);
  expect(() => moveCageDemoGuest(state, person.id, "backstage", "host")).toThrow("OBS MeeWav");
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

it.each(["tournament", "open-mic"] as const)("makes simulated %s artists ready after preparation without putting them on stage", async format => {
  const repo = new DemoRoomToolsRepository();
  const roomId = `ready-${crypto.randomUUID()}`;
  let state = await repo.projectionForRole("cage", roomId, "host", "host");
  const people = state.cage!.runtime!.participants.slice(0, 2);
  for (const person of people) state = await repo.execute("cage", roomId, "host", { type: "cage.demo.guest.move", participantId: person.id, destination: "accepted" }, "host");
  const send = async (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => {
    const runtime = state.cage!.runtime!;
    const current = runtime.matches.find(match => match.id === runtime.activeMatchId);
    state = await repo.execute("cage", roomId, "host", { type: "cage.competition.command", action, payload, idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision, expectedMatchId: current?.id, expectedStepIndex: current?.stepIndex, expectedEntryId: runtime.activeEntryId ?? undefined }, "host");
  };
  await send("competition.configure", { format, participantCount: 2 });
  if (format === "open-mic") {
    await send("openmic.schedule", { participantIds: people.map(person => person.id) });
    await send("openmic.prepare");
    expect(state.cage!.runtime!.openMicEntries![0].status).toBe("READY");
  } else {
    await send("roster.select", { participantIds: people.map(person => person.id) });
    await send("bracket.generate", { mode: "manual" });
    await send("bracket.lock");
    await send("regie.prepare");
    expect(state.cage!.runtime!.matches[0].status).toBe("READY");
    expect(state.cage!.runtime!.participants.filter(person => people.some(item => item.id === person.id)).every(person => Object.values(person.readiness).every(Boolean))).toBe(true);
  }
  expect(state.cage!.runtime!.participants.some(person => person.guestStatus === "on_stage")).toBe(false);
  await send(format === "open-mic" ? "openmic.promote" : "regie.promote");
  await send(format === "open-mic" ? "openmic.start" : "match.start");
  expect(format === "open-mic" ? state.cage!.runtime!.openMicEntries![0].status : state.cage!.runtime!.matches[0].status).toBe("IN_PROGRESS");
});

it("unblocks a previously saved simulated tournament on reload, without changing the real readiness reducer", async () => {
  const state = createRoomToolsFixture("cage", `resume-ready-${crypto.randomUUID()}`);
  initializeCageShowcase(state);
  const people = state.cage!.runtime!.participants.slice(0, 2);
  for (const person of people) moveCageDemoGuest(state, person.id, "accepted", "host");
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => {
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload, idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision }, "host");
    state.revision++;
  };
  run("competition.configure", { format: "tournament", participantCount: 2 });
  run("roster.select", { participantIds: people.map(person => person.id) });
  run("bracket.generate", { mode: "manual" });
  run("bracket.lock");
  run("regie.prepare");
  expect(state.cage!.runtime!.matches[0].status).toBe("GREENHOUSE");
  expect(() => run("regie.promote")).toThrow("cage_pair_not_ready");
  localStorage.setItem(`meewav:cage:competition:v1:${state.roomId}`, JSON.stringify(state));
  const repo = new DemoRoomToolsRepository();
  const resumed = await repo.projectionForRole("cage", state.roomId, "host", "host");
  expect(resumed.cage!.runtime!.matches[0].status).toBe("READY");
  expect(resumed.cage!.runtime!.matches[0].id).toBe(state.cage!.runtime!.matches[0].id);
  expect(resumed.cage!.runtime!.participants.some(person => person.guestStatus === "on_stage")).toBe(false);
  expect((await repo.projectionForRole("cage", state.roomId, "host", "host")).revision).toBe(resumed.revision);
});
