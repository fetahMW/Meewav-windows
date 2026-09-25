import {
  Check,
  Eye,
  EyeOff,
  Gavel,
  Heart,
  Lock,
  Radio,
  Scale,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cageEntrants, cageEvent, cageOpenMicEntries, normalizedCageFormat } from "../cageTools.domain";
import type { CageState, RoomActorRole, RoomToolsCommand } from "../roomTools.types";
import { PersonChip, ToolNotice, ToolPanelHeader, ToolSection } from "./RoomToolPanelPrimitives";

function useVoteRemaining(cage: CageState) {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!cage.votingOpen || !cage.votingEndsAt) return;
    const interval = window.setInterval(() => refresh((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [cage.votingEndsAt, cage.votingOpen]);
  if (!cage.votingOpen || !cage.votingEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(cage.votingEndsAt).getTime() - Date.now()) / 1_000));
}

const MODE_COPY = {
  public: { label: "Public", detail: "1 compte = 1 voix", icon: Users },
  jury: { label: "Jury", detail: "Décision experte", icon: Gavel },
  weighted: { label: "Hybride", detail: "Public 60 · Jury 40", icon: Scale },
} as const;

const VOTE_PHASES = ["Configurer", "Collecter", "Révéler", "Valider"] as const;

function VotePhaseRail({ active }: { active: number }) {
  return <ol className="room-cage-verdict__phases" aria-label="Progression du vote">
    {VOTE_PHASES.map((label, index) => <li key={label} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
      <span>{index < active ? <Check aria-hidden="true" /> : index + 1}</span>
      <small>{label}</small>
    </li>)}
  </ol>;
}

export default function CageVotePanel({ cage, role, accountId, disabled, execute }: { cage: CageState; role: RoomActorRole; accountId: string; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const format = normalizedCageFormat(cage.format);
  const event = cageEvent(cage);
  const match = cage.matches.find((item) => item.id === cage.currentMatchId) ?? cage.matches[0];
  const votes = Object.values(cage.votes);
  const a = votes.filter((vote) => vote === "A").length;
  const b = votes.filter((vote) => vote === "B").length;
  const hasVoted = Boolean(cage.votes[accountId]);
  const canVote = role !== "visitor" && cage.votingOpen && !hasVoted;
  const isControl = role === "host" || role === "regisseur";
  const remaining = useVoteRemaining(cage);
  const voteExpired = cage.votingOpen && remaining === 0;
  const participation = a + b;
  const votePhase = cage.votingOpen ? 1 : participation === 0 ? 0 : cage.resultsHidden ? 2 : 3;
  const [openMicScore, setOpenMicScore] = useState(85);
  const entrants = cageEntrants(cage);
  const openMicEntries = cageOpenMicEntries(cage);
  const currentEntry = openMicEntries.find((entry) => entry.status === "live")
    ?? [...openMicEntries].reverse().find((entry) => entry.status === "done")
    ?? openMicEntries.find((entry) => entry.status === "ready")
    ?? openMicEntries[0];
  const currentPerson = entrants.find((person) => person.id === currentEntry?.personId);

  if (format === "open-mic") {
    const applauseCount = a;
    return <div className="room-tool-panel room-cage-verdict is-open-mic">
      <ToolPanelHeader eyebrow="DÉCISION" title="Vote & verdict" description={`${event.title} · coup de cœur et note du passage`} status={voteExpired ? "TEMPS ÉCOULÉ" : cage.votingOpen ? `${remaining}s` : currentEntry?.score !== undefined ? "VALIDÉ" : "PRÊT"} />
      <VotePhaseRail active={votePhase} />
      <div className="room-cage-verdict__subject">{currentPerson ? <PersonChip person={currentPerson} detail={`${currentPerson.role} · passage ${currentEntry?.order}`} /> : <span>Aucun passage sélectionné</span>}<span><small>FORMAT</small><strong>Open mic</strong></span></div>
      <div className="room-cage-verdict__mode-grid">{Object.entries(MODE_COPY).map(([id, copy]) => { const Icon = copy.icon; return <button type="button" key={id} className={cage.votingMode === id ? "is-active" : ""} disabled={disabled || cage.votingOpen} onClick={() => void execute({ type: "cage.vote.mode", mode: id as CageState["votingMode"] })}><Icon /><span><strong>{copy.label}</strong><small>{copy.detail}</small></span>{cage.votingMode === id ? <Check /> : null}</button>; })}</div>
      <button type="button" className={`room-cage-verdict__heart ${hasVoted ? "is-voted" : ""}`} disabled={!canVote || !currentEntry} onClick={() => void execute({ type: "cage.vote.cast", accountId, choice: "A" })}><Heart /><span><strong>{hasVoted ? "Coup de cœur envoyé" : "Donner un coup de cœur"}</strong><small>{cage.resultsHidden ? "Le total sera révélé à la fermeture" : `${applauseCount} coup${applauseCount > 1 ? "s" : ""} de cœur`}</small></span>{hasVoted ? <ShieldCheck /> : null}</button>
      {isControl ? <ToolSection title="Note du host" action={<span className="room-cage-verdict__score-output">{openMicScore}<small>/100</small></span>}>
        <label className="room-cage-verdict__score"><span><small>IMPACT</small><b style={{ width: `${openMicScore}%` }} /></span><input aria-label="Note du passage" type="range" min={0} max={100} value={openMicScore} disabled={disabled || !currentEntry} onChange={(eventTarget) => setOpenMicScore(Number(eventTarget.currentTarget.value))} /></label>
        <p className="room-cage-verdict__score-help">Une note globale, indépendante des récompenses et de l’ordre de passage.</p>
        <button type="button" className="is-primary" disabled={disabled || !currentEntry} onClick={() => currentEntry && void execute({ type: "cage.open-mic.score", entryId: currentEntry.id, score: openMicScore })}><Trophy />Valider la note</button>
      </ToolSection> : null}
      {isControl ? <div className="room-cage-verdict__control"><button type="button" className={cage.votingOpen || participation === 0 ? "is-primary" : ""} disabled={disabled || !currentEntry} onClick={() => void execute({ type: "cage.vote.open", open: !cage.votingOpen })}>{cage.votingOpen ? <Lock /> : <Radio />}{cage.votingOpen ? "Fermer" : "Ouvrir le vote"}</button><button type="button" className={!cage.votingOpen && cage.resultsHidden && participation > 0 ? "is-primary" : ""} disabled={disabled} onClick={() => void execute({ type: "cage.vote.reveal", hidden: !cage.resultsHidden })}>{cage.resultsHidden ? <Eye /> : <EyeOff />}{cage.resultsHidden ? "Révéler" : "Masquer"}</button></div> : null}
      <ToolNotice>Les récompenses valorisent les talents, sans modifier la note ni l’ordre de passage.</ToolNotice>
    </div>;
  }

  if (!match) return <div className="room-tool-panel room-cage-verdict"><ToolPanelHeader eyebrow="DÉCISION" title="Vote & verdict" description="Sélectionne d’abord une rencontre" status="EN ATTENTE" /></div>;

  const leader = a === b ? null : a > b ? "A" : "B";
  const leaderId = leader === "A" ? match.competitorA.id : leader === "B" ? match.competitorB.id : null;
  return <div className="room-tool-panel room-cage-verdict is-duel">
    <ToolPanelHeader eyebrow="DÉCISION" title="Vote & verdict" description={`${event.title} · un vote sécurisé par compte`} status={voteExpired ? "TEMPS ÉCOULÉ" : cage.votingOpen ? `${remaining}s · OUVERT` : cage.resultsHidden ? "VERROUILLÉ" : "RÉVÉLÉ"} />
    <VotePhaseRail active={votePhase} />
    <div className="room-cage-verdict__mode-grid">{Object.entries(MODE_COPY).map(([id, copy]) => { const Icon = copy.icon; return <button type="button" key={id} className={cage.votingMode === id ? "is-active" : ""} disabled={disabled || cage.votingOpen} onClick={() => void execute({ type: "cage.vote.mode", mode: id as CageState["votingMode"] })}><Icon /><span><strong>{copy.label}</strong><small>{copy.detail}</small></span>{cage.votingMode === id ? <Check /> : null}</button>; })}</div>
    {isControl ? <div className="room-cage-verdict__duration" role="group" aria-label="Durée du vote"><span><Timer />Durée</span>{([30, 45, 60, 90] as const).map((seconds) => <button type="button" key={seconds} className={cage.votingDurationSeconds === seconds ? "is-active" : ""} disabled={disabled || cage.votingOpen} onClick={() => void execute({ type: "cage.vote.duration", seconds })}>{seconds}s</button>)}</div> : null}
    <div className="room-cage-verdict__ballot">
      <button type="button" disabled={!canVote} className={cage.votes[accountId] === "A" ? "is-voted" : ""} onClick={() => void execute({ type: "cage.vote.cast", accountId, choice: "A" })}><b>A</b><PersonChip person={match.competitorA} /><span>{cage.resultsHidden ? <><Lock />Résultat masqué</> : <><strong>{participation ? Math.round(a / participation * 100) : 0}%</strong><small>{a} voix</small></>}</span></button>
      <i>VS</i>
      <button type="button" disabled={!canVote} className={cage.votes[accountId] === "B" ? "is-voted" : ""} onClick={() => void execute({ type: "cage.vote.cast", accountId, choice: "B" })}><b>B</b><PersonChip person={match.competitorB} /><span>{cage.resultsHidden ? <><Lock />Résultat masqué</> : <><strong>{participation ? Math.round(b / participation * 100) : 0}%</strong><small>{b} voix</small></>}</span></button>
    </div>
    <div className="room-cage-verdict__participation"><span><Users /><span><small>PARTICIPATION</small><strong>{participation} vote{participation > 1 ? "s" : ""}</strong></span></span><span><ShieldCheck /><span><small>INTÉGRITÉ</small><strong>1 compte · 1 voix</strong></span></span>{hasVoted ? <em><Check />Vote enregistré</em> : null}</div>
    {!cage.resultsHidden && participation > 0 && !leader ? <ToolNotice tone="warning">Égalité parfaite. Le host doit départager explicitement : aucun vainqueur n’est choisi automatiquement.</ToolNotice> : null}
    {isControl ? <ToolSection title="Contrôle du verdict">
      <div className="room-cage-verdict__control"><button type="button" className={cage.votingOpen || participation === 0 ? "is-primary" : ""} disabled={disabled} onClick={() => void execute({ type: "cage.vote.open", open: !cage.votingOpen })}>{cage.votingOpen ? <Lock /> : <Radio />}{cage.votingOpen ? "Fermer le vote" : "Ouvrir le vote"}</button><button type="button" className={!cage.votingOpen && cage.resultsHidden && participation > 0 ? "is-primary" : ""} disabled={disabled} onClick={() => void execute({ type: "cage.vote.reveal", hidden: !cage.resultsHidden })}>{cage.resultsHidden ? <Eye /> : <EyeOff />}{cage.resultsHidden ? "Révéler" : "Masquer"}</button></div>
      {leaderId ? <button type="button" className="room-cage-verdict__winner is-primary" disabled={disabled || cage.resultsHidden || participation === 0} onClick={() => void execute({ type: "cage.result", winnerId: leaderId })}><Trophy /><span><strong>Valider {leader === "A" ? match.competitorA.name : match.competitorB.name}</strong><small>Le bracket ou le classement sera mis à jour</small></span></button> : !cage.resultsHidden && participation > 0 ? <div className="room-cage-verdict__tie-break"><span><Sparkles />Départage du host</span><button type="button" disabled={disabled} onClick={() => void execute({ type: "cage.result", winnerId: match.competitorA.id })}>Choisir A</button><button type="button" disabled={disabled} onClick={() => void execute({ type: "cage.result", winnerId: match.competitorB.id })}>Choisir B</button></div> : null}
    </ToolSection> : null}
    <ToolNotice>Les récompenses restent hors compétition : aucun point, voix ou avantage de seeding.</ToolNotice>
  </div>;
}
