import { cageResults } from "./cageResults";
import CageResults from "./panels/CageResults";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { applyCageCompetitionCommand, cageCanConfigure } from "./cageCompetition";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { DemoRoomToolsRepository, commandAllowed } from "./roomTools.service";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import { CageCommandBar } from "./panels/CageCompetitionWorkspace";
import CagePresentationControls from "./panels/CagePresentationControls";

afterEach(cleanup);
function setup(count = 4) {
  const state = createRoomToolsFixture("cage", `modes-${crypto.randomUUID()}`);
  initializeCageShowcase(state);
  state.cage!.runtime!.participants.slice(0, count).forEach((person) => {
    moveCageDemoGuest(state, person.id, "accepted", "host");
    moveCageDemoGuest(state, person.id, "ready", "host");
  });
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => {
    const runtime = state.cage!.runtime!;
    const current = runtime.matches.find((match) => match.id === runtime.activeMatchId);
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload, idempotencyKey: crypto.randomUUID(),
      expectedRevision: state.revision, expectedMatchId: current?.id, expectedStepIndex: current?.stepIndex,
      expectedEntryId: payload.entryId ?? runtime.activeEntryId ?? undefined }, "host");
    state.revision++;
  };
  return { state, run };
}

it("preserves guests and readiness when changing format, asks before replacing a draw, and rejects stale commands", () => {
  const { state, run } = setup();
  run("competition.configure", { format: "tournament", participantCount: 4 });
  run("bracket.generate", { mode: "random" });
  const selected = state.cage!.runtime!.participants.filter((person) => person.seed !== null).sort((a,b) => a.seed! - b.seed!).map((person) => person.id);
  const people = structuredClone(state.cage!.runtime!.participants);
  expect(() => run("competition.configure", { format: "open-mic" })).toThrow("confirmation");
  run("competition.configure", { format: "open-mic", confirmReset: true });
  const runtime = state.cage!.runtime!;
  expect(runtime.openMicEntries?.map((entry) => entry.participantId)).toEqual(selected);
  expect(state.cage!.matches).toEqual([]);
  expect(runtime.participants.map((person) => [person.id, person.guestStatus, person.readiness])).toEqual(people.map((person) => [person.id, person.guestStatus, person.readiness]));
  expect(() => applyCageCompetitionCommand(state, { type: "cage.competition.command", action: "competition.configure", payload: {format: "championship", confirmReset: true}, expectedRevision: state.revision-1, idempotencyKey: crypto.randomUUID() }, "host")).toThrow("revision_conflict");
});

it.each((["tournament", "championship", "open-mic"] as const).flatMap(format => [2, 4, 8, 16].map(count => ({ format, count }))))("drives an entire $format with $count artists using the shared primary CTA and persists its projection", async ({ format, count }) => {
  const { state, run } = setup(count);
  run("competition.configure", { format, participantCount: count, openMicFeedback: "appreciation" });
  if (format !== "open-mic") run("bracket.generate", { mode: "random" });
  else run("openmic.schedule", { participantIds: state.cage!.runtime!.participants.filter(person => person.registered).map(person => person.id) });
  const send = vi.fn(async (action: CageCompetitionAction, payload?: CageCompetitionPayload) => { run(action, payload); return true; });
  const showResults = vi.fn();
  const view = () => <CageCommandBar onResults={showResults} runtime={state.cage!.runtime!} disabled={false} isControl view="bracket" accountId="host" send={send} onView={() => {}} onOpenGuests={() => {}} />;
  const rendered = render(view());
  let commands = 0;
  const commandLimit = Math.max(100, count * count * 20);
  while (state.cage!.runtime!.status !== "COMPLETED" && commands < commandLimit) {
    const runtime = state.cage!.runtime!;
    const active = runtime.matches.find((match) => match.id === runtime.activeMatchId);
    // A real audience ballot, not an invented result or a direct winner patch.
    if (active?.vote?.open) {
      applyCageCompetitionCommand(state, {type:"cage.competition.command",action:"vote.cast", payload:{choice:"A"},idempotencyKey:crypto.randomUUID(),expectedRevision:state.revision,expectedMatchId:active.id}, "viewer");
      state.revision++;
    }
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled"), button.textContent ?? "").toBe(false);
    const before = send.mock.calls.length;
    fireEvent.click(button);
    await waitFor(() => expect(send.mock.calls.length).toBe(before+1));
    commands++;
    rendered.rerender(view());
  }
  const runtime = state.cage!.runtime!;
  expect(runtime.status).toBe("COMPLETED");
  expect(commands).toBeLessThan(commandLimit);
  if (format === "championship") {
    expect(runtime.matches).toHaveLength(count * (count - 1) / 2);
    expect(runtime.participants.filter((person) => person.seed !== null).every((person) => person.status === "SELECTED")).toBe(true);
  } else if (format === "tournament") expect(runtime.matches).toHaveLength(count - 1);
  else expect(runtime.openMicEntries?.every((entry) => entry.status === "PERFORMED" && entry.feedback?.closedAt)).toBe(true);
  fireEvent.click(screen.getByRole("button", {name:"Voir les résultats"}));
  expect(showResults).toHaveBeenCalledOnce();
  const ranking = cageResults(runtime);
  expect(ranking).toHaveLength(count);
  if (format === "tournament") expect(ranking.slice(0, 2).map(row=>row.rank)).toEqual([1, 2]);
  if (format === "tournament" && count === 4) expect(ranking.map(row=>row.rank)).toEqual([1,2,3,3]);
  rendered.unmount();
  render(<CageResults runtime={runtime} send={send}/>);
  fireEvent.click(screen.getByRole("button",{name:"Publier au public"}));
  await waitFor(()=>expect(state.cage!.runtime!.publicResults).toEqual({matchId:null}));
  expect(screen.getByLabelText("Podium")).toBeDefined();
  const portraits=screen.getAllByRole("img");
  expect(portraits.some(img=>img.getAttribute("src")===ranking[0].person.avatarUrl)).toBe(true);
  localStorage.setItem(`meewav:cage:competition:v1:${state.roomId}`, JSON.stringify(state));
  const reloaded = await new DemoRoomToolsRepository().projectionForRole("cage", state.roomId, "host", "host");
  expect(reloaded.cage!.runtime!.config.format).toBe(format);
  expect(reloaded.cage!.runtime!.status).toBe("COMPLETED");
  const audience = await new DemoRoomToolsRepository().projectionForRole("cage",state.roomId,"viewer","viewer");
  expect(audience.cage!.runtime!.publicResults).toEqual({matchId:null});
  expect(cageResults(audience.cage!.runtime!).map(row=>[row.person.id,row.rank])).toEqual(ranking.map(row=>[row.person.id,row.rank]));
}, 60000);

it("keeps a competition change host-only and prevents interruption of the on-air pair", () => {
  const { state, run } = setup();
  run("competition.configure", { format: "championship", participantCount: 4 });
  run("bracket.generate", { mode: "random" }); run("bracket.lock");
  const first = state.cage!.runtime!.matches[0];
  run("regie.prepare", {matchId:first.id}); run("regie.promote", {matchId:first.id});
  expect(cageCanConfigure(state.cage!.runtime!)).toBe(false);
  expect(() => run("competition.configure", {format:"open-mic", confirmReset:true})).toThrow("format_change_active");
  const command = {type:"cage.competition.command",action:"competition.configure",expectedRevision:0,idempotencyKey:"mode"} as const;
  expect(commandAllowed("cage", "host", command)).toBe(true);
  expect(commandAllowed("cage", "viewer", command)).toBe(false);
  expect(commandAllowed("cage", "competitor", command)).toBe(false);
});

it("offers the three modes and confirms replacement of an existing program", async () => {
  const { state, run } = setup();
  run("competition.configure", {format:"tournament",participantCount:4}); run("bracket.generate", {mode:"random"});
  const send = vi.fn(async () => true);
  render(<CagePresentationControls runtime={state.cage!.runtime!} demo busy={false} send={send} onConfigured={()=>{}}/>);
  fireEvent.click(screen.getByRole("button", {name:"Mode"}));
  fireEvent.click(screen.getByRole("button", {name:"Championnat"}));
  fireEvent.click(screen.getByRole("button", {name:"Préparer le championnat"}));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Confirmer le nouveau programme"}));
  await waitFor(()=>expect(send).toHaveBeenCalledWith("competition.configure", expect.objectContaining({format:"championship",participantCount:4,confirmReset:true})));
});
