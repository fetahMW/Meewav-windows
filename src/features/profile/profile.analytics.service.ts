import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { isProfileLocalPreviewEnabled } from "./profile.preview";
import { SCENE_NAME } from "../shorts/sceneContract";
import type { StatsPeriod } from "./profile.data";

export type ProfileAnalyticsRow = {
  metric_date: string;
  source_pillar: string;
  metric_name: string;
  metric_value: number | string | null;
  unique_visitors: number | string | null;
  metadata: Record<string, unknown> | null;
};

export type ProfileAnalyticsMetricId = "reach" | "engagement" | "revenue" | "growth";

export type ProfileAnalyticsMetric = {
  value: string;
  delta: string;
  note: string;
  values: number[];
  available: boolean;
};

export type ProfileAnalyticsSource = {
  label: string;
  value: number;
  color: string;
};

export type ProfileAnalyticsAcquisition = {
  total: string;
  unit: string;
  delta: string;
  sources: ProfileAnalyticsSource[];
};

export type ProfileAnalyticsSnapshot = {
  period: StatsPeriod;
  label: string;
  range: string;
  axis: string[];
  axisLabels: [string, string, string];
  metrics: Record<ProfileAnalyticsMetricId, ProfileAnalyticsMetric>;
  acquisition: {
    discovery: ProfileAnalyticsAcquisition;
    conversion: ProfileAnalyticsAcquisition;
  };
  eventTotals: Record<string, number>;
  insight: {
    title: string;
    detail: string;
  };
  hasData: boolean;
};

export type ProfileAnalyticsDateRange = {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

const PARIS_TIME_ZONE = "Europe/Paris";
const DISCOVERY_EVENTS = new Set([
  "profile_view",
  "globe_profile_open",
  "search_result_view",
  "share_open",
  "room_card_view",
  "short_impression",
  "marketplace_listing_view",
  "tremplin_entry_view",
]);
const ENGAGEMENT_EVENTS = new Set([
  "media_play",
  "media_complete",
  "message_composer_open",
  "message_sent",
  "share_open",
  "follow_created",
  "collaboration_request_created",
  "collaboration_request_accepted",
  "room_entered",
  "marketplace_purchase",
]);
const CONVERSION_LABELS: Record<string, string> = {
  media_play: "Lecture d’un média",
  media_complete: "Média terminé",
  follow_created: "Abonnement",
  room_entered: "Entrée dans une Room",
  collaboration_request_created: "Demande de collaboration",
  collaboration_request_accepted: "Collaboration acceptée",
  share_open: "Partage",
  message_composer_open: "Ouverture de la messagerie",
  message_sent: "Message envoyé",
  marketplace_purchase: "Achat ou commande",
};
const SOURCE_COLORS: Record<string, string> = {
  [SCENE_NAME]: "#d946ef",
  Globe: "#8b5cff",
  Recherche: "#6b7cff",
  Rooms: "#19b8ff",
  Partages: "#34d399",
  Tremplin: "#ffd45e",
  Marketplace: "#ff8c69",
  "Accès direct": "#a7afc1",
  Messagerie: "#67e8f9",
  Autres: "#8a90a3",
  "Lecture d’un média": "#d946ef",
  "Média terminé": "#f472b6",
  Abonnement: "#8b5cff",
  "Entrée dans une Room": "#19b8ff",
  "Demande de collaboration": "#6b7cff",
  "Collaboration acceptée": "#818cf8",
  Partage: "#34d399",
  "Ouverture de la messagerie": "#67e8f9",
  "Message envoyé": "#ffd45e",
  "Achat ou commande": "#ff8c69",
};

export class ProfileAnalyticsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProfileAnalyticsError";
  }
}

function numeric(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDateFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(value: string, amount: number) {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDateFromUtc(date);
}

function addUtcMonths(value: string, amount: number) {
  const date = parseIsoDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return isoDateFromUtc(date);
}

function parisIsoDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getProfileAnalyticsDateRange(period: StatsPeriod, now = new Date()): ProfileAnalyticsDateRange {
  const to = parisIsoDate(now);
  if (period === "12m") {
    const currentMonth = `${to.slice(0, 7)}-01`;
    const from = addUtcMonths(currentMonth, -11);
    const previousTo = addUtcDays(from, -1);
    const previousFrom = addUtcMonths(from, -12);
    return { from, to, previousFrom, previousTo };
  }

  const days = period === "7d" ? 7 : 30;
  const from = addUtcDays(to, -(days - 1));
  const previousTo = addUtcDays(from, -1);
  const previousFrom = addUtcDays(previousTo, -(days - 1));
  return { from, to, previousFrom, previousTo };
}

type Bucket = { key: string; label: string };

function shortDateLabel(value: string, includeWeekday: boolean) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
  }).format(parseIsoDate(value)).replace(/\.$/, "");
}

function monthLabel(value: string) {
  const label = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    month: "short",
  }).format(parseIsoDate(value));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, "");
}

function longDateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseIsoDate(value));
}

function buildBuckets(period: StatsPeriod, from: string, to: string): Bucket[] {
  if (period === "12m") {
    const buckets: Bucket[] = [];
    let cursor = `${from.slice(0, 7)}-01`;
    const last = `${to.slice(0, 7)}-01`;
    while (cursor <= last) {
      buckets.push({ key: cursor.slice(0, 7), label: monthLabel(cursor) });
      cursor = addUtcMonths(cursor, 1);
    }
    return buckets;
  }

  const buckets: Bucket[] = [];
  for (let cursor = from; cursor <= to; cursor = addUtcDays(cursor, 1)) {
    buckets.push({ key: cursor, label: shortDateLabel(cursor, period === "7d") });
  }
  return buckets;
}

function bucketKey(period: StatsPeriod, metricDate: string) {
  return period === "12m" ? metricDate.slice(0, 7) : metricDate.slice(0, 10);
}

function eventName(row: ProfileAnalyticsRow) {
  return String(row.metric_name ?? "").trim().toLocaleLowerCase("fr-FR");
}

function sourceLabel(row: ProfileAnalyticsRow) {
  const event = eventName(row);
  if (event === "search_result_view") return "Recherche";
  if (event === "share_open") return "Partages";
  if (event === "globe_profile_open") return "Globe";
  if (event === "short_impression") return SCENE_NAME;
  if (event === "room_card_view") return "Rooms";
  if (event === "marketplace_listing_view") return "Marketplace";
  if (event === "tremplin_entry_view") return "Tremplin";

  const source = String(row.source_pillar ?? "").trim().toLocaleLowerCase("fr-FR");
  return ({
    profile: "Accès direct",
    globe: "Globe",
    messaging: "Messagerie",
    rooms: "Rooms",
    shorts: SCENE_NAME,
    marketplace: "Marketplace",
    tremplin: "Tremplin",
  } as Record<string, string>)[source] ?? "Autres";
}

function isRevenueEvent(name: string) {
  return name === "revenue_cents" || name === "gross_revenue_cents" || name === "net_revenue_cents";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(Math.round(value));
}

function formatEuros(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatDelta(value: number | null, suffix = "%") {
  if (value === null) return "Nouvelle donnée";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${suffix}`;
}

function percentageSources(values: Map<string, number>) {
  const total = [...values.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return [...values.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({
      label,
      value: Math.round((value / total) * 1000) / 10,
      color: SOURCE_COLORS[label] ?? SOURCE_COLORS.Autres,
    }));
}

function sumRows(rows: ProfileAnalyticsRow[], predicate: (row: ProfileAnalyticsRow) => boolean, selector: (row: ProfileAnalyticsRow) => number) {
  return rows.reduce((total, row) => predicate(row) ? total + selector(row) : total, 0);
}

function rowsByBucket(rows: ProfileAnalyticsRow[], period: StatsPeriod) {
  const grouped = new Map<string, ProfileAnalyticsRow[]>();
  rows.forEach((row) => {
    const key = bucketKey(period, row.metric_date);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  return grouped;
}

function reachForRows(rows: ProfileAnalyticsRow[]) {
  return sumRows(rows, (row) => DISCOVERY_EVENTS.has(eventName(row)), (row) => numeric(row.unique_visitors));
}

function engagementForRows(rows: ProfileAnalyticsRow[]) {
  const impressions = sumRows(
    rows,
    (row) => DISCOVERY_EVENTS.has(eventName(row)) || eventName(row) === "media_impression",
    (row) => numeric(row.metric_value),
  );
  const actions = sumRows(rows, (row) => ENGAGEMENT_EVENTS.has(eventName(row)), (row) => numeric(row.metric_value));
  return impressions > 0 ? (actions / impressions) * 100 : 0;
}

function revenueForRows(rows: ProfileAnalyticsRow[]) {
  return sumRows(rows, (row) => isRevenueEvent(eventName(row)), (row) => numeric(row.metric_value)) / 100;
}

function hasEvent(rows: ProfileAnalyticsRow[], predicate: (name: string) => boolean) {
  return rows.some((row) => predicate(eventName(row)));
}

function peakNote(values: number[], buckets: Bucket[], label: string) {
  if (!values.length || values.every((value) => value === 0)) return `${label} consolidé sans activité sur la période`;
  const peak = Math.max(...values);
  const index = values.indexOf(peak);
  return `pic le ${buckets[index]?.label ?? "dernier relevé"}`;
}

export function mapProfileAnalytics(
  currentRows: ProfileAnalyticsRow[],
  previousRows: ProfileAnalyticsRow[],
  period: StatsPeriod,
  now = new Date(),
): ProfileAnalyticsSnapshot {
  const range = getProfileAnalyticsDateRange(period, now);
  const buckets = buildBuckets(period, range.from, range.to);
  const previousBuckets = buildBuckets(period, range.previousFrom, range.previousTo);
  const currentGroups = rowsByBucket(currentRows, period);
  const previousGroups = rowsByBucket(previousRows, period);
  const byBucket = buckets.map((bucket) => currentGroups.get(bucket.key) ?? []);
  const previousByBucket = previousBuckets.map((bucket) => previousGroups.get(bucket.key) ?? []);

  const reachValuesRaw = byBucket.map(reachForRows);
  const previousReachValuesRaw = previousByBucket.map(reachForRows);
  const engagementValues = byBucket.map(engagementForRows);
  const revenueValues = byBucket.map(revenueForRows);
  const previousRevenueValues = previousByBucket.map(revenueForRows);
  const growthValues = reachValuesRaw.map((value, index) => percentDelta(value, previousReachValuesRaw[index] ?? 0) ?? 0);

  const reachTotal = reachValuesRaw.reduce((sum, value) => sum + value, 0);
  const previousReachTotal = previousReachValuesRaw.reduce((sum, value) => sum + value, 0);
  const currentImpressions = sumRows(currentRows, (row) => DISCOVERY_EVENTS.has(eventName(row)) || eventName(row) === "media_impression", (row) => numeric(row.metric_value));
  const previousImpressions = sumRows(previousRows, (row) => DISCOVERY_EVENTS.has(eventName(row)) || eventName(row) === "media_impression", (row) => numeric(row.metric_value));
  const currentActions = sumRows(currentRows, (row) => ENGAGEMENT_EVENTS.has(eventName(row)), (row) => numeric(row.metric_value));
  const previousActions = sumRows(previousRows, (row) => ENGAGEMENT_EVENTS.has(eventName(row)), (row) => numeric(row.metric_value));
  const engagement = currentImpressions > 0 ? (currentActions / currentImpressions) * 100 : 0;
  const previousEngagement = previousImpressions > 0 ? (previousActions / previousImpressions) * 100 : 0;
  const revenue = revenueValues.reduce((sum, value) => sum + value, 0);
  const previousRevenue = previousRevenueValues.reduce((sum, value) => sum + value, 0);
  const reachDelta = percentDelta(reachTotal, previousReachTotal);
  const revenueDelta = percentDelta(revenue, previousRevenue);
  const reachAvailable = hasEvent(currentRows, (name) => DISCOVERY_EVENTS.has(name));
  const engagementAvailable = hasEvent(currentRows, (name) => ENGAGEMENT_EVENTS.has(name)) || currentImpressions > 0;
  const revenueAvailable = hasEvent(currentRows, isRevenueEvent);

  const discoveryValues = new Map<string, number>();
  const conversionValues = new Map<string, number>();
  const eventTotals: Record<string, number> = {};
  currentRows.forEach((row) => {
    const name = eventName(row);
    const count = numeric(row.metric_value);
    eventTotals[name] = (eventTotals[name] ?? 0) + count;
    if (DISCOVERY_EVENTS.has(name)) {
      const label = sourceLabel(row);
      discoveryValues.set(label, (discoveryValues.get(label) ?? 0) + numeric(row.unique_visitors));
    }
    const conversionLabel = CONVERSION_LABELS[name];
    if (conversionLabel) conversionValues.set(conversionLabel, (conversionValues.get(conversionLabel) ?? 0) + count);
  });

  const previousDiscoveryTotal = previousReachTotal;
  const conversionTotal = [...conversionValues.values()].reduce((sum, value) => sum + value, 0);
  const previousConversionTotal = sumRows(previousRows, (row) => Boolean(CONVERSION_LABELS[eventName(row)]), (row) => numeric(row.metric_value));
  const axisLabels: [string, string, string] = [
    buckets[0]?.label ?? "Début",
    buckets[Math.floor((buckets.length - 1) / 2)]?.label ?? "Milieu",
    buckets[buckets.length - 1]?.label ?? "Aujourd’hui",
  ];
  const periodLabel = period === "7d" ? "7 jours" : period === "30d" ? "30 jours" : "12 mois";
  const dateRangeLabel = `${longDateLabel(range.from)} – ${longDateLabel(range.to)}`;
  const reachDeltaText = formatDelta(reachDelta);

  return {
    period,
    label: periodLabel,
    range: dateRangeLabel,
    axis: buckets.map((bucket) => bucket.label),
    axisLabels,
    metrics: {
      reach: {
        value: reachAvailable ? formatCompact(reachTotal) : "—",
        delta: reachAvailable ? reachDeltaText : "Non mesuré",
        note: reachAvailable ? peakNote(reachValuesRaw, buckets, "Portée") : "Aucune mesure de portée consolidée",
        values: reachValuesRaw.map((value) => value / 1_000),
        available: reachAvailable,
      },
      engagement: {
        value: engagementAvailable ? `${engagement.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—",
        delta: engagementAvailable ? formatDelta(engagement - previousEngagement, "pt") : "Non mesuré",
        note: engagementAvailable ? peakNote(engagementValues, buckets, "Engagement") : "Aucune interaction consolidée",
        values: engagementValues,
        available: engagementAvailable,
      },
      revenue: {
        value: revenueAvailable ? formatEuros(revenue) : "—",
        delta: revenueAvailable ? formatDelta(revenueDelta) : "Source financière indisponible",
        note: revenueAvailable ? peakNote(revenueValues, buckets, "Revenus") : "Les revenus ne sont pas encore reliés à l’analytics",
        values: revenueValues,
        available: revenueAvailable,
      },
      growth: {
        value: reachAvailable ? formatDelta(reachDelta) : "—",
        delta: reachAvailable ? `vs ${periodLabel.toLocaleLowerCase("fr-FR")} précédents` : "Non mesuré",
        note: reachAvailable ? "Comparaison à durée identique" : "La progression attend une première mesure de portée",
        values: growthValues,
        available: reachAvailable,
      },
    },
    acquisition: {
      discovery: {
        total: formatCompact(reachTotal),
        unit: "visiteurs attribués",
        delta: formatDelta(percentDelta(reachTotal, previousDiscoveryTotal)),
        sources: percentageSources(discoveryValues),
      },
      conversion: {
        total: formatCompact(conversionTotal),
        unit: "actions attribuées",
        delta: formatDelta(percentDelta(conversionTotal, previousConversionTotal)),
        sources: percentageSources(conversionValues),
      },
    },
    eventTotals,
    insight: reachAvailable
      ? {
          title: `Ton meilleur signal se situe le ${buckets[reachValuesRaw.indexOf(Math.max(...reachValuesRaw))]?.label ?? "dernier relevé"}.`,
          detail: `La lecture repose sur les événements consolidés du ${dateRangeLabel}. Les visiteurs sont additionnés par source et peuvent se recouper entre plusieurs piliers.`,
        }
      : {
          title: "Les premiers signaux apparaîtront ici.",
          detail: `Aucun événement de découverte n’est encore consolidé pour la période du ${dateRangeLabel}.`,
        },
    hasData: currentRows.length > 0,
  };
}

export function isProfileAnalyticsDemoFallbackEnabled() {
  return getDesktopApplicationMode() !== "live" && (isProfileLocalPreviewEnabled()
    || (import.meta.env.DEV && import.meta.env.VITE_PROFILE_DEMO_FALLBACK === "true"));
}

export function createProfileAnalyticsRepository(client: SupabaseClient = supabase) {
  const fetchRows = async (from: string, to: string) => {
    const { data, error } = await client.rpc("get_my_profile_metrics", {
      p_from: from,
      p_to: to,
    });
    if (error) {
      throw new ProfileAnalyticsError("profile-analytics-load-failed", "Les statistiques consolidées sont indisponibles pour le moment.");
    }
    return (data ?? []) as unknown as ProfileAnalyticsRow[];
  };

  return {
    async getDashboard(period: StatsPeriod, now = new Date()) {
      const range = getProfileAnalyticsDateRange(period, now);
      const [currentRows, previousRows] = await Promise.all([
        fetchRows(range.from, range.to),
        fetchRows(range.previousFrom, range.previousTo),
      ]);
      return mapProfileAnalytics(currentRows, previousRows, period, now);
    },
  };
}

export const profileAnalyticsRepository = createProfileAnalyticsRepository();
