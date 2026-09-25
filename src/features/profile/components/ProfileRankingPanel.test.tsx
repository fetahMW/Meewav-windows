import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatsPeriod } from "../profile.data";
import type { ProfileRankingSnapshot } from "../profile.ranking.service";

const rankingMocks = vi.hoisted(() => ({
  createDemoSnapshot: vi.fn(),
  demoFallbackEnabled: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("../profile.ranking.service", () => ({
  createDemoProfileRankingSnapshot: rankingMocks.createDemoSnapshot,
  isProfileRankingDemoFallbackEnabled: rankingMocks.demoFallbackEnabled,
  profileRankingRepository: { getSnapshot: rankingMocks.getSnapshot },
}));

import ProfileRankingPanel from "./ProfileRankingPanel";

function snapshot(period: StatsPeriod = "7d"): ProfileRankingSnapshot {
  const labels: Record<StatsPeriod, string> = {
    "7d": "7 jours",
    "30d": "30 jours",
    "12m": "12 mois",
  };
  return {
    period,
    label: labels[period],
    basis: "grade_points",
    basisLabel: "Points de grade",
    currentPoints: 3_740,
    pointsGained: period === "7d" ? 126 : period === "30d" ? 482 : 2_740,
    measuredAt: "Aujourd’hui · 06:00",
    hasData: true,
    entries: [
      { scope: "country", label: "France", rank: 1_284, total: 186_420, movement: 38, topPercent: 0.7, available: true },
      { scope: "region", label: "Île-de-France", rank: 318, total: 62_840, movement: 12, topPercent: 0.5, available: true },
      { scope: "city", label: "Paris", rank: 92, total: 18_740, movement: 5, topPercent: 0.5, available: true },
      { scope: "district", label: "Charonne", rank: 7, total: 612, movement: 1, topPercent: 1.1, available: true },
    ],
  };
}

afterEach(cleanup);

beforeEach(() => {
  rankingMocks.demoFallbackEnabled.mockReturnValue(true);
  rankingMocks.createDemoSnapshot.mockImplementation((period: StatsPeriod) => snapshot(period));
  rankingMocks.getSnapshot.mockResolvedValue(snapshot());
});

describe("ProfileRankingPanel home variant", () => {
  it("summarizes all four geographic standings and opens the detailed analysis", () => {
    const onOpenDetails = vi.fn();
    render(<ProfileRankingPanel period="7d" variant="home" onOpenDetails={onOpenDetails} />);

    const panel = screen.getByRole("region", { name: "Classement territorial du profil" });
    expect(within(panel).getByText("Classement territorial")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /National, France,/i })).toBeEnabled();
    expect(within(panel).getByRole("button", { name: /Régional, Île-de-France,/i })).toBeEnabled();
    expect(within(panel).getByRole("button", { name: /Ville, Paris,/i })).toBeEnabled();
    expect(within(panel).getByRole("button", { name: /Quartier, Charonne,/i })).toBeEnabled();
    expect(within(panel).getByText(/Meilleure position · Top 0,5 % à Île-de-France/i)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: /Voir l’analyse du classement/i }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("refreshes its period summary when the profile period changes", () => {
    const onOpenDetails = vi.fn();
    const { rerender } = render(<ProfileRankingPanel period="7d" variant="home" onOpenDetails={onOpenDetails} />);
    expect(screen.getByText("7 jours")).toBeInTheDocument();

    rerender(<ProfileRankingPanel period="30d" variant="home" onOpenDetails={onOpenDetails} />);

    expect(screen.getByText("30 jours")).toBeInTheDocument();
    expect(rankingMocks.createDemoSnapshot).toHaveBeenCalledWith("30d");
  });
});

describe("ProfileRankingPanel stats variant", () => {
  it("lets the user inspect each territorial level without leaving the panel", () => {
    const { container } = render(<ProfileRankingPanel period="7d" variant="stats" />);

    expect(screen.getByRole("heading", { name: "Ta position, de la France à ton quartier." })).toBeInTheDocument();
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("QuartierCharonne#7");

    fireEvent.click(screen.getByRole("button", { name: /National, France,/i }));

    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("NationalFrance");
    const focus = container.querySelector(".profile-ranking-focus");
    expect(focus).not.toBeNull();
    expect(within(focus as HTMLElement).getByText(/National · France/i)).toBeInTheDocument();
    expect(within(focus as HTMLElement).getByText((content) => content.replace(/\s/g, "") === "#1284")).toBeInTheDocument();
    expect(within(focus as HTMLElement).getByText("+38 places")).toBeInTheDocument();
  });

  it("shows a recoverable error and retries the backend request", async () => {
    rankingMocks.demoFallbackEnabled.mockReturnValue(false);
    rankingMocks.getSnapshot
      .mockRejectedValueOnce(new Error("Classement temporairement indisponible"))
      .mockResolvedValueOnce(snapshot("30d"));

    render(<ProfileRankingPanel period="30d" variant="stats" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Classement temporairement indisponible");
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));

    await waitFor(() => expect(rankingMocks.getSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("3 740 points")).toBeInTheDocument();
  });

  it("renders the measured timestamp and a negative points delta truthfully", () => {
    rankingMocks.createDemoSnapshot.mockReturnValue({
      ...snapshot("30d"),
      pointsGained: -12,
      measuredAt: "2026-07-20T06:00:00.000Z",
    });

    render(<ProfileRankingPanel period="30d" variant="stats" />);

    expect(screen.getByText("−12 points")).toBeInTheDocument();
    expect(screen.queryByText("+-12 points")).not.toBeInTheDocument();
    expect(screen.getByText(/Mis à jour le 20 juil à 08:00/i)).toBeInTheDocument();
  });
});

