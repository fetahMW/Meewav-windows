import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCageCompetitionCommand } from "../cageCompetition";
import type { CageCompetitionAction, CageCompetitionPayload } from "../cageCompetition.types";
import { initializeCageShowcase, moveCageDemoGuest } from "../cageShowcase.demo";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import CageViewerCompanion from "../audience/CageViewerCompanion";
import CageResultsDialog from "./CageResultsDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(cleanup);

function completedTournament() {
  const state = createRoomToolsFixture("cage", `results-${crypto.randomUUID()}`);
  initializeCageShowcase(state);
  const people = state.cage!.runtime!.participants.slice(0, 4);
  people.forEach(person => moveCageDemoGuest(state, person.id, "accepted", "host"));
  const run = (action: CageCompetitionAction, payload: CageCompetitionPayload = {}) => {
    applyCageCompetitionCommand(state, { type: "cage.competition.command", action, payload,
      idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision }, "host");
    state.revision++;
  };
  run("competition.configure", { format: "tournament", participantCount: 4 });
  run("roster.select", { participantIds: people.map(person => person.id) });
  run("bracket.generate", { mode: "manual" });
  const runtime = state.cage!.runtime!;
  const semifinals = runtime.matches.filter(match => match.round === 1);
  for (const match of semifinals) { match.status = "CLOSED"; match.winnerId = match.participantAId; }
  const final = runtime.matches.find(match => match.round === 2)!;
  final.participantAId = semifinals[0].winnerId;
  final.participantBId = semifinals[1].winnerId;
  final.winnerId = final.participantAId;
  final.status = "CLOSED";
  runtime.status = "COMPLETED";
  return { runtime, people, final, cage: state.cage! };
}

describe("Cage public result preview", () => {
  it("opens outside the console and preserves all podium identities, including both bronze artists", () => {
    const { runtime, people } = completedTournament();
    const send = vi.fn(async () => true);
    const { container } = render(<section aria-label="Console"><CageResultsDialog runtime={runtime} send={send} onClose={vi.fn()} /></section>);
    const dialog = screen.getByRole("dialog", { name: "Aperçu avant publication" });
    expect(dialog.parentElement).toBe(document.body);
    expect(container.querySelector(".cage-results")).toBeNull();
    const podium = within(dialog).getByLabelText("Podium");
    for (const person of people) {
      expect(within(podium).getByText(person.person.name)).toBeVisible();
      expect(within(podium).getByRole("img", { name: `Portrait de ${person.person.name}` })).toHaveAttribute("src", person.person.avatarUrl);
    }
    expect(podium.querySelectorAll(".is-rank-3 article")).toHaveLength(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("publishes only after the host confirms, with the selected match rather than the whole event", async () => {
    const { runtime, final } = completedTournament();
    const send = vi.fn(async () => true);
    render(<CageResultsDialog runtime={runtime} matchId={final.id} send={send} onClose={vi.fn()} />);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publier au public" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith("broadcast.results", { enabled: true, matchId: final.id });
  });

  it("keeps the artist's identity when a portrait cannot load", () => {
    const { runtime, people } = completedTournament();
    render(<CageResultsDialog runtime={runtime} onClose={vi.fn()} />);
    const person = people[0].person;
    fireEvent.error(screen.getByRole("img", { name: `Portrait de ${person.name}` }));
    expect(screen.getByRole("img", { name: `Portrait indisponible de ${person.name}` })).toBeVisible();
    expect(within(screen.getByLabelText("Podium")).getByText(person.name)).toBeVisible();
  });

  it("opens public results only on request and closes them when the host withdraws publication", () => {
    const { cage, runtime } = completedTournament();
    runtime.publicResults = { matchId: null };
    const ui = render(<CageViewerCompanion cage={cage} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const expand = screen.getByRole("button", { name: "Voir en grand" });
    expand.focus();
    fireEvent.click(expand);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const dialog = screen.getByRole("dialog", { name: "Résultats de la Cage" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).queryByRole("button", { name: "Publier au public" })).toBeNull();
    ui.rerender(<CageViewerCompanion cage={{ ...cage, runtime: { ...runtime, publicResults: null } }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("tab", { name: "Compétition" })).toHaveFocus();
  });

  it("shows exactly the same podium to the public, without host publication controls", () => {
    const { runtime } = completedTournament();
    const host = render(<CageResultsDialog runtime={runtime} send={vi.fn()} onClose={vi.fn()} />);
    const presentation = screen.getByLabelText("Le palmarès").outerHTML;
    host.unmount();
    render(<CageResultsDialog runtime={{ ...runtime, publicResults: { matchId: null } }} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Le palmarès").outerHTML).toBe(presentation);
    expect(screen.queryByRole("button", { name: "Publier au public" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Résultats de la Cage" })).toBeVisible();
  });

  it("keeps a failed publication private and retryable", async () => {
    const { runtime } = completedTournament();
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<CageResultsDialog runtime={runtime} send={send} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publier au public" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La diffusion n’a pas été modifiée");
    expect(runtime.publicResults).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: "Publier au public" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it("closes on Escape without publishing and restores focus to the original action", () => {
    const { runtime } = completedTournament();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const send = vi.fn();
    const ui = render(<CageResultsDialog runtime={runtime} send={send} onClose={onClose} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    ui.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
