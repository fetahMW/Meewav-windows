begin;

-- ---------------------------------------------------------------------------
-- Profile geographic rankings v1
--
-- Rankings are a private owner projection over canonical grade points. The
-- browser never downloads the eligible population. Hosted environments with
-- pg_cron use a trusted daily job; other environments may call the same refresh
-- RPC from their backend scheduler. Clients call get_my_profile_rankings_v1().
-- ---------------------------------------------------------------------------

create table if not exists public.profile_ranking_runs (
  id uuid primary key default gen_random_uuid(),
  algorithm_version text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  eligible_profiles integer not null default 0 check (eligible_profiles >= 0),
  generated_rows integer not null default 0 check (generated_rows >= 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.profile_rankings_current (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('country', 'region', 'city', 'district')),
  scope_key text not null,
  scope_label text not null,
  rank_position bigint not null check (rank_position > 0),
  eligible_count bigint not null check (eligible_count > 0),
  score bigint not null check (score >= 0),
  algorithm_version text not null,
  run_id uuid not null references public.profile_ranking_runs(id) on delete restrict,
  calculated_at timestamptz not null,
  primary key (profile_id, scope)
);

create table if not exists public.profile_rankings_history (
  run_id uuid not null references public.profile_ranking_runs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('country', 'region', 'city', 'district')),
  scope_key text not null,
  scope_label text not null,
  rank_position bigint not null check (rank_position > 0),
  eligible_count bigint not null check (eligible_count > 0),
  score bigint not null check (score >= 0),
  algorithm_version text not null,
  calculated_at timestamptz not null,
  primary key (run_id, profile_id, scope)
);

create index if not exists profile_rankings_current_scope_rank_idx
  on public.profile_rankings_current(scope, scope_key, rank_position);
create index if not exists profile_rankings_history_profile_scope_key_time_idx
  on public.profile_rankings_history(
    profile_id, scope, scope_key, calculated_at desc
  );
create index if not exists profile_rankings_history_run_idx
  on public.profile_rankings_history(run_id);

alter table public.profile_ranking_runs enable row level security;
alter table public.profile_rankings_current enable row level security;
alter table public.profile_rankings_history enable row level security;
alter table public.profile_ranking_runs force row level security;
alter table public.profile_rankings_current force row level security;
alter table public.profile_rankings_history force row level security;

-- No direct client policy is intentional. The authenticated owner RPC exposes
-- only four aggregate rows and never another profile identifier.
revoke all on public.profile_ranking_runs,
  public.profile_rankings_current,
  public.profile_rankings_history
from anon, authenticated;
grant all on public.profile_ranking_runs,
  public.profile_rankings_current,
  public.profile_rankings_history
to service_role;

create or replace function public.meewav_france_region_v1(p_commune_code text)
returns table (region_code text, region_name text)
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  with normalized as (
    select regexp_replace(
      upper(coalesce(p_commune_code, '')),
      '[^0-9A-Z]',
      '',
      'g'
    ) as code
  ), department as (
    select case
      when left(code, 2) in ('2A', '2B') then left(code, 2)
      when left(code, 3) in ('971', '972', '973', '974', '975', '976', '977', '978', '984', '986', '987', '988') then left(code, 3)
      else left(code, 2)
    end as code
    from normalized
  )
  select
    case
      when code = any (array['75','77','78','91','92','93','94','95']) then '11'
      when code = any (array['18','28','36','37','41','45']) then '24'
      when code = any (array['21','25','39','58','70','71','89','90']) then '27'
      when code = any (array['14','27','50','61','76']) then '28'
      when code = any (array['02','59','60','62','80']) then '32'
      when code = any (array['08','10','51','52','54','55','57','67','68','88']) then '44'
      when code = any (array['44','49','53','72','85']) then '52'
      when code = any (array['22','29','35','56']) then '53'
      when code = any (array['16','17','19','23','24','33','40','47','64','79','86','87']) then '75'
      when code = any (array['09','11','12','30','31','32','34','46','48','65','66','81','82']) then '76'
      when code = any (array['01','03','07','15','26','38','42','43','63','69','73','74']) then '84'
      when code = any (array['04','05','06','13','83','84']) then '93'
      when code = any (array['2A','2B']) then '94'
      when code = '971' then '01'
      when code = '972' then '02'
      when code = '973' then '03'
      when code = '974' then '04'
      when code = '976' then '06'
      when code = any (array['975','977','978','984','986','987','988']) then 'COM'
      else null
    end,
    case
      when code = any (array['75','77','78','91','92','93','94','95']) then 'Île-de-France'
      when code = any (array['18','28','36','37','41','45']) then 'Centre-Val de Loire'
      when code = any (array['21','25','39','58','70','71','89','90']) then 'Bourgogne-Franche-Comté'
      when code = any (array['14','27','50','61','76']) then 'Normandie'
      when code = any (array['02','59','60','62','80']) then 'Hauts-de-France'
      when code = any (array['08','10','51','52','54','55','57','67','68','88']) then 'Grand Est'
      when code = any (array['44','49','53','72','85']) then 'Pays de la Loire'
      when code = any (array['22','29','35','56']) then 'Bretagne'
      when code = any (array['16','17','19','23','24','33','40','47','64','79','86','87']) then 'Nouvelle-Aquitaine'
      when code = any (array['09','11','12','30','31','32','34','46','48','65','66','81','82']) then 'Occitanie'
      when code = any (array['01','03','07','15','26','38','42','43','63','69','73','74']) then 'Auvergne-Rhône-Alpes'
      when code = any (array['04','05','06','13','83','84']) then 'Provence-Alpes-Côte d''Azur'
      when code = any (array['2A','2B']) then 'Corse'
      when code = '971' then 'Guadeloupe'
      when code = '972' then 'Martinique'
      when code = '973' then 'Guyane'
      when code = '974' then 'La Réunion'
      when code = '976' then 'Mayotte'
      when code = any (array['975','977','978','984','986','987','988']) then 'Collectivités d’outre-mer'
      else null
    end
  from department
  where code <> '';
$$;

create or replace function public.refresh_profile_rankings_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
  v_eligible_count integer := 0;
  v_generated_rows integer := 0;
  v_algorithm_version constant text := 'grade-points-v1';
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  -- A refresh replaces the complete current projection. Serialize jobs so two
  -- workers can never interleave their delete/insert phases.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-rankings-v1', 0)
  );

  insert into public.profile_ranking_runs(algorithm_version, status, started_at)
  values (v_algorithm_version, 'running', v_now)
  returning id into v_run_id;

  -- History is the durable staging area for this run. This avoids trusting a
  -- caller-controlled pg_temp object inside a SECURITY DEFINER function and
  -- also makes repeated calls in one transaction safe.
  with normalized as (
    select
      profile.id as profile_id,
      state.total_points as score,
      case
        when region.region_code is not null
          or upper(btrim(coalesce(profile.country_code, ''))) in ('FR', 'FRA')
          or lower(btrim(coalesce(profile.country, ''))) in ('fr', 'france')
          then 'FR'
        else coalesce(
          nullif(upper(btrim(profile.country_code)), ''),
          nullif(lower(btrim(profile.country)), '')
        )
      end as country_key,
      case
        when region.region_code is not null
          or upper(btrim(coalesce(profile.country_code, ''))) in ('FR', 'FRA')
          or lower(btrim(coalesce(profile.country, ''))) in ('fr', 'france')
          then 'France'
        else coalesce(
          nullif(btrim(profile.country), ''),
          nullif(upper(btrim(profile.country_code)), '')
        )
      end as country_label,
      region.region_code,
      region.region_name,
      coalesce(
        nullif(
          regexp_replace(
            upper(coalesce(profile.commune_code, '')),
            '[^0-9A-Z]',
            '',
            'g'
          ),
          ''
        ),
        nullif(lower(btrim(profile.city)), '')
      ) as local_city_key,
      nullif(btrim(profile.city), '') as city_label,
      coalesce(
        nullif(lower(btrim(profile.zone_id)), ''),
        nullif(lower(btrim(profile.district_id)), '')
      ) as local_district_key,
      coalesce(
        nullif(btrim(profile.district_name), ''),
        nullif(btrim(profile.scene_name), '')
      ) as district_label
    from public.profiles profile
    join public.profile_grade_state state on state.profile_id = profile.id
    left join lateral public.meewav_france_region_v1(profile.commune_code) region on true
    where coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
      and coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
  ), eligible as (
    select
      profile_id,
      score,
      country_key,
      country_label,
      case
        when country_key is not null and region_code is not null
          then concat_ws(':', country_key, region_code)
        else null
      end as region_key,
      region_name,
      case
        when country_key is not null
          and local_city_key is not null
          and city_label is not null
          then concat_ws(':', country_key, local_city_key)
        else null
      end as city_key,
      city_label,
      case
        when country_key is not null
          and local_city_key is not null
          and district_label is not null
          then concat_ws(
            ':',
            country_key,
            local_city_key,
            coalesce(local_district_key, lower(district_label))
          )
        else null
      end as district_key,
      district_label
    from normalized
  ), scoped as (
    select profile_id, score, 'country'::text as scope, country_key as scope_key, country_label as scope_label
    from eligible where country_key is not null and country_label is not null
    union all
    select profile_id, score, 'region', region_key, region_name
    from eligible where region_key is not null and region_name is not null
    union all
    select profile_id, score, 'city', city_key, city_label
    from eligible where city_key is not null and city_label is not null
    union all
    select profile_id, score, 'district', district_key, district_label
    from eligible where district_key is not null and district_label is not null
  ), ranked as (
    select
      profile_id,
      scope,
      scope_key,
      scope_label,
      dense_rank() over (
        partition by scope, scope_key
        order by score desc
      )::bigint as rank_position,
      count(*) over (partition by scope, scope_key)::bigint as eligible_count,
      score
    from scoped
  )
  insert into public.profile_rankings_history (
    run_id, profile_id, scope, scope_key, scope_label, rank_position,
    eligible_count, score, algorithm_version, calculated_at
  )
  select
    v_run_id::uuid as run_id,
    profile_id,
    scope,
    scope_key,
    scope_label,
    rank_position,
    eligible_count,
    score,
    v_algorithm_version::text as algorithm_version,
    v_now::timestamptz as calculated_at
  from ranked;

  get diagnostics v_generated_rows = row_count;

  select count(distinct history.profile_id)::integer
  into v_eligible_count
  from public.profile_rankings_history history
  where history.run_id = v_run_id;

  delete from public.profile_rankings_current;
  insert into public.profile_rankings_current (
    profile_id, scope, scope_key, scope_label, rank_position,
    eligible_count, score, algorithm_version, run_id, calculated_at
  )
  select
    history.profile_id, history.scope, history.scope_key, history.scope_label,
    history.rank_position, history.eligible_count, history.score,
    history.algorithm_version, history.run_id, history.calculated_at
  from public.profile_rankings_history history
  where history.run_id = v_run_id;

  update public.profile_ranking_runs
  set status = 'completed',
      eligible_profiles = v_eligible_count,
      generated_rows = v_generated_rows,
      completed_at = clock_timestamp(),
      metadata = jsonb_build_object(
        'basis', 'grade_points',
        'tie_strategy', 'dense_rank',
        'scopes', jsonb_build_array('country', 'region', 'city', 'district')
      )
  where id = v_run_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'algorithm_version', v_algorithm_version,
    'eligible_profiles', v_eligible_count,
    'generated_rows', v_generated_rows,
    'calculated_at', v_now
  );
end;
$$;

revoke all on function public.meewav_france_region_v1(text) from public, anon, authenticated;
grant execute on function public.meewav_france_region_v1(text) to service_role;
revoke all on function public.refresh_profile_rankings_v1() from public, anon, authenticated;
grant execute on function public.refresh_profile_rankings_v1() to service_role;

-- Schedule the complete projection refresh when pg_cron is installed (the
-- hosted Supabase default). The dynamic call keeps local/test databases that
-- do not install pg_cron compatible, and the stable name makes this idempotent.
do $schedule$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1, $2, $3)'
      using 'profile-geographic-rankings-v1', '17 3 * * *',
        'select public.refresh_profile_rankings_v1();';
  end if;
end;
$schedule$;

create or replace function public.get_my_profile_rankings_v1(p_period text default '30d')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_interval interval;
  v_period_start timestamptz;
  v_entries jsonb := '[]'::jsonb;
  v_current_points bigint := 0;
  v_points_gained bigint := 0;
  v_measured_at timestamptz;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_interval := case p_period
    when '7d' then interval '7 days'
    when '30d' then interval '30 days'
    when '12m' then interval '12 months'
    else null
  end;
  if v_interval is null then
    raise exception using errcode = '22023', message = 'invalid_ranking_period';
  end if;
  v_period_start := now() - v_interval;

  select state.total_points
  into v_current_points
  from public.profile_grade_state state
  where state.profile_id = v_profile_id;
  v_current_points := coalesce(v_current_points, 0);

  select coalesce(sum(event.points_delta), 0)
  into v_points_gained
  from public.profile_grade_events event
  where event.profile_id = v_profile_id
    and event.occurred_at >= v_period_start;

  select max(current_rank.calculated_at)
  into v_measured_at
  from public.profile_rankings_current current_rank
  where current_rank.profile_id = v_profile_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'scope', current_rank.scope,
      'label', current_rank.scope_label,
      'rank', current_rank.rank_position,
      'total', current_rank.eligible_count,
      'movement', case
        when previous_rank.rank_position is null then null
        else previous_rank.rank_position - current_rank.rank_position
      end
    ) order by case current_rank.scope
      when 'country' then 1
      when 'region' then 2
      when 'city' then 3
      when 'district' then 4
      else 5
    end
  ), '[]'::jsonb)
  into v_entries
  from public.profile_rankings_current current_rank
  left join lateral (
    select history.rank_position
    from public.profile_rankings_history history
    where history.profile_id = current_rank.profile_id
      and history.scope = current_rank.scope
      and history.scope_key = current_rank.scope_key
      and history.calculated_at <= v_period_start
    order by history.calculated_at desc
    limit 1
  ) previous_rank on true
  where current_rank.profile_id = v_profile_id;

  return jsonb_build_object(
    'contract_version', 1,
    'algorithm_version', 'grade-points-v1',
    'period', p_period,
    'basis', 'grade_points',
    'current_points', v_current_points,
    'points_gained', v_points_gained,
    'measured_at', v_measured_at,
    'entries', v_entries
  );
end;
$$;

revoke all on function public.get_my_profile_rankings_v1(text) from public, anon;
grant execute on function public.get_my_profile_rankings_v1(text) to authenticated;

comment on function public.refresh_profile_rankings_v1() is
  'Trusted daily refresh for owner-only geographic grade-point rankings.';
comment on function public.get_my_profile_rankings_v1(text) is
  'Owner-only ranking summary. Returns no competing profile identity.';

-- Seed the first reproducible snapshot. Future refreshes are scheduled by the
-- trusted backend job, never by Web or iOS clients.
select public.refresh_profile_rankings_v1();

commit;

