import { toMessagingAttachmentsError } from "./messaging.attachments.errors";
import type {
  MessagingAttachmentMediaType,
  MessagingAttachmentPurpose,
  MessagingAttachmentRole,
  MessagingAttachmentViewModel,
  MessagingCollaborationWithAttachmentsRow,
  MessagingMessageWithAttachments,
  MessagingMessageWithAttachmentsRow,
} from "./messaging.attachments.types";
import type { MessagingJson } from "./messaging.types";

const purposes = new Set<MessagingAttachmentPurpose>([
  "image", "audio", "video", "document", "voice_note", "track_stem",
]);
const mediaTypes = new Set<MessagingAttachmentMediaType>([
  "image", "audio", "video", "document",
]);
const roles = new Set<MessagingAttachmentRole>([
  "primary", "stem", "cover", "preview", "document",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadata(value: unknown): Record<string, MessagingJson> {
  return record(value) as Record<string, MessagingJson> | null ?? {};
}

export function mapMessagingAttachmentRow(
  value: unknown,
): MessagingAttachmentViewModel {
  const row = record(value);
  if (!row
    || typeof row.attachment_id !== "string"
    || typeof row.available !== "boolean"
    || typeof row.sort_order !== "number"
    || typeof row.purpose !== "string"
    || !purposes.has(row.purpose as MessagingAttachmentPurpose)
    || typeof row.media_type !== "string"
    || !mediaTypes.has(row.media_type as MessagingAttachmentMediaType)
    || typeof row.display_name !== "string"
    || typeof row.mime_type !== "string"
    || typeof row.size_bytes !== "number"
    || !Number.isFinite(row.size_bytes)) {
    throw toMessagingAttachmentsError(null, "load_failed");
  }

  const role = typeof row.role === "string" && roles.has(row.role as MessagingAttachmentRole)
    ? row.role as MessagingAttachmentRole
    : null;
  const storageBucket = nullableString(row.storage_bucket);
  const storagePath = nullableString(row.storage_path);
  const privateObject = row.available && storageBucket && storagePath
    ? { bucket: storageBucket, path: storagePath }
    : null;

  return {
    id: row.attachment_id,
    mediaFileId: nullableString(row.media_file_id),
    available: row.available && privateObject !== null,
    order: row.sort_order,
    role,
    purpose: row.purpose as MessagingAttachmentPurpose,
    mediaType: row.media_type as MessagingAttachmentMediaType,
    displayName: row.display_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationMs: nullableNumber(row.duration_ms),
    bpm: nullableNumber(row.bpm),
    musicalKey: nullableString(row.musical_key),
    label: nullableString(row.label),
    metadata: metadata(row.metadata),
    privateObject,
  };
}

export function mapMessagingAttachmentRows(value: unknown) {
  if (!Array.isArray(value)) throw toMessagingAttachmentsError(null, "load_failed");
  return value
    .map(mapMessagingAttachmentRow)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function mapMessagingMessageWithAttachments(
  row: MessagingMessageWithAttachmentsRow,
): MessagingMessageWithAttachments {
  return {
    ...row,
    attachments: mapMessagingAttachmentRows(row.attachments),
  };
}

export function mapCollaborationAttachments(
  row: MessagingCollaborationWithAttachmentsRow,
) {
  return {
    ...row,
    attachments: mapMessagingAttachmentRows(row.attachments),
  };
}
