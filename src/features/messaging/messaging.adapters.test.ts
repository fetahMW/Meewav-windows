import { describe, expect, it } from "vitest";
import {
  mapConversationRowToViewModel,
  mapMessageRowToViewModel,
} from "./messaging.adapters";
import type { MessagingConversationRow, MessagingMessageRow } from "./messaging.types";

const PROFILE_ID = "51000000-0000-4000-8000-000000000001";

describe("messaging presentation adapters", () => {
  it("keeps the current conversation card grammar while using safe server fields", () => {
    const row: MessagingConversationRow = {
      conversation_id: "52000000-0000-4000-8000-000000000001",
      kind: "direct",
      title: null,
      last_message_id: null,
      last_message_at: null,
      last_message_body: null,
      last_message_kind: null,
      last_message_sender_profile_id: null,
      unread_count: 2,
      pinned_at: null,
      muted_until: null,
      archived_at: null,
      notifications_enabled: true,
      member_count: 2,
      counterpart_profile_id: PROFILE_ID,
      counterpart_username: "maya",
      counterpart_display_name: "Maya Chen",
      counterpart_avatar_url: null,
      counterpart_avatar_style_key: null,
      counterpart_primary_role_key: "sound_designer",
      counterpart_is_verified: true,
      counterpart_grade_level: 4,
      counterpart_grade_code: "elite",
      counterpart_grade_label: "Élite",
      counterpart_grade_visual_key: "grade-pink",
      page_cursor: {
        pinned: false,
        pinned_at: null,
        activity_at: "2026-07-18T12:00:00Z",
        conversation_id: "52000000-0000-4000-8000-000000000001",
      },
    };

    expect(mapConversationRowToViewModel(row)).toMatchObject({
      name: "Maya Chen",
      handle: "@maya",
      role: "Sound designer",
      gradeLevel: 4,
      unread: 2,
      preview: "Commence la conversation",
    });
  });

  it("aggregates reaction chips and keeps the server sequence", () => {
    const row: MessagingMessageRow = {
      id: "53000000-0000-4000-8000-000000000001",
      conversation_id: "52000000-0000-4000-8000-000000000001",
      sender_profile_id: PROFILE_ID,
      client_message_id: "54000000-0000-4000-8000-000000000001",
      sequence: 7,
      kind: "text",
      body: "Salut",
      payload: { is_forwarded: true },
      reply_to_message_id: null,
      edited_at: null,
      deleted_at: null,
      moderation_status: "visible",
      pinned_at: "2026-07-18T12:02:00Z",
      pinned_by_profile_id: PROFILE_ID,
      reactions: [
        { profile_id: PROFILE_ID, emoji: "🔥", created_at: "2026-07-18T12:00:00Z" },
        { profile_id: "51000000-0000-4000-8000-000000000002", emoji: "🔥", created_at: "2026-07-18T12:01:00Z" },
      ],
      created_at: "2026-07-18T12:00:00Z",
      updated_at: "2026-07-18T12:00:00Z",
    };

    const message = mapMessageRowToViewModel(row, PROFILE_ID);
    expect(message.author).toBe("me");
    expect(message.reactions).toEqual(["🔥 2"]);
    expect(message.pinned).toBe(true);
    expect(message.forwardedFrom).toBe("Message transféré");
    expect(message.server.sequence).toBe(7);
  });

  it("keeps a deleted direct participant as readable history without pretending it is messageable", () => {
    const row: MessagingConversationRow = {
      conversation_id: "52000000-0000-4000-8000-000000000099",
      kind: "direct",
      title: "Compte supprimé",
      last_message_id: null,
      last_message_at: null,
      last_message_body: null,
      last_message_kind: null,
      last_message_sender_profile_id: null,
      unread_count: 0,
      pinned_at: null,
      muted_until: null,
      archived_at: null,
      notifications_enabled: true,
      member_count: 1,
      counterpart_profile_id: null,
      counterpart_username: null,
      counterpart_display_name: null,
      counterpart_avatar_url: null,
      counterpart_avatar_style_key: null,
      counterpart_primary_role_key: null,
      counterpart_is_verified: null,
      counterpart_grade_level: null,
      counterpart_grade_code: null,
      counterpart_grade_label: null,
      counterpart_grade_visual_key: null,
      page_cursor: {
        pinned: false,
        pinned_at: null,
        activity_at: "2026-07-18T12:00:00Z",
        conversation_id: "52000000-0000-4000-8000-000000000099",
      },
    };

    expect(mapConversationRowToViewModel(row)).toMatchObject({
      name: "Compte supprimé",
      handle: "Compte supprimé",
      status: "Historique conservé",
      readOnlyReason: expect.stringContaining("historique"),
    });
  });
});
