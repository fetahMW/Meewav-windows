import { describe, expect, it, type Mock, vi } from "vitest";
import { submitGlobeCollaborationWithAttachments } from "./messaging.collaboration-attachments.service";
import type { MessagingAttachmentsRepository } from "./messaging.attachments.service";

function repository() {
  const prepareUpload: Mock<MessagingAttachmentsRepository["prepareUpload"]> = vi.fn(async (input) => ({
    ok: true, idempotent: false, uploadId: input.clientUploadId, mediaFileId: null,
    bucket: "messaging-private", path: `draft/${input.clientUploadId}`, status: "uploading" as const,
    expiresAt: "2999-01-01T00:00:00.000Z", maxSizeBytes: 1_000,
  }));
  return {
    prepareUpload,
    uploadPrepared: vi.fn(async () => ({ path: "draft/file" })),
    finalizeUpload: vi.fn(async (input: { uploadId: string }) => ({
      ok: true, idempotent: false, uploadId: input.uploadId, mediaFileId: "media-1",
      status: "ready" as const, mimeType: "audio/mpeg", sizeBytes: 12, durationMs: null,
    })),
    discardUpload: vi.fn(async (uploadId: string) => ({
      ok: true, idempotent: false, uploadId, bucket: "messaging-private", path: "draft/file", status: "discarded" as const,
    })),
    attachToCollaboration: vi.fn(async (input: { requestId: string; attachments: unknown[] }) => ({
      ok: true, idempotent: false, requestId: input.requestId, attachmentCount: input.attachments.length,
    })),
  };
}

describe("submitGlobeCollaborationWithAttachments", () => {
  it("uploads before request creation and links the final manifests", async () => {
    const repo = repository();
    const order: string[] = [];
    repo.prepareUpload.mockImplementation(async (input) => {
      order.push("prepare");
      return { ok: true, idempotent: false, uploadId: input.clientUploadId, mediaFileId: null, bucket: "messaging-private", path: "draft/file", status: "uploading", expiresAt: "2999-01-01T00:00:00.000Z", maxSizeBytes: 1_000 };
    });
    const result = await submitGlobeCollaborationWithAttachments({
      recipientProfileId: "10000000-0000-4000-8000-000000000002",
      files: [new File(["audio"], "demo.mp3", { type: "audio/mpeg" })],
      requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
      createRequest: async () => { order.push("request"); return { requestId: "10000000-0000-4000-8000-000000000003" }; },
      repository: repo as never,
      onProgress: ({ phase }) => order.push(phase),
    });
    expect(result.attachmentResult?.attachmentCount).toBe(1);
    expect(repo.attachToCollaboration).toHaveBeenCalledWith(expect.objectContaining({
      requestId: result.requestId,
      idempotencyKey: "10000000-0000-4000-8000-000000000099:attachments",
    }));
    expect(order.indexOf("request")).toBeGreaterThan(order.indexOf("finalizing"));
  });

  it("keeps ready uploads after request failure and reuses them on identical retry", async () => {
    const repo = repository();
    let ready = false;
    repo.prepareUpload.mockImplementation(async (input) => ({
      ok: true,
      idempotent: ready,
      uploadId: input.clientUploadId,
      mediaFileId: ready ? "media-1" : null,
      bucket: "messaging-private",
      path: `draft/${input.clientUploadId}`,
      status: ready ? "ready" as const : "uploading" as const,
      expiresAt: "2999-01-01T00:00:00.000Z",
      maxSizeBytes: 1_000,
    }));
    repo.finalizeUpload.mockImplementation(async (input) => {
      ready = true;
      return {
        ok: true,
        idempotent: false,
        uploadId: input.uploadId,
        mediaFileId: "media-1",
        status: "ready" as const,
        mimeType: "video/mp4",
        sizeBytes: 12,
        durationMs: null,
      };
    });
    const file = new File(["video"], "demo.mp4", {
      type: "video/mp4",
      lastModified: 123,
    });
    const baseInput = {
      recipientProfileId: "10000000-0000-4000-8000-000000000002",
      files: [file],
      requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
      repository: repo as never,
    };

    await expect(submitGlobeCollaborationWithAttachments({
      ...baseInput,
      createRequest: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
    expect(repo.discardUpload).not.toHaveBeenCalled();
    expect(repo.attachToCollaboration).not.toHaveBeenCalled();

    const result = await submitGlobeCollaborationWithAttachments({
      ...baseInput,
      createRequest: async () => ({
        requestId: "10000000-0000-4000-8000-000000000003",
      }),
    });

    expect(result.requestId).toBe("10000000-0000-4000-8000-000000000003");
    expect(repo.prepareUpload).toHaveBeenCalledTimes(2);
    expect(repo.prepareUpload.mock.calls[1][0].clientUploadId)
      .toBe(repo.prepareUpload.mock.calls[0][0].clientUploadId);
    expect(repo.uploadPrepared).toHaveBeenCalledTimes(1);
    expect(repo.finalizeUpload).toHaveBeenCalledTimes(1);
    expect(repo.attachToCollaboration).toHaveBeenCalledTimes(1);
  });

  it("replaces an expired ready upload deterministically and reuses the replacement on retry", async () => {
    const repo = repository();
    let replacementReady = false;
    let baseUploadId = "";
    let replacementUploadId = "";
    repo.prepareUpload.mockImplementation(async (input) => {
      if (!baseUploadId) baseUploadId = input.clientUploadId;
      if (input.clientUploadId === baseUploadId) {
        return {
          ok: true,
          idempotent: true,
          uploadId: input.clientUploadId,
          mediaFileId: "expired-media",
          bucket: "messaging-private",
          path: `draft/${input.clientUploadId}`,
          status: "ready" as const,
          expiresAt: "2000-01-01T00:00:00.000Z",
          maxSizeBytes: 1_000,
        };
      }
      replacementUploadId ||= input.clientUploadId;
      return {
        ok: true,
        idempotent: replacementReady,
        uploadId: input.clientUploadId,
        mediaFileId: replacementReady ? "replacement-media" : null,
        bucket: "messaging-private",
        path: `draft/${input.clientUploadId}`,
        status: replacementReady ? "ready" as const : "uploading" as const,
        expiresAt: "2999-01-01T00:00:00.000Z",
        maxSizeBytes: 1_000,
      };
    });
    repo.finalizeUpload.mockImplementation(async (input) => {
      replacementReady = true;
      return {
        ok: true,
        idempotent: false,
        uploadId: input.uploadId,
        mediaFileId: "replacement-media",
        status: "ready" as const,
        mimeType: "audio/mpeg",
        sizeBytes: 12,
        durationMs: null,
      };
    });
    const file = new File(["audio"], "retry.mp3", {
      type: "audio/mpeg",
      lastModified: 456,
    });
    const baseInput = {
      recipientProfileId: "10000000-0000-4000-8000-000000000002",
      files: [file],
      requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
      repository: repo as never,
    };

    await expect(submitGlobeCollaborationWithAttachments({
      ...baseInput,
      createRequest: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
    const result = await submitGlobeCollaborationWithAttachments({
      ...baseInput,
      createRequest: async () => ({
        requestId: "10000000-0000-4000-8000-000000000003",
      }),
    });

    expect(result.requestId).toBe("10000000-0000-4000-8000-000000000003");
    expect(replacementUploadId).not.toBe(baseUploadId);
    expect(repo.prepareUpload.mock.calls.map(([input]) => input.clientUploadId))
      .toEqual([baseUploadId, replacementUploadId, baseUploadId, replacementUploadId]);
    expect(repo.uploadPrepared).toHaveBeenCalledTimes(1);
    expect(repo.finalizeUpload).toHaveBeenCalledTimes(1);
    expect(repo.attachToCollaboration).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ uploadId: replacementUploadId })],
    }));
  });

  it.each(["processing", "discarded", "failed", "expired"] as const)(
    "replaces a non-resumable %s reservation",
    async (status) => {
      const repo = repository();
      repo.prepareUpload
        .mockResolvedValueOnce({
          ok: true,
          idempotent: true,
          uploadId: "10000000-0000-4000-8000-000000000010",
          mediaFileId: null,
          bucket: "messaging-private",
          path: "draft/terminal",
          status,
          expiresAt: "2999-01-01T00:00:00.000Z",
          maxSizeBytes: 1_000,
        })
        .mockImplementationOnce(async (input) => ({
          ok: true,
          idempotent: false,
          uploadId: input.clientUploadId,
          mediaFileId: null,
          bucket: "messaging-private",
          path: `draft/${input.clientUploadId}`,
          status: "uploading" as const,
          expiresAt: "2999-01-01T00:00:00.000Z",
          maxSizeBytes: 1_000,
        }));

      await submitGlobeCollaborationWithAttachments({
        recipientProfileId: "10000000-0000-4000-8000-000000000002",
        files: [new File(["audio"], `${status}.mp3`, { type: "audio/mpeg" })],
        requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
        createRequest: async () => ({
          requestId: "10000000-0000-4000-8000-000000000003",
        }),
        repository: repo as never,
      });

      expect(repo.prepareUpload).toHaveBeenCalledTimes(2);
      expect(repo.prepareUpload.mock.calls[1][0].clientUploadId)
        .not.toBe(repo.prepareUpload.mock.calls[0][0].clientUploadId);
    },
  );

  it("replaces an expired uploading reservation", async () => {
    const repo = repository();
    repo.prepareUpload
      .mockResolvedValueOnce({
        ok: true,
        idempotent: true,
        uploadId: "10000000-0000-4000-8000-000000000010",
        mediaFileId: null,
        bucket: "messaging-private",
        path: "draft/expired-uploading",
        status: "uploading",
        expiresAt: "2000-01-01T00:00:00.000Z",
        maxSizeBytes: 1_000,
      })
      .mockImplementationOnce(async (input) => ({
        ok: true,
        idempotent: false,
        uploadId: input.clientUploadId,
        mediaFileId: null,
        bucket: "messaging-private",
        path: `draft/${input.clientUploadId}`,
        status: "uploading" as const,
        expiresAt: "2999-01-01T00:00:00.000Z",
        maxSizeBytes: 1_000,
      }));

    await submitGlobeCollaborationWithAttachments({
      recipientProfileId: "10000000-0000-4000-8000-000000000002",
      files: [new File(["audio"], "expired.mp3", { type: "audio/mpeg" })],
      requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
      createRequest: async () => ({
        requestId: "10000000-0000-4000-8000-000000000003",
      }),
      repository: repo as never,
    });

    expect(repo.prepareUpload).toHaveBeenCalledTimes(2);
    expect(repo.prepareUpload.mock.calls[1][0].clientUploadId)
      .not.toBe(repo.prepareUpload.mock.calls[0][0].clientUploadId);
    expect(repo.uploadPrepared).toHaveBeenCalledTimes(1);
  });

  it("bounds replacement chaining before any upload or request creation", async () => {
    const repo = repository();
    repo.prepareUpload.mockImplementation(async (input) => ({
      ok: true,
      idempotent: true,
      uploadId: input.clientUploadId,
      mediaFileId: null,
      bucket: "messaging-private",
      path: `draft/${input.clientUploadId}`,
      status: "failed" as const,
      expiresAt: "2999-01-01T00:00:00.000Z",
      maxSizeBytes: 1_000,
    }));
    const createRequest = vi.fn(async () => ({
      requestId: "10000000-0000-4000-8000-000000000003",
    }));

    await expect(submitGlobeCollaborationWithAttachments({
      recipientProfileId: "10000000-0000-4000-8000-000000000002",
      files: [new File(["audio"], "failed.mp3", { type: "audio/mpeg" })],
      requestIdempotencyKey: "10000000-0000-4000-8000-000000000099",
      createRequest,
      repository: repo as never,
    })).rejects.toThrow("collaboration_attachment_upload_unavailable");

    expect(repo.prepareUpload).toHaveBeenCalledTimes(4);
    expect(repo.uploadPrepared).not.toHaveBeenCalled();
    expect(repo.finalizeUpload).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });
});
