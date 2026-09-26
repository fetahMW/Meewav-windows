import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyCageCompetitionCommand } from "./cageCompetition";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";
import type { CageCompetitionAction, CageCompetitionConfig, CageCompetitionPayload } from "./cageCompetition.types";
import CageCompetitionWorkspace, { CageCommandBar } from "./panels/CageCompetitionWorkspace";

afterEach(cleanup);

function setup(format: CageCompetitionConfig["format"], guests = 4, capacity = 4) {
  const state = createRoomToolsFixture("cage", `prepare-${crypto.randomUUID()}`);
  initializeCageShowcase(state);
  state.cage!.runtime!.participants.slice(0, guests).forEach(person => moveCageDemoGuest(state, person.id, "accepted", "host"));
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => {
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload, expectedRevision: state.revision,
      expectedEntryId: payload.entryId, idempotencyKey: crypto.randomUUID() }, "host");
    state.revision++;
  };
  run("competition.configure", { format, participantCount: capacity });
  const send = vi.fn(async (action: CageCompetitionAction, payload?: CageCompetitionPayload) => { run(action, payload); return true; });
  const onOpenGuests = vi.fn();
  const onView = vi.fn();
  const runtime = () => state.cage!.runtime!;
  const view = () => <><CageCompetitionWorkspace runtime={runtime()} view="bracket" isControl disabled={false} accountId="host" send={send} onView={onView} onOpenGuests={onOpenGuests} />
    <CageCommandBar runtime={runtime()} view="bracket" isControl disabled={false} accountId="host" send={send} onView={onView} onOpenGuests={onOpenGuests} /></>;
  const ui = render(view());
  const refresh = () => ui.rerender(view());
  const choose = async (name: string) => {
    const calls = send.mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox", { name: `Sélectionner ${name}` }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(calls + 1));
    refresh();
  };
  return { runtime, send, onOpenGuests, onView, refresh, choose };
}

it.each(["tournament", "open-mic"] as const)("bulk-selects 8, 16 or all artists in %s with one command and allows individual deselection", async format => {
  const { runtime, send, refresh, choose } = setup(format, 20, 32);
  const people = runtime().participants.filter(person => person.registered);
  expect(people.length).toBeGreaterThanOrEqual(16);
  for (const [label, total] of [["8 premiers", 8], ["16 premiers", 16], ["Tout", people.length]] as const) {
    const calls = send.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(calls + 1));
    refresh();
    expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(total);
  }
  await choose(people[3].person.name);
  expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(people.length - 1);
  fireEvent.click(screen.getByRole("button", { name: "Tout" }));
  await waitFor(() => expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(people.length));
  expect(runtime().participants.some(person => person.guestStatus === "on_stage")).toBe(false);
});

it("keeps previous choices when selecting filtered artists and never exceeds the room capacity", async () => {
  const { runtime, send, refresh, choose } = setup("tournament", 20, 8);
  const people = runtime().participants.filter(person => person.registered);
  await choose(people[0].person.name);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: people[9].person.name } });
  fireEvent.click(screen.getByRole("button", { name: "Tout" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  refresh();
  expect(runtime().participants.filter(person => person.seed !== null).map(person => person.id)).toEqual([people[0].id, people[9].id]);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Tout" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  refresh();
  expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Tout" })).toBeDisabled();
});

it.each(["tournament", "championship"] as const)("chooses and orders only checked artists before creating the %s", async format => {
  const { runtime, choose, refresh, onView } = setup(format);
  const people = runtime().participants.slice(0, 4);
  expect(screen.queryByText("Construire le tableau")).toBeNull();
  expect(screen.queryByText(/participants sélectionnés/)).toBeNull();
  const label = format === "tournament" ? "Créer le tableau" : "Créer le calendrier";
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  for (const person of people) await choose(person.person.name);
  fireEvent.click(screen.getByRole("button", { name: `Monter ${people[3].person.name}` }));
  await waitFor(() => expect(runtime().participants.find(person => person.id === people[3].id)?.seed).toBe(3));
  refresh();
  expect(screen.getByRole("button", { name: label })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(runtime().matches).toHaveLength(format === "tournament" ? 3 : 6));
  refresh();
  expect(runtime().lockedAt).toBeNull();
  expect(runtime().participants.some(person => person.guestStatus === "on_stage")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Valider le placement" }));
  await waitFor(() => expect(onView).toHaveBeenLastCalledWith("regie"));
  expect(runtime().lockedAt).toBeTruthy();
});

it.each(["tournament", "open-mic"] as const)("opens guests from an empty %s without scheduling anyone implicitly", format => {
  const { send, onOpenGuests } = setup(format, 0);
  fireEvent.click(screen.getByRole("button", { name: "Choisir dans les invités" }));
  expect(onOpenGuests).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByText("Générer aléatoirement")).toBeNull();
});

it("edits the Open Mic running order directly and protects started passages", async () => {
  const { runtime, choose, send, refresh } = setup("open-mic");
  const people = runtime().participants.slice(0, 4);
  await choose(people[2].person.name);
  await choose(people[0].person.name);
  expect(runtime().openMicEntries!.map(entry => entry.participantId)).toEqual([people[2].id, people[0].id]);
  fireEvent.click(screen.getByRole("button", { name: `Monter ${people[0].person.name}` }));
  await waitFor(() => expect(runtime().openMicEntries!.find(entry => entry.participantId === people[0].id)?.order).toBe(1));
  refresh();
  await choose(people[2].person.name);
  expect(runtime().openMicEntries).toHaveLength(1);
  await choose(people[1].person.name);
  const first = runtime().openMicEntries!.find(entry => entry.order === 1)!;
  await send("openmic.prepare", { entryId: first.id });
  refresh();
  expect(screen.getByRole("checkbox", { name: `Sélectionner ${people[0].person.name}` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `Monter ${people[1].person.name}` })).toBeDisabled();
  expect(screen.getByRole("button", { name: "En attente de sa préparation" })).toBeDisabled();
  expect(runtime().participants.some(person => person.guestStatus === "on_stage")).toBe(false);
});
