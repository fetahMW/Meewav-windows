begin;

create or replace function public.rooms_invite_profile_v1(
  p_room_id uuid,
  p_profile_id uuid
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null or p_room_id is null or p_profile_id is null then
    raise exception using errcode = '22023', message = 'room_invitation_invalid_request';
  end if;

  v_room := public.rooms_v2_assert_host(p_room_id);
  if p_profile_id = v_room.host_id then
    raise exception using errcode = '22023', message = 'room_invitation_self_forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:direct-invitation:' || p_room_id::text || ':' || p_profile_id::text,
    0
  ));

  if not exists (select 1 from public.profiles profile where profile.id = p_profile_id)
     or public.messaging_profiles_blocked_v1(v_room.host_id, p_profile_id)
     or exists (
       select 1 from public.room_bans_v2 ban
       where ban.room_id = p_room_id and ban.user_id = p_profile_id
     ) then
    raise exception using errcode = '42501', message = 'room_invitation_profile_unavailable';
  end if;

  insert into public.room_invitations_v2 (
    room_id, host_id, guest_id, status,
    accepted_at, ready_at, backstage_at, onstage_at, ended_at
  ) values (
    p_room_id, v_room.host_id, p_profile_id, 'pending',
    null, null, null, null, null
  )
  on conflict (room_id, guest_id)
  do update set
    host_id = excluded.host_id,
    status = 'pending',
    accepted_at = null,
    ready_at = null,
    backstage_at = null,
    onstage_at = null,
    ended_at = null
  where public.room_invitations_v2.status not in ('declined', 'kicked')
  returning * into v_invitation;

  if v_invitation.id is null then
    raise exception using errcode = '55000', message = 'room_invitation_profile_unavailable';
  end if;
  return v_invitation;
end;
$$;

revoke all on function public.rooms_invite_profile_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_invite_profile_v1(uuid, uuid)
  to authenticated;

comment on function public.rooms_invite_profile_v1(uuid, uuid) is
  'Host-only direct Room invitation for a message contact or a messageable MeeWav profile.';

commit;
