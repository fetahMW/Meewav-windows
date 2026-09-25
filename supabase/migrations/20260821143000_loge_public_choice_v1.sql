-- "Le public choisit" reuses the canonical Rooms poll tables, Realtime
-- publication and RPCs. This migration only tightens that existing contract
-- for the Loge UX: 2–6 enriched options, optional timer and optional live
-- result disclosure. One account / poll remains guaranteed by the existing
-- unique (poll_id, user_id) constraint.

alter table public.room_polls_v2
  add column if not exists show_results boolean not null default true;

alter table public.room_polls_v2
  alter column duration_seconds drop not null,
  alter column duration_seconds drop default;

alter table public.room_polls_v2
  drop constraint if exists room_polls_v2_duration_seconds_check;

alter table public.room_polls_v2
  add constraint room_polls_v2_duration_seconds_check
  check (duration_seconds is null or duration_seconds in (15, 30, 60, 120));

alter table public.room_polls_v2
  drop constraint if exists room_polls_v2_options_count_check;

alter table public.room_polls_v2
  add constraint room_polls_v2_options_count_check
  check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  );

create or replace function public.rooms_create_poll_v2(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_duration_seconds integer,
  p_show_results boolean
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

  if length(btrim(coalesce(p_question, ''))) not between 3 and 120 then
    raise exception 'Question must contain between 3 and 120 characters.';
  end if;

  if jsonb_typeof(p_options) <> 'array' or octet_length(p_options::text) > 8192 then
    raise exception 'Poll options must be a compact array.';
  end if;

  v_options_count := jsonb_array_length(p_options);
  if v_options_count < 2 or v_options_count > 6 then
    raise exception 'Poll options count must be between 2 and 6.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_options) option_value
    where case jsonb_typeof(option_value)
      when 'string' then length(btrim(trim(both '"' from option_value::text))) not between 1 and 80
      when 'object' then
        length(btrim(coalesce(option_value ->> 'label', ''))) not between 1 and 80
        or length(coalesce(option_value ->> 'imageUrl', '')) > 500
        or length(coalesce(option_value ->> 'mediaId', '')) > 160
        or length(coalesce(option_value ->> 'durationLabel', '')) > 32
      else true
    end
  ) then
    raise exception 'Poll options must contain a short label and safe optional media metadata.';
  end if;

  if p_duration_seconds is not null and p_duration_seconds not in (15, 30, 60, 120) then
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
    show_results,
    is_active
  ) values (
    p_room_id,
    auth.uid(),
    btrim(p_question),
    p_options,
    p_duration_seconds,
    coalesce(p_show_results, true),
    true
  )
  returning * into v_poll;

  return v_poll;
end;
$$;

-- Backward-compatible wrapper for already released clients.
create or replace function public.rooms_create_poll_v2(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_duration_seconds integer
)
returns public.room_polls_v2
language sql
security definer
set search_path = public
as $$
  select public.rooms_create_poll_v2(
    p_room_id,
    p_question,
    p_options,
    p_duration_seconds,
    true
  );
$$;

drop policy if exists "Voter une fois non host" on public.room_poll_votes_v2;
create policy "Voter une fois non host"
  on public.room_poll_votes_v2
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.room_polls_v2 poll
      join public.rooms_v2 room on room.id = poll.room_id
      where poll.id = room_poll_votes_v2.poll_id
        and poll.is_active = true
        and (poll.duration_seconds is null or poll.created_at + make_interval(secs => poll.duration_seconds) > now())
        and poll.host_id <> auth.uid()
        and room.status = 'live'
        and room_poll_votes_v2.option_index >= 0
        and room_poll_votes_v2.option_index < jsonb_array_length(poll.options)
        and exists (
          select 1 from public.room_participants_v2 participant
          where participant.room_id = poll.room_id
            and participant.user_id = auth.uid()
            and participant.left_at is null
        )
        and not exists (
          select 1 from public.room_bans_v2 ban
          where ban.room_id = poll.room_id
            and ban.user_id = auth.uid()
        )
    )
  );

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
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select * into v_poll
  from public.room_polls_v2
  where id = p_poll_id
  for update;

  if not found then raise exception 'Poll not found.'; end if;
  if v_poll.is_active = false
    or (v_poll.duration_seconds is not null and v_poll.created_at + make_interval(secs => v_poll.duration_seconds) <= now()) then
    raise exception 'Poll is closed.';
  end if;
  if v_poll.host_id = auth.uid() then raise exception 'Host cannot vote.'; end if;
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_poll.options) then
    raise exception 'Invalid poll option.';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    join public.room_participants_v2 participant on participant.room_id = room.id
    where room.id = v_poll.room_id
      and room.status = 'live'
      and participant.user_id = auth.uid()
      and participant.left_at is null
  ) then
    raise exception 'Active Room membership required.';
  end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = v_poll.room_id
      and ban.user_id = auth.uid()
  ) then
    raise exception 'Current user is banned from this Room.';
  end if;

  insert into public.room_poll_votes_v2 (poll_id, user_id, option_index)
  values (p_poll_id, auth.uid(), p_option_index)
  on conflict (poll_id, user_id) do nothing;

  if found then
    update public.room_polls_v2
    set revision = revision + 1
    where id = p_poll_id;
  end if;
end;
$$;

create or replace function public.rooms_poll_state_v3(p_poll_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poll public.room_polls_v2%rowtype;
  v_counts jsonb := '[]'::jsonb;
  v_current_vote integer;
  v_effective_active boolean;
  v_can_view_results boolean;
begin
  select * into v_poll
  from public.room_polls_v2
  where id = p_poll_id;

  if not found then return null; end if;

  v_effective_active := v_poll.is_active
    and (v_poll.duration_seconds is null or v_poll.created_at + make_interval(secs => v_poll.duration_seconds) > now());
  v_can_view_results := v_poll.show_results
    or auth.uid() = v_poll.host_id
    or not v_effective_active;

  if v_can_view_results then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'option_index', series.option_position,
          'votes', (
            select count(*) from public.room_poll_votes_v2 vote
            where vote.poll_id = p_poll_id
              and vote.option_index = series.option_position
          )
        ) order by series.option_position
      ),
      '[]'::jsonb
    ) into v_counts
    from generate_series(0, jsonb_array_length(v_poll.options) - 1) as series(option_position);
  end if;

  if auth.uid() is not null then
    select vote.option_index into v_current_vote
    from public.room_poll_votes_v2 vote
    where vote.poll_id = p_poll_id
      and vote.user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'counts', v_counts,
    'current_user_vote_index', v_current_vote,
    'ends_at', case when v_poll.duration_seconds is null then null else v_poll.created_at + make_interval(secs => v_poll.duration_seconds) end,
    'results_visible', v_poll.show_results,
    'is_active', v_effective_active
  );
end;
$$;

revoke all on function public.rooms_create_poll_v2(uuid, text, jsonb, integer, boolean) from public;
revoke all on function public.rooms_create_poll_v2(uuid, text, jsonb, integer) from public;
revoke all on function public.rooms_vote_poll_v2(uuid, integer) from public;
revoke all on function public.rooms_poll_state_v3(uuid) from public;

grant execute on function public.rooms_create_poll_v2(uuid, text, jsonb, integer, boolean) to authenticated, service_role;
grant execute on function public.rooms_create_poll_v2(uuid, text, jsonb, integer) to authenticated, service_role;
grant execute on function public.rooms_vote_poll_v2(uuid, integer) to authenticated, service_role;
grant execute on function public.rooms_poll_state_v3(uuid) to anon, authenticated, service_role;
