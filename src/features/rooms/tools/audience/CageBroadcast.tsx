import { useState } from "react";
import { Crown, Trophy, Users, Pause, Play, RotateCcw, ChevronRight, X, SquareCheck } from "lucide-react";
import type { RoomToolsState, RoomPerson } from "../roomTools.types";
import WaveProfileButton from "../panels/WaveProfileButton";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import "./cage-broadcast.css";

type Props = {
  state: RoomToolsState;
  paused: boolean;
  remaining: number;
  error?: string;
  onPause: () => void;
  onRestart: () => void;
  onNext: () => void;
  onClose: () => void;
  onVote: (side: "A" | "B") => void;
};
const roundNames = ["Huitièmes de finale", "Quarts de finale", "Demi-finales", "Finale"];
const roundLabels = ["Huitièmes", "Quarts", "Demies", "Finale"];

export default function CageBroadcast({ state, paused, remaining, error, onPause, onRestart, onNext, onClose, onVote }: Props) {
  const runtime = state.cage!.runtime!;
  const active = runtime.matches.find(match => match.id === runtime.activeMatchId)!;
  const [round, setRound] = useState(1);
  const [page, setPage] = useState(0);
  const person = (id: string | null) => runtime.participants.find(entrant => entrant.id === id)?.person;
  const items = runtime.matches.filter(match => match.round === round);
  const champion = person(runtime.matches.find(match => match.round === 4)?.winnerId ?? null);
  const completed = runtime.status === "COMPLETED";
  const resolved = active.status === "RESOLVED" || active.status === "CLOSED";
  const voting = active.status === "VOTING";
  const ballot = active.vote?.ballots["preview-viewer"];
  const ballots = Object.values(active.vote?.ballots ?? {});
  const winner = person(active.winnerId);

  const identity = (entrant: RoomPerson | undefined, side: number, large = false) => (
    <div className={`cb-person side-${side}${large ? " is-large" : ""}`}>
      <WaveProfileButton person={entrant} source="demo" className="cb-photo">
        {entrant?.avatarUrl ? <img src={entrant.avatarUrl} alt="" /> : <Users />}
      </WaveProfileButton>
      <span>
        <strong title={entrant?.name}>{entrant?.name ?? "À définir"}</strong>
        <small>
          {entrant?.gradeLevel ? <MeewavGradeBadge level={entrant.gradeLevel} size="xs" variant="icon" /> : null}
          <span className="cb-role">{entrant?.role ?? "Qualification à venir"}</span>
        </small>
      </span>
    </div>
  );

  return (
    <div className="cb-board">
      <header className="cb-brand">
        <h2>LA CAGE</h2>
        <p>{runtime.config.title} <b>● DÉMO</b></p>
      </header>
      <div className="cb-controls">
        <button onClick={onPause} disabled={completed}>{paused ? <Play /> : <Pause />}{paused ? "Reprendre" : "Pause"}</button>
        <button onClick={() => { setRound(1); setPage(0); onRestart(); }}><RotateCcw />Rejouer</button>
        <button onClick={onNext} disabled={completed}><ChevronRight />Étape suivante</button>
        <button onClick={onClose} aria-label="Quitter la simulation"><X /></button>
      </div>
      <section className="cb-battle" aria-label="Battle principal">
        <header>
          <strong>● {completed ? "TOURNOI TERMINÉ" : resolved ? "RÉSULTAT DU BATTLE" : voting ? "À VOUS DE CHOISIR" : "BATTLE EN COURS"}</strong>
          <span>{roundNames[active.round - 1]} · <time role="timer">{completed ? "0 s" : paused ? "Pause" : `${remaining} s`}</time></span>
        </header>
        <div className="cb-versus">
          {identity(person(active.participantAId), 0, true)}
          <div className="cb-center">
            <i aria-hidden="true">VS</i>
            <small>ROUND 1</small>
            <b>{completed || resolved ? "TERMINÉ" : voting ? "VOTE OUVERT" : "EN COURS"}</b>
          </div>
          {identity(person(active.participantBId), 1, true)}
        </div>
        {voting ? <>
          <div className="cb-votes">
            {(["A", "B"] as const).map(side => (
              <button key={side} disabled={!!ballot} aria-pressed={ballot === side} onClick={() => onVote(side)}>
                <SquareCheck />{ballot === side ? "Votre choix" : "Je valide"}
              </button>
            ))}
          </div>
          <p className="cb-note">{ballot ? "Votre vote simulé est enregistré." : "Un vote par personne. Les résultats arrivent à la clôture."}</p>
        </> : null}
        {resolved ? <div className="cb-results">
          <div>{(["A", "B"] as const).map(side => <span key={side}>{ballots.filter(value => value === side).length} voix</span>)}</div>
          {winner ? <p><Trophy />{winner.name} · {completed ? "Champion de La Cage" : "Qualifié pour la suite"}</p> : null}
          {!completed ? <small>Prochain combat dans 2 secondes.</small> : null}
        </div> : null}
      </section>
      <div className="cb-section-title"><strong>BRACKET</strong><span>ÉLIMINATION DIRECTE</span></div>
      <nav className="cb-rounds" aria-label="Tour du tournoi">
        {roundLabels.map((label, index) => (
          <button key={label} aria-pressed={round === index + 1} onClick={() => { setRound(index + 1); setPage(0); }}>{label}</button>
        ))}
      </nav>
      <section className="cb-round" aria-label={roundNames[round - 1]}>
        <header>
          {roundNames[round - 1]}
          {items.length > 4 ? <button aria-label={`Afficher les combats ${page ? "1 à 4" : "5 à 8"}`} onClick={() => setPage(page ? 0 : 1)}>{page ? "1–4" : "5–8"}<ChevronRight /></button> : null}
        </header>
        {items.slice(page * 4, page * 4 + 4).map(match => (
          <article key={match.id} aria-label={`Combat ${match.order}`}>
            {identity(person(match.participantAId), 0)}
            <i aria-hidden="true">VS</i>
            {identity(person(match.participantBId), 1)}
            <footer className="cb-match-summary">
              {match.winnerId ? <span>{person(match.winnerId)?.name} se qualifie</span> : <span>Combat {match.order}</span>}
              <small className={match.id === active.id && !match.winnerId ? "is-live" : ""}>{match.winnerId ? "Terminé" : match.id === active.id ? "● En cours" : "À venir"}</small>
            </footer>
          </article>
        ))}
      </section>
      <section className="cb-champion">
        <div className="cb-champion-title"><Trophy /><span><strong>VAINQUEUR</strong><small>LA CAGE · PARIS / MARSEILLE</small></span></div>
        <div className="cb-champion-person">{champion ? identity(champion, 1) : <><Crown /><b>À déterminer</b></>}</div>
      </section>
      {error ? <p role="alert">{error}</p> : null}
      <footer>Simulation · 16 artistes · votes et résultats fictifs</footer>
    </div>
  );
}
