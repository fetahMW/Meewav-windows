-- La Place: authoritative program layout shared by the host with every viewer.
-- Personal viewer focus never enters this table.

create table if not exists public.room_program_layout_v1 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  mode text not null check (mode in ('auto', 'stage', 'grid', 'solo')),
  primary_participant_id text not null,
  locked_participant_id text,
  participant_order text[] not null default '{}'::text[],
  selected_source_by_participant jsonb not null default '{}'::jsonb
    check (jsonb_typeof(selected_source_by_participant) = 'object'),
  transition text not null default 'dissolve' check (transition in ('cut', 'dissolve')),
  preset text not null default 'performance' check (preset in ('performance', 'discussion', 'collaboration')),
  auto_director_profile text not null default 'calm' check (auto_director_profile in ('calm', 'dynamic', 'manual')),
  safe_framing_by_participant jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_framing_by_participant) = 'object'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.room_program_layout_v1 replica identity full;
alter table public.room_program_layout_v1 enable row level security;

revoke all on table public.room_program_layout_v1 from anon, authenticated;
grant select on table public.room_program_layout_v1 to authenticated;

drop policy if exists room_program_layout_public_read_v1 on public.room_program_layout_v1;
create policy room_program_layout_public_read_v1
  on public.room_program_layout_v1
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rooms_v2 room
      where room.id = room_program_layout_v1.room_id
        and room.type = 'place'
        and room.status = 'live'
    )
  );

create or replace function public.rooms_set_program_layout_v1(
  p_room_id uuid,
  p_expected_revision bigint,
  p_layout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_host_id uuid;
  v_room_status text;
  v_room_type text;
  v_allowed_ids text[];
  v_order text[];
  v_primary text;
  v_locked text;
  v_mode text;
  v_transition text;
  v_preset text;
  v_auto_profile text;
  v_sources jsonb;
  v_safe_framing jsonb;
  v_current_revision bigint;
  v_next_revision bigint;
  v_framing record;
  v_framing_locked boolean;
  v_framing_source_id text;
  v_safe_region jsonb;
  v_region_x numeric;
  v_region_y numeric;
  v_region_width numeric;
  v_region_height numeric;
  v_region_confidence numeric;
  v_max_zoom numeric;
  v_result public.room_program_layout_v1%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select room.host_id, room.status, room.type
    into v_host_id, v_room_status, v_room_type
  from public.rooms_v2 room
  where room.id = p_room_id
  for update;

  if v_host_id is null then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  if v_host_id <> v_user_id then
    raise exception 'Only the Room host can direct the program layout.' using errcode = '42501';
  end if;
  if v_room_status <> 'live' or v_room_type <> 'place' then
    raise exception 'Program layout can only change during a live Place Room.' using errcode = '55000';
  end if;
  if p_layout is null or jsonb_typeof(p_layout) <> 'object' then
    raise exception 'Invalid program layout payload.' using errcode = '22023';
  end if;
  if octet_length(p_layout::text) > 16384 then
    raise exception 'Program layout payload is too large.' using errcode = '22023';
  end if;

  v_mode := p_layout ->> 'mode';
  v_primary := nullif(btrim(p_layout ->> 'primaryParticipantId'), '');
  v_locked := nullif(btrim(p_layout ->> 'lockedParticipantId'), '');
  v_transition := coalesce(nullif(p_layout ->> 'transition', ''), 'dissolve');
  v_preset := coalesce(nullif(p_layout ->> 'preset', ''), 'performance');
  v_auto_profile := coalesce(nullif(p_layout ->> 'autoDirectorProfile', ''), 'calm');
  v_sources := coalesce(p_layout -> 'selectedSourceByParticipant', '{}'::jsonb);
  v_safe_framing := coalesce(p_layout -> 'safeFramingByParticipant', '{}'::jsonb);

  if v_mode not in ('auto', 'stage', 'grid', 'solo')
    or v_transition not in ('cut', 'dissolve')
    or v_preset not in ('performance', 'discussion', 'collaboration')
    or v_auto_profile not in ('calm', 'dynamic', 'manual') then
    raise exception 'Unsupported program layout option.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_layout -> 'participantOrder') <> 'array'
    or jsonb_typeof(v_sources) <> 'object'
    or jsonb_typeof(v_safe_framing) <> 'object' then
    raise exception 'Invalid program layout collections.' using errcode = '22023';
  end if;

  select coalesce(array_agg(item.value), '{}'::text[])
    into v_order
  from jsonb_array_elements_text(p_layout -> 'participantOrder') with ordinality item(value, position);

  select array_prepend(
    'host'::text,
    coalesce(array_agg(distinct invitation.guest_id::text), '{}'::text[])
  )
    into v_allowed_ids
  from public.room_invitations_v2 invitation
  where invitation.room_id = p_room_id
    and invitation.status = 'onstage'
    and invitation.ended_at is null
    and exists (
      select 1
      from public.room_participants_v2 participant
      where participant.room_id = invitation.room_id
        and participant.user_id = invitation.guest_id
        and participant.left_at is null
    );

  if cardinality(v_allowed_ids) > 4 then
    raise exception 'La Place cannot expose more than three on-stage guests.' using errcode = '23514';
  end if;

  -- The official layout must contain the host and every on-stage guest once,
  -- never a queue/backstage/ended identity.
  if cardinality(v_order) <> cardinality(v_allowed_ids)
    or exists (
      select 1 from unnest(v_order) as ordered(participant_id)
      where not (ordered.participant_id = any(v_allowed_ids))
    )
    or exists (
      select 1 from unnest(v_allowed_ids) as allowed(participant_id)
      where not (allowed.participant_id = any(v_order))
    )
    or cardinality(v_order) <> (
      select count(distinct ordered.participant_id)
      from unnest(v_order) as ordered(participant_id)
    )
    or v_primary is null
    or not (v_primary = any(v_allowed_ids))
    or not (v_primary = any(v_order))
    or (v_locked is not null and not (v_locked = any(v_allowed_ids))) then
    raise exception 'Program layout references a participant who is not on stage.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(v_sources) source(participant_id, source_id)
    where not (source.participant_id = any(v_allowed_ids))
      or jsonb_typeof(source.source_id) <> 'string'
      or length(trim(both '"' from source.source_id::text)) not between 1 and 128
  ) then
    raise exception 'Selected source references an invalid participant or source identifier.' using errcode = '22023';
  end if;

  for v_framing in
    select framing.participant_id, framing.configuration
    from jsonb_each(v_safe_framing) framing(participant_id, configuration)
  loop
    if not (v_framing.participant_id = any(v_allowed_ids)) then
      raise exception 'Safe framing references a participant who is not on stage.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_framing.configuration) is distinct from 'object'
      or jsonb_typeof(v_framing.configuration -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(v_framing.configuration -> 'locked') is distinct from 'boolean'
      or jsonb_typeof(v_framing.configuration -> 'maxZoom') is distinct from 'number'
      or (v_framing.configuration - array['enabled', 'locked', 'maxZoom', 'sourceId', 'safeRegion']) <> '{}'::jsonb then
      raise exception 'Invalid safe framing configuration.' using errcode = '22023';
    end if;
    begin
      v_framing_locked := (v_framing.configuration ->> 'locked')::boolean;
      v_max_zoom := (v_framing.configuration ->> 'maxZoom')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid safe framing zoom.' using errcode = '22023';
    end;
    if v_max_zoom < 1 or v_max_zoom > 1.18 then
      raise exception 'Safe framing zoom must stay between 1 and 1.18.' using errcode = '22023';
    end if;
    if v_framing_locked then
      v_framing_source_id := nullif(btrim(v_framing.configuration ->> 'sourceId'), '');
      v_safe_region := v_framing.configuration -> 'safeRegion';
      if (v_framing.configuration ->> 'enabled')::boolean is not true
        or jsonb_typeof(v_framing.configuration -> 'sourceId') is distinct from 'string'
        or v_framing_source_id is null
        or length(v_framing_source_id) > 128
        or (v_sources ->> v_framing.participant_id) is distinct from v_framing_source_id
        or jsonb_typeof(v_safe_region) is distinct from 'object'
        or (v_safe_region - array['x', 'y', 'width', 'height', 'confidence']) <> '{}'::jsonb
        or jsonb_typeof(v_safe_region -> 'x') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'y') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'width') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'height') is distinct from 'number'
        or jsonb_typeof(v_safe_region -> 'confidence') is distinct from 'number' then
        raise exception 'Locked framing requires its selected source and a complete safe region.' using errcode = '22023';
      end if;
      begin
        v_region_x := (v_safe_region ->> 'x')::numeric;
        v_region_y := (v_safe_region ->> 'y')::numeric;
        v_region_width := (v_safe_region ->> 'width')::numeric;
        v_region_height := (v_safe_region ->> 'height')::numeric;
        v_region_confidence := (v_safe_region ->> 'confidence')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Invalid locked safe region.' using errcode = '22023';
      end;
      if v_region_x < 0 or v_region_y < 0
        or v_region_width <= 0 or v_region_height <= 0
        or v_region_x + v_region_width > 1
        or v_region_y + v_region_height > 1
        or v_region_confidence < 0 or v_region_confidence > 1 then
        raise exception 'Locked safe region must remain inside normalized media bounds.' using errcode = '22023';
      end if;
    elsif v_framing.configuration ? 'sourceId' or v_framing.configuration ? 'safeRegion' then
      raise exception 'Unlocked framing cannot retain a frozen source or safe region.' using errcode = '22023';
    end if;
  end loop;

  select layout.revision
    into v_current_revision
  from public.room_program_layout_v1 layout
  where layout.room_id = p_room_id
  for update;

  if found then
    if p_expected_revision is null or p_expected_revision <> v_current_revision then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end if;
    v_next_revision := v_current_revision + 1;

    update public.room_program_layout_v1
    set revision = v_next_revision,
        mode = v_mode,
        primary_participant_id = v_primary,
        locked_participant_id = v_locked,
        participant_order = v_order,
        selected_source_by_participant = v_sources,
        transition = v_transition,
        preset = v_preset,
        auto_director_profile = v_auto_profile,
        safe_framing_by_participant = v_safe_framing,
        updated_by = v_user_id,
        updated_at = now()
    where room_id = p_room_id
    returning * into v_result;
  else
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end if;
    begin
      insert into public.room_program_layout_v1 (
        room_id,
        revision,
        mode,
        primary_participant_id,
        locked_participant_id,
        participant_order,
        selected_source_by_participant,
        transition,
        preset,
        auto_director_profile,
        safe_framing_by_participant,
        updated_by
      ) values (
        p_room_id,
        1,
        v_mode,
        v_primary,
        v_locked,
        v_order,
        v_sources,
        v_transition,
        v_preset,
        v_auto_profile,
        v_safe_framing,
        v_user_id
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Program layout revision conflict.' using errcode = '40001';
    end;
  end if;

  return jsonb_build_object(
    'roomId', v_result.room_id,
    'revision', v_result.revision,
    'mode', v_result.mode,
    'primaryParticipantId', v_result.primary_participant_id,
    'lockedParticipantId', v_result.locked_participant_id,
    'participantOrder', to_jsonb(v_result.participant_order),
    'selectedSourceByParticipant', v_result.selected_source_by_participant,
    'transition', v_result.transition,
    'preset', v_result.preset,
    'autoDirectorProfile', v_result.auto_director_profile,
    'safeFramingByParticipant', v_result.safe_framing_by_participant,
    'updatedBy', v_result.updated_by,
    'updatedAt', floor(extract(epoch from v_result.updated_at) * 1000)
  );
end;
$$;

revoke all on function public.rooms_set_program_layout_v1(uuid, bigint, jsonb) from public, anon;
grant execute on function public.rooms_set_program_layout_v1(uuid, bigint, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_program_layout_v1'
    ) then
    alter publication supabase_realtime add table public.room_program_layout_v1;
  end if;
end;
$$;
