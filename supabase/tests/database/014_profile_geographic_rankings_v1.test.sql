begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Private schema and RPC boundary.
-- ---------------------------------------------------------------------------

select has_table(
  'public', 'profile_ranking_runs',
  'ranking refresh run ledger exists'
);
select has_table(
  'public', 'profile_rankings_current',
  'current owner ranking projection exists'
);
select has_table(
  'public', 'profile_rankings_history',
  'historical ranking snapshots exist'
);
select ok(
  to_regprocedure('public.refresh_profile_rankings_v1()') is not null,
  'trusted refresh RPC exists'
);
select ok(
  to_regprocedure('public.get_my_profile_rankings_v1(text)') is not null,
  'owner ranking RPC exists'
);
select ok(
  to_regprocedure('public.meewav_france_region_v1(text)') is not null,
  'France commune-to-region helper exists'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    where function_row.oid =
      'public.refresh_profile_rankings_v1()'::regprocedure
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=pg_catalog, public']
  ),
  'refresh RPC is SECURITY DEFINER with a fixed safe search path'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    where function_row.oid =
      'public.get_my_profile_rankings_v1(text)'::regprocedure
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=pg_catalog, public']
  ),
  'owner RPC is SECURITY DEFINER with a fixed safe search path'
);
select ok(
  not has_function_privilege(
    'anon', 'public.get_my_profile_rankings_v1(text)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.get_my_profile_rankings_v1(text)', 'execute'
  ),
  'only authenticated browser clients can call the owner RPC'
);
select ok(
  not has_function_privilege(
    'anon', 'public.refresh_profile_rankings_v1()', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.refresh_profile_rankings_v1()', 'execute'
  )
  and has_function_privilege(
    'service_role', 'public.refresh_profile_rankings_v1()', 'execute'
  ),
  'only the trusted service role can execute a refresh'
);
select ok(
  not has_table_privilege(
    'anon', 'public.profile_rankings_current', 'select'
  )
  and not has_table_privilege(
    'authenticated', 'public.profile_rankings_current', 'select'
  )
  and not has_table_privilege(
    'authenticated', 'public.profile_rankings_history', 'select'
  ),
  'browser roles cannot download ranking populations or history'
);
select ok(
  (
    select table_row.relrowsecurity and table_row.relforcerowsecurity
    from pg_class table_row
    where table_row.oid = 'public.profile_ranking_runs'::regclass
  )
  and (
    select table_row.relrowsecurity and table_row.relforcerowsecurity
    from pg_class table_row
    where table_row.oid = 'public.profile_rankings_current'::regclass
  )
  and (
    select table_row.relrowsecurity and table_row.relforcerowsecurity
    from pg_class table_row
    where table_row.oid = 'public.profile_rankings_history'::regclass
  ),
  'all internal ranking tables force RLS'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profile_ranking_runs',
        'profile_rankings_current',
        'profile_rankings_history'
      )
  ),
  0,
  'internal ranking tables intentionally expose no row policy'
);

select is(
  (select region_name from public.meewav_france_region_v1('75056')),
  'Île-de-France',
  'Paris commune code maps to Île-de-France'
);
select is(
  (select region_name from public.meewav_france_region_v1('2a004')),
  'Corse',
  'commune normalization preserves lowercase Corsican prefixes'
);

-- ---------------------------------------------------------------------------
-- Reproducible ranks, geographic canonicalization and private owner payload.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'b1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'ranking-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ranking A","country":"France","country_code":"FR","city":"Paris","commune_code":"75056","zone_id":"paris-charonne","district_name":"Charonne","show_on_public_profile":true,"is_ghost_mode":false}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'ranking-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ranking B","country":"France","city":"Paris","commune_code":"75056","zone_id":"paris-charonne","district_name":"Charonne","show_on_public_profile":true,"is_ghost_mode":false}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b3000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'ranking-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ranking C","country_code":"FR","city":"Paris","commune_code":"75056","zone_id":"paris-bastille","district_name":"Bastille","show_on_public_profile":true,"is_ghost_mode":false}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b4000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'ranking-d@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ranking D","city":"Lyon","commune_code":"69123","zone_id":"lyon-croix-rousse","district_name":"Croix-Rousse","show_on_public_profile":true,"is_ghost_mode":false}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b5000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'ranking-hidden@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ranking Hidden","country":"France","country_code":"FR","city":"Paris","commune_code":"75056","zone_id":"paris-charonne","district_name":"Charonne","show_on_public_profile":false,"is_ghost_mode":true}'::jsonb,
    now(), now()
  );

update public.profile_grade_state
set total_points = case profile_id
      when 'b1000000-0000-4000-8000-000000000001'::uuid then 4000
      when 'b2000000-0000-4000-8000-000000000002'::uuid then 4000
      when 'b3000000-0000-4000-8000-000000000003'::uuid then 3000
      when 'b4000000-0000-4000-8000-000000000004'::uuid then 2000
      else 6000
    end,
    level = case profile_id
      when 'b1000000-0000-4000-8000-000000000001'::uuid then 5
      when 'b2000000-0000-4000-8000-000000000002'::uuid then 5
      when 'b3000000-0000-4000-8000-000000000003'::uuid then 4
      when 'b4000000-0000-4000-8000-000000000004'::uuid then 3
      else 6
    end
where profile_id in (
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000002'::uuid,
  'b3000000-0000-4000-8000-000000000003'::uuid,
  'b4000000-0000-4000-8000-000000000004'::uuid,
  'b5000000-0000-4000-8000-000000000005'::uuid
);

select lives_ok(
  $$select public.refresh_profile_rankings_v1()$$,
  'trusted refresh builds a complete projection'
);
select is(
  (
    select run.eligible_profiles
    from public.profile_ranking_runs run
    order by run.started_at desc
    limit 1
  ),
  4,
  'run count includes only actually ranked public non-ghost profiles'
);
select is(
  (
    select count(distinct current_rank.scope_key)::integer
    from public.profile_rankings_current current_rank
    where current_rank.scope = 'country'
  ),
  1,
  'FR code, France label and French commune inference share one country scope'
);
select is(
  (
    select current_rank.scope_key
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b2000000-0000-4000-8000-000000000002'::uuid
      and current_rank.scope = 'country'
  ),
  'FR',
  'France without an explicit country code is canonicalized to FR'
);
select is(
  (
    select current_rank.eligible_count::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b1000000-0000-4000-8000-000000000001'::uuid
      and current_rank.scope = 'country'
  ),
  4,
  'country denominator is the eligible population'
);
select is(
  (
    select current_rank.rank_position::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b1000000-0000-4000-8000-000000000001'::uuid
      and current_rank.scope = 'country'
  ),
  1,
  'first tied profile receives rank one'
);
select is(
  (
    select current_rank.rank_position::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b2000000-0000-4000-8000-000000000002'::uuid
      and current_rank.scope = 'country'
  ),
  1,
  'second tied profile also receives rank one'
);
select is(
  (
    select current_rank.rank_position::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b3000000-0000-4000-8000-000000000003'::uuid
      and current_rank.scope = 'country'
  ),
  2,
  'dense ranking gives the next score rank two without a tie gap'
);
select ok(
  not exists (
    select 1
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b5000000-0000-4000-8000-000000000005'::uuid
  ),
  'ghost/private profiles never enter a ranking population'
);
select is(
  (
    select current_rank.scope_label
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b1000000-0000-4000-8000-000000000001'::uuid
      and current_rank.scope = 'region'
  ),
  'Île-de-France',
  'owner receives the canonical regional scope'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  jsonb_array_length(
    public.get_my_profile_rankings_v1('30d') -> 'entries'
  ),
  4,
  'owner RPC returns only its four aggregate geographic scopes'
);
select is(
  jsonb_typeof(
    public.get_my_profile_rankings_v1('30d')
      -> 'entries' -> 0 -> 'movement'
  ),
  'null',
  'missing historical baseline returns movement null, never false stability'
);
select throws_ok(
  $$select public.get_my_profile_rankings_v1('90d')$$,
  '22023',
  'invalid_ranking_period',
  'unsupported ranking periods are rejected'
);

reset role;

update public.profile_rankings_history history
set calculated_at = now() - interval '8 days'
where history.run_id = (
  select current_rank.run_id
  from public.profile_rankings_current current_rank
  where current_rank.profile_id =
    'b1000000-0000-4000-8000-000000000001'::uuid
  limit 1
);

update public.profile_grade_state
set total_points = 5000, level = 5
where profile_id = 'b3000000-0000-4000-8000-000000000003'::uuid;

select lives_ok(
  $$select public.refresh_profile_rankings_v1()$$,
  'a later trusted refresh atomically replaces the current projection'
);
select is(
  (
    select current_rank.rank_position::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b1000000-0000-4000-8000-000000000001'::uuid
      and current_rank.scope = 'country'
  ),
  2,
  'owner falls to dense rank two when another profile moves ahead'
);
select is(
  (
    select current_rank.rank_position::integer
    from public.profile_rankings_current current_rank
    where current_rank.profile_id =
      'b4000000-0000-4000-8000-000000000004'::uuid
      and current_rank.scope = 'country'
  ),
  3,
  'dense ranking still has no hole after the rank-two tie'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    public.get_my_profile_rankings_v1('7d')
      -> 'entries' -> 0 ->> 'movement'
  )::integer,
  -1,
  'owner movement compares against the historical snapshot for the period'
);

select * from finish();
rollback;

