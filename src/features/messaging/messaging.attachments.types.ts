import type {
  MessagingJson,
  MessagingReactionRow,
} from "./messaging.types";

export type MessagingAttachmentPurpose =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "voice_note"
  | "track_stem";

export type MessagingAttachmentMediaType =
  | "image"
  | "audio"
  | "video"
  | "document";

export type MessagingAttachmentRole =
  | "primary"
  | "stem"
  | "cover"
  | "preview"
  | "document";

export type MessagingStructuredMessageKind =
  | "text"
  | "brief"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "track_pack";

export type MessagingAttachmentUploadStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "attached"
  | "discarded"
  | "failed"
  | "expired";

export type MessagingAttachmentScope =
  | { conversationId: string; collaborationRecipientProfileId?: never }
  | { conversationId?: never; collaborationRecipientProfileId: string };

export type MessagingPrepareUploadInput = MessagingAttachmentScope & {
  clientUploadId: string;
  purpose: MessagingAttachmentPurpose;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
};

export type MessagingPreparedUpload = {
  ok: boolean;
  idempotent: boolean;
  uploadId: string;
  mediaFileId: string | null;
  bucket: string;
  path: string;
  status: MessagingAttachmentUploadStatus;
  expiresAt: string;
  maxSizeBytes: number;
};

export type MessagingFinalizeUploadInput = {
  uploadId: string;
  durationMs?: number | null;
  checksumSha256?: string | null;
};

export type MessagingFinalizedUpload = {
  ok: boolean;
  idempotent: boolean;
  uploadId: string;
  mediaFileId: string | null;
  status: MessagingAttachmentUploadStatus;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
};

export type MessagingDiscardedUpload = {
  ok: boolean;
  idempotent: boolean;
  uploadId: string;
  bucket: string;
  path: string;
  status: "discarded";
};

export type MessagingAttachmentManifestInput = {
  uploadId: string;
  sortOrder?: number;
  role?: MessagingAttachmentRole;
  bpm?: number | null;
  musicalKey?: string | null;
  label?: string | null;
  metadata?: Record<string, MessagingJson>;
};

export type MessagingSendStructuredInput = {
  conversationId: string;
  clientMessageId: string;
  kind: MessagingStructuredMessageKind;
  body: string;
  payload?: Record<string, MessagingJson>;
  attachments?: MessagingAttachmentManifestInput[];
  replyToMessageId?: string | null;
};

export type MessagingStructuredSendResult = {
  ok: boolean;
  idempotent: boolean;
  messageId: string;
  sequence: number;
  createdAt: string;
  kind: MessagingStructuredMessageKind;
  attachmentCount: number;
};

export type MessagingAttachCollaborationInput = {
  requestId: string;
  attachments: MessagingAttachmentManifestInput[];
  idempotencyKey: string;
};

export type MessagingAttachCollaborationResult = {
  ok: boolean;
  idempotent: boolean;
  requestId: string;
  attachmentCount: number;
};

export type MessagingSafeAttachmentRow = {
  attachment_id: string;
  media_file_id: string | null;
  available: boolean;
  sort_order: number;
  role?: MessagingAttachmentRole;
  purpose: MessagingAttachmentPurpose;
  media_type: MessagingAttachmentMediaType;
  display_name: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  bpm: number | null;
  musical_key: string | null;
  label: string | null;
  metadata: Record<string, MessagingJson>;
  storage_bucket: string | null;
  storage_path: string | null;
};

export type MessagingAttachmentViewModel = {
  id: string;
  mediaFileId: string | null;
  available: boolean;
  order: number;
  role: MessagingAttachmentRole | null;
  purpose: MessagingAttachmentPurpose;
  mediaType: MessagingAttachmentMediaType;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  bpm: number | null;
  musicalKey: string | null;
  label: string | null;
  metadata: Record<string, MessagingJson>;
  privateObject: { bucket: string; path: string } | null;
};

export type MessagingMessageWithAttachmentsRow = {
  id: string;
  conversation_id: string;
  sender_profile_id: string | null;
  client_message_id: string;
  sequence: number;
  kind: MessagingStructuredMessageKind | "system";
  body: string | null;
  payload: MessagingJson;
  reply_to_message_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_status: string;
  pinned_at?: string | null;
  pinned_by_profile_id?: string | null;
  reactions: MessagingReactionRow[] | MessagingJson;
  attachments: MessagingSafeAttachmentRow[] | MessagingJson;
  created_at: string;
  updated_at: string;
};

export type MessagingMessageWithAttachments = Omit<
  MessagingMessageWithAttachmentsRow,
  "attachments"
> & {
  attachments: MessagingAttachmentViewModel[];
};

export type MessagingListMessagesV2Input = {
  conversationId: string;
  beforeSequence?: number | null;
  limit?: number;
};

export type MessagingCollaborationWithAttachmentsRow = Record<string, unknown> & {
  request_id: string;
  attachments: MessagingSafeAttachmentRow[] | MessagingJson;
};

export type MessagingUploadBinary = Blob | ArrayBuffer | ArrayBufferView;
