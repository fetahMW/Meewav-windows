export type MessagingArtistGroupAuthorityRole = "owner" | "admin" | "member";
export type MessagingArtistGroupArtisticRole = string | null;
export type MessagingArtistGroupVisibility = "private" | "discoverable";
export type MessagingArtistGroupRosterVisibility = "visible" | "hidden";
export type MessagingArtistGroupLifecycle = "active" | "archived" | "deleted";
export type MessagingArtistGroupScope = "active" | "archived" | "all";
export type MessagingArtistGroupInvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type MessagingArtistGroupInvitationDecision = "accept" | "decline";

export type MessagingArtistGroupCursor = {
  updated_at: string;
  group_id: string;
};

export type MessagingArtistGroupFeedCursor = {
  created_at: string;
  activity_id: string;
};

export type MessagingArtistGroupInvitationCursor = {
  created_at: string;
  invitation_id: string;
};

export type MessagingArtistGroupRow = {
  group_id: string;
  name: string;
  description: string | null;
  visibility: MessagingArtistGroupVisibility;
  lifecycle_status: MessagingArtistGroupLifecycle;
  conversation_id: string;
  member_limit: number;
  active_member_count: number;
  pending_invitation_count: number;
  my_authority_role: MessagingArtistGroupAuthorityRole;
  my_artistic_role: string | null;
  my_notifications_enabled: boolean;
  my_roster_visibility: MessagingArtistGroupRosterVisibility;
  my_archived_at: string | null;
  created_at: string;
  updated_at: string;
  page_cursor: MessagingArtistGroupCursor;
};

export type MessagingArtistGroupMember = {
  profile_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  authority_role: MessagingArtistGroupAuthorityRole;
  artistic_role: string | null;
  joined_at: string;
  roster_visibility: MessagingArtistGroupRosterVisibility;
};

export type MessagingArtistGroupPendingInvitation = {
  invitation_id: string;
  invitee_profile_id: string;
  invitee_username: string | null;
  invitee_display_name: string;
  artistic_role: string | null;
  created_at: string;
  expires_at: string;
};

export type MessagingArtistGroupDetail = {
  group_id: string;
  name: string;
  description: string | null;
  visibility: MessagingArtistGroupVisibility;
  lifecycle_status: MessagingArtistGroupLifecycle;
  conversation_id: string;
  member_limit: number;
  created_at: string;
  updated_at: string;
  my_authority_role: MessagingArtistGroupAuthorityRole;
  my_artistic_role: string | null;
  my_notifications_enabled: boolean;
  my_roster_visibility: MessagingArtistGroupRosterVisibility;
  my_archived_at: string | null;
  members: MessagingArtistGroupMember[];
  pending_invitations: MessagingArtistGroupPendingInvitation[];
};

export type MessagingArtistGroupInvitationRow = {
  invitation_id: string;
  group_id: string;
  group_name: string;
  conversation_id: string;
  invited_by_profile_id: string | null;
  inviter_username: string | null;
  inviter_display_name: string;
  inviter_avatar_url: string | null;
  artistic_role: string | null;
  message: string | null;
  status: MessagingArtistGroupInvitationStatus;
  created_at: string;
  expires_at: string;
  page_cursor: MessagingArtistGroupInvitationCursor;
};

export type MessagingArtistGroupActivityRow = {
  activity_id: string;
  event_type:
    | "group_created" | "group_updated" | "group_archived" | "group_restored"
    | "group_deleted" | "member_invited" | "invitation_accepted"
    | "invitation_declined" | "invitation_cancelled" | "member_role_updated"
    | "member_preferences_updated" | "ownership_transferred" | "member_removed"
    | "member_left";
  actor_profile_id: string | null;
  actor_display_name: string;
  subject_profile_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  page_cursor: MessagingArtistGroupFeedCursor;
};

export type MessagingArtistGroupMutationResult = {
  ok: boolean;
  idempotent: boolean;
  group_id: string;
  conversation_id?: string | null;
  invitation_id?: string;
  profile_id?: string;
  owner_profile_id?: string;
  status?: string;
  lifecycle_status?: MessagingArtistGroupLifecycle;
  name?: string;
  visibility?: MessagingArtistGroupVisibility;
  authority_role?: MessagingArtistGroupAuthorityRole;
  artistic_role?: string | null;
};

export type MessagingListArtistGroupsInput = {
  scope?: MessagingArtistGroupScope;
  cursor?: MessagingArtistGroupCursor | null;
  limit?: number;
};

export type MessagingCreateArtistGroupInput = {
  name: string;
  description?: string | null;
  visibility?: MessagingArtistGroupVisibility;
  artisticRole?: string | null;
  idempotencyKey: string;
};

export type MessagingInviteArtistGroupMemberInput = {
  groupId: string;
  profileId: string;
  artisticRole?: string | null;
  message?: string | null;
  idempotencyKey: string;
};

export type MessagingArtistGroupPreferencesInput = {
  groupId: string;
  notificationsEnabled?: boolean;
  rosterVisibility?: MessagingArtistGroupRosterVisibility;
  archived?: boolean;
  idempotencyKey: string;
};

export type MessagingArtistGroupSummaryViewModel = {
  id: string;
  name: string;
  description: string;
  visibility: MessagingArtistGroupVisibility;
  lifecycle: MessagingArtistGroupLifecycle;
  conversationId: string;
  memberCount: number;
  memberLimit: number;
  pendingInvitationCount: number;
  authorityRole: MessagingArtistGroupAuthorityRole;
  artisticRole: string | null;
  notificationsEnabled: boolean;
  rosterVisibility: MessagingArtistGroupRosterVisibility;
  personallyArchived: boolean;
  updatedAt: string;
  cursor: MessagingArtistGroupCursor;
  server: MessagingArtistGroupRow;
};

export type MessagingArtistGroupInvitationViewModel = {
  id: string;
  groupId: string;
  groupName: string;
  conversationId: string;
  inviterProfileId: string | null;
  inviterName: string;
  inviterAvatar: string;
  artisticRole: string | null;
  message: string;
  expiresAt: string;
  cursor: MessagingArtistGroupInvitationCursor;
  server: MessagingArtistGroupInvitationRow;
};

export type MessagingArtistGroupActivityViewModel = {
  id: string;
  label: string;
  actorName: string;
  subjectProfileId: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
  cursor: MessagingArtistGroupFeedCursor;
  server: MessagingArtistGroupActivityRow;
};
