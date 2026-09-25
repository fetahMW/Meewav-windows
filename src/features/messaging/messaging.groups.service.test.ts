import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { MessagingArtistGroupsError } from "./messaging.groups.errors";
import { createMessagingArtistGroupsRepository } from "./messaging.groups.service";

const GROUP_ID = "81000000-0000-4000-8000-000000000001";
const PROFILE_ID = "81000000-0000-4000-8000-000000000002";
const INVITATION_ID = "83000000-0000-4000-8000-000000000001";

function fakeClient(handler: (name: string, params: Record<string, unknown>) => unknown) {
  return {
    rpc: vi.fn(async (name: string, params: Record<string, unknown>) => ({
      data: handler(name, params),
      error: null,
    })),
  } as unknown as SupabaseClient;
}

describe("messaging artist groups repository", () => {
  it("uses only the safe list/detail/activity RPC projections", async () => {
    const client = fakeClient((name) => name === "get_artist_group_detail_v1" ? { group_id: GROUP_ID } : []);
    const repository = createMessagingArtistGroupsRepository(client);

    await repository.listMyArtistGroups({ scope: "archived", limit: 20 });
    await repository.getArtistGroupDetail(GROUP_ID);
    await repository.listArtistGroupActivity(GROUP_ID, null, 25);
    await repository.listMyArtistGroupInvitations(null, 15);

    expect(client.rpc).toHaveBeenNthCalledWith(1, "list_my_artist_groups_v1", {
      p_scope: "archived", p_cursor: null, p_limit: 20,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "get_artist_group_detail_v1", { p_group_id: GROUP_ID });
    expect(client.rpc).toHaveBeenNthCalledWith(3, "list_artist_group_activity_v1", {
      p_group_id: GROUP_ID, p_cursor: null, p_limit: 25,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(4, "list_my_artist_group_invitations_v1", {
      p_cursor: null, p_limit: 15,
    });
  });

  it("normalizes create and invite payloads while preserving idempotency keys", async () => {
    const client = fakeClient(() => ({ ok: true, group_id: GROUP_ID, idempotent: false }));
    const repository = createMessagingArtistGroupsRepository(client);

    await repository.createArtistGroup({
      name: " Horizon ", description: " Ensemble ", visibility: "discoverable",
      artisticRole: " Pianiste ", idempotencyKey: "group-create-0001",
    });
    await repository.inviteArtistGroupMember({
      groupId: GROUP_ID, profileId: PROFILE_ID, artisticRole: " Beatmaker ",
      message: " Bienvenue ", idempotencyKey: "group-invite-0001",
    });

    expect(client.rpc).toHaveBeenNthCalledWith(1, "create_artist_group_v1", {
      p_name: "Horizon", p_description: "Ensemble", p_visibility: "discoverable",
      p_artistic_role: "Pianiste", p_idempotency_key: "group-create-0001",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "invite_artist_group_member_v1", {
      p_group_id: GROUP_ID, p_profile_id: PROFILE_ID, p_artistic_role: "Beatmaker",
      p_message: "Bienvenue", p_idempotency_key: "group-invite-0001",
    });
  });

  it("routes invitation response and all authority/lifecycle mutations through dedicated RPCs", async () => {
    const client = fakeClient(() => ({ ok: true, group_id: GROUP_ID, idempotent: false }));
    const repository = createMessagingArtistGroupsRepository(client);

    await repository.respondToArtistGroupInvitation(INVITATION_ID, "accept", "accept-key-0001");
    await repository.setArtistGroupAuthorityRole(GROUP_ID, PROFILE_ID, "admin", "authority-key-0001");
    await repository.setArtistGroupArtisticRole(GROUP_ID, PROFILE_ID, "DJ", "artistic-key-0001");
    await repository.transferArtistGroupOwnership(GROUP_ID, PROFILE_ID, "member", "transfer-key-0001");
    await repository.removeArtistGroupMember(GROUP_ID, PROFILE_ID, "remove-key-0001");
    await repository.setArtistGroupArchived(GROUP_ID, true, "archive-key-0001");
    await repository.deleteArtistGroup(GROUP_ID, "Horizon", "delete-key-0001");

    expect(client.rpc).toHaveBeenCalledWith("respond_to_artist_group_invitation_v1", expect.objectContaining({ p_decision: "accept" }));
    expect(client.rpc).toHaveBeenCalledWith("set_artist_group_authority_role_v1", expect.objectContaining({ p_authority_role: "admin" }));
    expect(client.rpc).toHaveBeenCalledWith("set_artist_group_artistic_role_v1", expect.objectContaining({ p_artistic_role: "DJ" }));
    expect(client.rpc).toHaveBeenCalledWith("transfer_artist_group_ownership_v1", expect.objectContaining({ p_previous_owner_role: "member" }));
    expect(client.rpc).toHaveBeenCalledWith("remove_artist_group_member_v1", expect.any(Object));
    expect(client.rpc).toHaveBeenCalledWith("set_artist_group_archived_v1", expect.objectContaining({ p_archived: true }));
    expect(client.rpc).toHaveBeenCalledWith("delete_artist_group_v1", expect.objectContaining({ p_confirmation_name: "Horizon" }));
  });

  it("rejects malformed identifiers and empty preference mutations before Supabase", async () => {
    const client = fakeClient(() => ({}));
    const repository = createMessagingArtistGroupsRepository(client);

    await expect(repository.getArtistGroupDetail("not-a-uuid")).rejects.toBeInstanceOf(MessagingArtistGroupsError);
    await expect(repository.setMyArtistGroupPreferences({
      groupId: GROUP_ID,
      idempotencyKey: "prefs-key-0001",
    })).rejects.toBeInstanceOf(MessagingArtistGroupsError);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps stable server error messages without leaking raw backend copy", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "artist_group_owner_required" },
      })),
    } as unknown as SupabaseClient;
    const repository = createMessagingArtistGroupsRepository(client);

    await expect(repository.deleteArtistGroup(GROUP_ID, "Horizon", "delete-key-0001"))
      .rejects.toMatchObject({ code: "artist_group_owner_required", serverCode: "42501" });
  });
});
