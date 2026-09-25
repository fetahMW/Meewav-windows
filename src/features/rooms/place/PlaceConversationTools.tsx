import { Check, ChevronRight, Flag, Hand, Mic2, Pause, Play, Plus, RotateCcw, SkipForward, Square, Swords, Timer, UsersRound, X, Zap } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PlaceRoomState } from "./place.types";
import PlaceToolsSwitch from "./PlaceToolsSwitch";
import { useStudioToolsLayout } from "./StudioToolsLayoutProvider";
import { clockRemaining, type PlaceConversationCommand, type PlaceConversationState, type PlaceConversationTool, type PlaceToolClock, type PlaceToolPerson } from "./placeConversationTools.domain";
import { usePlaceConversationTools } from "./placeConversationTools.store";
import "./place-conversation-tools.css";

type SharedProps = {
  state: PlaceConversationState; people: PlaceToolPerson[]; actorId: string; isHost: boolean;
  busy: boolean; canEngage: boolean; visible: boolean; backstageIds: readonly string[]; participation?: ReactNode;
  execute: (command: PlaceConversationCommand) => Promise<boolean>;
};
const TOOLS = [
  { id: "floor", label: "Tour de parole", shortLabel: "Parole", icon: <Mic2 aria-hidden="true" />, controlsId: "place-conversation-floor" },
  { id: "queue", label: "File de parole", shortLabel: "File", icon: <UsersRound aria-hidden="true" />, controlsId: "place-conversation-queue" },
  { id: "clash", label: "Clash", icon: <Swords aria-hidden="true" />, controlsId: "place-conversation-clash" },
  { id: "challenges", label: "Défis", icon: <Zap aria-hidden="true" />, controlsId: "place-conversation-challenges" },
] as const;
const DURATIONS = [30, 60, 90, 120, 180, 300];
const durationLabel = (value: number) => value < 60 ? `${value} s` : value % 60 ? `${Math.floor(value / 60)} min ${value % 60}` : `${value / 60} min`;
const findPerson = (people: PlaceToolPerson[], id?: string | null) => people.find((person) => person.id === id);

function Portrait({ person, large = false }: { person?: PlaceToolPerson; large?: boolean }) {
  return <span className={`place-conversation__portrait${large ? " is-large" : ""}`}>
    {person?.avatar ? <img src={person.avatar} alt="" /> : <UsersRound aria-hidden="true" />}
  </span>;
}

/** Only this small display ticks. It never updates the Room or the mixer. */
function Clock({ clock, visible, label = "Temps de parole" }: { clock: PlaceToolClock; visible: boolean; label?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (clock.deadline === null || !visible) return;
    const id = window.setInterval(() => { const next = Date.now(); setNow(next); if (next >= clock.deadline!) window.clearInterval(id); }, 1_000);
    return () => window.clearInterval(id);
  }, [clock.deadline, visible]);
  const seconds = clockRemaining(clock, now);
  return <div className={`place-conversation__clock${seconds === 0 ? " is-elapsed" : ""}`} role="timer" aria-label={`${label} : ${seconds} secondes`}>
    <span>{String(Math.floor(seconds / 60)).padStart(2, "0")}<i>:</i>{String(seconds % 60).padStart(2, "0")}</span>
    <small>{seconds === 0 ? "Temps écoulé" : label}</small>
    <div className="place-conversation__meter" aria-hidden="true"><i style={{ "--progress": `${Math.min(100, seconds / clock.seconds * 100)}%` } as CSSProperties} /></div>
  </div>;
}

function DurationSelect({ value, onChange, label = "Durée par passage", disabled = false }: { value: number; onChange: (value: number) => void; label?: string; disabled?: boolean }) {
  return <label className="place-conversation__field"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>{DURATIONS.map((seconds) => <option value={seconds} key={seconds}>{durationLabel(seconds)}</option>)}</select></label>;
}

function FloorPanel({ state, people, actorId, isHost, busy, canEngage, visible, execute }: SharedProps) {
  const { floor } = state;
  const [prompt, setPrompt] = useState(floor.prompt);
  const [seconds, setSeconds] = useState(floor.seconds);
  useEffect(() => { setPrompt(floor.prompt); setSeconds(floor.seconds); }, [floor.prompt, floor.seconds]);
  const current = findPerson(people, floor.current);
  const queued = floor.queue.includes(actorId);
  const save = (event: FormEvent) => { event.preventDefault(); void execute({ type: "floor.configure", prompt, seconds }); };
  return <div className="place-conversation__panel">
    <header className="place-conversation__heading"><span><small>UNE VOIX À LA FOIS</small><h2>Tour de parole</h2></span><span className={`place-conversation__status${floor.current ? " is-live" : ""}`}><i />{floor.status === "paused" ? "En pause" : floor.current ? "En cours" : "Prêt"}</span></header>
    <section className="place-conversation__glass place-conversation__floor-deck" aria-label="Passage actuel">
      <div className="place-conversation__speaker"><Portrait person={current} large /><span><small>{current ? "LA PAROLE EST À" : "LE MICRO EST OUVERT"}</small><strong>{current?.name ?? "À vous de parler"}</strong><p>{floor.prompt || "Une question, une histoire, un point de vue."}</p></span></div>
      <Clock clock={floor} visible={visible} />
      {isHost ? <div className="place-conversation__transport">
        <button type="button" aria-label={floor.status === "paused" ? "Reprendre le tour" : "Mettre le tour en pause"} disabled={busy || !floor.current} onClick={() => void execute({ type: floor.status === "paused" ? "floor.resume" : "floor.pause" })}>{floor.status === "paused" ? <Play /> : <Pause />}</button>
        <button type="button" className="is-primary" disabled={busy || !floor.queue.length} onClick={() => void execute({ type: "floor.next" })}>{floor.current ? <SkipForward /> : <Play />}<span>{floor.current ? "Personne suivante" : "Donner la parole"}</span></button>
        <button type="button" aria-label="Terminer le tour" disabled={busy || !floor.current} onClick={() => void execute({ type: "floor.end" })}><Square /></button>
      </div> : <button type="button" className="place-conversation__wide is-primary" disabled={busy || !canEngage || (!queued && floor.current !== actorId && !floor.open)} onClick={() => void execute({ type: queued || floor.current === actorId ? "floor.leave" : "floor.join", personId: actorId })}><Hand />{floor.current === actorId ? "J’ai fini de parler" : queued ? "Retirer ma demande" : "Demander la parole"}</button>}
    </section>
    {isHost ? <>
      <details className="place-conversation__settings"><summary><Timer />Réglages du tour<ChevronRight /></summary><form onSubmit={save}><label className="place-conversation__field"><span>Question de départ · facultatif</span><input value={prompt} maxLength={160} disabled={!!floor.current} placeholder="De quoi a-t-on envie de parler ?" onChange={(event) => setPrompt(event.target.value)} /></label><DurationSelect value={seconds} onChange={setSeconds} disabled={!!floor.current} /><button type="submit" disabled={busy || !!floor.current || (prompt === floor.prompt && seconds === floor.seconds)}><Check />Appliquer</button>{floor.current ? <p className="place-conversation__hint">Les réglages seront disponibles après ce tour.</p> : null}</form></details>
    </> : null}
    <p className="place-conversation__hint">Le tour organise les prises de parole. Chacun garde le contrôle de son micro.</p>
  </div>;
}

function QueuePanel({ state, people, actorId, isHost, busy, canEngage, execute, backstageIds }: SharedProps) {
  const { floor } = state;
  const [addingGuests, setAddingGuests] = useState(false);
  const available = people.filter((person) => backstageIds.includes(person.id) && person.id !== floor.current && !floor.queue.includes(person.id));
  const queued = floor.queue.includes(actorId);
  return <div className="place-conversation__panel">
    <header className="place-conversation__heading"><span><small>ORDRE DE PASSAGE</small><h2>File de parole</h2></span><span className="place-conversation__status">{floor.queue.length} en attente</span></header>
    <section className="place-conversation__queue" aria-label="File de parole">
      <div className="place-conversation__section-title"><span>À SUIVRE <b>{floor.queue.length.toString().padStart(2, "0")}</b></span>{isHost ? <button type="button" className="place-conversation__text-action" aria-pressed={floor.open} disabled={busy} onClick={() => void execute({ type: "floor.open", open: !floor.open })}><i className={floor.open ? "is-on" : ""} />{floor.open ? "Demandes ouvertes" : "Demandes fermées"}</button> : null}</div>
      {floor.queue.length ? floor.queue.map((id, index) => <div className="place-conversation__queue-row" key={id}><span className="place-conversation__index">{String(index + 1).padStart(2, "0")}</span><Portrait person={findPerson(people, id)} /><strong>{findPerson(people, id)?.name ?? "Participant"}</strong>{isHost || id === actorId ? <button type="button" aria-label={`Retirer ${findPerson(people, id)?.name ?? "ce participant"} de la file de parole`} disabled={busy} onClick={() => void execute({ type: "floor.leave", personId: id })}><X /></button> : null}</div>) : <p className="place-conversation__empty"><Mic2 />{isHost ? "Ajoute la première personne à la file." : "Sois le premier à demander la parole."}</p>}
    </section>
    {isHost ? <>
      <button type="button" className="place-conversation__add-guests" aria-expanded={addingGuests} onClick={() => setAddingGuests((open) => !open)}><Plus />Ajouter depuis les coulisses</button>
      {addingGuests ? <section className="place-conversation__guest-picker" aria-label="Invités en coulisses"><div className="place-conversation__section-title"><span>PRÊTS EN COULISSES · {available.length}</span></div>{available.length ? <div className="place-conversation__people">{available.map((person) => <button type="button" key={person.id} disabled={busy} aria-label={`Ajouter ${person.name} à la file de parole`} onClick={async () => { if (await execute({ type: "floor.join", personId: person.id })) setAddingGuests(false); }}><Portrait person={person} /><span>{person.name}</span><Plus /></button>)}</div> : <p className="place-conversation__hint">Aucun invité disponible en coulisses. Invite une personne depuis Attente et laisse-la terminer ses réglages privés.</p>}</section> : null}
    </> : <button type="button" className="place-conversation__wide is-primary" disabled={busy || !canEngage || (!queued && !floor.open)} onClick={() => void execute({ type: queued ? "floor.leave" : "floor.join", personId: actorId })}><Hand />{queued ? "Retirer ma demande" : "Demander la parole"}</button>}
  </div>;
}

function ClashPanel({ state, people, actorId, isHost, busy, canEngage, visible, execute }: SharedProps) {
  const clash = state.clash;
  const [title, setTitle] = useState("");
  const [left, setLeft] = useState(people[0]?.id ?? "");
  const [right, setRight] = useState(people[1]?.id ?? "");
  const [seconds, setSeconds] = useState(60);
  const [rounds, setRounds] = useState(3);
  const live = clash && ["running", "paused"].includes(clash.status);
  const active = clash && !["ended", "cancelled"].includes(clash.status);
  const accepted = clash?.accepted.includes(actorId);
  const invited = clash && [clash.left, clash.right].includes(actorId);
  const ready = clash && [clash.left, clash.right].every((id) => clash.accepted.includes(id));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await execute({ type: "clash.invite", id: crypto.randomUUID(), title, left, right, seconds, rounds })) setTitle("");
  };
  const face = (id: string, side: 0 | 1) => <div className={`place-conversation__contender${live && clash?.turn === side ? " is-speaking" : ""}`}><Portrait person={findPerson(people, id)} large /><strong>{findPerson(people, id)?.name ?? "Participant"}</strong><small>{live ? clash?.turn === side ? "AU MICRO" : "À L’ÉCOUTE" : clash?.accepted.includes(id) ? "ACCORD REÇU" : "INVITATION ENVOYÉE"}</small></div>;
  return <div className="place-conversation__panel">
    <header className="place-conversation__heading"><span><small>LE FACE-À-FACE</small><h2>Clash</h2></span><Swords className="place-conversation__heading-icon" /></header>
    {active && clash ? <>
      <section className="place-conversation__glass place-conversation__duel" aria-label="Clash en cours de préparation ou de jeu"><div className="place-conversation__duel-title"><span className={`place-conversation__status${live ? " is-live" : ""}`}><i />{live ? `Manche ${clash.round} / ${clash.rounds}` : ready ? "Prêts à démarrer" : "Accord des participants"}</span><h3>{clash.title}</h3></div><div className="place-conversation__faceoff">{face(clash.left, 0)}<span className="place-conversation__versus">VS</span>{face(clash.right, 1)}</div><Clock clock={clash} visible={visible} label={clash.status === "paused" ? "En pause" : "Par personne · par manche"} />
        {isHost ? <div className="place-conversation__transport">{live ? <button type="button" aria-label={clash.status === "paused" ? "Reprendre le clash" : "Mettre le clash en pause"} disabled={busy} onClick={() => void execute({ type: clash.status === "paused" ? "clash.resume" : "clash.pause" })}>{clash.status === "paused" ? <Play /> : <Pause />}</button> : null}<button type="button" className="is-primary" disabled={busy || (!live && !ready)} onClick={() => void execute({ type: live ? "clash.next" : "clash.start" })}>{live ? <SkipForward /> : <Play />}{live ? clash.round === clash.rounds && clash.turn === 1 ? "Clore le clash" : "Passage suivant" : "Lancer le clash"}</button><button type="button" aria-label="Arrêter le clash" disabled={busy} onClick={() => void execute({ type: "clash.end" })}><Square /></button></div> : null}
      </section>
      {clash.status === "inviting" && invited ? <div className="place-conversation__invitation"><strong>{accepted ? "Ton accord est enregistré" : "Tu es invité à ce clash"}</strong><p>{accepted ? "Le face-à-face commencera quand le host le lancera." : "Même temps de parole, chacun son tour."}</p><div>{!accepted ? <button className="is-primary" type="button" disabled={busy || !canEngage} onClick={() => void execute({ type: "clash.accept" })}><Check />J’accepte</button> : null}<button type="button" disabled={busy || !canEngage} onClick={() => void execute({ type: "clash.decline" })}><X />{accepted ? "Me retirer" : "Refuser"}</button></div></div> : null}
      <p className="place-conversation__hint">Deux accords pour commencer. Le host arbitre les passages et peut arrêter le face-à-face.</p>
    </> : <>
      {clash ? <div className="place-conversation__result" role="status"><Flag /><span><strong>{clash.status === "ended" ? "Clash terminé" : "Clash annulé"}</strong><small>{clash.title}</small></span></div> : null}
      {isHost ? <form onSubmit={(event) => void submit(event)} className="place-conversation__glass place-conversation__editor">
        <div className="place-conversation__faceoff"><div className="place-conversation__contender"><Portrait person={findPerson(people, left)} large /><label className="place-conversation__field"><span>Premier participant</span><select value={left} onChange={(event) => setLeft(event.target.value)}><option value="" disabled>Choisir</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div><span className="place-conversation__versus">VS</span><div className="place-conversation__contender"><Portrait person={findPerson(people, right)} large /><label className="place-conversation__field"><span>Second participant</span><select value={right} onChange={(event) => setRight(event.target.value)}><option value="" disabled>Choisir</option>{people.map((person) => <option value={person.id} key={person.id} disabled={person.id === left}>{person.name}</option>)}</select></label></div></div>
        <label className="place-conversation__field"><span>Le sujet du face-à-face</span><input value={title} maxLength={160} required placeholder="Ex. Le talent ou le travail ?" onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="place-conversation__settings-row"><fieldset className="place-conversation__segments"><legend>Manches</legend><div>{[1, 3, 5].map((count) => <label key={count}><input type="radio" name="place-clash-rounds" checked={rounds === count} onChange={() => setRounds(count)} /><span>{count}</span></label>)}</div></fieldset><DurationSelect value={seconds} onChange={setSeconds} label="Par personne" /></div>
        <button type="submit" className="place-conversation__wide is-primary" disabled={busy || !title.trim() || !left || !right || left === right}><Swords />Envoyer les invitations</button>
        <p className="place-conversation__hint">Le clash commence uniquement avec l’accord des deux personnes.</p>
      </form> : <div className="place-conversation__empty is-tall"><Swords /><strong>Le prochain face-à-face se prépare</strong><span>Une invitation apparaîtra ici si le host te propose un clash.</span></div>}
    </>}
  </div>;
}

function ChallengesPanel({ state, people, actorId, isHost, busy, canEngage, visible, execute }: SharedProps) {
  const [editing, setEditing] = useState(!state.challenges.length);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [seconds, setSeconds] = useState(60);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await execute({ type: "challenge.create", id: crypto.randomUUID(), title, target: target || null, seconds })) { setTitle(""); setEditing(false); }
  };
  const active = state.challenges.filter((item) => ["open", "running"].includes(item.status));
  const completed = state.challenges.filter((item) => !["open", "running"].includes(item.status));
  return <div className="place-conversation__panel">
    <header className="place-conversation__heading"><span><small>ON SE LANCE ?</small><h2>Défis</h2></span><button type="button" className="place-conversation__new" aria-expanded={editing} disabled={!canEngage} onClick={() => setEditing(!editing)}>{editing ? <X /> : <Plus />}{editing ? "Fermer" : "Nouveau"}</button></header>
    {editing && canEngage ? <form onSubmit={(event) => void submit(event)} className="place-conversation__glass place-conversation__editor">
      <div className="place-conversation__challenge-intro"><span className="place-conversation__emblem"><Zap /></span><strong>Une idée.<br />À vous de jouer.</strong></div>
      <label className="place-conversation__field"><span>Ton défi</span><textarea value={title} required maxLength={160} rows={2} placeholder="Raconte une histoire en une minute…" onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="place-conversation__settings-row"><label className="place-conversation__field"><span>Pour qui ?</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Tout le monde</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><DurationSelect value={seconds} onChange={setSeconds} label="Temps imparti" /></div>
      <button type="submit" className="place-conversation__wide is-primary" disabled={busy || !title.trim()}><Zap />Proposer le défi</button>
    </form> : null}
    <div className="place-conversation__section-title"><span>À RELEVER <b>{active.length.toString().padStart(2, "0")}</b></span></div>
    {!active.length ? <p className="place-conversation__empty"><Zap />Le prochain défi commence avec une idée.</p> : active.map((challenge) => {
      const accepted = challenge.accepted.includes(actorId);
      const finished = challenge.completed.includes(actorId);
      return <article className="place-conversation__glass place-conversation__challenge" key={challenge.id}>
        <div className="place-conversation__challenge-meta"><span className={`place-conversation__status${challenge.status === "running" ? " is-live" : ""}`}><i />{challenge.status === "running" ? "En cours" : "À relever"}</span><span>{challenge.target ? findPerson(people, challenge.target)?.name ?? "Participant" : "Collectif"}</span></div>
        <h3>{challenge.title}</h3><p className="place-conversation__hint">Proposé par {findPerson(people, challenge.author)?.name ?? "un participant"}</p>
        {challenge.status === "running" ? <Clock clock={challenge} visible={visible} label="Pour relever le défi" /> : <div className="place-conversation__challenge-details"><span><Timer />{durationLabel(challenge.seconds)}</span><span><UsersRound />{challenge.accepted.length} inscrit{challenge.accepted.length > 1 ? "s" : ""}</span></div>}
        <div className="place-conversation__actions">
          {challenge.status === "open" && (!challenge.target || challenge.target === actorId) ? <button type="button" disabled={busy || !canEngage || accepted} onClick={() => void execute({ type: "challenge.accept", id: challenge.id })}><Check />{accepted ? "Tu participes" : "Je relève le défi"}</button> : null}
          {isHost && challenge.status === "open" ? <button type="button" className="is-primary" disabled={busy || !challenge.accepted.length} onClick={() => void execute({ type: "challenge.start", id: challenge.id })}><Play />Lancer</button> : null}
          {challenge.status === "running" && accepted ? <button type="button" disabled={busy || finished} onClick={() => void execute({ type: "challenge.complete", id: challenge.id })}><Flag />{finished ? "En attente de validation" : "J’ai terminé"}</button> : null}
          {isHost && challenge.status === "running" ? <button type="button" className="is-primary" disabled={busy || !challenge.completed.length} onClick={() => void execute({ type: "challenge.validate", id: challenge.id })}><Check />Valider la réussite{challenge.completed.length ? ` (${challenge.completed.length})` : ""}</button> : null}
          {isHost ? <button type="button" className="place-conversation__text-action" disabled={busy} onClick={() => void execute({ type: "challenge.cancel", id: challenge.id })}>Annuler</button> : null}
        </div>
      </article>;
    })}
    {completed.length ? <details className="place-conversation__settings"><summary><Flag />Terminés · {completed.length}<ChevronRight /></summary>{completed.map((challenge) => <div className="place-conversation__result" key={challenge.id}>{challenge.status === "done" ? <Check /> : <X />}<span><strong>{challenge.title}</strong><small>{challenge.status === "done" ? "Réussite validée par le host" : "Défi annulé"}</small></span></div>)}</details> : null}
  </div>;
}

const ConversationToolsContent = memo(function ConversationToolsContent({ roomId, source, people, actorId, isHost, canEngage, visible, backstageIds, participation }: {
  roomId: string; source: "demo" | "live"; people: PlaceToolPerson[]; actorId: string; isHost: boolean; canEngage: boolean; visible: boolean; backstageIds: readonly string[]; participation?: ReactNode;
}) {
  const layout = useStudioToolsLayout();
  const [activeTool, setActiveTool] = useState<PlaceConversationTool>("floor");
  const peopleIds = useMemo(() => people.map((person) => person.id), [people]);
  const { state, busy, error, execute, retry } = usePlaceConversationTools({ roomId, source, actorId, isHost, canEngage, peopleIds, backstageIds });
  const rail = <PlaceToolsSwitch activeTool={activeTool} ariaLabel="Outils de La Place" idPrefix="place-conversation-tab" items={TOOLS} onSelect={setActiveTool} semantics="tabs" />;
  const shared = state ? { state, people, actorId, isHost, busy, canEngage, execute, visible, backstageIds } : null;
  const content = <section className="place-conversation__body" role="tabpanel" id={`place-conversation-${activeTool}`} aria-labelledby={`place-conversation-tab-${activeTool}`}>
    {participation ? <div className="place-conversation__participation">{participation}</div> : null}
    {error ? <div className="place-conversation__error" role="alert">{error}{!state ? <button type="button" onClick={retry}><RotateCcw />Réessayer</button> : null}</div> : null}
    {shared ? activeTool === "floor" ? <FloorPanel {...shared} /> : activeTool === "queue" ? <QueuePanel {...shared} /> : activeTool === "clash" ? <ClashPanel {...shared} /> : <ChallengesPanel {...shared} /> : !error ? <p className="place-conversation__empty">Préparation des outils…</p> : null}
  </section>;
  const shellClass = "place-conversation place-tools-console is-wave-tool-skin";
  return <div className={shellClass} data-active-tool={activeTool}>
    {layout?.nav ? createPortal(<div className={shellClass}>{rail}</div>, layout.nav) : rail}
    {layout?.body ? createPortal(<div className={shellClass}>{content}</div>, layout.body) : content}
  </div>;
});

export default function PlaceConversationTools({ room, isHost, canEngage, visible, participation }: { room: PlaceRoomState; isHost: boolean; canEngage: boolean; visible: boolean; participation?: ReactNode }) {
  const people = useMemo(() => {
    const profiles = [room.host, ...[...room.participants, ...room.queue].filter((participant) => ["host", "onstage", "backstage", "ready"].includes(participant.status)).map((participant) => participant.profile), ...(room.currentUserProfile ? [room.currentUserProfile] : [])];
    return [...new Map(profiles.map((profile) => [profile.id, { id: profile.id, name: profile.displayName, avatar: profile.avatarUrl }])).values()];
  }, [room.host, room.participants, room.queue, room.currentUserProfile]);
  const backstageIds = useMemo(() => [...new Set([...room.participants, ...room.queue].filter((person) => person.status === "backstage" || person.status === "ready").map((person) => person.profile.id))], [room.participants, room.queue]);
  return <ConversationToolsContent participation={participation} backstageIds={backstageIds} key={`${room.source}:${room.id}`} roomId={room.id} source={room.source} people={people} actorId={room.currentUserProfile?.id ?? (isHost && room.source === "demo" ? room.host.id : "")} isHost={isHost} canEngage={canEngage || isHost} visible={visible} />;
}
