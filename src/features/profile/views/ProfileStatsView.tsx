import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Eye,
  Lightbulb,
  LoaderCircle,
  Minus,
  MousePointerClick,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { getGradeBadgeMeta, type GradeLevel } from "../../grades/gradeBadges";
import { SCENE_NAME } from "../../shorts/sceneContract";
import type { StatsPeriod } from "../profile.data";
import {
  isProfileAnalyticsDemoFallbackEnabled,
  profileAnalyticsRepository,
  type ProfileAnalyticsSnapshot,
} from "../profile.analytics.service";
import ProfileRankingPanel from "../components/ProfileRankingPanel";
import { isProfileLocalPreviewEnabled } from "../profile.preview";

type ProfileStatsViewProps = {
  gradeLevel: GradeLevel;
  gradeProgress: number;
  pointsToNextGrade: number;
  onToast: (message: string) => void;
};

type MetricId = "reach" | "engagement" | "revenue" | "growth";

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
  note: string;
  values: number[];
  available?: boolean;
};

type AcquisitionMode = "discovery" | "conversion";

type AcquisitionSource = {
  label: string;
  value: number;
  color: string;
};

type AcquisitionDataset = {
  total: string;
  unit: string;
  delta: string;
  sources: AcquisitionSource[];
};

type GoalSnapshot = {
  id: string;
  label: string;
  progress: number;
  value: string;
};

type PeriodSnapshot = {
  label: string;
  range: string;
  axis: string[];
  axisLabels: [string, string, string];
  goals: GoalSnapshot[];
  insight: {
    title: string;
    detail: string;
  };
  metrics: Record<MetricId, MetricSnapshot>;
};

const periodOrder: StatsPeriod[] = ["7d", "30d", "12m"];
const periodLabels: Record<StatsPeriod, string> = { "7d": "7 jours", "30d": "30 jours", "12m": "12 mois" };
const metricOrder: MetricId[] = ["reach", "engagement", "revenue", "growth"];

const metricDefinitions: Record<MetricId, MetricDefinition> = {
  reach: {
    id: "reach",
    label: "Portée",
    icon: Eye,
    accent: "#8b5cff",
    secondary: "#6b7cff",
    highlight: "#c7adff",
    formatPoint: (value) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`,
  },
  engagement: {
    id: "engagement",
    label: "Engagement",
    icon: MousePointerClick,
    accent: "#d946ef",
    secondary: "#8b5cff",
    highlight: "#ff7bf2",
    formatPoint: (value) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
  },
  revenue: {
    id: "revenue",
    label: "Revenus",
    icon: CircleDollarSign,
    accent: "#34d399",
    secondary: "#19b8ff",
    highlight: "#8af1c8",
    formatPoint: (value) => `${Math.round(value).toLocaleString("fr-FR")} €`,
  },
  growth: {
    id: "growth",
    label: "Progression",
    icon: TrendingUp,
    accent: "#19b8ff",
    secondary: "#8b5cff",
    highlight: "#75dcff",
    formatPoint: (value) => `+${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
  },
};

const statsSnapshots: Record<StatsPeriod, PeriodSnapshot> = {
  "7d": {
    label: "7 jours",
    range: "9–15 juillet",
    axis: ["Mer. 9", "Jeu. 10", "Ven. 11", "Sam. 12", "Dim. 13", "Lun. 14", "Mar. 15"],
    axisLabels: ["9 juil.", "12 juil.", "Aujourd’hui"],
    goals: [
      { id: "revenue", label: "Atteindre 1 500 €", progress: 83, value: "1 240 €" },
      { id: "followers", label: "Gagner 250 abonnés", progress: 72, value: "+181" },
      { id: "content", label: "Publier 2 contenus", progress: 50, value: "1 / 2" },
    ],
    insight: {
      title: "Publie ce soir entre 21 h 35 et 22 h 05.",
      detail: "Le pic d’écoute des sept derniers jours se concentre sur cette fenêtre. Les sessions live y retiennent 1,9× plus longtemps.",
    },
    metrics: {
      reach: { value: "48,2 k", delta: "+8,4 %", note: "pic mardi à 22:14", values: [5.8, 6.4, 5.9, 7.7, 6.9, 7.2, 8.3] },
      engagement: { value: "13,6 %", delta: "+1,1 pt", note: "meilleur taux dimanche", values: [10.8, 12.2, 11.4, 13.8, 15.1, 12.9, 13.6] },
      revenue: { value: "1 240 €", delta: "+9,8 %", note: "364 € générés mardi", values: [92, 214, 365, 498, 644, 876, 1240] },
      growth: { value: "+8,4 %", delta: "+2,1 pts", note: "accélération sur 48 h", values: [1.1, 2.4, 2.8, 4.6, 5.2, 6.1, 8.4] },
    },
  },
  "30d": {
    label: "30 jours",
    range: "16 juin–15 juillet",
    axis: ["16 juin", "19 juin", "22 juin", "25 juin", "28 juin", "1 juil.", "4 juil.", "7 juil.", "9 juil.", "11 juil.", "13 juil.", "15 juil."],
    axisLabels: ["16 juin", "1 juillet", "Aujourd’hui"],
    goals: [
      { id: "revenue", label: "Atteindre 5 000 €", progress: 74, value: "3 698 €" },
      { id: "followers", label: "Gagner 1 000 abonnés", progress: 86, value: "+862" },
      { id: "content", label: "Publier 4 contenus", progress: 50, value: "2 / 4" },
    ],
    insight: {
      title: "Publie la prochaine vidéo entre 21 h 20 et 22 h.",
      detail: "Tes trois meilleures performances ont démarré dans cette fenêtre. Les contenus « session » retiennent 1,7× plus longtemps.",
    },
    metrics: {
      reach: { value: "128,4 k", delta: "+18,7 %", note: "pic mardi à 22:14", values: [78, 84, 80, 91, 88, 102, 99, 111, 108, 119, 121, 128.4] },
      engagement: { value: "12,8 %", delta: "+2,4 pts", note: "meilleur taux le 9 juillet", values: [9.8, 10.3, 11.5, 10.9, 12.1, 11.6, 13.4, 12.9, 12.2, 13.1, 12.5, 12.8] },
      revenue: { value: "2 940 €", delta: "+12,2 %", note: "meilleure journée le 13 juillet", values: [95, 180, 420, 390, 680, 920, 1180, 1350, 1690, 2050, 2440, 2940] },
      growth: { value: "+18,7 %", delta: "+4,8 pts", note: "rythme record cette semaine", values: [1.2, 2.8, 2.1, 4.5, 5.2, 7.8, 8.1, 10.6, 12.4, 13.2, 15.1, 18.7] },
    },
  },
  "12m": {
    label: "12 mois",
    range: "Août 2025–juillet 2026",
    axis: ["Août", "Sept.", "Oct.", "Nov.", "Déc.", "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil."],
    axisLabels: ["Août 2025", "Février 2026", "Juillet 2026"],
    goals: [
      { id: "revenue", label: "Atteindre 30 000 €", progress: 95, value: "28 460 €" },
      { id: "followers", label: "Gagner 25 000 abonnés", progress: 82, value: "+20,5 k" },
      { id: "content", label: "Publier 48 contenus", progress: 88, value: "42 / 48" },
    ],
    insight: {
      title: "Ton format live est devenu ton meilleur levier annuel.",
      detail: "Il génère 34 % de revenus de plus par vue et convertit deux fois mieux les visiteurs en abonnés que les autres formats.",
    },
    metrics: {
      reach: { value: "1,42 M", delta: "+72,1 %", note: "record annuel en juillet", values: [82, 96, 118, 127, 142, 156, 183, 201, 236, 268, 301, 352] },
      engagement: { value: "11,9 %", delta: "+3,2 pts", note: "stabilité haute depuis avril", values: [7.8, 8.4, 9.2, 8.8, 9.7, 10.1, 9.8, 10.6, 11.4, 12.2, 11.7, 11.9] },
      revenue: { value: "28 460 €", delta: "+68,4 %", note: "4 120 € générés en juillet", values: [1180, 2640, 4380, 6100, 7950, 10180, 12440, 15120, 18190, 21640, 24340, 28460] },
      growth: { value: "+72,1 %", delta: "+19,6 pts", note: "accélération depuis mars", values: [4.2, 8.1, 13.4, 17.8, 23.2, 29.6, 33.1, 41.8, 49.2, 56.7, 63.4, 72.1] },
    },
  },
};

const acquisitionSnapshots: Record<StatsPeriod, Record<AcquisitionMode, AcquisitionDataset>> = {
  "7d": {
    discovery: {
      total: "48,2 k",
      unit: "visiteurs uniques",
      delta: "+8,4 %",
      sources: [
        { label: SCENE_NAME, value: 59, color: "#d946ef" },
        { label: "Globe", value: 16, color: "#8b5cff" },
        { label: "Recherche", value: 8, color: "#6b7cff" },
        { label: "Rooms", value: 7, color: "#19b8ff" },
        { label: "Partages", value: 4, color: "#34d399" },
        { label: "Tremplin", value: 3, color: "#ffd45e" },
        { label: "Marketplace", value: 2, color: "#ff8c69" },
        { label: "Accès direct", value: 1, color: "#a7afc1" },
      ],
    },
    conversion: {
      total: "6,9 k",
      unit: "actions attribuées",
      delta: "+7,1 %",
      sources: [
        { label: "Lecture d’un média", value: 36, color: "#d946ef" },
        { label: "Abonnement", value: 22, color: "#8b5cff" },
        { label: "Entrée dans une Room", value: 16, color: "#19b8ff" },
        { label: "Demande de collaboration", value: 11, color: "#6b7cff" },
        { label: "Partage", value: 7, color: "#34d399" },
        { label: "Message envoyé", value: 5, color: "#ffd45e" },
        { label: "Achat ou commande", value: 3, color: "#ff8c69" },
      ],
    },
  },
  "30d": {
    discovery: {
      total: "128 k",
      unit: "visiteurs uniques",
      delta: "+18,7 %",
      sources: [
        { label: SCENE_NAME, value: 54, color: "#d946ef" },
        { label: "Globe", value: 18, color: "#8b5cff" },
        { label: "Recherche", value: 10, color: "#6b7cff" },
        { label: "Rooms", value: 7, color: "#19b8ff" },
        { label: "Partages", value: 5, color: "#34d399" },
        { label: "Tremplin", value: 3, color: "#ffd45e" },
        { label: "Marketplace", value: 2, color: "#ff8c69" },
        { label: "Accès direct", value: 1, color: "#a7afc1" },
      ],
    },
    conversion: {
      total: "18,6 k",
      unit: "actions attribuées",
      delta: "+12,4 %",
      sources: [
        { label: "Lecture d’un média", value: 34, color: "#d946ef" },
        { label: "Abonnement", value: 24, color: "#8b5cff" },
        { label: "Entrée dans une Room", value: 15, color: "#19b8ff" },
        { label: "Demande de collaboration", value: 10, color: "#6b7cff" },
        { label: "Partage", value: 8, color: "#34d399" },
        { label: "Message envoyé", value: 6, color: "#ffd45e" },
        { label: "Achat ou commande", value: 3, color: "#ff8c69" },
      ],
    },
  },
  "12m": {
    discovery: {
      total: "1,42 M",
      unit: "visiteurs uniques",
      delta: "+72,1 %",
      sources: [
        { label: SCENE_NAME, value: 46, color: "#d946ef" },
        { label: "Globe", value: 20, color: "#8b5cff" },
        { label: "Recherche", value: 11, color: "#6b7cff" },
        { label: "Rooms", value: 8, color: "#19b8ff" },
        { label: "Partages", value: 6, color: "#34d399" },
        { label: "Tremplin", value: 4, color: "#ffd45e" },
        { label: "Marketplace", value: 3, color: "#ff8c69" },
        { label: "Accès direct", value: 2, color: "#a7afc1" },
      ],
    },
    conversion: {
      total: "208 k",
      unit: "actions attribuées",
      delta: "+61,3 %",
      sources: [
        { label: "Lecture d’un média", value: 31, color: "#d946ef" },
        { label: "Abonnement", value: 26, color: "#8b5cff" },
        { label: "Entrée dans une Room", value: 14, color: "#19b8ff" },
        { label: "Demande de collaboration", value: 9, color: "#6b7cff" },
        { label: "Partage", value: 8, color: "#34d399" },
        { label: "Message envoyé", value: 7, color: "#ffd45e" },
        { label: "Achat ou commande", value: 5, color: "#ff8c69" },
      ],
    },
  },
};

type ChartPoint = { x: number; y: number; value: number };

function buildPoints(values: number[], width = 720, height = 230, top = 24, bottom = 24, horizontalPadding = 0): ChartPoint[] {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(0.0001, max - min);
  return values.map((value, index) => ({
    x: horizontalPadding + (index / Math.max(1, values.length - 1)) * (width - horizontalPadding * 2),
    y: top + (1 - (value - min) / range) * (height - top - bottom),
    value,
  }));
}

function buildSmoothLine(points: ChartPoint[]) {
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
    const segmentWidth = next.x - point.x;
    const control1X = point.x + segmentWidth / 3;
    const control1Y = point.y + (tangents[index] * segmentWidth) / 3;
    const control2X = next.x - segmentWidth / 3;
    const control2Y = next.y - (tangents[index + 1] * segmentWidth) / 3;
    return `${path} C${control1X} ${control1Y} ${control2X} ${control2Y} ${next.x} ${next.y}`;
  }, `M${points[0].x} ${points[0].y}`);
}

const emptyMetric = (note: string): MetricSnapshot => ({
  value: "—",
  delta: "Non mesuré",
  note,
  values: [],
  available: false,
});

function emptyPeriodSnapshot(period: StatsPeriod): PeriodSnapshot {
  return {
    label: periodLabels[period],
    range: "Période en cours",
    axis: [],
    axisLabels: ["Début", "Milieu", "Aujourd’hui"],
    goals: [],
    insight: {
      title: "Les premiers signaux apparaîtront ici.",
      detail: "Aucune donnée consolidée n’est encore disponible sur cette période.",
    },
    metrics: {
      reach: emptyMetric("Aucune mesure de portée consolidée"),
      engagement: emptyMetric("Aucune interaction consolidée"),
      revenue: emptyMetric("Les revenus ne sont pas encore reliés à l’analytics"),
      growth: emptyMetric("La progression attend une première mesure de portée"),
    },
  };
}

function toPeriodSnapshot(snapshot: ProfileAnalyticsSnapshot): PeriodSnapshot {
  return {
    label: snapshot.label,
    range: snapshot.range,
    axis: snapshot.axis,
    axisLabels: snapshot.axisLabels,
    goals: [],
    insight: snapshot.insight,
    metrics: snapshot.metrics,
  };
}

type AnalyticsLoadState = {
  status: "loading" | "ready" | "empty" | "error";
  data: ProfileAnalyticsSnapshot | null;
  message: string | null;
};

export default function ProfileStatsView({ gradeLevel, gradeProgress, pointsToNextGrade, onToast }: ProfileStatsViewProps) {
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [metric, setMetric] = useState<MetricId>("revenue");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [pinnedPointIndices, setPinnedPointIndices] = useState<number[]>([]);
  const [acquisitionMode, setAcquisitionMode] = useState<AcquisitionMode>("discovery");
  const [activeAcquisitionSource, setActiveAcquisitionSource] = useState<string | null>(null);
  const [goalsEditing, setGoalsEditing] = useState(false);
  const [goalScales, setGoalScales] = useState<Record<string, number>>({});
  const [planned, setPlanned] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("Aujourd’hui · 21:20");
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  const [analyticsState, setAnalyticsState] = useState<AnalyticsLoadState>({ status: "loading", data: null, message: null });
  const nextGradeLevel = Math.min(6, gradeLevel + 1) as GradeLevel;
  const nextGradeMeta = getGradeBadgeMeta(nextGradeLevel);

  const localPreviewEnabled = isProfileLocalPreviewEnabled();
  const demoFallbackEnabled = isProfileAnalyticsDemoFallbackEnabled();
  const usesDemoFallback = demoFallbackEnabled && analyticsState.status !== "ready";
  const snapshot = useMemo(() => analyticsState.data
    ? toPeriodSnapshot(analyticsState.data)
    : usesDemoFallback
      ? statsSnapshots[period]
      : emptyPeriodSnapshot(period), [analyticsState.data, usesDemoFallback, period]);
  const definition = metricDefinitions[metric];
  const currentMetric = snapshot.metrics[metric];
  const points = useMemo(() => buildPoints(currentMetric.values, 720, 230, 24, 24, 8), [currentMetric.values]);
  const linePath = useMemo(() => buildSmoothLine(points), [points]);
  const defaultPointIndex = Math.max(0, points.length - 1);
  const lastPinnedPointIndex = pinnedPointIndices[pinnedPointIndices.length - 1] ?? null;
  const activePointIndex = hoveredPointIndex ?? lastPinnedPointIndex ?? defaultPointIndex;
  const previewPointIndex = hoveredPointIndex ?? (pinnedPointIndices.length === 0 ? defaultPointIndex : null);
  const previewPoint = previewPointIndex === null ? null : points[previewPointIndex];
  const acquisition = analyticsState.data?.acquisition[acquisitionMode]
    ?? (usesDemoFallback
      ? acquisitionSnapshots[period][acquisitionMode]
      : { total: "0", unit: acquisitionMode === "discovery" ? "visiteurs attribués" : "actions attribuées", delta: "Non mesuré", sources: [] });
  const selectedAcquisitionSource = acquisition.sources.find((source) => source.label === activeAcquisitionSource) ?? null;

  useEffect(() => {
    // Use the existing period/acquisition mock datasets directly in preview.
    // A missing session must not become a stream of failed metrics requests.
    if (localPreviewEnabled) {
      setAnalyticsState({ status: "empty", data: null, message: null });
      return;
    }
    let active = true;
    setAnalyticsState({ status: "loading", data: null, message: null });
    profileAnalyticsRepository.getDashboard(period)
      .then((data) => {
        if (!active) return;
        setAnalyticsState({
          status: data.hasData ? "ready" : "empty",
          data: data.hasData ? data : null,
          message: data.hasData ? null : "Aucune donnée statistique n’est encore consolidée pour cette période.",
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAnalyticsState({
          status: "error",
          data: null,
          message: error instanceof Error ? error.message : "Les statistiques sont indisponibles pour le moment.",
        });
      });
    return () => {
      active = false;
    };
  }, [localPreviewEnabled, period, analyticsReloadKey]);

  useEffect(() => {
    setHoveredPointIndex(null);
    setPinnedPointIndices((current) => current.length ? [] : current);
  }, [currentMetric.values]);

  useEffect(() => {
    setActiveAcquisitionSource(null);
  }, [period, acquisitionMode]);

  useEffect(() => {
    if (!analyticsState.data || analyticsState.data.metrics[metric].available) return;
    const firstAvailable = metricOrder.find((metricId) => analyticsState.data?.metrics[metricId].available);
    if (firstAvailable) setMetric(firstAvailable);
  }, [analyticsState.data, metric]);

  const changePeriod = (nextPeriod: StatsPeriod) => {
    setPeriod(nextPeriod);
    onToast(`Chargement des statistiques sur ${periodLabels[nextPeriod].toLowerCase()}`);
  };

  const adjustGoal = (goalId: string, delta: number) => {
    const storageKey = `${period}-${goalId}`;
    setGoalScales((current) => ({
      ...current,
      [storageKey]: Math.min(140, Math.max(70, (current[storageKey] ?? 100) + delta)),
    }));
  };

  const pointIndexAt = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(ratio * Math.max(0, points.length - 1));
  };

  const pinPoint = (index: number) => {
    setHoveredPointIndex(index);
    setPinnedPointIndices((current) => current.includes(index) ? current : [...current, index]);
  };

  const movePreviewPoint = (index: number) => {
    setHoveredPointIndex(Math.min(points.length - 1, Math.max(0, index)));
  };

  const statsHeader = (
    <header className="profile-private-shell-header profile-stats-shell-header">
      <h2>Statistiques du profil</h2>
      <div className="profile-private-shell-header__row profile-stats-shell-header__row">
        <p>Portée, engagement, revenus et progression sur la période sélectionnée.</p>
        <div className="profile-period-switch" aria-label="Période des statistiques">
          {periodOrder.map((item) => (
            <button key={item} type="button" className={period === item ? "is-active" : ""} aria-pressed={period === item} onClick={() => changePeriod(item)}>
              {periodLabels[item]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );

  if (!analyticsState.data && !usesDemoFallback) {
    const loading = analyticsState.status === "loading";
    return (
      <div className="profile-view profile-stats-view" aria-label="Statistiques du profil" aria-busy={loading}>
        {statsHeader}
        <div className="profile-empty-state" role={analyticsState.status === "error" ? "alert" : "status"}>
          {loading ? <LoaderCircle size={32} /> : analyticsState.status === "error" ? <AlertTriangle size={32} /> : <BarChart3 size={32} />}
          <h3>{loading ? "Consolidation des statistiques" : analyticsState.status === "error" ? "Statistiques indisponibles" : "Aucune donnée sur cette période"}</h3>
          <p>{loading ? "Les signaux de ton profil arrivent…" : analyticsState.message}</p>
          {!loading && <button type="button" onClick={() => setAnalyticsReloadKey((value) => value + 1)}>Réessayer</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-view profile-stats-view" aria-label="Statistiques du profil">
      {statsHeader}

      <div className="profile-stats-metrics">
        {metricOrder.map((metricId) => {
          const item = metricDefinitions[metricId];
          const data = snapshot.metrics[metricId];
          const Icon = item.icon;
          const miniature = buildSmoothLine(buildPoints(data.values, 72, 24, 3, 3));
          const sparklineGradientId = `profile-stat-spark-${period}-${item.id}`;
          return (
            <button
              key={item.id}
              type="button"
              className={`profile-stat-card ${metric === item.id ? "is-active" : ""}`}
              aria-pressed={metric === item.id}
              onClick={() => setMetric(item.id)}
              style={{ "--metric-accent": item.accent } as React.CSSProperties}
            >
              <span className="profile-stat-card__icon"><Icon size={19} /></span>
              <span className="profile-stat-card__copy"><small>{item.label}</small><strong>{data.value}</strong></span>
              {item.id === "growth" ? (
                <span className="profile-stat-card__grade"><MeewavGradeBadge level={gradeLevel} size="xs" variant="icon" /><small>Niveau {gradeLevel}</small></span>
              ) : <span className="profile-stat-card__delta">{data.delta}</span>}
              {data.available !== false && <svg className="profile-stat-card__sparkline" viewBox="0 0 72 24" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={sparklineGradientId} x1="0" x2="1">
                    <stop offset="0" stopColor={item.secondary} stopOpacity=".18" />
                    <stop offset=".38" stopColor={item.secondary} />
                    <stop offset=".72" stopColor={item.accent} />
                    <stop offset="1" stopColor={item.highlight} />
                  </linearGradient>
                </defs>
                <path d={miniature} style={{ stroke: `url(#${sparklineGradientId})` }} />
              </svg>}
            </button>
          );
        })}
      </div>

      <div className="profile-stats-layout">
        <article className="profile-panel profile-main-chart" style={{ "--chart-accent": definition.accent, "--chart-secondary": definition.secondary } as React.CSSProperties}>
          <div className="profile-panel__heading">
            <div>
              <span className="profile-kicker">Évolution · {definition.label}</span>
              <h3>{snapshot.range}</h3>
            </div>
            <span className="profile-positive-pill"><TrendingUp size={13} /> {currentMetric.delta}</span>
          </div>
          <div className="profile-main-chart__summary">
            <strong>{currentMetric.value}</strong>
            <span>{currentMetric.note}</span>
          </div>
          <div
            className={`profile-main-chart__canvas ${pinnedPointIndices.length > 0 ? "is-pinned" : ""}`}
            role="group"
            tabIndex={0}
            aria-label={`Explorer les ${points.length} points de ${definition.label.toLowerCase()}. Survoler pour parcourir, cliquer pour conserver plusieurs labels, utiliser les flèches gauche et droite.`}
            onPointerMove={(event) => currentMetric.available !== false && setHoveredPointIndex(pointIndexAt(event.clientX, event.currentTarget))}
            onPointerLeave={() => setHoveredPointIndex(null)}
            onClick={(event) => currentMetric.available !== false && pinPoint(pointIndexAt(event.clientX, event.currentTarget))}
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
              if (event.key === "Home") movePreviewPoint(0);
              if (event.key === "End") movePreviewPoint(points.length - 1);
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
            {currentMetric.available === false && (
              <div className="profile-empty-state" role="status">
                <BarChart3 size={28} />
                <h3>{currentMetric.note}</h3>
                <p>Cette métrique apparaîtra dès qu’une source fiable sera consolidée.</p>
              </div>
            )}
            <div className="profile-chart-plot" style={currentMetric.available === false ? { display: "none" } : undefined}>
              <svg viewBox="0 0 720 230" preserveAspectRatio="none" role="img" aria-label={`Évolution de ${definition.label.toLowerCase()} sur ${snapshot.label}`}>
                <defs>
                  <linearGradient id={`profile-stats-stroke-${metric}`} x1="0" x2="1">
                    <stop offset="0" stopColor={definition.secondary} stopOpacity=".16" />
                    <stop offset=".18" stopColor={definition.secondary} stopOpacity=".78" />
                    <stop offset=".62" stopColor={definition.accent} />
                    <stop offset="1" stopColor={definition.highlight} />
                  </linearGradient>
                  <linearGradient id={`profile-stats-area-${metric}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={definition.accent} stopOpacity=".34" />
                    <stop offset="1" stopColor={definition.accent} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="profile-chart-grid" d="M0 36H720 M0 92H720 M0 148H720 M0 204H720" />
                <path
                  key={`area-${period}-${metric}`}
                  d={`${linePath} L${points[points.length - 1]?.x ?? 720} 230 L${points[0]?.x ?? 0} 230 Z`}
                  fill={`url(#profile-stats-area-${metric})`}
                  className="profile-chart-area"
                />
                <path key={`line-${period}-${metric}`} d={linePath} className="profile-chart-line" stroke={`url(#profile-stats-stroke-${metric})`} />
                {pinnedPointIndices.map((index) => {
                  const point = points[index];
                  return point ? <line key={`pinned-line-${index}`} x1={point.x} x2={point.x} y1="18" y2="214" className="profile-chart-crosshair is-pinned" /> : null;
                })}
                {previewPoint && previewPointIndex !== null && !pinnedPointIndices.includes(previewPointIndex) && (
                  <line x1={previewPoint.x} x2={previewPoint.x} y1="18" y2="214" className="profile-chart-crosshair" />
                )}
              </svg>
              {points.map((point, index) => (
                <button
                  key={`${period}-${metric}-${index}`}
                  type="button"
                  className={`profile-chart-point ${index === previewPointIndex ? "is-active" : ""} ${pinnedPointIndices.includes(index) ? "is-pinned" : ""}`}
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
                    className="profile-chart-tooltip is-pinned"
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
                  className="profile-chart-tooltip"
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
            {currentMetric.available !== false && <div className="profile-main-chart__labels"><span>{snapshot.axisLabels[0]}</span><span>{snapshot.axisLabels[1]}</span><span>{snapshot.axisLabels[2]}</span></div>}
          </div>
          <div className="profile-main-chart__footer">
            <span><i /> Données consolidées</span>
            <span className={pinnedPointIndices.length > 0 ? "is-pinned" : ""}>
              {pinnedPointIndices.length > 0 ? <>{pinnedPointIndices.length} label{pinnedPointIndices.length > 1 ? "s" : ""} conservé{pinnedPointIndices.length > 1 ? "s" : ""} · ferme chaque croix pour le retirer</> : <><MousePointerClick size={11} /> Survole ou touche · clic pour conserver un label</>}
            </span>
          </div>
        </article>

        <ProfileRankingPanel period={period} variant="stats" />

        <aside className="profile-stats-side-rail" aria-label="Acquisition et recommandation">
          <article className="profile-panel profile-acquisition-card">
            <div className="profile-acquisition-card__heading">
              <div>
                <span className="profile-kicker"><Users size={14} /> {acquisitionMode === "discovery" ? "Découverte" : "Conversion"}</span>
                <h3>{acquisitionMode === "discovery" ? "Comment ton audience te découvre" : "Ce que font les visiteurs ensuite"}</h3>
              </div>
              <span>{snapshot.label}</span>
            </div>

            <div className="profile-acquisition-mode-switch" role="group" aria-label="Lecture des données d’acquisition">
              <button type="button" className={acquisitionMode === "discovery" ? "is-active" : ""} aria-pressed={acquisitionMode === "discovery"} onClick={() => setAcquisitionMode("discovery")}>Découverte</button>
              <button type="button" className={acquisitionMode === "conversion" ? "is-active" : ""} aria-pressed={acquisitionMode === "conversion"} onClick={() => setAcquisitionMode("conversion")}>Conversion</button>
            </div>

            <div className="profile-acquisition-card__summary">
              <div><strong>{acquisition.total}</strong><span>{acquisition.unit} · {snapshot.label.toLowerCase()}</span></div>
              <em><TrendingUp size={12} /> {acquisition.delta}</em>
            </div>

            <div className="profile-acquisition-bars">
              {acquisition.sources.map((source) => {
                const isActive = activeAcquisitionSource === source.label;
                return (
                  <button
                    key={`${acquisitionMode}-${source.label}`}
                    type="button"
                    className={isActive ? "is-active" : ""}
                    aria-pressed={isActive}
                    onClick={() => setActiveAcquisitionSource((current) => current === source.label ? null : source.label)}
                    style={{ "--source-color": source.color } as React.CSSProperties}
                  >
                    <span className="profile-acquisition-bars__label"><i /> {source.label}</span>
                    <span className="profile-acquisition-bars__track"><i style={{ width: `${source.value}%` }} /></span>
                    <strong>{source.value} %</strong>
                  </button>
                );
              })}
            </div>

            <div className="profile-acquisition-card__footer" role="status">
              {selectedAcquisitionSource
                ? <><i style={{ background: selectedAcquisitionSource.color }} /><span><strong>{selectedAcquisitionSource.label}</strong> représente {selectedAcquisitionSource.value} % {acquisitionMode === "discovery" ? "des visiteurs uniques attribués" : "des actions attribuées"}.</span></>
                : <><i /><span>{acquisitionMode === "discovery" ? "Source de la première découverte attribuée à chaque visiteur." : "Première action mesurable réalisée après la découverte du profil."}</span></>}
            </div>
          </article>

          <article className="profile-panel profile-insight-card">
            <div className="profile-insight-card__icon"><Lightbulb size={24} /></div>
            <div>
              <span className="profile-kicker"><Sparkles size={14} /> Signal utile</span>
              <h3>{snapshot.insight.title}</h3>
              <p>{snapshot.insight.detail}</p>
            </div>
            {usesDemoFallback && planningOpen && (
              <div className="profile-planning-popover" role="dialog" aria-label="Choisir un créneau de publication">
                <strong>Choisir le créneau</strong>
                <div>{["Aujourd’hui · 21:20", "Demain · 21:45", "Vendredi · 22:00"].map((slot) => <button key={slot} type="button" className={selectedSlot === slot ? "is-active" : ""} aria-pressed={selectedSlot === slot} onClick={() => setSelectedSlot(slot)}>{slot}</button>)}</div>
                <span><button type="button" onClick={() => setPlanningOpen(false)}>Annuler</button><button type="button" onClick={() => { setPlanned(true); setPlanningOpen(false); onToast(`Publication planifiée · ${selectedSlot}`); }}>Confirmer</button></span>
              </div>
            )}
            {usesDemoFallback
              ? <button type="button" className={`profile-primary-button ${planned ? "is-confirmed" : ""}`} onClick={() => setPlanningOpen((value) => !value)}>{planned ? <><Check size={16} /> {selectedSlot}</> : <>Planifier <ArrowUpRight size={16} /></>}</button>
              : <span className="profile-positive-pill"><Check size={13} /> Données consolidées</span>}
          </article>
        </aside>

        <article className={`profile-panel profile-objectives-card ${goalsEditing ? "is-editing" : ""}`}>
          <div className="profile-panel__heading is-compact">
            <div><span className="profile-kicker"><Target size={14} /> Objectifs</span><h3>Trajectoire · {snapshot.label.toLowerCase()}</h3></div>
            <span className="profile-count-pill">{snapshot.goals.filter((goal) => goal.progress >= 70).length} / {snapshot.goals.length}</span>
          </div>
          {snapshot.goals.length === 0 && (
            <div className="profile-empty-state" role="status">
              <Target size={26} />
              <h3>Objectifs personnalisés à venir</h3>
              <p>Aucune cible persistée n’est encore reliée à ce profil.</p>
            </div>
          )}
          {snapshot.goals.map((goal) => {
            const scale = goalScales[`${period}-${goal.id}`] ?? 100;
            const progress = Math.min(100, Math.round((goal.progress * 100) / scale));
            return (
              <div className="profile-goal-row" key={goal.id}>
                <div><strong>{goal.label}</strong><span>{goal.value}</span></div>
                <div className="profile-goal-row__track"><span style={{ width: `${progress}%` }} /></div>
                {goalsEditing && <div className="profile-goal-row__controls"><button type="button" onClick={() => adjustGoal(goal.id, -10)} aria-label={`Réduire l’objectif ${goal.label}`}><Minus size={12} /></button><span>Cible {scale} %</span><button type="button" onClick={() => adjustGoal(goal.id, 10)} aria-label={`Augmenter l’objectif ${goal.label}`}><Plus size={12} /></button></div>}
              </div>
            );
          })}
          {snapshot.goals.length > 0 && <button className="profile-inline-action" type="button" onClick={() => {
            if (goalsEditing) onToast("Objectifs personnalisés enregistrés");
            setGoalsEditing((value) => !value);
          }}>{goalsEditing ? <><Check size={15} /> Enregistrer les objectifs</> : <>Ajuster mes objectifs <ArrowUpRight size={15} /></>}</button>}
        </article>

        <article className="profile-panel profile-grade-progress-card">
          <div className="profile-grade-progress-card__ring"><MeewavGradeBadge level={gradeLevel} size="md" variant="icon" /><strong>{gradeProgress} %</strong></div>
          <div><span className="profile-kicker">{gradeLevel === 6 ? "Grade maximal" : "Prochain grade"}</span><h3>{gradeLevel < 6 && <MeewavGradeBadge level={nextGradeLevel} size="xs" variant="icon" />} {gradeLevel === 6 ? "Légendaire" : nextGradeMeta.label}</h3><p>{gradeLevel === 6 ? "Le grade MeeWav le plus élevé est atteint." : `${pointsToNextGrade.toLocaleString("fr-FR")} points restants · rythme estimé : 3 semaines.`}</p></div>
          <div className="profile-grade-progress-card__bar"><span style={{ width: `${gradeProgress}%` }} /></div>
        </article>
      </div>
    </div>
  );
}
