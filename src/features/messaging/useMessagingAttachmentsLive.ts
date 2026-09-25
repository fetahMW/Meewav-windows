import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessagingAttachmentsError,
  toMessagingAttachmentsError,
} from "./messaging.attachments.errors";
import {
  createMessagingAttachmentClientUploadId,
  messagingAttachmentsRepository,
  type MessagingAttachmentsRepository,
} from "./messaging.attachments.service";
import type {
  MessagingAttachmentManifestInput,
  MessagingAttachmentPurpose,
  MessagingAttachmentScope,
  MessagingFinalizedUpload,
  MessagingPreparedUpload,
  MessagingSendStructuredInput,
  MessagingStructuredSendResult,
} from "./messaging.attachments.types";

export type MessagingAttachmentQueueStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "ready"
  | "sending"
  | "sent"
  | "discarding"
  | "failed";

export type MessagingAttachmentQueueItem = {
  id: string;
  file: File;
  purpose: MessagingAttachmentPurpose;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  status: MessagingAttachmentQueueStatus;
  progress: number;
  prepared: MessagingPreparedUpload | null;
  finalized: MessagingFinalizedUpload | null;
  storageUploaded: boolean;
  error: { code: string; message: string } | null;
  conversationId: string | null;
  collaborationRecipientProfileId: string | null;
};

export type EnqueueMessagingAttachmentInput = MessagingAttachmentScope & {
  file: File;
  purpose: MessagingAttachmentPurpose;
  durationMs?: number | null;
  clientUploadId?: string;
};

export type UseMessagingAttachmentsLiveOptions = {
  enabled: boolean;
  profileId?: string | null;
  repository?: MessagingAttachmentsRepository;
};

function publicError(error: unknown, fallback: "upload_failed" | "finalize_failed" | "discard_failed" | "mutation_failed") {
  const normalized = toMessagingAttachmentsError(error, fallback);
  return { code: normalized.code, message: normalized.message };
}

export function useMessagingAttachmentsLive({
  enabled,
  profileId = null,
  repository = messagingAttachmentsRepository,
}: UseMessagingAttachmentsLiveOptions) {
  const [items, setItems] = useState<MessagingAttachmentQueueItem[]>([]);
  const itemsRef = useRef(items);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef(new Map<string, Promise<boolean>>());
  const profileIdRef = useRef(profileId);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Files only live in this hook. Dropping the ref releases their memory;
      // prepared server reservations expire independently after one hour.
      itemsRef.current = [];
    };
  }, []);

  const replaceItems = useCallback((
    update: (current: MessagingAttachmentQueueItem[]) => MessagingAttachmentQueueItem[],
  ) => {
    if (!mountedRef.current) return;
    setItems((current) => {
      const next = update(current);
      itemsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (profileIdRef.current === profileId) return;
    profileIdRef.current = profileId;
    inFlightRef.current.clear();
    replaceItems(() => []);
  }, [profileId, replaceItems]);

  const patchItem = useCallback((
    id: string,
    patch: Partial<MessagingAttachmentQueueItem>,
  ) => {
    replaceItems((current) => current.map((item) => item.id === id
      ? { ...item, ...patch }
      : item));
  }, [replaceItems]);

  const process = useCallback((id: string, retry = false) => {
    const existing = inFlightRef.current.get(id);
    if (existing) return existing;

    const operation = (async () => {
      if (!enabledRef.current) return false;
      let item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item || (item.status !== "queued" && item.status !== "failed")) return false;
      let failureFallback: "upload_failed" | "finalize_failed" = "upload_failed";

      try {
        let prepared = item.prepared;
        if (!prepared) {
          patchItem(id, { status: "preparing", progress: 0.08, error: null });
          prepared = await repository.prepareUpload({
            clientUploadId: item.id,
            purpose: item.purpose,
            displayName: item.displayName,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
            ...(item.conversationId
              ? { conversationId: item.conversationId }
              : { collaborationRecipientProfileId: item.collaborationRecipientProfileId! }),
          });
          patchItem(id, {
            prepared,
            storageUploaded: prepared.status === "ready" || prepared.status === "attached",
            progress: 0.2,
          });
        }

        item = itemsRef.current.find((candidate) => candidate.id === id) ?? item;
        if (prepared.status === "ready" || prepared.status === "attached") {
          item = { ...item, storageUploaded: true };
        }
        let finalized: MessagingFinalizedUpload | null = null;

        // If the first response was lost after Storage accepted the object,
        // retry finalization before issuing a second upsert=false upload.
        if (retry && !item.storageUploaded) {
          failureFallback = "finalize_failed";
          patchItem(id, { status: "finalizing", progress: 0.76, error: null });
          try {
            finalized = await repository.finalizeUpload({
              uploadId: prepared.uploadId,
              durationMs: item.durationMs,
            });
          } catch (error) {
            const normalized = toMessagingAttachmentsError(error, "finalize_failed");
            if (normalized.code !== "attachment_storage_object_missing") throw normalized;
          }
        }

        if (!finalized && !item.storageUploaded) {
          failureFallback = "upload_failed";
          patchItem(id, { status: "uploading", progress: 0.3, error: null });
          try {
            await repository.uploadPrepared(prepared, item.file, item.mimeType);
            patchItem(id, { storageUploaded: true, progress: 0.74 });
          } catch (uploadError) {
            // A timeout can hide a successful Storage write. One finalization
            // probe makes the retry idempotent without ever enabling upsert.
            try {
              finalized = await repository.finalizeUpload({
                uploadId: prepared.uploadId,
                durationMs: item.durationMs,
              });
            } catch (finalizeError) {
              const normalized = toMessagingAttachmentsError(finalizeError, "finalize_failed");
              if (normalized.code === "attachment_storage_object_missing") throw uploadError;
              throw normalized;
            }
          }
        }

        if (!finalized) {
          failureFallback = "finalize_failed";
          patchItem(id, { status: "finalizing", progress: 0.8, error: null });
          finalized = await repository.finalizeUpload({
            uploadId: prepared.uploadId,
            durationMs: item.durationMs,
          });
        }

        patchItem(id, {
          prepared,
          finalized,
          storageUploaded: true,
          status: "ready",
          progress: 1,
          error: null,
        });
        return true;
      } catch (error) {
        patchItem(id, {
          status: "failed",
          error: publicError(error, failureFallback),
        });
        return false;
      } finally {
        inFlightRef.current.delete(id);
      }
    })();

    inFlightRef.current.set(id, operation);
    return operation;
  }, [patchItem, repository]);

  const enqueue = useCallback((input: EnqueueMessagingAttachmentInput) => {
    if (!enabledRef.current) return null;
    const id = input.clientUploadId ?? createMessagingAttachmentClientUploadId();
    if (itemsRef.current.some((item) => item.id === id)) return id;
    const item: MessagingAttachmentQueueItem = {
      id,
      file: input.file,
      purpose: input.purpose,
      displayName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      durationMs: input.durationMs ?? null,
      status: "queued",
      progress: 0,
      prepared: null,
      finalized: null,
      storageUploaded: false,
      error: null,
      conversationId: input.conversationId ?? null,
      collaborationRecipientProfileId: input.collaborationRecipientProfileId ?? null,
    };
    itemsRef.current = [...itemsRef.current, item];
    setItems(itemsRef.current);
    void process(id);
    return id;
  }, [process]);

  const retry = useCallback((id: string) => process(id, true), [process]);

  const discard = useCallback(async (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || inFlightRef.current.has(id)
      || item.status === "sending" || item.status === "sent") return false;
    patchItem(id, { status: "discarding", error: null });
    try {
      if (item.prepared) await repository.discardUpload(item.prepared.uploadId);
      replaceItems((current) => current.filter((candidate) => candidate.id !== id));
      return true;
    } catch (error) {
      patchItem(id, { status: "failed", error: publicError(error, "discard_failed") });
      return false;
    }
  }, [patchItem, replaceItems, repository]);

  const sendReadyMessage = useCallback(async (
    input: Omit<MessagingSendStructuredInput, "attachments"> & {
      attachmentItemIds: string[];
      attachmentDetails?: Record<string, Omit<MessagingAttachmentManifestInput, "uploadId">>;
    },
  ): Promise<MessagingStructuredSendResult | null> => {
    const selected = input.attachmentItemIds.map((id) => (
      itemsRef.current.find((item) => item.id === id)
    ));
    if (selected.some((item) => !item || item.status !== "ready" || !item.prepared
      || item.conversationId !== input.conversationId)) {
      return null;
    }
    const ready = selected as MessagingAttachmentQueueItem[];
    ready.forEach((item) => patchItem(item.id, { status: "sending", error: null }));
    try {
      const result = await repository.sendMessage({
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        kind: input.kind,
        body: input.body,
        payload: input.payload,
        replyToMessageId: input.replyToMessageId,
        attachments: ready.map((item, index) => ({
          uploadId: item.prepared!.uploadId,
          sortOrder: index,
          ...(input.attachmentDetails?.[item.id] ?? {}),
        })),
      });
      ready.forEach((item) => patchItem(item.id, { status: "sent", progress: 1 }));
      return result;
    } catch (error) {
      const userFacing = publicError(error, "mutation_failed");
      ready.forEach((item) => patchItem(item.id, { status: "ready", error: userFacing }));
      return null;
    }
  }, [patchItem, repository]);

  const clearSent = useCallback(() => {
    replaceItems((current) => current.filter((item) => item.status !== "sent"));
  }, [replaceItems]);

  return {
    items,
    enqueue,
    retry,
    discard,
    sendReadyMessage,
    clearSent,
    pendingCount: items.filter((item) => !new Set(["ready", "sent", "failed"]).has(item.status)).length,
    readyCount: items.filter((item) => item.status === "ready").length,
    hasErrors: items.some((item) => item.status === "failed"),
  };
}

export function isRetryableMessagingAttachmentError(error: unknown) {
  const normalized = error instanceof MessagingAttachmentsError
    ? error
    : toMessagingAttachmentsError(error, "unknown");
  return !new Set([
    "invalid_request",
    "unsupported_attachment_type",
    "attachment_size_limit",
    "attachment_mime_mismatch",
    "attachment_size_mismatch",
    "attachment_kind_mismatch",
    "attachment_role_mismatch",
    "blocked_relationship",
    "not_a_conversation_member",
  ]).has(normalized.code);
}
