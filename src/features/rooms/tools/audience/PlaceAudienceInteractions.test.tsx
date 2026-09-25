import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "../../place/place.fixtures";
import PlaceAudienceInteractions from "./PlaceAudienceInteractions";

afterEach(cleanup);

function room() {
  return {
    ...createPlaceDemoState(PLACE_DEMO_PROFILES.viewerA.id),
    poll: {
      id: "poll-viewer",
      question: "Quel morceau pour la suite ?",
      options: [{ label: "Éclipse", votes: 12 }, { label: "Minuit", votes: 8 }],
      durationSeconds: 30 as const,
      endsAt: new Date(Date.now() + 30_000).toISOString(),
      isActive: true,
      currentUserVoteIndex: null,
      resultsVisible: true,
    },
  };
}

describe("PlaceAudienceInteractions", () => {
  it("lets an authenticated Viewer vote without exposing Host tools", () => {
    const onVotePoll = vi.fn();
    render(<PlaceAudienceInteractions room={room()} canEngage onVotePoll={onVotePoll} />);
    fireEvent.click(screen.getByRole("button", { name: /Éclipse/i }));
    expect(onVotePoll).toHaveBeenCalledWith(0);
    expect(screen.queryByText(/Outils de diffusion/i)).not.toBeInTheDocument();
  });

  it("keeps the live visible and redirects anonymous actions to existing authentication", () => {
    const onVotePoll = vi.fn();
    render(<PlaceAudienceInteractions room={room()} canEngage={false} onVotePoll={onVotePoll} />);
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toMatch(/^\/auth\?returnTo=/);
    expect(screen.getByRole("button", { name: /Éclipse/i })).toBeDisabled();
    expect(onVotePoll).not.toHaveBeenCalled();
  });
});
