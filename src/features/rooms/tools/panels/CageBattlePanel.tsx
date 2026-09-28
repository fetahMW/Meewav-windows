import MeewavSelect from "../../../../components/shared/MeewavSelect";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  FastForward,
  Pause,
  Play,
  Radio,
  RotateCcw,
  TimerReset,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cageEntrants, cageEvent, cageOpenMicEntries, normalizedCageFormat } from "../cageTools.domain";
import type { CageState, RoomToolsCommand } from "../roomTools.types";
import { PersonChip, ToolPanelHeader, ToolSection } from "./RoomToolPanelPrimitives";

const STATUS_LABELS: Record<CageState["battleStatus"], string> = {
  ready: "PRÊT",
  countdown: "DÉCOMPTE",
  "live-a": "EN DIRECT",
  "live-b": "EN DIRECT",
  paused: "EN PAUSE",
  incident: "INCIDENT",
  done: "TERMINÉ",
};

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function useBattleRemaining(cage: CageState) {
  const [, refresh] = useState(0);
  const live = cage.battleStatus === "live-a" || cage.battleStatus === "live-b";
  useEffect(() => {
    if (!live || !cage.battleStartedAt) return;
    const interval = window.setInterval(() => refresh((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [cage.battleStartedAt, live]);
  const elapsedLive = live && cage.battleStartedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(cage.battleStartedAt).getTime()) / 1_000))
    : 0;
  return Math.max(0, (cage.passageDurationSeconds ?? 120) - (cage.battleElapsedSeconds ?? 0) - elapsedLive);
}

export default function CageBattlePanel({ cage, disabled, execute }: { cage: CageState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const event = cageEvent(cage);
  const format = normalizedCageFormat(cage.format);
  const match = cage.matches.find((item) => item.id === cage.currentMatchId) ?? cage.matches[0];
  const remaining = useBattleRemaining(cage);
  const timerExpired = remaining === 0 && (cage.battleStatus === "live-a" || cage.battleStatus === "live-b");
  const round = cage.battleRound ?? 1;
  const roundCount = cage.battleRoundCount ?? 3;
  const duration = cage.passageDurationSeconds ?? 120;
  const onAirSide = cage.battleStatus === "live-a"
    ? "A"
    : cage.battleStatus === "live-b"
      ? "B"
      : cage.battleActiveSide ?? null;
  const battle = (status: CageState["battleStatus"]) => execute({ type: "cage.battle", status });
  const openMicEntries = cageOpenMicEntries(cage);
  const entrants = cageEntrants(cage);
  const liveEntry = openMicEntries.find((entry) => entry.status === "live")
    ?? openMicEntries.find((entry) => entry.status === "ready")
    ?? openMicEntries.find((entry) => entry.status === "scheduled")
    ?? openMicEntries[0];
  const livePerson = entrants.find((person) => person.id === liveEntry?.personId);
  const liveIndex = liveEntry ? openMicEntries.findIndex((entry) => entry.id === liveEntry.id) : -1;
  const nextEntry = openMicEntries.slice(liveIndex + 1).find((entry) => !["done", "absent"].includes(entry.status));
  const nextPerson = entrants.find((person) => person.id === nextEntry?.personId);

  if (format === "open-mic") {
    const stageStatus = cage.battleStatus === "paused"
      ? "PAUSE"
      : cage.battleStatus === "incident"
        ? "INCIDENT"
        : cage.battleStatus === "countdown"
          ? "DÉCOMPTE"
          : cage.battleStatus === "ready"
            ? "PRÊT"
            : cage.battleStatus === "done"
              ? "TERMINÉ"
              : "SUR SCÈNE";
    const startPassage = () => liveEntry && execute({ type: "cage.open-mic.status", entryId: liveEntry.id, status: "live" });
    const finishPassage = async () => {
      if (!liveEntry) return;
      await execute({ type: "cage.open-mic.status", entryId: liveEntry.id, status: "done" });
      await battle("done");
      if (nextEntry) await execute({ type: "cage.open-mic.status", entryId: nextEntry.id, status: "ready" });
    };
    const startNext = () => nextEntry && execute({ type: "cage.open-mic.status", entryId: nextEntry.id, status: "live" });
    return <div className="room-tool-panel room-cage-regie is-open-mic">
      <ToolPanelHeader eyebrow="PASSAGE EN COURS" title="Régie" description={`${event.title} · ${event.discipline}`} status={timerExpired ? "TEMPS ÉCOULÉ" : STATUS_LABELS[cage.battleStatus]} />
      <div className="room-cage-regie__context"><span><Radio /><small>FORMAT</small><strong>Open mic</strong></span><span><UserRoundCheck /><small>PASSAGE</small><strong>{liveEntry ? `${liveEntry.order} / ${openMicEntries.length}` : "—"}</strong></span><label><Clock3 /><span><small>DURÉE</small><MeewavSelect aria-label="Durée du passage" value={duration} disabled={disabled} onChange={(eventTarget) => void execute({ type: "cage.battle.duration", seconds: Number(eventTarget.currentTarget.value) as 60 | 90 | 120 | 180 })}><option value={60}>1 min</option><option value={90}>1 min 30</option><option value={120}>2 min</option><option value={180}>3 min</option></MeewavSelect></span></label></div>
      <section className="room-cage-regie__open-stage">
        <span className={`room-cage-regie__live-dot is-${cage.battleStatus}`}><i /><small>{stageStatus}</small></span>
        {livePerson ? <PersonChip person={livePerson} detail={`${livePerson.role} · ${liveEntry.slot}`} /> : <p>Aucun passage programmé</p>}
        <time className={remaining <= 10 ? "is-ending" : ""}>{clock(remaining)}</time>
        <small>PASSAGE {liveEntry?.order ?? "—"}</small>
      </section>
      <div className="room-cage-regie__primary-actions">
        <button type="button" disabled={disabled || !liveEntry} onClick={() => void battle("countdown")}><TimerReset />Décompte</button>
        {cage.battleStatus === "paused" ? <button type="button" className="is-primary" disabled={disabled || !liveEntry} onClick={() => void battle("live-a")}><Play />Reprendre</button> : <button type="button" className="is-primary" disabled={disabled || !liveEntry} onClick={() => void startPassage()}><Play />Démarrer</button>}
        <button type="button" disabled={disabled || !liveEntry} onClick={() => void battle("paused")}><Pause />Pause</button>
        <button type="button" className="is-success" disabled={disabled || !liveEntry} onClick={() => void finishPassage()}><CheckCircle2 />Terminer</button>
      </div>
      <ToolSection title="Ensuite" action={nextEntry ? <span className="room-cage-regie__slot">{nextEntry.slot}</span> : undefined}>
        <div className="room-cage-regie__next">{nextPerson ? <PersonChip person={nextPerson} /> : <span>Fin du programme</span>}<button type="button" disabled={disabled || !nextEntry} onClick={() => void startNext()}><ArrowRight />Passer en direct</button></div>
      </ToolSection>
      <div className="room-cage-regie__secondary-actions"><button type="button" disabled={disabled || !liveEntry} onClick={() => void execute({ type: "cage.vote.open", open: true })}><CircleDot />Ouvrir le vote</button><button type="button" className="is-danger" disabled={disabled || !liveEntry} onClick={() => void battle("incident")}><AlertTriangle />Signaler un incident</button></div>
    </div>;
  }

  if (!match) return <div className="room-tool-panel room-cage-regie"><ToolPanelHeader eyebrow="PASSAGE EN COURS" title="Régie" description="Génère d’abord une structure dans Bracket" status="EN ATTENTE" /></div>;

  return <div className="room-tool-panel room-cage-regie is-duel">
    <ToolPanelHeader eyebrow="PASSAGE EN COURS" title="Régie" description={`${event.title} · ${format === "championship" ? "Championnat" : "Tournoi"}`} status={timerExpired ? "TEMPS ÉCOULÉ" : STATUS_LABELS[cage.battleStatus]} />
    <label className="room-cage-regie__match-select"><span>Rencontre pilotée</span><MeewavSelect value={match.id} disabled={disabled} onChange={(eventTarget) => void execute({ type: "cage.match.select", matchId: eventTarget.currentTarget.value })}>{cage.matches.filter((candidate) => candidate.status !== "done" || candidate.id === match.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.competitorA.name} vs {candidate.competitorB.name} · Tour {candidate.round}</option>)}</MeewavSelect></label>
    <div className="room-cage-regie__duel">
      <article className={onAirSide === "A" ? "is-live" : ""}><b>A</b><PersonChip person={match.competitorA} /><span><CircleDot />{cage.battleStatus === "live-a" ? "EN SCÈNE" : onAirSide === "A" ? "DERNIER PASSAGE" : "PRÊT"}</span></article>
      <span className="room-cage-regie__timer"><small>MANCHE {round}/{roundCount}</small><time className={remaining <= 10 ? "is-ending" : ""}>{clock(remaining)}</time><strong>{match.scoreA}<i>—</i>{match.scoreB}</strong></span>
      <article className={onAirSide === "B" ? "is-live" : ""}><b>B</b><PersonChip person={match.competitorB} /><span><CircleDot />{cage.battleStatus === "live-b" ? "EN SCÈNE" : onAirSide === "B" ? "DERNIER PASSAGE" : "PRÊT"}</span></article>
    </div>
    <div className="room-cage-regie__rounds" role="group" aria-label="Manche du battle">{Array.from({ length: roundCount }, (_, index) => index + 1).map((item) => <button type="button" key={item} className={item === round ? "is-active" : item < round ? "is-done" : ""} disabled={disabled} onClick={() => void execute({ type: "cage.battle.round", round: item })}><span>{item < round ? <CheckCircle2 /> : item}</span><small>Manche {item}</small></button>)}</div>
    <div className="room-cage-regie__settings"><label><Clock3 /><span><small>Durée / passage</small><MeewavSelect aria-label="Durée par passage" value={duration} disabled={disabled} onChange={(eventTarget) => void execute({ type: "cage.battle.duration", seconds: Number(eventTarget.currentTarget.value) as 60 | 90 | 120 | 180 })}><option value={60}>1 min</option><option value={90}>1 min 30</option><option value={120}>2 min</option><option value={180}>3 min</option></MeewavSelect></span></label><span><RotateCcw /><span><small>Ordre</small><strong>{round % 2 ? "A puis B" : "B puis A"}</strong></span></span></div>
    <div className="room-cage-regie__primary-actions is-duel-controls"><button type="button" disabled={disabled} onClick={() => void battle("countdown")}><TimerReset />Décompte</button><button type="button" className={cage.battleStatus === "live-a" ? "is-live" : ""} disabled={disabled} onClick={() => void battle("live-a")}><Play />Passage A</button><button type="button" className={cage.battleStatus === "live-b" ? "is-live" : ""} disabled={disabled} onClick={() => void battle("live-b")}><Play />Passage B</button><button type="button" disabled={disabled} onClick={() => void battle("paused")}><Pause />Pause</button></div>
    <div className="room-cage-regie__decision"><button type="button" disabled={disabled} onClick={() => void execute({ type: "cage.vote.open", open: true })}><CircleDot />Ouvrir le vote</button><button type="button" disabled={disabled} onClick={() => void battle("done")}><FastForward />{round < roundCount ? "Manche suivante" : "Terminer les manches"}</button><button type="button" className="is-danger" disabled={disabled} onClick={() => void battle("incident")}><AlertTriangle />Incident</button></div>
  </div>;
}
