import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import "../rooms/place/room-golden-like.css";

type Props = {
  artistName: string;
  pending: boolean;
  unavailable?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Shared by Rooms and La Scène, including fullscreen and keyboard focus. */
export default function GoldenLikeConfirmationDialog({ artistName, pending, unavailable, error, onClose, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); restoreFocus.current?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <dialog ref={dialog} className="room-golden-like" aria-labelledby={titleId}
      onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <div className="room-golden-like__surface">
        <button type="button" className="room-golden-like__close" aria-label="Fermer la confirmation Golden Like" disabled={pending} onClick={onClose}><X /></button>
        <Star className="room-golden-like__star" fill="currentColor" aria-hidden="true" />
        <h2 id={titleId}>Offrir ton Golden Like à {artistName} ?</h2>
        <p>Un Golden Like est rare. Tu n’en as qu’un par jour.</p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="room-golden-like__actions">
          <button type="button" autoFocus disabled={pending} onClick={onClose}>Annuler</button>
          <button type="button" className="is-confirm" disabled={pending || unavailable} onClick={onConfirm}>{pending ? "Envoi…" : "Offrir mon Golden Like"}</button>
        </div>
      </div>
    </dialog>, document.fullscreenElement ?? document.body,
  );
}
