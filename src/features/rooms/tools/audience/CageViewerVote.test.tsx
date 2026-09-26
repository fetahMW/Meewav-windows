import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { migrateCageDemoCompetition } from "../cageCompetition";
import CageViewerVote from "./CageViewerVote";
import { cageViewerBallot } from "./cageViewerBallot";

function votingState() {
  const state = createRoomToolsFixture("cage", "viewer-vote-test");
  const cage = state.cage!;
  const runtime = migrateCageDemoCompetition(cage);
  const match = runtime.matches.find((item) => item.id === runtime.activeMatchId)!;
  runtime.status = "RUNNING";
  match.status = "VOTING";
  match.vote = { roundId: "vote-round-1", open: true, endsAt: new Date(Date.now() + 15_000).toISOString(), ballots: {}, scoreA: 0, scoreB: 0, closedAt: null };
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T15:00:00Z"));
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Cage viewer vote", () => {
  it("opens automatically with names and a server deadline, independent of the console tab", () => {
    const state = votingState();
    render(<CageViewerVote state={state} accountId="viewer" canVote busy={false} execute={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Qui remporte ce duel ?" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Voter A/ })).toHaveTextContent(state.cage!.matches.find(m => m.id === state.cage!.runtime!.activeMatchId)!.competitorA.name);
    expect(screen.getByRole("timer")).toHaveTextContent("15 s");
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["permission", "competitor", "already-voted", "expired", "malformed", "closed"])("does not offer an ineligible ballot: %s", (reason) => {
    const state = votingState();
    const match = state.cage!.runtime!.matches.find(m => m.id === state.cage!.runtime!.activeMatchId)!;
    const accountId = reason === "competitor" ? match.participantAId! : "viewer";
    if (reason === "already-voted") match.vote!.ballots[accountId] = "A";
    if (reason === "expired") match.vote!.endsAt = new Date(Date.now() - 1).toISOString();
    if (reason === "malformed") match.vote!.endsAt = "invalid";
    if (reason === "closed") match.vote!.open = false;
    render(<CageViewerVote state={state} accountId={accountId} canVote={reason !== "permission"} busy={false} execute={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends one command bound to the displayed match despite repeated clicks", async () => {
    const state = votingState();
    let finish!: () => void;
    const execute = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<CageViewerVote state={state} accountId="viewer" canVote busy={false} execute={execute} />);
    fireEvent.click(screen.getByRole("button", { name: /^Voter A/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Voter B/ }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "cage.competition.command", action: "vote.cast", payload: { choice: "A" }, expectedMatchId: state.cage!.runtime!.activeMatchId, expectedRevision: state.revision }));
    await act(async () => finish());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Vote enregistré");
  });

  it("allows retry after a failed submission without recording a vote", async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error("network_error")).mockResolvedValue(undefined);
    render(<CageViewerVote state={votingState()} accountId="viewer" canVote busy={false} execute={execute} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Voter B/ })));
    expect(screen.getByRole("alert")).toHaveTextContent("Le vote n’a pas été envoyé");
    expect(screen.getByRole("button", { name: /^Voter B/ })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Voter B/ })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("remembers abstention across remounts, sends no ballot and reopens for a new round", () => {
    const state = votingState();
    const execute = vi.fn();
    const props = { state, accountId: "viewer", canVote: true, busy: false, execute };
    const first = render(<CageViewerVote {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Je m’abstiens" }));
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Vous vous abstenez");
    first.unmount();
    const second = render(<CageViewerVote {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const next = structuredClone(state);
    next.cage!.runtime!.matches.find(m => m.id === next.cage!.runtime!.activeMatchId)!.vote!.roundId = "vote-round-2";
    second.rerender(<CageViewerVote {...props} state={next} />);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("does not dismiss a new round when the previous vote finishes late", async () => {
    const state = votingState();
    let finish!: () => void;
    const execute = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const props = { state, accountId: "viewer", canVote: true, busy: false, execute };
    const view = render(<CageViewerVote {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Voter A/ }));
    const next = structuredClone(state);
    next.cage!.runtime!.matches.find(m => m.id === next.cage!.runtime!.activeMatchId)!.vote!.roundId = "vote-round-2";
    view.rerender(<CageViewerVote {...props} state={next} />);
    await act(async () => finish());
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Voter B/ })).toBeEnabled();
  });

  it("keeps scores private even if a snapshot contains provisional totals", () => {
    const state = votingState();
    const match = state.cage!.runtime!.matches.find(m => m.id === state.cage!.runtime!.activeMatchId)!;
    match.vote!.scoreA = 1724;
    match.vote!.scoreB = 936;
    render(<CageViewerVote state={state} accountId="viewer" canVote busy={false} execute={vi.fn()} />);
    expect(screen.queryByText(/1724|936/)).not.toBeInTheDocument();
    expect(cageViewerBallot(state.cage!, "viewer")?.remaining).toBe(15);
  });
});
