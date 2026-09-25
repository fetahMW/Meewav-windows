-- Deterministic Meewav grades (the six badges used by Web) and cross-pillar
-- analytics contracts. No Rooms v2 object is referenced or modified.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Grade catalog and append-only history
-- ---------------------------------------------------------------------------

create table if not exists public.grade_levels (
  level smallint primary key check (level between 1 and 6),
  code text not null unique,
  label text not null,
  short_label text not null,
  description text not null,
  main_color text not null,
  soft_color text not null,
  dark_color text not null,
  visual_key text not null unique,
  minimum_points bigint not null default 0 check (minimum_points >= 0),
  sort_order smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.grade_levels (
  level, code, label, short_label, description, main_color, soft_color,
  dark_color, visual_key, minimum_points, sort_order, is_active
)
values
  (1, 'beginner', 'Débutant', 'N1', 'Premiers pas dans le réseau.', '#FFFFFF', '#F8FAFC', '#2A243A', 'grade-white', 0, 1, true),
  (2, 'emerging', 'Émergent', 'N2', 'Présence musicale en progression.', '#F59E0B', '#FDE68A', '#78350F', 'grade-orange', 1000, 2, true),
  (3, 'confirmed', 'Confirmé', 'N3', 'Activité et réseau solides.', '#34D399', '#86EFAC', '#064E3B', 'grade-green', 2000, 3, true),
  (4, 'elite', 'Élite', 'N4', 'Profil remarqué dans la communauté.', '#EC4899', '#F9A8D4', '#831843', 'grade-pink', 3000, 4, true),
  (5, 'master', 'Maître', 'N5', 'Statut prestigieux reconnu.', '#2563FF', '#93C5FD', '#102A6B', 'grade-blue', 4000, 5, true),
  (6, 'legendary', 'Légendaire', 'LEG', 'Icône du réseau Meewav.', '#6A00FF', '#F0D5FF', '#1B003C', 'grade-legendary', 6000, 6, true)
on conflict (level) do update
set code = excluded.code,
    label = excluded.label,
    short_label = excluded.short_label,
    description = excluded.description,
    main_color = excluded.main_color,
    soft_color = excluded.soft_color,
    dark_color = excluded.dark_color,
    visual_key = excluded.visual_key,
    minimum_points = excluded.minimum_points,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

create table if not exists public.profile_grade_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  level smallint not null default 1 references public.grade_levels(level) on delete restrict,
  total_points bigint not null default 0 check (total_points >= 0),
  progress_basis_points integer not null default 0
    check (progress_basis_points between 0 and 10000),
  source text not null default 'account_creation',
  last_event_id uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_grade_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  points_delta integer not null,
  level_before smallint not null references public.grade_levels(level) on delete restrict,
  level_after smallint not null references public.grade_levels(level) on delete restrict,
  source_pillar text not null,
  event_name text not null,
  source_event_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint profile_grade_events_source_pillar_check check (
    source_pillar in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin', 'system')
  ),
  unique (profile_id, source_pillar, source_event_id)
);

create index if not exists profile_grade_events_profile_time_idx
  on public.profile_grade_events(profile_id, occurred_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profile_grade_state'::regclass
      and conname = 'profile_grade_state_last_event_fk'
  ) then
    alter table public.profile_grade_state
      add constraint profile_grade_state_last_event_fk
      foreign key (last_event_id) references public.profile_grade_events(id)
      on delete set null not valid;
  end if;
end;
$$;

create table if not exists public.profile_grade_legacy_imports (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_row_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  original_grade integer,
  original_grade_level integer,
  original_grade_tier text,
  mapped_level smallint not null references public.grade_levels(level) on delete restrict,
  resolution text not null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (source_table, source_row_id)
);

-- Snapshot every existing profile grade before canonical state is initialized.
insert into public.profile_grade_legacy_imports (
  source_table, source_row_id, profile_id, original_grade, mapped_level,
  resolution, raw_snapshot
)
select
  'profiles',
  p.id::text,
  p.id,
  p.grade,
  case when p.grade between 1 and 6 then p.grade::smallint else 1 end,
  case when p.grade between 1 and 6 then 'canonical_existing' else 'invalid_defaulted_to_beginner' end,
  jsonb_build_object('grade', p.grade, 'captured_at', now())
from public.profiles p
on conflict (source_table, source_row_id) do nothing;

insert into public.profile_grade_state (
  profile_id, level, total_points, progress_basis_points, source, version
)
select
  i.profile_id,
  i.mapped_level,
  0,
  0,
  'legacy_profiles_grade',
  1
from public.profile_grade_legacy_imports i
where i.source_table = 'profiles' and i.profile_id is not null
on conflict (profile_id) do nothing;

-- Any account without historical grade starts deterministically at Débutant.
insert into public.profile_grade_state (profile_id, level, source)
select p.id, 1, 'deterministic_default_v1'
from public.profiles p
on conflict (profile_id) do nothing;

create or replace function public.meewav_grade_code(p_level integer)
returns text
language sql
immutable
as $$
  select case p_level
    when 1 then 'beginner'
    when 2 then 'emerging'
    when 3 then 'confirmed'
    when 4 then 'elite'
    when 5 then 'master'
    when 6 then 'legendary'
    else null
  end;
$$;

-- Keep the legacy RPC name for iOS/Globe compatibility, but align its values
-- with the six canonical badges. Numeric level remains the source of truth.
create or replace function public.meewav_artist_grade_tier(stars integer)
returns text
language sql
immutable
as $$
  select public.meewav_grade_code(stars);
$$;

create or replace function public.meewav_can_manage_profile_grade()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.enforce_profile_grade()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.grade is null or not public.meewav_can_manage_profile_grade() then
      new.grade := 1;
    end if;
    return new;
  end if;

  if new.grade is distinct from old.grade
     and not public.meewav_can_manage_profile_grade() then
    raise exception using errcode = '42501', message = 'profile_grade_is_server_managed';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_grade_on_insert_trigger'
      and not tgisinternal
  ) then
    create trigger enforce_profile_grade_on_insert_trigger
    before insert on public.profiles
    for each row execute function public.enforce_profile_grade();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_grade_on_update_trigger'
      and not tgisinternal
  ) then
    create trigger enforce_profile_grade_on_update_trigger
    before update of grade on public.profiles
    for each row execute function public.enforce_profile_grade();
  end if;
end;
$$;

create or replace function public.meewav_sync_profile_grade_compatibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
  set grade = new.level, updated_at = now()
  where id = new.profile_id and grade is distinct from new.level;
  return new;
end;
$$;

drop trigger if exists profile_grade_state_sync_legacy on public.profile_grade_state;
create trigger profile_grade_state_sync_legacy
after insert or update of level on public.profile_grade_state
for each row execute function public.meewav_sync_profile_grade_compatibility();

create or replace function public.meewav_initialize_profile_grade_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profile_grade_state(profile_id, level, source)
  values (new.id, case when new.grade between 1 and 6 then new.grade::smallint else 1 end, 'account_creation')
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_initialize_grade_state on public.profiles;
create trigger profiles_initialize_grade_state
after insert on public.profiles
for each row execute function public.meewav_initialize_profile_grade_state();

create or replace function public.apply_profile_grade_event(
  p_profile_id uuid,
  p_points_delta integer,
  p_source_pillar text,
  p_event_name text,
  p_source_event_id text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.profile_grade_state%rowtype;
  v_event_id uuid;
  v_points bigint;
  v_level smallint;
  v_applied_delta integer;
begin
  if not public.meewav_can_manage_profile_grade() then
    raise exception using errcode = '42501', message = 'grade_service_role_required';
  end if;
  if nullif(trim(p_source_event_id), '') is null
     or nullif(trim(p_event_name), '') is null then
    raise exception using errcode = '22023', message = 'grade_event_identity_required';
  end if;

  select * into v_state
  from public.profile_grade_state
  where profile_id = p_profile_id
  for update;

  if not found then
    insert into public.profile_grade_state(profile_id, level, source)
    values (p_profile_id, 1, 'grade_event_initialization')
    returning * into v_state;
  end if;

  select id into v_event_id
  from public.profile_grade_events
  where profile_id = p_profile_id
    and source_pillar = p_source_pillar
    and source_event_id = p_source_event_id;

  if v_event_id is not null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'event_id', v_event_id,
      'profile_id', v_state.profile_id, 'level', v_state.level,
      'total_points', v_state.total_points
    );
  end if;

  v_points := greatest(0, v_state.total_points + p_points_delta::bigint);
  v_applied_delta := (v_points - v_state.total_points)::integer;
  select coalesce(max(level), 1)::smallint into v_level
  from public.grade_levels
  where is_active and minimum_points <= v_points;

  insert into public.profile_grade_events (
    profile_id, points_delta, level_before, level_after, source_pillar,
    event_name, source_event_id, reason, metadata
  ) values (
    p_profile_id, v_applied_delta, v_state.level, v_level,
    p_source_pillar, trim(p_event_name), trim(p_source_event_id),
    p_reason,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'grade_engine', jsonb_build_object('requested_points_delta', p_points_delta)
    )
  ) returning id into v_event_id;

  update public.profile_grade_state
  set level = v_level,
      total_points = v_points,
      progress_basis_points = case
        when v_level = 6 then 10000
        else least(10000, greatest(0, round(
          (v_points - (select minimum_points from public.grade_levels where level = v_level))::numeric
          / nullif(
              (select minimum_points from public.grade_levels where level = v_level + 1)
              - (select minimum_points from public.grade_levels where level = v_level),
              0
            ) * 10000
        )::integer))
      end,
      source = p_source_pillar,
      last_event_id = v_event_id,
      version = version + 1,
      updated_at = now()
  where profile_id = p_profile_id
  returning * into v_state;

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'event_id', v_event_id,
    'profile_id', v_state.profile_id, 'level', v_state.level,
    'total_points', v_state.total_points,
    'progress_basis_points', v_state.progress_basis_points
  );
end;
$$;

-- Historical random helpers are retained for schema compatibility but can no
-- longer be called by clients. Canonical grade assignment never invokes them.
do $$
begin
  if to_regprocedure('public.meewav_random_artist_grade_level()') is not null then
    execute 'revoke all on function public.meewav_random_artist_grade_level() from public, anon, authenticated';
    execute 'comment on function public.meewav_random_artist_grade_level() is ''DEPRECATED: never use for canonical profile grades.''';
  end if;
  if to_regprocedure('public.meewav_random_artist_grade_stars()') is not null then
    execute 'revoke all on function public.meewav_random_artist_grade_stars() from public, anon, authenticated';
    execute 'comment on function public.meewav_random_artist_grade_stars() is ''DEPRECATED: never use for canonical profile grades.''';
  end if;
end;
$$;

-- profile_badges are recognitions, not grade levels. Clients may read them but
-- may not mint, edit, or delete recognitions themselves.
drop policy if exists "Créer ses badges profil" on public.profile_badges;
drop policy if exists "Modifier ses badges profil" on public.profile_badges;
drop policy if exists "Supprimer ses badges profil" on public.profile_badges;
revoke insert, update, delete on public.profile_badges from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cross-pillar analytics. Raw events never grant grade/financial authority.
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  subject_profile_id uuid references public.profiles(id) on delete cascade,
  source_pillar text not null,
  event_name text not null,
  source_event_id text,
  idempotency_key text,
  session_id uuid,
  trust_level text not null default 'client',
  properties jsonb not null default '{}'::jsonb,
  schema_version smallint not null default 1,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  constraint analytics_events_source_pillar_check check (
    source_pillar in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin')
  ),
  constraint analytics_events_trust_level_check check (
    trust_level in ('client', 'server', 'verified')
  ),
  constraint analytics_events_properties_size_check check (
    octet_length(properties::text) <= 8192
  ),
  constraint analytics_events_idempotency_size_check check (
    idempotency_key is null or char_length(idempotency_key) between 8 and 128
  )
);

create unique index if not exists analytics_events_idempotency_idx
  on public.analytics_events(actor_profile_id, source_pillar, idempotency_key)
  where idempotency_key is not null;
create index if not exists analytics_events_subject_time_idx
  on public.analytics_events(subject_profile_id, occurred_at desc);
create index if not exists analytics_events_rollup_idx
  on public.analytics_events(source_pillar, event_name, occurred_at);
create index if not exists analytics_events_actor_received_idx
  on public.analytics_events(actor_profile_id, received_at desc)
  where trust_level = 'client';

create table if not exists public.profile_daily_metrics (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  metric_date date not null,
  source_pillar text not null,
  metric_name text not null,
  metric_value bigint not null default 0,
  unique_visitors bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (profile_id, metric_date, source_pillar, metric_name),
  constraint profile_daily_metrics_source_pillar_check check (
    source_pillar in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin')
  )
);

create index if not exists profile_daily_metrics_profile_date_idx
  on public.profile_daily_metrics(profile_id, metric_date desc);

-- Exact visitor de-duplication keeps the realtime rollup O(1) per event. This
-- internal table is never exposed to browser roles.
create table if not exists public.profile_daily_metric_visitors (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  metric_date date not null,
  source_pillar text not null,
  metric_name text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (
    profile_id, metric_date, source_pillar, metric_name, actor_profile_id
  ),
  constraint profile_daily_metric_visitors_source_pillar_check check (
    source_pillar in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin')
  )
);

create index if not exists profile_daily_metric_visitors_actor_idx
  on public.profile_daily_metric_visitors(actor_profile_id, metric_date desc);

create or replace function public.meewav_guard_follow_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  -- SECURITY DEFINER changes current_user to the function owner. The JWT role
  -- is therefore the only trustworthy way to distinguish a service request
  -- from an authenticated browser call here.
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service and new.follower_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'follow_actor_mismatch';
  end if;
  if new.follower_id = new.following_id then
    raise exception using errcode = '23514', message = 'cannot_follow_self';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.following_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  ) then
    raise exception using errcode = '23503', message = 'follow_profile_not_available';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('profile-follow:' || new.follower_id::text, 0)
  );
  new.created_at := clock_timestamp();

  if not v_is_service and exists (
    select 1
    from public.analytics_events e
    where e.actor_profile_id = new.follower_id
      and e.subject_profile_id = new.following_id
      and e.event_name = 'follow_created'
      and e.received_at >= now() - interval '5 minutes'
  ) then
    raise exception using errcode = '54000', message = 'follow_refollow_cooldown';
  end if;

  if not v_is_service and (
    select count(*)
    from public.analytics_events e
    where e.actor_profile_id = new.follower_id
      and e.event_name = 'follow_created'
      and e.received_at >= now() - interval '1 hour'
  ) >= 60 then
    raise exception using errcode = '54000', message = 'follow_hourly_rate_limit';
  end if;

  return new;
end;
$$;

drop trigger if exists follows_guard_insert on public.follows;
create trigger follows_guard_insert
before insert on public.follows
for each row execute function public.meewav_guard_follow_insert();

create or replace function public.track_analytics_event(
  p_subject_profile_id uuid,
  p_source_pillar text,
  p_event_name text,
  p_idempotency_key text default null,
  p_session_id uuid default null,
  p_properties jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid;
  v_event_name text := lower(trim(coalesce(p_event_name, '')));
  v_source text := lower(trim(coalesce(p_source_pillar, '')));
  v_idempotency_key text := nullif(trim(p_idempotency_key), '');
  v_properties jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_source not in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin') then
    raise exception using errcode = '22023', message = 'invalid_source_pillar';
  end if;

  -- Client events are deliberately non-authoritative. Economic, moderation,
  -- grade and entitlement events must be emitted by trusted server code.
  if v_event_name not in (
    'profile_view', 'media_impression', 'media_play', 'media_complete',
    'search_result_view', 'globe_profile_open', 'share_open',
    'message_composer_open', 'room_card_view', 'short_impression',
    'marketplace_listing_view', 'tremplin_entry_view'
  ) then
    raise exception using errcode = '22023', message = 'client_event_not_allowed';
  end if;

  if not (
    (v_source = 'profile' and v_event_name in (
      'profile_view', 'media_impression', 'media_play', 'media_complete',
      'share_open', 'message_composer_open'
    ))
    or (v_source = 'globe' and v_event_name in (
      'search_result_view', 'globe_profile_open', 'media_impression',
      'media_play', 'media_complete', 'share_open', 'message_composer_open'
    ))
    or (v_source = 'messaging' and v_event_name = 'message_composer_open')
    or (v_source = 'rooms' and v_event_name = 'room_card_view')
    or (v_source = 'shorts' and v_event_name = 'short_impression')
    or (v_source = 'marketplace' and v_event_name = 'marketplace_listing_view')
    or (v_source = 'tremplin' and v_event_name = 'tremplin_entry_view')
  ) then
    raise exception using errcode = '22023', message = 'client_event_source_mismatch';
  end if;

  if p_subject_profile_id is null then
    raise exception using errcode = '22023', message = 'subject_profile_required';
  end if;
  if p_subject_profile_id = v_actor then
    raise exception using errcode = '22023', message = 'self_analytics_event_not_allowed';
  end if;

  if v_idempotency_key is null or char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'valid_idempotency_key_required';
  end if;

  if octet_length(coalesce(p_properties, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22001', message = 'analytics_properties_too_large';
  end if;

  if not exists (
       select 1
       from public.profiles p
       where p.id = p_subject_profile_id
         and (
           p.id = v_actor
           or (
             coalesce(p.show_on_public_profile, false)
             and not coalesce(p.is_ghost_mode, true)
           )
         )
     ) then
    raise exception using errcode = '23503', message = 'subject_profile_not_available';
  end if;

  select e.id into v_event_id
  from public.analytics_events e
  where e.actor_profile_id = v_actor
    and e.source_pillar = v_source
    and e.idempotency_key = v_idempotency_key;
  if v_event_id is not null then
    return v_event_id;
  end if;

  -- Serialize counters per actor so parallel requests with distinct retry keys
  -- cannot bypass the abuse limits.
  perform pg_advisory_xact_lock(
    hashtextextended('profile-analytics:' || v_actor::text, 0)
  );

  if (
    select count(*)
    from public.analytics_events e
    where e.actor_profile_id = v_actor
      and e.trust_level = 'client'
      and e.received_at >= now() - interval '1 minute'
  ) >= 60 then
    raise exception using errcode = '54000', message = 'analytics_rate_limit_exceeded';
  end if;

  if (
    select count(*)
    from public.analytics_events e
    where e.actor_profile_id = v_actor
      and e.trust_level = 'client'
      and e.received_at >= now() - interval '24 hours'
  ) >= 2000 then
    raise exception using errcode = '54000', message = 'analytics_daily_rate_limit_exceeded';
  end if;

  -- Persist only known scalar context. Arbitrary or nested client JSON is
  -- discarded, including PII hidden under an unexpected key.
  v_properties := jsonb_strip_nulls(jsonb_build_object(
    'surface', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'surface') = 'string'
        then left(p_properties ->> 'surface', 64)
      else null end,
    'media_id', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'media_id') = 'string'
        then left(p_properties ->> 'media_id', 128)
      else null end,
    'media_type', case
      when p_properties ->> 'media_type' in ('audio', 'video', 'image', 'document')
        then p_properties ->> 'media_type'
      else null end,
    'composer', case
      when p_properties ->> 'composer' in ('contact', 'collaboration')
        then p_properties ->> 'composer'
      else null end,
    'room_id', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'room_id') = 'string'
        then left(p_properties ->> 'room_id', 128)
      else null end,
    'short_id', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'short_id') = 'string'
        then left(p_properties ->> 'short_id', 128)
      else null end,
    'listing_id', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'listing_id') = 'string'
        then left(p_properties ->> 'listing_id', 128)
      else null end,
    'entry_id', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'entry_id') = 'string'
        then left(p_properties ->> 'entry_id', 128)
      else null end,
    'position', case
      when jsonb_typeof(coalesce(p_properties, '{}'::jsonb) -> 'position') = 'number'
        then p_properties -> 'position'
      else null end
  ));

  insert into public.analytics_events (
    actor_profile_id, subject_profile_id, source_pillar, event_name,
    idempotency_key, session_id, trust_level, properties, occurred_at
  ) values (
    v_actor, p_subject_profile_id, v_source, v_event_name,
    v_idempotency_key, p_session_id, 'client',
    v_properties,
    greatest(least(coalesce(p_occurred_at, now()), now() + interval '5 minutes'), now() - interval '24 hours')
  )
  on conflict (actor_profile_id, source_pillar, idempotency_key)
    where idempotency_key is not null
  do update set received_at = public.analytics_events.received_at
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.get_my_profile_metrics(
  p_from date default current_date - 29,
  p_to date default current_date
)
returns table (
  metric_date date,
  source_pillar text,
  metric_name text,
  metric_value bigint,
  unique_visitors bigint,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 370 then
    raise exception using errcode = '22023', message = 'invalid_metrics_period';
  end if;

  return query
  select m.metric_date, m.source_pillar, m.metric_name,
         m.metric_value, m.unique_visitors, m.metadata
  from public.profile_daily_metrics m
  where m.profile_id = auth.uid()
    and m.metric_date between p_from and p_to
  order by m.metric_date, m.source_pillar, m.metric_name;
end;
$$;

create or replace function public.refresh_profile_daily_metrics(
  p_from date default current_date - 2,
  p_to date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 31 then
    raise exception using errcode = '22023', message = 'invalid_rollup_period';
  end if;

  delete from public.profile_daily_metric_visitors v
  where v.metric_date between p_from and p_to;

  insert into public.profile_daily_metric_visitors (
    profile_id, metric_date, source_pillar, metric_name,
    actor_profile_id, first_seen_at
  )
  select distinct on (
    e.subject_profile_id,
    (e.occurred_at at time zone 'Europe/Paris')::date,
    e.source_pillar,
    e.event_name,
    e.actor_profile_id
  )
    e.subject_profile_id,
    (e.occurred_at at time zone 'Europe/Paris')::date,
    e.source_pillar,
    e.event_name,
    e.actor_profile_id,
    e.occurred_at
  from public.analytics_events e
  where e.subject_profile_id is not null
    and e.actor_profile_id is not null
    and (e.occurred_at at time zone 'Europe/Paris')::date between p_from and p_to
  order by e.subject_profile_id,
           (e.occurred_at at time zone 'Europe/Paris')::date,
           e.source_pillar,
           e.event_name,
           e.actor_profile_id,
           e.occurred_at;

  insert into public.profile_daily_metrics (
    profile_id, metric_date, source_pillar, metric_name,
    metric_value, unique_visitors, metadata, computed_at
  )
  select
    e.subject_profile_id,
    (e.occurred_at at time zone 'Europe/Paris')::date,
    e.source_pillar,
    e.event_name,
    count(*)::bigint,
    count(distinct e.actor_profile_id)::bigint,
    jsonb_build_object('latest_received_at', max(e.received_at), 'schema_version', max(e.schema_version)),
    now()
  from public.analytics_events e
  where e.subject_profile_id is not null
    and (e.occurred_at at time zone 'Europe/Paris')::date between p_from and p_to
  group by e.subject_profile_id,
           (e.occurred_at at time zone 'Europe/Paris')::date,
           e.source_pillar,
           e.event_name
  on conflict (profile_id, metric_date, source_pillar, metric_name) do update
  set metric_value = excluded.metric_value,
      unique_visitors = excluded.unique_visitors,
      metadata = excluded.metadata,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keep the host dashboard fresh without waiting for an external cron job.
-- Idempotent retries do not double count because track_analytics_event() turns
-- them into replays while this trigger runs only after a new INSERT. The
-- visitor ledger makes both the counter and unique visitor update O(1).
create or replace function public.rollup_profile_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_metric_date date;
  v_new_visitor_count integer := 0;
begin
  if new.subject_profile_id is null then
    return new;
  end if;

  v_metric_date := (new.occurred_at at time zone 'Europe/Paris')::date;

  if new.actor_profile_id is not null then
    insert into public.profile_daily_metric_visitors (
      profile_id, metric_date, source_pillar, metric_name,
      actor_profile_id, first_seen_at
    ) values (
      new.subject_profile_id, v_metric_date, new.source_pillar, new.event_name,
      new.actor_profile_id, new.occurred_at
    ) on conflict do nothing;
    get diagnostics v_new_visitor_count = row_count;
  end if;

  insert into public.profile_daily_metrics as current_metrics (
    profile_id,
    metric_date,
    source_pillar,
    metric_name,
    metric_value,
    unique_visitors,
    metadata,
    computed_at
  )
  values (
    new.subject_profile_id,
    v_metric_date,
    new.source_pillar,
    new.event_name,
    1,
    v_new_visitor_count,
    jsonb_build_object(
      'latest_received_at', new.received_at,
      'schema_version', new.schema_version
    ),
    now()
  )
  on conflict (profile_id, metric_date, source_pillar, metric_name) do update
  set metric_value = current_metrics.metric_value + excluded.metric_value,
      unique_visitors = current_metrics.unique_visitors + excluded.unique_visitors,
      metadata = excluded.metadata,
      computed_at = excluded.computed_at;

  return new;
end;
$$;

drop trigger if exists analytics_events_rollup_profile_daily_metrics
  on public.analytics_events;
create trigger analytics_events_rollup_profile_daily_metrics
after insert on public.analytics_events
for each row execute function public.rollup_profile_analytics_event();

alter table public.grade_levels enable row level security;
alter table public.profile_grade_state enable row level security;
alter table public.profile_grade_events enable row level security;
alter table public.profile_grade_legacy_imports enable row level security;
alter table public.analytics_events enable row level security;
alter table public.profile_daily_metrics enable row level security;
alter table public.profile_daily_metric_visitors enable row level security;

drop policy if exists grade_levels_public_read on public.grade_levels;
create policy grade_levels_public_read on public.grade_levels
for select to anon, authenticated using (is_active);
drop policy if exists profile_grade_state_owner_or_public_read on public.profile_grade_state;
create policy profile_grade_state_owner_or_public_read on public.profile_grade_state
for select to anon, authenticated using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  )
);
drop policy if exists profile_grade_events_owner_read on public.profile_grade_events;
create policy profile_grade_events_owner_read on public.profile_grade_events
for select to authenticated using (profile_id = auth.uid());
drop policy if exists profile_daily_metrics_owner_read on public.profile_daily_metrics;
create policy profile_daily_metrics_owner_read on public.profile_daily_metrics
for select to authenticated using (profile_id = auth.uid());

grant select on public.grade_levels, public.profile_grade_state to anon, authenticated;
grant select on public.profile_grade_events, public.profile_daily_metrics to authenticated;
revoke all on public.profile_grade_legacy_imports, public.analytics_events,
  public.profile_daily_metric_visitors from anon, authenticated;
revoke insert, update, delete on public.profile_grade_state,
  public.profile_grade_events, public.profile_daily_metrics from anon, authenticated;
grant all on public.grade_levels, public.profile_grade_state,
  public.profile_grade_events, public.profile_grade_legacy_imports,
  public.analytics_events, public.profile_daily_metrics,
  public.profile_daily_metric_visitors to service_role;
revoke update, delete on public.profile_grade_events from service_role;

revoke all on function public.track_analytics_event(
  uuid, text, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.track_analytics_event(
  uuid, text, text, text, uuid, jsonb, timestamptz
) to authenticated;
revoke all on function public.get_my_profile_metrics(date, date)
  from public, anon, authenticated;
grant execute on function public.get_my_profile_metrics(date, date) to authenticated;
revoke all on function public.apply_profile_grade_event(
  uuid, integer, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_profile_grade_event(
  uuid, integer, text, text, text, text, jsonb
) to service_role;
revoke all on function public.refresh_profile_daily_metrics(date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_profile_daily_metrics(date, date) to service_role;
revoke all on function public.rollup_profile_analytics_event()
  from public, anon, authenticated;
revoke all on function public.meewav_guard_follow_insert()
  from public, anon, authenticated;
revoke all on function public.meewav_grade_code(integer)
  from public, anon, authenticated;
revoke all on function public.meewav_artist_grade_tier(integer)
  from public, anon, authenticated;
revoke all on function public.meewav_can_manage_profile_grade()
  from public, anon, authenticated;
revoke all on function public.enforce_profile_grade()
  from public, anon, authenticated;
revoke all on function public.meewav_sync_profile_grade_compatibility()
  from public, anon, authenticated;
revoke all on function public.meewav_initialize_profile_grade_state()
  from public, anon, authenticated;

comment on table public.profile_grade_events is
  'Immutable server-owned grade ledger. A client analytics event never grants points.';
comment on table public.profile_grade_legacy_imports is
  'Lossless snapshots used to audit migration from historical profile grades.';
comment on table public.analytics_events is
  'Cross-pillar event stream. Client rows are explicitly low-trust and never authoritative for grades or money.';
comment on table public.profile_daily_metric_visitors is
  'Internal exact visitor de-duplication ledger. Browser roles have no direct access.';
