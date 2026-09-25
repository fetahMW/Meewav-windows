alter table public.room_mixer_state_v2
  add column if not exists self_mic_muted boolean not null default false,
  add column if not exists host_mic_forced_muted boolean not null default false,
  add column if not exists audio_live_enabled boolean not null default false,
  add column if not exists audio_preview_ready boolean not null default false,
  add column if not exists audio_playback_state text not null default 'idle',
  add column if not exists audio_track_title text,
  add column if not exists audio_track_artist text,
  add column if not exists audio_track_duration_seconds integer,
  add column if not exists audio_updated_at timestamp with time zone not null default now();
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_mixer_state_v2_audio_playback_state_check'
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_playback_state_check
      check (audio_playback_state in ('idle', 'ready', 'previewing', 'playing', 'paused', 'ended'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_mixer_state_v2_audio_duration_check'
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_duration_check
      check (audio_track_duration_seconds is null or audio_track_duration_seconds >= 0);
  end if;
end $$;
create or replace function public.rooms_assert_active_room_member_v2(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.rooms_v2 r
    where r.id = p_room_id
      and r.status <> 'ended'
  ) then
    raise exception 'Room is not active.';
  end if;

  if not exists (
    select 1
    from public.room_participants_v2 p
    where p.room_id = p_room_id
      and p.user_id = auth.uid()
      and p.left_at is null
  ) then
    raise exception 'Current user is not in this room.';
  end if;
end;
$$;
create or replace function public.rooms_assert_room_host_v2(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.rooms_v2 r
    where r.id = p_room_id
      and r.host_id = auth.uid()
      and r.status <> 'ended'
  ) then
    raise exception 'Current user is not the active room host.';
  end if;
end;
$$;
create or replace function public.rooms_set_own_mic_muted_v2(
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
    self_mic_muted,
    is_mic_muted,
    updated_at
  )
  values (
    p_room_id,
    auth.uid(),
    p_is_muted,
    p_is_muted,
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set self_mic_muted = excluded.self_mic_muted,
        is_mic_muted = case
          when public.room_mixer_state_v2.host_mic_forced_muted then true
          else excluded.self_mic_muted
        end,
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
create or replace function public.rooms_set_host_mic_forced_muted_v2(
  p_room_id uuid,
  p_guest_id uuid,
  p_is_forced_muted boolean
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

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    host_mic_forced_muted,
    is_mic_muted,
    updated_at
  )
  values (
    p_room_id,
    p_guest_id,
    p_is_forced_muted,
    p_is_forced_muted,
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set host_mic_forced_muted = excluded.host_mic_forced_muted,
        is_mic_muted = case
          when excluded.host_mic_forced_muted then true
          else public.room_mixer_state_v2.self_mic_muted
        end,
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
create or replace function public.rooms_set_own_audio_preview_v2(
  p_room_id uuid,
  p_preview_ready boolean,
  p_track_title text default null,
  p_track_artist text default null,
  p_duration_seconds integer default null
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
    audio_preview_ready,
    audio_playback_state,
    audio_track_title,
    audio_track_artist,
    audio_track_duration_seconds,
    audio_updated_at,
    updated_at
  )
  values (
    p_room_id,
    auth.uid(),
    p_preview_ready,
    case when p_preview_ready then 'ready' else 'idle' end,
    p_track_title,
    p_track_artist,
    p_duration_seconds,
    now(),
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set audio_preview_ready = excluded.audio_preview_ready,
        audio_playback_state = excluded.audio_playback_state,
        audio_track_title = excluded.audio_track_title,
        audio_track_artist = excluded.audio_track_artist,
        audio_track_duration_seconds = excluded.audio_track_duration_seconds,
        audio_updated_at = now(),
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
create or replace function public.rooms_set_own_audio_playback_state_v2(
  p_room_id uuid,
  p_playback_state text
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

  if p_playback_state not in ('idle', 'ready', 'previewing', 'playing', 'paused', 'ended') then
    raise exception 'Invalid audio playback state.';
  end if;

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    audio_playback_state,
    audio_updated_at,
    updated_at
  )
  values (
    p_room_id,
    auth.uid(),
    p_playback_state,
    now(),
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set audio_playback_state = excluded.audio_playback_state,
        audio_updated_at = now(),
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
create or replace function public.rooms_set_audio_live_enabled_v2(
  p_room_id uuid,
  p_guest_id uuid,
  p_live_enabled boolean
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

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    audio_live_enabled,
    is_music_muted,
    audio_playback_state,
    audio_updated_at,
    updated_at
  )
  values (
    p_room_id,
    p_guest_id,
    p_live_enabled,
    not p_live_enabled,
    case when p_live_enabled then 'ready' else 'paused' end,
    now(),
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set audio_live_enabled = excluded.audio_live_enabled,
        is_music_muted = excluded.is_music_muted,
        audio_playback_state = case
          when excluded.audio_live_enabled then public.room_mixer_state_v2.audio_playback_state
          else 'paused'
        end,
        audio_updated_at = now(),
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
grant execute on function public.rooms_assert_active_room_member_v2(uuid) to authenticated;
grant execute on function public.rooms_assert_room_host_v2(uuid) to authenticated;
grant execute on function public.rooms_set_own_mic_muted_v2(uuid, boolean) to authenticated;
grant execute on function public.rooms_set_host_mic_forced_muted_v2(uuid, uuid, boolean) to authenticated;
grant execute on function public.rooms_set_own_audio_preview_v2(uuid, boolean, text, text, integer) to authenticated;
grant execute on function public.rooms_set_own_audio_playback_state_v2(uuid, text) to authenticated;
grant execute on function public.rooms_set_audio_live_enabled_v2(uuid, uuid, boolean) to authenticated;
