create unique index if not exists room_reactions_v2_one_room_like_per_user
  on public.room_reactions_v2 (room_id, user_id)
  where type = 'room_like';

create or replace function public.rooms_engagement_state_v1(
  p_room_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_likes_count bigint := 0;
  v_golden_likes_count bigint := 0;
  v_has_liked boolean := false;
  v_has_golden_liked boolean := false;
  v_last_golden_like_at timestamptz;
begin
  if not exists (
    select 1
    from public.rooms_v2 room
    where room.id = p_room_id
  ) then
    raise exception 'Room introuvable';
  end if;

  select
    coalesce(sum(reaction.count) filter (
      where reaction.type = 'room_like'
    ), 0),
    coalesce(sum(reaction.count) filter (
      where reaction.type = 'golden_like'
    ), 0)
  into v_likes_count, v_golden_likes_count
  from public.room_reactions_v2 reaction
  where reaction.room_id = p_room_id;

  if v_user_id is not null then
    select exists (
      select 1
      from public.room_reactions_v2 reaction
      where reaction.room_id = p_room_id
        and reaction.user_id = v_user_id
        and reaction.type = 'room_like'
    ) into v_has_liked;

    select exists (
      select 1
      from public.room_reactions_v2 reaction
      where reaction.room_id = p_room_id
        and reaction.user_id = v_user_id
        and reaction.type = 'golden_like'
    ) into v_has_golden_liked;

    select max(golden_like.given_at)
    into v_last_golden_like_at
    from public.daily_golden_likes golden_like
    where golden_like.giver_id = v_user_id;
  end if;

  return jsonb_build_object(
    'likes_count', v_likes_count,
    'golden_likes_count', v_golden_likes_count,
    'current_user_has_liked', v_has_liked,
    'current_user_has_golden_liked', v_has_golden_liked,
    'golden_like_available_at',
      case
        when v_last_golden_like_at is null then null
        else v_last_golden_like_at + interval '24 hours'
      end
  );
end;
$$;

create or replace function public.rooms_like_v1(
  p_room_id uuid
)
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
      and room.status <> 'ended'
      and room.host_id <> v_user_id
  ) then
    raise exception 'Seul un Viewer actif peut liker ce live';
  end if;

  insert into public.room_reactions_v2 (
    room_id,
    user_id,
    type,
    emoji,
    count
  ) values (
    p_room_id,
    v_user_id,
    'room_like',
    'heart',
    1
  )
  on conflict (room_id, user_id) where type = 'room_like'
  do nothing;

  return public.rooms_engagement_state_v1(p_room_id);
end;
$$;

create or replace function public.rooms_give_golden_like_v1(
  p_room_id uuid
)
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
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;

  select room.host_id
  into v_recipient_id
  from public.rooms_v2 room
  join public.room_participants_v2 participant
    on participant.room_id = room.id
   and participant.user_id = v_user_id
   and participant.left_at is null
  where room.id = p_room_id
    and room.status <> 'ended'
    and room.host_id <> v_user_id;

  if v_recipient_id is null then
    raise exception 'Seul un Viewer actif peut offrir un Golden Like';
  end if;

  insert into public.daily_golden_likes (
    giver_id,
    recipient_id
  ) values (
    v_user_id,
    v_recipient_id
  );

  insert into public.room_reactions_v2 (
    room_id,
    user_id,
    type,
    emoji,
    count
  ) values (
    p_room_id,
    v_user_id,
    'golden_like',
    'star',
    1
  );

  return public.rooms_engagement_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_engagement_state_v1(uuid) from public;
revoke all on function public.rooms_engagement_state_v1(uuid) from anon;
revoke all on function public.rooms_like_v1(uuid) from public;
revoke all on function public.rooms_like_v1(uuid) from anon;
revoke all on function public.rooms_give_golden_like_v1(uuid) from public;
revoke all on function public.rooms_give_golden_like_v1(uuid) from anon;

grant execute on function public.rooms_engagement_state_v1(uuid) to authenticated;
grant execute on function public.rooms_like_v1(uuid) to authenticated;
grant execute on function public.rooms_give_golden_like_v1(uuid) to authenticated;
