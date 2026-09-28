import MeewavSelect from "../../../../components/shared/MeewavSelect";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, ChevronRight, CircleCheck, Clock3, Crown, LockKeyhole, Mic, MonitorUp, Pause, Play, RefreshCw, Settings2, ShieldCheck, Shuffle, Swords, Trophy, Users, Wifi } from "lucide-react";
import type { CageCompetitionAction, CageCompetitionMatch, CageCompetitionPayload, CageCompetitionRuntime, TournamentParticipant } from "../cageCompetition.types";
import type { RoomToolsCommand, RoomToolsState } from "../roomTools.types";
import "./cage-competition-workspace.css";
import { cageRosterCandidate } from "../cageCompetition";
import CageOpenMicWorkspace, { CageOpenMicCommandBar } from "./CageOpenMicWorkspace";
import CageArtistPicker from "./CageArtistPicker";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";

export type CageWorkspaceView = "bracket" | "regie" | "match" | "vote";
export type CageSendCommand = (action: CageCompetitionAction, payload?: CageCompetitionPayload) => Promise<boolean>;

export function useCageCommand(state: RoomToolsState | null, execute: (command: RoomToolsCommand) => Promise<unknown>): CageSendCommand {
  const pending = useRef(false);
  return async (action, payload = {}) => {
    if (!state?.cage?.runtime || pending.current) return false;
    pending.current = true;
    const targetId = action === "match.report" && payload.matchId ? payload.matchId : state.cage.runtime.activeMatchId;
    const match = state.cage.runtime.matches.find((item) => item.id === targetId);
    const entryId = payload.entryId ?? state.cage.runtime.activeEntryId;
    try {
      await execute({ type: "cage.competition.command", action, payload, idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision, expectedMatchId: match?.id, expectedStepIndex: match?.stepIndex, expectedEntryId: entryId ?? undefined });
      return true;
    } catch {
      // useRoomTools owns the actionable error displayed above the workspace.
      return false;
    } finally { pending.current = false; }
  };
}

const PHASE: Record<string, string> = {
  PREPARING: "Préparation", CHECK_IN: "Inscriptions", SEEDED: "Placement prêt", LOCKED: "Bracket verrouillé", RUNNING: "En cours", FINAL: "Finale", COMPLETED: "Compétition terminée", CANCELLED: "Annulé",
  WAITING: "En attente", SELECTED: "Sélectionné", GREENHOUSE: "En préparation", READY: "Prêt", CALLED: "Appelé", CALLING: "Appel en cours", ON_STAGE: "Sur scène", IN_PROGRESS: "Performance", PAUSED: "En pause", PERFORMING: "En scène", PERFORMED: "Passage terminé", ADVANCED: "Qualifié", ELIMINATED: "Éliminé", NO_SHOW: "Absent", FORFEIT: "Forfait", DISQUALIFIED: "Disqualifié", READY_FOR_VOTE: "Prêt pour le vote", VOTING: "Vote ouvert", TIE_BREAK: "Manche décisive", RESOLVED: "Résultat enregistré", CLOSED: "Terminé", POSTPONED: "Reporté",
};
const finished = (match: CageCompetitionMatch) => ["RESOLVED", "CLOSED"].includes(match.status);
const ready = (person?: TournamentParticipant) => Boolean(person?.present && person.registered && person.eligible && !["FORFEIT", "ELIMINATED", "DISQUALIFIED", "NO_SHOW"].includes(person.status) && Object.values(person.readiness).every(Boolean));
const readyToPromote = (runtime: CageCompetitionRuntime, match: CageCompetitionMatch) => match.status === "READY" && pair(runtime, match).every((person) => ready(person) && (person?.status === "READY" || (runtime.config.format === "open-mic-battle" && person?.guestStatus === "on_stage" && runtime.matches.some(previous => previous.id === match.sourceA?.matchId && finished(previous) && previous.winnerId === person.id))));
const pair = (runtime: CageCompetitionRuntime, match?: CageCompetitionMatch) => [match?.participantAId, match?.participantBId].map((id) => runtime.participants.find((person) => person.id === id));
const playable = (match: CageCompetitionMatch) => Boolean(match.participantAId && match.participantBId && !finished(match));
const nextMatches = (runtime: CageCompetitionRuntime) => runtime.matches.filter((match) => playable(match) && match.id !== runtime.activeMatchId && match.status !== "POSTPONED").sort((a, b) => a.order - b.order);
const titleFor = (runtime: CageCompetitionRuntime, match?: CageCompetitionMatch) => pair(runtime, match).map((person) => person?.person.name ?? "À déterminer").join(" vs ");

function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  return now;
}
function formatTime(seconds: number) { const value = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

function Person({ participant, label }: { participant?: TournamentParticipant; label?: string }) {
  return <span className="cage-workspace__person">
    {participant?.person.avatarUrl ? <img src={participant.person.avatarUrl} alt="" /> : <span className="cage-workspace__avatar"><Users aria-hidden="true" /></span>}
    <span><strong>{participant?.person.name ?? label ?? "À déterminer"}</strong><small>{participant ? participant.present === false ? "Connexion perdue" : PHASE[participant.status] : "En attente du résultat"}</small></span>
    {participant && ready(participant) ? <CircleCheck className="is-ready" aria-label="Prêt" /> : null}
  </span>;
}

function Readiness({ participant }: { participant?: TournamentParticipant }) {
  return <div className="cage-workspace__checks">{([
    ["camera", "Caméra", Camera], ["microphone", "Micro", Mic], ["connection", "Connexion", Wifi], ["mixer", "Mixeur", Settings2], ["permissions", "Accords", ShieldCheck],
  ] as const).map(([key, label, Icon]) => <span key={key} className={participant?.present && participant.readiness[key] ? "is-ready" : ""}><Icon aria-hidden="true" />{label}{participant?.present && participant.readiness[key] ? <Check aria-label="Validé" /> : null}</span>)}</div>;
}

function FighterCard({ participant, side, active, winner, showChecks }: { participant?: TournamentParticipant; side: "A" | "B"; active: boolean; winner: boolean; showChecks: boolean }) {
  const prepared = ready(participant);
  return <article className={`cage-fighter-card is-guest-tile${active ? " is-on-air" : ""}${winner ? " is-winner" : ""}`} aria-label={`Artiste ${side} · ${participant?.person.name ?? "À déterminer"}`}>
    <div className="cage-fighter-card__tile">
      {participant?.person.avatarUrl ? <img src={participant.person.avatarUrl} alt="" /> : <Users className="cage-fighter-card__placeholder" aria-hidden="true" />}
      {participant?.person.gradeLevel ? <span className="cage-fighter-card__grade"><MeewavGradeBadge level={participant.person.gradeLevel} size="xs" variant="icon" /></span> : null}
      {winner ? <span className="cage-fighter-card__signal is-gold"><Crown aria-hidden="true" />Vainqueur</span> : active ? <span className="cage-fighter-card__signal is-live">À l’antenne</span> : null}
      <div className="cage-fighter-card__caption"><strong>{participant?.person.name ?? "À déterminer"}</strong><small>{participant?.person.role ?? "Prochain talent"}</small></div>
    </div>
    <footer><span>{participant ? PHASE[participant.status] : "En attente"}</span>{showChecks ? <details><summary className={prepared ? "is-ready" : ""}>{prepared ? <CircleCheck /> : <Settings2 />}{prepared ? "Prêt" : "À préparer"}<ChevronRight /></summary><Readiness participant={participant} /></details> : null}</footer>
  </article>;
}

export type CageWorkspaceProps = { runtime: CageCompetitionRuntime; view: CageWorkspaceView; disabled: boolean; isControl: boolean; accountId: string; send: CageSendCommand; onOpenGuests?: () => void; onResults?: (matchId?: string) => void; onView: (view: CageWorkspaceView) => void };
type WorkspaceProps = CageWorkspaceProps;

function Bracket({ runtime, disabled, isControl, send, onOpenGuests, onView }: WorkspaceProps) {
  const [shortage, setShortage] = useState<"wait" | "byes" | "reduce">("wait");
  const selected = runtime.participants.filter((person) => person.seed !== null).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  const available = runtime.participants.filter((person) => cageRosterCandidate(runtime, person));
  const rounds = [...new Set(runtime.matches.map((match) => match.round))].sort((a, b) => a - b);
  const locked = Boolean(runtime.lockedAt);
  const count = runtime.config.participantCount;
  const battle = runtime.config.format === "open-mic-battle";
  const championship = runtime.config.format === "championship";
  const sizes = championship || runtime.config.rules.allowByes ? Array.from({ length: 63 }, (_, index) => index + 2) : [2, 4, 8, 16, 32, 64];
  const reductionKeepsSelection = championship || Number.isInteger(Math.log2(selected.length));
  const canDraw = available.length >= count || (available.length >= 2 && (
    (shortage === "byes" && runtime.config.rules.allowByes)
    || (shortage === "reduce" && runtime.config.rules.allowFormatReduction && (championship || Number.isInteger(Math.log2(available.length))))
  ));
  const [confirmReset, setConfirmReset] = useState(false);
  const standings = selected.map((participant) => {
    const played = runtime.matches.filter((match) => finished(match) && [match.participantAId, match.participantBId].includes(participant.id));
    return { participant, played: played.length, wins: played.filter((match) => match.winnerId === participant.id).length };
  }).sort((a, b) => b.wins - a.wins);
  const artistPicker = <CageArtistPicker people={runtime.participants.filter(person => person.seed !== null || available.includes(person))} selectedIds={selected.map(person => person.id)} maximum={count} disabled={disabled} battle={battle} championship={championship}
        onSelectMany={ids => { void send("roster.select", { participantIds: ids }); }}
        onSelect={(id, chosen) => { void send(chosen ? "roster.select" : "roster.remove", chosen ? { participantIds: [id] } : { participantId: id }); }}
        onMove={(id, direction) => { const person = selected.find(item => item.id === id); if (person?.seed) void send("roster.move", { participantId: id, toSeed: person.seed + direction }); }} />;
  return <>
    {locked || !isControl ? <div className="cage-workspace__summary"><span><strong>{runtime.config.title}</strong><small>{battle ? `${selected.length} participants choisis · de 2 à ${count}` : `${count} participants`} · {runtime.config.discipline}</small></span><span className="cage-workspace__status"><LockKeyhole />{battle && runtime.status === "LOCKED" ? "Duel préparé" : championship && runtime.status === "LOCKED" ? "Calendrier validé" : PHASE[runtime.status]}</span></div> : null}
    {locked || !isControl ? <div className="cage-workspace__metrics"><span><b>{selected.length}</b>Sélectionnés</span>{isControl ? <span><b>{available.length}</b>Disponibles</span> : null}<span><b>{runtime.matches.filter(finished).length}/{runtime.matches.length}</b>Matchs joués</span></div> : null}
    {isControl && locked ? <button className={runtime.publicBracketVisible ? "is-primary" : ""} aria-pressed={runtime.publicBracketVisible === true} disabled={disabled || !runtime.matches.length} onClick={() => void send("broadcast.bracket", { enabled: !runtime.publicBracketVisible })}><MonitorUp />{runtime.publicBracketVisible ? battle ? "Retirer le programme du public" : championship ? "Retirer le classement du public" : "Retirer le bracket du public" : battle ? "Afficher le programme au public" : championship ? "Afficher le classement au public" : "Afficher le bracket au public"}</button> : null}
    {runtime.config.format === "championship" && runtime.matches.length ? <section className="cage-workspace__section"><h3>Progression du championnat</h3><div className="cage-workspace__standings">{standings.map(({ participant, played, wins }) => <div key={participant.id}><Person participant={participant} /><span><b>{wins}</b> victoire{wins > 1 ? "s" : ""}<small>{played} rencontre{played > 1 ? "s" : ""}</small></span></div>)}</div></section> : null}
    {!locked && isControl ? <>
      {!battle && !runtime.matches.length ? <label className="cage-workspace__field-size">Nombre d’artistes
        <MeewavSelect aria-label="Nombre d’artistes du programme" value={count} disabled={disabled} onChange={event => void send("competition.configure", { format: runtime.config.format, participantCount: Number(event.target.value) })}>
          {sizes.map(size => <option key={size} value={size} disabled={size < selected.length}>{size} artistes</option>)}
        </MeewavSelect>
        <small>{selected.length}/{count} sélectionnés</small>
      </label> : null}
      {runtime.matches.length ? <details className="cage-workspace__placement-options"><summary>Modifier les artistes et leur ordre</summary>{artistPicker}</details> : artistPicker}
      {selected.length >= 2 || runtime.matches.length ? <details className="cage-workspace__placement-options"><summary>Options du placement</summary>
        {!battle && selected.length < count && (runtime.config.rules.allowByes || runtime.config.rules.allowFormatReduction) ? <label>Avec moins de {count} artistes<MeewavSelect value={shortage} onChange={event => setShortage(event.target.value as typeof shortage)}><option value="wait">Attendre les autres artistes</option>{runtime.config.rules.allowByes ? <option value="byes">Prévoir des places exemptées</option> : null}{runtime.config.rules.allowFormatReduction ? <option value="reduce" disabled={!reductionKeepsSelection}>Réduire le format</option> : null}</MeewavSelect>{shortage !== "wait" ? <button type="button" disabled={disabled || selected.length < 2 || (shortage === "reduce" && !reductionKeepsSelection)} onClick={() => void send("bracket.generate", { mode: "manual", shortage })}><Check />Créer avec ce choix</button> : null}</label> : null}
        {!battle ? <button type="button" disabled={disabled || !canDraw} onClick={() => void send("bracket.generate", { mode: "random", shortage })}><Shuffle />Tirer au sort parmi les {available.length} artistes disponibles</button> : null}
        {onOpenGuests ? <button type="button" onClick={onOpenGuests}><Users />Ajouter depuis les invités</button> : null}
        {runtime.matches.length ? <button type="button" disabled={disabled} onClick={() => setConfirmReset(!confirmReset)}><RefreshCw />Recommencer le placement</button> : null}
        {confirmReset ? <div className="cage-workspace__notice"><p>Effacer ce placement ? Les invitations sont conservées.</p><div className="cage-workspace__actions"><button disabled={disabled} onClick={() => { void send("bracket.reset").then(ok => { if (ok) setConfirmReset(false); }); }}>Effacer le placement</button><button onClick={() => setConfirmReset(false)}>Conserver</button></div></div> : null}
      </details> : null}
    </> : null}
    {rounds.length ? <div className="cage-workspace__rounds">{rounds.map((round) => <section className="cage-workspace__section" key={round}>
      <h3>{battle ? `Duel ${round}` : runtime.config.format === "championship" ? `Jour ${Math.floor(rounds.indexOf(round) * (runtime.config.championshipDays ?? 1) / rounds.length) + 1} · série ${round}` : round === rounds.at(-1) ? "Finale" : round === rounds.at(-2) ? "Demi-finales" : round === rounds.at(-3) ? "Quarts de finale" : `Tour ${round}`}<small>{runtime.matches.filter((match) => match.round === round).length} rencontre(s)</small></h3>
      {runtime.matches.filter((match) => match.round === round).map((match) => <article key={match.id} className={`cage-workspace__match-card${runtime.activeMatchId === match.id ? " is-current" : ""}`}>
        <header><small>{match.label || `Match ${match.order}`}</small><span>{PHASE[match.status]}</span></header>
        <div className="cage-bracket-pair">{pair(runtime, match).map((person, index) => <div className={person && match.winnerId === person.id ? "is-winner" : ""} key={index}>{person?.person.avatarUrl ? <img src={person.person.avatarUrl} alt="" /> : <span className="cage-bracket-pair__placeholder"><Users /></span>}<span><strong>{person?.person.name ?? (match[index === 0 ? "sourceA" : "sourceB"] ? "Vainqueur à venir" : "Exemption")}</strong><small>{person?.person.role ?? "Qualification en attente"}</small></span>{person && match.winnerId === person.id ? <Crown aria-label="Vainqueur" /> : null}{match.vote?.closedAt ? <b>{index === 0 ? match.vote.scoreA : match.vote.scoreB}</b> : null}</div>)}</div>
        {match.id === runtime.activeMatchId ? <button className="cage-workspace__text-action" onClick={() => onView("match")}>Voir le match<ChevronRight /></button> : null}
      </article>)}
    </section>)}</div> : !isControl ? <div className="cage-workspace__empty"><Trophy /><p>Le tableau sera publié par le host.</p></div> : null}
  </>;
}

function Regie(props: WorkspaceProps) {
  const { runtime, disabled, isControl, send, onOpenGuests } = props;
  const battle = runtime.config.format === "open-mic-battle";
  const current = runtime.matches.find(match => match.id === runtime.activeMatchId);
  const upcoming = nextMatches(runtime);
  const prepared = runtime.matches.find(match => match.id === runtime.preparedMatchId) ?? upcoming[0];
  const focus = current && !finished(current) ? current : prepared ?? current;
  const following = upcoming.find(match => match.id !== focus?.id);
  if (!isControl) {
    const own = runtime.participants.find(person => person.id === props.accountId);
    return <section className="cage-workspace__section"><h3>Ma préparation</h3>{own ? <><Person participant={own} /><Readiness participant={own} /><p>{["GREENHOUSE", "CALLED", "READY"].includes(own.status) ? "Prépare ta caméra, ton micro et ton monitoring dans les Invités, puis confirme que tu es prêt." : "La régie t’appellera quand ton prochain passage sera à préparer."}</p>{onOpenGuests ? <button onClick={onOpenGuests}><Users />Ouvrir ma préparation</button> : null}</> : <p>La préparation des participants est pilotée par le host. Tu peux suivre les rencontres dans le Bracket.</p>}</section>;
  }
  const prepareButton = (match: CageCompetitionMatch) => <button disabled={disabled || !runtime.lockedAt || ["GREENHOUSE", "READY"].includes(match.status)} onClick={() => void send("regie.prepare", { matchId: match.id })}><ArrowRight />{battle ? "Préparer ce duel" : "Préparer cette paire"}</button>;
  return <>
    <div className="cage-regie-toolbar"><label title="Prépare les suivants. Le démarrage reste sous ton contrôle."><input type="checkbox" role="switch" checked={runtime.autoRegie} disabled={disabled || !runtime.lockedAt} onChange={event => void send("regie.auto", { enabled: event.target.checked })} />Auto-régie</label>{onOpenGuests ? <button onClick={onOpenGuests}><Users />Invités</button> : null}</div>
    {focus ? <section className="cage-workspace__duel-focus" aria-label={focus.id === current?.id ? "Match en cours" : "Prochain match"}>
      <h3>{focus.label || (battle ? "Duel" : "Match")}<small>{PHASE[focus.status]}</small></h3>
      <div className="cage-fighter-deck">{pair(runtime, focus).map((person, index) => <FighterCard key={person?.id ?? index} participant={person} side={index === 0 ? "A" : "B"} active={focus.id === runtime.activeMatchId && focus.status === "IN_PROGRESS" && (focus.steps[focus.stepIndex]?.side === "BOTH" || focus.steps[focus.stepIndex]?.side === (index === 0 ? "A" : "B"))} winner={Boolean(person && focus.winnerId === person.id)} showChecks />)}<span className="cage-fighter-deck__versus" aria-hidden="true">VS</span></div>
      {focus.id !== current?.id && playable(focus) ? <div className="cage-workspace__actions">{prepareButton(focus)}</div> : null}
    </section> : <p>Choisis les artistes dans les Invités, puis prépare le tableau.</p>}
    {following ? <div className="cage-regie-next"><span><small>{battle ? "Prochain challenger" : "À suivre"}</small><strong>{titleFor(runtime, following)}</strong></span>{prepareButton(following)}</div> : null}
    {runtime.matches.some(match => match.status === "POSTPONED") ? <details className="cage-workspace__section"><summary>Matchs reportés</summary>{runtime.matches.filter(match => match.status === "POSTPONED").map(match => <div className="cage-regie-next" key={match.id}><span><small>{match.label}</small><strong>{titleFor(runtime, match)}</strong></span><button disabled={disabled || Boolean(runtime.preparedMatchId && runtime.preparedMatchId !== match.id)} onClick={() => void send("regie.prepare", { matchId: match.id })}>Préparer ce match</button></div>)}</details> : null}
    <ParticipantOperations {...props} />
    {runtime.journal.length ? <details className="cage-workspace__section"><summary>Journal de la régie</summary><ol className="cage-workspace__journal">{[...runtime.journal].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 20).map(entry => <li key={entry.id}><time>{new Date(entry.at).toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" })}</time><span>{entry.detail || entry.action}</span></li>)}</ol></details> : null}
  </>;
}

function ParticipantOperations({ runtime, disabled, send }: WorkspaceProps) {
  const [participantId, setParticipantId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const participant = runtime.participants.find((item) => item.id === participantId);
  const participantMatches = runtime.matches.filter((item) => !finished(item) && item.participantAId && item.participantBId && [item.participantAId, item.participantBId].includes(participantId)).sort((a, b) => a.order - b.order);
  const affectedMatch = participantMatches.find((item) => [runtime.activeMatchId, runtime.preparedMatchId].includes(item.id)) ?? participantMatches[0];
  const replacements = runtime.participants.filter((item) => ready(item) && item.registered && item.seed === null && item.id !== participantId);
  return <details className="cage-workspace__section"><summary>Absence, remplacement ou report</summary>
    <label>Participant concerné<MeewavSelect value={participantId} onChange={(event) => { setParticipantId(event.target.value); setConfirmForfeit(false); }}><option value="">Choisir le participant</option>{runtime.participants.filter((item) => item.seed !== null).map((item) => <option value={item.id} key={item.id}>{item.person.name}</option>)}</MeewavSelect></label>
    {participant ? <><Person participant={participant} /><label>Motif<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif consigné dans le journal" maxLength={200} /></label>
      <div className="cage-workspace__actions"><button disabled={disabled} onClick={() => void send("participant.recall", { participantId })}>Appeler de nouveau</button><button disabled={disabled} onClick={() => void send("participant.grace", { participantId })}>Délai de grâce</button></div>
      {runtime.config.rules.allowReplacement ? <label>Remplaçant prêt<MeewavSelect value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">Choisir un remplaçant</option>{replacements.map((item) => <option key={item.id} value={item.id}>{item.person.name}</option>)}</MeewavSelect><button disabled={disabled || !replacementId || !reason.trim()} onClick={() => void send("participant.replace", { participantId, replacementId, reason })}>Confirmer le remplacement</button></label> : null}
      <div className="cage-workspace__actions"><button disabled={disabled || !reason.trim() || !affectedMatch} onClick={() => void send("match.report", { matchId: affectedMatch?.id, reason })}>Reporter le match</button><button className="is-danger" disabled={disabled || !reason.trim() || !affectedMatch} onClick={() => setConfirmForfeit(!confirmForfeit)}>Forfait</button></div>
      {confirmForfeit ? <div className="cage-workspace__notice"><p>Déclarer le forfait de {participant.person.name} et appliquer le règlement ?</p><button className="is-danger" disabled={disabled || !reason.trim()} onClick={() => void send("participant.forfeit", { participantId, reason }).then((ok) => { if (ok) setConfirmForfeit(false); })}>Confirmer le forfait</button></div> : null}
    </> : null}
  </details>;
}

function Match(props: WorkspaceProps) {
  const { runtime, disabled, isControl, send, onView } = props;
  const now = useClock();
  const match = runtime.matches.find((item) => item.id === runtime.activeMatchId);
  const [incidentPerson, setIncidentPerson] = useState("");
  const [reason, setReason] = useState("");
  if (!match) return <div className="cage-workspace__empty"><Swords /><p>Le prochain match arrive depuis la Régie, lorsque ses participants sont prêts.</p><button onClick={() => onView("regie")}>Ouvrir la Régie<ArrowRight /></button></div>;
  const step = match.steps[match.stepIndex];
  const elapsed = match.timer.elapsedSeconds + (match.timer.startedAt ? Math.max(0, (now - Date.parse(match.timer.startedAt)) / 1000) : 0);
  return <>
    <div className="cage-workspace__summary"><span><strong>{match.label || `Match ${match.order}`}</strong><small>{PHASE[match.status]}</small></span><Swords /></div>
    <div className="cage-fighter-deck" key={match.id}>{pair(runtime, match).map((person, index) => <FighterCard key={person?.id ?? index} participant={person} side={index === 0 ? "A" : "B"} active={match.status === "IN_PROGRESS" && (step?.side === "BOTH" || step?.side === (index === 0 ? "A" : "B"))} winner={Boolean(person && match.winnerId === person.id)} showChecks={isControl || person?.id === props.accountId} />)}<span className="cage-fighter-deck__versus" aria-hidden="true">VS</span></div>
    {finished(match) && props.onResults ? <button type="button" onClick={() => props.onResults?.(match.id)}><Trophy />Voir les résultats du match</button> : null}
    <div className="cage-workspace__timer"><small>{step?.label ?? "Performances terminées"}</small>{step && step.durationSeconds > 0 ? <time>{formatTime(step.durationSeconds - elapsed)}</time> : null}<span>{Math.min(match.stepIndex + 1, match.steps.length)} / {match.steps.length} passage(s)</span></div>
    <details className="cage-workspace__passage-plan"><summary>Ordre des passages <span>{match.steps.length} passages</span></summary><ol className="cage-workspace__steps">{match.steps.map((item, index) => <li key={item.id} className={index === match.stepIndex ? "is-current" : index < match.stepIndex ? "is-done" : ""}>{index < match.stepIndex ? <Check /> : <span>{index + 1}</span>}<strong>{item.label}</strong></li>)}</ol></details>
    {match.status === "TIE_BREAK" ? <p className="cage-workspace__notice">Égalité : une manche décisive précède un nouveau vote. Aucun gagnant n’a été choisi manuellement.</p> : null}
    {match.incident ? <div className="cage-workspace__notice"><strong>Incident technique — reconnexion</strong>{isControl || match.incident.participantId === props.accountId ? <><p>{match.incident.reason}</p><small>Délai restant : {formatTime((Date.parse(match.incident.graceEndsAt) - now) / 1000)}</small></> : <p>Le match est suspendu le temps de rétablir la connexion.</p>}</div> : null}
    {isControl ? <><div className="cage-workspace__actions">{match.status === "IN_PROGRESS" ? <button disabled={disabled} onClick={() => void send("match.pause")}><Pause />Pause</button> : null}{match.status === "PAUSED" ? <><button disabled={disabled} onClick={() => void send("match.resume")}><Play />Reprendre</button>{match.incident ? <button disabled={disabled} onClick={() => void send("match.restart")}><RefreshCw />Recommencer le passage</button> : null}</> : null}</div>
      {["IN_PROGRESS", "PAUSED"].includes(match.status) ? <details className="cage-workspace__section"><summary>Incident technique</summary><label>Participant<MeewavSelect value={incidentPerson} onChange={(event) => setIncidentPerson(event.target.value)}><option value="">Participant concerné</option>{pair(runtime, match).filter(Boolean).map((person) => <option key={person!.id} value={person!.id}>{person!.person.name}</option>)}</MeewavSelect></label><label>Motif<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /></label><button className="is-danger" disabled={disabled || !incidentPerson || !reason.trim()} onClick={() => void send("match.incident", { participantId: incidentPerson, reason })}>Suspendre pour incident</button></details> : null}
    </> : null}
  </>;
}

function Vote({ runtime, isControl, accountId, disabled, send }: WorkspaceProps) {
  const now = useClock();
  const match = runtime.matches.find((item) => item.id === runtime.activeMatchId);
  if (!match) return <div className="cage-workspace__empty"><Trophy /><p>Le vote sera disponible après les performances du match.</p></div>;
  const ballot = match.vote?.ballots[accountId];
  const closed = Boolean(match.vote?.closedAt);
  const eligible = Boolean(accountId && !accountId.startsWith("anonymous") && !isControl && ![match.participantAId, match.participantBId].includes(accountId));
  const active = match.status === "VOTING" && match.vote?.open && (!match.vote.endsAt || Date.parse(match.vote.endsAt) > now);
  return <>
    <div className="cage-workspace__summary"><span><strong>La décision du public</strong><small>{PHASE[match.status]}</small></span>{match.vote?.open ? <span className="cage-workspace__status"><Clock3 />{match.vote.endsAt ? formatTime((Date.parse(match.vote.endsAt) - now) / 1000) : "Clôture manuelle"}</span> : <Trophy />}</div>
    <div className="cage-workspace__ballots">{pair(runtime, match).map((person, index) => {
      const choice = index === 0 ? "A" : "B";
      return <button key={choice} aria-pressed={ballot === choice} disabled={disabled || !eligible || !active || Boolean(ballot) || !person} onClick={() => void send("vote.cast", { choice, accountId })}><Person participant={person} /><span>{closed ? index === 0 ? match.vote?.scoreA : match.vote?.scoreB : ballot === choice ? <Check /> : choice}</span>{match.winnerId && match.winnerId === person?.id ? <Crown className="is-winner" /> : null}</button>;
    })}</div>
    <p className="cage-workspace__notice">{match.status === "TIE_BREAK" ? "Égalité. La manche décisive se pilote dans Match, puis un nouveau vote sera ouvert." : match.winnerId ? runtime.config.format === "championship" ? `${runtime.participants.find((person) => person.id === match.winnerId)?.person.name ?? "Le vainqueur"} remporte cette rencontre. Le classement est mis à jour ; les deux artistes poursuivent le calendrier.` : `${runtime.participants.find((person) => person.id === match.winnerId)?.person.name ?? "Le vainqueur"} ${runtime.config.format === "open-mic-battle" ? "reste sur scène. Le perdant sort et le prochain challenger se prépare." : "avance automatiquement dans le Bracket."}` : ballot ? "Ton vote est enregistré. Le résultat apparaîtra à la clôture." : active ? "Une voix par compte éligible. Les résultats restent masqués jusqu’à la clôture." : "Les performances prévues par le règlement doivent être terminées avant d’ouvrir le vote."}</p>
    {runtime.config.rules.votingMode !== "public" ? <p>Mode prévu : {runtime.config.rules.votingMode === "jury" ? "jury" : "mixte"}. Les droits de vote sont définis par le règlement.</p> : null}
  </>;
}

export default function CageCompetitionWorkspace(props: WorkspaceProps) {
  return <div className={`cage-workspace${props.isControl ? " is-host-control" : ""}`} data-cage-view={props.view}>{props.runtime.config.format === "open-mic" ? <CageOpenMicWorkspace {...props} /> : props.view === "bracket" ? <Bracket {...props} /> : props.view === "regie" ? <Regie {...props} /> : props.view === "match" ? <Match {...props} /> : <Vote {...props} />}</div>;
}

export function CageCommandBar({ runtime, disabled, isControl, send, onView, onOpenGuests, onResults }: WorkspaceProps) {
  if (runtime.config.format === "open-mic") return <CageOpenMicCommandBar runtime={runtime} disabled={disabled} isControl={isControl} send={send} onView={onView} onOpenGuests={onOpenGuests} onResults={onResults} view="bracket" accountId="" />;
  const battle = runtime.config.format === "open-mic-battle";
  const selected = runtime.participants.filter(person => person.seed !== null);
  const match = runtime.matches.find((item) => item.id === runtime.activeMatchId);
  const prepared = runtime.matches.find((item) => item.id === runtime.preparedMatchId) ?? nextMatches(runtime)[0];
  let label = battle ? "Choisir les participants" : runtime.config.format === "championship" ? "Voir le classement" : "Voir le Bracket";
  let hint = runtime.config.format === "championship" && runtime.status === "LOCKED" ? "Calendrier validé" : PHASE[runtime.status];
  let action: CageCompetitionAction | undefined;
  let payload: CageCompetitionPayload = {};
  let blocked = false;
  let view: CageWorkspaceView = "bracket";
  const available = runtime.participants.filter(person => cageRosterCandidate(runtime, person));
  const required = battle ? 2 : runtime.config.participantCount;
  const canAdaptSize = !battle && selected.length >= 2 && selected.length < required && (runtime.config.format === "championship" || runtime.config.rules.allowByes || Number.isInteger(Math.log2(selected.length))) && selected.every(person => cageRosterCandidate(runtime, person));
  let startWithGuests = !canAdaptSize && !runtime.lockedAt && !runtime.matches.length && available.length < required && selected.length < required && Boolean(onOpenGuests);
  if (!runtime.lockedAt) {
    if (runtime.matches.length) { label = "Valider le placement"; hint = "Vérifie les rencontres ci-dessus."; action = "bracket.lock"; view = "regie"; }
    else if (canAdaptSize) {
      label = `Adapter à ${selected.length} artistes`;
      hint = `Prévu pour ${required} · conserver les ${selected.length} artistes cochés.`;
      action = "competition.configure";
      payload = { format: runtime.config.format, participantCount: selected.length };
    }
    else if (startWithGuests) {
      label = "Choisir dans les invités"; hint = "Invite les artistes, puis coche-les dans la liste.";
    } else {
      label = battle ? "Créer les duels" : runtime.config.format === "championship" ? "Créer le calendrier" : "Créer le tableau";
      action = "bracket.generate"; payload = { mode: "manual" };
      blocked = selected.length < required || selected.some(person => !cageRosterCandidate(runtime, person));
      hint = selected.length < required ? `Coche ${required - selected.length} artiste${required - selected.length > 1 ? "s" : ""} dans la liste.` : blocked ? "Un artiste sélectionné est indisponible." : "Le placement suit l’ordre de ta liste.";
    }
  } else if (match && !finished(match) && match.status !== "POSTPONED") {
    view = "match"; hint = match.steps[match.stepIndex]?.label ?? PHASE[match.status];
    if (match.status === "IN_PROGRESS") { label = "Terminer le passage"; action = "match.end-step"; }
    else if (match.status === "PAUSED") { label = "Reprendre le passage"; action = "match.resume"; blocked = !pair(runtime, match).every(ready); }
    else if (match.status === "READY_FOR_VOTE") { label = "Ouvrir le vote"; action = "vote.open"; view = "vote"; }
    else if (match.status === "VOTING") { label = "Clore le vote"; action = "vote.close"; view = "vote"; hint = "Vote du public"; }
    else if (["ON_STAGE", "TIE_BREAK"].includes(match.status)) { label = match.status === "TIE_BREAK" ? "Démarrer la manche décisive" : match.stepIndex > 0 ? "Démarrer le passage suivant" : battle ? "Démarrer le duel" : "Démarrer le match"; action = "match.start"; blocked = !pair(runtime, match).every(ready); }
    else { const pairReady = readyToPromote(runtime, match); label = pairReady ? "Monter les 2 sur scène" : "Préparer les 2"; action = pairReady ? "regie.promote" : "regie.prepare"; payload = { matchId: match.id }; view = "regie"; blocked = !pairReady && ["GREENHOUSE", "CALLING", "READY"].includes(match.status); if (blocked) label = "En attente des deux Ready"; }
  } else if (prepared) {
    view = "regie"; hint = battle ? match ? "Le gagnant reste ; le challenger suivant rejoint la scène" : "Premier duel" : match ? "Prochain match" : "Premier match"; payload = { matchId: prepared.id };
    const pairReady = readyToPromote(runtime, prepared);
    label = runtime.config.format === "open-mic-battle" && match ? pairReady ? "Monter le prochain challenger" : "Préparer le prochain challenger" : pairReady ? (battle || match ? "Monter les 2 sur scène" : "Monter le premier match") : (match ? "Préparer les 2 suivants" : "Préparer le premier match");
    action = pairReady ? "regie.promote" : "regie.prepare";
    blocked = !pairReady && ["GREENHOUSE", "CALLING", "READY"].includes(prepared.status);
    if (blocked) { label = battle ? "En attente des artistes" : "En attente des deux Ready"; if (battle) hint = "Caméra, micro et accord à confirmer dans la préparation du duel"; }
  } else if (runtime.status === "COMPLETED") { label = "Voir les résultats"; hint = "Compétition terminée"; }
  const juryMissing = runtime.config.rules.votingMode !== "public"
    && (runtime.votingPolicy?.mode !== runtime.config.rules.votingMode || !runtime.votingPolicy.jurorIds.length);
  if (isControl && juryMissing && action && ["regie.promote", "match.start", "vote.open"].includes(action)) {
    label = "Configurer le jury";
    hint = `Invités → Coulisses → Jury · ${runtime.config.rules.votingMode === "mixed" ? "Public et jury" : "Jury seul"}`;
    startWithGuests = Boolean(onOpenGuests);
    action = undefined;
    blocked = !onOpenGuests;
  }
  return <footer className="cage-command-bar"><span>{match ? <small>{match.label || `Match ${match.order}`}</small> : null}<strong>{match ? titleFor(runtime, match) : runtime.config.title}</strong><em>{hint}</em></span><button className="is-primary" disabled={disabled || (isControl && blocked)} onClick={() => { if (runtime.status === "COMPLETED" && onResults) onResults(); else if (startWithGuests && isControl) onOpenGuests?.(); else if (action && isControl) void send(action, payload).then((ok) => { if (ok) onView(view); }); else onView(view); }}>{isControl ? label : `Voir ${view === "bracket" ? runtime.config.format === "open-mic-battle" ? "les Participants" : runtime.config.format === "championship" ? "le Classement" : "le Bracket" : view === "regie" ? "la Régie" : view === "vote" ? "le Vote" : "le Match"}`}<ArrowRight /></button></footer>;
}
