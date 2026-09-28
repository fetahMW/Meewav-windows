import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "../panels/cage-results-dialog.css";

export default function CageBracketDialog({ children, title = "Tableau du tournoi", onClose }: { children: ReactNode; title?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="cage-results-dialog cage-bracket-dialog" aria-labelledby={titleId} onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="cage-results-dialog__header"><strong id={titleId}>{title}</strong><button type="button" autoFocus onClick={onClose} aria-label="Fermer le tableau"><X /></button></header>
    <div className="cage-results-dialog__content cage-viewer-companion">{children}</div>
  </dialog>, document.fullscreenElement ?? document.body);
}
