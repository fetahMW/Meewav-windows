export type MessagingJson =
  | null
  | boolean
  | number
  | string
  | MessagingJson[]
  | { [key: string]: MessagingJson };

export type MessagingConversationKind = "direct" | "group" | "project";
export type MessagingMessageKind =
  | "text"
  | "system"
  | "brief"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "track_pack";
export type MessagingMemberRole = "owner" | "admin" | "member";

export type MessagingConversationCursor = {
  pinned: boolean;
  pinned_at: string | null;
  activity_at: string;
  conversation_id: string;
};

export type MessagingConversationRow = {
  collaboration_request_id?: string | null;
  conversation_id: string;
  kind: MessagingConversationKind;
  title: string | null;
  last_message_id: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_kind: string | null;
  last_message_sender_profile_id: string | null;
  unread_count: number;
  pinned_at: string | null;
  muted_until: string | null;
  archived_at: string | null;
  notifications_enabled: boolean;
  member_count: number;
  counterpart_profile_id: string | null;
  counterpart_username: string | null;
  counterpart_display_name: string | null;
  counterpart_avatar_url: string | null;
  counterpart_avatar_style_key: string | null;
  counterpart_primary_role_key: string | null;
  counterpart_is_verified: boolean | null;
  counterpart_grade_level: number | null;
  counterpart_grade_code: string | null;
  counterpart_grade_label: string | null;
  counterpart_grade_visual_key: string | null;
  page_cursor: MessagingConversationCursor;
};

export type MessagingReactionRow = {
  profile_id: string;
  emoji: string;
  created_at: string;
};

export type MessagingMessageRow = {
  id: string;
  conversation_id: string;
  sender_profile_id: string | null;
  client_message_id: string;
  sequence: number;
  kind: MessagingMessageKind;
  body: string | null;
  payload: MessagingJson;
  reply_to_message_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_status: string;
  pinned_at?: string | null;
  pinned_by_profile_id?: string | null;
  reactions: MessagingReactionRow[] | MessagingJson;
  created_at: string;
  updated_at: string;
};

export type MessagingRecognition = {
  code: string;
  label: string;
  visual_key: string;
  accent_hex: string | null;
  earned_at: string;
};

export type MessagingMemberRow = {
  profile_id: string;
  role: MessagingMemberRole;
  joined_at: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  profile_image_url: string | null;
  is_verified: boolean;
  grade_level: number | null;
  grade_code: string | null;
  grade_label: string | null;
  grade_visual_key: string | null;
  recognitions: MessagingRecognition[] | MessagingJson;
};

export type MessageableProfileRow = {
  profile_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  city: string | null;
  country_code: string | null;
  is_verified: boolean;
  grade_level: number | null;
  grade_code: string | null;
  grade_label: string | null;
  grade_visual_key: string | null;
  recognitions: MessagingRecognition[] | MessagingJson;
};

export type MessagingConversationInvitationRow = {
  conversation_id: string;
  title: string;
  inviter_profile_id: string | null;
  inviter_username: string | null;
  inviter_display_name: string;
  inviter_avatar_url: string | null;
  invited_at: string | null;
  requested_member_count: number;
};

export type MessagingConversationResult = {
  ok: boolean;
  conversation_id: string;
  kind: "direct" | "group";
  idempotent: boolean;
  invitation_count?: number;
};

export type MessagingInvitationResponse = {
  ok: boolean;
  conversation_id: string;
  accepted: boolean;
  idempotent: boolean;
};

export type MessagingSendResult = {
  ok: boolean;
  idempotent: boolean;
  message_id: string;
  sequence: number;
  created_at: string;
};

export type MessagingReadResult = {
  ok: boolean;
  conversation_id: string;
  last_read_sequence: number;
};

export type MessagingPreferencesResult = {
  ok: boolean;
  conversation_id: string;
  pinned_at: string | null;
  muted_until: string | null;
  archived_at: string | null;
  notifications_enabled: boolean;
};

export type MessagingHiddenResult = {
  ok: boolean;
  conversation_id: string;
  hidden: boolean;
  hidden_before_sequence: number | null;
};

export type MessagingLeaveResult = {
  ok: boolean;
  conversation_id: string;
  idempotent: boolean;
  transferred_owner_to: string | null;
};

export type MessagingReactionResult = {
  ok: boolean;
  message_id: string;
  emoji: string;
  active: boolean;
};

export type MessagingMessagePinResult = {
  ok: boolean;
  message_id: string;
  conversation_id: string;
  pinned: boolean;
  pinned_at: string | null;
  pinned_by_profile_id: string | null;
};

export type MessagingMessageDeleteResult = {
  ok: boolean;
  idempotent: boolean;
  message_id: string;
  conversation_id: string;
  deleted_at: string;
};

export type MessagingForwardResult = MessagingSendResult & {
  source_message_id: string;
  target_conversation_id: string;
};

export type MessagingBlockResult = {
  ok: boolean;
  blocked_profile_id: string;
  is_blocked: boolean;
};

export type MessagingReportSubject =
  | "message"
  | "conversation"
  | "collaboration"
  | "project"
  | "group"
  | "profile";

export type MessagingReportCategory =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "fraud"
  | "copyright"
  | "privacy"
  | "other";

export type MessagingReportResult = {
  ok: boolean;
  report_id: string;
  status: string;
};

export type MessagingListConversationsInput = {
  cursor?: MessagingConversationCursor | null;
  limit?: number;
  kinds?: MessagingConversationKind[];
  unreadOnly?: boolean;
  search?: string | null;
};

export type MessagingListMessagesInput = {
  conversationId: string;
  beforeSequence?: number | null;
  limit?: number;
};

export type MessagingSendTextInput = {
  conversationId: string;
  clientMessageId: string;
  body: string;
  payload?: Record<string, MessagingJson>;
  replyToMessageId?: string | null;
};

export type MessagingForwardMessageInput = {
  sourceMessageId: string;
  targetConversationId: string;
  clientMessageId: string;
};

export type MessagingPreferencesInput = {
  conversationId: string;
  pinned: boolean;
  mutedUntil?: string | null;
  archived: boolean;
  notificationsEnabled?: boolean;
};

export type MessagingInvitationViewModel = {
  conversationId: string;
  title: string;
  inviterProfileId: string | null;
  inviterName: string;
  inviterHandle: string;
  inviterAvatar: string;
  invitedAt: string | null;
  memberCount: number;
};
