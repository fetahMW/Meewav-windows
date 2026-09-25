-- Host public-mix gain is distinct from the Guest's personal monitor gain.
-- Personal vocal FX remain device-local and are intentionally absent here.
alter table public.room_mixer_state_v2
  add column if not exists host_music_gain real not null default 1.0;

alter table public.room_polls_v2
  add column if not exists revision bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_host_music_gain_check'
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_host_music_gain_check
      check (host_music_gain >= 0 and host_music_gain <= 1);
  end if;
end $$;

create or replace function public.rooms_set_host_guest_mic_gain_v3(
  p_room_id uuid,
  p_guest_id uuid,
  p_gain double precision
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  if p_guest_id is null or p_gain is null or p_gain < 0 or p_gain > 1 then
    raise exception 'Invalid guest gain.';
  end if;

  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = p_room_id and room.host_id = p_guest_id
  ) and not exists (
    select 1 from public.room_invitations_v2 invitation
    where invitation.room_id = p_room_id
      and invitation.guest_id = p_guest_id
      and invitation.status in ('ready', 'backstage', 'onstage')
  ) then
    raise exception 'Guest is not available in this Room mixer.';
  end if;

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    mic_gain,
    updated_at
  ) values (
    p_room_id,
    p_guest_id,
    p_gain,
    now()
  )
  on conflict (room_id, guest_id)
  do update set
    mic_gain = excluded.mic_gain,
    updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_set_host_guest_mic_gain_v3(uuid, uuid, double precision) from public;
grant execute on function public.rooms_set_host_guest_mic_gain_v3(uuid, uuid, double precision) to authenticated;

create or replace function public.rooms_set_host_guest_music_gain_v3(
  p_room_id uuid,
  p_guest_id uuid,
  p_gain double precision
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  if p_guest_id is null or p_gain is null or p_gain < 0 or p_gain > 1 then
    raise exception 'Invalid guest music gain.';
  end if;

  if not exists (
    select 1 from public.room_invitations_v2 invitation
    where invitation.room_id = p_room_id
      and invitation.guest_id = p_guest_id
      and invitation.status in ('ready', 'backstage', 'onstage')
  ) then
    raise exception 'Guest is not available in this Room mixer.';
  end if;

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    host_music_gain,
    updated_at
  ) values (
    p_room_id,
    p_guest_id,
    p_gain,
    now()
  )
  on conflict (room_id, guest_id)
  do update set
    host_music_gain = excluded.host_music_gain,
    updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_set_host_guest_music_gain_v3(uuid, uuid, double precision) from public;
grant execute on function public.rooms_set_host_guest_music_gain_v3(uuid, uuid, double precision) to authenticated;

create or replace function public.rooms_set_own_music_muted_v3(
  p_room_id uuid,
  p_is_muted boolean
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_active_room_member_v2(p_room_id);

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    is_music_muted,
    audio_updated_at,
    updated_at
  ) values (
    p_room_id,
    auth.uid(),
    p_is_muted,
    now(),
    now()
  )
  on conflict (room_id, guest_id)
  do update set
    is_music_muted = excluded.is_music_muted,
    audio_updated_at = now(),
    updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_set_own_music_muted_v3(uuid, boolean) from public;
grant execute on function public.rooms_set_own_music_muted_v3(uuid, boolean) to authenticated;

create or replace function public.rooms_end_place_v3(p_room_id uuid)
returns public.rooms_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
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

  return v_room;
end;
$$;

revoke all on function public.rooms_end_place_v3(uuid) from public;
grant execute on function public.rooms_end_place_v3(uuid) to authenticated;

create or replace function public.rooms_enter_room_v2(p_room_id uuid)
returns public.room_participants_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.room_participants_v2%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.rooms_v2 where id = p_room_id and status = 'live') then
    raise exception 'Room is not active.';
  end if;
  if exists (select 1 from public.room_bans_v2 where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'Current user is banned from this Room.';
  end if;

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

  insert into public.room_participants_v2 (room_id, user_id, role, joined_at, left_at)
  values (p_room_id, auth.uid(), v_role, now(), null)
  on conflict (room_id, user_id)
  do update set role = excluded.role, left_at = null
  returning * into v_participant;
  return v_participant;
end;
$$;

create or replace function public.rooms_leave_room_v2(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if exists (select 1 from public.rooms_v2 where id = p_room_id and host_id = auth.uid() and status <> 'ended') then
    raise exception 'The Host must end the Room.';
  end if;
  update public.room_participants_v2
  set left_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;
end;
$$;

revoke all on function public.rooms_enter_room_v2(uuid) from public;
revoke all on function public.rooms_leave_room_v2(uuid) from public;
grant execute on function public.rooms_enter_room_v2(uuid) to authenticated;
grant execute on function public.rooms_leave_room_v2(uuid) to authenticated;

create or replace function public.rooms_set_queue_open_v3(
  p_room_id uuid,
  p_open boolean
)
returns public.rooms_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);
  update public.rooms_v2
  set queue_open = p_open, updated_at = now()
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.rooms_end_guest_passage_v3(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  select * into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id and ended_at is null
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

  return v_invitation;
end;
$$;

revoke all on function public.rooms_set_queue_open_v3(uuid, boolean) from public;
revoke all on function public.rooms_end_guest_passage_v3(uuid) from public;
grant execute on function public.rooms_set_queue_open_v3(uuid, boolean) to authenticated;
grant execute on function public.rooms_end_guest_passage_v3(uuid) to authenticated;

-- Poll time is enforced atomically. The client timer is presentation only.
drop policy if exists "Voter une fois non host" on public.room_poll_votes_v2;
create policy "Voter une fois non host"
  on public.room_poll_votes_v2
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.room_polls_v2 poll
      join public.rooms_v2 room on room.id = poll.room_id
      where poll.id = room_poll_votes_v2.poll_id
        and poll.is_active = true
        and poll.created_at + make_interval(secs => poll.duration_seconds) > now()
        and poll.host_id <> auth.uid()
        and room.status = 'live'
        and room_poll_votes_v2.option_index >= 0
        and room_poll_votes_v2.option_index < jsonb_array_length(poll.options)
        and exists (
          select 1 from public.room_participants_v2 participant
          where participant.room_id = poll.room_id
            and participant.user_id = auth.uid()
            and participant.left_at is null
        )
        and not exists (
          select 1 from public.room_bans_v2 ban
          where ban.room_id = poll.room_id and ban.user_id = auth.uid()
        )
    )
  );

create or replace function public.rooms_vote_poll_v2(
  p_poll_id uuid,
  p_option_index integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.room_polls_v2%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select * into v_poll
  from public.room_polls_v2
  where id = p_poll_id
  for update;

  if not found then raise exception 'Poll not found.'; end if;
  if v_poll.is_active = false
    or v_poll.created_at + make_interval(secs => v_poll.duration_seconds) <= now() then
    raise exception 'Poll is closed.';
  end if;
  if v_poll.host_id = auth.uid() then raise exception 'Host cannot vote.'; end if;
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_poll.options) then
    raise exception 'Invalid poll option.';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    join public.room_participants_v2 participant on participant.room_id = room.id
    where room.id = v_poll.room_id
      and room.status = 'live'
      and participant.user_id = auth.uid()
      and participant.left_at is null
  ) then
    raise exception 'Active Room membership required.';
  end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = v_poll.room_id and ban.user_id = auth.uid()
  ) then
    raise exception 'Current user is banned from this Room.';
  end if;

  insert into public.room_poll_votes_v2 (poll_id, user_id, option_index)
  values (p_poll_id, auth.uid(), p_option_index)
  on conflict (poll_id, user_id) do nothing;

  if found then
    update public.room_polls_v2
    set revision = revision + 1
    where id = p_poll_id;
  end if;
end;
$$;

revoke all on function public.rooms_vote_poll_v2(uuid, integer) from public;
grant execute on function public.rooms_vote_poll_v2(uuid, integer) to authenticated;

create or replace function public.rooms_poll_state_v3(p_poll_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poll public.room_polls_v2%rowtype;
  v_counts jsonb;
  v_current_vote integer;
begin
  select * into v_poll
  from public.room_polls_v2
  where id = p_poll_id;

  if not found then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'option_index', series.option_position,
        'votes', (
          select count(*) from public.room_poll_votes_v2 vote
          where vote.poll_id = p_poll_id and vote.option_index = series.option_position
        )
      ) order by series.option_position
    ),
    '[]'::jsonb
  ) into v_counts
  from generate_series(0, jsonb_array_length(v_poll.options) - 1) as series(option_position);

  if auth.uid() is not null then
    select vote.option_index into v_current_vote
    from public.room_poll_votes_v2 vote
    where vote.poll_id = p_poll_id and vote.user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'counts', v_counts,
    'current_user_vote_index', v_current_vote,
    'ends_at', v_poll.created_at + make_interval(secs => v_poll.duration_seconds)
  );
end;
$$;

revoke all on function public.rooms_poll_state_v3(uuid) from public;
grant execute on function public.rooms_poll_state_v3(uuid) to anon, authenticated, service_role;

grant execute on function public.rooms_set_host_guest_mic_gain_v3(uuid, uuid, double precision) to service_role;
grant execute on function public.rooms_set_host_guest_music_gain_v3(uuid, uuid, double precision) to service_role;
grant execute on function public.rooms_set_own_music_muted_v3(uuid, boolean) to service_role;
grant execute on function public.rooms_end_place_v3(uuid) to service_role;
grant execute on function public.rooms_enter_room_v2(uuid) to service_role;
grant execute on function public.rooms_leave_room_v2(uuid) to service_role;
grant execute on function public.rooms_set_queue_open_v3(uuid, boolean) to service_role;
grant execute on function public.rooms_end_guest_passage_v3(uuid) to service_role;
grant execute on function public.rooms_vote_poll_v2(uuid, integer) to service_role;

drop policy if exists "Voir les votes" on public.room_poll_votes_v2;
create policy "Voir uniquement son vote"
  on public.room_poll_votes_v2
  for select
  to authenticated
  using (user_id = auth.uid());

-- Green House, queue and personal mixer data are not public audience data.
drop policy if exists "Voir les invitations" on public.room_invitations_v2;
create policy "Host et Guest voient leurs invitations"
  on public.room_invitations_v2
  for select
  to authenticated
  using (
    guest_id = auth.uid()
    or exists (
      select 1 from public.rooms_v2 room
      where room.id = room_invitations_v2.room_id and room.host_id = auth.uid()
    )
  );

drop policy if exists "Voir la file" on public.room_queue_v2;
create policy "Host et candidat voient la file"
  on public.room_queue_v2
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.rooms_v2 room
      where room.id = room_queue_v2.room_id and room.host_id = auth.uid()
    )
  );

drop policy if exists "Voir le mixer" on public.room_mixer_state_v2;
create policy "Host et propriétaire voient le mixer"
  on public.room_mixer_state_v2
  for select
  to authenticated
  using (
    guest_id = auth.uid()
    or exists (
      select 1 from public.rooms_v2 room
      where room.id = room_mixer_state_v2.room_id and room.host_id = auth.uid()
    )
  );

-- Restore the single MeeWav Golden Like contract: one allowance per
-- Europe/Paris calendar day, shared by Globe, Profiles, La Scène and Rooms.
create or replace function public.check_golden_like_cooldown()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := public.current_golden_like_day();
begin
  if auth.uid() is not null and new.giver_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'golden_like_giver_mismatch';
  end if;
  if new.giver_id = new.recipient_id then
    raise exception using errcode = '23514', message = 'cannot_golden_like_self';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = new.recipient_id
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
  ) then
    raise exception using errcode = '23503', message = 'recipient_profile_not_available';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.giver_id::text || ':' || v_day::text, 0));
  new.given_at := clock_timestamp();
  new.day_date := v_day;

  if exists (
    select 1 from public.daily_golden_likes golden
    where golden.giver_id = new.giver_id and golden.day_date = v_day
  ) then
    raise exception using errcode = '23505', message = 'golden_like_already_used_today';
  end if;
  return new;
end;
$$;

create or replace function public.rooms_engagement_state_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_day date := public.current_golden_like_day();
  v_likes_count bigint := 0;
  v_golden_likes_count bigint := 0;
  v_has_liked boolean := false;
  v_has_golden_liked boolean := false;
  v_used_today boolean := false;
  v_available_at timestamptz;
begin
  if not exists (select 1 from public.rooms_v2 room where room.id = p_room_id) then
    raise exception 'Room introuvable';
  end if;

  select
    coalesce(sum(reaction.count) filter (where reaction.type = 'room_like'), 0),
    coalesce(sum(reaction.count) filter (where reaction.type = 'golden_like'), 0)
  into v_likes_count, v_golden_likes_count
  from public.room_reactions_v2 reaction
  where reaction.room_id = p_room_id;

  if v_user_id is not null then
    select exists (
      select 1 from public.room_reactions_v2 reaction
      where reaction.room_id = p_room_id
        and reaction.user_id = v_user_id
        and reaction.type = 'room_like'
    ) into v_has_liked;

    select exists (
      select 1 from public.room_reactions_v2 reaction
      where reaction.room_id = p_room_id
        and reaction.user_id = v_user_id
        and reaction.type = 'golden_like'
        and (reaction.created_at at time zone 'Europe/Paris')::date = v_day
    ) into v_has_golden_liked;

    select exists (
      select 1 from public.daily_golden_likes golden
      where golden.giver_id = v_user_id and golden.day_date = v_day
    ) into v_used_today;
  end if;

  v_available_at := case when v_used_today
    then ((v_day + 1)::timestamp at time zone 'Europe/Paris')
    else null
  end;

  return jsonb_build_object(
    'likes_count', v_likes_count,
    'golden_likes_count', v_golden_likes_count,
    'current_user_has_liked', v_has_liked,
    'current_user_has_golden_liked', v_has_golden_liked,
    'golden_like_available_at', v_available_at
  );
end;
$$;

revoke all on function public.rooms_engagement_state_v1(uuid) from public, anon;
grant execute on function public.rooms_engagement_state_v1(uuid) to authenticated, service_role;

-- A Like is a Viewer/Guest interaction, never a Host control, and is only
-- accepted while the antenna is genuinely live.
create or replace function public.rooms_like_v1(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;

  if not exists (
    select 1
    from public.rooms_v2 room
    join public.room_participants_v2 participant
      on participant.room_id = room.id
     and participant.user_id = v_user_id
     and participant.left_at is null
    where room.id = p_room_id
      and room.status = 'live'
      and room.host_id <> v_user_id
  ) then
    raise exception 'Seul un Viewer ou Guest actif peut liker ce live';
  end if;

  insert into public.room_reactions_v2 (room_id, user_id, type, emoji, count)
  values (p_room_id, v_user_id, 'room_like', 'heart', 1)
  on conflict (room_id, user_id) where type = 'room_like'
  do nothing;

  return public.rooms_engagement_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_like_v1(uuid) from public, anon;
grant execute on function public.rooms_like_v1(uuid) to authenticated, service_role;

create or replace function public.rooms_give_golden_like_v1(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;

  select room.host_id into v_recipient_id
  from public.rooms_v2 room
  join public.room_participants_v2 participant
    on participant.room_id = room.id
   and participant.user_id = v_user_id
   and participant.left_at is null
  where room.id = p_room_id
    and room.status = 'live'
    and room.host_id <> v_user_id;

  if v_recipient_id is null then
    raise exception 'Seul un Viewer ou Guest actif peut offrir un Golden Like';
  end if;

  insert into public.daily_golden_likes (giver_id, recipient_id)
  values (v_user_id, v_recipient_id);

  insert into public.room_reactions_v2 (room_id, user_id, type, emoji, count)
  values (p_room_id, v_user_id, 'golden_like', 'star', 1);

  return public.rooms_engagement_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_give_golden_like_v1(uuid) from public, anon;
grant execute on function public.rooms_give_golden_like_v1(uuid) to authenticated, service_role;
