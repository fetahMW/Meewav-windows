import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Building2,
  Flag,
  LoaderCircle,
  Map,
  MapPin,
  Minus,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { StatsPeriod } from "../profile.data";
import {
  createDemoProfileRankingSnapshot,
  isProfileRankingDemoFallbackEnabled,
  profileRankingRepository,
  type ProfileRankingScope,
  type ProfileRankingSnapshot,
} from "../profile.ranking.service";

type ProfileRankingPanelProps =
  | { period: StatsPeriod; variant: "home"; onOpenDetails: () => void }
  | { period: StatsPeriod; variant: "stats"; onOpenDetails?: never };

type RankingLoadState = {
  status: "loading" | "ready" | "empty" | "error";
  data: ProfileRankingSnapshot | null;
  message: string | null;
};

const scopeMeta: Record<ProfileRankingScope, {
  label: string;
  icon: typeof Flag;
  accent: string;
}> = {
  country: { label: "National", icon: Flag, accent: "#8b5cff" },
  region: { label: "Régional", icon: Map, accent: "#a96dff" },
  city: { label: "Ville", icon: Building2, accent: "#d946ef" },
  district: { label: "Quartier", icon: MapPin, accent: "#19b8ff" },
};

function formatRank(value: number) {
  return value > 0 ? `#${value.toLocaleString("fr-FR")}` : "—";
}

function movementLabel(value: number | null) {
  if (value === null) return "Nouveau classement";
  if (value > 0) return `+${value.toLocaleString("fr-FR")} place${value > 1 ? "s" : ""}`;
  if (value < 0) return `${value.toLocaleString("fr-FR")} place${value < -1 ? "s" : ""}`;
  return "Position stable";
}

function rankingAriaLabel(scope: string, label: string, rank: number, total: number, movement: number | null, available: boolean) {
  if (!available) return `${scope}, ${label}, classement non disponible`;
  const ordinal = rank === 1 ? "1er" : `${rank.toLocaleString("fr-FR")}e`;
  return `${scope}, ${label}, ${ordinal} sur ${total.toLocaleString("fr-FR")}, ${movementLabel(movement)}`;
}

function formatMeasuredAt(value: string) {
  if (!value.includes("T")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
  }).format(date).replace(/\.$/, "");
  const timeLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `le ${dateLabel} à ${timeLabel}`;
}

function formatPointsDelta(value: number) {
  const absolute = Math.abs(value).toLocaleString("fr-FR");
  const unit = Math.abs(value) === 1 ? "point" : "points";
  if (value > 0) return `+${absolute} ${unit}`;
  if (value < 0) return `−${absolute} ${unit}`;
  return `0 ${unit}`;
}

function Movement({ value, compact = false }: { value: number | null; compact?: boolean }) {
  const Icon = value === null || value === 0 ? Minus : ArrowUp;
  return (
    <span className={`profile-ranking-movement ${value === null ? "is-new" : value < 0 ? "is-down" : value === 0 ? "is-stable" : ""}`}>
      <Icon size={compact ? 10 : 12} aria-hidden="true" />
      {movementLabel(value)}
    </span>
  );
}

function RankingEmpty({ state, onRetry }: { state: RankingLoadState; onRetry: () => void }) {
  const loading = state.status === "loading";
  const empty = state.status === "empty";
  return (
    <div className="profile-ranking-empty" role={state.status === "error" ? "alert" : "status"}>
      {loading ? <LoaderCircle className="is-spinning" size={20} /> : empty ? <Trophy size={20} /> : <AlertTriangle size={20} />}
      <span>
        <strong>{loading ? "Calcul du classement" : empty ? "Classement en préparation" : "Classement indisponible"}</strong>
        <small>{loading ? "Comparaison des parcours Meewav…" : state.message ?? "Renseigne ta localisation pour apparaître dans les classements."}</small>
      </span>
      {state.status === "error" && <button type="button" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export default function ProfileRankingPanel({ period, variant, onOpenDetails }: ProfileRankingPanelProps) {
  const demoFallbackEnabled = isProfileRankingDemoFallbackEnabled();
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedScope, setSelectedScope] = useState<ProfileRankingScope>("district");
  const [state, setState] = useState<RankingLoadState>(() => demoFallbackEnabled
    ? { status: "ready", data: createDemoProfileRankingSnapshot(period), message: null }
    : { status: "loading", data: null, message: null });

  useEffect(() => {
    let active = true;
    if (demoFallbackEnabled) {
      setState({ status: "ready", data: createDemoProfileRankingSnapshot(period), message: null });
      return () => {
        active = false;
      };
    }

    setState({ status: "loading", data: null, message: null });
    profileRankingRepository.getSnapshot(period)
      .then((data) => {
        if (!active) return;
        setState({
          status: data.hasData ? "ready" : "empty",
          data: data.hasData ? data : null,
          message: data.hasData ? null : "Renseigne ta région, ta ville et ton quartier pour compléter le classement.",
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          data: null,
          message: error instanceof Error ? error.message : "Le classement est indisponible pour le moment.",
        });
      });
    return () => {
      active = false;
    };
  }, [demoFallbackEnabled, period, reloadKey]);

  const availableEntries = useMemo(
    () => state.data?.entries.filter((entry) => entry.available) ?? [],
    [state.data],
  );
  const bestEntry = useMemo(
    () => availableEntries.reduce<(typeof availableEntries)[number] | null>(
      (best, entry) => !best || entry.topPercent < best.topPercent ? entry : best,
      null,
    ),
    [availableEntries],
  );
  const selected = availableEntries.find((entry) => entry.scope === selectedScope)
    ?? [...availableEntries].reverse()[0]
    ?? null;

  useEffect(() => {
    if (selected && selected.scope !== selectedScope) setSelectedScope(selected.scope);
  }, [selected, selectedScope]);

  if (variant === "home") {
    return (
      <section className="profile-ranking-compact" aria-label="Classement territorial du profil">
        <div className="profile-ranking-compact__heading">
          <span className="profile-kicker"><Trophy size={14} /> Classement territorial</span>
          <span>{state.data?.label ?? "Période sélectionnée"}</span>
        </div>

        {state.data ? (
          <div className="profile-ranking-compact__scopes">
            {state.data.entries.map((entry) => {
              const meta = scopeMeta[entry.scope];
              const Icon = meta.icon;
              return (
                <button
                  key={entry.scope}
                  type="button"
                  className={!entry.available ? "is-unavailable" : undefined}
                  aria-disabled={!entry.available}
                  onClick={entry.available ? onOpenDetails : undefined}
                  style={{ "--ranking-accent": meta.accent } as CSSProperties}
                  aria-label={rankingAriaLabel(meta.label, entry.label, entry.rank, entry.total, entry.movement, entry.available)}
                >
                  <span className="profile-ranking-compact__scope"><Icon size={13} /><small>{meta.label}</small></span>
                  <span className="profile-ranking-compact__rank"><strong>{formatRank(entry.rank)}</strong><small>sur {entry.total.toLocaleString("fr-FR")}</small></span>
                  <em>{entry.label}</em>
                  {entry.available && <Movement value={entry.movement} compact />}
                </button>
              );
            })}
          </div>
        ) : <RankingEmpty state={state} onRetry={() => setReloadKey((value) => value + 1)} />}

        {bestEntry && (
          <button className="profile-ranking-compact__action" type="button" onClick={onOpenDetails}>
            <span><small>Meilleure position · Top {bestEntry.topPercent.toLocaleString("fr-FR")} % à {bestEntry.label}</small><strong>Voir l’analyse du classement</strong></span>
            <ArrowRight size={17} />
          </button>
        )}
      </section>
    );
  }

  return (
    <article className="profile-panel profile-ranking-dashboard" aria-label="Classement territorial du profil">
      <div className="profile-ranking-dashboard__heading">
        <div>
          <span className="profile-kicker"><Trophy size={14} /> Classement territorial</span>
          <h3>Ta position, de la France à ton quartier.</h3>
          <p>Le classement général compare les points de grade des profils publics.</p>
        </div>
        <span className="profile-ranking-dashboard__period">{state.data?.label ?? "Période sélectionnée"}</span>
      </div>

      {state.data && selected ? (
        <>
          <div className="profile-ranking-dashboard__body">
            <div className="profile-ranking-scope-grid" role="group" aria-label="Échelle géographique du classement">
              {state.data.entries.map((entry) => {
                const meta = scopeMeta[entry.scope];
                const Icon = meta.icon;
                const active = selected.scope === entry.scope;
                const standing = entry.available ? Math.max(2, 100 - entry.topPercent) : 0;
                return (
                  <button
                    key={entry.scope}
                    type="button"
                    className={`${active ? "is-active" : ""} ${!entry.available ? "is-unavailable" : ""}`.trim()}
                    aria-disabled={!entry.available}
                    aria-pressed={active}
                    aria-label={rankingAriaLabel(meta.label, entry.label, entry.rank, entry.total, entry.movement, entry.available)}
                    onClick={entry.available ? () => setSelectedScope(entry.scope) : undefined}
                    style={{
                      "--ranking-accent": meta.accent,
                      "--ranking-standing": `${standing}%`,
                    } as CSSProperties}
                  >
                    <span className="profile-ranking-scope-grid__icon"><Icon size={16} /></span>
                    <span className="profile-ranking-scope-grid__copy"><small>{meta.label}</small><strong>{entry.label}</strong></span>
                    <b>{formatRank(entry.rank)}</b>
                    <span className="profile-ranking-scope-grid__track"><i /></span>
                    <Movement value={entry.movement} compact />
                  </button>
                );
              })}
            </div>

            <div className="profile-ranking-focus" role="status" aria-live="polite" style={{ "--ranking-accent": scopeMeta[selected.scope].accent } as CSSProperties}>
              <div className="profile-ranking-focus__halo"><Trophy size={20} /></div>
              <span><small>{scopeMeta[selected.scope].label} · {selected.label}</small><strong>{formatRank(selected.rank)}</strong></span>
              <div><b>sur {selected.total.toLocaleString("fr-FR")}</b><Movement value={selected.movement} /></div>
              <p>Top {selected.topPercent.toLocaleString("fr-FR")} % dans cette zone</p>
            </div>
          </div>

          <div className="profile-ranking-dashboard__footer">
            <span><small>{state.data.basisLabel}</small><strong>{state.data.currentPoints.toLocaleString("fr-FR")} points</strong></span>
            <span><small>Progression · {state.data.label.toLowerCase()}</small><strong>{formatPointsDelta(state.data.pointsGained)}</strong></span>
            <p>Mis à jour {formatMeasuredAt(state.data.measuredAt)} · à points égaux, les profils partagent la même place.</p>
          </div>
        </>
      ) : <RankingEmpty state={state} onRetry={() => setReloadKey((value) => value + 1)} />}
    </article>
  );
}

