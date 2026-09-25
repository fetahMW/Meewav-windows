-- Public camera intent for the local host/guest. The media plane remains the
-- authority for the actual RTC publication; this state drives the safe public
-- stage projection and is restricted to the current participant.

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
    is_video_off,
    updated_at
  ) values (
    p_room_id,
    v_user_id,
    not p_enabled,
    now()
  )
  on conflict (room_id, guest_id) do update
  set is_video_off = excluded.is_video_off,
      updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_set_own_camera_enabled_v1(uuid, boolean)
  from public, anon;
grant execute on function public.rooms_set_own_camera_enabled_v1(uuid, boolean)
  to authenticated;
