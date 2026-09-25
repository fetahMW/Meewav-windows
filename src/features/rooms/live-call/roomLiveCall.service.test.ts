import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createRoomLiveCallRepository,
} from "./roomLiveCall.service";

const INVITATION_ID = "11000000-0000-4000-8000-000000000001";
const ROOM_ID = "11000000-0000-4000-8000-000000000002";
const HOST_ID = "11000000-0000-4000-8000-000000000003";
const CONTACT_ID = "11000000-0000-4000-8000-000000000004";
const REQUEST_ID = "11000000-0000-4000-8000-000000000005";

describe("roomLiveCallRepository", () => {
  it("loads server-authorized direct contacts for the live Room", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        contact_profile_id: CONTACT_ID,
        direct_conversation_id: "11000000-0000-4000-8000-000000000006",
        username: "malik",
        display_name: "Malik",
        avatar_url: "/malik.webp",
        is_online: true,
        active_invitation_id: null,
        active_invitation_status: null,
        active_call_mode: null,
        active_route_mode: null,
        active_invitation_expires_at: null,
      }],
      error: null,
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.listContacts(ROOM_ID, "  Malik ", 500)).resolves.toEqual([
      expect.objectContaining({
        profileId: CONTACT_ID,
        displayName: "Malik",
        isOnline: true,
        activeInvitationId: null,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith("rooms_list_live_call_contacts_v1", {
      p_room_id: ROOM_ID,
      p_search: "Malik",
      p_limit: 100,
    });
  });

  it("maps the protected two-party invitation projection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        invitation_id: INVITATION_ID,
        room_id: ROOM_ID,
        room_title: "La Place de Naya",
        host_profile_id: HOST_ID,
        host_username: "naya",
        host_display_name: "Naya Oris",
        host_avatar_url: "/naya.webp",
        contact_profile_id: CONTACT_ID,
        contact_username: "malik",
        contact_display_name: "Malik",
        contact_avatar_url: "/malik.webp",
        party_role: "contact",
        status: "pending",
        call_mode: "public",
        route_mode: "preview",
        is_on_air: false,
        route_revision: 1,
        invitation_expires_at: "2026-08-15T18:01:30.000Z",
        session_expires_at: null,
        created_at: "2026-08-15T18:00:00.000Z",
      }],
      error: null,
    });

    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.listMine(500)).resolves.toEqual([expect.objectContaining({
      invitationId: INVITATION_ID,
      roomId: ROOM_ID,
      hostDisplayName: "Naya Oris",
      contactDisplayName: "Malik",
      partyRole: "contact",
      status: "pending",
      callMode: "public",
      routeMode: "preview",
      isOnAir: false,
      routeRevision: 1,
    })]);
    expect(rpc).toHaveBeenCalledWith("rooms_list_my_live_call_invitations_v1", { p_limit: 100 });
  });

  it("sends only server-authorized identifiers when inviting a contact", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        invitation_id: INVITATION_ID,
        status: "pending",
        call_mode: "public",
        route_mode: "preview",
        is_on_air: false,
        route_revision: 1,
        invitation_expires_at: "2026-08-15T18:01:30.000Z",
        idempotent: false,
      },
      error: null,
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await repository.inviteContact(ROOM_ID, CONTACT_ID, REQUEST_ID, "public");

    expect(rpc).toHaveBeenCalledWith("rooms_invite_live_call_contact_v1", {
      p_room_id: ROOM_ID,
      p_contact_profile_id: CONTACT_ID,
      p_client_request_id: REQUEST_ID,
      p_call_mode: "public",
    });
  });

  it("preserves an honest domain error returned inside a successful RPC envelope", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: false,
        invitation_id: INVITATION_ID,
        status: "expired",
        error: "live_call_invitation_expired",
      },
      error: null,
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.respond(INVITATION_ID, true)).rejects.toMatchObject({
      code: "live_call_invitation_expired",
      message: "Cet appel a expiré.",
    });
  });

  it("commits the public on-air authorization with the expected revision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        invitation_id: INVITATION_ID,
        call_mode: "public",
        is_on_air: true,
        route_revision: 4,
        idempotent: false,
      },
      error: null,
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.setOnAir(INVITATION_ID, true, 3)).resolves.toMatchObject({
      invitationId: INVITATION_ID,
      callMode: "public",
      isOnAir: true,
      routeRevision: 4,
    });
    expect(rpc).toHaveBeenCalledWith("rooms_set_live_call_on_air_v1", {
      p_invitation_id: INVITATION_ID,
      p_enabled: true,
      p_expected_revision: 3,
    });
  });

  it("translates an authorization revoked at the final on-air boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "live_call_on_air_forbidden" },
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.setOnAir(INVITATION_ID, true, 3)).rejects.toMatchObject({
      code: "live_call_on_air_forbidden",
      message: "L’autorisation de diffuser cet appel vient d’être retirée.",
    });
  });

  it("translates the canonical on-stage refusal", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "55000", message: "live_call_contact_onstage" },
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.inviteContact(ROOM_ID, CONTACT_ID, REQUEST_ID, "public")).rejects.toMatchObject({
      code: "live_call_contact_onstage",
      message: "Ce contact est déjà à l’antenne dans cette Room.",
    });
  });

  it("translates the recipient invitation quota without exposing a SQL code", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "live_call_contact_invitation_limit" },
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.inviteContact(ROOM_ID, CONTACT_ID, REQUEST_ID, "private")).rejects.toMatchObject({
      code: "live_call_contact_invitation_limit",
      message: "Ce contact reçoit déjà trop d’appels. Réessayez un peu plus tard.",
    });
  });

  it("translates the Host-wide active call limit", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "live_call_host_active_limit" },
    });
    const repository = createRoomLiveCallRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.inviteContact(ROOM_ID, CONTACT_ID, REQUEST_ID, "public")).rejects.toMatchObject({
      code: "live_call_host_active_limit",
      message: "Vous avez trop d’appels en attente ou en cours. Terminez-en un avant de continuer.",
    });
  });

  it("invalidates from Realtime and refetches again after SUBSCRIBED", async () => {
    const channel = {
      on: vi.fn((_kind, _config, _callback: () => void) => {
        return channel;
      }),
      subscribe: vi.fn((_callback: (status: string) => void) => {
        return channel;
      }),
    };
    const removeChannel = vi.fn().mockResolvedValue(undefined);
    const client = {
      channel: vi.fn(() => channel),
      realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
      removeChannel,
    } as unknown as SupabaseClient;
    const onChange = vi.fn();
    const onStatus = vi.fn();

    const subscription = createRoomLiveCallRepository(client).subscribe(onChange, onStatus);
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    const subscriptionStatus = channel.subscribe.mock.calls[0]?.[0] as ((status: string) => void) | undefined;
    const changeHandler = channel.on.mock.calls[0]?.[2] as (() => void) | undefined;
    subscriptionStatus?.("SUBSCRIBED");
    changeHandler?.();

    expect(onStatus).toHaveBeenCalledWith("connecting");
    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(onChange).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
