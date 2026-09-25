import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260815180000_rooms_live_call_invitations_v1.sql?raw";

describe("Room live-call invitation SQL contract", () => {
  it("keeps the feature additive and derives contacts from active direct Messaging pairs", () => {
    expect(sql).toContain("create table if not exists public.room_live_call_invitations_v1");
    expect(sql).toContain("join public.messaging_direct_pairs pair");
    expect(sql).toContain("conversation.kind = 'direct'");
    expect(sql).toContain("host_member.membership_status = 'active'");
    expect(sql).toContain("contact_member.membership_status = 'active'");
    expect(sql).toContain("public.messaging_profiles_blocked_v1");
    expect(sql).not.toMatch(/alter table public\.room_invitations_v2/i);
    expect(sql).not.toMatch(/create or replace function public\.rooms_(?:accept|invite_from_queue)_invitation_v2/i);
  });

  it("makes invitation creation Host-only, rate-limited and idempotent per checked contact", () => {
    const invite = sql.slice(
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
    );
    expect(sql).toContain("unique (host_id, client_request_id, contact_profile_id)");
    expect(invite).toContain("room.host_id = v_host_id");
    expect(invite).toContain("room.type = 'place'");
    expect(invite).toContain("room.status = 'live'");
    expect(invite).toContain("live_call_idempotency_conflict");
    expect(invite).toContain("v_batch_room_id <> p_room_id");
    expect(invite).toContain("live_call_invitation_rate_limit");
    expect(invite).toContain("live_call_room_capacity");
    expect(invite).toContain("pg_advisory_xact_lock");
  });

  it("serializes Host rate and Room capacity before either aggregate is read", () => {
    const invite = sql.slice(
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
    );
    const hostLock = invite.indexOf("rooms:live-call-host-rate:");
    const roomLock = invite.indexOf("rooms:live-call-room-capacity:");
    const recipientLimit = invite.lastIndexOf("live_call_contact_invitation_limit");
    const rateCount = invite.indexOf(
      "invitation.created_at > now() - interval '1 minute'",
      recipientLimit,
    );
    const capacityCount = invite.indexOf("invitation.status in ('pending', 'accepted')", rateCount);
    expect(hostLock).toBeGreaterThan(-1);
    expect(roomLock).toBeGreaterThan(hostLock);
    expect(hostLock).toBeLessThan(rateCount);
    expect(roomLock).toBeLessThan(capacityCount);
  });

  it("serializes the Host's cross-Room active-call ceiling before counting", () => {
    const invite = sql.slice(
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
    );
    const hostLock = invite.indexOf("rooms:live-call-host-rate:");
    const hostExpiry = invite.indexOf("100, null, v_host_id", hostLock);
    const activeCount = invite.indexOf(
      "invitation.status in ('pending', 'accepted')",
      hostExpiry,
    );
    const activeLimit = invite.indexOf("live_call_host_active_limit", activeCount);

    expect(hostLock).toBeGreaterThan(-1);
    expect(hostExpiry).toBeGreaterThan(hostLock);
    expect(activeCount).toBeGreaterThan(hostExpiry);
    expect(activeLimit).toBeGreaterThan(activeCount);
    expect(invite.slice(activeCount, activeLimit)).toContain(") >= 24 then");
  });

  it("serializes cross-Host ringing limits per recipient before global counts", () => {
    const invite = sql.slice(
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
    );
    const recipientLock = invite.indexOf("rooms:live-call-contact-ring-rate:");
    const globalExpiry = invite.indexOf("100, null, p_contact_profile_id", recipientLock);
    const rollingCount = invite.indexOf(
      "invitation.created_at > now() - interval '1 minute'",
      globalExpiry,
    );
    const pendingCount = invite.indexOf("invitation.status = 'pending'", rollingCount);
    const recipientLimitErrors = invite.match(/live_call_contact_invitation_limit/g) ?? [];

    expect(recipientLock).toBeGreaterThan(-1);
    expect(globalExpiry).toBeGreaterThan(recipientLock);
    expect(rollingCount).toBeGreaterThan(globalExpiry);
    expect(pendingCount).toBeGreaterThan(rollingCount);
    expect(invite.slice(rollingCount, pendingCount)).toContain(") >= 5 then");
    expect(invite.slice(pendingCount)).toContain(") >= 10 then");
    expect(recipientLimitErrors).toHaveLength(2);
  });

  it("prioritizes established calls over pending rings in the bounded projection", () => {
    const listMine = sql.slice(
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
      sql.indexOf("create or replace function public.rooms_respond_live_call_invitation_v1"),
    );
    const acceptedFirst = listMine.indexOf(
      "case when invitation.status = 'accepted' then 0 else 1 end",
    );
    const newestSecond = listMine.indexOf("invitation.created_at desc", acceptedFirst);
    const boundedAfter = listMine.indexOf("limit v_limit", newestSecond);

    expect(acceptedFirst).toBeGreaterThan(-1);
    expect(newestSecond).toBeGreaterThan(acceptedFirst);
    expect(boundedAfter).toBeGreaterThan(newestSecond);
  });

  it("freezes the invitation's private/public intent and exposes it before acceptance", () => {
    const invite = sql.slice(
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
    );
    const contacts = sql.slice(
      sql.indexOf("create or replace function public.rooms_list_live_call_contacts_v1"),
      sql.indexOf("create or replace function public.rooms_invite_live_call_contact_v1"),
    );
    const listMine = sql.slice(
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
      sql.indexOf("create or replace function public.rooms_respond_live_call_invitation_v1"),
    );
    expect(sql).toContain("call_mode text not null default 'private'");
    expect(sql).toContain("check (call_mode in ('private', 'public'))");
    expect(invite).toContain("p_call_mode text default 'private'");
    expect(invite).toContain("v_call_mode text := lower(btrim(coalesce(p_call_mode, 'private')))");
    expect(invite).toContain("p_contact_profile_id::text, v_call_mode");
    expect(invite).toContain("'call_mode', v_existing.call_mode");
    expect(invite).toContain("v_fingerprint,\n    v_call_mode,");
    expect(contacts).toContain("active_call_mode text");
    expect(contacts).toContain("active_invitation.call_mode");
    expect(listMine).toContain("call_mode text");
    expect(listMine).toContain("invitation.call_mode");
    expect(sql).toContain("create trigger rooms_live_call_keep_mode_immutable_v1");
    expect(sql).toContain("live_call_mode_immutable");
    expect(sql).toContain(
      "grant execute on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid, text)\n  to authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid)\n",
    );
  });

  it("returns authoritative public-call state for normal and idempotent responses", () => {
    const respond = sql.slice(
      sql.indexOf("create or replace function public.rooms_respond_live_call_invitation_v1"),
      sql.indexOf("create or replace function public.rooms_set_live_call_route_v1"),
    );
    const idempotentStart = respond.indexOf(
      "if (v_invitation.status = 'accepted' and p_accept)",
    );
    const idempotentEnd = respond.indexOf(
      "if v_invitation.status <> 'pending' then",
      idempotentStart,
    );
    const normalStart = respond.lastIndexOf("return jsonb_build_object(");
    const normalEnd = respond.indexOf("end;\n$$;", normalStart);
    const successBlocks = [
      respond.slice(idempotentStart, idempotentEnd),
      respond.slice(normalStart, normalEnd),
    ];
    const authoritativeFields = [
      "'call_mode', v_invitation.call_mode",
      "'route_mode', v_invitation.route_mode",
      "'is_on_air', v_invitation.is_on_air",
      "'route_revision', v_invitation.route_revision",
      "'invitation_expires_at', v_invitation.invitation_expires_at",
      "'session_expires_at', v_invitation.session_expires_at",
    ];

    expect(idempotentStart).toBeGreaterThan(-1);
    expect(idempotentEnd).toBeGreaterThan(idempotentStart);
    expect(normalStart).toBeGreaterThan(idempotentEnd);
    expect(normalEnd).toBeGreaterThan(normalStart);
    for (const block of successBlocks) {
      for (const field of authoritativeFields) expect(block).toContain(field);
    }
    expect(successBlocks[0]).toContain("'idempotent', true");
    expect(successBlocks[1]).toContain("'idempotent', false");
  });

  it("starts every accepted call in preview and protects public routing with optimistic concurrency", () => {
    const route = sql.slice(
      sql.indexOf("create or replace function public.rooms_set_live_call_route_v1"),
      sql.indexOf("create or replace function public.rooms_end_live_call_invitation_v1"),
    );
    expect(sql).toContain("route_mode text not null default 'preview'");
    expect(sql).toContain("or (status = 'accepted' and call_mode = 'public')");
    expect(route).toContain("v_invitation.route_revision <> p_expected_revision");
    expect(route).toContain("live_call_route_revision_conflict");
    expect(route).toContain("set route_mode = v_mode");
    expect(route).toContain("route_revision = route_revision + 1");
    expect(route).toContain("live_call_public_route_forbidden");
    expect(route).toContain("v_invitation.call_mode <> 'public'");
    expect(route).toContain("live_call_private_mode");
  });

  it("commits the Host's on-air acknowledgement with the shared CAS revision", () => {
    const listMine = sql.slice(
      sql.indexOf("create or replace function public.rooms_list_my_live_call_invitations_v1"),
      sql.indexOf("create or replace function public.rooms_respond_live_call_invitation_v1"),
    );
    const onAir = sql.slice(
      sql.indexOf("create or replace function public.rooms_set_live_call_on_air_v1"),
      sql.indexOf("create or replace function public.rooms_end_live_call_invitation_v1"),
    );
    const forceOff = sql.slice(
      sql.indexOf("create or replace function public.rooms_live_call_force_off_air_v1"),
      sql.indexOf("create or replace function public.rooms_live_call_revocation_changed_v1"),
    );
    expect(sql).toContain("is_on_air boolean not null default false");
    expect(sql).toContain("not is_on_air or (status = 'accepted' and route_mode = 'public')");
    expect(listMine).toContain("is_on_air boolean");
    expect(listMine).toContain("invitation.is_on_air");
    expect(onAir).toContain("v_invitation.host_id <> v_host_id");
    expect(onAir).toContain("v_invitation.route_revision <> p_expected_revision");
    expect(onAir).toContain("live_call_on_air_revision_conflict");
    expect(onAir).toContain("v_invitation.route_mode <> 'public'");
    expect(onAir).toContain("v_invitation.call_mode <> 'public'");
    expect(onAir).toContain("not p_enabled and not v_invitation.is_on_air");
    expect(onAir).toContain("set is_on_air = p_enabled");
    expect(onAir).toContain("route_revision = route_revision + 1");
    expect(forceOff).toContain("new.is_on_air := false");
    expect(forceOff).toContain("old.route_revision + 1");
    expect(sql).toContain("after update of status, route_mode, is_on_air or delete");
    expect(sql).toContain("or not v_invitation.is_on_air");
    expect(sql).toContain(
      "grant execute on function public.rooms_set_live_call_on_air_v1(uuid, boolean, bigint)\n  to authenticated",
    );
  });

  it("keeps viewers callable but excludes canonical onstage guests at list, invite and accept", () => {
    const stageGuard = sql.slice(
      sql.indexOf("create or replace function public.rooms_live_call_contact_on_public_stage_v1"),
      sql.indexOf("create or replace function public.rooms_enqueue_live_call_revocation_internal_v1"),
    );
    expect(stageGuard).toContain("stage_invitation.status = 'onstage'");
    expect(stageGuard).toContain("stage_invitation.ended_at is null");
    expect(stageGuard).toContain("active_guest.role = 'guest'");
    expect(stageGuard).toContain("active_guest.left_at is null");
    expect(stageGuard).not.toContain("active_guest.role = 'viewer'");

    const paths = [
      ["create or replace function public.rooms_list_live_call_contacts_v1", "create or replace function public.rooms_invite_live_call_contact_v1"],
      ["create or replace function public.rooms_invite_live_call_contact_v1", "create or replace function public.rooms_list_my_live_call_invitations_v1"],
      ["create or replace function public.rooms_respond_live_call_invitation_v1", "create or replace function public.rooms_set_live_call_route_v1"],
    ] as const;
    for (const [start, end] of paths) {
      expect(sql.slice(sql.indexOf(start), sql.indexOf(end)))
        .toContain("rooms_live_call_contact_on_public_stage_v1");
    }
    const respond = sql.slice(sql.indexOf(paths[2][0]), sql.indexOf(paths[2][1]));
    expect(respond).toContain("meewav:rooms:program-transition:");
    expect(respond).toContain("live_call_contact_onstage");
    expect(sql).not.toContain("live_call_contact_already_onstage");
  });

  it("atomically ends an accepted phone call when the contact enters the public guest path", () => {
    const stageEnd = sql.slice(
      sql.indexOf("create or replace function public.rooms_end_live_call_for_stage_entry_internal_v1"),
      sql.indexOf("create or replace function public.rooms_end_live_calls_for_room_state_v1"),
    );
    const stageLock = stageEnd.indexOf("meewav:rooms:program-transition:");
    const acceptedUpdate = stageEnd.indexOf("update public.room_live_call_invitations_v1 invitation");
    expect(stageLock).toBeGreaterThan(-1);
    expect(stageLock).toBeLessThan(acceptedUpdate);
    expect(stageEnd).toContain("set status = 'ended'");
    expect(stageEnd).toContain("route_mode = 'preview'");
    expect(stageEnd).toContain("invitation.status = 'accepted'");
    expect(stageEnd).toContain("contact_joined_public_stage");
    expect(stageEnd).toContain("contact_became_active_guest");
    expect(stageEnd).toContain("on public.room_invitations_v2");
    expect(stageEnd).toContain("on public.room_participants_v2");

    const lockOrderedPaths = [
      ["create or replace function public.rooms_respond_live_call_invitation_v1", "create or replace function public.rooms_set_live_call_route_v1", "for update"],
      ["create or replace function public.rooms_set_live_call_route_v1", "create or replace function public.rooms_set_live_call_on_air_v1", "for update"],
      ["create or replace function public.rooms_set_live_call_on_air_v1", "create or replace function public.rooms_end_live_call_invitation_v1", "for update"],
      ["create or replace function public.rooms_authorize_live_call_media_v1", "create or replace function public.rooms_expire_live_call_invitations_v1", "for update"],
    ] as const;
    for (const [start, end, rowLock] of lockOrderedPaths) {
      const path = sql.slice(sql.indexOf(start), sql.indexOf(end));
      expect(path.indexOf("meewav:rooms:program-transition:")).toBeGreaterThan(-1);
      expect(path.indexOf("meewav:rooms:program-transition:")).toBeLessThan(path.indexOf(rowLock));
    }
  });

  it("expires ringing and accepted calls and revokes on Room, direct-contact, block and ban changes", () => {
    const expiry = sql.slice(
      sql.indexOf("create or replace function public.rooms_expire_live_call_invitations_internal_v1"),
      sql.indexOf("create or replace function public.rooms_live_call_revocation_changed_v1"),
    );
    expect(expiry).toContain("invitation.invitation_expires_at <= now()");
    expect(expiry).toContain("invitation.session_expires_at <= now()");
    expect(sql).toContain("room_live_call_invitations_v1_accepted_state_check");
    expect(expiry).toContain("for update skip locked");
    expect(sql).toContain("rooms_end_live_calls_for_room_update_v1");
    expect(sql).toContain("rooms_end_live_calls_for_membership_change_v1");
    expect(sql).toContain("rooms_end_live_calls_for_conversation_update_v1");
    expect(sql).toContain("rooms_end_live_calls_for_block_v1");
    expect(sql).toContain("rooms_end_live_calls_for_ban_v1");
    expect(sql).toContain("rooms_end_live_calls_for_kick_v1");
  });

  it("rejects both durable bans and kick records on every authorization path", () => {
    const accessGuard = sql.slice(
      sql.indexOf("create or replace function public.rooms_live_call_room_access_revoked_v1"),
      sql.indexOf("create or replace function public.rooms_enqueue_live_call_revocation_internal_v1"),
    );
    expect(accessGuard).toContain("public.room_bans_v2 ban");
    expect(accessGuard).toContain("public.room_kicks_v2 kick");
    expect(accessGuard).toContain("public.room_participants_v2 participant");
    expect(accessGuard).toContain("participant.left_at is null");

    const authorizationPaths = [
      ["create or replace function public.rooms_list_live_call_contacts_v1", "create or replace function public.rooms_invite_live_call_contact_v1"],
      ["create or replace function public.rooms_invite_live_call_contact_v1", "create or replace function public.rooms_list_my_live_call_invitations_v1"],
      ["create or replace function public.rooms_respond_live_call_invitation_v1", "create or replace function public.rooms_set_live_call_route_v1"],
      ["create or replace function public.rooms_set_live_call_route_v1", "create or replace function public.rooms_end_live_call_invitation_v1"],
      ["create or replace function public.rooms_authorize_live_call_media_v1", "create or replace function public.rooms_expire_live_call_invitations_v1"],
    ] as const;
    for (const [start, end] of authorizationPaths) {
      expect(sql.slice(sql.indexOf(start), sql.indexOf(end)))
        .toContain("rooms_live_call_room_access_revoked_v1");
    }
  });

  it("allows concurrent ringing across Rooms but only one accepted call per contact", () => {
    expect(sql).toMatch(
      /create unique index if not exists room_live_call_invitations_v1_one_accepted_per_contact_idx\s+on public\.room_live_call_invitations_v1\(contact_profile_id\)\s+where status = 'accepted'/i,
    );
    expect(sql).not.toMatch(
      /room_live_call_invitations_v1_one_accepted_per_contact_idx[\s\S]{0,180}pending/i,
    );

    const respond = sql.slice(
      sql.indexOf("create or replace function public.rooms_respond_live_call_invitation_v1"),
      sql.indexOf("create or replace function public.rooms_set_live_call_route_v1"),
    );
    const contactLock = respond.indexOf("rooms:live-call-contact-accept:");
    const acceptedProbe = respond.indexOf("accepted_call.status = 'accepted'");
    expect(contactLock).toBeGreaterThan(-1);
    expect(contactLock).toBeLessThan(acceptedProbe);
    expect(respond).toContain("accepted_call.id <> v_invitation.id");
    expect(respond).toContain("live_call_contact_busy");
  });

  it("keeps writes private and limits reads to the Host and invited contact", () => {
    expect(sql).toContain("alter table public.room_live_call_invitations_v1 enable row level security");
    expect(sql).toContain("auth.uid() in (host_id, contact_profile_id)");
    expect(sql).toContain(
      "revoke all on table public.room_live_call_invitations_v1\n  from public, anon, authenticated",
    );
    expect(sql).toContain("grant select on table public.room_live_call_invitations_v1 to authenticated");
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all) on table public\.room_live_call_invitations_v1\s+to authenticated/i);
    expect(sql).toContain("live_call_service_role_required");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("authorizes only accepted parties into a deterministic private audio room", () => {
    const media = sql.slice(
      sql.indexOf("create or replace function public.rooms_authorize_live_call_media_v1"),
      sql.indexOf("create or replace function public.rooms_expire_live_call_invitations_v1"),
    );
    expect(media).toContain("rooms_live_call_require_service_role_v1");
    expect(media).toContain("v_invitation.status <> 'accepted'");
    expect(media).toContain("p_user_id = v_invitation.host_id");
    expect(media).toContain("p_user_id = v_invitation.contact_profile_id");
    expect(media).toContain("for update");
    expect(media).not.toContain("for key share");
    expect(media).toContain("'mw-call-'");
    expect(media).toContain("'participant_identity'");
    expect(media).toContain("'peer_identity'");
    expect(sql).toContain(
      "grant execute on function public.rooms_authorize_live_call_media_v1(uuid, uuid)\n  to service_role",
    );
  });

  it("serializes and rate-limits token minting per invitation and globally per user", () => {
    const media = sql.slice(
      sql.indexOf("create or replace function public.rooms_authorize_live_call_media_v1"),
      sql.indexOf("create or replace function public.rooms_expire_live_call_invitations_v1"),
    );
    expect(sql).toContain("create table if not exists public.room_live_call_token_windows_v1");
    expect(sql).toContain("primary key (invitation_id, user_id)");
    expect(sql).toContain("alter table public.room_live_call_token_windows_v1 enable row level security");
    expect(sql).toContain(
      "revoke all on table public.room_live_call_token_windows_v1\n  from public, anon, authenticated",
    );
    expect(sql).toContain("create table if not exists public.room_live_call_user_token_windows_v1");
    expect(sql).toContain("alter table public.room_live_call_user_token_windows_v1 enable row level security");
    expect(sql).toContain(
      "revoke all on table public.room_live_call_user_token_windows_v1\n  from public, anon, authenticated",
    );
    const userLock = media.indexOf("rooms:live-call-token-user:");
    const tokenLock = media.indexOf("rooms:live-call-token:");
    const userCount = media.indexOf("v_user_token_window.issued_count >= 80");
    const tokenCount = media.indexOf("v_token_window.issued_count >= 10");
    expect(userLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(tokenLock);
    expect(userLock).toBeLessThan(userCount);
    expect(tokenLock).toBeGreaterThan(-1);
    expect(tokenLock).toBeLessThan(tokenCount);
    expect(userCount).toBeLessThan(tokenCount);
    expect(media).toContain("now() - interval '1 minute'");
    expect(media.match(/live_call_token_rate_limit/g)).toHaveLength(2);
    expect(media).toContain("for update");
  });

  it("uses a leased, idempotent outbox and rechecks stale revocations", () => {
    expect(sql).toContain("create table if not exists public.room_live_call_revocation_outbox_v1");
    expect(sql).toContain("'detach_public_mix', 'end_private_call'");
    expect(sql).toContain("'cleanup_private_call'");
    expect(sql).toContain("now() + interval '40 seconds'");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("lease_token = gen_random_uuid()");
    expect(sql).toContain("rooms_live_call_revocation_should_execute_v1");
    expect(sql).toContain("superseded_by_route_reenable");
    expect(sql).toContain("when v_attempt_count >= 8 then 'dead'");
    expect(sql).toContain(
      "revoke all on table public.room_live_call_revocation_outbox_v1\n  from public, anon, authenticated",
    );
  });
});
