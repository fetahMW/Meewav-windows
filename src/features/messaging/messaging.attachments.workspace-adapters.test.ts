import { describe, expect, it } from "vitest";
import {
  mapServerAttachmentToCollabAttachment,
  mapServerMessageToDemoMessage,
} from "./messaging.attachments.workspace-adapters";
import type { MessagingAttachmentViewModel, MessagingMessageWithAttachments } from "./messaging.attachments.types";

function attachment(overrides: Partial<MessagingAttachmentViewModel> = {}): MessagingAttachmentViewModel {
  return {
    id: "attachment-1",
    mediaFileId: "media-1",
    available: true,
    order: 0,
    role: "primary",
    purpose: "audio",
    mediaType: "audio",
    displayName: "demo.wav",
    mimeType: "audio/wav",
    sizeBytes: 2_048,
    durationMs: 62_000,
    bpm: 128,
    musicalKey: "Am",
    label: "Lead",
    metadata: {},
    privateObject: { bucket: "messaging-private", path: "profile/demo.wav" },
    ...overrides,
  };
}

function message(attachments: MessagingAttachmentViewModel[]): MessagingMessageWithAttachments {
  return {
    id: "message-1",
    conversation_id: "conversation-1",
    sender_profile_id: "profile-me",
    client_message_id: "client-1",
    sequence: 1,
    kind: "audio",
    body: "Démo",
    payload: {},
    reply_to_message_id: null,
    edited_at: null,
    deleted_at: null,
    moderation_status: "visible",
    reactions: [],
    attachments,
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
  };
}

describe("messaging attachment workspace adapters", () => {
  it("keeps private storage metadata and never fabricates a public URL", () => {
    const mapped = mapServerAttachmentToCollabAttachment(attachment());
    expect(mapped.url).toBe("");
    expect(mapped.serverAttachment?.privateObject?.bucket).toBe("messaging-private");
    expect(mapped.durationSeconds).toBe(62);
  });

  it("maps voice notes and track packs to the existing renderer grammar", () => {
    const voice = mapServerMessageToDemoMessage({
      message: message([attachment({ purpose: "voice_note" })]),
      currentProfileId: "profile-me",
      time: "12:00",
    });
    expect(voice.kind).toBe("audio");
    expect(voice.attachments).toHaveLength(1);

    const trackPack = mapServerMessageToDemoMessage({
      message: { ...message([attachment({ role: "stem" }), attachment({ id: "attachment-2", role: "stem", label: "Bass" })]), kind: "track_pack" },
      currentProfileId: "profile-me",
      time: "12:00",
    });
    expect(trackPack.kind).toBe("track-pack");
    expect(trackPack.tracks).toEqual(["Lead", "Bass"]);
  });

  it("preserves pin, deletion and forwarding metadata on structured messages", () => {
    const mapped = mapServerMessageToDemoMessage({
      message: {
        ...message([]),
        payload: { is_forwarded: true },
        pinned_at: "2026-08-12T10:00:00.000Z",
        pinned_by_profile_id: "profile-me",
        deleted_at: "2026-08-12T10:01:00.000Z",
      },
      currentProfileId: "profile-me",
      time: "12:00",
    });

    expect(mapped).toMatchObject({
      pinned: true,
      deleted: true,
      forwardedFrom: "Message transféré",
      body: "Message supprimé",
    });
  });
});
