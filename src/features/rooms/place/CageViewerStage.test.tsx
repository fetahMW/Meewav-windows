import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../tools/roomTools.fixtures";
import { migrateCageDemoCompetition } from "../tools/cageCompetition";
import { createPlaceDemoState } from "./place.fixtures";
import CageViewerStage from "./CageViewerStage";

function setup() {
  const room = { ...createPlaceDemoState(), source: "live" as const };
  const cage = createRoomToolsFixture("cage", room.id).cage!;
  return { room, cage, onStage: room.participants.filter(p => p.status === "host" || p.status === "onstage"), liveKitVideoTracks: [], useRtcVideo: true, programMuted: true, onOpenProfile: vi.fn() };
}
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Cage iOS viewer stage on Windows", () => {
  it("shows host support only on the solo host and one Golden Like per artist during a duel", () => {
    const props = setup();
    const { rerender, container } = render(<CageViewerStage {...props} cage={{ ...props.cage, currentMatchId: "" }} hostActions={<button>Soutenir le host</button>} />);
    expect(screen.getByRole("button", { name: "Soutenir le host" })).toBeVisible();
    rerender(<CageViewerStage {...props} hostActions={<button>Soutenir le host</button>} />);
    expect(screen.queryByRole("button", { name: "Soutenir le host" })).not.toBeInTheDocument();
    const fighters = container.querySelectorAll<HTMLElement>(".cage-viewer-stage__fighters .cage-viewer-camera");
    expect(fighters).toHaveLength(2);
    for (const fighter of fighters) {
      expect(within(fighter).getByRole("group", { name: /Golden Like pour/ })).toBeVisible();
      expect(fighter.querySelectorAll(".shorts-reaction--golden")).toHaveLength(1);
      expect(fighter.querySelector(".shorts-reaction--like")).toBeNull();
    }
  });
  it("keeps the host alone before a duel without a fictitious tournament poster", () => {
    const props = setup();
    props.cage.currentMatchId = "";
    const { container } = render(<CageViewerStage {...props} />);
    expect(container.querySelectorAll(".cage-viewer-camera")).toHaveLength(1);
    expect(screen.getByRole("button", { name: `Voir le profil de ${props.room.host.displayName}` })).toBeVisible();
    expect(screen.getByText("HOST · COMMENTAIRE")).toBeVisible();
    expect(screen.queryByText("VS")).not.toBeInTheDocument();
  });

  it("shows two named slots, A/B colours, and the host commentary during the duel", () => {
    const props = setup();
    const { container } = render(<CageViewerStage {...props} />);
    expect(container.querySelectorAll(".cage-viewer-camera")).toHaveLength(3);
    expect(container.querySelector('[data-side="B"]')).toHaveClass("is-active");
    expect(screen.getByText("Rook")).toBeVisible();
    expect(screen.getByText("Zélie")).toBeVisible();
    expect(container.querySelectorAll('[data-side][data-feed="missing"]')).toHaveLength(2);
    expect(container.querySelectorAll(".cage-viewer-stage__fighters video")).toHaveLength(0);
  });

  it("does not remount the host camera when the stage changes from solo to battle", () => {
    const props = setup();
    const matchId = props.cage.currentMatchId;
    const before = { ...props.cage, currentMatchId: "" };
    const { container, rerender } = render(<CageViewerStage {...props} cage={before} />);
    const host = container.querySelector(".cage-viewer-stage__host .cage-viewer-camera");
    rerender(<CageViewerStage {...props} cage={{ ...props.cage, currentMatchId: matchId }} />);
    expect(container.querySelector(".cage-viewer-stage__host .cage-viewer-camera")).toBe(host);
  });

  it("preserves the exact participant's video fallback while RTC camera is reconnecting", () => {
    const props = setup();
    const match = props.cage.matches.find(m => m.id === props.cage.currentMatchId)!;
    const artist = { ...props.onStage[0], id: "exact-artist", profile: { ...props.onStage[0].profile, id: match.competitorA.id, displayName: match.competitorA.name }, status: "onstage" as const, isCameraEnabled: true,
      videoUrl: "/media/exact-artist.mp4", videoSources: undefined };
    const { container } = render(<CageViewerStage {...props} onStage={[...props.onStage, artist]} />);
    expect(container.querySelector('[data-side="A"] video')).toHaveAttribute("src", "/media/exact-artist.mp4");
    expect(container.querySelector('[data-side="B"] video')).toBeNull();
  });

  it.each(["COMPLETED", "CANCELLED"] as const)("returns to the host after %s", (status) => {
    const props = setup();
    migrateCageDemoCompetition(props.cage).status = status;
    const { container } = render(<CageViewerStage {...props} />);
    expect(container.querySelector(".cage-viewer-stage__fighters")).toBeNull();
    expect(screen.getByText(props.room.host.displayName)).toBeVisible();
  });

  it("shows an interrupted broadcast as the host, without substituting other artists", () => {
    const props = setup();
    props.cage.battleStatus = "incident";
    const { container } = render(<CageViewerStage {...props} />);
    expect(container.querySelectorAll(".cage-viewer-camera")).toHaveLength(1);
    expect(screen.queryByText("Rook")).not.toBeInTheDocument();
  });
});
