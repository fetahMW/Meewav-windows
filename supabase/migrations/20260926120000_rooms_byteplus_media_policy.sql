-- One media authority for Android and Windows. Client supplied roles and
-- canPublish flags never participate in this decision.
create or replace function public.rooms_byteplus_media_policy_v1(p_room_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room public.rooms_v2%rowtype;
  v_members jsonb;
  v_member jsonb;
  v_floor uuid;
  v_classe_stage uuid[] := '{}';
  v_type text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_room from public.rooms_v2 where id = p_room_id;
  if not found or v_room.status <> 'live' or to_jsonb(v_room)->>'launch_status' = 'preparing' then
    raise exception 'room_unavailable' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=p_user_id)
    or (v_room.host_id <> p_user_id and not exists(
      select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=p_user_id and left_at is null
    )) then
    raise exception 'room_access_revoked' using errcode = '42501';
  end if;
  v_type := v_room.type;
  -- Earlier specialised Rooms kept type=place. Use their persisted type too.
  select coalesce(room_type, v_type) into v_type from public.room_specialized_state_v1 where room_id=p_room_id;
  v_type := coalesce(v_type, v_room.type);
  if v_type = 'classe' then
    -- The canonical Classe floor grant (used by Android), never local UI state.
    if to_regclass('public.room_classe_floor_requests_v1') is not null then
      execute 'select user_id from public.room_classe_floor_requests_v1 where room_id=$1 and status=''granted'' order by granted_at desc limit 1'
        into v_floor using p_room_id;
    end if;
    if to_regclass('public.room_classe_participations_v1') is not null then
      execute 'select coalesce(array_agg(user_id),''{}''::uuid[]) from public.room_classe_participations_v1 where room_id=$1 and status=''onstage'''
        into v_classe_stage using p_room_id;
    end if;
  end if;
  with active as (
    select p.user_id, p.role from public.room_participants_v2 p
    where p.room_id=p_room_id and p.left_at is null
      and not exists(select 1 from public.room_bans_v2 b where b.room_id=p_room_id and b.user_id=p.user_id)
    union select v_room.host_id, 'host'::text
  ), permissions as (
    select a.user_id,
      a.user_id=v_room.host_id or case when v_type='classe' then coalesce(a.user_id=v_floor,false) or a.user_id=any(v_classe_stage) else
        a.role='guest' and exists(select 1 from public.room_invitations_v2 i
          where i.room_id=p_room_id and i.guest_id=a.user_id and i.status='onstage' and i.ended_at is null)
      end as publish
    from active a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'identity', user_id, 'role', case when user_id=v_room.host_id then 'host' when publish then 'guest' else 'viewer' end,
    'canPublish', coalesce(publish,false), 'canReceive', coalesce(publish,false)
  )), '[]'::jsonb) into v_members from permissions where publish or user_id=p_user_id;
  select value into v_member from jsonb_array_elements(v_members) where value->>'identity'=p_user_id::text limit 1;
  if v_member is null then raise exception 'room_access_revoked' using errcode='42501'; end if;
  return jsonb_build_object('roomId', v_room.id, 'roomName', v_room.livekit_room_name,
    'identity', p_user_id, 'role', v_member->>'role', 'canPublish', v_member->'canPublish',
    'programAudioPublisherIdentity', v_room.host_id, 'members', v_members,
    'publicationGeneration',(select generation from public.room_livekit_publication_grants_v1 where room_id=p_room_id and user_id=p_user_id and is_authorized));
end;
$$;
revoke all on function public.rooms_byteplus_media_policy_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rooms_byteplus_media_policy_v1(uuid,uuid) to service_role;

-- Keep the native end-room name and the desktop end-room name equivalent.
create or replace function public.rooms_end_room_v1(p_room_id uuid)
returns public.rooms_v2 language sql security invoker set search_path=public,pg_temp as $$
  select public.rooms_end_place_v3(p_room_id);
$$;
revoke all on function public.rooms_end_room_v1(uuid) from public, anon;
grant execute on function public.rooms_end_room_v1(uuid) to authenticated;
