import { useEffect, useState } from "react";
import { ChevronDown, Mic, Swords, Trophy, X } from "lucide-react";
import { cageCanConfigure } from "../cageCompetition";
import type { CageCompetitionConfig, CageCompetitionRuntime } from "../cageCompetition.types";
import type { CageSendCommand } from "./CageCompetitionWorkspace";

export const CAGE_FORMAT_LABELS = { tournament: "Tournoi", championship: "Championnat", "open-mic": "Open Mic libre", "open-mic-battle": "Open Mic Battle" } as const;
const formats = [
  { id: "tournament", label: "Tournoi", description: "Duels à élimination directe, jusqu’à la finale.", Icon: Swords },
  { id: "championship", label: "Championnat", description: "Tous les artistes se rencontrent. Les victoires s’accumulent sans élimination.", Icon: Trophy },
  { id: "open-mic-battle", label: "Open Mic Battle", description: "Le gagnant reste sur scène et affronte le challenger suivant. Le perdant sort.", Icon: Mic },
  { id: "open-mic", label: "Open Mic libre", description: "Un artiste à la fois, dans l’ordre du programme.", Icon: Mic },
] as const;

export default function CagePresentationControls({ runtime, demo, busy, send, onConfigured }: {
  runtime: CageCompetitionRuntime; demo: boolean; busy: boolean; send: CageSendCommand; onConfigured: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<CageCompetitionConfig["format"]>(runtime.config.format);
  const [count, setCount] = useState(runtime.config.participantCount);
  const [feedback, setFeedback] = useState(runtime.config.rules.openMicFeedback ?? "appreciation");
  const [confirmation, setConfirmation] = useState(false);
  useEffect(() => { setOpen(false); setConfirmation(false); }, [runtime.config.format, runtime.config.participantCount]);
  const openSettings = () => {
    setFormat(runtime.config.format); setCount(runtime.config.participantCount);
    setFeedback(runtime.config.rules.openMicFeedback ?? "appreciation"); setConfirmation(false); setOpen(!open);
  };
  const hasProgram = Boolean(runtime.matches.length || runtime.openMicEntries?.length);
  const valid = Number.isInteger(count) && count >= (format === "open-mic" ? 1 : 2) && count <= 64
    && (format !== "tournament" || runtime.config.rules.allowByes || Number.isInteger(Math.log2(count)));
  const canConfigure = cageCanConfigure(runtime);
  const completed = runtime.config.format === "open-mic"
    ? (runtime.openMicEntries ?? []).filter((entry) => ["PERFORMED", "SKIPPED"].includes(entry.status)).length
    : runtime.matches.filter((match) => ["RESOLVED", "CLOSED"].includes(match.status)).length;
  const apply = async () => {
    if (hasProgram && !confirmation) { setConfirmation(true); return; }
    if (await send("competition.configure", { format, participantCount: count, openMicFeedback: feedback, confirmReset: hasProgram })) {
      setOpen(false); setConfirmation(false); onConfigured();
    }
  };
  return <div className="cage-mode-control">
    <aside className="cage-presentation" aria-label="Mode de la Cage">
      <span><small>{CAGE_FORMAT_LABELS[runtime.config.format].toUpperCase()}{demo ? " · DÉMO" : ""} · PILOTAGE MANUEL</small>
        <strong>{runtime.participants.filter((person) => person.seed !== null).length}{runtime.config.format === "open-mic-battle" ? " participants choisis" : `/${runtime.config.participantCount} inscrits`} <span>·</span> {completed} {runtime.config.format === "open-mic" ? "passage(s) terminé(s)" : "rencontre(s) terminée(s)"}</strong></span>
      <button type="button" className="cage-mode-control__trigger" onClick={openSettings} aria-expanded={open} aria-controls="cage-mode-settings" disabled={busy}>
        Mode <ChevronDown aria-hidden="true" /></button>
    </aside>
    {open ? <section id="cage-mode-settings" className="cage-mode-control__settings" aria-label="Choisir le mode de la Cage">
      <header><strong>Organiser la Cage</strong><button type="button" aria-label="Fermer le choix du mode" onClick={() => setOpen(false)}><X /></button></header>
      <div className="cage-mode-control__formats" role="group" aria-label="Format de la compétition">{formats.map(({ id, label, Icon }) =>
        <button key={id} type="button" aria-pressed={format === id} onClick={() => { setFormat(id); setCount((current) => Math.max(id === "open-mic" ? 1 : 2, current)); setConfirmation(false); }}><Icon />{label}</button>)}</div>
      <p>{formats.find((item) => item.id === format)?.description}</p>
      <label>{format === "open-mic-battle" ? "Maximum de participants (départ possible dès 2)" : "Nombre de places"}<input type="number" min={format === "open-mic" ? 1 : 2} max={64} step={1} value={count || ""} onChange={(event) => { setCount(Number(event.target.value)); setConfirmation(false); }} /></label>
      {format === "open-mic" ? <label>Vote du public<select value={feedback} onChange={(event) => { setFeedback(event.target.value as typeof feedback); setConfirmation(false); }}><option value="appreciation">Vote de soutien</option><option value="scored">Notes sur 5</option><option value="none">Sans vote</option></select></label> : null}
      {!valid ? <p role="status">{format === "tournament" && !runtime.config.rules.allowByes ? "Choisis 2, 4, 8, 16, 32 ou 64 places pour le tournoi." : "Choisis un nombre entier de places, jusqu’à 64."}</p> : null}
      {!canConfigure ? <p role="status">Termine le passage et son vote, puis libère la scène avant de changer de mode.</p> : null}
      {confirmation ? <p role="status">Le programme actuel et ses résultats seront remplacés. Les invités, la sélection et leurs réglages sont conservés dans la limite des places choisies.</p> : <p>Les invités déjà présents restent dans la room.</p>}
      <button type="button" className="cage-mode-control__apply" disabled={busy || !valid || !canConfigure} onClick={() => void apply()}>{confirmation ? "Confirmer le nouveau programme" : `Préparer ${format === "open-mic-battle" ? "l’Open Mic Battle" : format === "open-mic" ? "l’Open Mic libre" : format === "championship" ? "le championnat" : "le tournoi"}`}</button>
    </section> : null}
  </div>;
}
