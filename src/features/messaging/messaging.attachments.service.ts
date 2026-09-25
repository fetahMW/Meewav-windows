import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  mapCollaborationAttachments,
  mapMessagingMessageWithAttachments,
} from "./messaging.attachments.adapters";
import {
  MessagingAttachmentsError,
  invalidMessagingAttachmentRequest,
  toMessagingAttachmentsError,
} from "./messaging.attachments.errors";
import type {
  MessagingAttachCollaborationInput,
  MessagingAttachCollaborationResult,
  MessagingAttachmentManifestInput,
  MessagingAttachmentPurpose,
  MessagingAttachmentUploadStatus,
  MessagingCollaborationWithAttachmentsRow,
  MessagingDiscardedUpload,
  MessagingFinalizeUploadInput,
  MessagingFinalizedUpload,
  MessagingListMessagesV2Input,
  MessagingMessageWithAttachmentsRow,
  MessagingPreparedUpload,
  MessagingPrepareUploadInput,
  MessagingSendStructuredInput,
  MessagingStructuredSendResult,
  MessagingUploadBinary,
} from "./messaging.attachments.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export const MESSAGING_ATTACHMENT_MAX_BYTES: Readonly<Record<MessagingAttachmentPurpose, number>> = {
  image: 10 * 1024 * 1024,
  document: 15 * 1024 * 1024,
  voice_note: 15 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  track_stem: 50 * 1024 * 1024,
};

const mimeByPurpose: Readonly<Record<MessagingAttachmentPurpose, ReadonlySet<string>>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  document: new Set(["application/pdf"]),
  voice_note: new Set([
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a",
    "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/flac",
  ]),
  audio: new Set([
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a",
    "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/flac",
  ]),
  track_stem: new Set([
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a",
    "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/flac",
  ]),
  video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
};

type RpcObject = Record<string, unknown>;

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMessagingAttachmentRequest();
}

function assertIdempotencyKey(value: string) {
  const length = value.trim().length;
  if (length < 8 || length > 128) throw invalidMessagingAttachmentRequest();
}

function normalizeMime(value: string) {
  return value.trim().toLocaleLowerCase("en-US").split(";", 1)[0];
}

function object(data: unknown, fallback: "load_failed" | "mutation_failed" | "finalize_failed") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMessagingAttachmentsError(null, fallback);
  }
  return data as RpcObject;
}

function rows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw toMessagingAttachmentsError(null, "load_failed");
  return data as T[];
}

function stringField(row: RpcObject, key: string) {
  if (typeof row[key] !== "string") throw toMessagingAttachmentsError(null, "mutation_failed");
  return row[key] as string;
}

function numberField(row: RpcObject, key: string) {
  if (typeof row[key] !== "number" || !Number.isFinite(row[key])) {
    throw toMessagingAttachmentsError(null, "mutation_failed");
  }
  return row[key] as number;
}

function booleanField(row: RpcObject, key: string) {
  if (typeof row[key] !== "boolean") throw toMessagingAttachmentsError(null, "mutation_failed");
  return row[key] as boolean;
}

function uploadStatus(row: RpcObject): MessagingAttachmentUploadStatus {
  const value = stringField(row, "status") as MessagingAttachmentUploadStatus;
  if (!new Set<MessagingAttachmentUploadStatus>([
    "uploading", "processing", "ready", "attached", "discarded", "failed", "expired",
  ]).has(value)) throw toMessagingAttachmentsError(null, "mutation_failed");
  return value;
}

function nullableStringField(row: RpcObject, key: string) {
  return row[key] === null || row[key] === undefined ? null : stringField(row, key);
}

function nullableNumberField(row: RpcObject, key: string) {
  return row[key] === null || row[key] === undefined ? null : numberField(row, key);
}

function mapPrepared(data: unknown): MessagingPreparedUpload {
  const row = object(data, "mutation_failed");
  return {
    ok: booleanField(row, "ok"),
    idempotent: booleanField(row, "idempotent"),
    uploadId: stringField(row, "upload_id"),
    mediaFileId: nullableStringField(row, "media_file_id"),
    bucket: stringField(row, "bucket"),
    path: stringField(row, "path"),
    status: uploadStatus(row),
    expiresAt: stringField(row, "expires_at"),
    maxSizeBytes: numberField(row, "max_size_bytes"),
  };
}

function mapFinalized(data: unknown): MessagingFinalizedUpload {
  const row = object(data, "finalize_failed");
  return {
    ok: booleanField(row, "ok"),
    idempotent: booleanField(row, "idempotent"),
    uploadId: stringField(row, "upload_id"),
    mediaFileId: nullableStringField(row, "media_file_id"),
    status: uploadStatus(row),
    mimeType: stringField(row, "mime_type"),
    sizeBytes: numberField(row, "size_bytes"),
    durationMs: nullableNumberField(row, "duration_ms"),
  };
}

function mapDiscarded(data: unknown): MessagingDiscardedUpload {
  const row = object(data, "mutation_failed");
  const status = uploadStatus(row);
  if (status !== "discarded") throw toMessagingAttachmentsError(null, "discard_failed");
  return {
    ok: booleanField(row, "ok"),
    idempotent: booleanField(row, "idempotent"),
    uploadId: stringField(row, "upload_id"),
    bucket: stringField(row, "bucket"),
    path: stringField(row, "path"),
    status,
  };
}

function mapManifest(items: MessagingAttachmentManifestInput[]) {
  return items.map((item, index) => {
    assertUuid(item.uploadId);
    if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0 || item.sortOrder > 7)) {
      throw invalidMessagingAttachmentRequest();
    }
    if (item.bpm !== undefined && item.bpm !== null && (!Number.isInteger(item.bpm) || item.bpm < 20 || item.bpm > 300)) {
      throw invalidMessagingAttachmentRequest();
    }
    if (item.musicalKey && item.musicalKey.trim().length > 24) throw invalidMessagingAttachmentRequest();
    if (item.label && item.label.trim().length > 180) throw invalidMessagingAttachmentRequest();
    return {
      upload_id: item.uploadId,
      sort_order: item.sortOrder ?? index,
      ...(item.role ? { role: item.role } : {}),
      ...(item.bpm !== undefined ? { bpm: item.bpm } : {}),
      ...(item.musicalKey ? { musical_key: item.musicalKey.trim() } : {}),
      ...(item.label ? { label: item.label.trim() } : {}),
      metadata: item.metadata ?? {},
    };
  });
}

export function createMessagingAttachmentClientUploadId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export function validateMessagingAttachment(input: {
  purpose: MessagingAttachmentPurpose;
  mimeType: string;
  sizeBytes: number;
  displayName: string;
  durationMs?: number | null;
}) {
  const mimeType = normalizeMime(input.mimeType);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 180
    || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    throw invalidMessagingAttachmentRequest();
  }
  if (!mimeByPurpose[input.purpose].has(mimeType)) {
    throw new MessagingAttachmentsError("unsupported_attachment_type");
  }
  if (input.sizeBytes > MESSAGING_ATTACHMENT_MAX_BYTES[input.purpose]) {
    throw new MessagingAttachmentsError("attachment_size_limit");
  }
  if (input.purpose === "voice_note"
    && (input.durationMs == null || !Number.isInteger(input.durationMs)
      || input.durationMs < 1 || input.durationMs > 600_000)) {
    throw new MessagingAttachmentsError("voice_note_duration_limit");
  }
  return { mimeType, displayName };
}

export type MessagingAttachmentsRepository = ReturnType<typeof createMessagingAttachmentsRepository>;

export function createMessagingAttachmentsRepository(client: SupabaseClient = supabase) {
  return {
    async prepareUpload(input: MessagingPrepareUploadInput) {
      assertUuid(input.clientUploadId);
      if (input.conversationId) assertUuid(input.conversationId);
      if (input.collaborationRecipientProfileId) assertUuid(input.collaborationRecipientProfileId);
      const normalized = validateMessagingAttachment(input);
      const { data, error } = await client.rpc("prepare_messaging_upload_v1", {
        p_client_upload_id: input.clientUploadId,
        p_purpose: input.purpose,
        p_display_name: normalized.displayName,
        p_mime_type: normalized.mimeType,
        p_size_bytes: input.sizeBytes,
        p_conversation_id: input.conversationId ?? null,
        p_collaboration_recipient_profile_id: input.collaborationRecipientProfileId ?? null,
      });
      if (error) throw toMessagingAttachmentsError(error, "mutation_failed");
      return mapPrepared(data);
    },

    async uploadPrepared(
      prepared: Pick<MessagingPreparedUpload, "bucket" | "path">,
      body: MessagingUploadBinary,
      mimeType: string,
    ) {
      const { data, error } = await client.storage.from(prepared.bucket).upload(
        prepared.path,
        body,
        { cacheControl: "3600", contentType: normalizeMime(mimeType), upsert: false },
      );
      if (error) throw toMessagingAttachmentsError(error, "upload_failed");
      return { path: data.path };
    },

    async finalizeUpload(input: MessagingFinalizeUploadInput) {
      assertUuid(input.uploadId);
      if (input.checksumSha256 && !SHA256_PATTERN.test(input.checksumSha256)) {
        throw invalidMessagingAttachmentRequest();
      }
      const { data, error } = await client.rpc("finalize_messaging_upload_v1", {
        p_upload_id: input.uploadId,
        p_duration_ms: input.durationMs ?? null,
        p_checksum_sha256: input.checksumSha256?.toLocaleLowerCase("en-US") ?? null,
      });
      if (error) throw toMessagingAttachmentsError(error, "finalize_failed");
      return mapFinalized(data);
    },

    async discardUpload(uploadId: string) {
      assertUuid(uploadId);
      const { data, error } = await client.rpc("discard_messaging_upload_v1", {
        p_upload_id: uploadId,
      });
      if (error) throw toMessagingAttachmentsError(error, "discard_failed");
      const discarded = mapDiscarded(data);
      const { error: storageError } = await client.storage
        .from(discarded.bucket)
        .remove([discarded.path]);
      if (storageError) throw toMessagingAttachmentsError(storageError, "discard_failed");
      return discarded;
    },

    async sendMessage(input: MessagingSendStructuredInput) {
      assertUuid(input.conversationId);
      assertUuid(input.clientMessageId);
      if (input.replyToMessageId) assertUuid(input.replyToMessageId);
      const body = input.body.trim();
      if (!body || body.length > 4000) throw invalidMessagingAttachmentRequest();
      const attachments = mapManifest(input.attachments ?? []);
      const { data, error } = await client.rpc("send_message_v2", {
        p_conversation_id: input.conversationId,
        p_client_message_id: input.clientMessageId,
        p_kind: input.kind,
        p_body: body,
        p_payload: input.payload ?? {},
        p_attachments: attachments,
        p_reply_to_message_id: input.replyToMessageId ?? null,
      });
      if (error) throw toMessagingAttachmentsError(error, "mutation_failed");
      const row = object(data, "mutation_failed");
      return {
        ok: booleanField(row, "ok"),
        idempotent: booleanField(row, "idempotent"),
        messageId: stringField(row, "message_id"),
        sequence: numberField(row, "sequence"),
        createdAt: stringField(row, "created_at"),
        kind: stringField(row, "kind") as MessagingStructuredSendResult["kind"],
        attachmentCount: numberField(row, "attachment_count"),
      } satisfies MessagingStructuredSendResult;
    },

    async attachToCollaboration(input: MessagingAttachCollaborationInput) {
      assertUuid(input.requestId);
      assertIdempotencyKey(input.idempotencyKey);
      const { data, error } = await client.rpc("attach_collaboration_uploads_v1", {
        p_request_id: input.requestId,
        p_attachments: mapManifest(input.attachments),
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMessagingAttachmentsError(error, "mutation_failed");
      const row = object(data, "mutation_failed");
      return {
        ok: booleanField(row, "ok"),
        idempotent: booleanField(row, "idempotent"),
        requestId: stringField(row, "request_id"),
        attachmentCount: numberField(row, "attachment_count"),
      } satisfies MessagingAttachCollaborationResult;
    },

    async listMessages(input: MessagingListMessagesV2Input) {
      assertUuid(input.conversationId);
      if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
        throw invalidMessagingAttachmentRequest();
      }
      const { data, error } = await client.rpc("get_conversation_messages_v2", {
        p_conversation_id: input.conversationId,
        p_before_sequence: input.beforeSequence ?? null,
        p_limit: input.limit ?? 50,
      });
      if (error) throw toMessagingAttachmentsError(error, "load_failed");
      return rows<MessagingMessageWithAttachmentsRow>(data)
        .map(mapMessagingMessageWithAttachments);
    },

    async listCollaborations(input: {
      scope?: "received" | "sent" | "accepted";
      statuses?: string[] | null;
      cursor?: Record<string, unknown> | null;
      limit?: number;
    } = {}) {
      if (input.scope && !new Set(["received", "sent", "accepted"]).has(input.scope)) {
        throw invalidMessagingAttachmentRequest();
      }
      if (input.limit !== undefined
        && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
        throw invalidMessagingAttachmentRequest();
      }
      if (input.statuses !== undefined && input.statuses !== null
        && (input.statuses.length < 1 || input.statuses.length > 5)) {
        throw invalidMessagingAttachmentRequest();
      }
      const { data, error } = await client.rpc("list_my_collaboration_requests_v2", {
        p_scope: input.scope ?? "received",
        p_statuses: input.statuses ?? null,
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
      });
      if (error) throw toMessagingAttachmentsError(error, "load_failed");
      return rows<MessagingCollaborationWithAttachmentsRow>(data)
        .map(mapCollaborationAttachments);
    },

    async createSignedAttachmentUrl(
      attachment: { available: boolean; privateObject: { bucket: string; path: string } | null },
      expiresInSeconds = 600,
    ) {
      if (!attachment.available || !attachment.privateObject
        || !Number.isInteger(expiresInSeconds)
        || expiresInSeconds < 60 || expiresInSeconds > 3600) {
        throw invalidMessagingAttachmentRequest();
      }
      const { data, error } = await client.storage
        .from(attachment.privateObject.bucket)
        .createSignedUrl(attachment.privateObject.path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw toMessagingAttachmentsError(error, "signed_url_failed");
      }
      return data.signedUrl;
    },
  };
}

export const messagingAttachmentsRepository = createMessagingAttachmentsRepository();
