import MeewavSelect from "../../../../components/shared/MeewavSelect";
import { BarChart3, Eye, EyeOff, MessageSquareMore, SlidersHorizontal, Star } from "lucide-react";
import { useState } from "react";
import type { PerformanceStatus, RoomToolsCommand, SceneEvaluationReaction, SceneState } from "../roomTools.types";
import { EmptyState, ToolPanelHeader } from "./RoomToolPanelPrimitives";

const REACTIONS: Array<{ id: SceneEvaluationReaction; label: string }> = [
  { id: "energy", label: "Énergie" }, { id: "presence", label: "Présence" },
  { id: "originality", label: "Originalité" }, { id: "mastery", label: "Maîtrise" },
];
const STATUS: Record<PerformanceStatus, string> = { live: "En scène", done: "Terminé", ready: "Prêt", upcoming: "À venir", skipped: "Reporté", cancelled: "Annulé" };

export default function SceneEvaluationPanel({ scene, disabled, execute }: { scene: SceneState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const preferred = [...scene.program].reverse().find((entry) => entry.status === "done" && scene.evaluation.byPerformance[entry.id])
    ?? scene.program.find((entry) => entry.status === "live") ?? scene.program[0];
  const [selectedId, setSelectedId] = useState(preferred?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const entry = scene.program.find((item) => item.id === selectedId) ?? preferred;
  const evaluation = entry ? scene.evaluation.byPerformance[entry.id] : undefined;
  const responseCount = evaluation?.responseCount ?? 0;
  const minimumResponses = evaluation?.minimumResponses ?? scene.evaluation.defaultMinimumResponses;
  const publicResults = (evaluation?.resultsVisibility ?? scene.evaluation.defaultResultsVisibility) === "public";
  const score = responseCount && evaluation && evaluation.weightedAverage !== null ? (evaluation.weightedAverage === null ? NaN : evaluation.weightedAverage ?? evaluation.ratingTotal / responseCount).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "—";
  const locked = disabled || pending;
  const configure = async (patch: { enabled?: boolean; minimumResponses?: number; resultsVisibility?: "private" | "public" }) => {
    if (!entry || locked) return;
    setPending(true);
    setError("");
    try {
      await execute({ type: "scene.evaluation.configure", performanceId: entry.id, enabled: entry.evaluationEnabled, ...patch });
    } catch {
      setError("La modification n’a pas été enregistrée. Réessayez.");
    } finally {
      setPending(false);
    }
  };

  return <div className="room-tool-panel is-evaluation scene-engagement">
    <ToolPanelHeader eyebrow="L’ÉCHO DE LA SALLE" title="Évaluation" description="Un retour pour chaque prestation." icon={<BarChart3 />} />
    {!entry ? <EmptyState title="Le programme est encore vide">Ajoutez une prestation dans Programme pour recueillir les avis.</EmptyState> : <>
      <label className="room-tool-field scene-engagement__selector">Choisir une prestation
        <MeewavSelect value={entry.id} onChange={(event) => { setSelectedId(event.currentTarget.value); setError(""); }}>
          {scene.program.map((item) => <option key={item.id} value={item.id}>{item.artistName} · {item.title} — {STATUS[item.status]}</option>)}
        </MeewavSelect>
      </label>
      <section className="scene-review" aria-label={`Évaluation de ${entry.title}`}>
        <header className="scene-engagement__identity"><span><small>{entry.artistName}</small><h3>{entry.title}</h3></span><span className={`scene-engagement__badge${entry.status === "live" ? " is-live" : ""}`}>{STATUS[entry.status]}</span></header>
        <div className="scene-review__score"><span><Star /><strong>{score}</strong><small>/ 5</small></span><span><MessageSquareMore /><strong>{responseCount}</strong><small>avis du public</small></span></div>
        {responseCount > 0 && evaluation ? <div className="scene-review__reactions">{REACTIONS.map((reaction) => {
          const count = evaluation.reactionCounts[reaction.id];
          const percentage = Math.round(count / responseCount * 100);
          return <div key={reaction.id}><span>{reaction.label}</span><i aria-hidden="true"><b style={{ width: `${Math.min(100, percentage)}%` }} /></i><strong>{percentage}%</strong></div>;
        })}</div> : <p className="scene-engagement__hint">{!entry.evaluationEnabled ? "Les avis sont désactivés pour cette prestation." : entry.status === "done" ? "Les premiers avis du public apparaîtront ici." : "Le public pourra donner son avis à la fin de cette prestation."}</p>}
      </section>
      <section className="scene-engagement__controls" aria-label="Collecte et partage des avis">
        <label className="scene-engagement__switch"><span><strong>Recueillir les avis</strong><small>{entry.evaluationEnabled ? entry.status === "done" && evaluation?.open ? "Le public peut évaluer cette prestation." : "Ouverture à la fin du passage." : "Aucun avis demandé au public."}</small></span><input type="checkbox" role="switch" aria-label={`Activer l’évaluation pour ${entry.title}`} checked={entry.evaluationEnabled} disabled={locked} onChange={(event) => void configure({ enabled: event.currentTarget.checked })} /><i aria-hidden="true" /></label>
        <div className="scene-review__publication"><span>{publicResults ? <Eye /> : <EyeOff />}<span><strong>{publicResults && responseCount >= minimumResponses ? "Résultats partagés" : publicResults ? "Partage programmé" : "Résultats privés"}</strong><small>{publicResults ? responseCount >= minimumResponses ? "Visibles par le public." : `Publication à partir de ${minimumResponses} avis.` : "Visibles uniquement par vous."}</small></span></span><button type="button" disabled={locked || !entry.evaluationEnabled} aria-label={`${publicResults ? "Rendre les résultats privés" : "Rendre les résultats publics"} pour ${entry.title}`} onClick={() => void configure({ resultsVisibility: publicResults ? "private" : "public" })}>{publicResults ? "Garder privés" : "Partager"}</button></div>
      </section>
      <details className="scene-engagement__details"><summary><SlidersHorizontal />Conditions de publication</summary><label className="room-tool-field">Nombre minimum d’avis
        <input key={`${entry.id}-${minimumResponses}`} type="number" aria-label={`Seuil de réponses pour ${entry.title}`} min="1" max="100" defaultValue={minimumResponses} disabled={locked || !entry.evaluationEnabled} onBlur={(event) => {
          const next = Math.max(1, Math.min(100, Math.round(Number(event.currentTarget.value) || minimumResponses)));
          event.currentTarget.value = String(next);
          if (next !== minimumResponses) void configure({ minimumResponses: next });
        }} />
      </label><p className="scene-engagement__hint">Ce seuil s’applique lorsque vous partagez les résultats avec le public.</p></details>
    </>}
    {error ? <p className="scene-engagement__error" role="alert">{error}</p> : null}
  </div>;
}
