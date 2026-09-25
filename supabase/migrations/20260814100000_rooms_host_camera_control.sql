-- Keep the participant's own camera intent separate from Host moderation.
-- A Host may force a Guest camera off, but can only remove that restriction;
-- the Host never turns the participant's physical camera on.

alter table public.room_mixer_state_v2
  add column if not exists self_video_off boolean not null default false,
  add column if not exists host_video_forced_off boolean not null default false;

update public.room_mixer_state_v2
set self_video_off = is_video_off
where is_video_off = true
  and self_video_off = false
  and host_video_forced_off = false;

create or replace function public.rooms_set_own_camera_enabled_v1(
  p_room_id uuid,
  p_enabled boolean
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms_v2%rowtype;
  v_state public.room_mixer_state_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms_v2 room
  where room.id = p_room_id;

  if not found or v_room.type <> 'place' or v_room.status <> 'live' then
    raise exception 'Live Place Room required.' using errcode = '55000';
  end if;
  if v_room.host_id <> v_user_id and not exists (
    select 1
    from public.room_invitations_v2 invitation
    where invitation.room_id = p_room_id
      and invitation.guest_id = v_user_id
      and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
      and invitation.ended_at is null
  ) then
    raise exception 'Camera state is not authorized.' using errcode = '42501';
  end if;

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    self_video_off,
    is_video_off,
    updated_at
  ) values (
    p_room_id,
    v_user_id,
    not p_enabled,
    not p_enabled,
    now()
  )
  on conflict (room_id, guest_id) do update
  set self_video_off = excluded.self_video_off,
      is_video_off = excluded.self_video_off
        or public.room_mixer_state_v2.host_video_forced_off,
      updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.rooms_set_host_camera_forced_off_v1(
  p_room_id uuid,
  p_guest_id uuid,
  p_is_forced_off boolean
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    host_video_forced_off,
    is_video_off,
    updated_at
  ) values (
    p_room_id,
    p_guest_id,
    p_is_forced_off,
    p_is_forced_off,
    now()
  )
  on conflict (room_id, guest_id) do update
  set host_video_forced_off = excluded.host_video_forced_off,
      is_video_off = excluded.host_video_forced_off
        or public.room_mixer_state_v2.self_video_off,
      updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_set_own_camera_enabled_v1(uuid, boolean)
  from public, anon;
grant execute on function public.rooms_set_own_camera_enabled_v1(uuid, boolean)
  to authenticated;

revoke all on function public.rooms_set_host_camera_forced_off_v1(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.rooms_set_host_camera_forced_off_v1(uuid, uuid, boolean)
  to authenticated;
