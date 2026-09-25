-- Align the persisted Rooms tools contract with the durations exposed by the
-- host UI: polls 15/30/60 seconds and highlights 10/20/30 seconds. Legacy
-- durations remain accepted so already released clients and rows keep working.

alter table public.room_polls_v2
  drop constraint if exists room_polls_v2_duration_seconds_check;

alter table public.room_polls_v2
  add constraint room_polls_v2_duration_seconds_check
  check (duration_seconds in (15, 30, 60, 120));

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

  if length(btrim(coalesce(p_question, ''))) not between 1 and 160 then
    raise exception 'Question must contain between 1 and 160 characters.';
  end if;

  if jsonb_typeof(p_options) <> 'array' or octet_length(p_options::text) > 2048 then
    raise exception 'Poll options must be an array.';
  end if;

  v_options_count := jsonb_array_length(p_options);
  if v_options_count < 2 or v_options_count > 10 then
    raise exception 'Poll options count must be between 2 and 10.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_options) option_value
    where jsonb_typeof(option_value) <> 'string'
      or length(btrim(trim(both '"' from option_value::text))) not between 1 and 80
  ) then
    raise exception 'Poll options must be short, non-empty strings.';
  end if;

  if p_duration_seconds not in (15, 30, 60, 120) then
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

  if length(btrim(coalesce(p_content, ''))) not between 1 and 500 then
    raise exception 'Pinned content must contain between 1 and 500 characters.';
  end if;

  if p_expiration_seconds is not null and p_expiration_seconds not in (10, 20, 30, 60, 300, 900) then
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
  if length(btrim(coalesce(v_message.content, ''))) not between 1 and 500 then
    raise exception 'Highlighted message must contain between 1 and 500 characters.';
  end if;

  if p_expiration_seconds is not null and p_expiration_seconds not in (10, 20, 30, 60, 300, 900) then
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
