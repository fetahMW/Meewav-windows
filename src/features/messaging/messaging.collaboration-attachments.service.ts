import {
  messagingAttachmentsRepository,
  type MessagingAttachmentsRepository,
} from "./messaging.attachments.service";
import type {
  MessagingAttachmentManifestInput,
  MessagingAttachmentPurpose,
  MessagingPreparedUpload,
  MessagingAttachCollaborationResult,
} from "./messaging.attachments.types";

export type GlobeCollaborationAttachmentProgress = {
  phase: "preparing" | "uploading" | "finalizing" | "requesting" | "attaching" | "done";
  completed: number;
  total: number;
  fileName?: string;
};

export type SubmitGlobeCollaborationWithAttachmentsInput = {
  recipientProfileId: string;
  files: File[];
  requestIdempotencyKey: string;
  createRequest: () => Promise<{ requestId: string }>;
  repository?: MessagingAttachmentsRepository;
  onProgress?: (progress: GlobeCollaborationAttachmentProgress) => void;
};

function purposeForFile(file: File): MessagingAttachmentPurpose {
  const type = file.type.toLocaleLowerCase("en-US").split(";", 1)[0];
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "document";
  throw new Error("unsupported_collaboration_attachment");
}

function attachmentIdempotencyKey(requestKey: string) {
  const trimmed = requestKey.trim();
  if (trimmed.length < 8) throw new Error("invalid_collaboration_idempotency_key");
  return `${trimmed.slice(0, 116)}:attachments`;
}

async function hashedUploadId(parts: Array<string | number>) {
  if (!globalThis.crypto?.subtle) throw new Error("secure_hash_unavailable");
  const fingerprint = parts.join("\u001f");
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  )).slice(0, 16);
  // UUID v5-shaped identifier. The namespace input is already unique per
  // request; these bits only make it pass the shared UUID contract.
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function stableUploadId(requestKey: string, file: File, index: number) {
  return hashedUploadId([
    requestKey.trim(), index, file.name, file.type, file.size, file.lastModified,
  ]);
}

async function replacementUploadId(
  requestKey: string,
  file: File,
  index: number,
  previous: MessagingPreparedUpload,
  replacementIndex: number,
) {
  return hashedUploadId([
    requestKey.trim(),
    index,
    file.name,
    file.type,
    file.size,
    file.lastModified,
    "replacement",
    replacementIndex,
    previous.uploadId,
    previous.status,
    previous.expiresAt,
  ]);
}

function isReusablePreparedUpload(prepared: MessagingPreparedUpload) {
  if (prepared.status === "attached") return true;
  if (prepared.status !== "uploading" && prepared.status !== "ready") return false;
  const expiresAt = Date.parse(prepared.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

const MAX_UPLOAD_REPLACEMENTS = 3;

/**
 * Uploads private files first, creates the idempotent collaboration request,
 * then atomically links the ready uploads to that request. Deterministic upload
 * ids make network retries reuse the exact same private objects. Unlinked
 * reservations expire server-side; no local blob is reported as a server file.
 */
export async function submitGlobeCollaborationWithAttachments(
  input: SubmitGlobeCollaborationWithAttachmentsInput,
): Promise<{ requestId: string; attachmentResult: MessagingAttachCollaborationResult | null }> {
  if (input.files.length > 3) throw new Error("collaboration_attachment_count_limit");
  const repository = input.repository ?? messagingAttachmentsRepository;
  const completedUploads: Array<{ uploadId: string; manifest: MessagingAttachmentManifestInput }> = [];
  const total = input.files.length;

  for (let index = 0; index < input.files.length; index += 1) {
    const file = input.files[index];
    const purpose = purposeForFile(file);
    input.onProgress?.({ phase: "preparing", completed: index, total, fileName: file.name });
    let clientUploadId = await stableUploadId(input.requestIdempotencyKey, file, index);
    let prepared: MessagingPreparedUpload | null = null;
    let reusable = false;
    for (
      let replacementIndex = 0;
      replacementIndex <= MAX_UPLOAD_REPLACEMENTS;
      replacementIndex += 1
    ) {
      prepared = await repository.prepareUpload({
        collaborationRecipientProfileId: input.recipientProfileId,
        clientUploadId,
        purpose,
        displayName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      reusable = isReusablePreparedUpload(prepared);
      if (reusable) break;
      if (replacementIndex === MAX_UPLOAD_REPLACEMENTS) {
        throw new Error("collaboration_attachment_upload_unavailable");
      }
      clientUploadId = await replacementUploadId(
        input.requestIdempotencyKey,
        file,
        index,
        prepared,
        replacementIndex + 1,
      );
    }
    if (!prepared || !reusable) {
      throw new Error("collaboration_attachment_upload_unavailable");
    }
    if (prepared.status !== "ready" && prepared.status !== "attached") {
      let alreadyFinalized = false;
      input.onProgress?.({ phase: "uploading", completed: index, total, fileName: file.name });
      try {
        await repository.uploadPrepared(prepared, file, file.type);
      } catch (uploadError) {
        // The object may already exist because the previous response was lost.
        // Finalization is the idempotent probe; keep the upload error only when
        // Storage really has no valid object.
        try {
          await repository.finalizeUpload({ uploadId: prepared.uploadId });
          alreadyFinalized = true;
        } catch {
          throw uploadError;
        }
      }
      if (!alreadyFinalized) {
        input.onProgress?.({ phase: "finalizing", completed: index, total, fileName: file.name });
        await repository.finalizeUpload({ uploadId: prepared.uploadId });
      }
    }
    completedUploads.push({
      uploadId: prepared.uploadId,
      manifest: {
        uploadId: prepared.uploadId,
        sortOrder: index,
        role: purpose === "document" ? "document" : index === 0 ? "primary" : "preview",
        label: file.name,
      },
    });
  }

  input.onProgress?.({ phase: "requesting", completed: total, total });
  // Ready reservations deliberately survive a request failure. Their
  // deterministic upload ids let an identical retry reuse the private objects;
  // abandoned reservations are bounded by the server-side expiry policy.
  const request = await input.createRequest();
  if (completedUploads.length === 0) {
    input.onProgress?.({ phase: "done", completed: total, total });
    return { requestId: request.requestId, attachmentResult: null };
  }

  input.onProgress?.({ phase: "attaching", completed: total, total });
  const attachmentResult = await repository.attachToCollaboration({
    requestId: request.requestId,
    idempotencyKey: attachmentIdempotencyKey(input.requestIdempotencyKey),
    attachments: completedUploads.map((upload) => upload.manifest),
  });
  input.onProgress?.({ phase: "done", completed: total, total });
  return { requestId: request.requestId, attachmentResult };
}
