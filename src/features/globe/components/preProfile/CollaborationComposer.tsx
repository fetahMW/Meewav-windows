import {
  type ChangeEvent,
  type FormEvent,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  HeartHandshake,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import {
  appendMeeWavEmoticon,
  MeeWavEmoticonComposer,
  MeeWavEmoticonPicker,
} from "../../../emoticons/MeewavEmoticons";

export type CollaborationDraft = {
  recipientProfileId: string;
  message: string;
  attachments: File[];
};

export type CollaborationComposerProps = {
  recipientProfileId: string;
  recipientName: string;
  attachmentsEnabled?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onSubmit?: (draft: CollaborationDraft) => void | Promise<void>;
};

const MESSAGE_MAX_LENGTH = 500;
const ATTACHMENT_MAX_COUNT = 3;

function getAttachmentKind(file: File) {
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Image";
  if (file.type.startsWith("audio/")) return "Audio";
  if (file.type.startsWith("video/")) return "Vidéo";
  if (file.type === "application/pdf") return "PDF";
  return null;
}

function formatFileSize(size: number) {
  if (size < 1_000) return `${size} o`;
  if (size < 1_000_000) return `${Math.max(1, Math.round(size / 1_000))} Ko`;
  return `${(size / 1_000_000).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} Mo`;
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function CollaborationComposer({
  recipientProfileId,
  recipientName,
  attachmentsEnabled = true,
  onOpen,
  onClose,
  onSubmit,
}: CollaborationComposerProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [status, setStatus] = useState<"editing" | "submitting" | "ready">("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (!attachmentsEnabled) {
      event.target.value = "";
      setErrorMessage("Les pièces jointes seront disponibles après l’activation du stockage sécurisé.");
      return;
    }
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;

    const supportedFiles = selectedFiles.filter((file) => getAttachmentKind(file));
    if (supportedFiles.length !== selectedFiles.length) {
      setErrorMessage("Formats acceptés : image JPG/PNG/WebP, audio, vidéo ou PDF.");
    } else {
      setErrorMessage(null);
    }

    setAttachments((current) => {
      const availableSlots = ATTACHMENT_MAX_COUNT - current.length;
      if (availableSlots <= 0 || supportedFiles.length > availableSlots) {
        setErrorMessage("Maximum de 3 fichiers par demande.");
      }
      return [...current, ...supportedFiles.slice(0, Math.max(0, availableSlots))];
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || status !== "editing") return;

    setStatus("submitting");
    setErrorMessage(null);
    try {
      await onSubmit?.({
        recipientProfileId,
        message: trimmedMessage,
        attachments,
      });
      setStatus("ready");
    } catch {
      setStatus("editing");
      setErrorMessage("La demande n'a pas pu être envoyée. Réessaie.");
    }
  };

  return (
    <form
      id="mw-collaboration-composer"
      className="mw-collaboration-composer"
      aria-label={`Demande de collaboration à ${recipientName}`}
      onSubmit={handleSubmit}
      onPointerDown={stopPropagation}
      onClick={stopPropagation}
      onWheel={stopPropagation}
    >
      <header className="mw-collaboration-composer__header">
        <span className="mw-collaboration-composer__header-icon" aria-hidden="true">
          <HeartHandshake size={17} strokeWidth={2.2} />
        </span>
        <span className="mw-collaboration-composer__title">
          <strong>Demande de collab</strong>
          <small>À {recipientName}</small>
        </span>
        <button
          className="mw-collaboration-composer__close"
          type="button"
          aria-label="Replier la demande de collaboration"
          title="Replier"
          onClick={onClose}
        >
          <ChevronDown size={17} strokeWidth={2.5} />
        </button>
      </header>

      {status === "ready" ? (
        <div className="mw-collaboration-composer__ready" role="status">
          <span className="mw-collaboration-composer__ready-icon" aria-hidden="true">
            <HeartHandshake size={22} strokeWidth={2.15} />
          </span>
          <strong>Demande envoyée</strong>
          <p>Elle est disponible dans Messagerie → Collabs → Envoyées.</p>
        </div>
      ) : (
        <div className="mw-collaboration-composer__body">
          <div className="mw-collaboration-composer__message">
            <span className="mw-collaboration-composer__sr-only">Idée de collaboration</span>
            <MeeWavEmoticonComposer
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Présente ton idée, ce que tu recherches et le calendrier envisagé"
              value={message}
              disabled={status === "submitting"}
              onChange={setMessage}
              multiline
              ariaLabel="Idée de collaboration"
            />
            <MeeWavEmoticonPicker
              disabled={status === "submitting"}
              onSelect={(emoticon) => setMessage((value) => appendMeeWavEmoticon(value, emoticon.name, MESSAGE_MAX_LENGTH))}
            />
            <span className="mw-collaboration-composer__counter">
              {message.length} / {MESSAGE_MAX_LENGTH}
            </span>
          </div>

          <div className="mw-collaboration-composer__attachments-head">
            <span>{attachmentsEnabled ? "Pièces jointes" : "Pièces jointes bientôt disponibles"} <strong>{attachments.length} / {ATTACHMENT_MAX_COUNT}</strong></span>
            <button
              type="button"
              disabled={!attachmentsEnabled || attachments.length >= ATTACHMENT_MAX_COUNT || status === "submitting"}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={13} strokeWidth={2.3} />
              Joindre
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,audio/*,video/*,application/pdf"
              multiple
              disabled={!attachmentsEnabled}
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFilesSelected}
            />
          </div>

          {errorMessage && <p className="mw-collaboration-composer__error" role="alert">{errorMessage}</p>}

          {attachments.length > 0 && (
            <ul className="mw-collaboration-composer__attachment-list" aria-label="Fichiers joints">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                  <span className="mw-collaboration-composer__attachment-copy">
                    <strong title={file.name}>{file.name}</strong>
                    <small>{getAttachmentKind(file)} · {formatFileSize(file.size)}</small>
                  </span>
                  <button
                    type="button"
                    aria-label={`Retirer ${file.name}`}
                    disabled={status === "submitting"}
                    onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="mw-collaboration-composer__footer">
        {status === "ready" ? (
          <button className="is-primary" type="button" onClick={onClose}>Fermer</button>
        ) : (
          <>
            <button type="button" onClick={onClose}>Annuler</button>
            <button
              className="is-primary"
              type="submit"
              disabled={!message.trim() || status === "submitting"}
            >
              <Send size={13} strokeWidth={2.3} />
              {status === "submitting" ? "Envoi…" : "Envoyer la demande"}
            </button>
          </>
        )}
      </footer>
    </form>
  );
}

export default CollaborationComposer;
