import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessagingArtistGroupsRepository } from "./messaging.groups.service";
import type {
  MessagingArtistGroupActivityRow,
  MessagingArtistGroupDetail,
  MessagingArtistGroupInvitationRow,
  MessagingArtistGroupMutationResult,
  MessagingArtistGroupRow,
} from "./messaging.groups.types";
import { useMessagingGroupsLive } from "./useMessagingGroupsLive";

const CURRENT_PROFILE_ID = "81000000-0000-4000-8000-000000000001";
const GROUP_ID = "82000000-0000-4000-8000-000000000001";
const GROUP_TWO_ID = "82000000-0000-4000-8000-000000000002";
const CONVERSATION_ID = "83000000-0000-4000-8000-000000000001";
const INVITATION_ID = "84000000-0000-4000-8000-000000000001";

function groupRow(groupId = GROUP_ID, name = "Horizon"): MessagingArtistGroupRow {
  return {
    group_id: groupId,
    name,
    description: "Collectif",
    visibility: "private",
    lifecycle_status: "active",
    conversation_id: CONVERSATION_ID,
    member_limit: 50,
    active_member_count: 3,
    pending_invitation_count: 1,
    my_authority_role: "owner",
    my_artistic_role: "Pianiste",
    my_notifications_enabled: true,
    my_roster_visibility: "visible",
    my_archived_at: null,
    created_at: "2026-07-17T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    page_cursor: { updated_at: "2026-07-18T10:00:00Z", group_id: groupId },
  };
}

function detail(groupId = GROUP_ID, name = "Horizon"): MessagingArtistGroupDetail {
  return {
    group_id: groupId,
    name,
    description: "Collectif",
    visibility: "private",
    lifecycle_status: "active",
    conversation_id: CONVERSATION_ID,
    member_limit: 50,
    created_at: "2026-07-17T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    my_authority_role: "owner",
    my_artistic_role: "Pianiste",
    my_notifications_enabled: true,
    my_roster_visibility: "visible",
    my_archived_at: null,
    members: [],
    pending_invitations: [],
  };
}

function invitation(): MessagingArtistGroupInvitationRow {
  return {
    invitation_id: INVITATION_ID,
    group_id: GROUP_ID,
    group_name: "Horizon",
    conversation_id: CONVERSATION_ID,
    invited_by_profile_id: "85000000-0000-4000-8000-000000000001",
    inviter_username: "maya",
    inviter_display_name: "Maya",
    inviter_avatar_url: null,
    artistic_role: "Beatmaker",
    message: "Bienvenue",
    status: "pending",
    created_at: "2026-07-18T10:00:00Z",
    expires_at: "2026-08-18T10:00:00Z",
    page_cursor: { created_at: "2026-07-18T10:00:00Z", invitation_id: INVITATION_ID },
  };
}

function activity(groupId = GROUP_ID): MessagingArtistGroupActivityRow {
  return {
    activity_id: "86000000-0000-4000-8000-000000000001",
    event_type: "group_created",
    actor_profile_id: CURRENT_PROFILE_ID,
    actor_display_name: "Fetah",
    subject_profile_id: null,
    payload: {},
    created_at: "2026-07-18T10:00:00Z",
    page_cursor: {
      created_at: "2026-07-18T10:00:00Z",
      activity_id: "86000000-0000-4000-8000-000000000001",
    },
  };
}

function fakeRepository(overrides: Partial<MessagingArtistGroupsRepository> = {}) {
  return {
    listMyArtistGroups: vi.fn().mockResolvedValue([groupRow()]),
    getArtistGroupDetail: vi.fn().mockResolvedValue(detail()),
    listArtistGroupActivity: vi.fn().mockResolvedValue([activity()]),
    listMyArtistGroupInvitations: vi.fn().mockResolvedValue([invitation()]),
    createArtistGroup: vi.fn(),
    updateArtistGroup: vi.fn(),
    inviteArtistGroupMember: vi.fn(),
    respondToArtistGroupInvitation: vi.fn(),
    cancelArtistGroupInvitation: vi.fn(),
    setMyArtistGroupPreferences: vi.fn(),
    setArtistGroupAuthorityRole: vi.fn(),
    setArtistGroupArtisticRole: vi.fn(),
    transferArtistGroupOwnership: vi.fn(),
    removeArtistGroupMember: vi.fn(),
    leaveArtistGroup: vi.fn(),
    setArtistGroupArchived: vi.fn(),
    deleteArtistGroup: vi.fn(),
    ...overrides,
  } as unknown as MessagingArtistGroupsRepository;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMessagingGroupsLive", () => {
  it("stays idle when live mode is disabled without loading demo groups", () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingGroupsLive({
      enabled: false,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    expect(result.current.status).toBe("idle");
    expect(result.current.groups).toEqual([]);
    expect(result.current.invitations).toEqual([]);
    expect(repository.listMyArtistGroups).not.toHaveBeenCalled();
  });

  it("loads the safe group list and invitations together", async () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingGroupsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.groups[0]).toMatchObject({ id: GROUP_ID, authorityRole: "owner" });
    expect(result.current.invitations[0]).toMatchObject({ id: INVITATION_ID, inviterName: "Maya" });
  });

  it("ignores a stale detail response when another group is selected", async () => {
    const first = deferred<MessagingArtistGroupDetail>();
    const repository = fakeRepository({
      getArtistGroupDetail: vi.fn().mockImplementation((groupId) => (
        groupId === GROUP_ID ? first.promise : Promise.resolve(detail(GROUP_TWO_ID, "Nova"))
      )),
      listArtistGroupActivity: vi.fn().mockImplementation((groupId) => Promise.resolve([activity(groupId)])),
    });
    const { result } = renderHook(() => useMessagingGroupsLive({
      enabled: true, currentProfileId: CURRENT_PROFILE_ID, repository, pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let firstPromise!: Promise<MessagingArtistGroupDetail | null>;
    await act(async () => {
      firstPromise = result.current.openGroup(GROUP_ID);
      await result.current.openGroup(GROUP_TWO_ID);
    });
    expect(result.current.selectedGroup?.group_id).toBe(GROUP_TWO_ID);
    await act(async () => {
      first.resolve(detail(GROUP_ID));
      await firstPromise;
    });
    expect(result.current.selectedGroup?.group_id).toBe(GROUP_TWO_ID);
  });

  it("deduplicates a concurrent create, refreshes the list and opens the new group", async () => {
    const pending = deferred<MessagingArtistGroupMutationResult>();
    const repository = fakeRepository({
      createArtistGroup: vi.fn(() => pending.promise),
    });
    const { result } = renderHook(() => useMessagingGroupsLive({
      enabled: true, currentProfileId: CURRENT_PROFILE_ID, repository, pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let first!: Promise<MessagingArtistGroupMutationResult>;
    let second!: Promise<MessagingArtistGroupMutationResult>;
    act(() => {
      first = result.current.createGroup({ name: "Horizon" });
      second = result.current.createGroup({ name: "Horizon" });
    });
    expect(first).toBe(second);
    expect(repository.createArtistGroup).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({
        ok: true, idempotent: false, group_id: GROUP_ID,
        conversation_id: CONVERSATION_ID, lifecycle_status: "active",
      });
      await first;
    });
    expect(repository.listMyArtistGroups).toHaveBeenCalledTimes(2);
    expect(repository.getArtistGroupDetail).toHaveBeenCalledWith(GROUP_ID);
    expect(result.current.selectedGroupId).toBe(GROUP_ID);
  });

  it("accepts an invitation, refreshes both collections and opens the joined group", async () => {
    const repository = fakeRepository({
      respondToArtistGroupInvitation: vi.fn().mockResolvedValue({
        ok: true, idempotent: false, group_id: GROUP_ID,
        invitation_id: INVITATION_ID, status: "accepted", conversation_id: CONVERSATION_ID,
      }),
    });
    const { result } = renderHook(() => useMessagingGroupsLive({
      enabled: true, currentProfileId: CURRENT_PROFILE_ID, repository, pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.respondInvitation(INVITATION_ID, "accept");
    });

    expect(repository.respondToArtistGroupInvitation).toHaveBeenCalledWith(
      INVITATION_ID, "accept", expect.stringMatching(/^group-accept:/),
    );
    expect(repository.listMyArtistGroups).toHaveBeenCalledTimes(2);
    expect(repository.listMyArtistGroupInvitations).toHaveBeenCalledTimes(2);
    expect(repository.getArtistGroupDetail).toHaveBeenCalledWith(GROUP_ID);
    expect(result.current.selectedGroupId).toBe(GROUP_ID);
  });
});
