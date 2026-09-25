begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'collaboration_requests', 'collaboration request ledger exists');
select has_column('public', 'collaboration_requests', 'sender_profile_id', 'request stores canonical sender profile');
select has_column('public', 'collaboration_requests', 'recipient_profile_id', 'request stores canonical recipient profile');
select has_column('public', 'collaboration_requests', 'idempotency_key', 'request stores retry key');
select has_column('public', 'collaboration_requests', 'source', 'request stores source pillar');
select ok(
  to_regprocedure('public.request_profile_collaboration(uuid,text,text,text)') is not null,
  'authenticated collaboration RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.collaboration_requests', 'insert'),
  'authenticated clients cannot bypass the collaboration RPC'
);
select ok(
  not has_table_privilege('anon', 'public.collaboration_requests', 'select'),
  'anonymous clients cannot read collaboration requests'
);
select ok(
  not has_table_privilege('authenticated', 'public.collaboration_requests', 'select'),
  'authenticated clients use the safe collaboration projection instead of SELECT *'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'collab-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Collab A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '32000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'collab-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Collab B"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.complete_onboarding(
    'collab_a', 'Collab A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'sender can publish its profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.complete_onboarding(
    'collab_b', 'Collab B', 'avatar_16', 'acoustic_guitarist', 'Paris', 'FR',
    48.8530, 2.3690, false, true
  )$$,
  'recipient can publish its profile'
);
update public.profiles
set collab_available = true
where id = auth.uid();

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.request_profile_collaboration(
    '32000000-0000-0000-0000-000000000002',
    'Créons une session piano et guitare.',
    'globe-test-request-001',
    'globe'
  ) ->> 'ok')::boolean,
  true,
  'sender can create a persisted request'
);
select is(
  (public.request_profile_collaboration(
    '32000000-0000-0000-0000-000000000002',
    'Créons une session piano et guitare.',
    'globe-test-request-001',
    'globe'
  ) ->> 'idempotentReplay')::boolean,
  true,
  'same retry key returns the existing request'
);
select is(
  (select count(*)::integer
   from public.list_my_collaboration_requests_v1('sent', null, null, 30)),
  1,
  'idempotent replay cannot duplicate the request'
);
select is(
  (select status
   from public.list_my_collaboration_requests_v1('sent', null, null, 30)
   limit 1),
  'pending',
  'new collaboration starts pending'
);
select throws_ok(
  $$select public.request_profile_collaboration(
    '32000000-0000-0000-0000-000000000002',
    'Tentative avec une source réservée au serveur.',
    'globe-test-request-source-bypass',
    'rooms'
  )$$,
  '22023',
  'collaboration_client_source_not_allowed',
  'authenticated callers cannot forge another pillar source through SECURITY DEFINER'
);
select throws_ok(
  $$select public.request_profile_collaboration(
    '31000000-0000-0000-0000-000000000001',
    'Message vers moi-même',
    'globe-test-request-self',
    'globe'
  )$$,
  '23514',
  'cannot_request_collaboration_with_self',
  'self collaboration is rejected'
);

insert into public.follows (follower_id, following_id)
values (
  '31000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000002'
);

reset role;
select is(
  (select count(*)::integer from public.analytics_events
   where event_name = 'collaboration_request_created'
     and actor_profile_id = '31000000-0000-0000-0000-000000000001'
     and subject_profile_id = '32000000-0000-0000-0000-000000000002'),
  1,
  'a persisted collaboration request emits one server analytics event'
);
select is(
  (select count(*)::integer from public.analytics_events
   where event_name = 'follow_created'
     and actor_profile_id = '31000000-0000-0000-0000-000000000001'
     and subject_profile_id = '32000000-0000-0000-0000-000000000002'),
  1,
  'a persisted follow emits one server analytics event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer
   from public.list_my_collaboration_requests_v1('received', null, null, 30)),
  1,
  'recipient can read its request'
);
select is(
  (select count(*)::integer from public.notifications
   where type = 'collaboration_request'
     and from_user_id = '31000000-0000-0000-0000-000000000001'),
  1,
  'recipient receives one collaboration notification'
);
select is(
  (select payload ->> 'source' from public.notifications
   where type = 'collaboration_request'
     and from_user_id = '31000000-0000-0000-0000-000000000001'
   limit 1),
  'globe',
  'notification preserves the request source'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select ok(
  not has_function_privilege(
    'anon',
    'public.request_profile_collaboration(uuid,text,text,text)',
    'execute'
  ),
  'anonymous clients cannot execute the RPC'
);

select * from finish();
rollback;
