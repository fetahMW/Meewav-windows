import type { DemoCollab } from "./messagingDemoData";
import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";

export type MessagingCollaborationScope = "received" | "sent" | "accepted";

export type MessagingCollaborationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type MessagingCollaborationDecision = "accept" | "decline";

export type MessagingCollaborationCursor = {
  sort_at: string;
  request_id: string;
};

export type MessagingCollaborationRequestRow = {
  request_id: string;
  direction: "received" | "sent";
  status: MessagingCollaborationStatus;
  message: string;
  source: string;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  conversation_id: string | null;
  viewed_at: string | null;
  is_unread: boolean;
  can_accept: boolean;
  can_decline: boolean;
  can_cancel: boolean;
  relationship_blocked: boolean;
  other_profile_id: string;
  other_username: string | null;
  other_display_name: string;
  other_avatar_url: string | null;
  other_avatar_style_key: string | null;
  other_primary_role_key: string | null;
  other_city: string | null;
  other_country_code: string | null;
  other_is_verified: boolean;
  other_grade_level: number | null;
  other_grade_code: string | null;
  other_grade_label: string | null;
  other_grade_visual_key: string | null;
  page_cursor: MessagingCollaborationCursor;
};

export type MessagingCollaborationRequestWithAttachmentsRow = MessagingCollaborationRequestRow & {
  attachments: MessagingAttachmentViewModel[];
};

export type MessagingListCollaborationsInput = {
  scope?: MessagingCollaborationScope;
  statuses?: MessagingCollaborationStatus[] | null;
  cursor?: MessagingCollaborationCursor | null;
  limit?: number;
};

export type MessagingCollaborationViewedResult = {
  ok: boolean;
  request_id: string;
  viewed_at: string;
};

export type MessagingCollaborationTransitionResult = {
  ok: boolean;
  idempotent: boolean;
  request_id: string;
  status: "accepted" | "declined" | "cancelled";
  conversation_id?: string | null;
  system_message_id?: string | null;
};

export type MessagingCollaborationViewModel = DemoCollab & {
  server: {
    direction: MessagingCollaborationRequestRow["direction"];
    status: MessagingCollaborationStatus;
    source: string;
    createdAt: string;
    updatedAt: string;
    respondedAt: string | null;
    viewedAt: string | null;
    unread: boolean;
    canAccept: boolean;
    canDecline: boolean;
    canCancel: boolean;
    relationshipBlocked: boolean;
    otherProfileId: string;
    otherUsername: string | null;
    otherAvatarStyleKey: string | null;
    otherCity: string | null;
    otherCountryCode: string | null;
    otherGradeCode: string | null;
    otherGradeLabel: string | null;
    otherGradeVisualKey: string | null;
    conversationId: string | null;
    cursor: MessagingCollaborationCursor;
  };
};
