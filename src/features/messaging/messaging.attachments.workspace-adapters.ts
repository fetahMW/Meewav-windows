import type {
  DemoCollab,
  DemoCollabAttachment,
  DemoCollabAttachmentType,
  DemoMessage,
  DemoMessageKind,
} from "./messagingDemoData";
import type {
  MessagingAttachmentViewModel,
  MessagingMessageWithAttachments,
} from "./messaging.attachments.types";

function attachmentType(attachment: MessagingAttachmentViewModel): DemoCollabAttachmentType {
  if (attachment.mediaType === "document") return attachment.mimeType === "application/pdf" ? "pdf" : "file";
  return attachment.mediaType;
}

function messageKind(message: MessagingMessageWithAttachments): DemoMessageKind {
  if (message.kind === "track_pack") return "track-pack";
  if (message.kind === "brief") return "brief";
  if (message.kind === "image" || message.kind === "video" || message.kind === "file") return message.kind;
  if (message.kind === "audio") {
    return message.attachments[0]?.purpose === "voice_note" ? "audio" : "audio-file";
  }
  return "text";
}

export function mapServerAttachmentToCollabAttachment(
  attachment: MessagingAttachmentViewModel,
): DemoCollabAttachment {
  return {
    id: attachment.id,
    type: attachmentType(attachment),
    url: "",
    fileName: attachment.displayName,
    fileSize: attachment.sizeBytes,
    durationSeconds: attachment.durationMs === null
      ? undefined
      : Math.max(1, Math.round(attachment.durationMs / 1_000)),
    bpm: attachment.bpm ?? undefined,
    musicalKey: attachment.musicalKey ?? undefined,
    serverAttachment: attachment,
  };
}

export function withServerCollaborationAttachments<T extends DemoCollab>(
  collab: T,
  attachments: MessagingAttachmentViewModel[],
): T {
  return {
    ...collab,
    attachments: attachments.map(mapServerAttachmentToCollabAttachment),
  } as T;
}

export function mapServerMessageToDemoMessage(input: {
  message: MessagingMessageWithAttachments;
  currentProfileId: string;
  time: string;
}): DemoMessage {
  const { message, currentProfileId, time } = input;
  const first = message.attachments[0];
  return {
    id: message.id,
    sourceId: message.client_message_id,
    author: message.sender_profile_id === currentProfileId ? "me" : "them",
    kind: messageKind(message),
    body: message.deleted_at ? "Message supprimé" : message.body?.trim() || first?.displayName || "Pièce jointe",
    time,
    replyToId: message.reply_to_message_id ?? undefined,
    pinned: Boolean(message.pinned_at),
    deleted: Boolean(message.deleted_at),
    forwardedFrom: message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
      && (message.payload as Record<string, unknown>).is_forwarded === true
      ? "Message transféré"
      : undefined,
    fileName: first?.displayName,
    fileType: first ? `${first.mimeType} · ${first.sizeBytes} octets` : undefined,
    duration: first?.durationMs === null || first?.durationMs === undefined
      ? undefined
      : `${Math.floor(first.durationMs / 60_000)}:${String(Math.floor(first.durationMs / 1_000) % 60).padStart(2, "0")}`,
    bpm: first?.bpm ?? undefined,
    musicalKey: first?.musicalKey ?? undefined,
    tracks: message.kind === "track_pack"
      ? message.attachments.map((attachment) => attachment.label ?? attachment.displayName)
      : undefined,
    trackDurations: message.kind === "track_pack"
      ? message.attachments.map((attachment) => {
          const seconds = Math.floor((attachment.durationMs ?? 0) / 1_000);
          return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        })
      : undefined,
    attachments: message.attachments,
  };
}
