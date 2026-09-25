import {
  ArrowLeft,
  Check,
  ExternalLink,
  LoaderCircle,
  MessageCircleMore,
  Mic,
  PhoneCall,
  PhoneOff,
  Send,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { createPlaceClientId } from "./placeClientId";
import {
  appendMeeWavEmoticon,
  MeeWavEmoticonComposer,
  MeeWavEmoticonPicker,
  MeeWavRichText,
} from "../../emoticons/MeewavEmoticons";
import {
  createMessagingClientMessageId,
  messagingRepository,
} from "../../messaging/messaging.service";
import type {
  MessagingConversationRow,
  MessagingMessageRow,
} from "../../messaging/messaging.types";
import { buildMessagingRoute } from "../../messaging/messaging.route";
import { useOptionalRoomLiveCall } from "../live-call/RoomLiveCallProvider";
import {
  liveCallContactsFromConversations,
  type PlaceLiveCallContact,
} from "./placeLiveCall";
import type { PlaceParticipant } from "./place.types";
import "./place-mixer-regie.css";
import { WaveAuditionControls } from "../wave-transport/WaveTransportProvider";

type PlaceMixerRegieProps = {
  roomId: string;
  ownerId: string | null;
  queueParticipants: PlaceParticipant[];
  forceClosed?: boolean;
};

type PanelPosition = {
  left: number;
  top: number;
};

const PANEL_WIDTH = 292;
const PANEL_GAP = 8;
const ASSIGNMENT_KEY_PREFIX = "meewav:profile-regisseur:v1";

function assignmentKey(ownerId: string | null) {
  return `${ASSIGNMENT_KEY_PREFIX}:${ownerId ?? "session"}`;
}

function readAssignment(ownerId: string | null) {
  try {
    return window.localStorage.getItem(assignmentKey(ownerId));
  } catch {
    return null;
  }
}

function writeAssignment(ownerId: string | null, conversationId: string | null) {
  try {
    const key = assignmentKey(ownerId);
    if (conversationId) window.localStorage.setItem(key, conversationId);
    else window.localStorage.removeItem(key);
  } catch {
    // La messagerie reste utilisable pendant la session si le stockage est bloqué.
  }
}

function contactFromConversation(
  conversations: MessagingConversationRow[],
  conversationId: string | null,
) {
  if (!conversationId) return null;
  return liveCallContactsFromConversations(conversations)
    .find((contact) => contact.conversationId === conversationId) ?? null;
}

export default function PlaceMixerRegie({ roomId, ownerId, queueParticipants, forceClosed = false }: PlaceMixerRegieProps) {
  const liveCall = useOptionalRoomLiveCall();
  const setRegieContact = liveCall?.setRegieContact;
  const setRegieTalkbackActive = liveCall?.setRegieTalkbackActive;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition>({ left: 16, top: 64 });
  const [conversations, setConversations] = useState<MessagingConversationRow[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => (
    typeof window === "undefined" ? null : readAssignment(ownerId)
  ));
  const [messages, setMessages] = useState<MessagingMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pickerSource, setPickerSource] = useState<"contacts" | "queue">("contacts");
  const [selectedContactOverride, setSelectedContactOverride] = useState<PlaceLiveCallContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedConversationId(readAssignment(ownerId));
  }, [ownerId]);

  const contacts = useMemo(
    () => liveCallContactsFromConversations(conversations),
    [conversations],
  );
  const selectedContact = useMemo(
    () => contactFromConversation(conversations, selectedConversationId)
      ?? selectedContactOverride,
    [conversations, selectedContactOverride, selectedConversationId],
  );
  const queueContacts = useMemo(() => queueParticipants
    .filter((participant, index, rows) => (
      participant.profile.id !== ownerId
      && rows.findIndex((candidate) => candidate.profile.id === participant.profile.id) === index
    ))
    .map((participant) => ({
      participant,
      contact: {
        profileId: participant.profile.id,
        conversationId: "",
        displayName: participant.profile.displayName,
        username: participant.profile.handle?.replace(/^@+/, "") || null,
        avatarUrl: participant.profile.avatarUrl || "/avatars/utilisateur.png",
        isVerified: false,
      } satisfies PlaceLiveCallContact,
    })), [ownerId, queueParticipants]);
  const regieInvitation = useMemo(() => {
    if (!selectedContact || !liveCall) return null;
    return liveCall.outgoingInvitations.find((invitation) => (
      invitation.roomId === roomId
      && invitation.contactProfileId === selectedContact.profileId
      && invitation.callMode === "private"
      && (invitation.status === "pending" || invitation.status === "accepted")
    )) ?? null;
  }, [liveCall, roomId, selectedContact]);
  const regieSession = regieInvitation
    ? liveCall?.mediaSessions.find((session) => session.invitationId === regieInvitation.invitationId) ?? null
    : null;
  const talkbackActive = Boolean(liveCall?.regieTalkbackActiveRoomIds.has(roomId));
  const talkbackReady = Boolean(
    regieInvitation?.status === "accepted"
    && regieSession?.status === "connected"
    && regieSession.peerPresent,
  );

  useEffect(() => {
    // The persisted conversation is resolved lazily when the panel opens.
    // Do not clear the Room-scoped Régie target during that loading window:
    // the Provider uses it to keep an accepted private upstream muted.
    if (selectedConversationId && !selectedContact) return;
    setRegieContact?.(roomId, selectedContact?.profileId ?? null);
  }, [roomId, selectedContact, selectedConversationId, setRegieContact]);

  useEffect(() => () => {
    void setRegieTalkbackActive?.(roomId, false);
  }, [roomId, setRegieTalkbackActive]);

  useEffect(() => {
    if (!open) void setRegieTalkbackActive?.(roomId, false);
  }, [open, roomId, setRegieTalkbackActive]);

  useEffect(() => {
    if (forceClosed) setOpen(false);
  }, [forceClosed]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - PANEL_WIDTH - 12);
    const left = Math.min(maxLeft, Math.max(12, rect.right - PANEL_WIDTH));
    const estimatedHeight = Math.min(356, window.innerHeight - 24);
    const preferredTop = rect.bottom + PANEL_GAP;
    const top = preferredTop + estimatedHeight <= window.innerHeight - 12
      ? preferredTop
      : Math.max(12, rect.top - estimatedHeight - PANEL_GAP);
    setPosition({ left, top });
  }, []);

  const loadConversations = useCallback(async (preserveConversationId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await messagingRepository.listConversations({ kinds: ["direct"], limit: 50 });
      setConversations(rows);
      const stored = readAssignment(ownerId);
      if (stored && stored !== preserveConversationId && !rows.some((row) => row.conversation_id === stored)) {
        writeAssignment(ownerId, null);
        setSelectedConversationId(null);
      }
    } catch {
      setError("La liste de vos contacts n’est pas disponible pour le moment.");
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await messagingRepository.listMessages({ conversationId, limit: 30 });
      setMessages([...rows].sort((left, right) => left.sequence - right.sequence));
      const lastSequence = rows.reduce((highest, row) => Math.max(highest, row.sequence), 0);
      if (lastSequence > 0) void messagingRepository.markConversationRead(conversationId, lastSequence);
    } catch {
      setError("Le canal Régie ne peut pas être chargé pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadConversations();
  }, [loadConversations, open]);

  useEffect(() => {
    if (!open || !selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversationId);
  }, [loadMessages, open, selectedConversationId]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const releaseCurrentRegieCall = async () => {
    if (!regieInvitation || !liveCall) return;
    await liveCall.endCall(regieInvitation.invitationId);
  };

  const inviteRegieContact = async (contact: PlaceLiveCallContact) => {
    if (!liveCall) throw new Error("Le canal audio privé n’est pas disponible.");
    liveCall.setRegieContact(roomId, contact.profileId);
    await liveCall.requestLiveCall({ roomId, contacts: [contact], mode: "private" });
  };

  const chooseContact = async (contact: PlaceLiveCallContact) => {
    if (linking || contact.profileId === selectedContact?.profileId) return;
    setLinking(true);
    setError(null);
    try {
      await releaseCurrentRegieCall();
    } catch {
      setError("L’appel Régie actuel doit être raccroché avant de changer de contact.");
      setLinking(false);
      return;
    }
    setSelectedContactOverride(null);
    writeAssignment(ownerId, contact.conversationId);
    setSelectedConversationId(contact.conversationId);
    setMessages([]);
    setDraft("");
    try {
      await inviteRegieContact(contact);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "L’invitation Régie n’a pas pu démarrer.");
    }
    setLinking(false);
  };

  const chooseQueueContact = async (contact: PlaceLiveCallContact) => {
    if (linking || contact.profileId === selectedContact?.profileId) return;
    const previousConversationId = selectedConversationId;
    const previousOverride = selectedContactOverride;

    // Selecting a queued person must be immediate. Creating or resolving the
    // direct conversation can take a network round trip; keeping the picker on
    // screen until that RPC returns made the row look inert and invited repeat
    // clicks. The explicit override is the temporary source of truth until the
    // durable conversation id arrives.
    setSelectedContactOverride(contact);
    setSelectedConversationId(null);
    setMessages([]);
    setDraft("");
    setLinking(true);
    setError(null);
    try {
      await releaseCurrentRegieCall();
    } catch {
      setSelectedContactOverride(previousOverride);
      setSelectedConversationId(previousConversationId);
      setError("L’appel Régie actuel doit être raccroché avant de changer de contact.");
      setLinking(false);
      return;
    }

    // La personne devient le régisseur immédiatement. L'audio privé et la
    // conversation de messagerie sont deux enrichissements indépendants :
    // l'échec de l'un ne doit jamais annuler cette sélection.
    setRegieContact?.(roomId, contact.profileId);

    let audioError: string | null = null;
    try {
      await inviteRegieContact(contact);
    } catch (nextError) {
      audioError = nextError instanceof Error ? nextError.message : "L’invitation Régie n’a pas pu démarrer.";
    }

    try {
      const result = await messagingRepository.getOrCreateDirectConversation(
        contact.profileId,
        `regie:${createPlaceClientId()}`,
      );
      const linked = { ...contact, conversationId: result.conversation_id };
      setSelectedContactOverride(linked);
      writeAssignment(ownerId, result.conversation_id);
      setSelectedConversationId(result.conversation_id);
      setMessages([]);
      setDraft("");
      await loadConversations(result.conversation_id);
      if (audioError) setError(audioError);
    } catch {
      // Le régisseur et son canal audio restent sélectionnés même si la
      // messagerie n'a pas encore réussi à créer la conversation directe.
      setError(audioError
        ? `${audioError} La conversation privée n’a pas encore pu être créée.`
        : "Régisseur sélectionné. La conversation privée n’a pas encore pu être créée.");
    } finally {
      setLinking(false);
    }
  };

  const clearAssignment = async () => {
    if (linking) return;
    setLinking(true);
    setError(null);
    try {
      await setRegieTalkbackActive?.(roomId, false);
      await releaseCurrentRegieCall();
      setRegieContact?.(roomId, null);
      writeAssignment(ownerId, null);
      setSelectedConversationId(null);
      setSelectedContactOverride(null);
      setMessages([]);
      setDraft("");
    } catch {
      setError("La Régie n’a pas pu être libérée. Réessaie avant de changer de contact.");
    } finally {
      setLinking(false);
    }
  };

  const connectPrivateAudio = async () => {
    if (!selectedContact || !liveCall || linking) return;
    setLinking(true);
    setError(null);
    try {
      liveCall.setRegieContact(roomId, selectedContact.profileId);
      await liveCall.requestLiveCall({ roomId, contacts: [selectedContact], mode: "private" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "L’appel privé Régie n’a pas pu démarrer.");
    } finally {
      setLinking(false);
    }
  };

  const setTalkback = useCallback(async (active: boolean) => {
    if (!setRegieTalkbackActive) return;
    const confirmed = await setRegieTalkbackActive(roomId, active);
    if (active && !confirmed) {
      setError("Le micro public n’a pas pu être isolé. La Régie reste fermée par sécurité.");
    }
  }, [roomId, setRegieTalkbackActive]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedConversationId || sending) return;
    setSending(true);
    setError(null);
    try {
      await messagingRepository.sendTextMessage({
        conversationId: selectedConversationId,
        clientMessageId: createMessagingClientMessageId(),
        body,
      });
      setDraft("");
      await loadMessages(selectedConversationId);
    } catch {
      setError("Le message n’a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  };

  const messagingHref = selectedContact
    ? buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "rooms",
      mode: "real",
      profileId: selectedContact.profileId,
      conversationId: selectedContact.conversationId,
    })
    : null;

  const panel = open && typeof document !== "undefined" ? createPortal(
    <aside
      ref={panelRef}
      className={`place-mixer-regie-panel${selectedContact ? " has-contact" : " is-picker"}`}
      style={{ "--regie-left": `${position.left}px`, "--regie-top": `${position.top}px` } as CSSProperties}
      role="dialog"
      aria-modal="false"
      aria-label="Canal Régie"
    >
      <header>
        <span className="place-mixer-regie-panel__signal"><MessageCircleMore aria-hidden="true" /></span>
        <span><small>CANAL PRIVÉ</small><strong>Régie</strong></span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le canal Régie"><X aria-hidden="true" /></button>
      </header>

      <WaveAuditionControls />
      {selectedContact ? (
        <>
          <div className="place-mixer-regie-panel__contact">
            <img src={selectedContact.avatarUrl} alt="" />
            <span><strong>{selectedContact.displayName}</strong><small>Régisseur associé à ce profil</small></span>
            <i title="Canal disponible"><Check aria-hidden="true" /></i>
          </div>
          <section className="place-mixer-regie-panel__talkback" aria-label="Interphone Régie">
            {!regieInvitation ? (
              <button type="button" className="is-connect" disabled={linking || !liveCall} onClick={() => void connectPrivateAudio()}>
                {linking ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <PhoneCall aria-hidden="true" />}
                Connecter l’audio privé
              </button>
            ) : regieInvitation.status === "pending" ? (
              <p><LoaderCircle className="is-spinning" aria-hidden="true" /> Invitation envoyée · en attente d’acceptation</p>
            ) : (
              <>
                <button
                  type="button"
                  className={`is-hold${talkbackActive ? " is-active" : ""}`}
                  disabled={!talkbackReady}
                  aria-pressed={talkbackActive}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    void setTalkback(true);
                  }}
                  onPointerUp={() => void setTalkback(false)}
                  onPointerCancel={() => void setTalkback(false)}
                  onPointerLeave={() => talkbackActive && void setTalkback(false)}
                  onKeyDown={(event) => {
                    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                      event.preventDefault();
                      void setTalkback(true);
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      void setTalkback(false);
                    }
                  }}
                  onBlur={() => void setTalkback(false)}
                >
                  <Mic aria-hidden="true" />
                  {talkbackActive ? "Parlez · relâchez pour le public" : talkbackReady ? "Maintenir pour parler" : "Connexion audio…"}
                </button>
                <button
                  type="button"
                  className="is-end-call"
                  onClick={() => void liveCall?.endCall(regieInvitation.invitationId)}
                  aria-label="Raccrocher la Régie"
                ><PhoneOff aria-hidden="true" /></button>
              </>
            )}
            <small>{talkbackActive ? "Votre voix est coupée du direct." : "Le public continue d’entendre le direct."}</small>
          </section>
          <div className="place-mixer-regie-panel__messages" aria-live="polite">
            {loading && messages.length === 0 ? <p>Connexion au canal…</p> : null}
            {!loading && messages.length === 0 && !error ? <p>Aucun message. Le canal Régie est prêt.</p> : null}
            {messages.slice(-12).map((message) => (
              <article key={message.id} className={message.sender_profile_id === ownerId ? "is-mine" : undefined}>
                <small>{message.sender_profile_id === ownerId ? "Moi" : selectedContact.displayName}</small>
                <span><MeeWavRichText emoticonSize={27}>{message.body || "Message"}</MeeWavRichText></span>
              </article>
            ))}
          </div>
          {error ? <p className="place-mixer-regie-panel__error" role="alert">{error}</p> : null}
          <form className="place-mixer-regie-panel__composer" onSubmit={submitMessage}>
            <MeeWavEmoticonComposer
              value={draft}
              onChange={setDraft}
              placeholder="Écrire au régisseur…"
              maxLength={4000}
              ariaLabel="Message au régisseur"
            />
            <MeeWavEmoticonPicker
              disabled={sending}
              onSelect={(emoticon) => setDraft((value) => appendMeeWavEmoticon(value, emoticon.name, 4_000))}
            />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Envoyer au régisseur"><Send aria-hidden="true" /></button>
          </form>
          <footer>
            <button type="button" disabled={linking} onClick={() => void clearAssignment()}><ArrowLeft aria-hidden="true" /> Changer</button>
            {messagingHref ? <a href={messagingHref} target="_blank" rel="noreferrer">Messagerie <ExternalLink aria-hidden="true" /></a> : null}
          </footer>
        </>
      ) : (
        <>
          <div className="place-mixer-regie-panel__picker-copy">
            <UserRoundSearch aria-hidden="true" />
            <span><strong>Choisir votre régisseur</strong><small>Contacts issus de votre messagerie privée.</small></span>
          </div>
          <div className="place-mixer-regie-panel__sources" role="tablist" aria-label="Source du régisseur">
            <button type="button" role="tab" aria-selected={pickerSource === "contacts"} className={pickerSource === "contacts" ? "is-active" : ""} onClick={() => { setPickerSource("contacts"); void loadConversations(); }}><MessageCircleMore aria-hidden="true" /> Mes contacts</button>
            <button type="button" role="tab" aria-selected={pickerSource === "queue"} className={pickerSource === "queue" ? "is-active" : ""} onClick={() => setPickerSource("queue")}><UsersRound aria-hidden="true" /> File d’attente</button>
          </div>
          <div className="place-mixer-regie-panel__contacts">
            {loading ? <p>Chargement des contacts…</p> : null}
            {!loading && pickerSource === "contacts" && contacts.length === 0 && !error ? <p>Aucune conversation directe disponible.</p> : null}
            {!loading && pickerSource === "queue" && queueContacts.length === 0 && !error ? <p>La file d’attente est vide.</p> : null}
            {pickerSource === "contacts" ? contacts.map((contact) => (
              <button type="button" key={contact.profileId} disabled={linking} onClick={() => void chooseContact(contact)}>
                <img src={contact.avatarUrl} alt="" />
                <span><strong>{contact.displayName}</strong><small>{contact.username ? `@${contact.username}` : "Contact Meewav"}</small></span>
                <MessageCircleMore aria-hidden="true" />
              </button>
            )) : queueContacts.map(({ participant, contact }) => (
              <button type="button" key={contact.profileId} disabled={linking} onClick={() => void chooseQueueContact(contact)}>
                <img src={contact.avatarUrl} alt="" />
                <span><strong>{contact.displayName}</strong><small>{participant.profile.role || "Dans la file d’attente"}</small></span>
                <UsersRound aria-hidden="true" />
              </button>
            ))}
          </div>
          {error ? <p className="place-mixer-regie-panel__error" role="alert">{error}</p> : null}
          {error ? <button type="button" className="place-mixer-regie-panel__retry" onClick={() => void loadConversations()}>Réessayer</button> : null}
        </>
      )}
    </aside>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`place-mixer-audio__regie-button${selectedContact ? " is-linked" : ""}${talkbackActive ? " is-talking" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={talkbackActive ? "Vous parlez uniquement à la Régie" : "Discuter avec le régisseur"}
      >
        <MessageCircleMore aria-hidden="true" />
        <span>Régie</span>
      </button>
      {panel}
    </>
  );
}
