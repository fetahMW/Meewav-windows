import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { applyCageCompetitionCommand, cageBattleWinCount, cageRosterCandidate } from "./cageCompetition";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import CageCompetitionWorkspace, { CageCommandBar } from "./panels/CageCompetitionWorkspace";

import { CageStageProgramView } from "../place/CageStageProgram";
import { createPlaceDemoState } from "../place/place.fixtures";
import { projectCageDemoGuests } from "./cageGuestProjection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const state = createRoomToolsFixture("cage", "battle-flow-" + crypto.randomUUID());
  initializeCageShowcase(state);
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}, actorId = "host") => {
    const runtime = state.cage!.runtime!;
    const active = runtime.matches.find(match => match.id === runtime.activeMatchId);
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload,
      idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision,
      expectedMatchId: active?.id, expectedStepIndex: active?.stepIndex }, actorId);
    state.revision++;
  };
  run("competition.configure", { format: "open-mic-battle", participantCount: 16 });
  return { state, run, runtime: () => state.cage!.runtime! };
}

it("selects waiting guests directly, preserves media readiness and applies four ordered artists under a capacity of sixteen", async () => {
  const { runtime, run } = setup();
  const before = structuredClone(runtime().participants.map(person => person.readiness));
  const send = vi.fn(async (action: CageCompetitionAction, payload?: CageCompetitionPayload) => { run(action, payload); return true; });
  const props = () => ({ runtime: runtime(), disabled: false, isControl: true, accountId: "host", send, onView: vi.fn(), view: "bracket" as const });
  const view = () => <><CageCompetitionWorkspace {...props()} /><CageCommandBar {...props()} /></>;
  const ui = render(view());
  expect(screen.queryByText("Placement manuel")).toBeNull();
  expect(screen.queryByText("Voir le programme")).toBeNull();
  expect(screen.getByRole("button", { name: "Appliquer le placement" }).hasAttribute("disabled")).toBe(true);
  for (let index = 0; index < 4; index++) {
    fireEvent.click(screen.getAllByRole("checkbox")[index]);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(index + 1));
    ui.rerender(view());
  }
  expect(runtime().participants.map(person => person.readiness)).toEqual(before);
  const ids = runtime().participants.filter(person => person.seed !== null).map(person => person.id);
  run("roster.move", { participantId: ids[3], toSeed: 1 });
  ui.rerender(view());
  expect(screen.getByRole("button", { name: "Appliquer le placement" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Appliquer le placement" }));
  await waitFor(() => expect(runtime().matches).toHaveLength(3));
  ui.rerender(view());
  expect(runtime().matches[0]).toMatchObject({ participantAId: ids[3], participantBId: ids[0] });
  expect(runtime().config.participantCount).toBe(16);
  expect(screen.getByRole("button", { name: "Préparer le premier duel" }).hasAttribute("disabled")).toBe(false);
});

it.each(["A", "B"] as const)("drives the complete battle with side %s winning and displays the recorded crown count", async (choice) => {
  const { state, runtime, run } = setup();
  const ids = runtime().participants.slice(0, 4).map(person => person.id);
  for (const id of ids) { moveCageDemoGuest(state, id, "accepted", "host"); moveCageDemoGuest(state, id, "ready", "host"); }
  run("roster.select", { participantIds: ids });
  const openGuests = vi.fn();
  const send = vi.fn(async (action: CageCompetitionAction, payload?: CageCompetitionPayload) => { run(action, payload); return true; });
  const view = () => <CageCommandBar runtime={runtime()} disabled={false} isControl accountId="host" send={send} onView={() => {}} onOpenGuests={openGuests} view="bracket" />;
  const ui = render(view());
  for (let index = 0; runtime().status !== "COMPLETED" && index < 80; index++) {
    const active = runtime().matches.find(match => match.id === runtime().activeMatchId);
    if (active?.vote?.open) run("vote.cast", { choice }, "spectator");
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled"), button.textContent ?? "").toBe(false);
    const count = send.mock.calls.length;
    fireEvent.click(button);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(count + 1));
    if (active?.status === "RESOLVED") {
      expect(runtime().participants.find(person => person.id === active.winnerId)?.guestStatus).toBe("on_stage");
      const loserId = active.winnerId === active.participantAId ? active.participantBId : active.participantAId;
      expect(runtime().participants.find(person => person.id === loserId)?.guestStatus).toBe("audience");
    }
    ui.rerender(view());
  }
  expect(runtime().status).toBe("COMPLETED");
  expect(runtime().matches.map(match => match.winnerId)).toEqual(choice === "A" ? [ids[0], ids[0], ids[0]] : ids.slice(1));
  const winnerId = choice === "A" ? ids[0] : ids[3];
  const wins = choice === "A" ? 3 : 1;
  expect(cageBattleWinCount(runtime(), winnerId)).toBe(wins);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const room = projectCageDemoGuests(createPlaceDemoState(), runtime());
  const stage = render(<CageStageProgramView cage={state.cage!} room={room} onStage={room.participants.filter(person => person.status === "onstage")} liveKitVideoTracks={[]} useRtcVideo={false} programMuted onOpenProfile={() => {}} />);
  const badge = stage.container.querySelector(".cage-stage-feed__battle-wins");
  expect(badge?.textContent).toBe(String(wins));
  expect(badge?.getAttribute("aria-label")).toContain(wins + " duel");
  expect(stage.container.querySelectorAll(".cage-stage-feed__battle-wins")).toHaveLength(1);
  expect(openGuests).not.toHaveBeenCalled();
});

it("keeps an unready artist off stage and requires at least two artists", () => {
  const { runtime, run } = setup();
  const ids = runtime().participants.slice(0, 2).map(person => person.id);
  run("roster.select", { participantIds: [ids[0]] });
  expect(() => run("bracket.generate", { mode: "manual" })).toThrow("cage_not_enough_participants");
  run("roster.select", { participantIds: [ids[1]] });
  runtime().participants[0].readiness.permissions = false;
  run("bracket.generate", { mode: "manual" });
  run("bracket.lock");
  expect(runtime().preparedMatchId).toBe(runtime().matches[0].id);
  expect(() => run("regie.promote")).toThrow("cage_pair_not_ready");
  expect(runtime().participants.some(person => person.guestStatus === "on_stage")).toBe(false);
});

it("keeps tournament capacity rules and does not treat an unregistered live participant as eligible", () => {
  const { state, runtime, run } = setup();
  runtime().journal = [];
  expect(cageRosterCandidate(runtime(), runtime().participants[0])).toBe(false);
  expect(() => run("roster.select", { participantIds: [runtime().participants[0].id] })).toThrow("cage_participant_unavailable");
  run("competition.configure", { format: "tournament", participantCount: 16 });
  expect(cageBattleWinCount(runtime(), runtime().participants[0].id)).toBe(0);
  const ids = runtime().participants.slice(0, 4).map(person => person.id);
  for (const id of ids) { moveCageDemoGuest(state, id, "accepted", "host"); moveCageDemoGuest(state, id, "ready", "host"); }
  run("roster.select", { participantIds: ids });
  expect(() => run("bracket.generate", { mode: "manual" })).toThrow("cage_not_enough_participants");
});
