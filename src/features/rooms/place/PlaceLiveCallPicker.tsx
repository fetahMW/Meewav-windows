import {
  BadgeCheck,
  Check,
  LockKeyhole,
  LoaderCircle,
  PhoneCall,
  Radio,
  RefreshCw,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ROOM_LIVE_CALL_MAX_CONTACTS,
  roomLiveCallRepository,
  type RoomLiveCallContact,
} from "../live-call/roomLiveCall.service";
import {
  type PlaceLiveCallRequestHandler,
} from "./placeLiveCall";

type PlaceLiveCallPickerProps = {
  roomId: string;
  onLiveCallRequest?: PlaceLiveCallRequestHandler;
};

type ContactLoadState = "idle" | "loading" | "ready" | "error";

export default function PlaceLiveCallPicker({
  roomId,
  onLiveCallRequest,
}: PlaceLiveCallPickerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<ContactLoadState>("idle");
  const [contacts, setContacts] = useState<RoomLiveCallContact[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(() => new Set());
  const [callMode, setCallMode] = useState<"private" | "public">("private");
  const [requestPending, setRequestPending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const selectedContacts = useMemo(() => contacts.filter((contact) => (
    selectedProfileIds.has(contact.profileId)
  )), [contacts, selectedProfileIds]);

  const loadContacts = useCallback(async () => {
    setLoadState("loading");
    setRequestError(null);
    try {
      const rows = await roomLiveCallRepository.listContacts(roomId, null, 50);
      setContacts(rows);
      setLoadState("ready");
    } catch {
      setContacts([]);
      setLoadState("error");
    }
  }, [roomId]);

  useEffect(() => {
    if (!open || loadState !== "idle") return;
    void loadContacts();
  }, [loadContacts, loadState, open]);

  useEffect(() => {
    setOpen(false);
    setLoadState("idle");
    setContacts([]);
    setSelectedProfileIds(new Set());
    setCallMode("private");
    setRequestError(null);
  }, [roomId]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleContact = (profileId: string) => {
    setRequestError(null);
    setSelectedProfileIds((current) => {
      const next = new Set(current);
      if (next.has(profileId)) next.delete(profileId);
      else if (next.size < ROOM_LIVE_CALL_MAX_CONTACTS) next.add(profileId);
      return next;
    });
  };

  const requestCall = async () => {
    if (!onLiveCallRequest || selectedContacts.length === 0 || requestPending) return;
    setRequestPending(true);
    setRequestError(null);
    try {
      await onLiveCallRequest({ roomId, contacts: selectedContacts, mode: callMode });
      setOpen(false);
      setSelectedProfileIds(new Set());
    } catch {
      setRequestError("L’appel n’a pas pu être préparé. Réessayez.");
    } finally {
      setRequestPending(false);
    }
  };

  return (
    <div className={`place-live-call${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="place-live-call__trigger"
        aria-label="Appeler des contacts dans le live"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setRequestError(null);
        }}
        title="Appeler des contacts"
      >
        <PhoneCall aria-hidden="true" />
        {selectedProfileIds.size > 0 ? <span aria-hidden="true">{selectedProfileIds.size}</span> : null}
      </button>

      {open ? (
        <section
          className="place-live-call__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <header className="place-live-call__heading">
            <span className="place-live-call__heading-icon" aria-hidden="true"><PhoneCall /></span>
            <span>
              <small>CONTACTS MEEWAV</small>
              <strong id={titleId}>Appeler dans le live</strong>
              <em id={descriptionId}>Sélectionnez vos contacts directs</em>
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer les contacts"><X aria-hidden="true" /></button>
          </header>

          <div className="place-live-call__mode" role="radiogroup" aria-label="Mode de l’appel">
            <button
              type="button"
              role="radio"
              aria-checked={callMode === "private"}
              className={callMode === "private" ? "is-active" : ""}
              onClick={() => setCallMode("private")}
            >
              <LockKeyhole aria-hidden="true" />
              <span><strong>Appel privé</strong><small>Seulement vous et le contact</small></span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={callMode === "public"}
              className={callMode === "public" ? "is-active is-public" : ""}
              onClick={() => setCallMode("public")}
            >
              <Radio aria-hidden="true" />
              <span><strong>Appel public</strong><small>Retour vocal destiné au direct</small></span>
            </button>
          </div>

          <div className="place-live-call__body">
            {loadState === "loading" ? (
              <div className="place-live-call__state" role="status">
                <LoaderCircle className="is-spinning" aria-hidden="true" />
                <strong>Chargement des contacts…</strong>
                <span>Connexion à votre messagerie</span>
              </div>
            ) : null}

            {loadState === "error" ? (
              <div className="place-live-call__state is-error" role="alert">
                <strong>Contacts indisponibles</strong>
                <span>La messagerie n’a pas répondu.</span>
                <button type="button" onClick={() => { void loadContacts(); }}><RefreshCw aria-hidden="true" /> Réessayer</button>
              </div>
            ) : null}

            {loadState === "ready" && contacts.length === 0 ? (
              <div className="place-live-call__state is-empty" role="status">
                <PhoneCall aria-hidden="true" />
                <strong>Aucun contact direct</strong>
                <span>Vos conversations privées apparaîtront ici.</span>
              </div>
            ) : null}

            {loadState === "ready" && contacts.length > 0 ? (
              <fieldset className="place-live-call__contacts">
                <legend className="sr-only">Contacts à appeler</legend>
                {contacts.map((contact) => {
                  const checked = selectedProfileIds.has(contact.profileId);
                  const alreadyActive = Boolean(contact.activeInvitationId);
                  return (
                    <label
                      key={contact.profileId}
                      className={`${checked ? "is-selected" : ""}${alreadyActive ? " is-active" : ""}`.trim()}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={alreadyActive || (!checked && selectedProfileIds.size >= ROOM_LIVE_CALL_MAX_CONTACTS)}
                        onChange={() => toggleContact(contact.profileId)}
                      />
                      <img src={contact.avatarUrl} alt="" />
                      <span>
                        <strong>{contact.displayName}{contact.isVerified ? <BadgeCheck aria-label="Profil vérifié" /> : null}</strong>
                        <small>
                          {alreadyActive
                            ? contact.activeInvitationStatus === "accepted" ? "Appel en cours" : "Invitation envoyée"
                            : contact.isOnline
                              ? "En ligne"
                              : contact.username ? `@${contact.username}` : "Contact direct"}
                        </small>
                      </span>
                      <i aria-hidden="true">{checked ? <Check /> : null}</i>
                    </label>
                  );
                })}
              </fieldset>
            ) : null}
          </div>

          <footer className="place-live-call__footer">
            <span aria-live="polite">
              <strong>{selectedContacts.length}</strong>
              {selectedContacts.length > 1 ? " contacts sélectionnés" : " contact sélectionné"}
            </span>
            <button
              type="button"
              disabled={selectedContacts.length === 0 || requestPending || !onLiveCallRequest}
              onClick={() => { void requestCall(); }}
              title={!onLiveCallRequest ? "Transport d’appel à raccorder" : undefined}
            >
              <PhoneCall aria-hidden="true" />
              {requestPending ? "Préparation…" : callMode === "public" ? "Appeler en public" : "Appeler en privé"}
            </button>
            {requestError ? <small role="alert">{requestError}</small> : null}
          </footer>
        </section>
      ) : null}
    </div>
  );
}
