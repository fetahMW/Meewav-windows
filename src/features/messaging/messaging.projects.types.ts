import type { MessagingJson, MessagingMessageRow } from "./messaging.types";

export type MessagingProjectStatus = "in_progress" | "completed" | "archived";
export type MessagingProjectAuthorityRole = "owner" | "admin" | "contributor" | "viewer";
export type MessagingProjectTaskStatus = "todo" | "in_progress" | "done";
export type MessagingProjectInvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type MessagingProjectInvitationScope = "received" | "sent";
export type MessagingProjectInvitationDecision = "accept" | "decline";

export type MessagingProjectPermissions = {
  can_edit: boolean;
  can_invite: boolean;
  can_manage_members: boolean;
  can_manage_stems: boolean;
  can_create_tasks: boolean;
};

export type MessagingProjectCursor = {
  activity_at: string;
  project_id: string;
};

export type MessagingProjectInvitationCursor = {
  created_at: string;
  invitation_id: string;
};

export type MessagingProjectRow = MessagingProjectPermissions & {
  project_id: string;
  owner_profile_id: string | null;
  name: string;
  description: string;
  status: MessagingProjectStatus;
  genre: string | null;
  bpm: number | null;
  musical_key: string | null;
  objective: string | null;
  delivery_at: string | null;
  milestone: string | null;
  conversation_id: string;
  my_authority_role: MessagingProjectAuthorityRole;
  my_artistic_role: string | null;
  member_count: number;
  task_count: number;
  pending_task_count: number;
  unread_count: number;
  created_at: string;
  updated_at: string;
  activity_at: string;
  page_cursor: MessagingProjectCursor;
};

export type MessagingProjectMemberRow = MessagingProjectPermissions & {
  profile_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  authority_role: MessagingProjectAuthorityRole;
  artistic_role: string | null;
  joined_at: string;
};

export type MessagingProjectTaskRow = {
  task_id: string;
  title: string;
  description: string;
  assigned_profile_id: string | null;
  assigned_display_name: string | null;
  status: MessagingProjectTaskStatus;
  due_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type MessagingProjectActivityRow = {
  activity_id: number;
  event_type: string;
  actor_profile_id: string | null;
  actor_display_name: string | null;
  subject_profile_id: string | null;
  subject_id: string | null;
  payload: MessagingJson;
  created_at: string;
};

export type MessagingProjectWorkspace = {
  project_id: string;
  owner_profile_id: string | null;
  name: string;
  description: string;
  status: MessagingProjectStatus;
  genre: string | null;
  bpm: number | null;
  musical_key: string | null;
  objective: string | null;
  delivery_at: string | null;
  milestone: string | null;
  conversation_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  membership: MessagingProjectPermissions & {
    authority_role: MessagingProjectAuthorityRole;
    artistic_role: string | null;
  };
  unread_count: number;
  members: MessagingProjectMemberRow[];
  tasks: MessagingProjectTaskRow[];
  recent_activity: MessagingProjectActivityRow[];
};

export type MessagingProjectInvitationRow = {
  invitation_id: string;
  project_id: string;
  project_name: string;
  direction: MessagingProjectInvitationScope;
  status: MessagingProjectInvitationStatus;
  other_profile_id: string;
  other_username: string | null;
  other_display_name: string;
  other_avatar_url: string | null;
  proposed_authority_role: Exclude<MessagingProjectAuthorityRole, "owner">;
  proposed_artistic_role: string | null;
  proposed_can_edit: boolean;
  proposed_can_invite: boolean;
  proposed_can_manage_members: boolean;
  proposed_can_manage_stems: boolean;
  proposed_can_create_tasks: boolean;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  page_cursor: MessagingProjectInvitationCursor;
};

export type MessagingListProjectsInput = {
  cursor?: MessagingProjectCursor | null;
  limit?: number;
  statuses?: MessagingProjectStatus[];
  search?: string | null;
};

export type MessagingListProjectInvitationsInput = {
  scope?: MessagingProjectInvitationScope;
  statuses?: MessagingProjectInvitationStatus[];
  cursor?: MessagingProjectInvitationCursor | null;
  limit?: number;
};

export type MessagingCreateProjectInput = {
  name: string;
  description?: string;
  genre?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  objective?: string | null;
  deliveryAt?: string | null;
  milestone?: string | null;
  idempotencyKey: string;
};

export type MessagingUpdateProjectInput = Omit<MessagingCreateProjectInput, "idempotencyKey"> & {
  projectId: string;
  expectedUpdatedAt?: string | null;
};

export type MessagingInviteProjectMemberInput = {
  projectId: string;
  profileId: string;
  authorityRole?: Exclude<MessagingProjectAuthorityRole, "owner">;
  artisticRole?: string | null;
  permissions: MessagingProjectPermissions;
  idempotencyKey: string;
};

export type MessagingUpdateProjectMemberInput = Omit<MessagingInviteProjectMemberInput, "idempotencyKey">;

export type MessagingUpsertProjectTaskInput = {
  projectId: string;
  taskId: string;
  title: string;
  description?: string;
  assignedProfileId?: string | null;
  status?: MessagingProjectTaskStatus;
  dueAt?: string | null;
  expectedUpdatedAt?: string | null;
};

export type MessagingProjectCreateResult = {
  ok: boolean;
  idempotent: boolean;
  project_id: string;
  conversation_id: string;
};

export type MessagingProjectInvitationResult = {
  ok: boolean;
  idempotent: boolean;
  invitation_id: string;
  status: MessagingProjectInvitationStatus;
  project_id?: string;
  conversation_id?: string | null;
};

export type MessagingProjectMutationResult = {
  ok: boolean;
  project_id: string;
  idempotent?: boolean;
  updated_at?: string;
  status?: MessagingProjectStatus;
  profile_id?: string;
  task_id?: string;
  invitation_id?: string;
  authority_role?: MessagingProjectAuthorityRole;
};

export type MessagingProjectOwnershipResult = {
  ok: boolean;
  idempotent?: boolean;
  project_id: string;
  previous_owner_profile_id: string;
  owner_profile_id: string;
};

export type MessagingProjectListItem = {
  id: string;
  name: string;
  description: string;
  status: MessagingProjectStatus;
  conversationId: string;
  role: MessagingProjectAuthorityRole;
  artisticRole: string | null;
  permissions: MessagingProjectPermissions;
  members: number;
  tasks: number;
  pendingTasks: number;
  unread: number;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  deliveryAt: string | null;
  milestone: string | null;
  updatedAt: string;
};

export type MessagingProjectChatState = {
  messages: MessagingMessageRow[];
  beforeSequence: number | null;
  hasMore: boolean;
};
