import { useEffect, useRef, useState, type RefObject } from "react";
import { Send, X } from "lucide-react";
import {
  createMessagingClientMessageId,
  createMessagingIdempotencyKey,
  messagingRepository,
} from "../../messaging/messaging.service";
import { toMessagingServiceError } from "../../messaging/messaging.errors";
import { isMessagingUuid } from "../../messaging/messaging.route";
import type { PlaceRuntimeSource } from "./place.types";
import "./place-guest-quick-message.css";

export type RoomQuickPrivateMessageTarget = {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string;
};

export default function RoomQuickPrivateMessage({
  target,
  source,
  authenticated,
  disabled,
  open,
  onClose,
  returnFocusRef,
  allowDemoSimulation = false,
  tone = "default",
}: {
  target: RoomQuickPrivateMessageTarget;
  source: PlaceRuntimeSource;
  authenticated: boolean;
  disabled: boolean;
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  allowDemoSimulation?: boolean;
  tone?: "default" | "loge";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const attempt = useRef<{ body: string; messageId: string; key: string; conversationId?: string } | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const liveProfileAvailable = source === "live" && authenticated && isMessagingUuid(target.id);
  const demoSimulation = source === "demo" && allowDemoSimulation;
  const canSend = liveProfileAvailable || demoSimulation;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setBody("");
    setError("");
    setSent(false);
    attempt.current = null;
  }, [open, target.id]);

  const close = () => {
    if (busy.current) return;
    dialog.current?.close();
    onClose();
    returnFocusRef?.current?.focus();
  };

  const send = async () => {
    const text = body.trim();
    if (!canSend || disabled || busy.current || !text || text.length > 4_000) return;
    busy.current = true;
    setPending(true);
    setError("");

    if (demoSimulation) {
      setBody("");
      setSent(true);
      busy.current = false;
      setPending(false);
      return;
    }

    if (!attempt.current || attempt.current.body !== text) {
      attempt.current = {
        body: text,
        messageId: createMessagingClientMessageId(),
        key: createMessagingIdempotencyKey("room-quick-dm"),
      };
    }
    const current = attempt.current;
    try {
      if (!current.conversationId) {
        const conversation = await messagingRepository.getOrCreateDirectConversation(target.id, current.key);
        if (!conversation.ok) throw new Error("conversation_failed");
        current.conversationId = conversation.conversation_id;
      }
      const result = await messagingRepository.sendTextMessage({
        conversationId: current.conversationId,
        clientMessageId: current.messageId,
        body: current.body,
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
  };

  return <dialog
    ref={dialog}
    className={`place-guest-quick-message room-quick-private-message${tone === "loge" ? " is-loge" : ""}`}
    aria-label={`Message privé à ${target.name}`}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <header>
        <span className="room-quick-private-message__identity">
          {target.avatarUrl ? <img src={target.avatarUrl} alt="" /> : null}
          <span><small>MESSAGE PRIVÉ</small><strong>{target.name}</strong>{target.role ? <em>{target.role}</em> : null}</span>
        </span>
        <button type="button" aria-label="Fermer" disabled={pending} onClick={close}><X aria-hidden="true" /></button>
      </header>
      <label>Réponse privée<textarea autoFocus value={body} maxLength={4_000} disabled={pending}
        placeholder={`Écrire à ${target.name}…`}
        onChange={(event) => { setBody(event.target.value); setSent(false); }} /></label>
      {source === "demo" && allowDemoSimulation ? <p>Mode maquette : l’envoi sera simulé localement.</p> : null}
      {source === "demo" && !allowDemoSimulation ? <p>Mode démo : aucun DM réel ne sera envoyé. L’envoi est disponible dans une Room connectée.</p> : null}
      {source === "live" && !authenticated ? <p>Connecte-toi pour envoyer un message privé.</p> : null}
      {source === "live" && authenticated && !isMessagingUuid(target.id) ? <p>Ce profil de démonstration n’est pas relié à la messagerie.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {sent ? <p role="status">{demoSimulation ? "Réponse privée simulée." : "Message envoyé dans ta messagerie MeeWav."}</p> : null}
      <footer><span>{body.length} / 4000</span><button type="submit" disabled={!canSend || disabled || pending || !body.trim()}>
        <Send aria-hidden="true" />{pending ? "Envoi…" : "Envoyer"}</button></footer>
    </form>
  </dialog>;
}
