import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  invalidMessagingArtistGroupsRequest,
  toMessagingArtistGroupsError,
} from "./messaging.groups.errors";
import type {
  MessagingArtistGroupActivityRow,
  MessagingArtistGroupAuthorityRole,
  MessagingArtistGroupDetail,
  MessagingArtistGroupFeedCursor,
  MessagingArtistGroupInvitationCursor,
  MessagingArtistGroupInvitationDecision,
  MessagingArtistGroupInvitationRow,
  MessagingArtistGroupMutationResult,
  MessagingArtistGroupPreferencesInput,
  MessagingArtistGroupRosterVisibility,
  MessagingArtistGroupRow,
  MessagingArtistGroupVisibility,
  MessagingCreateArtistGroupInput,
  MessagingInviteArtistGroupMemberInput,
  MessagingListArtistGroupsInput,
} from "./messaging.groups.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMessagingArtistGroupsRequest();
}

function assertKey(value: string) {
  if (value.trim().length < 8 || value.trim().length > 128) {
    throw invalidMessagingArtistGroupsRequest();
  }
}

function assertLimit(limit: number | undefined) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw invalidMessagingArtistGroupsRequest();
  }
}

function assertCursor(cursor: { [key: string]: string } | null | undefined, idKey: string, dateKey: string) {
  if (!cursor) return;
  assertUuid(cursor[idKey]);
  if (!cursor[dateKey] || Number.isNaN(new Date(cursor[dateKey]).getTime())) {
    throw invalidMessagingArtistGroupsRequest();
  }
}

function rows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw toMessagingArtistGroupsError(null, "load_failed");
  return data as T[];
}

function object<T>(data: unknown, fallback: "load_failed" | "mutation_failed" = "mutation_failed"): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMessagingArtistGroupsError(null, fallback);
  }
  return data as T;
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export function createMessagingArtistGroupIdempotencyKey(operation = "artist-group") {
  const prefix = operation.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "artist-group";
  return `${prefix}:${secureUuid()}`;
}

export type MessagingArtistGroupsRepository = ReturnType<typeof createMessagingArtistGroupsRepository>;

export function createMessagingArtistGroupsRepository(client: SupabaseClient = supabase) {
  const rpcRows = async <T>(name: string, params: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, params);
    if (error) throw toMessagingArtistGroupsError(error, "load_failed");
    return rows<T>(data);
  };
  const rpcObject = async <T>(name: string, params: Record<string, unknown>, fallback: "load_failed" | "mutation_failed" = "mutation_failed") => {
    const { data, error } = await client.rpc(name, params);
    if (error) throw toMessagingArtistGroupsError(error, fallback);
    return object<T>(data, fallback);
  };

  return {
    async listMyArtistGroups(input: MessagingListArtistGroupsInput = {}) {
      if (input.scope && !new Set(["active", "archived", "all"]).has(input.scope)) {
        throw invalidMessagingArtistGroupsRequest();
      }
      assertLimit(input.limit);
      assertCursor(input.cursor, "group_id", "updated_at");
      return rpcRows<MessagingArtistGroupRow>("list_my_artist_groups_v1", {
        p_scope: input.scope ?? "active",
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
      });
    },

    async getArtistGroupDetail(groupId: string) {
      assertUuid(groupId);
      return rpcObject<MessagingArtistGroupDetail>("get_artist_group_detail_v1", {
        p_group_id: groupId,
      }, "load_failed");
    },

    async listArtistGroupActivity(groupId: string, cursor: MessagingArtistGroupFeedCursor | null = null, limit = 50) {
      assertUuid(groupId);
      assertLimit(limit);
      assertCursor(cursor, "activity_id", "created_at");
      return rpcRows<MessagingArtistGroupActivityRow>("list_artist_group_activity_v1", {
        p_group_id: groupId,
        p_cursor: cursor,
        p_limit: limit,
      });
    },

    async listMyArtistGroupInvitations(cursor: MessagingArtistGroupInvitationCursor | null = null, limit = 30) {
      assertLimit(limit);
      assertCursor(cursor, "invitation_id", "created_at");
      return rpcRows<MessagingArtistGroupInvitationRow>("list_my_artist_group_invitations_v1", {
        p_cursor: cursor,
        p_limit: limit,
      });
    },

    async createArtistGroup(input: MessagingCreateArtistGroupInput) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 80 || (input.description?.length ?? 0) > 600) {
        throw invalidMessagingArtistGroupsRequest();
      }
      if (input.visibility && !new Set<MessagingArtistGroupVisibility>(["private", "discoverable"]).has(input.visibility)) {
        throw invalidMessagingArtistGroupsRequest();
      }
      if (input.artisticRole && (input.artisticRole.trim().length < 2 || input.artisticRole.trim().length > 80)) {
        throw invalidMessagingArtistGroupsRequest();
      }
      assertKey(input.idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("create_artist_group_v1", {
        p_name: name,
        p_description: input.description?.trim() || null,
        p_visibility: input.visibility ?? "private",
        p_artistic_role: input.artisticRole?.trim() || null,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
    },

    async updateArtistGroup(groupId: string, name: string, description: string | null, visibility: MessagingArtistGroupVisibility, idempotencyKey: string) {
      assertUuid(groupId);
      assertKey(idempotencyKey);
      const normalizedName = name.trim();
      if (normalizedName.length < 2 || normalizedName.length > 80 || (description?.length ?? 0) > 600) {
        throw invalidMessagingArtistGroupsRequest();
      }
      return rpcObject<MessagingArtistGroupMutationResult>("update_artist_group_v1", {
        p_group_id: groupId,
        p_name: normalizedName,
        p_description: description?.trim() || null,
        p_visibility: visibility,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async inviteArtistGroupMember(input: MessagingInviteArtistGroupMemberInput) {
      assertUuid(input.groupId);
      assertUuid(input.profileId);
      assertKey(input.idempotencyKey);
      if ((input.message?.length ?? 0) > 500 || (input.artisticRole && (input.artisticRole.trim().length < 2 || input.artisticRole.trim().length > 80))) {
        throw invalidMessagingArtistGroupsRequest();
      }
      return rpcObject<MessagingArtistGroupMutationResult>("invite_artist_group_member_v1", {
        p_group_id: input.groupId,
        p_profile_id: input.profileId,
        p_artistic_role: input.artisticRole?.trim() || null,
        p_message: input.message?.trim() || null,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
    },

    async respondToArtistGroupInvitation(invitationId: string, decision: MessagingArtistGroupInvitationDecision, idempotencyKey: string) {
      assertUuid(invitationId);
      assertKey(idempotencyKey);
      if (decision !== "accept" && decision !== "decline") throw invalidMessagingArtistGroupsRequest();
      return rpcObject<MessagingArtistGroupMutationResult>("respond_to_artist_group_invitation_v1", {
        p_invitation_id: invitationId,
        p_decision: decision,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async cancelArtistGroupInvitation(invitationId: string, idempotencyKey: string) {
      assertUuid(invitationId);
      assertKey(idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("cancel_artist_group_invitation_v1", {
        p_invitation_id: invitationId,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async setMyArtistGroupPreferences(input: MessagingArtistGroupPreferencesInput) {
      assertUuid(input.groupId);
      assertKey(input.idempotencyKey);
      if (input.notificationsEnabled === undefined && input.rosterVisibility === undefined && input.archived === undefined) {
        throw invalidMessagingArtistGroupsRequest();
      }
      return rpcObject<MessagingArtistGroupMutationResult>("set_my_artist_group_preferences_v1", {
        p_group_id: input.groupId,
        p_notifications_enabled: input.notificationsEnabled ?? null,
        p_roster_visibility: input.rosterVisibility ?? null,
        p_archived: input.archived ?? null,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
    },

    async setArtistGroupAuthorityRole(groupId: string, profileId: string, role: Exclude<MessagingArtistGroupAuthorityRole, "owner">, idempotencyKey: string) {
      assertUuid(groupId); assertUuid(profileId); assertKey(idempotencyKey);
      if (role !== "admin" && role !== "member") throw invalidMessagingArtistGroupsRequest();
      return rpcObject<MessagingArtistGroupMutationResult>("set_artist_group_authority_role_v1", {
        p_group_id: groupId, p_profile_id: profileId, p_authority_role: role,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async setArtistGroupArtisticRole(groupId: string, profileId: string, role: string | null, idempotencyKey: string) {
      assertUuid(groupId); assertUuid(profileId); assertKey(idempotencyKey);
      if (role && (role.trim().length < 2 || role.trim().length > 80)) throw invalidMessagingArtistGroupsRequest();
      return rpcObject<MessagingArtistGroupMutationResult>("set_artist_group_artistic_role_v1", {
        p_group_id: groupId, p_profile_id: profileId, p_artistic_role: role?.trim() || null,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async transferArtistGroupOwnership(groupId: string, profileId: string, previousOwnerRole: "admin" | "member", idempotencyKey: string) {
      assertUuid(groupId); assertUuid(profileId); assertKey(idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("transfer_artist_group_ownership_v1", {
        p_group_id: groupId, p_profile_id: profileId, p_previous_owner_role: previousOwnerRole,
        p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async removeArtistGroupMember(groupId: string, profileId: string, idempotencyKey: string) {
      assertUuid(groupId); assertUuid(profileId); assertKey(idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("remove_artist_group_member_v1", {
        p_group_id: groupId, p_profile_id: profileId, p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async leaveArtistGroup(groupId: string, idempotencyKey: string) {
      assertUuid(groupId); assertKey(idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("leave_artist_group_v1", {
        p_group_id: groupId, p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async setArtistGroupArchived(groupId: string, archived: boolean, idempotencyKey: string) {
      assertUuid(groupId); assertKey(idempotencyKey);
      return rpcObject<MessagingArtistGroupMutationResult>("set_artist_group_archived_v1", {
        p_group_id: groupId, p_archived: archived, p_idempotency_key: idempotencyKey.trim(),
      });
    },

    async deleteArtistGroup(groupId: string, confirmationName: string, idempotencyKey: string) {
      assertUuid(groupId); assertKey(idempotencyKey);
      if (!confirmationName.trim()) throw invalidMessagingArtistGroupsRequest();
      return rpcObject<MessagingArtistGroupMutationResult>("delete_artist_group_v1", {
        p_group_id: groupId, p_confirmation_name: confirmationName.trim(),
        p_idempotency_key: idempotencyKey.trim(),
      });
    },
  };
}

export const messagingArtistGroupsRepository = createMessagingArtistGroupsRepository();

export function assertMessagingArtistGroupRosterVisibility(value: string): asserts value is MessagingArtistGroupRosterVisibility {
  if (value !== "visible" && value !== "hidden") throw invalidMessagingArtistGroupsRequest();
}
