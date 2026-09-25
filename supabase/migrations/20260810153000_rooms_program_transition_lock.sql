-- Serialize every mutation that can change the public La Place stage with the
-- authoritative PROGRAM layout. The shared advisory key is acquired before
-- any invitation, participant or Room row lock, preventing an MVCC snapshot
-- from persisting a layout based on the previous stage membership.

create or replace function public.rooms_reconcile_program_layout_v1(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_status text;
  v_room_type text;
  v_allowed_ids text[];
  v_clean_order text[] := '{}'::text[];
  v_clean_sources jsonb;
  v_clean_framing jsonb;
  v_primary text;
  v_locked text;
  v_participant_id text;
  v_layout public.room_program_layout_v1%rowtype;
begin
  -- Every caller that mutates stage membership uses this exact key. Keeping
  -- the lock here as well makes the invariant impossible to bypass from a
  -- future SECURITY DEFINER transition function.
  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
  );

  select room.status, room.type
    into v_room_status, v_room_type
  from public.rooms_v2 room
  where room.id = p_room_id;

  if not found then
    return;
  end if;

  -- An ended/non-Place Room has no valid PROGRAM primary. The row is derived
  -- live state, so removing it is safer than retaining references to a stage
  -- that no longer exists.
  if v_room_status <> 'live' or v_room_type <> 'place' then
    delete from public.room_program_layout_v1
    where room_id = p_room_id;
    return;
  end if;

  select array_prepend(
    'host'::text,
    coalesce(
      array_agg(
        invitation.guest_id::text
        order by coalesce(invitation.onstage_at, invitation.created_at), invitation.guest_id
      ),
      '{}'::text[]
    )
  )
    into v_allowed_ids
  from public.room_invitations_v2 invitation
  where invitation.room_id = p_room_id
    and invitation.status = 'onstage'
    and invitation.ended_at is null
    and exists (
      select 1
      from public.room_participants_v2 participant
      where participant.room_id = invitation.room_id
        and participant.user_id = invitation.guest_id
        and participant.left_at is null
    );

  select *
    into v_layout
  from public.room_program_layout_v1
  where room_id = p_room_id
  for update;

  if not found then
    return;
  end if;

  -- Preserve the director's surviving order, remove stale/duplicate entries,
  -- then append newly eligible participants deterministically.
  foreach v_participant_id in array coalesce(v_layout.participant_order, '{}'::text[])
  loop
    if v_participant_id = any(v_allowed_ids)
      and not (v_participant_id = any(v_clean_order)) then
      v_clean_order := array_append(v_clean_order, v_participant_id);
    end if;
  end loop;

  foreach v_participant_id in array v_allowed_ids
  loop
    if not (v_participant_id = any(v_clean_order)) then
      v_clean_order := array_append(v_clean_order, v_participant_id);
    end if;
  end loop;

  if v_layout.primary_participant_id = any(v_allowed_ids) then
    v_primary := v_layout.primary_participant_id;
  elsif 'host' = any(v_allowed_ids) then
    v_primary := 'host';
  else
    v_primary := v_allowed_ids[1];
  end if;

  v_locked := case
    when v_layout.locked_participant_id = any(v_allowed_ids)
      then v_layout.locked_participant_id
    else null
  end;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
    into v_clean_sources
  from jsonb_each(coalesce(v_layout.selected_source_by_participant, '{}'::jsonb)) item
  where item.key = any(v_allowed_ids);

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
    into v_clean_framing
  from jsonb_each(coalesce(v_layout.safe_framing_by_participant, '{}'::jsonb)) item
  where item.key = any(v_allowed_ids);

  if v_layout.primary_participant_id is distinct from v_primary
    or v_layout.locked_participant_id is distinct from v_locked
    or v_layout.participant_order is distinct from v_clean_order
    or v_layout.selected_source_by_participant is distinct from v_clean_sources
    or v_layout.safe_framing_by_participant is distinct from v_clean_framing then
    update public.room_program_layout_v1
    set revision = revision + 1,
        primary_participant_id = v_primary,
        locked_participant_id = v_locked,
        participant_order = v_clean_order,
        selected_source_by_participant = v_clean_sources,
        safe_framing_by_participant = v_clean_framing,
        updated_by = coalesce(auth.uid(), v_layout.updated_by),
        updated_at = now()
    where room_id = p_room_id;
  end if;
end;
$$;

create or replace function public.rooms_move_invitation_to_backstage_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select invitation.room_id
    into v_room_id
  from public.room_invitations_v2 invitation
  where invitation.id = p_invitation_id
    and invitation.ended_at is null;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || v_room_id::text, 0)
  );

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and room_id = v_room_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status not in ('ready', 'onstage') then
    raise exception 'Invite non pret pour les coulisses';
  end if;

  update public.room_invitations_v2
  set
    status = 'backstage',
    backstage_at = coalesce(backstage_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  perform public.rooms_reconcile_program_layout_v1(v_invitation.room_id);
  return v_invitation;
end;
$$;

create or replace function public.rooms_move_invitation_to_stage_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_invitation public.room_invitations_v2%rowtype;
  v_onstage_count integer;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select invitation.room_id
    into v_room_id
  from public.room_invitations_v2 invitation
  where invitation.id = p_invitation_id
    and invitation.ended_at is null;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || v_room_id::text, 0)
  );

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and room_id = v_room_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status <> 'backstage' then
    raise exception 'Seules les coulisses peuvent monter sur scene';
  end if;

  select count(*)
    into v_onstage_count
  from public.room_invitations_v2
  where room_id = v_invitation.room_id
    and status = 'onstage'
    and ended_at is null
    and id <> p_invitation_id;

  if v_onstage_count >= 3 then
    raise exception 'Scene limitee a trois invites';
  end if;

  update public.room_invitations_v2
  set
    status = 'onstage',
    onstage_at = coalesce(onstage_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  perform public.rooms_reconcile_program_layout_v1(v_invitation.room_id);
  return v_invitation;
end;
$$;

create or replace function public.rooms_move_invitation_to_invitations_v2(
  p_invitation_id uuid,
  p_requires_setup boolean default false
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_invitation public.room_invitations_v2%rowtype;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select invitation.room_id
    into v_room_id
  from public.room_invitations_v2 invitation
  where invitation.id = p_invitation_id
    and invitation.ended_at is null;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || v_room_id::text, 0)
  );

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and room_id = v_room_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status not in ('ready', 'backstage', 'onstage') then
    raise exception 'Invite non redescendable';
  end if;

  v_next_status := case when p_requires_setup then 'accepted' else 'ready' end;

  update public.room_invitations_v2
  set status = v_next_status
  where id = p_invitation_id
  returning *
    into v_invitation;

  if p_requires_setup then
    perform public.rooms_v2_clear_guest_runtime(v_invitation.room_id, v_invitation.guest_id, false);
  else
    perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  end if;

  perform public.rooms_reconcile_program_layout_v1(v_invitation.room_id);
  return v_invitation;
end;
$$;

create or replace function public.rooms_kick_invitation_v2(
  p_invitation_id uuid,
  p_reason text default 'host_kick'
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select invitation.room_id
    into v_room_id
  from public.room_invitations_v2 invitation
  where invitation.id = p_invitation_id
    and invitation.ended_at is null;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || v_room_id::text, 0)
  );

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and room_id = v_room_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_kick_user_v2(v_invitation.room_id, v_invitation.guest_id, p_reason);

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id;

  return v_invitation;
end;
$$;

create or replace function public.rooms_end_guest_passage_v3(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_invitation public.room_invitations_v2%rowtype;
begin
  select invitation.room_id
    into v_room_id
  from public.room_invitations_v2 invitation
  where invitation.id = p_invitation_id
    and invitation.ended_at is null;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || v_room_id::text, 0)
  );

  select * into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and room_id = v_room_id
    and ended_at is null
  for update;

  if not found then raise exception 'Invitation not found.'; end if;
  perform public.rooms_assert_room_host_v2(v_invitation.room_id);

  update public.room_invitations_v2
  set status = 'ended', ended_at = now()
  where id = p_invitation_id
  returning * into v_invitation;

  update public.room_participants_v2
  set left_at = coalesce(left_at, now())
  where room_id = v_invitation.room_id
    and user_id = v_invitation.guest_id
    and left_at is null;

  update public.room_queue_v2
  set removed_at = coalesce(removed_at, now())
  where room_id = v_invitation.room_id
    and user_id = v_invitation.guest_id
    and removed_at is null;

  delete from public.room_mixer_state_v2
  where room_id = v_invitation.room_id and guest_id = v_invitation.guest_id;

  perform public.rooms_reconcile_program_layout_v1(v_invitation.room_id);
  return v_invitation;
end;
$$;

create or replace function public.rooms_end_place_v3(p_room_id uuid)
returns public.rooms_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
  );
  perform public.rooms_assert_room_host_v2(p_room_id);

  update public.rooms_v2
  set status = 'ended', ended_at = now(), updated_at = now()
  where id = p_room_id
  returning * into v_room;

  update public.room_participants_v2
  set left_at = coalesce(left_at, now())
  where room_id = p_room_id and left_at is null;

  update public.room_invitations_v2
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where room_id = p_room_id
    and status in ('pending', 'accepted', 'ready', 'backstage', 'onstage');

  update public.room_queue_v2
  set removed_at = coalesce(removed_at, now())
  where room_id = p_room_id and removed_at is null;

  update public.room_polls_v2
  set is_active = false, ended_at = coalesce(ended_at, now())
  where room_id = p_room_id and is_active = true;

  update public.room_pinned_items_v2
  set is_active = false, updated_at = now()
  where room_id = p_room_id and is_active = true;

  update public.room_broadcasts_v2
  set mux_status = 'stopped',
      byteplus_status = 'stopped',
      stopped_at = coalesce(stopped_at, now()),
      updated_at = now()
  where room_id = p_room_id;

  perform public.rooms_reconcile_program_layout_v1(p_room_id);
  return v_room;
end;
$$;

create or replace function public.rooms_enter_room_v2(p_room_id uuid)
returns public.room_participants_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.room_participants_v2%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select case
    when room.host_id = auth.uid() then 'host'
    when exists (
      select 1 from public.room_invitations_v2 invitation
      where invitation.room_id = p_room_id
        and invitation.guest_id = auth.uid()
        and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
    ) then 'guest'
    else 'viewer'
  end
  into v_role from public.rooms_v2 room where room.id = p_room_id;

  -- Ordinary viewers never participate in PROGRAM membership and must not be
  -- serialized behind the director. Hosts and invited guests do, because an
  -- invitation transition can concurrently move them on stage.
  if v_role in ('host', 'guest') then
    perform pg_advisory_xact_lock(
      hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
    );
  end if;

  if not exists (select 1 from public.rooms_v2 where id = p_room_id and status = 'live') then
    raise exception 'Room is not active.';
  end if;
  if exists (select 1 from public.room_bans_v2 where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'Current user is banned from this Room.';
  end if;

  insert into public.room_participants_v2 (room_id, user_id, role, joined_at, left_at)
  values (p_room_id, auth.uid(), v_role, now(), null)
  on conflict (room_id, user_id)
  do update set role = excluded.role, left_at = null
  returning * into v_participant;

  if v_role in ('host', 'guest') then
    perform public.rooms_reconcile_program_layout_v1(p_room_id);
  end if;
  return v_participant;
end;
$$;

create or replace function public.rooms_leave_room_v2(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_affects_program boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select room.host_id = auth.uid()
      or exists (
        select 1
        from public.room_invitations_v2 invitation
        where invitation.room_id = p_room_id
          and invitation.guest_id = auth.uid()
          and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
          and invitation.ended_at is null
      )
    into v_affects_program
  from public.rooms_v2 room
  where room.id = p_room_id;

  if coalesce(v_affects_program, false) then
    perform pg_advisory_xact_lock(
      hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
    );
  end if;

  if exists (select 1 from public.rooms_v2 where id = p_room_id and host_id = auth.uid() and status <> 'ended') then
    raise exception 'The Host must end the Room.';
  end if;
  update public.room_participants_v2
  set left_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  if coalesce(v_affects_program, false) then
    perform public.rooms_reconcile_program_layout_v1(p_room_id);
  end if;
end;
$$;

create or replace function public.rooms_kick_user_v2(
  p_room_id uuid,
  p_user_id uuid,
  p_reason text default 'host_kick'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
  );
  v_room := public.rooms_assert_room_moderator_v2(p_room_id);
  perform public.rooms_assert_moderation_target_v2(p_room_id, p_user_id);

  insert into public.room_kicks_v2 (room_id, user_id, kicked_by, reason)
  values (p_room_id, p_user_id, auth.uid(), p_reason);

  update public.room_invitations_v2
  set
    status = 'kicked',
    ended_at = coalesce(ended_at, now())
  where room_id = p_room_id
    and guest_id = p_user_id
    and ended_at is null
    and status in ('pending', 'accepted', 'ready', 'backstage', 'onstage');

  update public.room_queue_v2
  set removed_at = now()
  where room_id = p_room_id
    and user_id = p_user_id
    and removed_at is null;

  perform public.rooms_v2_clear_guest_runtime(p_room_id, p_user_id, true);
  perform public.rooms_reconcile_program_layout_v1(p_room_id);

  insert into public.room_events_v2 (room_id, triggered_by, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'user_kicked',
    jsonb_build_object(
      'user_id', p_user_id,
      'reason', coalesce(p_reason, 'host_kick')
    )
  );
end;
$$;

create or replace function public.rooms_ban_user_v2(
  p_room_id uuid,
  p_user_id uuid,
  p_reason text default 'host_ban'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
  );
  perform public.rooms_assert_room_moderator_v2(p_room_id);
  perform public.rooms_assert_moderation_target_v2(p_room_id, p_user_id);

  insert into public.room_bans_v2 (room_id, user_id, banned_by, reason)
  values (p_room_id, p_user_id, auth.uid(), p_reason)
  on conflict (room_id, user_id)
  do update set
    banned_by = excluded.banned_by,
    reason = excluded.reason,
    created_at = now();

  perform public.rooms_kick_user_v2(p_room_id, p_user_id, coalesce(p_reason, 'host_ban'));

  insert into public.room_events_v2 (room_id, triggered_by, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    'user_banned',
    jsonb_build_object(
      'user_id', p_user_id,
      'reason', coalesce(p_reason, 'host_ban')
    )
  );
end;
$$;

create or replace function public.rooms_set_program_layout_v1(
  p_room_id uuid,
  p_expected_revision bigint,
  p_layout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_host_id uuid;
  v_room_status text;
  v_room_type text;
  v_allowed_ids text[];
  v_order text[];
  v_primary text;
  v_locked text;
  v_mode text;
  v_transition text;
  v_preset text;
  v_auto_profile text;
  v_sources jsonb;
  v_safe_framing jsonb;
  v_current_revision bigint;
  v_next_revision bigint;
  v_framing record;
  v_framing_locked boolean;
  v_framing_source_id text;
  v_safe_region jsonb;
  v_region_x numeric;
  v_region_y numeric;
  v_region_width numeric;
  v_region_height numeric;
  v_region_confidence numeric;
  v_max_zoom numeric;
  v_result public.room_program_layout_v1%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meewav:rooms:program-transition:' || p_room_id::text, 0)
  );

  select room.host_id, room.status, room.type
    into v_host_id, v_room_status, v_room_type
  from public.rooms_v2 room
  where room.id = p_room_id
  for update;

  if v_host_id is null then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  if v_host_id <> v_user_id then
    raise exception 'Only the Room host can direct the program layout.' using errcode = '42501';
  end if;
  if v_room_status <> 'live' or v_room_type <> 'place' then
    raise exception 'Program layout can only change during a live Place Room.' using errcode = '55000';
  end if;
  if p_layout is null or jsonb_typeof(p_layout) <> 'object' then
    raise exception 'Invalid program layout payload.' using errcode = '22023';
  end if;
  if octet_length(p_layout::text) > 16384 then
    raise exception 'Program layout payload is too large.' using errcode = '22023';
  end if;

  v_mode := p_layout ->> 'mode';
  v_primary := nullif(btrim(p_layout ->> 'primaryParticipantId'), '');
  v_locked := nullif(btrim(p_layout ->> 'lockedParticipantId'), '');
  v_transition := coalesce(nullif(p_layout ->> 'transition', ''), 'dissolve');
  v_preset := coalesce(nullif(p_layout ->> 'preset', ''), 'performance');
  v_auto_profile := coalesce(nullif(p_layout ->> 'autoDirectorProfile', ''), 'calm');
  v_sources := coalesce(p_layout -> 'selectedSourceByParticipant', '{}'::jsonb);
  v_safe_framing := coalesce(p_layout -> 'safeFramingByParticipant', '{}'::jsonb);

  if v_mode not in ('auto', 'stage', 'grid', 'solo')
    or v_transition not in ('cut', 'dissolve')
    or v_preset not in ('performance', 'discussion', 'collaboration')
    or v_auto_profile not in ('calm', 'dynamic', 'manual') then
    raise exception 'Unsupported program layout option.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_layout -> 'participantOrder') <> 'array'
    or jsonb_typeof(v_sources) <> 'object'
    or jsonb_typeof(v_safe_framing) <> 'object' then
    raise exception 'Invalid program layout collections.' using errcode = '22023';
  end if;

  select coalesce(array_agg(item.value), '{}'::text[])
    into v_order
  from jsonb_array_elements_text(p_layout -> 'participantOrder') with ordinality item(value, position);

  select array_prepend(
    'host'::text,
    coalesce(array_agg(distinct invitation.guest_id::text), '{}'::text[])
  )
    into v_allowed_ids
  from public.room_invitations_v2 invitation
  where invitation.room_id = p_room_id
    and invitation.status = 'onstage'
    and invitation.ended_at is null
    and exists (
      select 1
      from public.room_participants_v2 participant
      where participant.room_id = invitation.room_id
        and participant.user_id = invitation.guest_id
        and participant.left_at is null
    );

  if cardinality(v_allowed_ids) > 4 then
    raise exception 'La Place cannot expose more than three on-stage guests.' using errcode = '23514';
  end if;

  if cardinality(v_order) <> cardinality(v_allowed_ids)
    or exists (
      select 1 from unnest(v_order) as ordered(participant_id)
      where not (ordered.participant_id = any(v_allowed_ids))
    )
    or exists (
      select 1 from unnest(v_allowed_ids) as allowed(participant_id)
      where not (allowed.participant_id = any(v_order))
    )
    or cardinality(v_order) <> (
      select count(distinct ordered.participant_id)
      from unnest(v_order) as ordered(participant_id)
    )
    or v_primary is null
    or not (v_primary = any(v_allowed_ids))
    or not (v_primary = any(v_order))
    or (v_locked is not null and not (v_locked = any(v_allowed_ids))) then
    raise exception 'Program layout references a participant who is not on stage.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(v_sources) source(participant_id, source_id)
    where not (source.participant_id = any(v_allowed_ids))
      or jsonb_typeof(source.source_id) <> 'string'
      or length(trim(both '"' from source.source_id::text)) not between 1 and 128
  ) then
    raise exception 'Selected source references an invalid participant or source identifier.' using errcode = '22023';
  end if;

  for v_framing in
    select framing.participant_id, framing.configuration
    from jsonb_each(v_safe_framing) framing(participant_id, configuration)
  loop
    if not (v_framing.participant_id = any(v_allowed_ids)) then
      raise exception 'Safe framing references a participant who is not on stage.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_framing.configuration) is distinct from 'object'
      or jsonb_typeof(v_framing.configuration -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(v_framing.configuration -> 'locked') is distinct from 'boolean'
      or jsonb_typeof(v_framing.configuration -> 'maxZoom') is distinct from 'number'
      or (v_framing.configuration - array['enabled', 'locked', 'maxZoom', 'sourceId', 'safeRegion']) <> '{}'::jsonb then
      raise exception 'Invalid safe framing configuration.' using errcode = '22023';
    end if;
    begin
      v_framing_locked := (v_framing.configuration ->> 'locked')::boolean;
      v_max_zoom := (v_framing.configuration ->> 'maxZoom')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid safe framing zoom.' using errcode = '22023';
    end;
    if v_max_zoom < 1 or v_max_zoom > 1.18 then
      raise exception 'Safe framing zoom must stay between 1 and 1.18.' using errcode = '22023';
    end if;
    if v_framing_locked then
      v_framing_source_id := nullif(btrim(v_framing.configuration ->> 'sourceId'), '');
      v_safe_region := v_framing.configuration -> 'safeRegion';
      if (v_framing.configuration ->> 'enabled')::boolean is not true
        or jsonb_typeof(v_framing.configuration -> 'sourceId') is distinct from 'string'
        or v_framing_source_id is null
        or length(v_framing_source_id) > 128
        or (v_sources ->> v_framing.participant_id) is distinct from v_framing_source_id
        or jsonb_typeof(v_safe_region) is distinct from 'object'
        or (v_safe_region - array['x', 'y', 'width', 'height', 'confidence']) <> '{}'::jsonb
        or jsonb_typeof(v_safe_region -> 'x') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'y') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'width') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'height') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'confidence') is distinct from 'number' then
        raise exception 'Locked framing requires its selected source and a complete safe region.' using errcode = '22023';
      end if;
      begin
        v_region_x := (v_safe_region ->> 'x')::numeric;
        v_region_y := (v_safe_region ->> 'y')::numeric;
        v_region_width := (v_safe_region ->> 'width')::numeric;
        v_region_height := (v_safe_region ->> 'height')::numeric;
        v_region_confidence := (v_safe_region ->> 'confidence')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Invalid locked safe region.' using errcode = '22023';
      end;
      if v_region_x < 0 or v_region_y < 0
        or v_region_width <= 0 or v_region_height <= 0
        or v_region_x + v_region_width > 1
        or v_region_y + v_region_height > 1
        or v_region_confidence < 0 or v_region_confidence > 1 then
        raise exception 'Locked safe region must remain inside normalized media bounds.' using errcode = '22023';
      end if;
    elsif v_framing.configuration ? 'sourceId' or v_framing.configuration ? 'safeRegion' then
      raise exception 'Unlocked framing cannot retain a frozen source or safe region.' using errcode = '22023';
    end if;
  end loop;

  select layout.revision
    into v_current_revision
  from public.room_program_layout_v1 layout
  where layout.room_id = p_room_id
  for update;

  if found then
    if p_expected_revision is null or p_expected_revision <> v_current_revision then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end if;
    v_next_revision := v_current_revision + 1;

    update public.room_program_layout_v1
    set revision = v_next_revision,
        mode = v_mode,
        primary_participant_id = v_primary,
        locked_participant_id = v_locked,
        participant_order = v_order,
        selected_source_by_participant = v_sources,
        transition = v_transition,
        preset = v_preset,
        auto_director_profile = v_auto_profile,
        safe_framing_by_participant = v_safe_framing,
        updated_by = v_user_id,
        updated_at = now()
    where room_id = p_room_id
    returning * into v_result;
  else
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end if;
    begin
      insert into public.room_program_layout_v1 (
        room_id,
        revision,
        mode,
        primary_participant_id,
        locked_participant_id,
        participant_order,
        selected_source_by_participant,
        transition,
        preset,
        auto_director_profile,
        safe_framing_by_participant,
        updated_by
      ) values (
        p_room_id,
        1,
        v_mode,
        v_primary,
        v_locked,
        v_order,
        v_sources,
        v_transition,
        v_preset,
        v_auto_profile,
        v_safe_framing,
        v_user_id
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end;
  end if;

  return jsonb_build_object(
    'roomId', v_result.room_id,
    'revision', v_result.revision,
    'mode', v_result.mode,
    'primaryParticipantId', v_result.primary_participant_id,
    'lockedParticipantId', v_result.locked_participant_id,
    'participantOrder', to_jsonb(v_result.participant_order),
    'selectedSourceByParticipant', v_result.selected_source_by_participant,
    'transition', v_result.transition,
    'preset', v_result.preset,
    'autoDirectorProfile', v_result.auto_director_profile,
    'safeFramingByParticipant', v_result.safe_framing_by_participant,
    'updatedBy', v_result.updated_by,
    'updatedAt', floor(extract(epoch from v_result.updated_at) * 1000)
  );
end;
$$;

-- Preserve the effective API exposure established by the preceding migrations.
revoke all on function public.rooms_reconcile_program_layout_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_move_invitation_to_backstage_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_move_invitation_to_stage_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_move_invitation_to_invitations_v2(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_kick_invitation_v2(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_kick_user_v2(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_ban_user_v2(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.rooms_move_invitation_to_backstage_v2(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_move_invitation_to_stage_v2(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_move_invitation_to_invitations_v2(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.rooms_kick_invitation_v2(uuid, text)
  to authenticated, service_role;
grant execute on function public.rooms_kick_user_v2(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.rooms_ban_user_v2(uuid, uuid, text)
  to authenticated, service_role;

revoke all on function public.rooms_end_guest_passage_v3(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_place_v3(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_enter_room_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_leave_room_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_set_program_layout_v1(uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.rooms_end_guest_passage_v3(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_end_place_v3(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_enter_room_v2(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_leave_room_v2(uuid)
  to authenticated, service_role;
grant execute on function public.rooms_set_program_layout_v1(uuid, bigint, jsonb) to authenticated;
