import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Eye, MonitorUp, X } from "lucide-react";
import type { CageCompetitionRuntime } from "../cageCompetition.types";
import { cageResults } from "../cageResults";
import type { CageSendCommand } from "./CageCompetitionWorkspace";
import CageResults from "./CageResults";
import "./cage-results-dialog.css";

export default function CageResultsDialog({ runtime, matchId, send, busy = false, onClose, fallbackFocusRef }: {
  runtime: CageCompetitionRuntime; matchId?: string | null; send?: CageSendCommand; busy?: boolean; onClose: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  const published = Boolean(runtime.publicResults && runtime.publicResults.matchId === (matchId ?? null));
  const waiting = busy || pending;
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      mounted.current = false;
      element?.close();
      const target = restoreFocus.current?.isConnected ? restoreFocus.current : fallbackFocusRef?.current;
      target?.focus({ preventScroll: true });
    };
  }, [fallbackFocusRef]);
  const publish = async () => {
    if (!send || waiting || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const ok = await send("broadcast.results", { enabled: !published, ...(matchId ? { matchId } : {}) });
      if (!ok && mounted.current) setError("La diffusion n’a pas été modifiée. Réessaie.");
    } catch { if (mounted.current) setError("La diffusion n’a pas été modifiée. Réessaie."); }
    finally { submitting.current = false; if (mounted.current) setPending(false); }
  };
  return createPortal(<dialog ref={dialog} className="cage-results-dialog" aria-labelledby={titleId}
    onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <header className="cage-results-dialog__header"><span><Eye aria-hidden="true" /><strong id={titleId}>{send ? published ? "Résultats à l’antenne" : "Aperçu avant publication" : "Résultats de la Cage"}</strong></span>
      <button type="button" autoFocus disabled={pending} onClick={onClose} aria-label="Fermer les résultats"><X aria-hidden="true" /></button>
    </header>
    <div className="cage-results-dialog__content"><CageResults runtime={runtime} matchId={matchId} showToolbar={false} /></div>
    {send ? <footer className="cage-results-dialog__footer">
      <p role={error ? "alert" : "status"}>{error || (published ? "Ce podium est visible par le public." : "Aperçu privé · voici le podium que verra le public.")}</p>
      <button type="button" className="cage-results-dialog__publish" aria-pressed={published} disabled={waiting || !cageResults(runtime, matchId).length} onClick={() => void publish()}><MonitorUp aria-hidden="true" />{pending ? "Mise à jour…" : published ? "Retirer du public" : "Publier au public"}</button>
    </footer> : null}
  </dialog>, document.fullscreenElement ?? document.body);
}
