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

it.each([2, 4, 8])("adapts a default 16-person tournament to the %i selected artists without losing any", async count => {
  const { runtime, choose, refresh, send } = setup("tournament", count, 16);
  const people = runtime().participants.filter(person => person.registered).slice(0, count);
  for (const person of people) await choose(person.person.name);
  const ids = people.map(person => person.id);
  expect(screen.getByRole("combobox", { name: "Nombre d’artistes du programme" })).toHaveValue("16");
  fireEvent.click(screen.getByRole("button", { name: `Adapter à ${count} artistes` }));
  await waitFor(() => expect(runtime().config.participantCount).toBe(count));
  refresh();
  expect(runtime().participants.filter(person => person.seed !== null).map(person => person.id)).toEqual(ids);
  expect(send).toHaveBeenLastCalledWith("competition.configure", { format: "tournament", participantCount: count });
  fireEvent.click(screen.getByRole("button", { name: "Créer le tableau" }));
  await waitFor(() => expect(runtime().matches).toHaveLength(count - 1));
  refresh();
  fireEvent.click(screen.getByRole("button", { name: "Valider le placement" }));
  await waitFor(() => expect(runtime().lockedAt).toBeTruthy());
});

it("supports a six-artist championship and prevents sizing below the current selection", async () => {
  const { runtime, choose, refresh } = setup("championship", 6, 16);
  const people = runtime().participants.filter(person => person.registered).slice(0, 6);
  for (const person of people) await choose(person.person.name);
  expect(screen.getByRole("option", { name: "4 artistes", hidden: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Adapter à 6 artistes" }));
  await waitFor(() => expect(runtime().config.participantCount).toBe(6));
  refresh();
  fireEvent.click(screen.getByRole("button", { name: "Créer le calendrier" }));
  await waitFor(() => expect(runtime().matches).toHaveLength(15));
  expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(6);
});

it("never offers to silently drop two of six artists through tournament reduction", async () => {
  const { runtime, choose, refresh } = setup("tournament", 6, 16);
  runtime().config.rules.allowFormatReduction = true;
  refresh();
  const people = runtime().participants.filter(person => person.registered).slice(0, 6);
  for (const person of people.slice(0, 4)) await choose(person.person.name);
  fireEvent.click(screen.getByText("Options du placement"));
  fireEvent.click(screen.getByRole("combobox", { name: /Avec moins de 16 artistes/ }));
  fireEvent.click(screen.getByRole("option", { name: "Réduire le format" }));
  expect(screen.getByRole("button", { name: "Créer avec ce choix" })).toBeEnabled();
  // A valid four-person reduction must become unavailable after adding two artists.
  for (const person of people.slice(4)) await choose(person.person.name);
  fireEvent.click(screen.getByRole("combobox", { name: /Avec moins de 16 artistes/ }));
  expect(screen.getByRole("option", { name: "Réduire le format" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("option", { name: "Réduire le format" }));
  expect(screen.getByRole("button", { name: "Créer avec ce choix", hidden: true })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Tirer au sort parmi les 6/, hidden: true })).toBeDisabled();
  expect(runtime().participants.filter(person => person.seed !== null)).toHaveLength(6);
});

it.each(['jury', 'mixed'] as const)('opens jury configuration before voting in %s mode and restores the vote action once ready', async mode => {
  const { runtime, choose, send, refresh, onOpenGuests } = setup('tournament', 2, 2);
  for (const person of runtime().participants.filter(person => person.registered)) await choose(person.person.name);
  await send('bracket.generate', { mode: 'manual' });
  await send('bracket.lock');
  const match = runtime().matches[0];
  runtime().activeMatchId = match.id;
  match.status = 'READY_FOR_VOTE';
  runtime().config.rules.votingMode = mode;
  refresh(); send.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Configurer le jury' }));
  expect(onOpenGuests).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  runtime().votingPolicy = { mode: mode === 'jury' ? 'mixed' : 'jury', jurorIds: ['juror'], revision: 1 };
  refresh();
  expect(screen.getByRole('button', { name: 'Configurer le jury' })).toBeEnabled();
  runtime().votingPolicy = { mode, jurorIds: ['juror'], revision: 2 };
  refresh();
  expect(screen.queryByRole('button', { name: 'Configurer le jury' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ouvrir le vote' })).toBeEnabled();
});
