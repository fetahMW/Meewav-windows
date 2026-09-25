import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, MessageCircle, Pin, PinOff, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { MeeWavRichText } from "../../emoticons/MeewavEmoticons";
import type { PlaceRoomState } from "./place.types";
import "./place-chat-message-actions.css";

type ChatMessage = PlaceRoomState["messages"][number];
type DisplayDuration = 10 | 20 | 30;

export type ChatMessageSelection = {
  message: ChatMessage;
  anchor: DOMRect;
  trigger: HTMLElement;
};

function messageTime(createdAt: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(createdAt));
}

export default function PlaceChatMessageActions({
  selection, isHost, isPinned, onClose, onPin, onHighlight, onUnpin, onDelete, onOpenProfile,
}: {
  selection: ChatMessageSelection;
  isHost: boolean;
  isPinned: boolean;
  onClose: () => void;
  onPin: () => Promise<void>;
  onHighlight: (duration: DisplayDuration) => Promise<void>;
  onUnpin: () => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenProfile: (profileId: string) => void;
}) {
  const { message, anchor, trigger } = selection;
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [duration, setDuration] = useState<DisplayDuration>(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const titleId = useId();
  const authorName = message.author?.displayName || "MeeWav";

  useLayoutEffect(() => {
    const placeDialog = () => {
      const bounds = dialogRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
      const topEdge = (viewport?.offsetTop ?? 0) + 12;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 24;
      const below = anchor.bottom + 6;
      const top = below + bounds.height <= bottomEdge ? below : anchor.top - bounds.height - 6;
      setPosition({
        left: Math.max(leftEdge, Math.min(anchor.right - bounds.width, rightEdge - bounds.width)),
        top: Math.max(topEdge, Math.min(top, bottomEdge - bounds.height)),
      });
    };
    placeDialog();
    window.addEventListener("resize", placeDialog);
    window.visualViewport?.addEventListener("resize", placeDialog);
    window.visualViewport?.addEventListener("scroll", placeDialog);
    return () => {
      window.removeEventListener("resize", placeDialog);
      window.visualViewport?.removeEventListener("resize", placeDialog);
      window.visualViewport?.removeEventListener("scroll", placeDialog);
    };
  }, [anchor, highlightOpen, error]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const close = dialog?.querySelector<HTMLButtonElement>(".place-chat-message-actions__header button");
    const initial = busy ? close : dialog?.querySelector<HTMLButtonElement>(highlightOpen
      ? '[aria-pressed="true"]'
      : ".place-chat-message-actions__list button");
    (initial ?? close)?.focus({ preventScroll: true });
  }, [highlightOpen, busy]);

  useEffect(() => () => {
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  }, [trigger]);

  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError("L’action n’a pas abouti. Réessayez.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return createPortal(<>
    <div className="place-chat-message-backdrop" onClick={onClose} aria-hidden="true" />
    <section
      ref={dialogRef}
      className="place-chat-message-actions"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={busy}
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (highlightOpen) setHighlightOpen(false);
          else onClose();
        }
        if (event.key === "Tab") {
          const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="place-chat-message-actions__header">
        {message.author?.avatarUrl ? <img src={message.author.avatarUrl} alt="" /> : null}
        <span><strong id={titleId}>Message de {authorName}</strong><small>{messageTime(message.createdAt)}</small></span>
        <button type="button" aria-label="Fermer les actions du message" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <blockquote className="place-chat-message-actions__quote"><MeeWavRichText>{message.content}</MeeWavRichText></blockquote>
      {highlightOpen && isHost ? <div className="place-chat-message-actions__highlight">
        <div><button type="button" aria-label="Revenir aux actions du message" onClick={() => setHighlightOpen(false)}><ArrowLeft aria-hidden="true" /></button><strong>Mettre en avant</strong></div>
        <fieldset><legend>Durée à l’écran</legend><div className="place-chat-message-actions__durations">
          {([10, 20, 30] as const).map((seconds) => <button type="button" key={seconds} aria-pressed={duration === seconds} disabled={busy} onClick={() => setDuration(seconds)}>{seconds} s</button>)}
        </div></fieldset>
        <button type="button" className="place-chat-message-actions__confirm" disabled={busy} onClick={() => void runAction(() => onHighlight(duration))}><Sparkles aria-hidden="true" />{busy ? "Affichage…" : `Afficher pendant ${duration} s`}</button>
      </div> : <div className="place-chat-message-actions__list">
        {isHost ? <>
          <button type="button" disabled={busy} onClick={() => void runAction(isPinned ? onUnpin : onPin)}>
            {isPinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}<span><strong>{isPinned ? "Désépingler le message" : "Épingler dans le chat"}</strong><small>{isPinned ? "Retirer le message épinglé" : "Le garder en tête de la conversation"}</small></span>
          </button>
          <button type="button" disabled={busy} onClick={() => setHighlightOpen(true)}><Sparkles aria-hidden="true" /><span><strong>Mettre en avant</strong><small>Afficher le message dans le live</small></span></button>
        </> : null}
        {message.author ? <button type="button" disabled={busy} onClick={() => { onClose(); onOpenProfile(message.author!.id); }}><UserRound aria-hidden="true" /><span><strong>Voir le profil</strong></span></button> : null}
        {isHost ? <button type="button" className="is-danger" disabled={busy} onClick={() => void runAction(onDelete)}><Trash2 aria-hidden="true" /><span><strong>Supprimer le message</strong></span></button> : null}
      </div>}
      {error ? <p className="place-chat-message-actions__error" role="alert">{error}</p> : null}
    </section>
  </>, document.fullscreenElement ?? document.body);
}

export function PlaceChatPins({ room, isHost, busy, onRemove, onChoose }: {
  room: PlaceRoomState;
  isHost: boolean;
  busy: boolean;
  onRemove: () => void;
  onChoose: () => void;
}) {
  const pinned = room.messages.find((message) => message.id === room.pinnedMessageId);
  const content = pinned?.content || room.highlightText;
  return <div className="place-chat-pins">
    <header className="place-chat-pins__heading"><span><Pin aria-hidden="true" /></span><div><h2>Épinglés</h2><p>Un repère pour la conversation.</p></div></header>
    {content ? <article className="place-chat-pins__card">
      <div className="place-chat-pins__status">{pinned ? <Pin aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{pinned ? "Dans le chat" : "À l’écran"}</div>
      {pinned?.author ? <div className="place-chat-pins__author"><img src={pinned.author.avatarUrl} alt="" /><div><strong>{pinned.author.displayName}</strong><time dateTime={pinned.createdAt}>{messageTime(pinned.createdAt)}</time></div></div> : null}
      <blockquote><MeeWavRichText>{content}</MeeWavRichText></blockquote>
      {isHost ? <footer><button type="button" className="place-chat-pins__remove" disabled={busy} onClick={onRemove}><PinOff aria-hidden="true" />{busy ? "Retrait…" : pinned ? "Désépingler" : "Retirer de l’écran"}</button></footer> : null}
    </article> : <div className="place-chat-pins__empty"><Pin aria-hidden="true" /><strong>Aucun message épinglé</strong><p>{isHost ? "Gardez une information utile à portée de tous." : "Les messages retenus par le Host apparaîtront ici."}</p></div>}
    {isHost ? <><button type="button" className="place-chat-pins__choose" onClick={onChoose}><MessageCircle aria-hidden="true" /><span>Choisir dans le chat</span><ArrowUpRight aria-hidden="true" /></button><p className="place-chat-pins__hint">Utilisez le bouton Épingler à côté du message dans le chat.</p></> : null}
  </div>;
}
