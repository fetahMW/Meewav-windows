-- A Room Host owns the live but is not required to have a participant row.
-- Keep the existing cross-client RPC signature and authorize that canonical
-- owner explicitly; audience members still need an active participant row.

create or replace function public.rooms_send_message_v2(
  p_room_id uuid,
  p_content text
)
returns public.room_messages_v2
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_content text;
  v_is_host boolean := false;
  v_room_delay integer := 0;
  v_user_delay integer := 0;
  v_effective_delay integer := 0;
  v_last_message_at timestamp with time zone;
  v_remaining_seconds integer;
  v_message public.room_messages_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  v_content := btrim(coalesce(p_content, ''));
  if length(v_content) = 0 then
    raise exception 'Message vide';
  end if;

  if length(v_content) > 1000 then
    raise exception 'Message trop long';
  end if;

  select *
    into v_room
  from public.rooms_v2
  where id = p_room_id;

  if not found or v_room.status = 'ended' then
    raise exception 'Room terminee';
  end if;

  v_is_host := v_room.host_id = auth.uid();

  if exists (
    select 1
    from public.room_bans_v2 banned
    where banned.room_id = p_room_id
      and banned.user_id = auth.uid()
  ) then
    raise exception 'Acces refuse a cette room';
  end if;

  if not v_is_host and not exists (
    select 1
    from public.room_participants_v2 participant
    where participant.room_id = p_room_id
      and participant.user_id = auth.uid()
      and participant.left_at is null
  ) then
    raise exception 'Tu n''es plus dans cette room';
  end if;

  -- Slow mode protects the public conversation from audience flooding. The
  -- authenticated Room owner must remain able to publish live instructions.
  if not v_is_host then
    v_room_delay := greatest(coalesce(v_room.slow_mode_delay, 0), 0);

    select coalesce(slow.delay_seconds, 0)
      into v_user_delay
    from public.room_user_slow_modes_v2 slow
    where slow.room_id = p_room_id
      and slow.user_id = auth.uid()
      and slow.delay_seconds > 0
      and (slow.expires_at is null or slow.expires_at > now())
    order by slow.updated_at desc
    limit 1;

    v_effective_delay := greatest(v_room_delay, coalesce(v_user_delay, 0));

    if v_effective_delay > 0 then
      select max(message.created_at)
        into v_last_message_at
      from public.room_messages_v2 message
      where message.room_id = p_room_id
        and message.user_id = auth.uid()
        and message.is_system = false;

      if v_last_message_at is not null
        and v_last_message_at > now() - make_interval(secs => v_effective_delay)
      then
        v_remaining_seconds := greatest(
          1,
          ceil(extract(epoch from (v_last_message_at + make_interval(secs => v_effective_delay) - now())))::integer
        );
        raise exception 'Slow mode actif. Attends %s.', v_remaining_seconds;
      end if;
    end if;
  end if;

  insert into public.room_messages_v2 (room_id, user_id, content)
  values (p_room_id, auth.uid(), v_content)
  returning * into v_message;

  return v_message;
end;
$$;

comment on function public.rooms_send_message_v2(uuid, text) is
  'Canonical public Room chat writer. Allows the authenticated Room Host or an active participant; Host messages bypass audience slow mode.';

revoke all privileges on function public.rooms_send_message_v2(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rooms_send_message_v2(uuid, text)
  to authenticated, service_role;
