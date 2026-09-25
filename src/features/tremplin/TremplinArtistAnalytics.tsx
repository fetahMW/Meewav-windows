import {
  ArrowUpRight,
  Eye,
  Info,
  Minus,
  MousePointerClick,
  TrendingDown,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { TremplinArtist, TremplinMetric } from "./tremplinArtistData";
import "./tremplin-artist-analytics.css";

type StatsPeriod = "7d" | "30d" | "12m";
type MetricId = "reach" | "engagement" | "community" | "regularity";

type MetricDefinition = {
  id: MetricId;
  label: string;
  icon: LucideIcon;
  accent: string;
  secondary: string;
  highlight: string;
  formatPoint: (value: number) => string;
};

type MetricSnapshot = {
  value: string;
  delta: string;
  direction: "up" | "down" | "stable";
  note: string;
  values: number[];
};

type PeriodSnapshot = {
  label: string;
  range: string;
  axis: string[];
  axisLabels: [string, string, string];
  metrics: Record<MetricId, MetricSnapshot>;
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

export type TremplinArtistAnalyticsProps = {
  artist: TremplinArtist;
};

const PERIOD_ORDER: StatsPeriod[] = ["7d", "30d", "12m"];
const METRIC_ORDER: MetricId[] = ["reach", "engagement", "community", "regularity"];

const PERIOD_META: Record<StatsPeriod, Pick<PeriodSnapshot, "label" | "range" | "axis" | "axisLabels">> = {
  "7d": {
    label: "7 jours",
    range: "20–26 juillet",
    axis: ["Lun. 20", "Mar. 21", "Mer. 22", "Jeu. 23", "Ven. 24", "Sam. 25", "Aujourd’hui"],
    axisLabels: ["20 juillet", "23 juillet", "Aujourd’hui"],
  },
  "30d": {
    label: "30 jours",
    range: "27 juin–26 juillet",
    axis: ["27 juin", "30 juin", "3 juil.", "6 juil.", "9 juil.", "12 juil.", "15 juil.", "18 juil.", "20 juil.", "22 juil.", "24 juil.", "Aujourd’hui"],
    axisLabels: ["27 juin", "12 juillet", "Aujourd’hui"],
  },
  "12m": {
    label: "12 mois",
    range: "Août 2025–juillet 2026",
    axis: ["Août", "Sept.", "Oct.", "Nov.", "Déc.", "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil."],
    axisLabels: ["Août 2025", "Février 2026", "Juillet 2026"],
  },
};

const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  reach: {
    id: "reach",
    label: "Portée",
    icon: Eye,
    accent: "#8b5cff",
    secondary: "#6b7cff",
    highlight: "#c7adff",
    formatPoint: (value) => formatCompact(value),
  },
  engagement: {
    id: "engagement",
    label: "Engagement",
    icon: MousePointerClick,
    accent: "#d946ef",
    secondary: "#8b5cff",
    highlight: "#ff7bf2",
    formatPoint: (value) => `${formatDecimal(value)} %`,
  },
  community: {
    id: "community",
    label: "Communauté",
    icon: UsersRound,
    accent: "#34d399",
    secondary: "#19b8ff",
    highlight: "#8af1c8",
    formatPoint: (value) => `${Math.round(value).toLocaleString("fr-FR")} membre${Math.round(value) > 1 ? "s" : ""}`,
  },
  regularity: {
    id: "regularity",
    label: "Régularité",
    icon: TrendingUp,
    accent: "#19b8ff",
    secondary: "#8b5cff",
    highlight: "#75dcff",
    formatPoint: (value) => `${formatDecimal(value)} %`,
  },
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function formatDecimal(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function formatCompact(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  }
  return Math.round(value).toLocaleString("fr-FR");
}

function hashSeed(value: string) {
  return [...value].reduce((total, character, index) => total + character.charCodeAt(0) * (index + 3), 17);
}

function extractFirstNumber(value: string | undefined) {
  const match = value?.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function metricBy(
  artist: TremplinArtist,
  predicate: (metric: TremplinMetric) => boolean,
) {
  return artist.metrics.find(predicate);
}

function lastValue(values: readonly number[], fallback: number) {
  return values.length > 0 ? values[values.length - 1] : fallback;
}

function directionalStart(end: number, naturalStart: number, seed: number) {
  const magnitude = Math.max(Math.abs(end - naturalStart), Math.abs(end) * 0.015, 0.1);
  const bucket = Math.abs(seed) % 9;
  if (bucket <= 1) return end;
  if (bucket <= 3) return end + magnitude * 0.62;
  return Math.max(0, end - magnitude);
}

function directionFromDelta(delta: number, stableThreshold: number): MetricSnapshot["direction"] {
  if (Math.abs(delta) <= stableThreshold) return "stable";
  return delta > 0 ? "up" : "down";
}

function signedDelta(delta: number, unit: string, stableThreshold: number) {
  if (Math.abs(delta) <= stableThreshold) return "Stable";
  return `${delta > 0 ? "+" : "−"}${formatDecimal(Math.abs(delta))}${unit}`;
}

function buildTrend(
  start: number,
  end: number,
  count: number,
  seed: number,
  volatility: number,
  monotonic = false,
) {
  if (count <= 1) return [Number(end.toFixed(1))];

  const values: number[] = [];
  const distance = Math.max(Math.abs(end - start), Math.abs(end) * 0.08, 1);

  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1);
    const easedRatio = ratio * ratio * (3 - 2 * ratio);
    const envelope = Math.sin(Math.PI * ratio);
    const wave = (
      Math.sin((index + seed * 0.13) * 1.61)
      + Math.cos((index + seed * 0.07) * 0.83) * 0.55
    ) * distance * volatility * envelope;
    let value = start + (end - start) * easedRatio + wave;

    if (monotonic && values.length > 0) {
      value = Math.max(values[values.length - 1], value);
    }

    values.push(Number(Math.max(0, value).toFixed(1)));
  }

  values[0] = Number(Math.max(0, start).toFixed(1));
  values[values.length - 1] = Number(Math.max(0, end).toFixed(1));
  return values;
}

function buildPoints(values: readonly number[], width = 720, height = 230, top = 24, bottom = 24, horizontalPadding = 8): ChartPoint[] {
  if (values.length === 0) return [];
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const range = Math.max(0.0001, maximum - minimum);

  return values.map((value, index) => ({
    x: horizontalPadding + (index / Math.max(1, values.length - 1)) * (width - horizontalPadding * 2),
    y: top + (1 - (value - minimum) / range) * (height - top - bottom),
    value,
  }));
}

function buildSmoothLine(points: readonly ChartPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return (next.y - point.y) / Math.max(0.0001, next.x - point.x);
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 0;
    return (before + after) / 2;
  });

  slopes.forEach((slope, index) => {
    if (Math.abs(slope) < 0.0001) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      return;
    }
    const startRatio = tangents[index] / slope;
    const endRatio = tangents[index + 1] / slope;
    const magnitude = Math.hypot(startRatio, endRatio);
    if (magnitude > 3) {
      const limiter = 3 / magnitude;
      tangents[index] = limiter * startRatio * slope;
      tangents[index + 1] = limiter * endRatio * slope;
    }
  });

  return points.slice(0, -1).reduce((path, point, index) => {
    const next = points[index + 1];
    const width = next.x - point.x;
    return `${path} C${point.x + width / 3} ${point.y + (tangents[index] * width) / 3} ${next.x - width / 3} ${next.y - (tangents[index + 1] * width) / 3} ${next.x} ${next.y}`;
  }, `M${points[0].x} ${points[0].y}`);
}

function buildArtistSnapshots(artist: TremplinArtist): Record<StatsPeriod, PeriodSnapshot> {
  const audienceMetric = metricBy(artist, (item) => item.id === "audience-engagee")
    ?? metricBy(artist, (item) => item.family === "audience");
  const communityMetric = metricBy(artist, (item) => item.id === "croissance-communaute")
    ?? metricBy(artist, (item) => item.family === "communaute");
  const regularityMetric = metricBy(artist, (item) => item.id === "regularite-sorties")
    ?? metricBy(artist, (item) => item.family === "parcours");

  const audienceHistory = audienceMetric?.values ?? [];
  const communityHistory = communityMetric?.values ?? [];
  const regularityHistory = regularityMetric?.values ?? [];
  const latestReach = Math.max(
    lastValue(audienceHistory, artist.community.memberCount * 14),
    artist.community.memberCount * 8,
  );
  const indicatorEngagement = extractFirstNumber(audienceMetric?.indicator) ?? 12;
  const communityMomentum = artist.community.newMembers30Days / Math.max(1, artist.community.memberCount);
  const latestEngagement = clamp(indicatorEngagement * 0.72 + communityMomentum * 18 + 2.2, 5.5, 24);
  const latestCommunity = Math.max(1, artist.community.memberCount);
  const latestRegularity = clamp(54 + artist.updates.length * 6 + Math.min(24, lastValue(regularityHistory, 4) * 2), 0, 100);
  const regularitySpan = Math.max(1, lastValue(regularityHistory, 1) - (regularityHistory[0] ?? 0));
  const seed = hashSeed(artist.id);

  const configs: Record<StatsPeriod, {
    reachStart: number;
    engagementStart: number;
    communityStart: number;
    regularityStart: number;
    volatility: number;
  }> = {
    "7d": {
      reachStart: latestReach * clamp(0.89 - (seed % 5) * 0.008, 0.82, 0.91),
      engagementStart: latestEngagement - clamp(0.45 + communityMomentum * 2.5, 0.4, 1.2),
      communityStart: latestCommunity - Math.max(1, Math.round(artist.community.newMembers30Days * 0.24)),
      regularityStart: latestRegularity - Math.min(4, Math.max(1, artist.updates.length)),
      volatility: 0.13,
    },
    "30d": {
      reachStart: latestReach * clamp(0.7 - (seed % 7) * 0.007, 0.62, 0.72),
      engagementStart: latestEngagement - clamp(1.25 + communityMomentum * 4, 1.2, 2.5),
      communityStart: latestCommunity - Math.max(1, artist.community.newMembers30Days),
      regularityStart: latestRegularity - Math.min(12, Math.max(4, artist.updates.length * 3)),
      volatility: 0.11,
    },
    "12m": {
      reachStart: Math.max((audienceHistory[0] ?? latestReach * 0.48) * 0.68, latestReach * 0.28),
      engagementStart: latestEngagement - clamp(3 + regularitySpan * 0.32, 2.8, 6.5),
      communityStart: Math.max(communityHistory[0] ?? latestCommunity * 0.42, latestCommunity * 0.25),
      regularityStart: Math.max(0, latestRegularity - clamp(24 + artist.updates.length * 5, 24, 52)),
      volatility: 0.09,
    },
  };

  return PERIOD_ORDER.reduce<Record<StatsPeriod, PeriodSnapshot>>((snapshots, period) => {
    const meta = PERIOD_META[period];
    const config = configs[period];
    const periodIndex = PERIOD_ORDER.indexOf(period);
    const count = meta.axis.length;
    const reachStart = directionalStart(latestReach, config.reachStart, seed + periodIndex * 17 + 3);
    const engagementStart = directionalStart(latestEngagement, config.engagementStart, seed + periodIndex * 19 + 11);
    const communityStart = directionalStart(latestCommunity, config.communityStart, seed + periodIndex * 23 + 19);
    const regularityStart = directionalStart(latestRegularity, config.regularityStart, seed + periodIndex * 29 + 29);
    const reachValues = buildTrend(reachStart, latestReach, count, seed + 3, config.volatility);
    const engagementValues = buildTrend(engagementStart, latestEngagement, count, seed + 11, config.volatility * 0.56);
    const communityValues = buildTrend(communityStart, latestCommunity, count, seed + 19, config.volatility * 0.38);
    const regularityValues = buildTrend(regularityStart, latestRegularity, count, seed + 29, config.volatility * 0.26);
    const reachDelta = ((latestReach - reachStart) / Math.max(1, reachStart)) * 100;
    const engagementDelta = latestEngagement - engagementStart;
    const communityDelta = latestCommunity - communityStart;
    const regularityDelta = latestRegularity - regularityStart;

    snapshots[period] = {
      ...meta,
      metrics: {
        reach: {
          value: formatCompact(latestReach),
          delta: signedDelta(reachDelta, " %", 0.15),
          direction: directionFromDelta(reachDelta, 0.15),
          note: audienceMetric?.title.toLocaleLowerCase("fr-FR") ?? "audience de l’artiste sur la période",
          values: reachValues,
        },
        engagement: {
          value: `${formatDecimal(latestEngagement)} %`,
          delta: signedDelta(engagementDelta, ` pt${Math.abs(engagementDelta) >= 2 ? "s" : ""}`, 0.05),
          direction: directionFromDelta(engagementDelta, 0.05),
          note: audienceMetric?.explanation ?? "Interactions autour des créations de l’artiste.",
          values: engagementValues,
        },
        community: {
          value: latestCommunity.toLocaleString("fr-FR"),
          delta: Math.abs(communityDelta) < 0.5 ? "Stable" : `${communityDelta > 0 ? "+" : "−"}${Math.round(Math.abs(communityDelta)).toLocaleString("fr-FR")}`,
          direction: directionFromDelta(communityDelta, 0.5),
          note: `${artist.community.newMembers30Days.toLocaleString("fr-FR")} nouveaux membres sur 30 jours · entrées et départs inclus`,
          values: communityValues,
        },
        regularity: {
          value: `${formatDecimal(latestRegularity)} %`,
          delta: signedDelta(regularityDelta, ` pt${Math.abs(regularityDelta) >= 2 ? "s" : ""}`, 0.05),
          direction: directionFromDelta(regularityDelta, 0.05),
          note: `${artist.updates.length} actualités récentes · dernière écoute : ${artist.audio.title}`,
          values: regularityValues,
        },
      },
    };
    return snapshots;
  }, {} as Record<StatsPeriod, PeriodSnapshot>);
}

export function TremplinArtistAnalytics({ artist }: TremplinArtistAnalyticsProps) {
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [metric, setMetric] = useState<MetricId>("reach");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [pinnedPointIndices, setPinnedPointIndices] = useState<number[]>([]);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const instanceId = useId().replace(/:/g, "");
  const snapshots = useMemo(() => buildArtistSnapshots(artist), [artist]);
  const snapshot = snapshots[period];
  const definition = METRIC_DEFINITIONS[metric];
  const currentMetric = snapshot.metrics[metric];
  const CurrentTrendIcon = currentMetric.direction === "up" ? TrendingUp : currentMetric.direction === "down" ? TrendingDown : Minus;
  const points = useMemo(() => buildPoints(currentMetric.values), [currentMetric.values]);
  const linePath = useMemo(() => buildSmoothLine(points), [points]);
  const defaultPointIndex = Math.max(0, points.length - 1);
  const lastPinnedPointIndex = pinnedPointIndices[pinnedPointIndices.length - 1] ?? null;
  const activePointIndex = hoveredPointIndex ?? lastPinnedPointIndex ?? defaultPointIndex;
  const previewPointIndex = hoveredPointIndex ?? (pinnedPointIndices.length === 0 ? defaultPointIndex : null);
  const previewPoint = previewPointIndex === null ? null : points[previewPointIndex];
  const titleId = `${instanceId}-title`;
  const explanationId = `${instanceId}-explanation`;
  const strokeGradientId = `${instanceId}-stroke-${metric}`;
  const areaGradientId = `${instanceId}-area-${metric}`;

  useEffect(() => {
    setHoveredPointIndex(null);
    setPinnedPointIndices([]);
  }, [artist.id, period, metric]);

  const pointIndexAt = (clientX: number, element: HTMLDivElement) => {
    const rectangle = element.getBoundingClientRect();
    const ratio = clamp((clientX - rectangle.left) / Math.max(1, rectangle.width), 0, 1);
    return Math.round(ratio * Math.max(0, points.length - 1));
  };

  const pinPoint = (index: number) => {
    setHoveredPointIndex(index);
    setPinnedPointIndices((current) => current.includes(index) ? current : [...current, index]);
  };

  const movePreviewPoint = (index: number) => {
    setHoveredPointIndex(clamp(index, 0, points.length - 1));
  };

  return (
    <section className="tremplin-artist-analytics" aria-labelledby={titleId}>
      <header className="tremplin-artist-analytics__shell-header">
        <h2 id={titleId}>Statistiques artistiques de {artist.name}</h2>
        <div className="tremplin-artist-analytics__shell-header-row">
          <p>Auditeurs, engagement, communauté et régularité artistique sur la période sélectionnée.</p>
          <div className="tremplin-artist-analytics__period-switch" aria-label="Période des statistiques artistiques">
            {PERIOD_ORDER.map((item) => (
              <button
                key={item}
                type="button"
                className={period === item ? "is-active" : ""}
                aria-pressed={period === item}
                onClick={() => setPeriod(item)}
              >
                {PERIOD_META[item].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="tremplin-artist-analytics__metrics" aria-label={`Indicateurs publics de ${artist.name}`}>
        {METRIC_ORDER.map((metricId) => {
          const item = METRIC_DEFINITIONS[metricId];
          const data = snapshot.metrics[metricId];
          const Icon = item.icon;
          const miniature = buildSmoothLine(buildPoints(data.values, 72, 24, 3, 3, 0));
          const sparklineGradientId = `${instanceId}-spark-${period}-${item.id}`;

          return (
            <button
              key={item.id}
              type="button"
              className={`tremplin-artist-analytics__stat-card ${metric === item.id ? "is-active" : ""}`}
              aria-pressed={metric === item.id}
              onClick={() => setMetric(item.id)}
              style={{ "--metric-accent": item.accent } as CSSProperties}
            >
              <span className="tremplin-artist-analytics__stat-icon"><Icon size={19} aria-hidden="true" /></span>
              <span className="tremplin-artist-analytics__stat-copy"><small>{item.label}</small><strong>{data.value}</strong></span>
              <span className={`tremplin-artist-analytics__stat-delta is-${data.direction}`}>{data.delta}</span>
              <svg className="tremplin-artist-analytics__sparkline" viewBox="0 0 72 24" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={sparklineGradientId} x1="0" x2="1">
                    <stop offset="0" stopColor={item.secondary} stopOpacity=".18" />
                    <stop offset=".38" stopColor={item.secondary} />
                    <stop offset=".72" stopColor={item.accent} />
                    <stop offset="1" stopColor={item.highlight} />
                  </linearGradient>
                </defs>
                <path d={miniature} stroke={`url(#${sparklineGradientId})`} />
              </svg>
            </button>
          );
        })}
      </div>

      <article
        className="tremplin-artist-analytics__panel tremplin-artist-analytics__main-chart"
        style={{
          "--chart-accent": definition.accent,
          "--chart-secondary": definition.secondary,
        } as CSSProperties}
      >
        <div className="tremplin-artist-analytics__panel-heading">
          <div>
            <span className="tremplin-artist-analytics__kicker">Évolution · {definition.label}</span>
            <h3>{snapshot.range}</h3>
          </div>
          <span className={`tremplin-artist-analytics__trend-pill is-${currentMetric.direction}`}><CurrentTrendIcon size={13} aria-hidden="true" /> {currentMetric.delta}</span>
        </div>

        <div className="tremplin-artist-analytics__chart-summary">
          <strong>{currentMetric.value}</strong>
          <span>{currentMetric.note}</span>
        </div>

        <div
          className={`tremplin-artist-analytics__chart-canvas ${pinnedPointIndices.length > 0 ? "is-pinned" : ""}`}
          role="group"
          tabIndex={0}
          aria-label={`Explorer les ${points.length} points de ${definition.label.toLocaleLowerCase("fr-FR")}. Survoler pour parcourir, cliquer pour conserver plusieurs labels, utiliser les flèches gauche et droite.`}
          onPointerMove={(event) => setHoveredPointIndex(pointIndexAt(event.clientX, event.currentTarget))}
          onPointerLeave={() => setHoveredPointIndex(null)}
          onClick={(event) => pinPoint(pointIndexAt(event.clientX, event.currentTarget))}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              movePreviewPoint(activePointIndex - 1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              movePreviewPoint(activePointIndex + 1);
            }
            if (event.key === "Home") {
              event.preventDefault();
              movePreviewPoint(0);
            }
            if (event.key === "End") {
              event.preventDefault();
              movePreviewPoint(points.length - 1);
            }
            if (event.key === "Escape") {
              setPinnedPointIndices([]);
              setHoveredPointIndex(null);
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              pinPoint(activePointIndex);
            }
          }}
        >
          <div className="tremplin-artist-analytics__chart-plot">
            <svg viewBox="0 0 720 230" preserveAspectRatio="none" role="img" aria-label={`Évolution de ${definition.label.toLocaleLowerCase("fr-FR")} sur ${snapshot.label}`}>
              <defs>
                <linearGradient id={strokeGradientId} x1="0" x2="1">
                  <stop offset="0" stopColor={definition.secondary} stopOpacity=".16" />
                  <stop offset=".18" stopColor={definition.secondary} stopOpacity=".78" />
                  <stop offset=".62" stopColor={definition.accent} />
                  <stop offset="1" stopColor={definition.highlight} />
                </linearGradient>
                <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={definition.accent} stopOpacity=".34" />
                  <stop offset="1" stopColor={definition.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="tremplin-artist-analytics__chart-grid" d="M0 36H720 M0 92H720 M0 148H720 M0 204H720" />
              {points[0] ? <line className="tremplin-artist-analytics__chart-baseline" x1="0" x2="720" y1={points[0].y} y2={points[0].y} /> : null}
              <path
                key={`area-${period}-${metric}`}
                d={`${linePath} L${points[points.length - 1]?.x ?? 720} 230 L${points[0]?.x ?? 0} 230 Z`}
                fill={`url(#${areaGradientId})`}
                className="tremplin-artist-analytics__chart-area"
              />
              <path key={`line-${period}-${metric}`} d={linePath} className="tremplin-artist-analytics__chart-line" stroke={`url(#${strokeGradientId})`} />
              {points[points.length - 1] ? (
                <g className="tremplin-artist-analytics__chart-current" aria-hidden="true">
                  <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="11" />
                  <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4.5" />
                </g>
              ) : null}
              {pinnedPointIndices.map((index) => {
                const point = points[index];
                return point ? <line key={`pinned-line-${index}`} x1={point.x} x2={point.x} y1="18" y2="214" className="tremplin-artist-analytics__chart-crosshair is-pinned" /> : null;
              })}
              {previewPoint && previewPointIndex !== null && !pinnedPointIndices.includes(previewPointIndex) && (
                <line x1={previewPoint.x} x2={previewPoint.x} y1="18" y2="214" className="tremplin-artist-analytics__chart-crosshair" />
              )}
            </svg>

            {points.map((point, index) => (
              <button
                key={`${period}-${metric}-${index}`}
                type="button"
                className={`tremplin-artist-analytics__chart-point ${index === previewPointIndex ? "is-active" : ""} ${pinnedPointIndices.includes(index) ? "is-pinned" : ""}`}
                style={{ left: `${(point.x / 720) * 100}%`, top: `${(point.y / 230) * 100}%` }}
                aria-label={`${snapshot.axis[index]} : ${definition.formatPoint(point.value)}`}
                aria-pressed={pinnedPointIndices.includes(index)}
                onFocus={() => setHoveredPointIndex(index)}
                onBlur={() => setHoveredPointIndex(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  pinPoint(index);
                }}
              />
            ))}

            {pinnedPointIndices.map((index) => {
              const point = points[index];
              if (!point) return null;
              return (
                <div
                  key={`pinned-label-${index}`}
                  className="tremplin-artist-analytics__chart-tooltip is-pinned"
                  style={{
                    left: `${(point.x / 720) * 100}%`,
                    top: `${(point.y / 230) * 100}%`,
                    transform: `translate(${index === 0 ? "0" : index === points.length - 1 ? "-100%" : "-50%"}, calc(-100% - 15px))`,
                  }}
                  role="status"
                >
                  <button
                    type="button"
                    aria-label={`Retirer le label du ${snapshot.axis[index]}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPinnedPointIndices((current) => current.filter((item) => item !== index));
                    }}
                  >×</button>
                  <span>{snapshot.axis[index]}</span>
                  <strong>{definition.formatPoint(point.value)}</strong>
                </div>
              );
            })}

            {previewPoint && previewPointIndex !== null && !pinnedPointIndices.includes(previewPointIndex) && (
              <div
                className="tremplin-artist-analytics__chart-tooltip"
                style={{
                  left: `${(previewPoint.x / 720) * 100}%`,
                  top: `${(previewPoint.y / 230) * 100}%`,
                  transform: `translate(${previewPointIndex === 0 ? "0" : previewPointIndex === points.length - 1 ? "-100%" : "-50%"}, calc(-100% - 15px))`,
                }}
                role="status"
                aria-live="polite"
              >
                <span>{snapshot.axis[previewPointIndex]}</span>
                <strong>{definition.formatPoint(previewPoint.value)}</strong>
              </div>
            )}
          </div>

          <div className="tremplin-artist-analytics__chart-labels">
            <span>{snapshot.axisLabels[0]}</span>
            <span>{snapshot.axisLabels[1]}</span>
            <span>{snapshot.axisLabels[2]}</span>
          </div>
        </div>

        <div className="tremplin-artist-analytics__chart-footer">
          <span><i /> Données de démonstration · cohérence de période contrôlée</span>
          <span className={pinnedPointIndices.length > 0 ? "is-pinned" : ""}>
            {pinnedPointIndices.length > 0
              ? `${pinnedPointIndices.length} label${pinnedPointIndices.length > 1 ? "s" : ""} conservé${pinnedPointIndices.length > 1 ? "s" : ""} · ferme chaque croix pour le retirer`
              : <><MousePointerClick size={11} aria-hidden="true" /> Survole ou touche · clic pour conserver un label</>}
          </span>
        </div>
      </article>

      <aside className="tremplin-artist-analytics__panel tremplin-artist-analytics__disclaimer" aria-label="Lecture des statistiques artistiques">
        <span className="tremplin-artist-analytics__disclaimer-icon"><Info size={20} aria-hidden="true" /></span>
        <div>
          <strong>Des repères concrets pour comprendre le parcours</strong>
          <p>Ces indicateurs décrivent l’activité artistique et communautaire. Ils ne déterminent pas automatiquement la valeur du jeton.</p>
          {explanationOpen && (
            <p id={explanationId} className="tremplin-artist-analytics__disclaimer-detail">
              La portée, l’engagement, la communauté et la régularité aident à comprendre le chemin parcouru. Une hausse de ces courbes ne modifie jamais automatiquement le mécanisme de calcul de la valeur et ne garantit aucun résultat financier.
            </p>
          )}
        </div>
        <button
          type="button"
          className="tremplin-artist-analytics__primary-button"
          aria-expanded={explanationOpen}
          aria-controls={explanationId}
          onClick={() => setExplanationOpen((current) => !current)}
        >
          {explanationOpen ? "Réduire" : "Comment lire ces données"} <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </aside>
    </section>
  );
}

export default TremplinArtistAnalytics;
