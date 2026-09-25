import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacePoll, PlaceRoomState } from "../../place/place.types";
import LogeAudienceChoicePanel, { LogePublicChoiceVote } from "./LogeAudienceChoicePanel";

afterEach(cleanup);

const poll: PlacePoll = {
  id: "poll-live",
  question: "Quel morceau je joue ensuite ?",
  options: [
    { label: "Éclipse", votes: 8, imageUrl: null, mediaId: "track-eclipse", durationLabel: "3:12" },
    { label: "Minuit", votes: 2, imageUrl: null, mediaId: "track-minuit", durationLabel: "3:45" },
  ],
  durationSeconds: null,
  endsAt: null,
  isActive: true,
  resultsVisible: true,
  currentUserVoteIndex: null,
};

function room(overrides: Partial<PlaceRoomState> = {}) {
  return {
    id: "loge-demo",
    source: "demo",
    participantsCount: 842,
    poll: null,
    track: { id: "playing", title: "Eclipse live", durationSeconds: 192 },
    ...overrides,
  } as PlaceRoomState;
}

describe("Le public choisit", () => {
  it("creates a valid 2–6 option vote through the canonical callback", async () => {
    const launch = vi.fn(async () => undefined);
    render(<LogeAudienceChoicePanel room={room()} disabled={false} onLaunchPoll={launch} onStopPoll={vi.fn(async () => undefined)} />);

    expect(screen.getByText("842")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lancer le vote" }));

    await waitFor(() => expect(launch).toHaveBeenCalledWith(
      "Quel morceau je joue ensuite pour vous ?",
      expect.arrayContaining([expect.objectContaining({ label: "Éclipse", imageUrl: expect.any(String) })]),
      null,
      true,
    ));
  });

  it("records one viewer choice then shows the realtime results", () => {
    const vote = vi.fn();
    const { rerender } = render(<LogePublicChoiceVote poll={poll} canEngage onVote={vote} />);
    fireEvent.click(screen.getByRole("button", { name: /Éclipse/i }));
    expect(vote).toHaveBeenCalledOnce();
    expect(vote).toHaveBeenCalledWith(0);

    rerender(<LogePublicChoiceVote poll={{ ...poll, currentUserVoteIndex: 0 }} canEngage onVote={vote} />);
    expect(screen.getByText("Vote enregistré")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Éclipse/i })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Éclipse : 80 %/i })).toBeInTheDocument();
  });

  it("does not disclose hidden results before the close", () => {
    render(<LogePublicChoiceVote poll={{ ...poll, resultsVisible: false, currentUserVoteIndex: 1 }} canEngage onVote={vi.fn()} />);
    expect(screen.getByText("Résultat dévoilé à la fin du vote.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("announces the winner when the server projection closes the vote", () => {
    render(<LogePublicChoiceVote poll={{ ...poll, isActive: false, resultsVisible: false, currentUserVoteIndex: 1 }} canEngage onVote={vi.fn()} />);
    expect(screen.getByText("LA LOGE A CHOISI")).toBeInTheDocument();
    expect(screen.getAllByText("Éclipse").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar", { name: /Éclipse : 80 %/i })).toBeInTheDocument();
  });

  it("starts a fresh draft after a completed vote even when smooth scrolling is unavailable", () => {
    render(<LogeAudienceChoicePanel room={room({ poll: { ...poll, isActive: false } })} disabled={false} onLaunchPoll={vi.fn(async () => undefined)} onStopPoll={vi.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "Nouveau vote" }));
    expect(screen.getByPlaceholderText("Quel morceau je joue ensuite ?")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Lancer le vote" })).toBeDisabled();
  });
});
