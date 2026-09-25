import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Camera, Check, Clock3, Heart, Mic, Pause, Play, RefreshCw, Star, Users, Wifi } from "lucide-react";
import type { CageOpenMicPassage, TournamentParticipant } from "../cageCompetition.types";
import type { CageWorkspaceProps } from "./CageCompetitionWorkspace";

const LABEL: Record<string, string> = { WAITING: "En attente", GREENHOUSE: "En préparation", READY: "Prêt", ON_STAGE: "Sur scène", IN_PROGRESS: "Passage en cours", PAUSED: "En pause", PERFORMED: "Passage terminé", POSTPONED: "Reporté", SKIPPED: "Passage retiré" };
const time = (seconds: number) => { const value = Math.ceil(Math.max(0, seconds)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; };
const ready = (person?: TournamentParticipant) => Boolean(person?.present && person.registered && person.eligible && Object.values(person.readiness).every(Boolean));

function Artist({ person, status }: { person?: TournamentParticipant; status?: string }) {
  return <span className="cage-workspace__person">{person?.person.avatarUrl ? <img src={person.person.avatarUrl} alt="" /> : <span className="cage-workspace__avatar"><Mic /></span>}<span><strong>{person?.person.name ?? "Artiste à confirmer"}</strong><small>{person?.present === false ? "Connexion perdue" : LABEL[status ?? "WAITING"] ?? status}</small></span></span>;
}

export default function CageOpenMicWorkspace(props: CageWorkspaceProps) {
  const { runtime, view, disabled, isControl, accountId, send, onOpenGuests } = props;
  const entries = [...(runtime.openMicEntries ?? [])].sort((a, b) => a.order - b.order);
  const current = entries.find((entry) => entry.id === runtime.activeEntryId);
  const prepared = entries.find((entry) => entry.id === runtime.preparedEntryId) ?? entries.find((entry) => entry.status === "WAITING");
  const findArtist = (entry?: CageOpenMicPassage) => runtime.participants.find((person) => person.id === entry?.participantId);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const available = runtime.participants.filter((person) => person.present && person.registered && person.eligible && !entries.some((entry) => entry.participantId === person.id));

  if (view === "bracket") return <>
    <div className="cage-workspace__summary"><span><strong>{runtime.config.title}</strong><small>Open Mic · passages individuels</small></span><Mic /></div>
    <p>Chaque artiste dispose de son passage. Le programme suit l’ordre de scène, sans élimination ni adversaire.</p>
    {isControl ? <><button className={runtime.publicBracketVisible ? "is-primary" : ""} disabled={disabled || !entries.length} aria-pressed={runtime.publicBracketVisible} onClick={() => void send("broadcast.bracket", { enabled: !runtime.publicBracketVisible })}>{runtime.publicBracketVisible ? "Retirer le programme du public" : "Afficher le programme au public"}</button>
      <details className="cage-workspace__section"><summary>Ajouter des artistes inscrits</summary>{available.length ? <><div className="cage-workspace__roster">{available.map((person) => <div className="cage-workspace__roster-row" key={person.id}><label><input type="checkbox" checked={selected.includes(person.id)} onChange={() => setSelected((ids) => ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id])} /><Artist person={person} /></label></div>)}</div><button disabled={disabled || !selected.length} onClick={() => void send("openmic.schedule", { participantIds: selected }).then((ok) => { if (ok) setSelected([]); })}><Check />Ajouter au programme</button></> : <p>Les prochains inscrits disponibles apparaîtront ici.</p>}{onOpenGuests ? <button onClick={onOpenGuests}><Users />Ouvrir les Invités</button> : null}</details></> : null}
    <div className="cage-workspace__rounds">{entries.map((entry, index) => <article className={`cage-workspace__match-card${entry.id === current?.id ? " is-current" : ""}`} key={entry.id}><header><small>Passage {entry.order}</small><span>{LABEL[entry.status]}</span></header><Artist person={findArtist(entry)} status={entry.status} />{isControl && entry.status === "WAITING" ? <div className="cage-workspace__actions"><button aria-label="Avancer ce passage" disabled={disabled || index === 0} onClick={() => void send("openmic.move", { entryId: entry.id, direction: -1 })}><ArrowUp /></button><button aria-label="Reculer ce passage" disabled={disabled || index === entries.length - 1} onClick={() => void send("openmic.move", { entryId: entry.id, direction: 1 })}><ArrowDown /></button><button disabled={disabled} onClick={() => void send("openmic.remove", { entryId: entry.id })}>Retirer du programme</button></div> : null}</article>)}</div>
    {!entries.length ? <div className="cage-workspace__empty"><Mic /><p>Le programme attend les artistes inscrits. Aucun duel n’est créé.</p></div> : null}
  </>;

  if (view === "regie") {
    const visibleEntries = isControl ? entries.filter((entry) => [current?.id, prepared?.id].includes(entry.id)) : entries.filter((entry) => entry.participantId === accountId);
    return <><div className="cage-workspace__summary"><span><strong>Préparer les passages</strong><small>Un artiste sur scène, le suivant en préparation.</small></span><Users /></div>{isControl ? <label className="cage-workspace__toggle"><span><strong>Auto-régie</strong><small>Prépare le suivant et le fait monter quand il est prêt. Tu gardes la main sur le démarrage.</small></span><input type="checkbox" role="switch" checked={runtime.autoRegie} disabled={disabled} onChange={(event) => void send("regie.auto", { enabled: event.target.checked })} /></label> : null}{visibleEntries.map((entry) => {
      const person = findArtist(entry);
      return <section className="cage-workspace__section" key={entry.id}><h3>{entry.id === current?.id ? ["PERFORMED", "SKIPPED"].includes(entry.status) ? "DERNIER PASSAGE" : "SUR SCÈNE" : "PROCHAIN PASSAGE"}</h3><Artist person={person} status={entry.status} /><div className="cage-workspace__checks">{(["camera", "microphone", "connection", "mixer", "permissions"] as const).map((key) => <span className={person?.present && person.readiness[key] ? "is-ready" : ""} key={key}>{key === "camera" ? <Camera /> : key === "microphone" ? <Mic /> : <Wifi />}{({ camera: "Caméra", microphone: "Micro", connection: "Connexion", mixer: "Mixeur", permissions: "Accords" })[key]}</span>)}</div></section>;
    })}{onOpenGuests ? <button onClick={onOpenGuests}><Users />Ouvrir la préparation dans les Invités</button> : null}
      {isControl && prepared ? <section className="cage-workspace__section"><label>Motif du report<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /></label><button disabled={disabled || !reason.trim()} onClick={() => void send("openmic.report", { entryId: prepared.id, reason })}>Reporter ce passage</button></section> : null}
      {isControl && prepared ? <details className="cage-workspace__section"><summary>Absence ou remplacement</summary><div className="cage-workspace__actions"><button disabled={disabled} onClick={() => void send("participant.recall", { entryId: prepared.id, participantId: prepared.participantId })}>Rappeler l’artiste</button><button disabled={disabled} onClick={() => void send("participant.grace", { entryId: prepared.id, participantId: prepared.participantId })}>Accorder un délai</button></div><label>Motif<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /></label>{runtime.config.rules.allowReplacement ? <><label>Remplaçant prêt<select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">Choisir un artiste prêt</option>{available.filter(ready).map((artist) => <option key={artist.id} value={artist.id}>{artist.person.name}</option>)}</select></label><button disabled={disabled || !replacementId || !reason.trim()} onClick={() => void send("participant.replace", { entryId: prepared.id, participantId: prepared.participantId, replacementId, reason })}>Confirmer le remplacement</button></> : null}<button disabled={disabled || !reason.trim()} onClick={() => setConfirmSkip(!confirmSkip)}>Retirer le passage pour absence</button>{confirmSkip ? <p className="cage-workspace__notice">Le retrait sera permis après le délai de grâce prévu. L’artiste ne sera pas déclaré perdant d’un duel.<button disabled={disabled || !reason.trim()} onClick={() => void send("participant.forfeit", { entryId: prepared.id, participantId: prepared.participantId, reason }).then((ok) => { if (ok) setConfirmSkip(false); })}>Confirmer le retrait</button></p> : null}</details> : null}
      {isControl && entries.some((entry) => entry.status === "POSTPONED") ? <section className="cage-workspace__section"><h3>Passages reportés</h3>{entries.filter((entry) => entry.status === "POSTPONED").map((entry) => <div key={entry.id}><Artist person={findArtist(entry)} status={entry.status} /><button disabled={disabled || Boolean(runtime.preparedEntryId && runtime.preparedEntryId !== entry.id)} onClick={() => void send("openmic.prepare", { entryId: entry.id })}>Préparer ce passage</button></div>)}</section> : null}
    </>;
  }

  if (view === "match") {
    if (!current) return <div className="cage-workspace__empty"><Mic /><p>Le prochain artiste montera depuis la Régie, une fois sa préparation confirmée.</p></div>;
    const elapsed = current.timer.elapsedSeconds + (current.timer.startedAt ? Math.max(0, (now - Date.parse(current.timer.startedAt)) / 1000) : 0);
    return <><div className="cage-workspace__summary"><span><strong>Passage {current.order}</strong><small>{LABEL[current.status]}</small></span><Mic /></div><section className="cage-workspace__section"><Artist person={findArtist(current)} status={current.status} /></section><div className="cage-workspace__timer"><small>Temps du passage individuel</small><time>{time(current.status === "PERFORMED" ? 0 : current.durationSeconds - elapsed)}</time></div>
      {current.incident ? <p className="cage-workspace__notice">Incident technique — reconnexion. {isControl ? current.incident.reason : "Le passage reprendra au signal de la régie."}</p> : null}
      {isControl ? <><div className="cage-workspace__actions">{current.status === "IN_PROGRESS" ? <button disabled={disabled} onClick={() => void send("openmic.pause", { entryId: current.id })}><Pause />Pause</button> : null}{current.status === "PAUSED" && current.incident ? <button disabled={disabled || !ready(findArtist(current))} onClick={() => void send("openmic.restart", { entryId: current.id })}><RefreshCw />Recommencer le passage</button> : null}</div>{["IN_PROGRESS", "PAUSED"].includes(current.status) ? <details className="cage-workspace__section"><summary>Incident ou report</summary><label>Motif<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /></label><div className="cage-workspace__actions"><button disabled={disabled || !reason.trim()} onClick={() => void send("openmic.incident", { entryId: current.id, reason })}>Suspendre pour incident</button><button disabled={disabled || current.status !== "PAUSED" || !reason.trim()} onClick={() => void send("openmic.report", { entryId: current.id, reason })}>Reporter le passage</button></div></details> : null}</> : null}
    </>;
  }
  return <CageOpenMicPublic {...props} />;
}

export function CageOpenMicPublic({ runtime, disabled, isControl, accountId, send }: CageWorkspaceProps) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const performed = (runtime.openMicEntries ?? []).filter((entry) => entry.status === "PERFORMED");
  const entry = performed.find((item) => item.id === selectedEntryId) ?? performed.find((item) => item.id === runtime.feedbackEntryId) ?? performed.at(-1);
  const person = runtime.participants.find((item) => item.id === entry?.participantId);
  const mode = runtime.config.rules.openMicFeedback;
  const own = entry?.feedback?.responses[accountId];
  const open = Boolean(entry?.feedback?.open && entry.feedback.endsAt && Date.parse(entry.feedback.endsAt) > now);
  const canRespond = !isControl && Boolean(accountId && !accountId.startsWith("anonymous") && accountId !== entry?.participantId && open && own === undefined);
  if (!mode) return <p className="cage-workspace__notice">Aucun mode de vote n’a été défini pour cette ancienne session. Les passages se déroulent sans ouvrir de vote.</p>;
  if (mode === "none") return <section className="cage-workspace__section"><h3>Passages libres</h3><p>Cet Open Mic se déroule sans vote, classement ni élimination. Profitez de chaque artiste.</p></section>;
  return <>
    <div className="cage-workspace__summary"><span><strong>{mode === "scored" ? "La note du public" : "Soutenir les artistes"}</strong><small>{mode === "scored" ? "Une note par passage, sans élimination" : "Un vote de soutien par passage"}</small></span>{mode === "scored" ? <Star /> : <Heart />}</div>
    {!entry ? <p className="cage-workspace__notice">Le vote s’ouvrira après le premier passage.</p> : <section className="cage-workspace__section">
      {performed.length > 1 ? <label>Passage<select value={entry.id} onChange={(event) => setSelectedEntryId(event.target.value)}>{performed.map((item) => <option key={item.id} value={item.id}>Passage {item.order} · {runtime.participants.find((artist) => artist.id === item.participantId)?.person.name}</option>)}</select></label> : null}
      <Artist person={person} status={entry.status} />
      {open && entry.feedback?.endsAt ? <span className="cage-workspace__status"><Clock3 />{time((Date.parse(entry.feedback.endsAt) - now) / 1000)}</span> : null}
      {isControl ? <button disabled={disabled || (!open && Boolean(entry.feedback?.closedAt)) || Boolean(runtime.feedbackEntryId && runtime.feedbackEntryId !== entry.id)} onClick={() => void send(open ? "openmic.feedback.close" : "openmic.feedback.open", { entryId: entry.id })}>{open ? "Clore le vote" : entry.feedback?.closedAt ? "Vote terminé" : "Ouvrir le vote du public"}</button> : mode === "scored" ? <div className="cage-workspace__actions" role="group" aria-label="Noter ce passage de 1 à 5">{([1, 2, 3, 4, 5] as const).map((score) => <button key={score} aria-label={`${score} sur 5`} aria-pressed={own === score} disabled={disabled || !canRespond} onClick={() => void send("openmic.feedback.cast", { entryId: entry.id, score })}><Star />{score}</button>)}</div> : <button className={own !== undefined ? "is-primary" : ""} aria-pressed={own !== undefined} disabled={disabled || !canRespond} onClick={() => void send("openmic.feedback.cast", { entryId: entry.id })}><Heart />{own !== undefined ? "Vote enregistré" : "Voter pour cet artiste"}</button>}
      {entry.feedback?.closedAt ? <p>{mode === "scored" ? `${entry.feedback.average === null ? "Aucune note" : `${entry.feedback.average.toFixed(1)} / 5`} · ${entry.feedback.count} vote(s)` : `${entry.feedback.count} vote(s)`}</p> : <p>{own !== undefined ? "Ton vote est enregistré. Les résultats paraîtront à la clôture." : open ? "Un vote par compte. Les résultats restent masqués pendant le vote." : "Le vote attend le signal de la régie."}</p>}
    </section>}
    {mode === "scored" ? <section className="cage-workspace__section"><h3>Notes des passages terminés</h3><div className="cage-workspace__standings">{performed.filter((item) => item.feedback?.closedAt && item.feedback.average !== null).sort((a, b) => (b.feedback?.average ?? 0) - (a.feedback?.average ?? 0)).map((item) => <div key={item.id}><Artist person={runtime.participants.find((artist) => artist.id === item.participantId)} status={item.status} /><span><b>{item.feedback?.average?.toFixed(1)} / 5</b><small>{item.feedback?.count} vote(s)</small></span></div>)}</div><p>Les notes ne retirent aucun artiste du programme.</p></section> : null}
  </>;
}

export function CageOpenMicCommandBar({ runtime, disabled, isControl, send, onView, onOpenGuests, onResults }: CageWorkspaceProps) {
  const entries = runtime.openMicEntries ?? [];
  const current = entries.find((entry) => entry.id === runtime.activeEntryId);
  const prepared = entries.find((entry) => entry.id === runtime.preparedEntryId) ?? entries.filter((entry) => entry.status === "WAITING").sort((a, b) => a.order - b.order)[0];
  const person = runtime.participants.find((item) => item.id === (current?.status !== "PERFORMED" ? current?.participantId : prepared?.participantId));
  const available = runtime.participants.filter((artist) => artist.present && artist.registered && artist.eligible && !["NO_SHOW", "FORFEIT", "DISQUALIFIED"].includes(artist.status)).slice(0, runtime.config.participantCount);
  const empty = !entries.length;
  let label = empty && isControl ? available.length ? "Créer le programme" : "Choisir dans les Invités" : runtime.status === "COMPLETED" ? "Voir les résultats" : "Voir le programme";
  let action: Parameters<CageWorkspaceProps["send"]>[0] | undefined;
  let entry = current;
  let blocked = false;
  if (current && !["PERFORMED", "POSTPONED", "SKIPPED"].includes(current.status)) {
    if (current.status === "IN_PROGRESS") { label = "Terminer le passage"; action = "openmic.end"; }
    else if (current.status === "PAUSED") { label = "Reprendre le passage"; action = "openmic.resume"; blocked = !ready(person); }
    else if (current.status === "ON_STAGE") { label = "Démarrer le passage"; action = "openmic.start"; blocked = !ready(person); }
  } else if (prepared) {
    entry = prepared;
    if (prepared.status === "READY") { label = "Monter l’artiste sur scène"; action = "openmic.promote"; blocked = !ready(runtime.participants.find((item) => item.id === prepared.participantId)); }
    else if (prepared.status === "GREENHOUSE") { label = "En attente de sa préparation"; blocked = true; }
    else { label = current ? "Préparer l’artiste suivant" : "Préparer le premier artiste"; action = "openmic.prepare"; }
  }
  const awaitingFeedback = runtime.config.rules.openMicFeedback && runtime.config.rules.openMicFeedback !== "none"
    ? entries.find((item) => item.status === "PERFORMED" && !item.feedback?.closedAt) : undefined;
  if (awaitingFeedback && (!current || ["PERFORMED", "POSTPONED", "SKIPPED"].includes(current.status))) {
    entry = awaitingFeedback; blocked = false;
    label = awaitingFeedback.feedback?.open ? "Clore le vote" : "Ouvrir le vote";
    action = awaitingFeedback.feedback?.open ? "openmic.feedback.close" : "openmic.feedback.open";
  }
  return <footer className="cage-command-bar"><span><small>OPEN MIC · {entry ? `PASSAGE ${entry.order}` : "PROGRAMME"}</small><strong>{runtime.participants.find((item) => item.id === entry?.participantId)?.person.name ?? runtime.config.title}</strong><em>{entry ? LABEL[entry.status] : `${entries.length} passage(s)`}</em></span><button className="is-primary" disabled={disabled || (isControl && blocked)} onClick={() => { if (runtime.status === "COMPLETED" && onResults) onResults(); else if (isControl && empty) { if (available.length) void send("openmic.schedule", { participantIds: available.map((artist) => artist.id) }).then((ok) => { if (ok) onView("bracket"); }); else onOpenGuests?.(); } else if (isControl && action) void send(action, { entryId: entry?.id }).then((ok) => { if (ok) onView(action?.startsWith("openmic.feedback.") ? "vote" : action?.startsWith("openmic.pre") || action === "openmic.promote" ? "regie" : "match"); }); else onView("bracket"); }}>{isControl ? label : "Voir le programme"}{action === "openmic.start" ? <Play /> : action === "openmic.end" ? <Check /> : <ArrowRight />}</button></footer>;
}
