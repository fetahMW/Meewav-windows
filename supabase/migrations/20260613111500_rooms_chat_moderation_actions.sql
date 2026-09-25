create table if not exists public.room_kicks_v2 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kicked_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamp with time zone not null default now(),
  constraint room_kicks_v2_no_self_kick check (kicked_by is null or kicked_by <> user_id)
);
create index if not exists idx_room_kicks_v2_user
  on public.room_kicks_v2 (room_id, user_id, created_at desc);
alter table public.room_kicks_v2 enable row level security;
drop policy if exists "Voir les expulsions" on public.room_kicks_v2;
create policy "Voir les expulsions"
  on public.room_kicks_v2
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_kicks_v2.room_id
        and r.host_id = auth.uid()
    )
    or exists (
      select 1
      from public.room_moderators_v2 m
      where m.room_id = room_kicks_v2.room_id
        and m.user_id = auth.uid()
    )
  );
drop policy if exists "Modifier les expulsions via RPC" on public.room_kicks_v2;
create policy "Modifier les expulsions via RPC"
  on public.room_kicks_v2
  for all
  to authenticated
  using (false)
  with check (false);
create table if not exists public.room_user_slow_modes_v2 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delay_seconds integer not null default 0,
  expires_at timestamp with time zone,
  applied_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint room_user_slow_modes_v2_room_user_key unique (room_id, user_id),
  constraint room_user_slow_modes_v2_delay_check check (delay_seconds >= 0 and delay_seconds <= 3600),
  constraint room_user_slow_modes_v2_no_self_apply check (applied_by is null or applied_by <> user_id)
);
create index if not exists idx_room_user_slow_modes_v2_active
  on public.room_user_slow_modes_v2 (room_id, user_id)
  where delay_seconds > 0;
alter table public.room_user_slow_modes_v2 enable row level security;
drop policy if exists "Voir les slow modes utilisateur" on public.room_user_slow_modes_v2;
create policy "Voir les slow modes utilisateur"
  on public.room_user_slow_modes_v2
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_user_slow_modes_v2.room_id
        and r.host_id = auth.uid()
    )
    or exists (
      select 1
      from public.room_moderators_v2 m
      where m.room_id = room_user_slow_modes_v2.room_id
        and m.user_id = auth.uid()
    )
  );
drop policy if exists "Modifier les slow modes via RPC" on public.room_user_slow_modes_v2;
create policy "Modifier les slow modes via RPC"
  on public.room_user_slow_modes_v2
  for all
  to authenticated
  using (false)
  with check (false);
do $$
begin
  alter publication supabase_realtime add table public.room_kicks_v2;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.room_user_slow_modes_v2;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end $$;
create or replace function public.rooms_assert_room_moderator_v2(p_room_id uuid)
returns public.rooms_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_room
  from public.rooms_v2
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room introuvable';
  end if;

  if v_room.status = 'ended' then
    raise exception 'Room terminee';
  end if;

  if v_room.host_id = auth.uid() then
    return v_room;
  end if;

  if exists (
    select 1
    from public.room_moderators_v2 m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  ) then
    return v_room;
  end if;

  raise exception 'Action reservee au host ou aux moderateurs';
end;
$$;
create or replace function public.rooms_assert_moderation_target_v2(
  p_room_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Action impossible sur soi-meme';
  end if;

  if exists (
    select 1
    from public.rooms_v2 r
    where r.id = p_room_id
      and r.host_id = p_user_id
  ) then
    raise exception 'Action impossible sur le host';
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
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
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
set search_path = public
as $$
begin
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
create or replace function public.rooms_set_user_slow_mode_v2(
  p_room_id uuid,
  p_user_id uuid,
  p_delay_seconds integer,
  p_duration_seconds integer default null,
  p_reason text default 'moderation_slow_mode'
)
returns public.room_user_slow_modes_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_user_slow_modes_v2%rowtype;
  v_expires_at timestamp with time zone;
begin
  perform public.rooms_assert_room_moderator_v2(p_room_id);
  perform public.rooms_assert_moderation_target_v2(p_room_id, p_user_id);

  if p_delay_seconds < 0 or p_delay_seconds > 3600 then
    raise exception 'Delai slow mode invalide';
  end if;

  if p_duration_seconds is not null and p_duration_seconds <= 0 then
    raise exception 'Duree slow mode invalide';
  end if;

  if p_duration_seconds is not null then
    v_expires_at := now() + make_interval(secs => p_duration_seconds);
  end if;

  insert into public.room_user_slow_modes_v2 (
    room_id,
    user_id,
    delay_seconds,
    expires_at,
    applied_by,
    reason,
    updated_at
  )
  values (
    p_room_id,
    p_user_id,
    p_delay_seconds,
    v_expires_at,
    auth.uid(),
    p_reason,
    now()
  )
  on conflict (room_id, user_id)
  do update set
    delay_seconds = excluded.delay_seconds,
    expires_at = excluded.expires_at,
    applied_by = excluded.applied_by,
    reason = excluded.reason,
    updated_at = now()
  returning * into v_state;

  insert into public.room_events_v2 (room_id, triggered_by, event_type, payload)
  values (
    p_room_id,
    auth.uid(),
    case when p_delay_seconds > 0 then 'user_slow_mode_set' else 'user_slow_mode_cleared' end,
    jsonb_build_object(
      'user_id', p_user_id,
      'delay_seconds', p_delay_seconds,
      'duration_seconds', p_duration_seconds,
      'reason', coalesce(p_reason, 'moderation_slow_mode')
    )
  );

  return v_state;
end;
$$;
create or replace function public.rooms_current_user_moderation_state_v2(
  p_room_id uuid
)
returns table (
  is_banned boolean,
  is_kicked boolean,
  slow_mode_delay integer,
  slow_mode_expires_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slow public.room_user_slow_modes_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_slow
  from public.room_user_slow_modes_v2 s
  where s.room_id = p_room_id
    and s.user_id = auth.uid()
    and s.delay_seconds > 0
    and (s.expires_at is null or s.expires_at > now())
  order by s.updated_at desc
  limit 1;

  return query
  select
    exists (
      select 1
      from public.room_bans_v2 b
      where b.room_id = p_room_id
        and b.user_id = auth.uid()
    ) as is_banned,
    exists (
      select 1
      from public.room_kicks_v2 k
      where k.room_id = p_room_id
        and k.user_id = auth.uid()
        and not exists (
          select 1
          from public.room_participants_v2 p
          where p.room_id = p_room_id
            and p.user_id = auth.uid()
            and p.left_at is null
        )
    ) as is_kicked,
    coalesce(v_slow.delay_seconds, 0) as slow_mode_delay,
    v_slow.expires_at as slow_mode_expires_at;
end;
$$;
create or replace function public.rooms_send_message_v2(
  p_room_id uuid,
  p_content text
)
returns public.room_messages_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_content text;
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

  if exists (
    select 1
    from public.room_bans_v2 b
    where b.room_id = p_room_id
      and b.user_id = auth.uid()
  ) then
    raise exception 'Acces refuse a cette room';
  end if;

  if not exists (
    select 1
    from public.room_participants_v2 p
    where p.room_id = p_room_id
      and p.user_id = auth.uid()
      and p.left_at is null
  ) then
    raise exception 'Tu n''es plus dans cette room';
  end if;

  v_room_delay := greatest(coalesce(v_room.slow_mode_delay, 0), 0);

  select coalesce(s.delay_seconds, 0)
    into v_user_delay
  from public.room_user_slow_modes_v2 s
  where s.room_id = p_room_id
    and s.user_id = auth.uid()
    and s.delay_seconds > 0
    and (s.expires_at is null or s.expires_at > now())
  order by s.updated_at desc
  limit 1;

  v_effective_delay := greatest(v_room_delay, coalesce(v_user_delay, 0));

  if v_effective_delay > 0 then
    select max(m.created_at)
      into v_last_message_at
    from public.room_messages_v2 m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
      and m.is_system = false;

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

  insert into public.room_messages_v2 (room_id, user_id, content)
  values (p_room_id, auth.uid(), v_content)
  returning * into v_message;

  return v_message;
end;
$$;
create or replace function public.rooms_kick_invitation_v2(
  p_invitation_id uuid,
  p_reason text default 'host_kick'
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
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
drop policy if exists "Envoyer un message" on public.room_messages_v2;
create policy "Envoyer un message"
  on public.room_messages_v2
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and coalesce(is_system, false) = false
    and coalesce(is_highlighted, false) = false
    and highlight_expires_at is null
    and length(btrim(content)) > 0
    and length(content) <= 1000
    and created_at >= now() - interval '5 seconds'
    and created_at <= now() + interval '5 seconds'
    and exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_messages_v2.room_id
        and r.status <> 'ended'
    )
    and exists (
      select 1
      from public.room_participants_v2 p
      where p.room_id = room_messages_v2.room_id
        and p.user_id = auth.uid()
        and p.left_at is null
    )
    and not exists (
      select 1
      from public.room_bans_v2 b
      where b.room_id = room_messages_v2.room_id
        and b.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_messages_v2.room_id
        and r.slow_mode_delay > 0
        and exists (
          select 1
          from public.room_messages_v2 previous_message
          where previous_message.room_id = room_messages_v2.room_id
            and previous_message.user_id = auth.uid()
            and previous_message.is_system = false
            and previous_message.created_at > now() - make_interval(secs => r.slow_mode_delay)
        )
    )
    and not exists (
      select 1
      from public.room_user_slow_modes_v2 s
      where s.room_id = room_messages_v2.room_id
        and s.user_id = auth.uid()
        and s.delay_seconds > 0
        and (s.expires_at is null or s.expires_at > now())
        and exists (
          select 1
          from public.room_messages_v2 previous_message
          where previous_message.room_id = room_messages_v2.room_id
            and previous_message.user_id = auth.uid()
            and previous_message.is_system = false
            and previous_message.created_at > now() - make_interval(secs => s.delay_seconds)
        )
    )
  );
drop policy if exists "Réagir" on public.room_reactions_v2;
create policy "Réagir"
  on public.room_reactions_v2
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_reactions_v2.room_id
        and r.status <> 'ended'
    )
    and exists (
      select 1
      from public.room_participants_v2 p
      where p.room_id = room_reactions_v2.room_id
        and p.user_id = auth.uid()
        and p.left_at is null
    )
    and not exists (
      select 1
      from public.room_bans_v2 b
      where b.room_id = room_reactions_v2.room_id
        and b.user_id = auth.uid()
    )
  );
drop policy if exists "Voter une fois non host" on public.room_poll_votes_v2;
create policy "Voter une fois non host"
  on public.room_poll_votes_v2
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.room_polls_v2 p
      where p.id = room_poll_votes_v2.poll_id
        and p.is_active = true
        and p.host_id <> auth.uid()
        and room_poll_votes_v2.option_index >= 0
        and room_poll_votes_v2.option_index < jsonb_array_length(p.options)
        and exists (
          select 1
          from public.room_participants_v2 rp
          where rp.room_id = p.room_id
            and rp.user_id = auth.uid()
            and rp.left_at is null
        )
        and not exists (
          select 1
          from public.room_bans_v2 b
          where b.room_id = p.room_id
            and b.user_id = auth.uid()
        )
    )
  );
grant all on table public.room_kicks_v2 to authenticated;
grant all on table public.room_kicks_v2 to service_role;
grant all on table public.room_user_slow_modes_v2 to authenticated;
grant all on table public.room_user_slow_modes_v2 to service_role;
grant execute on function public.rooms_assert_room_moderator_v2(uuid) to authenticated;
grant execute on function public.rooms_assert_moderation_target_v2(uuid, uuid) to authenticated;
grant execute on function public.rooms_kick_user_v2(uuid, uuid, text) to authenticated;
grant execute on function public.rooms_ban_user_v2(uuid, uuid, text) to authenticated;
grant execute on function public.rooms_set_user_slow_mode_v2(uuid, uuid, integer, integer, text) to authenticated;
grant execute on function public.rooms_current_user_moderation_state_v2(uuid) to authenticated;
grant execute on function public.rooms_send_message_v2(uuid, text) to authenticated;
grant execute on function public.rooms_kick_invitation_v2(uuid, text) to authenticated;
