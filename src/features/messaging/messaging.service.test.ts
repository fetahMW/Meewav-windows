import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createMessagingRepository } from "./messaging.service";

const CONVERSATION_ID = "52000000-0000-4000-8000-000000000001";
const PROFILE_ID = "51000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "53000000-0000-4000-8000-000000000001";

describe("messaging Supabase repository", () => {
  it("uses the current p_kinds cursor contract for the inbox", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await repository.listConversations({
      limit: 20,
      kinds: ["direct", "group"],
      unreadOnly: true,
      search: " Maya ",
    });

    expect(rpc).toHaveBeenCalledWith("list_my_conversations_v2", {
      p_cursor: null,
      p_limit: 20,
      p_kinds: ["direct", "group"],
      p_unread_only: true,
      p_search: "Maya",
    });
  });

  it("sends Phase A text through the idempotent RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, message_id: MESSAGE_ID, sequence: 4, created_at: "2026-07-18T12:00:00Z" },
      error: null,
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await repository.sendTextMessage({
      conversationId: CONVERSATION_ID,
      clientMessageId: MESSAGE_ID,
      body: "  Bonjour  ",
    });

    expect(rpc).toHaveBeenCalledWith("send_message_v1", {
      p_conversation_id: CONVERSATION_ID,
      p_client_message_id: MESSAGE_ID,
      p_kind: "text",
      p_body: "Bonjour",
      p_payload: {},
      p_reply_to_message_id: null,
    });
  });

  it("passes the selected reply target to the existing send contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, message_id: MESSAGE_ID, sequence: 5, created_at: "2026-07-18T12:01:00Z" },
      error: null,
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await repository.sendTextMessage({
      conversationId: CONVERSATION_ID,
      clientMessageId: MESSAGE_ID,
      body: "Je te réponds",
      replyToMessageId: "53000000-0000-4000-8000-000000000002",
    });

    expect(rpc).toHaveBeenCalledWith("send_message_v1", expect.objectContaining({
      p_reply_to_message_id: "53000000-0000-4000-8000-000000000002",
    }));
  });

  it("loads the attachment-aware message projection", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await repository.listMessages({
      conversationId: CONVERSATION_ID,
      beforeSequence: 18,
      limit: 25,
    });

    expect(rpc).toHaveBeenCalledWith("get_conversation_messages_v3", {
      p_conversation_id: CONVERSATION_ID,
      p_before_sequence: 18,
      p_limit: 25,
    });
  });

  it("uses membership-checked RPCs for pin, delete and forward", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          ok: true,
          message_id: MESSAGE_ID,
          conversation_id: CONVERSATION_ID,
          pinned: true,
          pinned_at: "2026-07-18T12:02:00Z",
          pinned_by_profile_id: PROFILE_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          idempotent: false,
          message_id: MESSAGE_ID,
          conversation_id: CONVERSATION_ID,
          deleted_at: "2026-07-18T12:03:00Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          idempotent: false,
          message_id: "53000000-0000-4000-8000-000000000003",
          sequence: 8,
          created_at: "2026-07-18T12:04:00Z",
          source_message_id: MESSAGE_ID,
          target_conversation_id: "52000000-0000-4000-8000-000000000002",
        },
        error: null,
      });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await repository.setMessagePinned(MESSAGE_ID, true);
    await repository.deleteMessage(MESSAGE_ID);
    await repository.forwardMessage({
      sourceMessageId: MESSAGE_ID,
      targetConversationId: "52000000-0000-4000-8000-000000000002",
      clientMessageId: "54000000-0000-4000-8000-000000000003",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "set_message_pinned_v1", {
      p_message_id: MESSAGE_ID,
      p_pinned: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "delete_message_v1", {
      p_message_id: MESSAGE_ID,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "forward_message_v1", {
      p_message_id: MESSAGE_ID,
      p_target_conversation_id: "52000000-0000-4000-8000-000000000002",
      p_client_message_id: "54000000-0000-4000-8000-000000000003",
    });
  });

  it("surfaces the explicit private-attachment forwarding refusal", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "message_forward_attachments_unsupported" },
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.forwardMessage({
      sourceMessageId: MESSAGE_ID,
      targetConversationId: "52000000-0000-4000-8000-000000000002",
      clientMessageId: "54000000-0000-4000-8000-000000000003",
    })).rejects.toMatchObject({
      code: "message_forward_attachments_unsupported",
      message: expect.stringContaining("pièce jointe privée"),
    });
  });

  it("maps stable server safety errors without exposing SQL details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "blocked_relationship", details: "private SQL detail" },
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getOrCreateDirectConversation(PROFILE_ID, "message:request-0001"))
      .rejects.toMatchObject({ code: "blocked_relationship", serverCode: "42501" });
  });

  it("opens a Classe-scoped direct conversation through the host-and-seat checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, conversation_id: CONVERSATION_ID, kind: "direct", idempotent: false },
      error: null,
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);
    const roomId = "50000000-0000-4000-8000-000000000001";

    await repository.getOrCreateClassroomDirectConversation(roomId, PROFILE_ID, "classe-direct:request-0001");

    expect(rpc).toHaveBeenCalledWith("rooms_get_or_create_classe_direct_conversation_v1", {
      p_room_id: roomId,
      p_student_profile_id: PROFILE_ID,
      p_idempotency_key: "classe-direct:request-0001",
    });
  });

  it.each([
    ["classe_message_host_required", "Host"],
    ["classe_message_active_seat_required", "place active"],
  ] as const)("maps %s without exposing database details", async (serverMessage, readableMessage) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: serverMessage, details: "private SQL detail" },
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getOrCreateClassroomDirectConversation(
      "50000000-0000-4000-8000-000000000001",
      PROFILE_ID,
      "classe-direct:request-0002",
    )).rejects.toMatchObject({ code: serverMessage, message: expect.stringContaining(readableMessage) });
  });

  it("exposes a deleted conversation as a stable non-SQL error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "55000", message: "conversation_deleted", details: "internal row state" },
    });
    const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getOrCreateDirectConversation(PROFILE_ID, "message:deleted-0001"))
      .rejects.toMatchObject({
        code: "conversation_deleted",
        serverCode: "55000",
        message: "Cette conversation a été supprimée.",
      });
  });
});


it("uses only the request-scoped chat RPC and rejects malformed request IDs before any write", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true, conversation_id: CONVERSATION_ID }, error: null });
  const repository = createMessagingRepository({ rpc } as unknown as SupabaseClient);
  await expect(repository.getOrCreateCollaborationConversation("invalid")).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
  await repository.getOrCreateCollaborationConversation(PROFILE_ID);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_or_create_collaboration_conversation_v1", { p_request_id: PROFILE_ID });
});
