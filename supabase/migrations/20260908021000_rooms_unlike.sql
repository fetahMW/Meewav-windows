-- A viewer can withdraw only their own ordinary Like, never a Golden Like.
create or replace function public.rooms_unlike_v1(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    join public.room_participants_v2 participant
      on participant.room_id = room.id
     and participant.user_id = v_user_id
     and participant.left_at is null
    where room.id = p_room_id
      and room.status = 'live'
      and room.host_id <> v_user_id
  ) then
    raise exception 'Seul un Viewer ou Guest actif peut retirer son Like';
  end if;
  delete from public.room_reactions_v2
  where room_id = p_room_id and user_id = v_user_id and type = 'room_like';
  return public.rooms_engagement_state_v1(p_room_id);
end;
$$;
revoke all on function public.rooms_unlike_v1(uuid) from public, anon;
grant execute on function public.rooms_unlike_v1(uuid) to authenticated, service_role;
