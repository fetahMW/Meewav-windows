import { toMessagingProjectsError } from "./messaging.projects.errors";
import type {
  MessagingProjectActivityRow,
  MessagingProjectListItem,
  MessagingProjectMemberRow,
  MessagingProjectRow,
  MessagingProjectTaskRow,
  MessagingProjectWorkspace,
} from "./messaging.projects.types";

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function mapMessagingProjectRow(row: MessagingProjectRow): MessagingProjectListItem {
  return {
    id: row.project_id,
    name: row.name,
    description: row.description,
    status: row.status,
    conversationId: row.conversation_id,
    role: row.my_authority_role,
    artisticRole: row.my_artistic_role,
    permissions: {
      can_edit: Boolean(row.can_edit),
      can_invite: Boolean(row.can_invite),
      can_manage_members: Boolean(row.can_manage_members),
      can_manage_stems: Boolean(row.can_manage_stems),
      can_create_tasks: Boolean(row.can_create_tasks),
    },
    members: Number(row.member_count) || 0,
    tasks: Number(row.task_count) || 0,
    pendingTasks: Number(row.pending_task_count) || 0,
    unread: Number(row.unread_count) || 0,
    genre: row.genre,
    bpm: row.bpm === null ? null : Number(row.bpm),
    musicalKey: row.musical_key,
    deliveryAt: row.delivery_at,
    milestone: row.milestone,
    updatedAt: row.updated_at,
  };
}

export function parseMessagingProjectWorkspace(value: unknown): MessagingProjectWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw toMessagingProjectsError(null, "load_failed");
  }
  const candidate = value as Partial<MessagingProjectWorkspace>;
  if (
    typeof candidate.project_id !== "string"
    || typeof candidate.conversation_id !== "string"
    || typeof candidate.name !== "string"
    || !candidate.membership
  ) {
    throw toMessagingProjectsError(null, "load_failed");
  }
  return {
    ...candidate,
    unread_count: Number(candidate.unread_count) || 0,
    members: array<MessagingProjectMemberRow>(candidate.members),
    tasks: array<MessagingProjectTaskRow>(candidate.tasks),
    recent_activity: array<MessagingProjectActivityRow>(candidate.recent_activity),
  } as MessagingProjectWorkspace;
}
