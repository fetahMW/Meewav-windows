begin;

create extension if not exists pgtap with schema extensions;
select plan(57);

-- Stable synthetic principals. The transaction is rolled back after the test.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'rls-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'rls-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS B"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'rls-private@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS Private"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.complete_onboarding(
    'artist_a', 'Artist A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.856613, 2.352222, false, true
  )$$,
  'user A can complete onboarding atomically'
);
select is(
  (select username from public.profiles where id = auth.uid()),
  'artist_a',
  'onboarding stores normalized username'
);
select is(
  (select avatar_style_key from public.profiles where id = auth.uid()),
  'avatar_7',
  'onboarding resolves canonical avatar key'
);
select is(
  (select primary_role_key from public.profiles where id = auth.uid()),
  'pianist',
  'onboarding resolves canonical role key'
);
select lives_ok(
  $$select public.update_my_public_discovery_profile(
    'Jazz contemporain', '75111', 'iris-75111-04', 'Roquette', 'avatar_7'
  )$$,
  'owner can persist the additive Globe discovery context'
);
select is(
  (select zone_id from public.profile_public_markers where profile_id = auth.uid()),
  'iris-75111-04',
  'public marker preserves the Globe zone id'
);
select is(
  (select avatar_icon_id from public.profile_public_markers where profile_id = auth.uid()),
  'avatar_7',
  'public marker preserves the canonical avatar icon id'
);
select is(
  (public.get_my_private_profile() ->> 'email'),
  'rls-a@example.test',
  'owner private RPC returns only the caller email'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email', 'select'),
  'authenticated browser role cannot select private email columns directly'
);
select is(
  round(((public.get_my_private_profile() ->> 'latitude')::numeric), 6),
  48.856613::numeric,
  'owner private RPC returns exact latitude'
);
select is(
  (select latitude::numeric from public.profile_public_markers where profile_id = auth.uid()),
  48.86::numeric,
  'public marker stores only coarse latitude'
);
select is(
  (select count(*)::integer from public.profile_locations_private
   where profile_id = '30000000-0000-0000-0000-000000000003'),
  0,
  'user A cannot see user B private location'
);
select hasnt_column('public', 'public_profiles', 'email', 'Web public projection cannot expose email');
select hasnt_column('public', 'public_profiles', 'latitude', 'Web public projection cannot expose exact coordinates');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'artist_b', 'Artist B', 'avatar_16', 'acoustic_guitarist', 'Paris', 'FR',
    48.853, 2.369, false, true
  )$$,
  'user B can publish its canonical profile before social interactions'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.follows(follower_id, following_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')$$,
  'user A can follow user B'
);
select throws_ok(
  $$insert into public.follows(follower_id, following_id)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  '23514',
  'cannot_follow_self',
  'self-follow is rejected'
);
delete from public.follows
where follower_id = '10000000-0000-0000-0000-000000000001'
  and following_id = '20000000-0000-0000-0000-000000000002';
select throws_ok(
  $$insert into public.follows(follower_id, following_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')$$,
  '54000',
  'follow_refollow_cooldown',
  'authenticated callers cannot bypass the refollow cooldown through SECURITY DEFINER'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.notifications), 1, 'follow recipient sees one notification');
select is(public.mark_notifications_read(null), 1, 'recipient can mark own notification read');
select is((select count(*)::integer from public.notifications where is_read), 1, 'notification is marked read');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (with changed as (
    update public.notifications set is_read = false
    where user_id = '20000000-0000-0000-0000-000000000002'
    returning 1
  ) select count(*)::integer from changed),
  0,
  'user A cannot mutate user B notifications'
);
select throws_ok(
  $$update public.profiles set grade = 6 where id = auth.uid()$$,
  '42501',
  'permission denied for table profiles',
  'client cannot assign its own grade'
);
select throws_ok(
  $$update public.profile_grade_state set level = 6 where profile_id = auth.uid()$$,
  '42501',
  'permission denied for table profile_grade_state',
  'client cannot update canonical grade state'
);
select is(
  (public.give_golden_like('20000000-0000-0000-0000-000000000002') ->> 'ok')::boolean,
  true,
  'authenticated profile can give its daily Golden Like'
);
select is(
  (select golden_likes_count from public.profiles
   where id = '20000000-0000-0000-0000-000000000002'),
  1::bigint,
  'Golden Like count is recomputed on the recipient profile'
);
select is(
  (public.give_golden_like('20000000-0000-0000-0000-000000000002') ->> 'idempotentReplay')::boolean,
  true,
  'retrying the same Golden Like is idempotent'
);
select is(
  (select count(*)::integer from public.daily_golden_likes
   where giver_id = auth.uid()),
  1,
  'idempotent retry cannot duplicate the Golden Like ledger event'
);
select throws_ok(
  $$insert into public.daily_golden_likes(giver_id, recipient_id, given_at, day_date)
    values (
      auth.uid(), '20000000-0000-0000-0000-000000000002',
      now() - interval '10 days', current_date - 10
    )$$,
  '23505', 'golden_like_already_used_today',
  'direct iOS-compatible insert cannot backdate around the daily server guard'
);
select throws_ok(
  $$update public.profiles
    set golden_likes_count = golden_likes_count + 99
    where id = auth.uid()$$,
  '42501', 'permission denied for table profiles',
  'client cannot forge its Golden Like aggregate'
);

select lives_ok(
  $$insert into public.media_files(
      user_id, type, name, file_url, storage_bucket, storage_path, status, visibility
    ) values (
      auth.uid(), 'audio', 'Private demo', 'https://example.test/private-demo.mp3', 'profile-media',
      auth.uid()::text || '/media/private-demo.mp3', 'draft', 'private'
    )$$,
  'owner can create private draft media metadata'
);
select throws_ok(
  $$insert into public.media_files(
      user_id, type, name, storage_bucket, storage_path, status, visibility
    ) values (
      auth.uid(), 'audio', 'Missing object', 'profile-media',
      auth.uid()::text || '/media/missing-object.mp3', 'published', 'public'
    )$$,
  '23514', 'published_media_requires_uploaded_object',
  'client cannot publish metadata before its Storage object exists'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.media_files where name = 'Private demo'), 0, 'user B cannot read user A draft media');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update public.media_files
    set status = 'published', visibility = 'public'
    where user_id = auth.uid() and name = 'Private demo'$$,
  '23514', 'published_media_requires_uploaded_object',
  'browser cannot publish a new arbitrary external URL'
);

select lives_ok(
  $$select public.track_analytics_event(
    '20000000-0000-0000-0000-000000000002', 'profile', 'profile_view', 'rls-test-1', null,
    '{"surface":"profile_home","email":"must-be-stripped"}'::jsonb, now()
  )$$,
  'authenticated client can emit an allowlisted low-trust event'
);
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'select'), 'client cannot read raw analytics events');
select ok(
  not has_table_privilege('authenticated', 'public.profile_daily_metric_visitors', 'select'),
  'client cannot read the exact analytics visitor ledger'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_transactions', 'insert'),
  'client cannot forge authoritative financial activity'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_badges', 'insert'),
  'client cannot award its own badges'
);
select throws_ok(
  $$select public.track_analytics_event(
    auth.uid(), 'marketplace', 'wallet_credit', 'rls-test-2', null, '{}'::jsonb, now()
  )$$,
  '22023', 'client_event_not_allowed',
  'client cannot forge economic analytics events'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$update public.media_files
    set status = 'published', visibility = 'public'
    where user_id = '10000000-0000-0000-0000-000000000001'
      and name = 'Private demo'$$,
  'trusted service can curate a legacy HTTPS media URL'
);
select is(
  (public.apply_profile_grade_event(
    '10000000-0000-0000-0000-000000000001', 1000, 'profile',
    'verified_profile_milestone', 'grade-rls-1', 'RLS test', '{}'::jsonb
  ) ->> 'level')::integer,
  2,
  'service role can advance canonical grade deterministically'
);
select is(
  (public.apply_profile_grade_event(
    '10000000-0000-0000-0000-000000000001', 1000, 'profile',
    'verified_profile_milestone', 'grade-rls-1', 'RLS test retry', '{}'::jsonb
  ) ->> 'idempotent')::boolean,
  true,
  'grade event retry is idempotent'
);
select is(
  (select total_points from public.profile_grade_state
   where profile_id = '10000000-0000-0000-0000-000000000001'),
  1000::bigint,
  'idempotent retry cannot double grade points'
);
select is(
  (select grade from public.profiles
   where id = '10000000-0000-0000-0000-000000000001'),
  2,
  'legacy profile grade stays synchronized for iOS compatibility'
);
select is(
  (select properties ? 'email' from public.analytics_events
   where actor_profile_id = '10000000-0000-0000-0000-000000000001'
     and idempotency_key = 'rls-test-1'),
  false,
  'analytics allowlist strips unexpected PII properties'
);
select ok(public.refresh_profile_daily_metrics(current_date, current_date) >= 1, 'service role can refresh analytics rollups');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select ok(not has_column_privilege('anon', 'public.profiles', 'email', 'select'), 'anon has no direct email column privilege');
select ok(not has_column_privilege('anon', 'public.profiles', 'latitude', 'select'), 'anon has no direct exact-coordinate privilege');
select ok(not has_table_privilege('anon', 'public.profile_daily_metric_visitors', 'select'), 'anon cannot read the exact visitor ledger');
select ok(not has_table_privilege('anon', 'public.media_files', 'select'), 'anon reads published media only through the safe projection');
select ok(
  not has_function_privilege('anon', 'public.resolve_profile_email_for_username(text)', 'execute'),
  'legacy username resolver cannot disclose an email anonymously'
);
select is((select count(*)::integer from public.public_profiles where username = 'artist_a'), 1, 'anon sees explicitly public non-ghost profile through safe view');
select is((select scene_name from public.public_profiles where username = 'artist_a'), 'Jazz contemporain', 'anon safe view exposes the public music scene');
select is((select golden_likes_count from public.public_profiles where username = 'artist_b'), 1::bigint, 'anon sees only the public Golden Like aggregate');
select is((select count(*)::integer from public.public_profiles where id = '30000000-0000-0000-0000-000000000003'), 0, 'anon cannot see private profile through safe view');
select is((select count(*)::integer from public.published_media_files where name = 'Private demo'), 1, 'anon sees published public media metadata');

select * from finish();
rollback;
