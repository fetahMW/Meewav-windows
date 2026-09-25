import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  invalidMessagingRequest,
  toMessagingServiceError,
  type MessagingServiceErrorCode,
} from "./messaging.errors";
import type {
  MessageableProfileRow,
  MessagingBlockResult,
  MessagingConversationInvitationRow,
  MessagingConversationResult,
  MessagingConversationRow,
  MessagingForwardMessageInput,
  MessagingForwardResult,
  MessagingHiddenResult,
  MessagingInvitationResponse,
  MessagingLeaveResult,
  MessagingListConversationsInput,
  MessagingListMessagesInput,
  MessagingMemberRow,
  MessagingMessageDeleteResult,
  MessagingMessagePinResult,
  MessagingMessageRow,
  MessagingPreferencesInput,
  MessagingPreferencesResult,
  MessagingReactionResult,
  MessagingReadResult,
  MessagingReportCategory,
  MessagingReportResult,
  MessagingReportSubject,
  MessagingSendResult,
  MessagingSendTextInput,
} from "./messaging.types";
import { mapMessagingMessageWithAttachments } from "./messaging.attachments.adapters";
import type { MessagingMessageWithAttachmentsRow } from "./messaging.attachments.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMessagingRequest();
}

function assertIdempotencyKey(value: string) {
  const length = value.trim().length;
  if (length < 8 || length > 128) throw invalidMessagingRequest();
}

function rows<T>(data: unknown, fallbackCode: MessagingServiceErrorCode): T[] {
  if (!Array.isArray(data)) throw toMessagingServiceError(null, fallbackCode);
  return data as T[];
}

function object<T>(data: unknown, fallbackCode: MessagingServiceErrorCode): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMessagingServiceError(null, fallbackCode);
  }
  return data as T;
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export function createMessagingClientMessageId() {
  return secureUuid();
}

export function createMessagingIdempotencyKey(scope = "messaging") {
  const prefix = scope.toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
    || "messaging";
  return `${prefix}:${secureUuid()}`;
}

export type MessagingRepository = ReturnType<typeof createMessagingRepository>;

export function createMessagingRepository(client: SupabaseClient = supabase) {
  return {
    async listConversations(input: MessagingListConversationsInput = {}) {
      const { data, error } = await client.rpc("list_my_conversations_v2", {
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
        p_kinds: input.kinds ?? ["direct", "group"],
        p_unread_only: input.unreadOnly ?? false,
        p_search: input.search?.trim() || null,
      });
      if (error) throw toMessagingServiceError(error, "load_failed");
      return rows<MessagingConversationRow>(data, "load_failed");
    },

    async searchMessageableProfiles(query: string, limit = 20) {
      const normalized = query.trim();
      if (normalized.length < 2 || normalized.length > 80) throw invalidMessagingRequest();
      const { data, error } = await client.rpc("search_messageable_profiles_v1", {
        p_query: normalized,
        p_limit: limit,
      });
      if (error) throw toMessagingServiceError(error, "load_failed");
      return rows<MessageableProfileRow>(data, "load_failed");
    },

    async getOrCreateCollaborationConversation(requestId: string) {
      assertUuid(requestId);
      const { data, error } = await client.rpc("get_or_create_collaboration_conversation_v1", { p_request_id: requestId });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingConversationResult>(data, "mutation_failed");
    },

    async getOrCreateDirectConversation(otherProfileId: string, idempotencyKey: string) {
      assertUuid(otherProfileId);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("get_or_create_direct_conversation_v1", {
        p_other_profile_id: otherProfileId,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingConversationResult>(data, "mutation_failed");
    },

    async getOrCreateClassroomDirectConversation(roomId: string, studentProfileId: string, idempotencyKey: string) {
      assertUuid(roomId);
      assertUuid(studentProfileId);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("rooms_get_or_create_classe_direct_conversation_v1", {
        p_room_id: roomId,
        p_student_profile_id: studentProfileId,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingConversationResult>(data, "mutation_failed");
    },

    async createGroupConversation(title: string, memberProfileIds: string[], idempotencyKey: string) {
      const normalizedTitle = title.trim();
      if (!normalizedTitle || normalizedTitle.length > 120 || memberProfileIds.length < 1) {
        throw invalidMessagingRequest();
      }
      memberProfileIds.forEach(assertUuid);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("create_group_conversation_v1", {
        p_title: normalizedTitle,
        p_member_profile_ids: [...new Set(memberProfileIds)],
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingConversationResult>(data, "mutation_failed");
    },

    async listConversationInvitations(limit = 30) {
      const { data, error } = await client.rpc("list_my_conversation_invitations_v1", {
        p_limit: limit,
      });
      if (error) throw toMessagingServiceError(error, "load_failed");
      return rows<MessagingConversationInvitationRow>(data, "load_failed");
    },

    async respondToConversationInvitation(conversationId: string, accept: boolean) {
      assertUuid(conversationId);
      const { data, error } = await client.rpc("respond_to_conversation_invitation_v1", {
        p_conversation_id: conversationId,
        p_accept: accept,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingInvitationResponse>(data, "mutation_failed");
    },

    async listMessages(input: MessagingListMessagesInput): Promise<MessagingMessageRow[]> {
      assertUuid(input.conversationId);
      const { data, error } = await client.rpc("get_conversation_messages_v3", {
        p_conversation_id: input.conversationId,
        p_before_sequence: input.beforeSequence ?? null,
        p_limit: input.limit ?? 50,
      });
      if (error) throw toMessagingServiceError(error, "load_failed");
      return rows<MessagingMessageWithAttachmentsRow>(data, "load_failed")
        .map(mapMessagingMessageWithAttachments) as MessagingMessageRow[];
    },

    async listMembers(conversationId: string) {
      assertUuid(conversationId);
      const { data, error } = await client.rpc("get_conversation_members_v1", {
        p_conversation_id: conversationId,
      });
      if (error) throw toMessagingServiceError(error, "load_failed");
      return rows<MessagingMemberRow>(data, "load_failed");
    },

    async sendTextMessage(input: MessagingSendTextInput) {
      assertUuid(input.conversationId);
      assertUuid(input.clientMessageId);
      if (input.replyToMessageId) assertUuid(input.replyToMessageId);
      const body = input.body.trim();
      if (!body || body.length > 4_000) throw invalidMessagingRequest();
      const { data, error } = await client.rpc("send_message_v1", {
        p_conversation_id: input.conversationId,
        p_client_message_id: input.clientMessageId,
        p_kind: "text",
        p_body: body,
        p_payload: input.payload ?? {},
        p_reply_to_message_id: input.replyToMessageId ?? null,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingSendResult>(data, "mutation_failed");
    },

    async markConversationRead(conversationId: string, throughSequence?: number | null) {
      assertUuid(conversationId);
      const { data, error } = await client.rpc("mark_conversation_read_v1", {
        p_conversation_id: conversationId,
        p_through_sequence: throughSequence ?? null,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingReadResult>(data, "mutation_failed");
    },

    async setConversationPreferences(input: MessagingPreferencesInput) {
      assertUuid(input.conversationId);
      const { data, error } = await client.rpc("set_conversation_preferences_v1", {
        p_conversation_id: input.conversationId,
        p_pinned: input.pinned,
        p_muted_until: input.mutedUntil ?? null,
        p_archived: input.archived,
        p_notifications_enabled: input.notificationsEnabled ?? true,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingPreferencesResult>(data, "mutation_failed");
    },

    async setConversationHidden(conversationId: string, hidden: boolean) {
      assertUuid(conversationId);
      const { data, error } = await client.rpc("set_conversation_hidden_v1", {
        p_conversation_id: conversationId,
        p_hidden: hidden,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingHiddenResult>(data, "mutation_failed");
    },

    async leaveGroupConversation(conversationId: string) {
      assertUuid(conversationId);
      const { data, error } = await client.rpc("leave_group_conversation_v1", {
        p_conversation_id: conversationId,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingLeaveResult>(data, "mutation_failed");
    },

    async setMessageReaction(messageId: string, emoji: string, active: boolean) {
      assertUuid(messageId);
      if (!emoji.trim()) throw invalidMessagingRequest();
      const { data, error } = await client.rpc("set_message_reaction_v1", {
        p_message_id: messageId,
        p_emoji: emoji,
        p_active: active,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingReactionResult>(data, "mutation_failed");
    },

    async setMessagePinned(messageId: string, pinned: boolean) {
      assertUuid(messageId);
      const { data, error } = await client.rpc("set_message_pinned_v1", {
        p_message_id: messageId,
        p_pinned: pinned,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingMessagePinResult>(data, "mutation_failed");
    },

    async deleteMessage(messageId: string) {
      assertUuid(messageId);
      const { data, error } = await client.rpc("delete_message_v1", {
        p_message_id: messageId,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingMessageDeleteResult>(data, "mutation_failed");
    },

    async forwardMessage(input: MessagingForwardMessageInput) {
      assertUuid(input.sourceMessageId);
      assertUuid(input.targetConversationId);
      assertUuid(input.clientMessageId);
      const { data, error } = await client.rpc("forward_message_v1", {
        p_message_id: input.sourceMessageId,
        p_target_conversation_id: input.targetConversationId,
        p_client_message_id: input.clientMessageId,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingForwardResult>(data, "mutation_failed");
    },

    async setUserBlock(profileId: string, blocked: boolean, reasonCode?: string | null) {
      assertUuid(profileId);
      const { data, error } = await client.rpc("set_user_block_v1", {
        p_blocked_profile_id: profileId,
        p_is_blocked: blocked,
        p_reason_code: reasonCode?.trim() || null,
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingBlockResult>(data, "mutation_failed");
    },

    async reportContent(input: {
      subjectType: MessagingReportSubject;
      subjectId: string;
      category: MessagingReportCategory;
      comment?: string | null;
      idempotencyKey: string;
    }) {
      assertUuid(input.subjectId);
      assertIdempotencyKey(input.idempotencyKey);
      const { data, error } = await client.rpc("report_content_v1", {
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_category: input.category,
        p_comment: input.comment?.trim() || null,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMessagingServiceError(error, "mutation_failed");
      return object<MessagingReportResult>(data, "mutation_failed");
    },
  };
}

export const messagingRepository = createMessagingRepository();
