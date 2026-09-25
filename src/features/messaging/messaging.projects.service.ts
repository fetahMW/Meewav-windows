import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { parseMessagingProjectWorkspace } from "./messaging.projects.adapters";
import {
  invalidMessagingProjectsRequest,
  toMessagingProjectsError,
} from "./messaging.projects.errors";
import type {
  MessagingCreateProjectInput,
  MessagingInviteProjectMemberInput,
  MessagingListProjectInvitationsInput,
  MessagingListProjectsInput,
  MessagingProjectCreateResult,
  MessagingProjectInvitationDecision,
  MessagingProjectInvitationResult,
  MessagingProjectInvitationRow,
  MessagingProjectMutationResult,
  MessagingProjectOwnershipResult,
  MessagingProjectRow,
  MessagingProjectStatus,
  MessagingProjectWorkspace,
  MessagingUpdateProjectInput,
  MessagingUpdateProjectMemberInput,
  MessagingUpsertProjectTaskInput,
} from "./messaging.projects.types";
import type { MessagingMessageRow, MessagingSendResult } from "./messaging.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_STATUSES = new Set<MessagingProjectStatus>(["in_progress", "completed", "archived"]);
const PROJECT_INVITATION_STATUSES = new Set(["pending", "accepted", "declined", "cancelled", "expired"]);
const PROJECT_MEMBER_ROLES = new Set(["admin", "contributor", "viewer"]);
const PROJECT_TASK_STATUSES = new Set(["todo", "in_progress", "done"]);

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMessagingProjectsRequest();
}

function assertOptionalDate(value: string | null | undefined) {
  if (value !== null && value !== undefined && (!value || Number.isNaN(new Date(value).getTime()))) {
    throw invalidMessagingProjectsRequest();
  }
}

function assertKey(value: string) {
  if (value.trim().length < 8 || value.trim().length > 128) throw invalidMessagingProjectsRequest();
}

function assertProjectFields(input: MessagingCreateProjectInput | MessagingUpdateProjectInput) {
  const name = input.name.trim();
  if (!name || name.length > 120 || (input.description?.trim().length ?? 0) > 4_000) {
    throw invalidMessagingProjectsRequest();
  }
  if (
    (input.genre?.trim().length ?? 0) > 80
    || (input.musicalKey?.trim().length ?? 0) > 32
    || (input.objective?.trim().length ?? 0) > 2_000
    || (input.milestone?.trim().length ?? 0) > 240
  ) throw invalidMessagingProjectsRequest();
  if (input.bpm !== undefined && input.bpm !== null && (!Number.isInteger(input.bpm) || input.bpm < 20 || input.bpm > 400)) {
    throw invalidMessagingProjectsRequest();
  }
  assertOptionalDate(input.deliveryAt);
}

function rows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw toMessagingProjectsError(null, "load_failed");
  return value as T[];
}

function object<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw toMessagingProjectsError(null, "mutation_failed");
  }
  return value as T;
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("secure_random_uuid_unavailable");
  return globalThis.crypto.randomUUID();
}

export function createMessagingProjectIdempotencyKey(scope = "project") {
  const prefix = scope.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "project";
  return `${prefix}:${secureUuid()}`;
}

export function createMessagingProjectTaskId() {
  return secureUuid();
}

export function createMessagingProjectMessageId() {
  return secureUuid();
}

export type MessagingProjectsRepository = ReturnType<typeof createMessagingProjectsRepository>;

export function createMessagingProjectsRepository(client: SupabaseClient = supabase) {
  return {
    async listProjects(input: MessagingListProjectsInput = {}) {
      if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
        throw invalidMessagingProjectsRequest();
      }
      if (input.statuses?.some((status) => !PROJECT_STATUSES.has(status))) throw invalidMessagingProjectsRequest();
      if ((input.search?.trim().length ?? 0) > 120) throw invalidMessagingProjectsRequest();
      if (input.cursor) {
        assertUuid(input.cursor.project_id);
        assertOptionalDate(input.cursor.activity_at);
      }
      const { data, error } = await client.rpc("list_my_creative_projects_v1", {
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
        p_statuses: input.statuses ?? ["in_progress", "completed", "archived"],
        p_search: input.search?.trim() || null,
      });
      if (error) throw toMessagingProjectsError(error, "load_failed");
      return rows<MessagingProjectRow>(data);
    },

    async getProject(projectId: string): Promise<MessagingProjectWorkspace> {
      assertUuid(projectId);
      const { data, error } = await client.rpc("get_creative_project_workspace_v1", {
        p_project_id: projectId,
      });
      if (error) throw toMessagingProjectsError(error, "load_failed");
      return parseMessagingProjectWorkspace(data);
    },

    async listInvitations(input: MessagingListProjectInvitationsInput = {}) {
      if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
        throw invalidMessagingProjectsRequest();
      }
      if (input.scope !== undefined && input.scope !== "received" && input.scope !== "sent") {
        throw invalidMessagingProjectsRequest();
      }
      if (input.statuses?.some((status) => !PROJECT_INVITATION_STATUSES.has(status))) {
        throw invalidMessagingProjectsRequest();
      }
      if (input.cursor) {
        assertUuid(input.cursor.invitation_id);
        assertOptionalDate(input.cursor.created_at);
      }
      const { data, error } = await client.rpc("list_my_creative_project_invitations_v1", {
        p_scope: input.scope ?? "received",
        p_statuses: input.statuses ?? ["pending"],
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
      });
      if (error) throw toMessagingProjectsError(error, "load_failed");
      return rows<MessagingProjectInvitationRow>(data);
    },

    async createProject(input: MessagingCreateProjectInput) {
      assertProjectFields(input);
      assertKey(input.idempotencyKey);
      const { data, error } = await client.rpc("create_creative_project_v1", {
        p_name: input.name.trim(),
        p_description: input.description?.trim() ?? "",
        p_genre: input.genre?.trim() || null,
        p_bpm: input.bpm ?? null,
        p_musical_key: input.musicalKey?.trim() || null,
        p_objective: input.objective?.trim() || null,
        p_delivery_at: input.deliveryAt ?? null,
        p_milestone: input.milestone?.trim() || null,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectCreateResult>(data);
    },

    async updateProject(input: MessagingUpdateProjectInput) {
      assertUuid(input.projectId);
      assertProjectFields(input);
      assertOptionalDate(input.expectedUpdatedAt);
      const { data, error } = await client.rpc("update_creative_project_v1", {
        p_project_id: input.projectId,
        p_name: input.name.trim(),
        p_description: input.description?.trim() ?? "",
        p_genre: input.genre?.trim() || null,
        p_bpm: input.bpm ?? null,
        p_musical_key: input.musicalKey?.trim() || null,
        p_objective: input.objective?.trim() || null,
        p_delivery_at: input.deliveryAt ?? null,
        p_milestone: input.milestone?.trim() || null,
        p_expected_updated_at: input.expectedUpdatedAt ?? null,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async inviteMember(input: MessagingInviteProjectMemberInput) {
      assertUuid(input.projectId);
      assertUuid(input.profileId);
      assertKey(input.idempotencyKey);
      const role = input.authorityRole ?? "contributor";
      if (!PROJECT_MEMBER_ROLES.has(role) || (input.artisticRole?.trim().length ?? 0) > 80) {
        throw invalidMessagingProjectsRequest();
      }
      if (role === "viewer" && Object.values(input.permissions).some(Boolean)) {
        throw invalidMessagingProjectsRequest();
      }
      const { data, error } = await client.rpc("invite_creative_project_member_v1", {
        p_project_id: input.projectId,
        p_invited_profile_id: input.profileId,
        p_authority_role: role,
        p_artistic_role: input.artisticRole?.trim() || null,
        p_can_edit: input.permissions.can_edit,
        p_can_invite: input.permissions.can_invite,
        p_can_manage_members: input.permissions.can_manage_members,
        p_can_manage_stems: input.permissions.can_manage_stems,
        p_can_create_tasks: input.permissions.can_create_tasks,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectInvitationResult>(data);
    },

    async respondToInvitation(invitationId: string, decision: MessagingProjectInvitationDecision, idempotencyKey: string) {
      assertUuid(invitationId);
      assertKey(idempotencyKey);
      if (decision !== "accept" && decision !== "decline") throw invalidMessagingProjectsRequest();
      const { data, error } = await client.rpc("respond_to_creative_project_invitation_v1", {
        p_invitation_id: invitationId,
        p_decision: decision,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectInvitationResult>(data);
    },

    async cancelInvitation(invitationId: string) {
      assertUuid(invitationId);
      const { data, error } = await client.rpc("cancel_creative_project_invitation_v1", {
        p_invitation_id: invitationId,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectInvitationResult>(data);
    },

    async updateMember(input: MessagingUpdateProjectMemberInput) {
      assertUuid(input.projectId);
      assertUuid(input.profileId);
      const role = input.authorityRole ?? "contributor";
      if (!PROJECT_MEMBER_ROLES.has(role) || (input.artisticRole?.trim().length ?? 0) > 80) {
        throw invalidMessagingProjectsRequest();
      }
      if (role === "viewer" && Object.values(input.permissions).some(Boolean)) {
        throw invalidMessagingProjectsRequest();
      }
      const { data, error } = await client.rpc("update_creative_project_member_v1", {
        p_project_id: input.projectId,
        p_member_profile_id: input.profileId,
        p_authority_role: role,
        p_artistic_role: input.artisticRole?.trim() || null,
        p_can_edit: input.permissions.can_edit,
        p_can_invite: input.permissions.can_invite,
        p_can_manage_members: input.permissions.can_manage_members,
        p_can_manage_stems: input.permissions.can_manage_stems,
        p_can_create_tasks: input.permissions.can_create_tasks,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async transferOwnership(projectId: string, successorProfileId: string) {
      assertUuid(projectId);
      assertUuid(successorProfileId);
      const { data, error } = await client.rpc("transfer_creative_project_ownership_v1", {
        p_project_id: projectId,
        p_successor_profile_id: successorProfileId,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectOwnershipResult>(data);
    },

    async removeOrLeave(projectId: string, profileId?: string | null) {
      assertUuid(projectId);
      if (profileId) assertUuid(profileId);
      const { data, error } = await client.rpc("remove_or_leave_creative_project_v1", {
        p_project_id: projectId,
        p_member_profile_id: profileId ?? null,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async upsertTask(input: MessagingUpsertProjectTaskInput) {
      assertUuid(input.projectId);
      if (input.taskId) assertUuid(input.taskId);
      if (input.assignedProfileId) assertUuid(input.assignedProfileId);
      if (!input.title.trim() || input.title.trim().length > 200) throw invalidMessagingProjectsRequest();
      if ((input.description?.trim().length ?? 0) > 4_000 || !PROJECT_TASK_STATUSES.has(input.status ?? "todo")) {
        throw invalidMessagingProjectsRequest();
      }
      assertOptionalDate(input.dueAt);
      assertOptionalDate(input.expectedUpdatedAt);
      const { data, error } = await client.rpc("upsert_creative_project_task_v1", {
        p_project_id: input.projectId,
        p_task_id: input.taskId ?? null,
        p_title: input.title.trim(),
        p_description: input.description?.trim() ?? "",
        p_assigned_profile_id: input.assignedProfileId ?? null,
        p_status: input.status ?? "todo",
        p_due_at: input.dueAt ?? null,
        p_expected_updated_at: input.expectedUpdatedAt ?? null,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async deleteTask(projectId: string, taskId: string) {
      assertUuid(projectId);
      assertUuid(taskId);
      const { data, error } = await client.rpc("delete_creative_project_task_v1", {
        p_project_id: projectId,
        p_task_id: taskId,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async setStatus(projectId: string, status: MessagingProjectStatus, expectedUpdatedAt?: string | null) {
      assertUuid(projectId);
      if (!PROJECT_STATUSES.has(status)) throw invalidMessagingProjectsRequest();
      assertOptionalDate(expectedUpdatedAt);
      const { data, error } = await client.rpc("set_creative_project_status_v1", {
        p_project_id: projectId,
        p_status: status,
        p_expected_updated_at: expectedUpdatedAt ?? null,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async deleteProject(projectId: string) {
      assertUuid(projectId);
      const { data, error } = await client.rpc("delete_creative_project_v1", {
        p_project_id: projectId,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingProjectMutationResult>(data);
    },

    async listProjectMessages(conversationId: string, beforeSequence?: number | null, limit = 50) {
      assertUuid(conversationId);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidMessagingProjectsRequest();
      if (beforeSequence !== null && beforeSequence !== undefined
          && (!Number.isInteger(beforeSequence) || beforeSequence < 1)) {
        throw invalidMessagingProjectsRequest();
      }
      const { data, error } = await client.rpc("get_conversation_messages_v1", {
        p_conversation_id: conversationId,
        p_before_sequence: beforeSequence ?? null,
        p_limit: limit,
      });
      if (error) throw toMessagingProjectsError(error, "load_failed");
      return rows<MessagingMessageRow>(data);
    },

    async sendProjectText(conversationId: string, body: string, clientMessageId = secureUuid()) {
      assertUuid(conversationId);
      assertUuid(clientMessageId);
      const normalized = body.trim();
      if (!normalized || normalized.length > 4_000) throw invalidMessagingProjectsRequest();
      const { data, error } = await client.rpc("send_message_v1", {
        p_conversation_id: conversationId,
        p_client_message_id: clientMessageId,
        p_kind: "text",
        p_body: normalized,
        p_payload: { domain: "creative_project" },
        p_reply_to_message_id: null,
      });
      if (error) throw toMessagingProjectsError(error, "mutation_failed");
      return object<MessagingSendResult>(data);
    },
  };
}

export const messagingProjectsRepository = createMessagingProjectsRepository();
