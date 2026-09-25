begin;

create extension if not exists pgtap with schema extensions;
select plan(51);

select has_table('public', 'platform_contract_versions', 'platform contract registry exists');
select has_table('public', 'recognition_definitions', 'recognition catalog exists');
select has_table('public', 'profile_recognition_state', 'recognition state exists');
select has_table('public', 'profile_recognition_events', 'recognition ledger exists');
select ok(
  to_regprocedure('public.get_meewav_bootstrap_v1()') is not null,
  'cross-client bootstrap exists'
);
select ok(
  to_regprocedure('public.get_my_profile_bootstrap_v1()') is not null,
  'versioned native bootstrap alias exists'
);
select ok(
  to_regprocedure(
    'public.complete_onboarding_v1(text,text,text,text,text,text,double precision,double precision,boolean,boolean)'
  ) is not null,
  'versioned onboarding alias exists'
);
select ok(
  to_regprocedure('public.get_room_participant_cards_v1(uuid,uuid[])') is not null,
  'Room participant adapter exists'
);
select is(
  (select count(*)::integer from public.get_grade_catalog_v1()),
  6,
  'grade catalog exposes exactly six levels'
);
select is(
  (select code from public.get_grade_catalog_v1() where level = 6),
  'legendary',
  'level six is canonical Legendary'
);
select ok(
  not has_function_privilege('anon', 'public.get_meewav_bootstrap_v1()', 'execute'),
  'anonymous clients cannot bootstrap an owner account'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_my_public_profile_v1(text,text,text,text,boolean,jsonb,jsonb,boolean,boolean)',
    'execute'
  ),
  'anonymous clients cannot update a profile'
);
select ok(
  not has_table_privilege('anon', 'public.profile_grade_state', 'select'),
  'anonymous clients cannot read raw grade points'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'platform-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'platform-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform B"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '43000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'platform-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Platform C"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'platform_a', 'Platform A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'user A completes onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'platform_b', 'Platform B', 'avatar_25', 'beatmaker', 'Paris', 'FR',
    48.8600, 2.3600, false, true
  )$$,
  'user B completes onboarding'
);
update public.profiles
set public_profile_preferences = jsonb_build_object('show_grade', false)
where id = auth.uid();

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'platform_c', 'Platform C', 'avatar_17', 'dj', 'Paris', 'FR',
    48.8700, 2.3700, false, true
  )$$,
  'user C completes onboarding'
);

reset role;
select throws_ok(
  $$select public.apply_profile_grade_event(
    '41000000-0000-0000-0000-000000000001', null, 'system',
    'invalid_null_grade', 'platform-grade-null', 'pgTAP', '{}'::jsonb
  )$$,
  '22023',
  'grade_points_delta_required',
  'grade engine refuses a NULL point delta'
);
select lives_ok(
  $$select public.apply_profile_grade_event(
    '41000000-0000-0000-0000-000000000001', 3000, 'system',
    'test_grade_seed', 'platform-grade-a-001', 'pgTAP', '{}'::jsonb
  )$$,
  'trusted backend can progress a grade'
);
select is(
  (public.apply_profile_grade_event(
    '41000000-0000-0000-0000-000000000001', 3000, 'system',
    'test_grade_seed', ' platform-grade-a-001 ', 'pgTAP', '{}'::jsonb
  ) ->> 'idempotent')::boolean,
  true,
  'grade retry normalizes surrounding idempotency whitespace'
);
select is(
  (select level::integer from public.profile_grade_state
   where profile_id = '41000000-0000-0000-0000-000000000001'),
  4,
  '3000 points reaches Elite'
);
select lives_ok(
  $$select public.apply_profile_grade_event(
    '41000000-0000-0000-0000-000000000001', -10000, 'system',
    'test_admin_correction', 'platform-grade-a-002', 'pgTAP', '{}'::jsonb
  )$$,
  'a trusted correction is bounded by the current grade floor'
);
select is(
  (select level::integer from public.profile_grade_state
   where profile_id = '41000000-0000-0000-0000-000000000001'),
  4,
  'grade level never downgrades automatically'
);
select is(
  (select total_points::integer from public.profile_grade_state
   where profile_id = '41000000-0000-0000-0000-000000000001'),
  3000,
  'points never fall below the current level threshold'
);
select is(
  (select count(*)::integer from public.get_public_profile_grade_v1(
    '41000000-0000-0000-0000-000000000001'
  )),
  1,
  'public grade is visible when the owner allows it'
);
select is(
  (select count(*)::integer from public.get_public_profile_grade_v1(
    '42000000-0000-0000-0000-000000000002'
  )),
  0,
  'public grade is hidden when show_grade is false'
);

select lives_ok(
  $$select public.apply_profile_recognition_event_v1(
    '41000000-0000-0000-0000-000000000001',
    'tremplin_talent_spotted', 1, 'tremplin', 'official_selection',
    'platform-recognition-a-001', '{}'::jsonb
  )$$,
  'trusted backend can award a canonical recognition'
);
select throws_ok(
  $$select public.apply_profile_recognition_event_v1(
    '41000000-0000-0000-0000-000000000001',
    'golden_pulse_25', null, 'globe', 'invalid_null_recognition',
    'platform-recognition-null', '{}'::jsonb
  )$$,
  '22023',
  'recognition_delta_must_be_positive',
  'recognition engine refuses a NULL progress delta'
);
select is(
  (public.apply_profile_recognition_event_v1(
    '41000000-0000-0000-0000-000000000001',
    'tremplin_talent_spotted', 1, 'tremplin', 'official_selection',
    ' platform-recognition-a-001 ', '{}'::jsonb
  ) ->> 'idempotent')::boolean,
  true,
  'recognition retries are idempotent'
);
select is(
  (select count(*)::integer from public.profile_recognition_events
   where profile_id = '41000000-0000-0000-0000-000000000001'
     and recognition_code = 'tremplin_talent_spotted'),
  1,
  'recognition retry creates one ledger event'
);
select is(
  (select count(*)::integer from public.public_profile_recognitions_v1
   where profile_id = '41000000-0000-0000-0000-000000000001'),
  1,
  'earned public recognition is visible'
);

select lives_ok(
  $$insert into public.rooms_v2 (
    id, host_id, type, title, status, livekit_room_name
  ) values (
    '44000000-0000-0000-0000-000000000004',
    '41000000-0000-0000-0000-000000000001',
    'open_mic', 'Platform contract Room', 'live', 'platform-room-v1'
  )$$,
  'existing Rooms v2 accepts an unchanged Room'
);
select lives_ok(
  $$insert into public.room_participants_v2(room_id, user_id, role)
    values (
      '44000000-0000-0000-0000-000000000004',
      '42000000-0000-0000-0000-000000000002',
      'viewer'
    )$$,
  'existing Rooms v2 accepts an unchanged participant'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.get_room_participant_cards_v1(
    '44000000-0000-0000-0000-000000000004', null
  )),
  2,
  'active participant can read the two safe Room cards'
);
select is(
  (select grade_level::integer from public.get_room_participant_cards_v1(
    '44000000-0000-0000-0000-000000000004',
    array['41000000-0000-0000-0000-000000000001']::uuid[]
  )),
  4,
  'Room adapter returns the canonical Elite grade'
);
select is(
  (select jsonb_array_length(recognitions)
   from public.get_room_participant_cards_v1(
    '44000000-0000-0000-0000-000000000004',
    array['41000000-0000-0000-0000-000000000001']::uuid[]
  )),
  1,
  'Room adapter batches earned public recognitions with the participant card'
);
select is(
  (select grade_level::integer from public.get_room_participant_cards_v1(
    '44000000-0000-0000-0000-000000000004',
    array['42000000-0000-0000-0000-000000000002']::uuid[]
  )),
  null,
  'Room adapter respects a participant hidden-grade preference'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.get_room_participant_cards_v1(
    '44000000-0000-0000-0000-000000000004', null
  )$$,
  '42501',
  'room_membership_required',
  'an outsider cannot enumerate Room participant cards'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.get_meewav_bootstrap_v1() -> 'contract' ->> 'current_version')::integer,
  1,
  'bootstrap returns Platform contract v1'
);
select is(
  jsonb_array_length(public.get_meewav_bootstrap_v1() -> 'grade_catalog'),
  6,
  'bootstrap returns the complete grade catalog'
);
select lives_ok(
  $$select public.update_my_private_profile_v1(
    '+33102030405', '1995-06-12'::date, '1 rue Test', '75001',
    'Paris', 'FR', 48.8567, 2.3523
  )$$,
  'owner can update private profile data through a narrow RPC'
);
select is(
  (select latitude from public.profile_locations_private
   where profile_id = '41000000-0000-0000-0000-000000000001'),
  48.8567::double precision,
  'exact owner location remains in the private table'
);
select lives_ok(
  $$select public.update_my_public_profile_v1(
    'platform_a', 'Platform A', 'Bio publique', 'pianist', true,
    '{}'::jsonb, '{"show_grade":false}'::jsonb, true, false
  )$$,
  'owner can update public profile data through a narrow RPC'
);
select is(
  (select public_profile_preferences ->> 'show_grade'
   from public.profiles
   where id = '41000000-0000-0000-0000-000000000001'),
  'false',
  'public update persists the grade visibility preference'
);
select is(
  (select count(*)::integer from public.get_public_profile_grade_v1(
    '41000000-0000-0000-0000-000000000001'
  )),
  0,
  'public grade disappears immediately after owner hides it'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_recognition_state', 'insert'),
  'authenticated clients cannot mint recognition state'
);
select ok(
  not has_column_privilege(
    'anon', 'public.profile_recognition_state', 'current_value', 'select'
  ),
  'public clients cannot read private recognition progress from the raw table'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_verified_grade_signal_v1(uuid,text,text,text,jsonb)',
    'execute'
  ),
  'authenticated clients cannot submit verified grade signals'
);
select ok(
  not has_table_privilege('service_role', 'public.profile_grade_events', 'truncate'),
  'service role cannot truncate the immutable grade ledger'
);
select ok(
  not has_table_privilege(
    'service_role', 'public.profile_recognition_events', 'truncate'
  ),
  'service role cannot truncate the immutable recognition ledger'
);
select ok(
  case
    when to_regclass('public.mock_artists') is null then true
    else not has_table_privilege('authenticated', 'public.mock_artists', 'insert')
  end,
  'browser role cannot write legacy mock artists'
);
select ok(
  case
    when to_regclass('public.spatial_ref_sys') is null then true
    else not has_table_privilege('authenticated', 'public.spatial_ref_sys', 'update')
  end,
  'browser role cannot modify PostGIS spatial references'
);

select * from finish();
rollback;
