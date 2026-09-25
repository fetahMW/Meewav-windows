import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { isProfileLocalPreviewEnabled } from "./profile.preview";
import type { StatsPeriod } from "./profile.data";

export type ProfileRankingScope = "country" | "region" | "city" | "district";

export type ProfileRankingEntry = {
  scope: ProfileRankingScope;
  label: string;
  rank: number;
  total: number;
  movement: number | null;
  topPercent: number;
  available: boolean;
};

export type ProfileRankingSnapshot = {
  period: StatsPeriod;
  label: string;
  basis: "grade_points";
  basisLabel: string;
  currentPoints: number;
  pointsGained: number;
  measuredAt: string;
  entries: ProfileRankingEntry[];
  hasData: boolean;
};

type RankingRpcEntry = {
  scope?: unknown;
  label?: unknown;
  rank?: unknown;
  total?: unknown;
  movement?: unknown;
};

type RankingRpcPayload = {
  period?: unknown;
  basis?: unknown;
  current_points?: unknown;
  points_gained?: unknown;
  measured_at?: unknown;
  entries?: unknown;
};

const periodLabels: Record<StatsPeriod, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "12m": "12 mois",
};

const scopeOrder: ProfileRankingScope[] = ["country", "region", "city", "district"];

const demoBase = {
  country: { label: "France", rank: 1_842, total: 198_420 },
  region: { label: "Île-de-France", rank: 612, total: 58_240 },
  city: { label: "Paris", rank: 284, total: 24_860 },
  district: { label: "Charonne", rank: 18, total: 1_420 },
} satisfies Record<ProfileRankingScope, { label: string; rank: number; total: number }>;

const demoMovement: Record<StatsPeriod, Record<ProfileRankingScope, number>> = {
  "7d": { country: 24, region: 9, city: 4, district: 1 },
  "30d": { country: 116, region: 41, city: 19, district: 4 },
  "12m": { country: 3_284, region: 1_102, city: 486, district: 62 },
};

const demoPointsGained: Record<StatsPeriod, number> = {
  "7d": 126,
  "30d": 482,
  "12m": 2_740,
};

export class ProfileRankingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProfileRankingError";
  }
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRankingScope(value: unknown): value is ProfileRankingScope {
  return typeof value === "string" && scopeOrder.includes(value as ProfileRankingScope);
}

function topPercent(rank: number, total: number) {
  if (rank <= 0 || total <= 0) return 0;
  return Math.max(0.1, Math.min(100, Math.round((rank / total) * 1_000) / 10));
}

export function createDemoProfileRankingSnapshot(period: StatsPeriod): ProfileRankingSnapshot {
  const entries = scopeOrder.map((scope) => {
    const item = demoBase[scope];
    return {
      scope,
      label: item.label,
      rank: item.rank,
      total: item.total,
      movement: demoMovement[period][scope],
      topPercent: topPercent(item.rank, item.total),
      available: true,
    };
  });

  return {
    period,
    label: periodLabels[period],
    basis: "grade_points",
    basisLabel: "Points de grade",
    currentPoints: 3_740,
    pointsGained: demoPointsGained[period],
    measuredAt: "Aujourd’hui · 06:00",
    entries,
    hasData: true,
  };
}

export function mapProfileRankingPayload(payload: unknown, period: StatsPeriod): ProfileRankingSnapshot {
  const raw = (payload && typeof payload === "object" ? payload : {}) as RankingRpcPayload;
  const rawEntries = Array.isArray(raw.entries) ? raw.entries as RankingRpcEntry[] : [];
  const mappedByScope = new Map<ProfileRankingScope, ProfileRankingEntry>();

  rawEntries.forEach((entry) => {
    if (!isRankingScope(entry.scope)) return;
    const rank = Math.max(0, Math.round(finiteNumber(entry.rank)));
    const total = Math.max(0, Math.round(finiteNumber(entry.total)));
    const available = rank > 0 && total > 0;
    mappedByScope.set(entry.scope, {
      scope: entry.scope,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : "Zone non renseignée",
      rank,
      total,
      movement: entry.movement === null || entry.movement === undefined
        ? null
        : Math.round(finiteNumber(entry.movement)),
      topPercent: topPercent(rank, total),
      available,
    });
  });

  const entries = scopeOrder.map((scope) => mappedByScope.get(scope) ?? {
    scope,
    label: "Zone non renseignée",
    rank: 0,
    total: 0,
    movement: null,
    topPercent: 0,
    available: false,
  });

  return {
    period,
    label: periodLabels[period],
    basis: "grade_points",
    basisLabel: "Points de grade",
    currentPoints: Math.max(0, Math.round(finiteNumber(raw.current_points))),
    pointsGained: Math.round(finiteNumber(raw.points_gained)),
    measuredAt: typeof raw.measured_at === "string" && raw.measured_at ? raw.measured_at : new Date().toISOString(),
    entries,
    hasData: entries.some((entry) => entry.available),
  };
}

export function isProfileRankingDemoFallbackEnabled() {
  return getDesktopApplicationMode() !== "live" && (isProfileLocalPreviewEnabled()
    || (import.meta.env.DEV && import.meta.env.VITE_PROFILE_DEMO_FALLBACK === "true"));
}

export function createProfileRankingRepository(client: SupabaseClient = supabase) {
  return {
    async getSnapshot(period: StatsPeriod) {
      const { data, error } = await client.rpc("get_my_profile_rankings_v1", {
        p_period: period,
      });
      if (error) {
        throw new ProfileRankingError(
          "profile-ranking-load-failed",
          "Le classement géographique est indisponible pour le moment.",
        );
      }
      return mapProfileRankingPayload(data, period);
    },
  };
}

export const profileRankingRepository = createProfileRankingRepository();

