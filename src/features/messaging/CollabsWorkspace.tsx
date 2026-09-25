import { Link } from "react-router-dom";
import CollabInlineAudio from "./CollabInlineAudio";
import {
  AudioLines,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Gauge,
  Handshake,
  KeyRound,
  Music2,
  Moon,
  Paperclip,
  Play,
  Send,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeeWavRichText } from "../emoticons/MeewavEmoticons";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { SCENE_NAME } from "../shorts/sceneContract";
import {
  demoCollabs,
  type DemoCollab,
  type DemoCollabAcceptedState,
  type DemoCollabAttachment,
  type DemoCollabSentState,
  type DemoConversation,
} from "./messagingDemoData";
import { removeGlobeCollaborationRequest } from "./collaborationRequestBridge";
import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";
import type { MessagingCollaborationViewModel } from "./messaging.collaboration.types";
import { Waveform } from "./TrackPackStudioPrimitives";
import "./messaging-hubs.css";

type CollabFilter = "received" | "sent" | "accepted";

export type CollabsWorkspaceLiveError = string | { message: string } | null;
export type CollabsWorkspaceLiveStatus = "idle" | "loading" | "ready" | "error";

/**
 * Narrow live contract consumed by the collaboration workspace.
 *
 * The parent owns the server collection and refresh lifecycle. This component
 * never fabricates an optimistic collaboration when this controller is set:
 * `collabs` remains the single source of truth.
 */
export type CollabsWorkspaceLiveController = {
  markViewed: (requestId: string) => Promise<unknown> | unknown;
  acceptRequest: (requestId: string) => Promise<unknown> | unknown;
  declineRequest: (requestId: string) => Promise<unknown> | unknown;
  cancelRequest: (requestId: string) => Promise<unknown> | unknown;
  isMutating: (requestId: string) => boolean;
  status?: CollabsWorkspaceLiveStatus;
  error?: CollabsWorkspaceLiveError;
  actionError?: CollabsWorkspaceLiveError;
  clearActionError?: () => void;
  retry?: () => Promise<unknown> | unknown;
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
};

export type CollabsWorkspaceProps = {
  collabs?: DemoCollab[];
  onAcceptedCollab: (conversation: DemoConversation, collab: DemoCollab) => void;
  openCollabRequest?: { token: number; id: string };
  onItemsChange?: (collabs: DemoCollab[]) => void;
  onActiveCollabChange?: (collabId: string | null) => void;
  liveController?: CollabsWorkspaceLiveController;
  pinnedCollabId?: string;
};

let collabSessionItems: DemoCollab[] | null = null;

function reconcileGlobeCollabs(current: DemoCollab[], incoming: DemoCollab[]) {
  const incomingGlobe = incoming.filter((collab) => collab.origin === "globe");
  const incomingGlobeIds = new Set(incomingGlobe.map((collab) => collab.id));
  const retained = current.filter((collab) => collab.origin !== "globe" || incomingGlobeIds.has(collab.id));
  const retainedIds = new Set(retained.map((collab) => collab.id));
  return [...incomingGlobe.filter((collab) => !retainedIds.has(collab.id)), ...retained];
}

const sentStateCopy: Record<DemoCollabSentState, string> = {
  unread: "Non lue",
  read: "Lue",
  accepted: "Acceptée",
  rejected: "Refusée",
};

const acceptedStateCopy: Record<DemoCollabAcceptedState, string> = {
  inProgress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

function browserUrl(url: string) {
  if (/^(?:https?:|data:|blob:|\/)/i.test(url)) return url;
  return `/${url.replace(/\\/g, "/")}`;
}

function localCollabAvatar(collab: DemoCollab) {
  if (collab.avatar?.trim()) return browserUrl(collab.avatar);
  const numericId = Number(collab.userId.match(/\d+$/)?.[0] ?? 1);
  const localIndex = (Math.max(1, numericId) - 1) % 7 + 1;
  return `/images/messaging/avatars/avatar_${localIndex}.png`;
}

export function getCollabAvatar(collab: DemoCollab) {
  return localCollabAvatar(collab);
}

function isLocalAsset(url?: string): url is string {
  return Boolean(url && !/^https?:/i.test(url));
}

function createSilentWavBlob() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 3;
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(36, "data");
  view.setUint32(40, sampleCount, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Blob([buffer], { type: "audio/wav" });
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function createImagePreviewBlob(attachment: DemoCollabAttachment) {
  const title = escapeXml(attachment.fileName);
  const subtitle = escapeXml(attachmentInfo(attachment));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><radialGradient id="g" cx="28%" cy="20%"><stop stop-color="#8142ea"/><stop offset="1" stop-color="#090511"/></radialGradient></defs><rect width="1200" height="675" fill="url(#g)"/><path d="M0 520C220 390 360 620 600 470S970 310 1200 430V675H0Z" fill="#180b31" opacity=".88"/><circle cx="930" cy="170" r="118" fill="none" stroke="#01eaf5" stroke-width="3" opacity=".35"/><text x="72" y="102" fill="#01eaf5" font-family="Arial" font-size="22" font-weight="700" letter-spacing="5">MEEWAV • APERÇU LOCAL</text><text x="72" y="330" fill="white" font-family="Arial" font-size="48" font-weight="700">${title}</text><text x="72" y="380" fill="#bbaad2" font-family="Arial" font-size="24">${subtitle}</text></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function escapePdf(value: string) {
  return value.replace(/([\\()])/g, "\\$1").replace(/[^\x20-\x7E]/g, "?");
}

function createPdfPreviewBlob(attachment: DemoCollabAttachment) {
  const stream = `BT /F1 24 Tf 72 700 Td (MEEWAV - APERCU LOCAL) Tj 0 -52 Td /F1 17 Tf (${escapePdf(attachment.fileName)}) Tj 0 -34 Td /F1 11 Tf (${escapePdf(attachmentInfo(attachment))}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object) => {
    const offset = pdf.length;
    pdf += object;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function createLocalPreviewBlob(attachment: DemoCollabAttachment) {
  if (attachment.type === "audio") return createSilentWavBlob();
  if (attachment.type === "image") return createImagePreviewBlob(attachment);
  if (attachment.type === "pdf") return createPdfPreviewBlob(attachment);
  return new Blob([
    `MEEWAV — aperçu local\n${attachment.fileName}\n${attachmentInfo(attachment)}\n`,
  ], { type: "text/plain;charset=utf-8" });
}

async function downloadLocalAttachment(
  attachment: DemoCollabAttachment,
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>,
) {
  if (attachment.serverAttachment) {
    if (!attachment.serverAttachment.available || !resolveAttachmentUrl) return false;
    const url = await resolveAttachmentUrl(attachment.serverAttachment);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
  const isDirectMedia = (attachment.type === "audio" || attachment.type === "video")
    && isLocalAsset(attachment.url)
    && /^(?:blob:|data:|\/|assets\/)/i.test(attachment.url);
  const blob = isDirectMedia
    ? null
    : createLocalPreviewBlob(attachment);
  const url = blob ? URL.createObjectURL(blob) : browserUrl(attachment.url);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (blob) URL.revokeObjectURL(url);
  return true;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds?: number) {
  if (seconds === undefined) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function attachmentInfo(attachment: DemoCollabAttachment) {
  const parts = [formatFileSize(attachment.fileSize)];
  const duration = formatDuration(attachment.durationSeconds);
  if (duration) parts.push(duration);
  if (attachment.type === "audio" && attachment.bpm !== undefined) parts.push(`${attachment.bpm} BPM`);
  if (attachment.type === "audio" && attachment.musicalKey) parts.push(attachment.musicalKey);
  return parts.join(" • ");
}

function AttachmentIcon({ attachment }: { attachment: DemoCollabAttachment }) {
  if (attachment.type === "audio") return <FileAudio aria-hidden="true" />;
  if (attachment.type === "image") return <FileImage aria-hidden="true" />;
  if (attachment.type === "video") return <FileVideo aria-hidden="true" />;
  if (attachment.type === "pdf") return <FileText aria-hidden="true" />;
  return <File aria-hidden="true" />;
}

export function buildCollabConversation(collab: DemoCollab, accepted = false): DemoConversation {
  const now = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return {
      id: accepted ? `conv_friend_collab_${collab.id}` : `conv_collab_${collab.id}`,
      collaborationRequestId: accepted ? null : collab.id,
    name: collab.name,
    handle: `@${collab.name.toLocaleLowerCase("fr-FR").replace(/ /g, "_")}`,
    role: collab.role,
    avatar: localCollabAvatar(collab),
    status: accepted ? "Collab en cours" : "Demande de collab",
    online: true,
    gradeLevel: getCollabGradeLevel(collab),
    unread: 1,
    preview: accepted ? "🎵 Collab acceptée ! Commencez à discuter." : collab.message,
    time: "À l'instant",
    messages: [{
      id: `msg_collab_${collab.id}`,
      author: "them",
      kind: "text",
      body: accepted ? "🎵 Collab acceptée ! Commencez à discuter." : collab.message,
      time: now,
    }],
  };
}

type CollabProfileStats = {
  collaborations: number;
  responseRate: number;
};

const demoCollabProfileStats: Record<string, CollabProfileStats> = {
  collab_user_1: { collaborations: 5, responseRate: 98 },
  collab_user_2: { collaborations: 8, responseRate: 96 },
  collab_user_3: { collaborations: 12, responseRate: 94 },
  collab_user_4: { collaborations: 7, responseRate: 91 },
  collab_user_5: { collaborations: 16, responseRate: 99 },
  collab_user_6: { collaborations: 4, responseRate: 93 },
  collab_user_7: { collaborations: 21, responseRate: 99 },
  collab_user_8: { collaborations: 9, responseRate: 95 },
  collab_user_9: { collaborations: 11, responseRate: 97 },
  collab_user_10: { collaborations: 18, responseRate: 99 },
  collab_wall_artist_1: { collaborations: 6, responseRate: 96 },
  collab_wall_artist_2: { collaborations: 14, responseRate: 98 },
  collab_wall_artist_3: { collaborations: 9, responseRate: 95 },
  collab_wall_artist_4: { collaborations: 23, responseRate: 97 },
  collab_wall_artist_5: { collaborations: 7, responseRate: 94 },
  collab_wall_artist_6: { collaborations: 17, responseRate: 99 },
  collab_wall_artist_7: { collaborations: 11, responseRate: 96 },
};

function getCollabProfileStats(collab: DemoCollab) {
  return demoCollabProfileStats[collab.userId] ?? null;
}

function formatCollabActivity(value: string) {
  return value.replace(/^(\d+)\s*([hmj])$/i, "$1 $2");
}

function formatDetailedMusicalKey(value?: string) {
  if (!value) return null;
  if (/m$/i.test(value)) return `${value.slice(0, -1)} minor`;
  return `${value} major`;
}

function detailAttachmentArtwork(attachment: DemoCollabAttachment) {
  if (isLocalAsset(attachment.thumbnailUrl)) return browserUrl(attachment.thumbnailUrl);
  const numericId = Number(attachment.id.match(/\d+/)?.[0] ?? 1);
  const coverIndex = (numericId + 10) % 13 + 1;
  return `/images/messaging/covers/cover_${coverIndex}.png`;
}

function getCollabGradeLevel(collab: DemoCollab) {
  return collab.gradeLevel ?? collab.rank;
}

function requestLabel(collab: DemoCollab) {
  if (collab.status === "accepted") return "Collaboration active";
  if (collab.status === "sent") return "Demande envoyée";
  return "Demande de collab";
}

function attachmentTypeLabel(attachment: DemoCollabAttachment | undefined) {
  if (!attachment) return null;
  if (attachment.type === "audio") return "Démo audio";
  if (attachment.type === "video") return "Démo vidéo";
  if (attachment.type === "image") return "Visuel";
  if (attachment.type === "pdf") return "Brief PDF";
  return "Fichier projet";
}

function liveErrorMessage(error: CollabsWorkspaceLiveError | undefined) {
  if (!error) return null;
  if (typeof error === "string") return error;
  return error.message;
}

function caughtErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "L’action n’a pas pu être effectuée. Réessaie dans un instant.";
}

type CollabMusicalFact = {
  id: string;
  icon: ReactNode;
  label: string;
};

function collabMusicalFacts(collab: DemoCollab) {
  const attachment = collab.attachments[0];
  const typeLabel = attachmentTypeLabel(attachment);
  const facts: Array<CollabMusicalFact | null> = [
    (collab.genre || typeLabel) ? { id: "style", icon: <Music2 aria-hidden="true" />, label: collab.genre ?? typeLabel ?? "" } : null,
    attachment?.bpm ? { id: "bpm", icon: <Gauge aria-hidden="true" />, label: `${attachment.bpm} BPM` } : null,
    attachment?.musicalKey ? { id: "key", icon: <KeyRound aria-hidden="true" />, label: attachment.musicalKey } : null,
    collab.mood ? { id: "mood", icon: null, label: collab.mood } : null,
  ];
  return facts.filter((fact): fact is CollabMusicalFact => Boolean(fact?.label));
}

function AttachmentPreview({
  attachment,
  onClose,
  resolveAttachmentUrl,
}: {
  attachment: DemoCollabAttachment;
  onClose: () => void;
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
}) {
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const poster = isLocalAsset(attachment.thumbnailUrl) ? browserUrl(attachment.thumbnailUrl) : undefined;

  useEffect(() => {
    if (attachment.serverAttachment) {
      let cancelled = false;
      if (!attachment.serverAttachment.available || !resolveAttachmentUrl) {
        setPreviewError("Cette pièce jointe privée n’est plus disponible.");
        return undefined;
      }
      setPreviewError(null);
      void resolveAttachmentUrl(attachment.serverAttachment)
        .then((url) => { if (!cancelled) setPreviewSource(url); })
        .catch(() => { if (!cancelled) setPreviewError("Impossible d’ouvrir cette pièce jointe privée."); });
      return () => { cancelled = true; };
    }
    const isDirectMedia = (attachment.type === "audio" || attachment.type === "video")
      && isLocalAsset(attachment.url)
      && /^(?:blob:|data:|\/|assets\/)/i.test(attachment.url);
    if (isDirectMedia) {
      setPreviewSource(browserUrl(attachment.url));
      return undefined;
    }
    const objectUrl = URL.createObjectURL(createLocalPreviewBlob(attachment));
    setPreviewSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment, resolveAttachmentUrl]);

  return (
    <div
      className="mw-layer mw-attachment-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <article className="mw-attachment-viewer" role="dialog" aria-modal="true" aria-labelledby="mw-attachment-title">
        <header>
          <span>
            <small>Pièce jointe</small>
            <strong id="mw-attachment-title">{attachment.fileName}</strong>
            <em>{attachmentInfo(attachment)}</em>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer l'aperçu"><X /></button>
        </header>

        <div className={`mw-attachment-viewer__media is-${attachment.type}`}>
          {!previewSource && !previewError && <span className="mw-attachment-viewer__loading">Ouverture sécurisée…</span>}
          {previewError && <span className="mw-attachment-viewer__loading" role="alert">{previewError}</span>}
          {previewSource && attachment.type === "audio" && (
            <div className="mw-attachment-viewer__audio">
              <FileAudio aria-hidden="true" />
              <audio src={previewSource} controls autoPlay preload="metadata">
                Votre navigateur ne peut pas lire ce fichier audio.
              </audio>
            </div>
          )}
          {previewSource && attachment.type === "video" && (
            <video src={previewSource} poster={poster} controls autoPlay preload="metadata">
              Votre navigateur ne peut pas lire cette vidéo.
            </video>
          )}
          {previewSource && attachment.type === "image" && <img src={previewSource} alt={attachment.fileName} />}
          {previewSource && attachment.type === "pdf" && <iframe src={previewSource} title={attachment.fileName} />}
          {previewSource && attachment.type === "file" && (
            <div className="mw-attachment-viewer__file"><File aria-hidden="true" /><strong>{attachment.fileName}</strong></div>
          )}
        </div>

        <footer>
          <button type="button" disabled={Boolean(previewError)} onClick={() => { void downloadLocalAttachment(attachment, resolveAttachmentUrl); }}><Download /> Télécharger</button>
        </footer>
      </article>
    </div>
  );
}

function DetailAttachmentList({
  attachments,
  ownerName,
  demo = false,
  onPreview,
  resolveAttachmentUrl,
}: {
  attachments: DemoCollabAttachment[];
  ownerName: string;
  demo?: boolean;
  onPreview: (attachment: DemoCollabAttachment) => void;
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
}) {
  if (attachments.length === 0) return null;

  return (
    <div
      className="mw-collab-request__attachments"
      aria-label={`${attachments.length} pièce${attachments.length > 1 ? "s" : ""} jointe${attachments.length > 1 ? "s" : ""}`}
    >
      {attachments.map((attachment, index) => {
        if (attachment.type === "audio") return <CollabInlineAudio key={attachment.id} attachment={attachment} artwork={detailAttachmentArtwork(attachment)} ownerName={ownerName} demo={demo} resolveUrl={resolveAttachmentUrl} onDownload={() => { void downloadLocalAttachment(attachment, resolveAttachmentUrl); }} />;
        const duration = formatDuration(attachment.durationSeconds);
        const detailedKey = formatDetailedMusicalKey(attachment.musicalKey);
        const hasWaveform = attachment.type === "video";
        return (
          <article key={attachment.id} className={`mw-collab-request__attachment is-${attachment.type}`}>
            <span className="mw-collab-request__attachment-cover" aria-hidden="true">
              <img src={detailAttachmentArtwork(attachment)} alt="" />
              <small>{ownerName}</small>
            </span>

            <button
              type="button"
              className="mw-collab-request__attachment-play"
              onClick={() => onPreview(attachment)}
              aria-label={`${hasWaveform ? "Lire" : "Ouvrir"} ${attachment.fileName}`}
            >
              {hasWaveform ? <Play fill="currentColor" aria-hidden="true" /> : <AttachmentIcon attachment={attachment} />}
            </button>

            <strong className="mw-collab-request__attachment-title">{attachment.fileName}</strong>
            {duration && <span className="mw-collab-request__attachment-duration">{duration}</span>}

            {hasWaveform ? (
              <span className="mw-collab-request__attachment-wave">
                <Waveform progress={100} variant={index + attachment.fileName.length} />
              </span>
            ) : (
              <span className="mw-collab-request__attachment-type"><AttachmentIcon attachment={attachment} /></span>
            )}

            <span className="mw-collab-request__attachment-meta">
              <File aria-hidden="true" />
              <span>{formatFileSize(attachment.fileSize)}</span>
              {attachment.bpm !== undefined && <><i aria-hidden="true">•</i><span>{attachment.bpm} BPM</span></>}
              {detailedKey && <><i aria-hidden="true">•</i><span>{detailedKey}</span></>}
            </span>

            <span className="mw-collab-request__attachment-actions">
              <button type="button" onClick={() => onPreview(attachment)}>Aperçu</button>
              <button
                type="button"
                onClick={() => { void downloadLocalAttachment(attachment, resolveAttachmentUrl); }}
                aria-label={`Télécharger ${attachment.fileName}`}
              >
                <Download aria-hidden="true" />
              </button>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function CollabState({ collab }: { collab: DemoCollab }) {
  if (collab.status === "sent" && collab.sentState) {
    return <span className={`mw-status is-${collab.sentState}`}><Send size={14} /> {sentStateCopy[collab.sentState]}</span>;
  }
  if (collab.status === "accepted" && collab.acceptedState) {
    return <span className={`mw-status mw-status--accepted is-${collab.acceptedState}`}><CheckCircle2 size={14} /> {acceptedStateCopy[collab.acceptedState]}</span>;
  }
  return null;
}

export function CollabsWorkspace({
  collabs: controlledCollabs,
  onAcceptedCollab,
  openCollabRequest,
  onItemsChange,
  onActiveCollabChange,
  liveController,
  pinnedCollabId,
}: CollabsWorkspaceProps) {
  const isLive = Boolean(liveController);
  const incomingCollabs = useMemo(
    () => controlledCollabs ?? (isLive ? [] : demoCollabs),
    [controlledCollabs, isLive],
  );
  const [demoItems, setDemoItems] = useState(() => reconcileGlobeCollabs(collabSessionItems ?? incomingCollabs, incomingCollabs));
  const items = useMemo(() => {
    if (!isLive) return demoItems;
    // Live v2 already exposes a privacy-safe attachment projection. Keep it as
    // the single source of truth instead of erasing it in the view layer.
    return incomingCollabs;
  }, [demoItems, incomingCollabs, isLive]);
  const onItemsChangeRef = useRef(onItemsChange);
  const onActiveCollabChangeRef = useRef(onActiveCollabChange);
  const lastOpenToken = useRef<number | null>(null);
  const [liveActionError, setLiveActionError] = useState<string | null>(null);
  onItemsChangeRef.current = onItemsChange;
  onActiveCollabChangeRef.current = onActiveCollabChange;

  useEffect(() => {
    if (isLive) return;
    setDemoItems((current) => reconcileGlobeCollabs(current, incomingCollabs));
  }, [incomingCollabs, isLive]);

  useEffect(() => {
    if (isLive) return;
    collabSessionItems = demoItems;
    onItemsChangeRef.current?.(demoItems);
  }, [demoItems, isLive]);
  const [filter, setFilter] = useState<CollabFilter>("received");
  const [selectedCollabId, setSelectedCollabId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<DemoCollabAttachment | null>(null);

  const openCollab = useCallback((collab: DemoCollab) => {
    setFilter(collab.status === "accepted" ? "accepted" : collab.status === "sent" && !collab.isReceived ? "sent" : "received");
    setSelectedCollabId(collab.id);
    setPreviewAttachment(null);
    onActiveCollabChangeRef.current?.(collab.id);
    if (liveController && !liveController.isMutating(collab.id)) {
      setLiveActionError(null);
      liveController.clearActionError?.();
      void Promise.resolve(liveController.markViewed(collab.id)).catch((error: unknown) => {
        setLiveActionError(caughtErrorMessage(error));
      });
    }
  }, [liveController]);

  const showOverview = () => {
    setSelectedCollabId(null);
    setPreviewAttachment(null);
    onActiveCollabChangeRef.current?.(null);
  };

  const changeFilter = (nextFilter: CollabFilter) => {
    showOverview();
    setFilter(nextFilter);
  };

  useEffect(() => {
    if (!openCollabRequest || lastOpenToken.current === openCollabRequest.token) return;
    const collab = items.find((item) => item.id === openCollabRequest.id);
    if (!collab) return;
    lastOpenToken.current = openCollabRequest.token;
    openCollab(collab);
  }, [items, openCollab, openCollabRequest]);

  const visibleCollabs = useMemo(() => items.filter((collab) => {
    if (filter === "received") return collab.status === "pending" && collab.isReceived;
    if (filter === "sent") return collab.status === "sent" && !collab.isReceived;
    return collab.status === "accepted";
  }), [filter, items]);

  const detailCollab = items.find((collab) => collab.id === selectedCollabId) ?? null;
  const profileHref = (collab: DemoCollab) => {
    const query = isLive ? "" : `?${new URLSearchParams({ name: collab.name, role: collab.role, portrait: localCollabAvatar(collab), grade: String(getCollabGradeLevel(collab)) })}`;
    return `/profile/view/${encodeURIComponent(collab.userId)}${query}`;
  };
  const countFor = (target: CollabFilter) => items.filter((collab) => {
    if (target === "received") return collab.status === "pending" && collab.isReceived;
    if (target === "sent") return collab.status === "sent" && !collab.isReceived;
    return collab.status === "accepted";
  }).length;

  const acceptCollab = async (collab: DemoCollab) => {
    if (liveController) {
      if (liveController.isMutating(collab.id)) return;
      setLiveActionError(null);
      liveController.clearActionError?.();
      try {
        await liveController.acceptRequest(collab.id);
        showOverview();
        setFilter("accepted");
      } catch (error) {
        setLiveActionError(caughtErrorMessage(error));
      }
      return;
    }
    const accepted: DemoCollab = {
      ...collab,
      status: "accepted",
      requestStatus: "accepted",
      acceptedState: "inProgress",
      sentState: undefined,
    };
    setDemoItems((current) => current.map((item) => item.id === collab.id ? accepted : item));
    showOverview();
    setFilter("accepted");
    onAcceptedCollab(buildCollabConversation(accepted, true), accepted);
  };

  const rejectCollab = async (collab: DemoCollab) => {
    if (liveController) {
      if (liveController.isMutating(collab.id)) return;
      setLiveActionError(null);
      liveController.clearActionError?.();
      try {
        await liveController.declineRequest(collab.id);
        showOverview();
      } catch (error) {
        setLiveActionError(caughtErrorMessage(error));
      }
      return;
    }
    setDemoItems((current) => current.filter((item) => item.id !== collab.id));
    showOverview();
  };

  const cancelCollab = async (collab: DemoCollab) => {
    if (liveController) {
      // The backend operation only cancels an outgoing pending request. An
      // accepted collaboration belongs to the future project lifecycle.
      if (collab.status !== "sent" || collab.isReceived || liveController.isMutating(collab.id)) return;
      setLiveActionError(null);
      liveController.clearActionError?.();
      try {
        await liveController.cancelRequest(collab.id);
        showOverview();
      } catch (error) {
        setLiveActionError(caughtErrorMessage(error));
      }
      return;
    }
    if (collab.status === "accepted") {
      setDemoItems((current) => current.map((item) => item.id === collab.id
        ? { ...item, acceptedState: "cancelled" as const }
        : item));
    } else {
      setDemoItems((current) => current.filter((item) => item.id !== collab.id));
      if (collab.origin === "globe") removeGlobeCollaborationRequest(collab.id);
    }
    showOverview();
  };

  const emptyCopy = filter === "received"
    ? "Aucune demande de collab reçue"
    : filter === "sent"
      ? "Aucune demande de collab envoyée"
      : "Aucune collab acceptée";

  const filterOptions: readonly [CollabFilter, string][] = [
    ["received", "Reçus"],
    ["sent", "Envoyées"],
    ["accepted", "Acceptées"],
  ];

  const filterButtons = filterOptions.map(([id, label]) => (
    <button
      key={id}
      type="button"
      className={filter === id ? "is-active" : ""}
      onClick={() => changeFilter(id)}
      aria-pressed={filter === id}
    >
      {label}<small>{countFor(id)}</small>
    </button>
  ));

  const displayedLiveError = liveActionError
    ?? liveErrorMessage(liveController?.actionError)
    ?? liveErrorMessage(liveController?.error);
  const isEmptyLiveLoading = isLive && visibleCollabs.length === 0 && liveController?.status === "loading";
  const isEmptyLiveError = isLive && visibleCollabs.length === 0 && liveController?.status === "error";

  const retryLive = async () => {
    if (!liveController?.retry) return;
    setLiveActionError(null);
    liveController.clearActionError?.();
    try {
      await liveController.retry();
    } catch (error) {
      setLiveActionError(caughtErrorMessage(error));
    }
  };

  const renderRequestCard = (detailCollab: DemoCollab, compact = false) => {
    const detailProfileStats = getCollabProfileStats(detailCollab);
    const detailIsMutating = Boolean(liveController?.isMutating(detailCollab.id));
    const detailLiveServer = (detailCollab as Partial<MessagingCollaborationViewModel>).server;
    const detailMusicalFacts = collabMusicalFacts(detailCollab).map((fact) => {
      if (fact.id === "key") return { ...fact, label: formatDetailedMusicalKey(fact.label) ?? fact.label };
      if (fact.id === "mood") return { ...fact, icon: <Moon aria-hidden="true" /> };
      return fact;
    });
    return (
            <article className={`mw-collab-request${compact ? " compact-card" : ""}`} aria-label={`Demande de collab de ${detailCollab.name}`}>
              <div className="mw-collab-request__content">
                <header>
                  {compact && !pinnedCollabId ? <button type="button" className="mw-collab-card__kind" aria-label={`Voir la demande de ${detailCollab.name}`} onClick={() => openCollab(detailCollab)}><Handshake aria-hidden="true" />{requestLabel(detailCollab)}<ChevronRight aria-hidden="true" /></button> : <span className="mw-collab-card__kind"><Handshake aria-hidden="true" />{requestLabel(detailCollab)}<ChevronRight aria-hidden="true" /></span>}
                  <span className="mw-collab-card__meta">
                    <span><Clock3 aria-hidden="true" />{formatCollabActivity(detailCollab.meta)}</span>
                    {detailCollab.attachments.length > 0 && <><i aria-hidden="true">•</i><span><Paperclip aria-hidden="true" />{detailCollab.attachments.length} fichier{detailCollab.attachments.length > 1 ? "s" : ""}</span></>}
                  </span>
                </header>
                <aside className="mw-collab-request__profile">
                  <span className="mw-collab-request__avatar"><img src={localCollabAvatar(detailCollab)} alt="" /></span>
                  <div className="mw-collab-request__identity">
                  <div className="mw-collab-request__heading">
                  <h3 id={`mw-collab-title-${detailCollab.id}`}><span>{detailCollab.name}</span></h3>
                  <span className="mw-collab-request__level"><MeewavGradeBadge className="mw-collab-request__grade" level={getCollabGradeLevel(detailCollab)} size="xs" variant="icon" /><small>Niveau {getCollabGradeLevel(detailCollab)}</small></span>
                  </div>
                  <p>{detailCollab.role}</p>
                  <div className="mw-collab-request__profile-details">
                  <dl aria-label="Statistiques du profil">
                    <div><dt><Handshake aria-hidden="true" /><strong>{detailProfileStats?.collaborations ?? "—"}</strong></dt><dd>{compact ? "collabs" : "Collaborations"}</dd></div>
                    <div><dt><AudioLines aria-hidden="true" /><strong>{detailProfileStats ? `${detailProfileStats.responseRate}%` : "—"}</strong></dt><dd>{compact ? "réponse" : "Taux de réponse"}</dd></div>
                  </dl>
                  <Link className="mw-collab-profile-link" to={profileHref(detailCollab)} state={{ from: "/messages?space=collabs" }}>{compact ? "Voir profil" : "Voir son profil"} <ChevronRight size={14} /></Link>
                  </div>
                  </div>
                </aside>
                <p className="mw-collab-request__message"><MeeWavRichText>{detailCollab.message}</MeeWavRichText></p>
                {detailMusicalFacts.length > 0 && (
                  <div className="mw-collab-card__chips" aria-label="Informations musicales">
                    {detailMusicalFacts.map((fact) => <span key={fact.id}>{fact.icon}{fact.label}</span>)}
                  </div>
                )}
                <DetailAttachmentList demo={!isLive} attachments={detailCollab.attachments} ownerName={detailCollab.name} onPreview={setPreviewAttachment} resolveAttachmentUrl={liveController?.resolveAttachmentUrl} />
              </div>

              <footer className="mw-collab-request__footer">
                {detailCollab.verified ? (
                  <span className="mw-collab-request__verified"><CheckCircle2 aria-hidden="true" />Vérifié par l'équipe</span>
                ) : null}
                {detailCollab.requestSource ? (
                  <span className="mw-collab-request__origin">
                    {detailCollab.isReceived ? "Demande reçue" : "Demande envoyée"} — via {detailCollab.requestSource === "shorts" ? SCENE_NAME : detailCollab.requestSource === "profile" ? "le Profil" : detailCollab.requestSource === "marketplace" ? "le Market" : detailCollab.requestSource === "tremplin" ? "le Tremplin" : detailCollab.requestSource === "rooms" ? "les Rooms" : detailCollab.requestSource === "messaging" ? "la Messagerie" : "le Globe"}
                  </span>
                ) : !detailCollab.verified ? (
                  <span className="mw-collab-request__origin">{isLive
                    ? `${detailCollab.isReceived ? "Demande reçue" : "Demande envoyée"} — ${detailCollab.origin === "globe" ? "via le Globe" : "via Meewav"}`
                    : detailCollab.origin === "globe" ? "Demande reçue — Via le Globe" : "Demande de démonstration"}</span>
                ) : null}
                <div className="mw-collab-request__actions">
                  {detailCollab.status === "pending" && (!isLive || Boolean(detailLiveServer?.canAccept || detailLiveServer?.canDecline)) && (
                    <>
                      {(!isLive || detailLiveServer?.canDecline) && <button type="button" className="mw-button mw-button--quiet" disabled={detailIsMutating || Boolean(detailLiveServer?.relationshipBlocked)} onClick={() => void rejectCollab(detailCollab)}>Refuser</button>}
                      {(!isLive || detailLiveServer?.canAccept) && <button type="button" className="mw-button mw-button--primary" disabled={detailIsMutating || Boolean(detailLiveServer?.relationshipBlocked)} onClick={() => void acceptCollab(detailCollab)}><Handshake size={19} /> Accepter</button>}
                    </>
                  )}
                  {detailCollab.status === "sent" && (!isLive || detailLiveServer?.canCancel) && <button type="button" className="mw-button mw-button--danger" disabled={detailIsMutating || Boolean(detailLiveServer?.relationshipBlocked)} onClick={() => void cancelCollab(detailCollab)}>Annuler la demande</button>}
                  {!isLive && detailCollab.status === "accepted" && detailCollab.acceptedState !== "cancelled" && <button type="button" className="mw-button mw-button--danger" onClick={() => void cancelCollab(detailCollab)}>Annuler la collab</button>}
                  {detailCollab.status !== "pending" && <CollabState collab={detailCollab} />}
                </div>
              </footer>
            </article>
    );
  };

  if (pinnedCollabId) {
    const pinnedCollab = items.find((collab) => collab.id === pinnedCollabId);
    return <div className="mw-collab-detail-inline is-pinned-card">
      {displayedLiveError && <span className="mw-status is-rejected" role="alert">{displayedLiveError}</span>}
      {pinnedCollab && renderRequestCard(pinnedCollab, true)}
      {previewAttachment && <AttachmentPreview attachment={previewAttachment} resolveAttachmentUrl={liveController?.resolveAttachmentUrl} onClose={() => setPreviewAttachment(null)} />}
    </div>;
  }

  return (
    <section className={`mw-hub mw-hub--collabs${detailCollab ? " has-detail" : ""}`} aria-label="Collaborations">
      {detailCollab ? (
        <section className="mw-collab-detail-workspace" aria-labelledby={`mw-collab-title-${detailCollab.id}`}>
          <div className="mw-collab-detail-inline">
            <div className="mw-collab-detail-tools">
              <button type="button" className="mw-collab-detail-back" onClick={showOverview}>
                <ArrowLeft size={16} />
                <span>Toutes les demandes</span>
              </button>
              {displayedLiveError && <span className="mw-status is-rejected" role="alert">{displayedLiveError}</span>}
            </div>
            {renderRequestCard(detailCollab)}
          </div>
        </section>
      ) : (
        <>
          <div className="mw-collab-overview-controls">
            <nav className="mw-collab-filter-chips" aria-label="Filtrer les collaborations">{filterButtons}</nav>
            {displayedLiveError && <span className="mw-status is-rejected" role="alert">{displayedLiveError}</span>}
          </div>

          <div className="mw-collabs-grid mw-collabs-request-wall">
            {visibleCollabs.map((collab) => <div key={collab.id} className="mw-collab-detail-inline is-wall-card">{renderRequestCard(collab, true)}</div>)}
          </div>

          {isEmptyLiveLoading && (
            <div className="mw-hub__empty" role="status">
              <Handshake size={54} /><strong>Chargement des collaborations…</strong>
            </div>
          )}
          {isEmptyLiveError && (
            <div className="mw-hub__empty" role="alert">
              <Handshake size={54} />
              <strong>{displayedLiveError ?? "Impossible de charger les collaborations."}</strong>
              {liveController?.retry && <button type="button" className="mw-button mw-button--primary" onClick={() => void retryLive()}>Réessayer</button>}
            </div>
          )}
          {visibleCollabs.length === 0 && !isEmptyLiveLoading && !isEmptyLiveError && <div className="mw-hub__empty"><Handshake size={54} /><strong>{emptyCopy}</strong></div>}
        </>
      )}

      {previewAttachment && <AttachmentPreview attachment={previewAttachment} resolveAttachmentUrl={liveController?.resolveAttachmentUrl} onClose={() => setPreviewAttachment(null)} />}
    </section>
  );
}

export default CollabsWorkspace;
