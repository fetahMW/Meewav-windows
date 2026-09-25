import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  Eye,
  Handshake,
  LoaderCircle,
  MessageCircleMore,
  Sparkles,
  TrendingUp,
  UserPlus,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { getGradeBadgeMeta, type GradeLevel } from "../../grades/gradeBadges";
import { SCENE_NAME } from "../../shorts/sceneContract";
import { activityItems, type DemoProfile, type ProfileTabId, type StatsPeriod } from "../profile.data";
import {
  isProfileAnalyticsDemoFallbackEnabled,
  profileAnalyticsRepository,
  type ProfileAnalyticsSnapshot,
} from "../profile.analytics.service";
import ProfileRankingPanel from "../components/ProfileRankingPanel";
import { isProfileLocalPreviewEnabled } from "../profile.preview";

type ProfileHomeViewProps = {
  profile: DemoProfile;
  onNavigate: (tab: ProfileTabId) => void;
  onEditProfile: () => void;
  onOpenNotifications: () => void;
  onOpenBadges: () => void;
};

const priorityActions = [
  { label: "Compléter ta sélection publique", detail: "Ajoute deux médias à la Vue Viewer", progress: 72 },
  { label: "Signer Aurora Tapes", detail: "Une signature manque avant vendredi", progress: 88 },
  { label: "Préparer le prochain live", detail: "La Cage · Paris 11 · vendredi 22:00", progress: 46 },
];

type PulsePeriod = StatsPeriod;

type PulseSeries = {
  label: string;
  value: string;
  trend: string;
  subtitle: string;
  data: number[];
  yMax: number;
  yLabels: string[];
  xLabels: string[];
  pointLabels: string[];
  valueMultiplier: number;
  available?: boolean;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 150;
const CHART_LEFT = 4;
const CHART_RIGHT = 632;
const CHART_TOP = 9;
const CHART_BOTTOM = 145;

const pulsePeriods: Record<PulsePeriod, PulseSeries> = {
  "7d": {
    label: "7 derniers jours",
    value: "128,4 k",
    trend: "+18,7 %",
    subtitle: "Du 10 au 16 juillet · la vidéo « Live Room » porte l’accélération des dernières 48 heures.",
    data: [74.2, 79.8, 83.1, 91.6, 104.4, 112.7, 128.4],
    yMax: 140,
    yLabels: ["140 k", "105 k", "70 k", "35 k", "0"],
    xLabels: ["10 juil.", "11 juil.", "12 juil.", "13 juil.", "14 juil.", "15 juil.", "16 juil."],
    pointLabels: Array.from({ length: 7 }, (_, index) => `${10 + index} juillet`),
    valueMultiplier: 1_000,
  },
  "30d": {
    label: "30 derniers jours",
    value: "482,7 k",
    trend: "+24,1 %",
    subtitle: "Du 17 juin au 16 juillet · la portée progresse régulièrement, avec un pic après la Room de Paris.",
    data: [
      284.2, 291.4, 296.8, 303.1, 311.7, 306.4, 318.9, 326.5, 337.8, 342.2,
      350.6, 346.1, 359.4, 371.8, 379.3, 389.7, 398.2, 394.8, 407.6, 418.9,
      426.1, 421.7, 435.2, 444.8, 452.9, 448.3, 459.7, 468.1, 475.4, 482.7,
    ],
    yMax: 520,
    yLabels: ["520 k", "390 k", "260 k", "130 k", "0"],
    xLabels: ["17 juin", "24 juin", "1 juil.", "8 juil.", "16 juil."],
    pointLabels: Array.from({ length: 30 }, (_, index) => index < 14 ? `${17 + index} juin` : `${index - 13} juillet`),
    valueMultiplier: 1_000,
  },
  "12m": {
    label: "12 derniers mois",
    value: "2,84 M",
    trend: "+61,8 %",
    subtitle: `D’août 2025 à juillet 2026 · ${SCENE_NAME}, les Rooms et les collaborations installent une croissance durable.`,
    data: [1.12, 1.26, 1.39, 1.48, 1.61, 1.77, 1.92, 2.08, 2.21, 2.39, 2.58, 2.84],
    yMax: 3.2,
    yLabels: ["3,2 M", "2,4 M", "1,6 M", "0,8 M", "0"],
    xLabels: ["Août", "Sept.", "Oct.", "Nov.", "Déc.", "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil."],
    pointLabels: ["Août 2025", "Septembre 2025", "Octobre 2025", "Novembre 2025", "Décembre 2025", "Janvier 2026", "Février 2026", "Mars 2026", "Avril 2026", "Mai 2026", "Juin 2026", "Juillet 2026"],
    valueMultiplier: 1_000_000,
  },
};

function buildPulseChart(series: PulseSeries) {
  const points = series.data.map((value, index) => {
    const ratio = series.data.length > 1 ? index / (series.data.length - 1) : 0;
    return {
      x: CHART_LEFT + ratio * (CHART_RIGHT - CHART_LEFT),
      y: CHART_BOTTOM - Math.max(0, Math.min(1, value / series.yMax)) * (CHART_BOTTOM - CHART_TOP),
    };
  });

  const first = points[0] ?? { x: CHART_LEFT, y: CHART_BOTTOM };
  const path = points.slice(1).reduce((value, point, index) => {
    const previous = points[index];
    const middleX = (previous.x + point.x) / 2;
    return `${value} C${middleX.toFixed(2)} ${previous.y.toFixed(2)} ${middleX.toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`);

  return {
    path,
    points,
    endpoint: points[points.length - 1] ?? first,
  };
}

function formatReachAxis(valueInThousands: number) {
  if (valueInThousands >= 1_000) return `${(valueInThousands / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  return `${valueInThousands.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
}

function pulseFromAnalytics(snapshot: ProfileAnalyticsSnapshot): PulseSeries {
  const metric = snapshot.metrics.reach;
  const highest = Math.max(0, ...metric.values);
  const yMax = highest > 0 ? Math.ceil(highest * 1.15 * 10) / 10 : 1;
  return {
    label: snapshot.label,
    value: metric.value,
    trend: metric.delta,
    subtitle: `${snapshot.range} · visiteurs attribués aux sources consolidées.`,
    data: metric.values,
    yMax,
    yLabels: [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0].map(formatReachAxis),
    xLabels: snapshot.axisLabels,
    pointLabels: snapshot.axis,
    valueMultiplier: 1_000,
    available: metric.available,
  };
}

const emptyPulse: PulseSeries = {
  label: "Période sélectionnée",
  value: "—",
  trend: "Non mesuré",
  subtitle: "Aucune mesure de portée consolidée.",
  data: [],
  yMax: 1,
  yLabels: ["1 k", "0,75 k", "0,5 k", "0,25 k", "0"],
  xLabels: ["Début", "Milieu", "Aujourd’hui"],
  pointLabels: [],
  valueMultiplier: 1_000,
  available: false,
};

type AnalyticsLoadState = {
  status: "loading" | "ready" | "empty" | "error";
  data: ProfileAnalyticsSnapshot | null;
  message: string | null;
};

export default function ProfileHomeView({
  profile,
  onNavigate,
  onEditProfile,
  onOpenNotifications,
  onOpenBadges,
}: ProfileHomeViewProps) {
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [pulsePeriod, setPulsePeriod] = useState<PulsePeriod>("7d");
  const [hoveredPulseIndex, setHoveredPulseIndex] = useState<number | null>(null);
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  const [analyticsState, setAnalyticsState] = useState<AnalyticsLoadState>({ status: "loading", data: null, message: null });
  const nextGradeLevel = (profile.grade === 6 ? 6 : profile.grade + 1) as GradeLevel;
  const currentGradeMeta = getGradeBadgeMeta(profile.grade);
  const nextGradeMeta = getGradeBadgeMeta(nextGradeLevel);
  const localPreviewEnabled = isProfileLocalPreviewEnabled();
  const demoFallbackEnabled = isProfileAnalyticsDemoFallbackEnabled();
  const usesDemoFallback = demoFallbackEnabled && analyticsState.status !== "ready";
  const pulse = analyticsState.data
    ? pulseFromAnalytics(analyticsState.data)
    : usesDemoFallback
      ? pulsePeriods[pulsePeriod]
      : emptyPulse;
  const pulseChart = buildPulseChart(pulse);
  const activePulsePoint = hoveredPulseIndex === null ? null : pulseChart.points[hoveredPulseIndex];
  const pulsePointAt = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width) * CHART_WIDTH;
    const ratio = Math.max(0, Math.min(1, (x - CHART_LEFT) / (CHART_RIGHT - CHART_LEFT)));
    setHoveredPulseIndex(Math.round(ratio * Math.max(0, pulse.data.length - 1)));
  };

  useEffect(() => {
    setHoveredPulseIndex(null);
  }, [pulsePeriod, analyticsState.data]);

  const analyticsSignals = analyticsState.data ? [
    { label: "Vues", value: analyticsState.data.metrics.reach.value, detail: analyticsState.data.metrics.reach.delta, icon: Eye, action: () => onNavigate("stats") },
    { label: "Nouveaux abonnés", value: (analyticsState.data.eventTotals.follow_created ?? 0).toLocaleString("fr-FR"), detail: analyticsState.data.label, icon: UserPlus, action: () => onNavigate("stats") },
    { label: "Messages", value: (analyticsState.data.eventTotals.message_sent ?? analyticsState.data.eventTotals.message_composer_open ?? 0).toLocaleString("fr-FR"), detail: analyticsState.data.eventTotals.message_sent === undefined ? "ouvertures" : "envoyés", icon: MessageCircleMore, action: onOpenNotifications },
    { label: "Collaboration", value: ((analyticsState.data.eventTotals.collaboration_request_created ?? 0) + (analyticsState.data.eventTotals.collaboration_request_accepted ?? 0)).toLocaleString("fr-FR"), detail: analyticsState.data.label, icon: Handshake, action: onOpenNotifications },
  ] : null;
  const dailySignals = analyticsSignals ?? (usesDemoFallback ? [
    { label: "Vues", value: "128 k", detail: "+18,7 %", icon: Eye, action: () => onNavigate("stats") },
    { label: "Nouveaux abonnés", value: "+248", detail: "+12,4 %", icon: UserPlus, action: () => onNavigate("stats") },
    { label: "Messages", value: "3", detail: "Stable", icon: MessageCircleMore, action: onOpenNotifications },
    { label: "Collaboration", value: "7", detail: "+2", icon: Handshake, action: onOpenNotifications },
  ] : []);

  useEffect(() => {
    // Preview figures already live in pulsePeriods; no authenticated RPC is
    // needed to display them in the authentication-free workspace.
    if (localPreviewEnabled) {
      setAnalyticsState({ status: "empty", data: null, message: null });
      return;
    }
    let active = true;
    setAnalyticsState({ status: "loading", data: null, message: null });
    profileAnalyticsRepository.getDashboard(pulsePeriod)
      .then((data) => {
        if (!active) return;
        setAnalyticsState({
          status: data.hasData ? "ready" : "empty",
          data: data.hasData ? data : null,
          message: data.hasData ? null : "Aucune donnée de portée n’est encore consolidée pour cette période.",
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
  }, [localPreviewEnabled, pulsePeriod, analyticsReloadKey]);

  const togglePriority = (label: string) => {
    setCompletedActions((current) => (
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    ));
  };
  return (
    <div className="profile-view profile-home-view" aria-label="Accueil du profil">
      <div className="profile-home-grid">
        <article className="profile-panel profile-pulse-card" aria-busy={analyticsState.status === "loading" && !usesDemoFallback}>
          <div className="profile-panel__heading">
            <div>
              <span className="profile-kicker"><Sparkles size={14} /> Pulse créative</span>
              <h2>Ton évolution prend de la hauteur.</h2>
              <p>{pulse.subtitle}</p>
            </div>
            <label className="profile-home-period-select">
              <span className="profile-visually-hidden">Période de la portée</span>
              <select value={pulsePeriod} onChange={(event) => setPulsePeriod(event.target.value as PulsePeriod)}>
                {Object.entries(pulsePeriods).map(([value, period]) => (
                  <option key={value} value={value}>{period.label}</option>
                ))}
              </select>
            </label>
          </div>

          {((analyticsState.data && pulse.available !== false) || usesDemoFallback) ? <>
          <div className="profile-pulse-dashboard">
            <div className="profile-pulse-summary">
              <span>Portée totale <Eye size={15} aria-hidden="true" /></span>
              <strong>{pulse.value}</strong>
              <p><TrendingUp size={14} /><b>{pulse.trend}</b><small>vs période précédente</small></p>
            </div>

            <div className="profile-pulse-chart" aria-label={`Courbe de portée · ${pulse.label}`}>
              <div className="profile-pulse-chart__graph">
                <div className="profile-pulse-chart__axis-y" aria-hidden="true">
                  {pulse.yLabels.map((label) => <span key={label}>{label}</span>)}
                </div>
                <div
                  className="profile-pulse-chart__plot"
                  role="group"
                  tabIndex={0}
                  aria-label="Explorer la portée totale. Survolez ou touchez la courbe, ou utilisez les flèches gauche et droite pour parcourir les valeurs."
                  onPointerMove={(event) => pulsePointAt(event.clientX, event.currentTarget)}
                  onPointerDown={(event) => pulsePointAt(event.clientX, event.currentTarget)}
                  onPointerLeave={() => setHoveredPulseIndex(null)}
                  onFocus={() => setHoveredPulseIndex(pulse.data.length - 1)}
                  onBlur={() => setHoveredPulseIndex(null)}
                  onKeyDown={(event) => {
                    const current = hoveredPulseIndex ?? pulse.data.length - 1;
                    if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) event.preventDefault();
                    if (event.key === "ArrowLeft") setHoveredPulseIndex(Math.max(0, current - 1));
                    if (event.key === "ArrowRight") setHoveredPulseIndex(Math.min(pulse.data.length - 1, current + 1));
                    if (event.key === "Home") setHoveredPulseIndex(0);
                    if (event.key === "End") setHoveredPulseIndex(pulse.data.length - 1);
                    if (event.key === "Escape") setHoveredPulseIndex(null);
                  }}
                >
                  <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`Évolution de la portée sur ${pulse.label}`}>
                    <defs>
                      <linearGradient id="profile-home-line" x1="0" x2="1">
                        <stop offset="0" stopColor="#6b7cff" stopOpacity=".18" />
                        <stop offset=".18" stopColor="#6b7cff" stopOpacity=".82" />
                        <stop offset="0.52" stopColor="#8b5cff" />
                        <stop offset="1" stopColor="#f06cff" />
                      </linearGradient>
                      <linearGradient id="profile-home-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#8b5cff" stopOpacity=".32" />
                        <stop offset="1" stopColor="#8b5cff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="profile-pulse-chart__grid" d="M0 145H640 M0 111H640 M0 77H640 M0 43H640 M0 9H640" />
                    <path className="profile-pulse-chart__area" d={`${pulseChart.path} L${pulseChart.endpoint.x} ${CHART_HEIGHT} L${CHART_LEFT} ${CHART_HEIGHT} Z`} fill="url(#profile-home-fill)" />
                    <path className="profile-pulse-chart__line" d={pulseChart.path} stroke="url(#profile-home-line)" />
                    {activePulsePoint && <line x1={activePulsePoint.x} x2={activePulsePoint.x} y1={CHART_TOP} y2={CHART_BOTTOM} className="profile-chart-crosshair" />}
                    {pulseChart.points.slice(0, -1).map((point, index) => (
                      <circle
                        key={`${pulsePeriod}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={pulse.data.length > 20 ? 1.25 : 1.8}
                        fill="rgba(12, 9, 28, .9)"
                        stroke="rgba(211, 157, 255, .62)"
                        strokeWidth={pulse.data.length > 20 ? 0.8 : 1.1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                  <span
                    className="profile-pulse-chart__point"
                    style={{
                      left: `${(activePulsePoint ?? pulseChart.endpoint).x / CHART_WIDTH * 100}%`,
                      top: `${(activePulsePoint ?? pulseChart.endpoint).y / CHART_HEIGHT * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                  {activePulsePoint && hoveredPulseIndex !== null && (
                    <div
                      className="profile-chart-tooltip profile-pulse-chart__tooltip"
                      style={{
                        left: `${Math.max(0, Math.min(100, activePulsePoint.x / CHART_WIDTH * 100))}%`,
                        top: activePulsePoint.y < CHART_HEIGHT / 2
                          ? `clamp(8px, calc(${activePulsePoint.y / CHART_HEIGHT * 100}% + 18px), calc(100% - 68px))`
                          : `max(76px, calc(${activePulsePoint.y / CHART_HEIGHT * 100}% - 18px))`,
                        transform: `translate(${activePulsePoint.x < CHART_WIDTH * 0.25 ? "0" : activePulsePoint.x > CHART_WIDTH * 0.75 ? "-100%" : "-50%"}, ${activePulsePoint.y < CHART_HEIGHT / 2 ? "0" : "-100%"})`,
                      }}
                      role="status"
                      aria-live="polite"
                    >
                      <span>{pulse.pointLabels[hoveredPulseIndex]}</span>
                      <strong>{Math.round(pulse.data[hoveredPulseIndex] * pulse.valueMultiplier).toLocaleString("fr-FR")}</strong>
                      <span>Portée totale</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="profile-pulse-chart__labels" aria-hidden="true">
                {pulse.xLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            </div>
          </div>

          <div className="profile-signal-strip" aria-label="Signaux des dernières 24 heures">
            {dailySignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <button key={signal.label} type="button" onClick={signal.action}>
                  <span className="profile-signal-strip__icon"><Icon size={15} /></span>
                  <span><small>{signal.label}</small><strong>{signal.value}</strong></span>
                  <em>{signal.detail}</em>
                </button>
              );
            })}
          </div>
          </> : (
            <div className="profile-empty-state" role={analyticsState.status === "error" ? "alert" : "status"}>
              {analyticsState.status === "loading" ? <LoaderCircle size={32} /> : analyticsState.status === "error" ? <AlertTriangle size={32} /> : <BarChart3 size={32} />}
              <h3>{analyticsState.status === "loading" ? "Consolidation de la portée" : analyticsState.status === "error" ? "Portée indisponible" : "Aucune donnée sur cette période"}</h3>
              <p>{analyticsState.status === "loading" ? "Les signaux de ton profil arrivent…" : analyticsState.message ?? pulse.subtitle}</p>
              {analyticsState.status !== "loading" && <button type="button" onClick={() => setAnalyticsReloadKey((value) => value + 1)}>Réessayer</button>}
            </div>
          )}
        </article>

        <article className="profile-panel profile-journey-card">
          <div className="profile-journey-card__top">
            <span className="profile-kicker"><Sparkles size={14} /> Progression du profil</span>
            <span className="profile-positive-pill">{analyticsState.data?.metrics.growth.value ?? (usesDemoFallback ? "+126 cette semaine" : "Données en attente")}</span>
          </div>

          <div className="profile-journey-grades" aria-label={`Passage de ${currentGradeMeta.label} à ${nextGradeMeta.label}`}>
            <div className="profile-journey-grade is-current">
              <MeewavGradeBadge level={profile.grade} size="md" variant="icon" />
              <span><small>Grade actuel</small><strong>{currentGradeMeta.label}</strong></span>
            </div>
            <div className="profile-journey-grade__path" aria-hidden="true"><i style={{ width: `${profile.gradeProgress}%` }} /><span>{profile.gradeProgress} %</span></div>
            <div className="profile-journey-grade is-next">
              <MeewavGradeBadge level={nextGradeLevel} size="md" variant="icon" />
              <span><small>Prochain palier</small><strong>{profile.grade === 6 ? "Légendaire" : nextGradeMeta.label}</strong></span>
            </div>
          </div>

          <div className="profile-journey-objective">
            <div><small>Prochain objectif</small><strong>{profile.grade === 6 ? "Grade maximal atteint" : `${profile.pointsToNextGrade.toLocaleString("fr-FR")} points à gagner`}</strong></div>
            <span>{profile.grade === 6 ? "Parcours terminé" : "Régularité, audience et collaborations"}</span>
          </div>

          <ProfileRankingPanel period={pulsePeriod} variant="home" onOpenDetails={() => onNavigate("stats")} />

          <button type="button" className="profile-journey-action" onClick={onOpenBadges}>Voir le détail du parcours <ArrowRight size={15} /></button>
        </article>

        <article className="profile-panel profile-priority-card">
          <div className="profile-panel__heading is-compact">
            <div>
              <span className="profile-kicker"><Zap size={14} /> À faire maintenant</span>
              <h3>Trois actions à fort impact</h3>
            </div>
            <span className="profile-count-pill">{completedActions.length}/3</span>
          </div>
          <div className="profile-priority-list">
            {priorityActions.map((action) => {
              const complete = completedActions.includes(action.label);
              return (
                <button
                  key={action.label}
                  type="button"
                  className={`profile-priority-row ${complete ? "is-complete" : ""}`}
                  onClick={() => togglePriority(action.label)}
                >
                  <span className="profile-priority-row__check">{complete ? <Check size={15} /> : null}</span>
                  <span className="profile-priority-row__copy"><strong>{action.label}</strong><small>{action.detail}</small></span>
                  <span className="profile-priority-row__progress" style={{ "--progress": `${action.progress}%` } as React.CSSProperties} />
                  <ArrowRight size={16} />
                </button>
              );
            })}
          </div>
          <button className="profile-inline-action" type="button" onClick={onEditProfile}>Ajuster mon profil public <ArrowRight size={15} /></button>
        </article>

        <article className="profile-panel profile-activity-card">
          <div className="profile-panel__heading is-compact">
            <div>
              <span className="profile-kicker"><Clock3 size={14} /> Activité</span>
              <h3>Ce qui bouge autour de toi</h3>
            </div>
            <button type="button" className="profile-link-button" onClick={onOpenNotifications}>
              Voir tout <ArrowRight size={14} />
            </button>
          </div>
          <div className="profile-activity-list">
            {activityItems.map((activity) => (
              <button key={activity.id} type="button" className="profile-activity-row" onClick={onOpenNotifications}>
                <span className={`profile-activity-row__icon is-${activity.type}`}><span /></span>
                <span><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                <time>{activity.time}</time>
              </button>
            ))}
          </div>
        </article>


      </div>
    </div>
  );
}
