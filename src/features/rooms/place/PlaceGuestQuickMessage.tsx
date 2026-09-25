import { useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { createMessagingClientMessageId, createMessagingIdempotencyKey, messagingRepository } from "../../messaging/messaging.service";
import { toMessagingServiceError } from "../../messaging/messaging.errors";
import type { PlaceParticipant, PlaceRoomState } from "./place.types";
import "./place-guest-quick-message.css";

export default function PlaceGuestQuickMessage({ room, participant, disabled }: {
  room: PlaceRoomState; participant: PlaceParticipant; disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const attempt = useRef<{ body: string; messageId: string; key: string; conversationId?: string } | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const live = room.source === "live" && Boolean(room.currentUserProfile);
  const name = participant.profile.displayName;
  function close() {
    if (busy.current) return;
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function send() {
    const text = body.trim();
    if (!live || disabled || busy.current || !text || text.length > 4000) return;
    busy.current = true;
    setPending(true);
    setError("");
    // Keep identifiers on retry: a lost response must not create a second DM.
    if (!attempt.current || attempt.current.body !== text) attempt.current = {
      body: text, messageId: createMessagingClientMessageId(), key: createMessagingIdempotencyKey("room-quick-dm"),
    };
    const current = attempt.current;
    try {
      if (!current.conversationId) {
        const conversation = await messagingRepository.getOrCreateDirectConversation(participant.profile.id, current.key);
        if (!conversation.ok) throw new Error("conversation_failed");
        current.conversationId = conversation.conversation_id;
      }
      const result = await messagingRepository.sendTextMessage({
        conversationId: current.conversationId, clientMessageId: current.messageId, body: current.body,
      });
      if (!result.ok) throw new Error("send_failed");
      setBody("");
      setSent(true);
      attempt.current = null;
    } catch (cause) {
      setError(toMessagingServiceError(cause, "mutation_failed").message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <>
    <button ref={trigger} type="button" className="place-guest-media-controls__button"
      aria-label={`Contacter ${name}`} aria-haspopup="dialog" disabled={disabled}
      onClick={() => { setSent(false); dialog.current?.showModal(); }}>
      <MessageCircle aria-hidden="true" />
    </button>
    <dialog ref={dialog} className="place-guest-quick-message" aria-label={`Message privé à ${name}`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <header><div><small>MESSAGE PRIVÉ</small><strong>{name}</strong></div>
          <button type="button" aria-label="Fermer" disabled={pending} onClick={close}><X aria-hidden="true" /></button>
        </header>
        <label>Message rapide<textarea autoFocus value={body} maxLength={4000} disabled={pending}
          placeholder="Écris ton message…" onChange={(event) => { setBody(event.target.value); setSent(false); }} /></label>
        {room.source === "demo" && <p>Mode démo : aucun DM réel ne sera envoyé. L’envoi est disponible dans une Room connectée.</p>}
        {room.source === "live" && !room.currentUserProfile && <p>Connecte-toi pour envoyer un message privé.</p>}
        {error && <p role="alert">{error}</p>}
        {sent && <p role="status">Message envoyé dans ta messagerie MeeWav.</p>}
        <footer><span>{body.length} / 4000</span><button type="submit" disabled={!live || disabled || pending || !body.trim()}>
          <Send aria-hidden="true" />{pending ? "Envoi…" : "Envoyer"}</button></footer>
      </form>
    </dialog>
  </>;
}
