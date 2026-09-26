import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { startCageViewerSimulation } from "../cageViewerSimulation";
import CageViewerCompanion from "./CageViewerCompanion";
import { cageAudienceProgram } from "./cageAudienceProgram";

vi.mock("../panels/WaveProfileButton", () => ({ default: ({ person, children }: any) => <button disabled={!person} aria-label={person ? `Profil ${person.name}` : "À venir"}>{children}</button> }));
afterEach(cleanup);

describe("Cage viewer programme aligned with iOS", () => {
  it("shows the published rounds, artist profiles and direct CTA instead of repeating the event title", () => {
    const cage = createRoomToolsFixture("cage", "viewer-program").cage!;
    const onOpenChat = vi.fn();
    render(<CageViewerCompanion cage={cage} source="demo" onOpenChat={onOpenChat} production={<button>Écouter la prod</button>} />);
    expect(screen.getByRole("heading", { name: "Tournoi" })).toBeVisible();
    expect(screen.queryByText(cage.event!.title)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Profil / }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Demi-finales/ })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Écouter la prod" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Suivre le duel" }));
    expect(screen.getByRole("tab", { name: "Direct" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Direct" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre le chat" }));
    expect(onOpenChat).toHaveBeenCalledOnce();
  });
  it("never exposes draft participants or prepared matches", () => {
    const cage = startCageViewerSimulation().cage!;
    const runtime = cage.runtime!;
    runtime.publicBracketVisible = false;
    runtime.activeMatchId = null;
    runtime.preparedMatchId = runtime.matches[0].id;
    const program = cageAudienceProgram(cage, "viewer", Date.now());
    expect(program.matches).toEqual([]);
    expect(program.active).toBeUndefined();
    render(<CageViewerCompanion cage={cage} />);
    expect(screen.getByText("La Cage se prépare")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Profil / })).not.toBeInTheDocument();
  });
  it("derives the live passage and clock from the actual runtime and keeps unpublished results hidden", () => {
    const cage = startCageViewerSimulation().cage!;
    const runtime = cage.runtime!;
    const match = runtime.matches.find(m => m.id === runtime.activeMatchId)!;
    match.status = "IN_PROGRESS";
    match.stepIndex = 0;
    match.steps = [{ id: "a", side: "A", label: "A", durationSeconds: 60 }, { id: "b", side: "B", label: "B", durationSeconds: 60 }];
    match.timer = { startedAt: "2026-09-26T12:00:00Z", elapsedSeconds: 5 };
    const artist = runtime.participants.find(p => p.id === match.participantAId)!.person;
    match.winnerId = match.participantAId;
    cage.resultsHidden = true; runtime.publicResults = null;
    const result = cageAudienceProgram(cage, artist.id, Date.parse("2026-09-26T12:00:10Z"));
    expect(result.title).toBe("C’est ton tour de performer");
    expect(result.seconds).toBe(45);
    expect(result.passage).toBe("1/2");
    expect(result.active?.winner).toBeUndefined();
  });
  it("offers only a read-only fund tab and recovers when the fund is withdrawn", () => {
    const cage = createRoomToolsFixture("cage", "viewer-fund").cage!;
    const props = { cage, fundraiser: { title: "Studio associatif", beneficiary: "Les artistes", target: 1500, isOpen: true } };
    const ui = render(<CageViewerCompanion {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Cagnotte" }));
    expect(screen.getByText("Studio associatif")).toBeVisible();
    expect(screen.getByText(/Au bénéfice de Les artistes/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /payer|contribuer|donner/i })).not.toBeInTheDocument();
    ui.rerender(<CageViewerCompanion cage={cage} />);
    expect(screen.queryByRole("tab", { name: "Cagnotte" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Compétition" })).toHaveAttribute("aria-selected", "true");
  });
});
