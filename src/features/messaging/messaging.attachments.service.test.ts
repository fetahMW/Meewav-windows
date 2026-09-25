import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createMessagingAttachmentsRepository,
  validateMessagingAttachment,
} from "./messaging.attachments.service";

const CONVERSATION_ID = "73000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "74000000-0000-4000-8000-000000000001";
const MEDIA_ID = "75000000-0000-4000-8000-000000000001";
const CLIENT_ID = "76000000-0000-4000-8000-000000000001";

function clientFixture() {
  const rpc = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ upload, remove, createSignedUrl }));
  return {
    client: { rpc, storage: { from } } as unknown as SupabaseClient,
    rpc,
    upload,
    remove,
    createSignedUrl,
    from,
  };
}

function preparedRpcRow() {
  return {
    ok: true,
    idempotent: false,
    upload_id: UPLOAD_ID,
    media_file_id: MEDIA_ID,
    bucket: "messaging-attachments",
    path: `${MEDIA_ID}/original.wav`,
    status: "uploading",
    expires_at: "2026-07-18T20:00:00Z",
    max_size_bytes: 52_428_800,
  };
}

describe("messaging attachments repository", () => {
  it("prepares an exact private Storage reservation", async () => {
    const fixture = clientFixture();
    fixture.rpc.mockResolvedValue({ data: preparedRpcRow(), error: null });
    const repository = createMessagingAttachmentsRepository(fixture.client);

    const prepared = await repository.prepareUpload({
      clientUploadId: CLIENT_ID,
      conversationId: CONVERSATION_ID,
      purpose: "audio",
      displayName: "  Démo.wav  ",
      mimeType: "audio/wav; codecs=1",
      sizeBytes: 4096,
    });

    expect(fixture.rpc).toHaveBeenCalledWith("prepare_messaging_upload_v1", {
      p_client_upload_id: CLIENT_ID,
      p_purpose: "audio",
      p_display_name: "Démo.wav",
      p_mime_type: "audio/wav",
      p_size_bytes: 4096,
      p_conversation_id: CONVERSATION_ID,
      p_collaboration_recipient_profile_id: null,
    });
    expect(prepared).toMatchObject({ uploadId: UPLOAD_ID, bucket: "messaging-attachments" });
  });

  it("rejects unsupported or oversized files before any network call", () => {
    expect(() => validateMessagingAttachment({
      purpose: "document",
      mimeType: "application/zip",
      sizeBytes: 200,
      displayName: "archive.zip",
    })).toThrowError(expect.objectContaining({ code: "unsupported_attachment_type" }));
  });

  it("uploads with upsert disabled and finalizes from server metadata", async () => {
    const fixture = clientFixture();
    fixture.upload.mockResolvedValue({ data: { path: "private.wav" }, error: null });
    fixture.rpc.mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        upload_id: UPLOAD_ID,
        media_file_id: MEDIA_ID,
        status: "ready",
        mime_type: "audio/wav",
        size_bytes: 4,
        duration_ms: 1200,
      },
      error: null,
    });
    const repository = createMessagingAttachmentsRepository(fixture.client);
    const prepared = {
      ...preparedRpcRow(),
      uploadId: UPLOAD_ID,
      mediaFileId: MEDIA_ID,
      expiresAt: preparedRpcRow().expires_at,
      maxSizeBytes: preparedRpcRow().max_size_bytes,
      bucket: "messaging-attachments",
      path: "private.wav",
      status: "uploading" as const,
      idempotent: false,
      ok: true,
    };

    await repository.uploadPrepared(prepared, new Uint8Array([1, 2, 3, 4]), "audio/wav");
    const finalized = await repository.finalizeUpload({ uploadId: UPLOAD_ID, durationMs: 1200 });

    expect(fixture.upload).toHaveBeenCalledWith("private.wav", expect.any(Uint8Array), {
      cacheControl: "3600",
      contentType: "audio/wav",
      upsert: false,
    });
    expect(fixture.rpc).toHaveBeenLastCalledWith("finalize_messaging_upload_v1", {
      p_upload_id: UPLOAD_ID,
      p_duration_ms: 1200,
      p_checksum_sha256: null,
    });
    expect(finalized).toMatchObject({ status: "ready", sizeBytes: 4 });
  });

  it("marks a reservation discarded before deleting its physical object", async () => {
    const fixture = clientFixture();
    fixture.rpc.mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        upload_id: UPLOAD_ID,
        bucket: "messaging-attachments",
        path: "private.wav",
        status: "discarded",
      },
      error: null,
    });
    fixture.remove.mockResolvedValue({ data: [], error: null });
    const repository = createMessagingAttachmentsRepository(fixture.client);

    await repository.discardUpload(UPLOAD_ID);

    expect(fixture.rpc).toHaveBeenCalledBefore(fixture.remove);
    expect(fixture.remove).toHaveBeenCalledWith(["private.wav"]);
  });

  it("sends the structured manifest through the atomic v2 RPC", async () => {
    const fixture = clientFixture();
    fixture.rpc.mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        message_id: CLIENT_ID,
        sequence: 7,
        created_at: "2026-07-18T19:00:00Z",
        kind: "track_pack",
        attachment_count: 1,
      },
      error: null,
    });
    const repository = createMessagingAttachmentsRepository(fixture.client);

    await repository.sendMessage({
      conversationId: CONVERSATION_ID,
      clientMessageId: CLIENT_ID,
      kind: "track_pack",
      body: "Pistes du refrain",
      payload: { schema_version: 1 },
      attachments: [{ uploadId: UPLOAD_ID, role: "stem", bpm: 124, musicalKey: "Am" }],
    });

    expect(fixture.rpc).toHaveBeenCalledWith("send_message_v2", expect.objectContaining({
      p_kind: "track_pack",
      p_attachments: [{
        upload_id: UPLOAD_ID,
        sort_order: 0,
        role: "stem",
        bpm: 124,
        musical_key: "Am",
        metadata: {},
      }],
    }));
  });

  it("creates only a short-lived signed URL for an authorized object", async () => {
    const fixture = clientFixture();
    fixture.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.test/signed" },
      error: null,
    });
    const repository = createMessagingAttachmentsRepository(fixture.client);

    const url = await repository.createSignedAttachmentUrl({
      available: true,
      privateObject: { bucket: "messaging-attachments", path: "private.wav" },
    }, 600);

    expect(url).toBe("https://storage.test/signed");
    expect(fixture.createSignedUrl).toHaveBeenCalledWith("private.wav", 600);
  });
});
