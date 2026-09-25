import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessagingAttachmentsError } from "./messaging.attachments.errors";
import type { MessagingAttachmentsRepository } from "./messaging.attachments.service";
import { useMessagingAttachmentsLive } from "./useMessagingAttachmentsLive";

const CONVERSATION_ID = "77000000-0000-4000-8000-000000000001";
const CLIENT_UPLOAD_ID = "78000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "79000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "7a000000-0000-4000-8000-000000000001";

function file() {
  return new File([new Uint8Array([1, 2, 3])], "demo.wav", { type: "audio/wav" });
}

function repositoryFixture(overrides: Partial<MessagingAttachmentsRepository> = {}) {
  return {
    prepareUpload: vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      uploadId: UPLOAD_ID,
      mediaFileId: MESSAGE_ID,
      bucket: "messaging-attachments",
      path: "private/demo.wav",
      status: "uploading",
      expiresAt: "2026-07-18T20:00:00Z",
      maxSizeBytes: 52_428_800,
    }),
    uploadPrepared: vi.fn().mockResolvedValue({ path: "private/demo.wav" }),
    finalizeUpload: vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      uploadId: UPLOAD_ID,
      mediaFileId: MESSAGE_ID,
      status: "ready",
      mimeType: "audio/wav",
      sizeBytes: 3,
      durationMs: null,
    }),
    discardUpload: vi.fn().mockResolvedValue({ ok: true }),
    sendMessage: vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      messageId: MESSAGE_ID,
      sequence: 1,
      createdAt: "2026-07-18T19:00:00Z",
      kind: "audio",
      attachmentCount: 1,
    }),
    ...overrides,
  } as unknown as MessagingAttachmentsRepository;
}

describe("useMessagingAttachmentsLive", () => {
  it("does not start a live upload while the connected feature is disabled", () => {
    const repository = repositoryFixture();
    const { result } = renderHook(() => useMessagingAttachmentsLive({ enabled: false, repository }));

    let id: string | null = "unexpected";
    act(() => {
      id = result.current.enqueue({
        clientUploadId: CLIENT_UPLOAD_ID,
        conversationId: CONVERSATION_ID,
        purpose: "audio",
        file: file(),
      });
    });

    expect(id).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(repository.prepareUpload).not.toHaveBeenCalled();
  });

  it("runs prepare, private upload and finalize without changing the file card", async () => {
    const repository = repositoryFixture();
    const { result } = renderHook(() => useMessagingAttachmentsLive({ enabled: true, repository }));

    act(() => {
      result.current.enqueue({
        clientUploadId: CLIENT_UPLOAD_ID,
        conversationId: CONVERSATION_ID,
        purpose: "audio",
        file: file(),
      });
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));
    expect(result.current.items[0]).toMatchObject({ progress: 1, prepared: { uploadId: UPLOAD_ID } });
    expect(repository.prepareUpload).toHaveBeenCalledTimes(1);
    expect(repository.uploadPrepared).toHaveBeenCalledTimes(1);
    expect(repository.finalizeUpload).toHaveBeenCalledTimes(1);
  });

  it("recovers an ambiguous Storage failure idempotently on retry", async () => {
    const missing = new MessagingAttachmentsError("attachment_storage_object_missing");
    const uploadPrepared = vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ path: "private/demo.wav" });
    const finalizeUpload = vi.fn()
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({
        ok: true,
        idempotent: false,
        uploadId: UPLOAD_ID,
        mediaFileId: MESSAGE_ID,
        status: "ready",
        mimeType: "audio/wav",
        sizeBytes: 3,
        durationMs: null,
      });
    const repository = repositoryFixture({ uploadPrepared, finalizeUpload });
    const { result } = renderHook(() => useMessagingAttachmentsLive({ enabled: true, repository }));

    act(() => {
      result.current.enqueue({
        clientUploadId: CLIENT_UPLOAD_ID,
        conversationId: CONVERSATION_ID,
        purpose: "audio",
        file: file(),
      });
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe("failed"));

    await act(async () => {
      await result.current.retry(CLIENT_UPLOAD_ID);
    });

    expect(result.current.items[0]?.status).toBe("ready");
    expect(repository.prepareUpload).toHaveBeenCalledTimes(1);
    expect(uploadPrepared).toHaveBeenCalledTimes(2);
    expect(finalizeUpload).toHaveBeenCalledTimes(3);
  });

  it("attaches only finalized queue items to the atomic send", async () => {
    const repository = repositoryFixture();
    const { result } = renderHook(() => useMessagingAttachmentsLive({ enabled: true, repository }));
    act(() => {
      result.current.enqueue({
        clientUploadId: CLIENT_UPLOAD_ID,
        conversationId: CONVERSATION_ID,
        purpose: "audio",
        file: file(),
      });
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));

    await act(async () => {
      await result.current.sendReadyMessage({
        conversationId: CONVERSATION_ID,
        clientMessageId: MESSAGE_ID,
        kind: "audio",
        body: "Écoute cette prise",
        attachmentItemIds: [CLIENT_UPLOAD_ID],
      });
    });

    expect(repository.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ uploadId: UPLOAD_ID, sortOrder: 0 }],
    }));
    expect(result.current.items[0]?.status).toBe("sent");
  });
});
