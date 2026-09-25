import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  ProfileRankingError,
  createDemoProfileRankingSnapshot,
  createProfileRankingRepository,
  mapProfileRankingPayload,
} from "./profile.ranking.service";

describe("profile ranking demo snapshot", () => {
  it("exposes the four territorial scopes in their canonical order", () => {
    const snapshot = createDemoProfileRankingSnapshot("7d");

    expect(snapshot).toMatchObject({
      period: "7d",
      label: "7 jours",
      basis: "grade_points",
      basisLabel: "Points de grade",
      currentPoints: 3_740,
      pointsGained: 126,
      hasData: true,
    });
    expect(snapshot.entries.map(({ scope, label }) => ({ scope, label }))).toEqual([
      { scope: "country", label: "France" },
      { scope: "region", label: "Île-de-France" },
      { scope: "city", label: "Paris" },
      { scope: "district", label: "Charonne" },
    ]);
    expect(snapshot.entries.every((entry) => entry.available)).toBe(true);
  });

  it("changes period movement and points without changing the user's standing", () => {
    const sevenDays = createDemoProfileRankingSnapshot("7d");
    const thirtyDays = createDemoProfileRankingSnapshot("30d");
    const twelveMonths = createDemoProfileRankingSnapshot("12m");

    expect(sevenDays.entries.map((entry) => entry.rank)).toEqual(
      thirtyDays.entries.map((entry) => entry.rank),
    );
    expect(thirtyDays.entries.map((entry) => entry.movement)).toEqual([116, 41, 19, 4]);
    expect(twelveMonths).toMatchObject({ label: "12 mois", pointsGained: 2_740 });
  });
});

describe("profile ranking payload mapping", () => {
  it("normalizes unordered RPC data and fills missing scopes truthfully", () => {
    const snapshot = mapProfileRankingPayload({
      current_points: "3980",
      points_gained: "-12",
      measured_at: "2026-07-20T06:00:00.000Z",
      entries: [
        { scope: "city", label: "  Paris  ", rank: "10", total: "250", movement: "-3" },
        { scope: "country", label: "France", rank: 1, total: 1_000, movement: 4 },
        { scope: "region", label: "Île-de-France", rank: 24, total: 400, movement: null },
        { scope: "unknown", label: "Ignored", rank: 1, total: 1, movement: 1 },
        { scope: "district", label: "Charonne", rank: 0, total: 612, movement: 2 },
      ],
    }, "30d");

    expect(snapshot).toMatchObject({
      period: "30d",
      label: "30 jours",
      currentPoints: 3_980,
      pointsGained: -12,
      measuredAt: "2026-07-20T06:00:00.000Z",
      hasData: true,
    });
    expect(snapshot.entries.map((entry) => entry.scope)).toEqual([
      "country",
      "region",
      "city",
      "district",
    ]);
    expect(snapshot.entries[0]).toMatchObject({
      label: "France",
      rank: 1,
      total: 1_000,
      movement: 4,
      topPercent: 0.1,
      available: true,
    });
    expect(snapshot.entries[1]).toMatchObject({
      label: "Île-de-France",
      rank: 24,
      total: 400,
      movement: null,
      available: true,
    });
    expect(snapshot.entries[2]).toMatchObject({
      label: "Paris",
      rank: 10,
      total: 250,
      movement: -3,
      topPercent: 4,
      available: true,
    });
    expect(snapshot.entries[3]).toMatchObject({ available: false, topPercent: 0 });
  });

  it("does not invent ranking data from a malformed response", () => {
    const snapshot = mapProfileRankingPayload(null, "12m");

    expect(snapshot.hasData).toBe(false);
    expect(snapshot.currentPoints).toBe(0);
    expect(snapshot.pointsGained).toBe(0);
    expect(snapshot.entries).toHaveLength(4);
    expect(snapshot.entries.every((entry) => !entry.available)).toBe(true);
  });
});

describe("profile ranking repository", () => {
  it("loads the selected period through the owner-scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        current_points: 3_740,
        points_gained: 126,
        measured_at: "2026-07-20T06:00:00.000Z",
        entries: [{ scope: "district", label: "Charonne", rank: 7, total: 612, movement: 1 }],
      },
      error: null,
    });
    const repository = createProfileRankingRepository({ rpc } as unknown as SupabaseClient);

    const snapshot = await repository.getSnapshot("7d");

    expect(rpc).toHaveBeenCalledWith("get_my_profile_rankings_v1", { p_period: "7d" });
    expect(snapshot.entries.find((entry) => entry.scope === "district")).toMatchObject({
      label: "Charonne",
      rank: 7,
      available: true,
    });
  });

  it("exposes a stable domain error when the RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const repository = createProfileRankingRepository({ rpc } as unknown as SupabaseClient);

    const request = repository.getSnapshot("30d");

    await expect(request).rejects.toBeInstanceOf(ProfileRankingError);
    await expect(request).rejects.toMatchObject({
      code: "profile-ranking-load-failed",
      message: "Le classement géographique est indisponible pour le moment.",
    });
  });
});

