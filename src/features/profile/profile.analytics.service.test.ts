import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfileAnalyticsRepository,
  getProfileAnalyticsDateRange,
  mapProfileAnalytics,
  type ProfileAnalyticsRow,
} from "./profile.analytics.service";

const NOW = new Date("2026-07-16T12:00:00.000Z");

function row(overrides: Partial<ProfileAnalyticsRow>): ProfileAnalyticsRow {
  return {
    metric_date: "2026-07-16",
    source_pillar: "profile",
    metric_name: "profile_view",
    metric_value: 0,
    unique_visitors: 0,
    metadata: {},
    ...overrides,
  };
}

describe("profile analytics periods", () => {
  it("builds exact non-overlapping current and previous ranges", () => {
    expect(getProfileAnalyticsDateRange("7d", NOW)).toEqual({
      from: "2026-07-10",
      to: "2026-07-16",
      previousFrom: "2026-07-03",
      previousTo: "2026-07-09",
    });
    expect(getProfileAnalyticsDateRange("30d", NOW)).toEqual({
      from: "2026-06-17",
      to: "2026-07-16",
      previousFrom: "2026-05-18",
      previousTo: "2026-06-16",
    });
    expect(getProfileAnalyticsDateRange("12m", NOW)).toEqual({
      from: "2025-08-01",
      to: "2026-07-16",
      previousFrom: "2024-08-01",
      previousTo: "2025-07-31",
    });
  });

  it("changes chart granularity from days to calendar months", () => {
    const sevenDays = mapProfileAnalytics([], [], "7d", NOW);
    const thirtyDays = mapProfileAnalytics([], [], "30d", NOW);
    const twelveMonths = mapProfileAnalytics([], [], "12m", NOW);

    expect(sevenDays.axis).toHaveLength(7);
    expect(thirtyDays.axis).toHaveLength(30);
    expect(twelveMonths.axis).toHaveLength(12);
    expect(twelveMonths.axis[0]).toMatch(/Août/i);
    expect(twelveMonths.axis[twelveMonths.axis.length - 1]).toMatch(/Juil/i);
  });
});

describe("profile analytics aggregation", () => {
  it("keeps consolidated zero values distinct from a missing dataset", () => {
    const snapshot = mapProfileAnalytics([
      row({ metric_name: "profile_view", metric_value: 0, unique_visitors: 0 }),
    ], [], "7d", NOW);

    expect(snapshot.hasData).toBe(true);
    expect(snapshot.metrics.reach).toMatchObject({ available: true, value: "0" });
    expect(snapshot.metrics.reach.values).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(snapshot.metrics.revenue).toMatchObject({ available: false, value: "—" });
  });

  it("aggregates events by source without inventing acquisition categories", () => {
    const current = [
      row({ metric_date: "2026-07-10", source_pillar: "shorts", metric_name: "short_impression", metric_value: 100, unique_visitors: 80 }),
      row({ metric_date: "2026-07-10", source_pillar: "globe", metric_name: "globe_profile_open", metric_value: 50, unique_visitors: 40 }),
      row({ metric_date: "2026-07-10", source_pillar: "profile", metric_name: "media_play", metric_value: 30, unique_visitors: 20 }),
      row({ metric_date: "2026-07-10", source_pillar: "profile", metric_name: "follow_created", metric_value: 10, unique_visitors: 10 }),
      row({ metric_date: "2026-07-10", source_pillar: "marketplace", metric_name: "revenue_cents", metric_value: 123_400, unique_visitors: 0 }),
      row({ metric_date: "2026-07-16", source_pillar: "profile", metric_name: "search_result_view", metric_value: 20, unique_visitors: 15 }),
    ];
    const previous = [
      row({ metric_date: "2026-07-03", metric_name: "profile_view", metric_value: 50, unique_visitors: 45 }),
      row({ metric_date: "2026-07-03", metric_name: "media_play", metric_value: 5, unique_visitors: 5 }),
      row({ metric_date: "2026-07-03", metric_name: "revenue_cents", metric_value: 100_000, unique_visitors: 0 }),
    ];

    const snapshot = mapProfileAnalytics(current, previous, "7d", NOW);

    expect(snapshot.metrics.reach).toMatchObject({ available: true, value: "135", delta: "+200 %" });
    expect(snapshot.metrics.engagement.value).toBe("23,5 %");
    expect(snapshot.metrics.revenue).toMatchObject({ available: true, value: "1 234 €" });
    expect(snapshot.eventTotals).toMatchObject({ short_impression: 100, media_play: 30, follow_created: 10 });
    expect(snapshot.acquisition.discovery.sources.map(({ label, value }) => [label, value])).toEqual([
      ["La Scène", 59.3],
      ["Globe", 29.6],
      ["Recherche", 11.1],
    ]);
    expect(snapshot.acquisition.conversion.sources.map(({ label, value }) => [label, value])).toEqual([
      ["Lecture d’un média", 75],
      ["Abonnement", 25],
    ]);
  });

  it("sums multiple rows of the same event and source", () => {
    const snapshot = mapProfileAnalytics([
      row({ metric_date: "2026-07-15", source_pillar: "globe", metric_name: "globe_profile_open", metric_value: 5, unique_visitors: 4 }),
      row({ metric_date: "2026-07-16", source_pillar: "globe", metric_name: "globe_profile_open", metric_value: 7, unique_visitors: 6 }),
    ], [], "7d", NOW);

    expect(snapshot.eventTotals.globe_profile_open).toBe(12);
    expect(snapshot.acquisition.discovery.sources).toEqual([
      { label: "Globe", value: 100, color: "#8b5cff" },
    ]);
    expect(snapshot.metrics.reach.values.slice(-2)).toEqual([0.004, 0.006]);
  });
});

describe("profile analytics repository", () => {
  it("queries the owner RPC for both current and previous periods", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [row({ metric_date: "2026-07-16", metric_value: 1, unique_visitors: 1 })], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const repository = createProfileAnalyticsRepository({ rpc } as unknown as SupabaseClient);

    const snapshot = await repository.getDashboard("7d", NOW);

    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_profile_metrics", { p_from: "2026-07-10", p_to: "2026-07-16" });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_my_profile_metrics", { p_from: "2026-07-03", p_to: "2026-07-09" });
    expect(snapshot.hasData).toBe(true);
  });

  it("does not silently turn a backend error into demo analytics", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } });
    const repository = createProfileAnalyticsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getDashboard("30d", NOW)).rejects.toMatchObject({
      code: "profile-analytics-load-failed",
    });
  });
});
