begin;

-- ---------------------------------------------------------------------------
-- Meewav cross-client contract v1
--
-- Additive bridge shared by Web and iOS. It intentionally leaves every
-- rooms_*_v2 table and RPC unchanged. Clients consume narrow DTO/RPC contracts;
-- only trusted backend code can award grades or recognitions.
-- ---------------------------------------------------------------------------

create table if not exists public.platform_contract_versions (
  contract_key text primary key,
  current_version integer not null check (current_version > 0),
  minimum_supported_version integer not null check (minimum_supported_version > 0),
  status text not null default 'preflight'
    check (status in ('preflight', 'staging', 'stable', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_supported_version <= current_version)
);

insert into public.platform_contract_versions (
  contract_key, current_version, minimum_supported_version, status, metadata
)
values (
  'meewav-platform', 1, 1, 'preflight',
  jsonb_build_object(
    'grade_catalog', 'meewav-grade-levels@1',
    'grade_asset_version', 'grades-v1',
    'clients', jsonb_build_array('web', 'ios')
  )
)
on conflict (contract_key) do update
set current_version = excluded.current_version,
    minimum_supported_version = excluded.minimum_supported_version,
    metadata = excluded.metadata,
    updated_at = now();

alter table public.platform_contract_versions enable row level security;
drop policy if exists platform_contract_versions_public_read
  on public.platform_contract_versions;
create policy platform_contract_versions_public_read
on public.platform_contract_versions
for select to anon, authenticated
using (status <> 'retired');

grant select on public.platform_contract_versions to anon, authenticated;
grant all on public.platform_contract_versions to service_role;
revoke insert, update, delete, truncate, references, trigger
  on public.platform_contract_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Canonical grade repair and safe read contracts.
-- ---------------------------------------------------------------------------

-- A legacy level imported with zero points could otherwise fall back to level
-- 1 on the next event. Bring every imported state to at least its level floor.
update public.profile_grade_state state
set total_points = greatest(state.total_points, level.minimum_points),
    updated_at = now()
from public.grade_levels level
where level.level = state.level
  and state.total_points < level.minimum_points;

update public.profile_grade_state state
set progress_basis_points = case
      when state.level = 6 then 10000
      else least(10000, greatest(0, round(
        (state.total_points - current_level.minimum_points)::numeric
        / nullif(next_level.minimum_points - current_level.minimum_points, 0)
        * 10000
      )::integer))
    end,
    updated_at = now()
from public.grade_levels current_level
left join public.grade_levels next_level
  on next_level.level = current_level.level + 1
where current_level.level = state.level;

-- Raw points/progress are private. Public screens use the safe projection/RPC
-- below, which also honors public_profile_preferences.show_grade.
drop policy if exists profile_grade_state_owner_or_public_read
  on public.profile_grade_state;
drop policy if exists profile_grade_state_owner_read
  on public.profile_grade_state;
create policy profile_grade_state_owner_read
on public.profile_grade_state
for select to authenticated
using (profile_id = auth.uid());

revoke select on public.profile_grade_state from anon;
grant select on public.profile_grade_state to authenticated;

create or replace view public.public_profile_cards
with (security_invoker = true, security_barrier = true)
as
select
  p.id,
  p.username,
  coalesce(p.display_name, p.full_name) as display_name,
  p.bio,
  p.avatar_url,
  p.avatar_style_key,
  p.primary_role_key,
  p.city,
  p.country_code,
  p.commune_code,
  p.zone_id,
  p.district_name,
  p.district_name as zone_name,
  p.scene_name,
  coalesce(p.avatar_icon_id, p.avatar_style_key) as avatar_icon_id,
  p.profile_image_url,
  p.profile_image_path,
  p.collab_available,
  p.is_online,
  p.followers_count,
  p.following_count,
  case
    when coalesce(p.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
      then p.grade
    else null
  end as grade,
  p.is_verified,
  p.social_links,
  p.created_at,
  p.updated_at,
  p.golden_likes_count
from public.profiles p
where coalesce(p.show_on_public_profile, false)
  and not coalesce(p.is_ghost_mode, true);

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select * from public.public_profile_cards;

grant select on public.public_profile_cards, public.public_profiles
  to anon, authenticated;

create or replace function public.get_grade_catalog_v1()
returns table (
  contract_version integer,
  asset_version text,
  level smallint,
  code text,
  label text,
  short_label text,
  description text,
  visual_key text,
  main_color text,
  soft_color text,
  dark_color text,
  minimum_points bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    1,
    'grades-v1'::text,
    grade.level,
    grade.code,
    grade.label,
    grade.short_label,
    grade.description,
    grade.visual_key,
    grade.main_color,
    grade.soft_color,
    grade.dark_color,
    grade.minimum_points
  from public.grade_levels grade
  where grade.is_active
  order by grade.level;
$$;

create or replace function public.get_my_grade_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select jsonb_build_object(
    'profile_id', state.profile_id,
    'level', level.level,
    'code', level.code,
    'label', level.label,
    'short_label', level.short_label,
    'visual_key', level.visual_key,
    'main_color', level.main_color,
    'soft_color', level.soft_color,
    'dark_color', level.dark_color,
    'total_points', state.total_points,
    'current_threshold', level.minimum_points,
    'next_threshold', next_level.minimum_points,
    'points_to_next', case
      when next_level.minimum_points is null then 0
      else greatest(0, next_level.minimum_points - state.total_points)
    end,
    'progress_basis_points', state.progress_basis_points,
    'version', state.version,
    'contract_version', 1,
    'asset_version', 'grades-v1'
  ) into v_result
  from public.profile_grade_state state
  join public.grade_levels level on level.level = state.level
  left join public.grade_levels next_level on next_level.level = state.level + 1
  where state.profile_id = v_user_id;

  return v_result;
end;
$$;

create or replace function public.get_public_profile_grade_v1(p_profile_id uuid)
returns table (
  profile_id uuid,
  level smallint,
  code text,
  label text,
  short_label text,
  visual_key text,
  main_color text,
  soft_color text,
  dark_color text,
  contract_version integer,
  asset_version text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    profile.id,
    grade.level,
    grade.code,
    grade.label,
    grade.short_label,
    grade.visual_key,
    grade.main_color,
    grade.soft_color,
    grade.dark_color,
    1,
    'grades-v1'::text
  from public.profiles profile
  join public.profile_grade_state state on state.profile_id = profile.id
  join public.grade_levels grade on grade.level = state.level and grade.is_active
  where profile.id = p_profile_id
    and coalesce(profile.show_on_public_profile, false)
    and not coalesce(profile.is_ghost_mode, true)
    and coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false';
$$;

-- Keep a level monotone and never let imported points fall below its threshold.
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
  v_current_floor bigint;
  v_source_event_id text := trim(p_source_event_id);
  v_event_name text := trim(p_event_name);
begin
  if not public.meewav_can_manage_profile_grade() then
    raise exception using errcode = '42501', message = 'grade_service_role_required';
  end if;
  if p_points_delta is null then
    raise exception using errcode = '22023', message = 'grade_points_delta_required';
  end if;
  if nullif(v_source_event_id, '') is null
     or nullif(v_event_name, '') is null then
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
    and source_event_id = v_source_event_id;

  if v_event_id is not null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'event_id', v_event_id,
      'profile_id', v_state.profile_id, 'level', v_state.level,
      'total_points', v_state.total_points
    );
  end if;

  select minimum_points into v_current_floor
  from public.grade_levels where level = v_state.level;

  v_points := greatest(
    coalesce(v_current_floor, 0),
    v_state.total_points + p_points_delta::bigint
  );
  v_applied_delta := (v_points - v_state.total_points)::integer;

  select coalesce(max(level), 1)::smallint into v_level
  from public.grade_levels
  where is_active and minimum_points <= v_points;
  v_level := greatest(v_state.level, v_level)::smallint;

  insert into public.profile_grade_events (
    profile_id, points_delta, level_before, level_after, source_pillar,
    event_name, source_event_id, reason, metadata
  ) values (
    p_profile_id, v_applied_delta, v_state.level, v_level,
    p_source_pillar, v_event_name, v_source_event_id,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'grade_engine', jsonb_build_object(
        'contract_version', 1,
        'requested_points_delta', p_points_delta,
        'monotone', true
      )
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

-- Grade signal rules are intentionally empty until the product barème is
-- approved. Feature teams emit a verified event code; they never send points.
create table if not exists public.grade_signal_rules (
  source_pillar text not null,
  event_code text not null,
  rule_version integer not null default 1 check (rule_version > 0),
  points_delta integer not null check (points_delta > 0),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_pillar, event_code, rule_version),
  check (source_pillar in (
    'profile', 'globe', 'messaging', 'rooms', 'shorts',
    'marketplace', 'tremplin', 'system'
  ))
);

create or replace function public.apply_verified_grade_signal_v1(
  p_profile_id uuid,
  p_source_pillar text,
  p_event_code text,
  p_source_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.grade_signal_rules%rowtype;
begin
  if not public.meewav_can_manage_profile_grade() then
    raise exception using errcode = '42501', message = 'grade_service_role_required';
  end if;
  if nullif(trim(p_source_entity_id), '') is null then
    raise exception using errcode = '22023', message = 'grade_source_entity_required';
  end if;

  select * into v_rule
  from public.grade_signal_rules rule
  where rule.source_pillar = p_source_pillar
    and rule.event_code = p_event_code
    and rule.is_active
  order by rule.rule_version desc
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'grade_signal_rule_not_active';
  end if;

  return public.apply_profile_grade_event(
    p_profile_id,
    v_rule.points_delta,
    p_source_pillar,
    p_event_code,
    concat(p_event_code, ':', trim(p_source_entity_id), ':v', v_rule.rule_version),
    'verified_server_signal',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'rule_version', v_rule.rule_version,
      'source_entity_id', trim(p_source_entity_id)
    )
  );
end;
$$;

alter table public.grade_signal_rules enable row level security;
revoke all on public.grade_signal_rules from public, anon, authenticated;
grant all on public.grade_signal_rules to service_role;
revoke all on function public.apply_verified_grade_signal_v1(
  uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_verified_grade_signal_v1(
  uuid, text, text, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Server-owned recognitions (separate from grade levels).
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_definitions (
  code text primary key,
  label text not null,
  description text not null,
  category text not null,
  icon_key text not null,
  visual_key text not null,
  accent_hex text not null,
  source_pillar text not null,
  metric_name text not null,
  target_value bigint not null check (target_value > 0),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  contract_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_pillar in (
    'profile', 'globe', 'messaging', 'rooms', 'shorts',
    'marketplace', 'tremplin', 'system'
  ))
);

insert into public.recognition_definitions (
  code, label, description, category, icon_key, visual_key, accent_hex,
  source_pillar, metric_name, target_value, sort_order
)
values
  ('creator_regular_14d', 'Créateur régulier',
   'Actif pendant 14 jours distincts.', 'habitude', 'calendar.badge.clock',
   'recognition-creator-regular', '#A855F7', 'profile', 'verified_active_days', 14, 10),
  ('golden_pulse_25', 'Golden Pulse',
   'A reçu 25 Golden Likes valides.', 'impact', 'heart',
   'recognition-golden-pulse', '#F6C453', 'globe', 'golden_likes_received', 25, 20),
  ('live_magnet_10', 'Live magnet',
   'A terminé 10 Rooms.', 'live', 'dot.radiowaves.left.and.right',
   'recognition-live-magnet', '#D946EF', 'rooms', 'rooms_completed', 10, 30),
  ('collaboration_master_25', 'Maître des collaborations',
   'A terminé 25 collaborations uniques.', 'collaboration', 'archivebox',
   'recognition-collaboration-master', '#38BDF8', 'messaging',
   'collaborations_completed', 25, 40),
  ('tremplin_talent_spotted', 'Talent repéré',
   'A été sélectionné officiellement dans un Tremplin.', 'reconnaissance', 'star',
   'recognition-talent-spotted', '#A855F7', 'tremplin', 'official_selections', 1, 50),
  ('marketplace_validated_seller_5', 'Marchand validé',
   'A terminé 5 commandes Marketplace non remboursées.', 'business', 'cart',
   'recognition-validated-seller', '#4ADE80', 'marketplace',
   'completed_non_refunded_orders', 5, 60)
on conflict (code) do update
set label = excluded.label,
    description = excluded.description,
    category = excluded.category,
    icon_key = excluded.icon_key,
    visual_key = excluded.visual_key,
    accent_hex = excluded.accent_hex,
    source_pillar = excluded.source_pillar,
    metric_name = excluded.metric_name,
    target_value = excluded.target_value,
    sort_order = excluded.sort_order,
    contract_version = excluded.contract_version,
    updated_at = now();

create table if not exists public.profile_recognition_state (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recognition_code text not null references public.recognition_definitions(code)
    on delete restrict,
  current_value bigint not null default 0 check (current_value >= 0),
  status text not null default 'locked'
    check (status in ('locked', 'in_progress', 'earned', 'revoked')),
  is_public boolean not null default true,
  earned_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, recognition_code)
);

create table if not exists public.profile_recognition_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recognition_code text not null references public.recognition_definitions(code)
    on delete restrict,
  value_delta bigint not null check (value_delta > 0),
  value_after bigint not null check (value_after >= 0),
  source_pillar text not null,
  event_name text not null,
  source_event_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, recognition_code, source_pillar, source_event_id)
);

create index if not exists profile_recognition_events_profile_time_idx
  on public.profile_recognition_events(profile_id, occurred_at desc);

alter table public.recognition_definitions enable row level security;
alter table public.profile_recognition_state enable row level security;
alter table public.profile_recognition_events enable row level security;

drop policy if exists recognition_definitions_public_read
  on public.recognition_definitions;
create policy recognition_definitions_public_read
on public.recognition_definitions
for select to anon, authenticated using (is_active);

drop policy if exists profile_recognition_state_owner_or_earned_public_read
  on public.profile_recognition_state;
create policy profile_recognition_state_owner_or_earned_public_read
on public.profile_recognition_state
for select to anon, authenticated
using (
  profile_id = auth.uid()
  or (
    status = 'earned'
    and is_public
    and exists (
      select 1 from public.profiles profile
      where profile.id = profile_id
        and coalesce(profile.show_on_public_profile, false)
        and not coalesce(profile.is_ghost_mode, true)
    )
  )
);

drop policy if exists profile_recognition_events_owner_read
  on public.profile_recognition_events;
create policy profile_recognition_events_owner_read
on public.profile_recognition_events
for select to authenticated using (profile_id = auth.uid());

grant select on public.recognition_definitions to anon, authenticated;
revoke all on public.profile_recognition_state from anon, authenticated;
grant select (
  profile_id, recognition_code, status, is_public, earned_at
) on public.profile_recognition_state to anon, authenticated;
grant select on public.profile_recognition_events to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.recognition_definitions, public.profile_recognition_state,
     public.profile_recognition_events
  from anon, authenticated;
grant all on public.recognition_definitions, public.profile_recognition_state,
  public.profile_recognition_events to service_role;
revoke all on public.profile_recognition_events from service_role;
grant select, insert on public.profile_recognition_events to service_role;

-- Repair the historical grade-ledger grant as part of the same immutable-ledger
-- contract. Trusted mutations still pass through SECURITY DEFINER functions.
revoke all on public.profile_grade_events from service_role;
grant select, insert on public.profile_grade_events to service_role;

create or replace view public.public_profile_recognitions_v1
with (security_invoker = true, security_barrier = true)
as
select
  state.profile_id,
  definition.code,
  definition.label,
  definition.description,
  definition.category,
  definition.icon_key,
  definition.visual_key,
  definition.accent_hex,
  state.earned_at,
  definition.contract_version
from public.profile_recognition_state state
join public.recognition_definitions definition
  on definition.code = state.recognition_code and definition.is_active
where state.status = 'earned' and state.is_public;

grant select on public.public_profile_recognitions_v1 to anon, authenticated;

create or replace function public.get_my_recognitions_v1()
returns table (
  code text,
  label text,
  description text,
  category text,
  icon_key text,
  visual_key text,
  accent_hex text,
  source_pillar text,
  metric_name text,
  current_value bigint,
  target_value bigint,
  status text,
  is_public boolean,
  earned_at timestamptz,
  contract_version integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    definition.code,
    definition.label,
    definition.description,
    definition.category,
    definition.icon_key,
    definition.visual_key,
    definition.accent_hex,
    definition.source_pillar,
    definition.metric_name,
    coalesce(state.current_value, 0),
    definition.target_value,
    coalesce(state.status, 'locked'),
    coalesce(state.is_public, true),
    state.earned_at,
    definition.contract_version
  from public.recognition_definitions definition
  left join public.profile_recognition_state state
    on state.recognition_code = definition.code
   and state.profile_id = auth.uid()
  where auth.uid() is not null and definition.is_active
  order by definition.sort_order, definition.code;
$$;

create or replace function public.apply_profile_recognition_event_v1(
  p_profile_id uuid,
  p_recognition_code text,
  p_value_delta bigint,
  p_source_pillar text,
  p_event_name text,
  p_source_event_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition public.recognition_definitions%rowtype;
  v_state public.profile_recognition_state%rowtype;
  v_event_id uuid;
  v_value bigint;
  v_applied_delta bigint;
  v_source_event_id text := trim(p_source_event_id);
  v_event_name text := trim(p_event_name);
begin
  if not public.meewav_can_manage_profile_grade() then
    raise exception using errcode = '42501', message = 'recognition_service_role_required';
  end if;
  if p_value_delta is null or p_value_delta <= 0 then
    raise exception using errcode = '22023', message = 'recognition_delta_must_be_positive';
  end if;
  if nullif(v_source_event_id, '') is null
     or nullif(v_event_name, '') is null then
    raise exception using errcode = '22023', message = 'recognition_event_identity_required';
  end if;

  select * into v_definition
  from public.recognition_definitions
  where code = p_recognition_code and is_active;
  if not found then
    raise exception using errcode = '22023', message = 'recognition_not_found';
  end if;
  if v_definition.source_pillar <> p_source_pillar then
    raise exception using errcode = '22023', message = 'recognition_source_mismatch';
  end if;

  insert into public.profile_recognition_state (
    profile_id, recognition_code, current_value, status
  ) values (
    p_profile_id, p_recognition_code, 0, 'locked'
  )
  on conflict (profile_id, recognition_code) do nothing;

  select * into v_state
  from public.profile_recognition_state
  where profile_id = p_profile_id
    and recognition_code = p_recognition_code
  for update;

  select id into v_event_id
  from public.profile_recognition_events
  where profile_id = p_profile_id
    and recognition_code = p_recognition_code
    and source_pillar = p_source_pillar
    and source_event_id = v_source_event_id;

  if v_event_id is not null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'event_id', v_event_id,
      'profile_id', p_profile_id, 'recognition_code', p_recognition_code,
      'current_value', v_state.current_value, 'status', v_state.status
    );
  end if;

  v_applied_delta := least(
    p_value_delta,
    greatest(0::bigint, v_definition.target_value - v_state.current_value)
  );
  v_value := v_state.current_value + v_applied_delta;

  if v_applied_delta <= 0 then
    return jsonb_build_object(
      'ok', true, 'idempotent', false, 'already_earned', true,
      'event_id', null, 'profile_id', p_profile_id,
      'recognition_code', p_recognition_code,
      'current_value', v_state.current_value,
      'target_value', v_definition.target_value,
      'status', v_state.status,
      'earned_at', v_state.earned_at
    );
  end if;

  insert into public.profile_recognition_events (
    profile_id, recognition_code, value_delta, value_after, source_pillar,
    event_name, source_event_id, metadata
  ) values (
    p_profile_id, p_recognition_code, v_applied_delta, v_value, p_source_pillar,
    v_event_name, v_source_event_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'requested_value_delta', p_value_delta
    )
  ) returning id into v_event_id;

  update public.profile_recognition_state
  set current_value = v_value,
      status = case
        when v_value >= v_definition.target_value then 'earned'
        when v_value > 0 then 'in_progress'
        else 'locked'
      end,
      earned_at = case
        when v_value >= v_definition.target_value then coalesce(earned_at, now())
        else earned_at
      end,
      version = version + 1,
      updated_at = now()
  where profile_id = p_profile_id
    and recognition_code = p_recognition_code
  returning * into v_state;

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'event_id', v_event_id,
    'profile_id', p_profile_id, 'recognition_code', p_recognition_code,
    'current_value', v_state.current_value,
    'target_value', v_definition.target_value,
    'status', v_state.status,
    'earned_at', v_state.earned_at
  );
end;
$$;

revoke all on function public.apply_profile_recognition_event_v1(
  uuid, text, bigint, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_profile_recognition_event_v1(
  uuid, text, bigint, text, text, text, jsonb
) to service_role;

-- Legacy profile_badges remain readable by the owner during migration, but a
-- public profile no longer exposes rows whose visibility is private.
drop policy if exists "Lire ses badges profil ou badges publics"
  on public.profile_badges;
create policy "Lire ses badges profil ou badges publics"
on public.profile_badges
for select to anon, authenticated
using (
  auth.uid() = user_id
  or (
    visibility = 'public'
    and exists (
      select 1 from public.profiles profile
      where profile.id = profile_badges.user_id
        and coalesce(profile.show_on_public_profile, false)
        and not coalesce(profile.is_ghost_mode, true)
    )
  )
);

-- ---------------------------------------------------------------------------
-- Owner profile writes: narrow RPCs replace direct table updates.
-- ---------------------------------------------------------------------------

create or replace function public.update_my_public_profile_v1(
  p_username text,
  p_display_name text,
  p_bio text,
  p_primary_role_key text,
  p_collab_available boolean,
  p_social_links jsonb,
  p_public_profile_preferences jsonb,
  p_show_on_public_profile boolean,
  p_is_ghost_mode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := public.meewav_normalize_username(p_username);
  v_display_name text := nullif(trim(p_display_name), '');
  v_role_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;
  if v_display_name is null or char_length(v_display_name) > 80 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;
  if char_length(coalesce(p_bio, '')) > 220 then
    raise exception using errcode = '22001', message = 'profile_bio_too_long';
  end if;
  if jsonb_typeof(coalesce(p_social_links, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_social_links, '{}'::jsonb)::text) > 4096 then
    raise exception using errcode = '22023', message = 'invalid_social_links';
  end if;
  if jsonb_typeof(coalesce(p_public_profile_preferences, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_public_profile_preferences, '{}'::jsonb)::text) > 4096 then
    raise exception using errcode = '22023', message = 'invalid_public_profile_preferences';
  end if;

  select role.key into v_role_key
  from public.artist_roles role
  where role.is_active
    and lower(role.key) = lower(trim(p_primary_role_key))
  limit 1;
  if v_role_key is null then
    raise exception using errcode = '22023', message = 'invalid_primary_role';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_username, 0));
  if exists (
    select 1 from public.profiles profile
    where lower(btrim(profile.username)) = v_username
      and profile.id <> v_user_id
  ) then
    raise exception using errcode = '23505', message = 'username_unavailable';
  end if;

  update public.profiles
  set username = v_username,
      full_name = v_display_name,
      display_name = v_display_name,
      bio = nullif(trim(p_bio), ''),
      artist_type = v_role_key,
      primary_role_key = v_role_key,
      collab_available = coalesce(p_collab_available, false),
      social_links = coalesce(p_social_links, '{}'::jsonb),
      public_profile_preferences = coalesce(p_public_profile_preferences, '{}'::jsonb),
      show_on_public_profile = coalesce(p_show_on_public_profile, false),
      is_ghost_mode = coalesce(p_is_ghost_mode, true),
      profile_version = profile_version + 1,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;

  update public.profile_roles
  set is_primary = false
  where profile_id = v_user_id and role_key <> v_role_key and is_primary;
  insert into public.profile_roles(profile_id, role_key, is_primary)
  values (v_user_id, v_role_key, true)
  on conflict (profile_id, role_key) do update set is_primary = true;

  perform public.meewav_refresh_public_marker(v_user_id);
  return jsonb_build_object(
    'ok', true,
    'profile_version', (select profile_version from public.profiles where id = v_user_id)
  );
end;
$$;

create or replace function public.update_my_private_profile_v1(
  p_phone text,
  p_birth_date date,
  p_street text,
  p_postal_code text,
  p_city text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_country_code text := nullif(upper(trim(p_country_code)), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(coalesce(p_phone, '')) > 40
     or char_length(coalesce(p_street, '')) > 180
     or char_length(coalesce(p_postal_code, '')) > 24
     or char_length(coalesce(p_city, '')) > 120 then
    raise exception using errcode = '22001', message = 'private_profile_value_too_long';
  end if;
  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_country_code';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception using errcode = '22023', message = 'invalid_coordinates';
  end if;

  update public.profiles
  set phone = nullif(trim(p_phone), ''),
      birth_date = p_birth_date,
      street = nullif(trim(p_street), ''),
      postal_code = nullif(trim(p_postal_code), ''),
      city = nullif(trim(p_city), ''),
      country_code = v_country_code,
      country = v_country_code,
      latitude = public.meewav_coarse_coordinate(p_latitude),
      longitude = public.meewav_coarse_coordinate(p_longitude),
      profile_version = profile_version + 1,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;

  if p_latitude is null then
    delete from public.profile_locations_private where profile_id = v_user_id;
  else
    insert into public.profile_locations_private (
      profile_id, city, country_code, latitude, longitude,
      precision_source, updated_at
    ) values (
      v_user_id, nullif(trim(p_city), ''), v_country_code,
      p_latitude, p_longitude, 'owner_profile_v1', now()
    )
    on conflict (profile_id) do update
    set city = excluded.city,
        country_code = excluded.country_code,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        precision_source = excluded.precision_source,
        updated_at = now();
  end if;

  perform public.meewav_refresh_public_marker(v_user_id);
  return jsonb_build_object(
    'ok', true,
    'profile_version', (select profile_version from public.profiles where id = v_user_id)
  );
end;
$$;

revoke all on function public.update_my_public_profile_v1(
  text, text, text, text, boolean, jsonb, jsonb, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.update_my_public_profile_v1(
  text, text, text, text, boolean, jsonb, jsonb, boolean, boolean
) to authenticated;
revoke all on function public.update_my_private_profile_v1(
  text, date, text, text, text, text, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.update_my_private_profile_v1(
  text, date, text, text, text, text, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- Room participant identity adapter. No Rooms table, policy or RPC is changed.
-- ---------------------------------------------------------------------------

create or replace function public.get_room_participant_cards_v1(
  p_room_id uuid,
  p_profile_ids uuid[] default null
)
returns table (
  room_id uuid,
  profile_id uuid,
  room_role text,
  username text,
  display_name text,
  avatar_url text,
  avatar_style_key text,
  primary_role_key text,
  profile_image_url text,
  is_verified boolean,
  grade_level smallint,
  grade_code text,
  grade_label text,
  grade_visual_key text,
  grade_main_color text,
  recognitions jsonb,
  contract_version integer,
  grade_asset_version text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.rooms_v2 room where room.id = p_room_id) then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = p_room_id and room.host_id = v_user_id
  ) and not exists (
    select 1 from public.room_participants_v2 participant
    where participant.room_id = p_room_id
      and participant.user_id = v_user_id
      and participant.left_at is null
  ) then
    raise exception using errcode = '42501', message = 'room_membership_required';
  end if;

  return query
  with room_people as (
    select room.id as room_id, room.host_id as profile_id, 'host'::text as room_role
    from public.rooms_v2 room where room.id = p_room_id
    union
    select participant.room_id, participant.user_id, participant.role
    from public.room_participants_v2 participant
    where participant.room_id = p_room_id and participant.left_at is null
  )
  select
    person.room_id,
    profile.id,
    person.room_role,
    profile.username,
    coalesce(profile.display_name, profile.full_name),
    profile.avatar_url,
    profile.avatar_style_key,
    profile.primary_role_key,
    profile.profile_image_url,
    profile.is_verified,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.level
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.code
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.label
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.visual_key
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.main_color
      else null
    end,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', definition.code,
        'label', definition.label,
        'visual_key', definition.visual_key,
        'accent_hex', definition.accent_hex,
        'earned_at', recognition.earned_at
      ) order by definition.sort_order, definition.code), '[]'::jsonb)
      from public.profile_recognition_state recognition
      join public.recognition_definitions definition
        on definition.code = recognition.recognition_code
       and definition.is_active
      where recognition.profile_id = profile.id
        and recognition.status = 'earned'
        and recognition.is_public
    ),
    1,
    'grades-v1'::text
  from room_people person
  join public.profiles profile on profile.id = person.profile_id
  left join public.profile_grade_state state on state.profile_id = profile.id
  left join public.grade_levels grade on grade.level = state.level and grade.is_active
  where p_profile_ids is null or person.profile_id = any(p_profile_ids)
  order by case when person.room_role = 'host' then 0 else 1 end,
           profile.username
  limit 200;
end;
$$;

revoke all on function public.get_room_participant_cards_v1(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.get_room_participant_cards_v1(uuid, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- One bootstrap call gives both clients the same catalogs and owner state.
-- Exact private data is returned only to the authenticated owner.
-- ---------------------------------------------------------------------------

create or replace function public.get_meewav_bootstrap_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_grade jsonb;
  v_recognitions jsonb;
  v_grade_catalog jsonb;
  v_roles jsonb;
  v_avatars jsonb;
  v_contract jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_profile := public.get_my_private_profile();
  v_grade := public.get_my_grade_summary_v1();

  select coalesce(jsonb_agg(to_jsonb(item) order by item.code), '[]'::jsonb)
  into v_recognitions
  from public.get_my_recognitions_v1() item;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.level), '[]'::jsonb)
  into v_grade_catalog
  from public.get_grade_catalog_v1() item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', role.key,
    'label', role.label,
    'category', role.category,
    'description', role.description
  ) order by role.sort_order, role.key), '[]'::jsonb)
  into v_roles
  from public.artist_roles role where role.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', avatar.key,
    'label', avatar.label,
    'asset_filename', avatar.asset_filename,
    'default_role_key', avatar.default_role_key,
    'metadata', avatar.metadata
  ) order by avatar.sort_order, avatar.key), '[]'::jsonb)
  into v_avatars
  from public.avatar_styles avatar where avatar.is_active;

  select jsonb_build_object(
    'contract_key', contract.contract_key,
    'current_version', contract.current_version,
    'minimum_supported_version', contract.minimum_supported_version,
    'status', contract.status,
    'metadata', contract.metadata
  ) into v_contract
  from public.platform_contract_versions contract
  where contract.contract_key = 'meewav-platform';

  return jsonb_build_object(
    'contract', v_contract,
    'profile', v_profile,
    'grade', v_grade,
    'recognitions', v_recognitions,
    'grade_catalog', v_grade_catalog,
    'artist_roles', v_roles,
    'avatar_styles', v_avatars,
    'server_time', now()
  );
end;
$$;

-- Versioned aliases let new native clients adopt Platform v1 while existing
-- Web/Flutter builds continue using the historical onboarding signature.
create or replace function public.complete_onboarding_v1(
  p_username text,
  p_display_name text,
  p_avatar_style_key text,
  p_primary_role_key text,
  p_city text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_ghost_mode boolean,
  p_show_on_public_profile boolean
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.complete_onboarding(
    p_username,
    p_display_name,
    p_avatar_style_key,
    p_primary_role_key,
    p_city,
    p_country_code,
    p_latitude,
    p_longitude,
    p_is_ghost_mode,
    p_show_on_public_profile
  );
$$;

create or replace function public.get_my_profile_bootstrap_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.get_meewav_bootstrap_v1();
$$;

revoke all on function public.get_grade_catalog_v1()
  from public, anon, authenticated;
grant execute on function public.get_grade_catalog_v1() to anon, authenticated;
revoke all on function public.get_my_grade_summary_v1()
  from public, anon, authenticated;
grant execute on function public.get_my_grade_summary_v1() to authenticated;
revoke all on function public.get_public_profile_grade_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_profile_grade_v1(uuid)
  to anon, authenticated;
revoke all on function public.get_my_recognitions_v1()
  from public, anon, authenticated;
grant execute on function public.get_my_recognitions_v1() to authenticated;
revoke all on function public.get_meewav_bootstrap_v1()
  from public, anon, authenticated;
grant execute on function public.get_meewav_bootstrap_v1() to authenticated;
revoke all on function public.complete_onboarding_v1(
  text, text, text, text, text, text, double precision, double precision,
  boolean, boolean
) from public, anon, authenticated;
grant execute on function public.complete_onboarding_v1(
  text, text, text, text, text, text, double precision, double precision,
  boolean, boolean
) to authenticated;
revoke all on function public.get_my_profile_bootstrap_v1()
  from public, anon, authenticated;
grant execute on function public.get_my_profile_bootstrap_v1()
  to authenticated;

comment on table public.platform_contract_versions is
  'Version handshake shared by Web, iOS and backend deployments.';
comment on table public.grade_signal_rules is
  'Server-owned mapping from verified domain events to grade points. Clients never submit points.';
comment on table public.recognition_definitions is
  'Canonical recognition catalog. Recognitions are distinct from six grade levels.';
comment on table public.profile_recognition_events is
  'Immutable, idempotent ledger for server-awarded recognition progress.';
comment on function public.get_room_participant_cards_v1(uuid, uuid[]) is
  'Safe cross-client Room identity/grade adapter. Leaves Rooms v2 schema untouched.';
comment on function public.get_meewav_bootstrap_v1() is
  'Authenticated Platform v1 bootstrap shared by Web and iOS.';
comment on function public.complete_onboarding_v1(
  text, text, text, text, text, text, double precision, double precision,
  boolean, boolean
) is
  'Versioned iOS/Web alias for the idempotent onboarding contract.';
comment on function public.get_my_profile_bootstrap_v1() is
  'Versioned owner bootstrap alias used by native clients.';

commit;
