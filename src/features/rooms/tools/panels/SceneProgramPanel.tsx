import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Clock3, FastForward, FileText, ListMusic, Pencil, Play, Plus, RotateCcw, SkipForward, Trash2, Users, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PerformanceEntry, RoomToolsCommand, SceneState } from "../roomTools.types";
import { EmptyState, ToolPanelHeader } from "./RoomToolPanelPrimitives";

const STATUS_LABEL: Record<PerformanceEntry["status"], string> = { upcoming: "Prévu", ready: "Prêt", live: "En cours", done: "Terminé", skipped: "Passé", cancelled: "Annulé" };
const KINDS: PerformanceEntry["kind"][] = ["Morceau", "Freestyle", "Danse", "DJ set", "Beatbox", "Instrumental", "Présentation", "Collaboration", "Autre"];
const isUpcoming = (entry: PerformanceEntry) => entry.status === "upcoming" || entry.status === "ready";

function displayTime(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function inputTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function durationLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}` : `${minutes} min`;
}

type EntryDraft = Pick<PerformanceEntry, "artistId" | "artistName" | "description" | "title" | "kind" | "durationMinutes" | "scheduledAt" | "prompterTextId" | "evaluationEnabled" | "delayMinutes">;

function EntryEditor({ scene, entry, disabled, onSave, onCancel }: { scene: SceneState; entry?: PerformanceEntry; disabled: boolean; onSave: (draft: EntryDraft) => Promise<void>; onCancel: () => void }) {
  const [artistId, setArtistId] = useState(entry?.artistId ?? scene.people[0]?.id ?? "");
  const [artistName, setArtistName] = useState(entry?.artistName ?? scene.people[0]?.name ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [kind, setKind] = useState<PerformanceEntry["kind"]>(entry?.kind ?? "Morceau");
  const [duration, setDuration] = useState(entry?.durationMinutes ?? 5);
  const [scheduledAt, setScheduledAt] = useState(inputTime(entry?.scheduledAt));
  const [delay, setDelay] = useState(entry?.delayMinutes ?? 0);
  const [prompterTextId, setPrompterTextId] = useState(entry?.prompterTextId ?? "");
  const [evaluationEnabled, setEvaluationEnabled] = useState(entry?.evaluationEnabled ?? scene.evaluation.defaultEnabled);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !title.trim() || !artistName.trim() || !Number.isFinite(duration) || duration < 1 || duration > 180) return;
    void onSave({ description: description.trim(), artistId, artistName: artistName.trim(), title: title.trim(), kind, durationMinutes: duration, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "", delayMinutes: Math.max(0, Math.min(180, delay || 0)), prompterTextId, evaluationEnabled });
  };
  return <form id={entry ? `scene-program-edit-${entry.id}` : "scene-program-create-form"} className="scene-running-order__editor" onSubmit={submit} aria-label={entry ? `Modifier ${entry.title}` : "Nouveau passage"}>
    <header><strong>{entry ? "Modifier le passage" : "Un nouveau temps fort"}</strong><button type="button" onClick={onCancel} aria-label="Fermer l’éditeur"><X /></button></header>
    <label className="room-tool-field is-wide">Description publique<textarea disabled={disabled} value={description} maxLength={1200} rows={3} placeholder="Ce que l’artiste proposera sur scène…" onChange={event => setDescription(event.currentTarget.value)} /></label>
    <label className="room-tool-field is-wide">Titre du passage<input autoFocus disabled={disabled} value={title} placeholder="Morceau, accueil du public, entracte…" maxLength={100} required onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <label className="room-tool-field">Intervenant<select disabled={disabled} value={artistId} onChange={(event) => { const person = scene.people.find((item) => item.id === event.currentTarget.value); setArtistId(event.currentTarget.value); if (person) setArtistName(person.name); setPrompterTextId(""); }}><option value="">Autre intervenant / régie</option>{scene.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <label className="room-tool-field">Nom au programme<input disabled={disabled} value={artistName} placeholder="Artiste, collectif ou régie" maxLength={80} required onChange={(event) => setArtistName(event.currentTarget.value)} /></label>
    <label className="room-tool-field">Type<select disabled={disabled} value={kind} onChange={(event) => { const value = event.currentTarget.value as PerformanceEntry["kind"]; setKind(value); if (value === "Présentation" || value === "Autre") setEvaluationEnabled(false); }}>{KINDS.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="room-tool-field">Durée · min<input disabled={disabled} type="number" min="1" max="180" required value={duration} onChange={(event) => setDuration(Number(event.currentTarget.value))} /></label>
    <label className="room-tool-field is-wide">Horaire prévu · facultatif<input disabled={disabled} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.currentTarget.value)} /></label>
    <label className="room-tool-field">Décalage · min<input disabled={disabled} type="number" min="0" max="180" value={delay} onChange={(event) => setDelay(Number(event.currentTarget.value))} /></label>
    <label className="room-tool-field">Texte du prompteur<select disabled={disabled} value={prompterTextId} onChange={(event) => setPrompterTextId(event.currentTarget.value)}><option value="">Aucun texte</option>{scene.prompter.texts.filter((text) => !artistId || text.artistId === artistId || text.id === prompterTextId).map((text) => <option key={text.id} value={text.id}>{text.title}</option>)}</select></label>
    <label className="scene-running-order__evaluation is-wide"><input disabled={disabled} type="checkbox" checked={evaluationEnabled} onChange={(event) => setEvaluationEnabled(event.currentTarget.checked)} /><span>Ouvrir l’évaluation à la fin du passage</span></label>
    <div className="scene-running-order__editor-actions is-wide"><button type="button" onClick={onCancel}>Annuler</button><button type="submit" className="is-primary" disabled={disabled || !title.trim() || !artistName.trim()}><Check />{entry ? "Enregistrer" : "Ajouter au programme"}</button></div>
  </form>;
}

export default function SceneProgramPanel({ scene, disabled, execute, onOpenGuests, onOpenPrompter }: { scene: SceneState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown>; onOpenGuests?: () => void; onOpenPrompter?: (textId: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = disabled || pending;
  const live = scene.program.find((entry) => entry.status === "live");
  const upcoming = scene.program.filter(isUpcoming);
  const history = scene.program.filter((entry) => !isUpcoming(entry) && entry.status !== "live");
  const next = upcoming.find((entry) => entry.participantStatus !== "absent");
  const plannedMinutes = scene.program.filter((entry) => entry.status !== "cancelled" && entry.status !== "skipped").reduce((total, entry) => total + entry.durationMinutes, 0);
  const remainingMinutes = upcoming.reduce((total, entry) => total + entry.durationMinutes, 0);
  const visibleEntries = view === "upcoming" ? upcoming : history;

  const run = async (command: RoomToolsCommand, onSuccess?: () => void) => {
    if (locked) return;
    setPending(true);
    setError(null);
    try { await execute(command); onSuccess?.(); }
    catch { setError("Le programme n’a pas été modifié. Réessayez."); }
    finally { setPending(false); }
  };

  return <div className="room-tool-panel is-program scene-running-order">
    <ToolPanelHeader eyebrow="CONDUCTEUR DE LA SOIRÉE" title="Programme" description="Préparez chaque temps fort, gardez le rythme." status={live ? "EN COURS" : "EN PRÉPARATION"} icon={<ListMusic />} />
    <div className="scene-running-order__overview"><span><strong>{scene.program.length}</strong> passages</span><span><Clock3 /><strong>{durationLabel(plannedMinutes)}</strong> prévues</span><span><strong>{durationLabel(remainingMinutes)}</strong> à suivre</span></div>

    <section className="scene-running-order__on-air" aria-label="Pilotage du programme">
      <div className="scene-running-order__current">
        <span className={`scene-running-order__eyebrow${live ? " is-live" : ""}`}><i />{live ? "MAINTENANT" : "PRÊT POUR LA SOIRÉE"}</span>
        <strong>{live?.title ?? "Votre soirée commence ici"}</strong>
        <span className="scene-running-order__current-detail">{live ? `${live.artistName} · ${live.kind} · ${durationLabel(live.durationMinutes)}` : "Préparez l’ordre, puis lancez le premier passage."}</span>
        {live ? <div className="scene-running-order__live-actions"><button type="button" disabled={locked} onClick={() => void run({ type: "scene.program.status", entryId: live.id, status: "done" })}><Check />Terminer le passage</button>{live.prompterTextId && onOpenPrompter ? <button type="button" disabled={locked} onClick={() => onOpenPrompter(live.prompterTextId!)}><FileText />Prompteur</button> : null}</div> : null}
      </div>
      <div className="scene-running-order__next"><span><small>À SUIVRE</small><strong>{next?.title ?? "Fin du programme"}</strong><em>{next ? `${next.artistName} · ${durationLabel(next.durationMinutes)}` : "Tous les temps forts sont passés."}</em></span><button type="button" className="is-primary" disabled={locked || !next} onClick={() => next && void run({ type: "scene.program.status", entryId: next.id, status: "live" })}>{live ? <FastForward /> : <Play />}{live ? "Enchaîner" : "Lancer"}</button></div>
    </section>

    <div className="scene-running-order__toolbar"><div role="group" aria-label="Afficher les passages"><button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}>À venir <b>{upcoming.length}</b></button><button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>Historique <b>{history.length}</b></button></div><button type="button" disabled={locked} aria-expanded={creating} aria-controls="scene-program-create-form" onClick={() => { setCreating((value) => !value); setEditingId(null); }}>{creating ? <X /> : <Plus />}{creating ? "Fermer" : "Ajouter un passage"}</button></div>
    {creating ? <EntryEditor scene={scene} disabled={locked} onCancel={() => setCreating(false)} onSave={async (draft) => { await run({ type: "scene.program.add", entry: { id: crypto.randomUUID(), ...draft, participantStatus: "connected", status: "upcoming" } }, () => { setCreating(false); setView("upcoming"); }); }} /> : null}
    {error ? <p className="scene-running-order__error" role="alert">{error}</p> : null}

    {visibleEntries.length ? <ol className="scene-running-order__list" aria-label={view === "upcoming" ? "Passages à venir" : "Historique des passages"}>{visibleEntries.map((entry, visibleIndex) => {
      const index = scene.program.findIndex((item) => item.id === entry.id);
      const selected = selectedId === entry.id;
      const absent = entry.participantStatus === "absent";
      const time = displayTime(entry.scheduledAt);
      return <li key={entry.id} className={`${selected ? "is-selected" : ""}${entry.id === next?.id ? " is-next" : ""}`} draggable={!locked && !editingId && view === "upcoming"} onDragStart={(event) => event.dataTransfer.setData("text/room-program-entry", entry.id)} onDragOver={(event) => { if (!locked && view === "upcoming") event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (locked || view !== "upcoming") return; const entryId = event.dataTransfer.getData("text/room-program-entry"); if (upcoming.some((item) => item.id === entryId) && entryId !== entry.id) void run({ type: "scene.program.reorder", entryId, toIndex: index }); }}>
        <button type="button" className="scene-running-order__row" aria-expanded={selected} aria-controls={`scene-program-actions-${entry.id}`} onClick={() => { setSelectedId(selected ? null : entry.id); setRemovingId(null); if (editingId !== entry.id) setEditingId(null); }}>
          <span className="scene-running-order__number">{String(index + 1).padStart(2, "0")}</span>
          <span className="scene-running-order__entry-copy"><strong>{entry.title}</strong><span>{entry.artistName} <i>·</i> {entry.kind}</span><small>{time ? `${time} · ` : ""}{durationLabel(entry.durationMinutes)}{entry.delayMinutes ? ` · décalé de ${entry.delayMinutes} min` : ""}</small></span>
          <span className={`scene-running-order__status is-${absent ? "absent" : entry.status}`}>{absent ? "Indisponible" : entry.id === next?.id ? "À suivre" : STATUS_LABEL[entry.status]}</span>
          {selected ? <ChevronDown /> : <ChevronRight />}
        </button>
        {selected ? <div className="scene-running-order__details" id={`scene-program-actions-${entry.id}`}>
          <p>{entry.prompterTextId ? "Texte lié au prompteur" : "Sans prompteur"}<span>·</span>{entry.evaluationEnabled ? "Évaluation en fin de passage" : "Sans évaluation"}</p>
          {entry.prompterTextId && onOpenPrompter ? <button type="button" className="scene-running-order__text-link" disabled={locked} onClick={() => onOpenPrompter(entry.prompterTextId!)}><FileText />Ouvrir le texte</button> : null}
          {editingId === entry.id ? <EntryEditor key={entry.id} scene={scene} entry={entry} disabled={locked} onCancel={() => setEditingId(null)} onSave={async (draft) => { await run({ type: "scene.program.patch", entryId: entry.id, patch: draft }, () => setEditingId(null)); }} /> : <div className="scene-running-order__actions">
            {view === "upcoming" ? <><div className="scene-running-order__reorder"><button type="button" title="Avancer dans le programme" aria-label={`Avancer ${entry.title}`} disabled={locked || visibleIndex === 0} onClick={() => void run({ type: "scene.program.reorder", entryId: entry.id, toIndex: scene.program.findIndex((item) => item.id === visibleEntries[visibleIndex - 1]?.id) })}><ArrowUp /></button><button type="button" title="Reculer dans le programme" aria-label={`Reculer ${entry.title}`} disabled={locked || visibleIndex === visibleEntries.length - 1} onClick={() => void run({ type: "scene.program.reorder", entryId: entry.id, toIndex: scene.program.findIndex((item) => item.id === visibleEntries[visibleIndex + 1]?.id) })}><ArrowDown /></button></div><button type="button" disabled={locked} aria-label={`Modifier ${entry.title}`} onClick={() => { setEditingId(entry.id); setCreating(false); }}><Pencil />Modifier</button><button type="button" disabled={locked} onClick={() => void run({ type: "scene.program.status", entryId: entry.id, status: "skipped" })}><SkipForward />Passer</button><button type="button" className="is-primary" disabled={locked || absent} onClick={() => void run({ type: "scene.program.status", entryId: entry.id, status: "live" })}><Play />Lancer</button></> : <button type="button" disabled={locked} onClick={() => void run({ type: "scene.program.status", entryId: entry.id, status: "upcoming" }, () => setView("upcoming"))}><RotateCcw />Reprogrammer</button>}
            <button type="button" className="scene-running-order__remove" aria-label={`Supprimer ${entry.title}`} disabled={locked} onClick={() => setRemovingId(entry.id)}><Trash2 /></button>
          </div>}
          {removingId === entry.id ? <div className="scene-running-order__confirmation"><span>Retirer ce passage du programme ?</span><button type="button" disabled={locked} onClick={() => setRemovingId(null)}>Garder</button><button type="button" className="is-danger" disabled={locked} onClick={() => void run({ type: "scene.program.remove", entryId: entry.id }, () => setRemovingId(null))}>Retirer</button></div> : null}
        </div> : null}
      </li>;
    })}</ol> : <EmptyState title={view === "history" ? "La soirée reste à écrire" : "Votre conducteur est à jour"}>{view === "history" ? "Les passages terminés et passés se retrouveront ici." : "Ajoutez un morceau, une présentation ou un entracte."}</EmptyState>}
    <footer className="scene-running-order__footnote"><span>Programme partagé avec le public.</span>{onOpenGuests ? <button type="button" onClick={onOpenGuests}><Users />Gérer les invités</button> : <span>Entrées et sorties de scène dans Invités.</span>}</footer>
  </div>;
}
