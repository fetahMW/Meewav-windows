import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { initializeCageShowcase, moveCageDemoGuest } from "./cageShowcase.demo";
import { applyCageCompetitionCommand } from "./cageCompetition";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import CageCompetitionWorkspace, { CageCommandBar } from "./panels/CageCompetitionWorkspace";
import CageResults from "./panels/CageResults";

afterEach(cleanup);

it("drives pause, incident restart, tie-break, audience display, match results and podium", async () => {
  const state = createRoomToolsFixture("cage", `actions-${crypto.randomUUID()}`);
  initializeCageShowcase(state);
  const runtime = () => state.cage!.runtime!;
  const people = runtime().participants.slice(0, 2);
  people.forEach((person) => moveCageDemoGuest(state, person.id, "accepted", "host"));
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}, actor = "host") => {
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload,
      idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision,
      expectedMatchId: runtime().activeMatchId ?? undefined,
      expectedStepIndex: runtime().matches.find((match) => match.id === runtime().activeMatchId)?.stepIndex,
    }, actor);
    state.revision++;
  };
  run("competition.configure", { format: "tournament", participantCount: 2 });
  run("roster.select", { participantIds: people.map((person) => person.id) });
  run("bracket.generate", { mode: "manual" });
  run("bracket.lock");
  const match = runtime().matches[0];
  run("regie.prepare", { matchId: match.id });
  people.forEach((person) => moveCageDemoGuest(state, person.id, "ready", "host"));
  run("regie.promote", { matchId: match.id });

  const send = vi.fn(async (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => { run(action, payload); return true; });
  const onResults = vi.fn();
  const props = () => ({ runtime: runtime(), view: "match" as const, disabled: false, isControl: true, accountId: "host", send, onView: vi.fn(), onResults });
  const ui = render(<><CageCompetitionWorkspace {...props()} /><CageCommandBar {...props()} /></>);
  const refresh = () => ui.rerender(<><CageCompetitionWorkspace {...props()} /><CageCommandBar {...props()} /></>);
  fireEvent.click(screen.getByRole("button", { name: "Démarrer le match" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("IN_PROGRESS")); refresh();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("PAUSED")); refresh();
  fireEvent.click(screen.getByRole("button", { name: "Reprendre le passage" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("IN_PROGRESS")); refresh();
  fireEvent.click(screen.getByText("Incident technique"));
  fireEvent.click(screen.getByRole("combobox", { name: "Participant" }));
  fireEvent.click(screen.getByRole("option", { name: people[0].person.name }));
  fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Audio coupé" } });
  fireEvent.click(screen.getByRole("button", { name: "Suspendre pour incident" }));
  await waitFor(() => expect(runtime().matches[0].incident?.reason).toBe("Audio coupé")); refresh();
  fireEvent.click(screen.getByRole("button", { name: "Recommencer le passage" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("ON_STAGE")); refresh();

  for (let step = 0; runtime().matches[0].status !== "READY_FOR_VOTE" && step < 20; step++) {
    fireEvent.click(screen.getByRole("button", { name: /Démarrer le match|Démarrer le passage suivant/ }));
    await waitFor(() => expect(runtime().matches[0].status).toBe("IN_PROGRESS"));
    refresh();
    fireEvent.click(screen.getByRole("button", { name: "Terminer le passage" }));
    await waitFor(() => expect(runtime().matches[0].status).not.toBe("IN_PROGRESS")); refresh();
  }
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le vote" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("VOTING"));
  run("vote.close");
  refresh();
  expect(runtime().matches[0].status).toBe("TIE_BREAK");
  fireEvent.click(screen.getByRole("button", { name: "Démarrer la manche décisive" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("IN_PROGRESS")); refresh();
  for (let step = 0; runtime().matches[0].status !== "READY_FOR_VOTE" && step < 20; step++) {
    if (runtime().matches[0].status !== "IN_PROGRESS") {
      fireEvent.click(screen.getByRole("button", { name: /Démarrer la manche décisive|Démarrer le passage suivant/ }));
      await waitFor(() => expect(runtime().matches[0].status).toBe("IN_PROGRESS")); refresh();
    }
    fireEvent.click(screen.getByRole("button", { name: "Terminer le passage" }));
    await waitFor(() => expect(runtime().matches[0].status).not.toBe("IN_PROGRESS")); refresh();
  }
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le vote" }));
  await waitFor(() => expect(runtime().matches[0].status).toBe("VOTING"));
  run("vote.cast", { choice: "B" }, "viewer"); run("vote.close"); refresh();
  expect(runtime().status).toBe("COMPLETED");
  fireEvent.click(screen.getByRole("button", { name: "Voir les résultats" }));
  expect(onResults).toHaveBeenCalledOnce();
  ui.unmount();
  const bracketSend = vi.fn(async (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => { run(action, payload); return true; });
  const bracket = render(<CageCompetitionWorkspace runtime={runtime()} view="bracket" disabled={false} isControl accountId="host" send={bracketSend} onView={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Afficher le bracket au public" }));
  await waitFor(() => expect(runtime().publicBracketVisible).toBe(true));
  bracket.unmount();
  const resultSend = vi.fn(async (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => { run(action, payload); return true; });
  render(<CageResults runtime={runtime()} send={resultSend} />);
  expect(screen.getByLabelText("Podium")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Publier au public" }));
  await waitFor(() => expect(runtime().publicResults).toEqual({ matchId: null }));
});
