update public.room_polls_v2
set duration_seconds = 30
where duration_seconds not in (30, 60, 120);
with ranked_polls as (
  select
    id,
    row_number() over (
      partition by room_id
      order by created_at desc
    ) as rank
  from public.room_polls_v2
  where is_active = true
)
update public.room_polls_v2 p
set
  is_active = false,
  ended_at = coalesce(p.ended_at, now())
from ranked_polls r
where p.id = r.id
  and r.rank > 1;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_polls_v2_duration_seconds_check'
  ) then
    alter table public.room_polls_v2
      add constraint room_polls_v2_duration_seconds_check
      check (duration_seconds in (30, 60, 120));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_polls_v2_options_count_check'
  ) then
    alter table public.room_polls_v2
      add constraint room_polls_v2_options_count_check
      check (
        jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) between 2 and 10
      );
  end if;
end $$;
create unique index if not exists room_polls_v2_one_active_per_room_idx
  on public.room_polls_v2(room_id)
  where is_active = true;
create table if not exists public.room_pinned_items_v2 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.room_messages_v2(id) on delete cascade,
  source_user_id uuid references auth.users(id) on delete set null,
  content text not null,
  is_active boolean not null default true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint room_pinned_items_v2_content_check
    check (
      length(btrim(content)) > 0
      and length(content) <= 500
    ),
  constraint room_pinned_items_v2_expiration_check
    check (expires_at is null or expires_at > created_at)
);
alter table only public.room_pinned_items_v2 replica identity full;
create unique index if not exists room_pinned_items_v2_one_active_per_room_idx
  on public.room_pinned_items_v2(room_id)
  where is_active = true;
create index if not exists room_pinned_items_v2_room_active_idx
  on public.room_pinned_items_v2(room_id, created_at desc)
  where is_active = true;
alter table public.room_pinned_items_v2 enable row level security;
drop policy if exists "Voir les epingles room" on public.room_pinned_items_v2;
create policy "Voir les epingles room"
  on public.room_pinned_items_v2
  for select
  using (true);
drop policy if exists "Host gere les epingles room" on public.room_pinned_items_v2;
create policy "Host gere les epingles room"
  on public.room_pinned_items_v2
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_pinned_items_v2.room_id
        and r.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.rooms_v2 r
      where r.id = room_pinned_items_v2.room_id
        and r.host_id = auth.uid()
    )
  );
grant all on table public.room_pinned_items_v2 to anon;
grant all on table public.room_pinned_items_v2 to authenticated;
grant all on table public.room_pinned_items_v2 to service_role;
do $$
begin
  begin
    alter publication supabase_realtime add table public.room_pinned_items_v2;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;
drop policy if exists "Changer son vote" on public.room_poll_votes_v2;
drop policy if exists "Voter" on public.room_poll_votes_v2;
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
        and not exists (
          select 1
          from public.room_bans_v2 b
          where b.room_id = p.room_id
            and b.user_id = auth.uid()
        )
    )
  );
create or replace function public.rooms_create_poll_v2(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_duration_seconds integer
)
returns public.room_polls_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.room_polls_v2%rowtype;
  v_options_count integer;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  if length(btrim(coalesce(p_question, ''))) = 0 then
    raise exception 'Question required.';
  end if;

  if jsonb_typeof(p_options) <> 'array' then
    raise exception 'Poll options must be an array.';
  end if;

  v_options_count := jsonb_array_length(p_options);
  if v_options_count < 2 or v_options_count > 10 then
    raise exception 'Poll options count must be between 2 and 10.';
  end if;

  if p_duration_seconds not in (30, 60, 120) then
    raise exception 'Invalid poll duration.';
  end if;

  update public.room_polls_v2
  set
    is_active = false,
    ended_at = coalesce(ended_at, now())
  where room_id = p_room_id
    and is_active = true;

  insert into public.room_polls_v2 (
    room_id,
    host_id,
    question,
    options,
    duration_seconds,
    is_active
  )
  values (
    p_room_id,
    auth.uid(),
    btrim(p_question),
    p_options,
    p_duration_seconds,
    true
  )
  returning * into v_poll;

  return v_poll;
end;
$$;
create or replace function public.rooms_stop_poll_v2(
  p_poll_id uuid
)
returns public.room_polls_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.room_polls_v2%rowtype;
begin
  select *
    into v_poll
  from public.room_polls_v2
  where id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found.';
  end if;

  perform public.rooms_assert_room_host_v2(v_poll.room_id);

  update public.room_polls_v2
  set
    is_active = false,
    ended_at = coalesce(ended_at, now())
  where id = p_poll_id
  returning * into v_poll;

  return v_poll;
end;
$$;
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
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_poll
  from public.room_polls_v2
  where id = p_poll_id;

  if not found then
    raise exception 'Poll not found.';
  end if;

  if v_poll.is_active = false then
    raise exception 'Poll is closed.';
  end if;

  if v_poll.host_id = auth.uid() then
    raise exception 'Host cannot vote.';
  end if;

  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_poll.options) then
    raise exception 'Invalid poll option.';
  end if;

  if exists (
    select 1
    from public.room_bans_v2 b
    where b.room_id = v_poll.room_id
      and b.user_id = auth.uid()
  ) then
    raise exception 'Current user is banned from this room.';
  end if;

  insert into public.room_poll_votes_v2 (
    poll_id,
    user_id,
    option_index
  )
  values (
    p_poll_id,
    auth.uid(),
    p_option_index
  )
  on conflict (poll_id, user_id) do nothing;
end;
$$;
create or replace function public.rooms_pin_custom_item_v2(
  p_room_id uuid,
  p_content text,
  p_expiration_seconds integer default null
)
returns public.room_pinned_items_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.room_pinned_items_v2%rowtype;
  v_expires_at timestamp with time zone;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  if length(btrim(coalesce(p_content, ''))) = 0 then
    raise exception 'Pinned content required.';
  end if;

  if p_expiration_seconds is not null and p_expiration_seconds not in (30, 60, 300, 900) then
    raise exception 'Invalid pinned item expiration.';
  end if;

  if p_expiration_seconds is not null then
    v_expires_at := now() + make_interval(secs => p_expiration_seconds);
  end if;

  update public.room_pinned_items_v2
  set
    is_active = false,
    updated_at = now()
  where room_id = p_room_id
    and is_active = true;

  insert into public.room_pinned_items_v2 (
    room_id,
    host_id,
    content,
    expires_at
  )
  values (
    p_room_id,
    auth.uid(),
    btrim(p_content),
    v_expires_at
  )
  returning * into v_item;

  return v_item;
end;
$$;
create or replace function public.rooms_pin_message_item_v2(
  p_room_id uuid,
  p_message_id uuid,
  p_expiration_seconds integer default null
)
returns public.room_pinned_items_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.room_messages_v2%rowtype;
  v_item public.room_pinned_items_v2%rowtype;
  v_expires_at timestamp with time zone;
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  select *
    into v_message
  from public.room_messages_v2
  where id = p_message_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Message not found.';
  end if;

  if p_expiration_seconds is not null and p_expiration_seconds not in (30, 60, 300, 900) then
    raise exception 'Invalid pinned item expiration.';
  end if;

  if p_expiration_seconds is not null then
    v_expires_at := now() + make_interval(secs => p_expiration_seconds);
  end if;

  update public.room_pinned_items_v2
  set
    is_active = false,
    updated_at = now()
  where room_id = p_room_id
    and is_active = true;

  insert into public.room_pinned_items_v2 (
    room_id,
    host_id,
    source_message_id,
    source_user_id,
    content,
    expires_at
  )
  values (
    p_room_id,
    auth.uid(),
    v_message.id,
    v_message.user_id,
    v_message.content,
    v_expires_at
  )
  returning * into v_item;

  return v_item;
end;
$$;
create or replace function public.rooms_clear_pinned_item_v2(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  update public.room_pinned_items_v2
  set
    is_active = false,
    updated_at = now()
  where room_id = p_room_id
    and is_active = true;
end;
$$;
create or replace function public.rooms_delete_message_v2(
  p_room_id uuid,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rooms_assert_room_host_v2(p_room_id);

  delete from public.room_messages_v2
  where room_id = p_room_id
    and id = p_message_id;
end;
$$;
grant execute on function public.rooms_create_poll_v2(uuid, text, jsonb, integer) to authenticated;
grant execute on function public.rooms_stop_poll_v2(uuid) to authenticated;
grant execute on function public.rooms_vote_poll_v2(uuid, integer) to authenticated;
grant execute on function public.rooms_pin_custom_item_v2(uuid, text, integer) to authenticated;
grant execute on function public.rooms_pin_message_item_v2(uuid, uuid, integer) to authenticated;
grant execute on function public.rooms_clear_pinned_item_v2(uuid) to authenticated;
grant execute on function public.rooms_delete_message_v2(uuid, uuid) to authenticated;
