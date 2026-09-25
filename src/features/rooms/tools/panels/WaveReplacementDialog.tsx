import { useEffect, useRef, useState } from "react";
import { Swords, X } from "lucide-react";
import type { RoomToolsCommand, WaveState } from "../roomTools.types";
import "./wave-replacement-dialog.css";

export default function WaveReplacementDialog({ wave, layerId, disabled, execute, onClose, onStarted }: {
  wave: WaveState; layerId: string; disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>; onClose: () => void;
  onStarted?: () => void;
}) {
  const candidates = wave.submissions.filter(item => (item.lifecycleStatus ? item.lifecycleStatus === "READY_FOR_VOTE" : item.status === "analysis")
    && item.rightsConfirmed && !item.vote?.open && !wave.layers.some(layer => layer.submissionId === item.id));
  const layer = wave.layers.find(item => item.id === layerId);
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    if (dialog.current?.showModal && !dialog.current.open) dialog.current.showModal();
    else dialog.current?.setAttribute("open", "");
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  const launch = async () => {
    if (busy.current || disabled || !layer?.submissionId || !candidates.some(item => item.id === candidateId)) return;
    busy.current = true; setPending(true); setError("");
    try {
      await execute({ type: "wave.replacement.open", layerId, submissionId: candidateId, durationSeconds: 30, listeningMode: "beat" });
      onClose();
      onStarted?.();
    } catch { setError("Le duel n’a pas pu être ouvert. Vérifiez qu’aucun vote n’est déjà en cours, puis réessayez."); }
    finally { busy.current = false; setPending(false); }
  };
  return <dialog ref={dialog} className="wave-replacement-dialog" aria-labelledby="wave-replacement-title" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <header><span><Swords /><strong id="wave-replacement-title">Duel de remplacement</strong></span><button type="button" aria-label="Fermer le duel" disabled={pending} onClick={onClose}><X /></button></header>
    <p>La boucle actuelle reste dans le Beat jusqu’au verdict du public.</p>
    <div className="wave-replacement-dialog__defender"><small>Boucle à défendre</small><strong>{layer?.title}</strong></div>
    {candidates.length ? <label>Choisir dans Vote<select aria-label="Boucle candidate au remplacement" disabled={pending} value={candidateId} onChange={event => setCandidateId(event.currentTarget.value)}>{candidates.map(item => <option key={item.id} value={item.id}>{item.title} · {item.instrument} · {item.bpm} BPM</option>)}</select></label> : <p>Aucune boucle prête dans Vote. Importez une proposition ou attendez une nouvelle boucle.</p>}
    {error ? <p role="alert">{error}</p> : null}
    <footer><button type="button" disabled={pending} onClick={onClose}>Annuler</button><button type="button" disabled={disabled || pending || !candidates.some(item => item.id === candidateId) || wave.submissions.some(item => item.vote?.open)} onClick={() => void launch()}><Swords />{pending ? "Ouverture…" : "Soumettre au vote"}</button></footer>
  </dialog>;
}
