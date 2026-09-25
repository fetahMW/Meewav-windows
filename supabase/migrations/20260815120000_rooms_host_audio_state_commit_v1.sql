-- Atomic Host program-audio state for live Place rooms.
--
-- The legacy iOS mixer columns and RPCs remain available. This migration only
-- adds a stricter command for Web and a narrow Realtime projection for active
-- room members.

alter table public.room_mixer_state_v2
  add column if not exists audio_route text not null default 'preview',
  add column if not exists audio_generation text,
  add column if not exists audio_revision bigint not null default 0,
  add column if not exists audio_idempotency_key text;

-- Keep legacy rooms_set_audio_live_enabled_v2 calls compatible with the new
-- route invariant. Explicit route writes remain authoritative.
create or replace function public.rooms_sync_audio_route_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.audio_route := case when new.audio_live_enabled then 'public' else 'preview' end;
    if not new.audio_live_enabled and new.audio_playback_state = 'playing' then
      new.audio_playback_state := 'previewing';
    elsif new.audio_live_enabled
      and new.audio_playback_state = 'playing'
      and not new.audio_preview_ready then
      new.audio_playback_state := 'paused';
    end if;
    return new;
  end if;

  if new.audio_route is distinct from old.audio_route then
    new.audio_live_enabled := new.audio_route = 'public';
  elsif new.audio_live_enabled is distinct from old.audio_live_enabled then
    new.audio_route := case when new.audio_live_enabled then 'public' else 'preview' end;
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_sync_audio_route_v1() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'room_mixer_state_sync_audio_route_v1'
      and tgrelid = 'public.room_mixer_state_v2'::regclass
      and not tgisinternal
  ) then
    create trigger room_mixer_state_sync_audio_route_v1
      before insert or update of audio_route, audio_live_enabled
      on public.room_mixer_state_v2
      for each row execute function public.rooms_sync_audio_route_v1();
  end if;
end;
$$;

-- The legacy live-route RPC keeps its exact signature and return type, while
-- this additive guard prevents its p_guest_id from targeting an arbitrary
-- account that is neither the Host nor an active room participant.
create or replace function public.rooms_assert_mixer_audio_target_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- INSERT is not column-qualified in a multi-event trigger. Camera, mic and
  -- gain RPCs may legitimately pre-create a default mixer row for backstage
  -- guests, so only treat a non-default audio payload as an audio target.
  if tg_op = 'INSERT' and not (
    new.audio_live_enabled
    or new.audio_preview_ready
    or new.audio_playback_state <> 'idle'
    or new.is_music_muted
    or new.audio_track_title is not null
    or new.audio_track_artist is not null
    or new.audio_track_duration_seconds is not null
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.rooms_v2 room
    where room.id = new.room_id
      and (
        room.host_id = new.guest_id
        or exists (
          select 1
          from public.room_participants_v2 participant
          where participant.room_id = room.id
            and participant.user_id = new.guest_id
            and participant.left_at is null
        )
      )
  ) then
    raise exception 'Audio target must be the Host or an active room participant.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_assert_mixer_audio_target_v1()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'room_mixer_state_assert_audio_target_v1'
      and tgrelid = 'public.room_mixer_state_v2'::regclass
      and not tgisinternal
  ) then
    create trigger room_mixer_state_assert_audio_target_v1
      before insert or update of audio_live_enabled
      on public.room_mixer_state_v2
      for each row execute function public.rooms_assert_mixer_audio_target_v1();
  end if;
end;
$$;

-- Legacy audio RPCs did not know about revisions or UUID generations. Advance
-- the revision for those updates, invalidate a changed track generation, and
-- translate their formerly-ambiguous local `playing` state to `previewing`.
-- The atomic RPC writes the next revision itself and therefore bypasses this
-- compatibility branch without requiring session flags.
create or replace function public.rooms_revision_legacy_audio_state_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.audio_revision is not distinct from old.audio_revision then
    new.audio_revision := old.audio_revision + 1;
    new.audio_idempotency_key := null;

    if new.audio_preview_ready is distinct from old.audio_preview_ready
      or new.audio_track_title is distinct from old.audio_track_title
      or new.audio_track_artist is distinct from old.audio_track_artist
      or new.audio_track_duration_seconds is distinct from old.audio_track_duration_seconds then
      new.audio_generation := null;
    end if;

    if not new.audio_live_enabled and new.audio_playback_state = 'playing' then
      new.audio_playback_state := 'previewing';
    elsif new.audio_live_enabled
      and new.audio_playback_state = 'playing'
      and not new.audio_preview_ready then
      new.audio_playback_state := 'paused';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_revision_legacy_audio_state_v1()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'room_mixer_state_revision_legacy_audio_v1'
      and tgrelid = 'public.room_mixer_state_v2'::regclass
      and not tgisinternal
  ) then
    create trigger room_mixer_state_revision_legacy_audio_v1
      before update of
        audio_route,
        audio_live_enabled,
        is_music_muted,
        audio_preview_ready,
        audio_playback_state,
        audio_track_title,
        audio_track_artist,
        audio_track_duration_seconds
      on public.room_mixer_state_v2
      for each row execute function public.rooms_revision_legacy_audio_state_v1();
  end if;
end;
$$;

-- Normalize pre-existing rows once so every new invariant can be validated.
update public.room_mixer_state_v2
set
  audio_route = case when audio_live_enabled then 'public' else 'preview' end,
  audio_playback_state = case
    when not audio_live_enabled and audio_playback_state = 'playing'
      then case when audio_preview_ready then 'previewing' else 'idle' end
    when audio_live_enabled and audio_playback_state = 'playing' and not audio_preview_ready
      then 'paused'
    else audio_playback_state
  end,
  audio_track_title = nullif(left(btrim(audio_track_title), 160), ''),
  audio_track_artist = nullif(left(btrim(audio_track_artist), 160), ''),
  audio_track_duration_seconds = case
    when audio_track_duration_seconds is null then null
    else least(greatest(audio_track_duration_seconds, 0), 86400)
  end,
  audio_generation = nullif(lower(btrim(audio_generation)), ''),
  audio_revision = greatest(audio_revision, 0)
where
  audio_route is distinct from case when audio_live_enabled then 'public' else 'preview' end
  or (not audio_live_enabled and audio_playback_state = 'playing')
  or (audio_live_enabled and audio_playback_state = 'playing' and not audio_preview_ready)
  or audio_track_title is distinct from nullif(left(btrim(audio_track_title), 160), '')
  or audio_track_artist is distinct from nullif(left(btrim(audio_track_artist), 160), '')
  or audio_track_duration_seconds is distinct from case
    when audio_track_duration_seconds is null then null
    else least(greatest(audio_track_duration_seconds, 0), 86400)
  end
  or audio_generation is distinct from nullif(lower(btrim(audio_generation)), '')
  or audio_revision < 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_route_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_route_check
      check (audio_route in ('preview', 'public')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_generation_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_generation_check
      check (
        audio_generation is null
        or audio_generation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_revision_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_revision_check
      check (audio_revision >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_idempotency_key_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_idempotency_key_check
      check (
        audio_idempotency_key is null
        or char_length(audio_idempotency_key) between 8 and 128
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_title_length_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_title_length_check
      check (audio_track_title is null or char_length(audio_track_title) between 1 and 160) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_artist_length_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_artist_length_check
      check (audio_track_artist is null or char_length(audio_track_artist) between 1 and 160) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_duration_bounded_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_duration_bounded_check
      check (
        audio_track_duration_seconds is null
        or audio_track_duration_seconds between 0 and 86400
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_audio_route_live_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_audio_route_live_check
      check (audio_live_enabled = (audio_route = 'public')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_preview_not_playing_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_preview_not_playing_check
      check (audio_route <> 'preview' or audio_playback_state <> 'playing') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'room_mixer_state_v2_public_playing_ready_check'
      and conrelid = 'public.room_mixer_state_v2'::regclass
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_public_playing_ready_check
      check (
        audio_route <> 'public'
        or audio_playback_state <> 'playing'
        or (audio_preview_ready and audio_live_enabled)
      ) not valid;
  end if;
end;
$$;

alter table public.room_mixer_state_v2
  validate constraint room_mixer_state_v2_audio_route_check,
  validate constraint room_mixer_state_v2_audio_generation_check,
  validate constraint room_mixer_state_v2_audio_revision_check,
  validate constraint room_mixer_state_v2_audio_idempotency_key_check,
  validate constraint room_mixer_state_v2_audio_title_length_check,
  validate constraint room_mixer_state_v2_audio_artist_length_check,
  validate constraint room_mixer_state_v2_audio_duration_bounded_check,
  validate constraint room_mixer_state_v2_audio_route_live_check,
  validate constraint room_mixer_state_v2_preview_not_playing_check,
  validate constraint room_mixer_state_v2_public_playing_ready_check;

create table if not exists public.room_public_audio_state_v1 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  audio_track_title text,
  audio_track_artist text,
  audio_track_duration_seconds integer,
  audio_route text not null default 'preview',
  audio_playback_state text not null default 'idle',
  audio_generation text,
  audio_revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint room_public_audio_state_v1_title_length_check
    check (audio_track_title is null or char_length(audio_track_title) between 1 and 160),
  constraint room_public_audio_state_v1_artist_length_check
    check (audio_track_artist is null or char_length(audio_track_artist) between 1 and 160),
  constraint room_public_audio_state_v1_duration_check
    check (audio_track_duration_seconds is null or audio_track_duration_seconds between 0 and 86400),
  constraint room_public_audio_state_v1_route_check
    check (audio_route in ('preview', 'public')),
  constraint room_public_audio_state_v1_playback_state_check
    check (audio_playback_state in ('idle', 'ready', 'previewing', 'playing', 'paused', 'ended')),
  constraint room_public_audio_state_v1_generation_check
    check (
      audio_generation is null
      or audio_generation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  constraint room_public_audio_state_v1_revision_check
    check (audio_revision >= 0),
  constraint room_public_audio_state_v1_preview_not_playing_check
    check (audio_route <> 'preview' or audio_playback_state <> 'playing')
);

alter table public.room_public_audio_state_v1 replica identity full;
alter table public.room_public_audio_state_v1 enable row level security;

revoke all on table public.room_public_audio_state_v1 from public, anon, authenticated;
grant select on table public.room_public_audio_state_v1 to authenticated;
grant all on table public.room_public_audio_state_v1 to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'room_public_audio_state_v1'
      and policyname = 'room_public_audio_state_v1_active_member_select'
  ) then
    create policy room_public_audio_state_v1_active_member_select
      on public.room_public_audio_state_v1
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.rooms_v2 room
          where room.id = room_public_audio_state_v1.room_id
            and room.type = 'place'
            and room.status = 'live'
            and (
              room.host_id = auth.uid()
              or exists (
                select 1
                from public.room_participants_v2 participant
                where participant.room_id = room.id
                  and participant.user_id = auth.uid()
                  and participant.left_at is null
              )
            )
        )
      );
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_public_audio_state_v1'
    ) then
    alter publication supabase_realtime add table public.room_public_audio_state_v1;
  end if;
end;
$$;

-- This function intentionally projects only editorial player state. It does
-- not expose transport identifiers or claim that a media publication exists.
create or replace function public.rooms_refresh_public_audio_state_v1(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  select room.* into v_room
  from public.rooms_v2 room
  where room.id = p_room_id;

  if not found or v_room.type <> 'place' or v_room.status <> 'live' then
    delete from public.room_public_audio_state_v1 state
    where state.room_id = p_room_id;
    return;
  end if;

  insert into public.room_public_audio_state_v1 (
    room_id,
    audio_track_title,
    audio_track_artist,
    audio_track_duration_seconds,
    audio_route,
    audio_playback_state,
    audio_generation,
    audio_revision,
    updated_at
  )
  select
    v_room.id,
    case when mixer.audio_route = 'public' then mixer.audio_track_title end,
    case when mixer.audio_route = 'public' then mixer.audio_track_artist end,
    case when mixer.audio_route = 'public' then mixer.audio_track_duration_seconds end,
    coalesce(mixer.audio_route, 'preview'),
    case
      when mixer.audio_route = 'public' then coalesce(mixer.audio_playback_state, 'idle')
      else 'idle'
    end,
    case when mixer.audio_route = 'public' then mixer.audio_generation end,
    coalesce(mixer.audio_revision, 0),
    coalesce(mixer.audio_updated_at, v_room.updated_at, now())
  from (values (true)) seed(single_row)
  left join public.room_mixer_state_v2 mixer
    on mixer.room_id = v_room.id
   and mixer.guest_id = v_room.host_id
  on conflict (room_id)
  do update set
    audio_track_title = excluded.audio_track_title,
    audio_track_artist = excluded.audio_track_artist,
    audio_track_duration_seconds = excluded.audio_track_duration_seconds,
    audio_route = excluded.audio_route,
    audio_playback_state = excluded.audio_playback_state,
    audio_generation = excluded.audio_generation,
    audio_revision = excluded.audio_revision,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.rooms_refresh_public_audio_state_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_refresh_public_audio_state_v1(uuid) to service_role;

create or replace function public.rooms_refresh_public_audio_from_mixer_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_guest_id uuid;
begin
  if tg_op = 'DELETE' then
    v_room_id := old.room_id;
    v_guest_id := old.guest_id;
  else
    v_room_id := new.room_id;
    v_guest_id := new.guest_id;
  end if;

  if exists (
    select 1
    from public.rooms_v2 room
    where room.id = v_room_id
      and room.host_id = v_guest_id
  ) then
    perform public.rooms_refresh_public_audio_state_v1(v_room_id);
  end if;

  return null;
end;
$$;

revoke all on function public.rooms_refresh_public_audio_from_mixer_v1()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'room_mixer_state_refresh_public_audio_v1'
      and tgrelid = 'public.room_mixer_state_v2'::regclass
      and not tgisinternal
  ) then
    create trigger room_mixer_state_refresh_public_audio_v1
      after insert or delete or update of
        audio_route,
        audio_live_enabled,
        is_music_muted,
        audio_preview_ready,
        audio_playback_state,
        audio_track_title,
        audio_track_artist,
        audio_track_duration_seconds,
        audio_generation,
        audio_revision
      on public.room_mixer_state_v2
      for each row execute function public.rooms_refresh_public_audio_from_mixer_v1();
  end if;
end;
$$;

create or replace function public.rooms_refresh_public_audio_from_room_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rooms_refresh_public_audio_state_v1(new.id);
  return new;
end;
$$;

revoke all on function public.rooms_refresh_public_audio_from_room_v1()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'rooms_v2_refresh_public_audio_v1'
      and tgrelid = 'public.rooms_v2'::regclass
      and not tgisinternal
  ) then
    create trigger rooms_v2_refresh_public_audio_v1
      after insert or update of status, type, host_id
      on public.rooms_v2
      for each row execute function public.rooms_refresh_public_audio_from_room_v1();
  end if;
end;
$$;

-- Seed one safe row for every currently live Place room. The Host mixer row is
-- optional; absent state projects as idle preview.
insert into public.room_public_audio_state_v1 (
  room_id,
  audio_track_title,
  audio_track_artist,
  audio_track_duration_seconds,
  audio_route,
  audio_playback_state,
  audio_generation,
  audio_revision,
  updated_at
)
select
  room.id,
  case when mixer.audio_route = 'public' then mixer.audio_track_title end,
  case when mixer.audio_route = 'public' then mixer.audio_track_artist end,
  case when mixer.audio_route = 'public' then mixer.audio_track_duration_seconds end,
  coalesce(mixer.audio_route, 'preview'),
  case
    when mixer.audio_route = 'public' then coalesce(mixer.audio_playback_state, 'idle')
    else 'idle'
  end,
  case when mixer.audio_route = 'public' then mixer.audio_generation end,
  coalesce(mixer.audio_revision, 0),
  coalesce(mixer.audio_updated_at, room.updated_at, now())
from public.rooms_v2 room
left join public.room_mixer_state_v2 mixer
  on mixer.room_id = room.id
 and mixer.guest_id = room.host_id
where room.type = 'place'
  and room.status = 'live'
on conflict (room_id)
do update set
  audio_track_title = excluded.audio_track_title,
  audio_track_artist = excluded.audio_track_artist,
  audio_track_duration_seconds = excluded.audio_track_duration_seconds,
  audio_route = excluded.audio_route,
  audio_playback_state = excluded.audio_playback_state,
  audio_generation = excluded.audio_generation,
  audio_revision = excluded.audio_revision,
  updated_at = excluded.updated_at;

create or replace function public.rooms_commit_host_audio_state_v1(
  p_room_id uuid,
  p_route text,
  p_playback_state text,
  p_preview_ready boolean,
  p_generation text,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_track_title text default null,
  p_track_artist text default null,
  p_duration_seconds integer default null
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host_id uuid;
  v_state public.room_mixer_state_v2%rowtype;
  v_track_title text := nullif(btrim(p_track_title), '');
  v_track_artist text := nullif(btrim(p_track_artist), '');
  v_generation text := nullif(lower(btrim(p_generation)), '');
  v_idempotency_key text := btrim(p_idempotency_key);
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select room.host_id into v_host_id
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.type = 'place'
    and room.status = 'live'
  for update;

  if not found then
    raise exception 'Live Place room unavailable.' using errcode = '55000';
  end if;

  if v_host_id <> auth.uid() then
    raise exception 'Only the room Host can commit program audio.' using errcode = '42501';
  end if;

  if p_route is null or p_route not in ('preview', 'public') then
    raise exception 'Invalid audio route.' using errcode = '22023';
  end if;

  if p_playback_state is null
    or p_playback_state not in ('idle', 'ready', 'previewing', 'playing', 'paused', 'ended') then
    raise exception 'Invalid audio playback state.' using errcode = '22023';
  end if;

  if p_preview_ready is null then
    raise exception 'Preview readiness is required.' using errcode = '22004';
  end if;

  if v_generation is not null and v_generation !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid audio generation.' using errcode = '22023';
  end if;

  if p_preview_ready and v_generation is null then
    raise exception 'A ready preview requires an audio generation.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected audio revision.' using errcode = '22023';
  end if;

  if v_idempotency_key is null or char_length(v_idempotency_key) not between 8 and 128 then
    raise exception 'Invalid audio idempotency key.' using errcode = '22023';
  end if;

  if v_track_title is not null and char_length(v_track_title) > 160 then
    raise exception 'Audio title is too long.' using errcode = '22001';
  end if;

  if v_track_artist is not null and char_length(v_track_artist) > 160 then
    raise exception 'Audio artist is too long.' using errcode = '22001';
  end if;

  if p_duration_seconds is not null and p_duration_seconds not between 0 and 86400 then
    raise exception 'Invalid audio duration.' using errcode = '22023';
  end if;

  if p_route = 'preview' and p_playback_state = 'playing' then
    raise exception 'Preview audio cannot use the public playing state.' using errcode = '22023';
  end if;

  if p_route = 'public' and p_playback_state = 'previewing' then
    raise exception 'Public audio cannot use the previewing state.' using errcode = '22023';
  end if;

  if p_route = 'public' and not p_preview_ready then
    raise exception 'Public audio requires a ready preview.' using errcode = '22023';
  end if;

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    is_music_muted,
    audio_live_enabled,
    audio_preview_ready,
    audio_playback_state,
    audio_track_title,
    audio_track_artist,
    audio_track_duration_seconds,
    audio_updated_at,
    audio_route,
    audio_generation,
    audio_revision,
    audio_idempotency_key,
    updated_at
  ) values (
    p_room_id,
    v_host_id,
    false,
    false,
    false,
    'idle',
    null,
    null,
    null,
    now(),
    'preview',
    null,
    0,
    null,
    now()
  )
  on conflict (room_id, guest_id) do nothing;

  select mixer.* into v_state
  from public.room_mixer_state_v2 mixer
  where mixer.room_id = p_room_id
    and mixer.guest_id = v_host_id
  for update;

  if v_state.audio_idempotency_key = v_idempotency_key then
    if v_state.audio_route is distinct from p_route
      or v_state.audio_playback_state is distinct from p_playback_state
      or v_state.audio_preview_ready is distinct from p_preview_ready
      or v_state.audio_generation is distinct from v_generation
      or v_state.audio_track_title is distinct from v_track_title
      or v_state.audio_track_artist is distinct from v_track_artist
      or v_state.audio_track_duration_seconds is distinct from p_duration_seconds then
      raise exception 'Audio idempotency key was reused with a different command.' using errcode = '22023';
    end if;

    return v_state;
  end if;

  if p_expected_revision <> v_state.audio_revision then
    raise exception 'Stale audio revision.' using errcode = '40001';
  end if;

  -- A new track must always enter through local preview. Moving to Public is
  -- only legal for the already-previewed generation and unchanged metadata.
  if v_generation is distinct from v_state.audio_generation and p_route <> 'preview' then
    raise exception 'A new audio generation must enter through preview.' using errcode = '22023';
  end if;

  if p_route = 'public' and (
    not v_state.audio_preview_ready
    or v_generation is distinct from v_state.audio_generation
    or v_state.audio_track_title is distinct from v_track_title
    or v_state.audio_track_artist is distinct from v_track_artist
    or v_state.audio_track_duration_seconds is distinct from p_duration_seconds
  ) then
    raise exception 'Public audio must match the validated preview.' using errcode = '22023';
  end if;

  update public.room_mixer_state_v2 mixer
  set
    audio_live_enabled = p_route = 'public',
    audio_preview_ready = p_preview_ready,
    audio_playback_state = p_playback_state,
    audio_track_title = v_track_title,
    audio_track_artist = v_track_artist,
    audio_track_duration_seconds = p_duration_seconds,
    audio_updated_at = now(),
    audio_route = p_route,
    audio_generation = v_generation,
    audio_revision = v_state.audio_revision + 1,
    audio_idempotency_key = v_idempotency_key,
    updated_at = now()
  where mixer.room_id = p_room_id
    and mixer.guest_id = v_host_id
  returning mixer.* into v_state;

  return v_state;
end;
$$;

revoke all on function public.rooms_commit_host_audio_state_v1(
  uuid, text, text, boolean, text, bigint, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.rooms_commit_host_audio_state_v1(
  uuid, text, text, boolean, text, bigint, text, text, text, integer
) to authenticated, service_role;

comment on function public.rooms_commit_host_audio_state_v1(
  uuid, text, text, boolean, text, bigint, text, text, text, integer
) is 'Atomically commits the authenticated live Place Host audio route and editorial playback state. Revisions are monotonic and the latest command is idempotent.';

comment on table public.room_public_audio_state_v1 is
  'Realtime-safe Host player projection for active live Place members. Contains editorial state only, never media transport identifiers.';
