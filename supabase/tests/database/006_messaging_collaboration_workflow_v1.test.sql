begin;

create extension if not exists pgtap with schema extensions;
select plan(50);

select has_table(
  'public', 'collaboration_request_participant_state',
  'collaboration participant state exists'
);
select has_table(
  'public', 'collaboration_request_transitions',
  'collaboration transition ledger exists'
);
select has_column(
  'public', 'collaboration_requests', 'conversation_id',
  'accepted request can reference its direct conversation'
);
select ok(
  to_regprocedure(
    'public.list_my_collaboration_requests_v1(text,text[],jsonb,integer)'
  ) is not null,
  'safe collaboration list RPC exists'
);
select ok(
  to_regprocedure(
    'public.respond_to_collaboration_request_v1(uuid,text,text)'
  ) is not null,
  'recipient response RPC exists'
);
select ok(
  to_regprocedure(
    'public.cancel_collaboration_request_v1(uuid,text)'
  ) is not null,
  'sender cancellation RPC exists'
);
select ok(
  to_regprocedure(
    'public.mark_collaboration_request_viewed_v1(uuid)'
  ) is not null,
  'view state RPC exists'
);
select ok(
  (
    select bool_and(class.relrowsecurity)
    from pg_class class
    where class.oid in (
      'public.collaboration_request_participant_state'::regclass,
      'public.collaboration_request_transitions'::regclass
    )
  ),
  'collaboration workflow private tables have RLS enabled'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.collaboration_requests',
      'public.collaboration_request_participant_state',
      'public.collaboration_request_transitions'
    ]) as private_table(name)
    where has_table_privilege(
      'authenticated', private_table.name, 'select'
    )
  ),
  'authenticated cannot read any raw collaboration workflow ledger'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.collaboration_requests',
      'public.collaboration_request_participant_state',
      'public.collaboration_request_transitions'
    ]) as private_table(name)
    cross join unnest(array['insert', 'update', 'delete'])
      as mutation(privilege)
    where has_table_privilege(
      'authenticated', private_table.name, mutation.privilege
    )
  ),
  'authenticated cannot mutate collaboration workflow tables directly'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_my_collaboration_requests_v1(text,text[],jsonb,integer)',
      'public.mark_collaboration_request_viewed_v1(uuid)',
      'public.respond_to_collaboration_request_v1(uuid,text,text)',
      'public.cancel_collaboration_request_v1(uuid,text)'
    ]) as rpc(signature)
    where not has_function_privilege(
      'authenticated', rpc.signature, 'execute'
    )
  ),
  'authenticated can execute every intended collaboration workflow RPC'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_my_collaboration_requests_v1(text,text[],jsonb,integer)',
      'public.mark_collaboration_request_viewed_v1(uuid)',
      'public.respond_to_collaboration_request_v1(uuid,text,text)',
      'public.cancel_collaboration_request_v1(uuid,text)'
    ]) as rpc(signature)
    where has_function_privilege('anon', rpc.signature, 'execute')
  ),
  'anonymous cannot execute collaboration workflow RPCs'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.initialize_collaboration_participant_state_v1()',
      'public.lock_messaging_relationship_v1(uuid,uuid)',
      'public.lock_user_block_relationship_v1()',
      'public.guard_collaboration_request_block_v1()',
      'public.emit_collaboration_transition_side_effects_v1()'
    ]) as helper(signature)
    where has_function_privilege(
      'authenticated', helper.signature, 'execute'
    ) or has_function_privilege('anon', helper.signature, 'execute')
  ),
  'browser roles cannot execute internal collaboration trigger helpers'
);

create temporary table collaboration_workflow_context (
  key text primary key,
  id uuid,
  value text
);
grant select, insert, update, delete on collaboration_workflow_context
  to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'collab-workflow-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Workflow A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '62000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'collab-workflow-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Workflow B"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '63000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'collab-workflow-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Workflow C"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'workflow_a', 'Workflow A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'sender can publish its profile'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'workflow_b', 'Workflow B', 'avatar_16', 'acoustic_guitarist', 'Paris', 'FR',
    48.8530, 2.3690, false, true
  )$$,
  'recipient can publish its profile'
);
update public.profiles set collab_available = true where id = auth.uid();

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '63000000-0000-0000-0000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'workflow_c', 'Workflow C', 'avatar_21', 'dj', 'Paris', 'FR',
    48.8600, 2.3400, false, true
  )$$,
  'unrelated profile can finish onboarding'
);

-- Sender creates the request that will be accepted.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into collaboration_workflow_context(key, id)
select
  'accept_request',
  (public.request_profile_collaboration(
    '62000000-0000-0000-0000-000000000002',
    'Construisons ce morceau ensemble.',
    'workflow-request-accept-001',
    'globe'
  ) ->> 'requestId')::uuid;

select is(
  (select count(*)::integer
   from public.list_my_collaboration_requests_v1('sent', null, null, 30)),
  1,
  'sender sees one request through the safe projection'
);
select is(
  (select direction
   from public.list_my_collaboration_requests_v1('sent', null, null, 30)
   limit 1),
  'sent',
  'safe projection labels the sender direction'
);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'accept_request'),
    'accept',
    'workflow-sender-response-001'
  )$$,
  'P0002',
  'collaboration_request_not_found',
  'sender cannot execute the recipient response RPC'
);

-- An unrelated account cannot discover or mutate the request.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '63000000-0000-0000-0000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer
   from public.list_my_collaboration_requests_v1('received', null, null, 30)),
  0,
  'unrelated profile sees no collaboration request'
);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'accept_request'),
    'accept',
    'workflow-attacker-response-001'
  )$$,
  'P0002',
  'collaboration_request_not_found',
  'unrelated profile cannot respond to a request'
);

-- Recipient views then accepts. The direct conversation and its system event
-- are created in the same transaction as the status transition.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select is_unread
   from public.list_my_collaboration_requests_v1('received', null, null, 30)
   where request_id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )),
  true,
  'new received request starts unread'
);
select is(
  (public.mark_collaboration_request_viewed_v1(
    (select id from collaboration_workflow_context where key = 'accept_request')
  ) ->> 'ok')::boolean,
  true,
  'recipient can persist viewed state'
);
select is(
  (select is_unread
   from public.list_my_collaboration_requests_v1('received', null, null, 30)
   where request_id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )),
  false,
  'viewed request is no longer unread'
);
select is(
  public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'accept_request'),
    'accept',
    'workflow-transition-accept-001'
  ) ->> 'status',
  'accepted',
  'recipient accepts a pending request'
);
select is(
  (public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'accept_request'),
    'accept',
    'workflow-transition-accept-001'
  ) ->> 'idempotent')::boolean,
  true,
  'same acceptance key replays idempotently'
);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'accept_request'),
    'decline',
    'workflow-transition-late-decline-001'
  )$$,
  'P0001',
  'collaboration_request_already_resolved',
  'accepted request cannot later be declined'
);

reset role;
select ok(
  (select conversation_id is not null
   from public.collaboration_requests
   where id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )),
  'acceptance links a direct conversation'
);
select is(
  (select count(*)::integer
   from public.messaging_direct_pairs pair
   join public.collaboration_requests request
     on request.conversation_id = pair.conversation_id
   where request.id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )),
  1,
  'acceptance creates exactly one canonical direct pair'
);
select is(
  (select count(*)::integer
   from public.messaging_messages message
   join public.collaboration_requests request
     on request.conversation_id = message.conversation_id
   where request.id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )
     and message.kind = 'system'
     and message.payload ->> 'request_id' = request.id::text),
  1,
  'acceptance appends one request-linked system message'
);
select is(
  (select count(*)::integer
   from public.collaboration_request_transitions transition
   where transition.request_id = (
     select id from collaboration_workflow_context where key = 'accept_request'
   )),
  1,
  'acceptance retry cannot duplicate its transition'
);
select is(
  (select count(*)::integer
   from public.notifications notification
   where notification.user_id = '61000000-0000-0000-0000-000000000001'
     and notification.type = 'collaboration_request_accepted'),
  1,
  'sender receives one acceptance notification'
);
select is(
  (select count(*)::integer
   from public.analytics_events event
   where event.event_name = 'collaboration_request_accepted'
     and event.source_event_id = (
       select id::text
       from collaboration_workflow_context where key = 'accept_request'
     )),
  1,
  'acceptance emits one server analytics event'
);

-- A second pending request is declined and stays conversation-free.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into collaboration_workflow_context(key, id)
select
  'decline_request',
  (public.request_profile_collaboration(
    '62000000-0000-0000-0000-000000000002',
    'Une autre proposition.',
    'workflow-request-decline-001',
    'globe'
  ) ->> 'requestId')::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'decline_request'),
    'decline',
    'workflow-transition-decline-001'
  ) ->> 'status',
  'declined',
  'recipient can decline a pending request'
);
select is(
  (public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'decline_request'),
    'decline',
    'workflow-transition-decline-001'
  ) ->> 'idempotent')::boolean,
  true,
  'decline retry is idempotent'
);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'decline_request'),
    'accept',
    'workflow-transition-accept-001'
  )$$,
  '23505',
  'idempotency_conflict',
  'a transition key cannot be reused for another request or action'
);

reset role;
select is(
  (select conversation_id
   from public.collaboration_requests
   where id = (
     select id from collaboration_workflow_context where key = 'decline_request'
   )),
  null::uuid,
  'declined request has no conversation'
);

-- Sender-only cancellation.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into collaboration_workflow_context(key, id)
select
  'cancel_request',
  (public.request_profile_collaboration(
    '62000000-0000-0000-0000-000000000002',
    'Cette demande sera annulée.',
    'workflow-request-cancel-001',
    'globe'
  ) ->> 'requestId')::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.cancel_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'cancel_request'),
    'workflow-recipient-cancel-001'
  )$$,
  'P0002',
  'collaboration_request_not_found',
  'recipient cannot execute the sender cancellation RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.cancel_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'cancel_request'),
    'workflow-transition-cancel-001'
  ) ->> 'status',
  'cancelled',
  'sender can cancel a pending request'
);
select is(
  (public.cancel_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'cancel_request'),
    'workflow-transition-cancel-001'
  ) ->> 'idempotent')::boolean,
  true,
  'cancellation retry is idempotent'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'cancel_request'),
    'accept',
    'workflow-transition-cancelled-accept-001'
  )$$,
  'P0001',
  'collaboration_request_already_resolved',
  'recipient cannot accept a cancelled request'
);

reset role;
select is(
  (select conversation_id
   from public.collaboration_requests
   where id = (
     select id from collaboration_workflow_context where key = 'cancel_request'
   )),
  null::uuid,
  'cancelled request remains conversation-free'
);

-- Blocking prevents both acceptance of an existing request and new requests.
reset role;
-- The creation RPC intentionally limits one sender/recipient pair to three
-- requests per rolling day. Move the completed fixtures outside that window so
-- this independent blocking scenario exercises the guard rather than the quota.
update public.collaboration_requests
set created_at = created_at - interval '2 days'
where sender_profile_id = '61000000-0000-0000-0000-000000000001'
  and status <> 'pending';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into collaboration_workflow_context(key, id)
select
  'blocked_request',
  (public.request_profile_collaboration(
    '62000000-0000-0000-0000-000000000002',
    'Cette demande précède le blocage.',
    'workflow-request-before-block-001',
    'globe'
  ) ->> 'requestId')::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.set_user_block_v1(
    '61000000-0000-0000-0000-000000000001', true, 'test'
  ) ->> 'is_blocked')::boolean,
  true,
  'recipient can block the sender'
);
select throws_ok(
  $$select public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'blocked_request'),
    'accept',
    'workflow-transition-blocked-accept-001'
  )$$,
  '42501',
  'blocked_relationship',
  'blocked relationship cannot be accepted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.request_profile_collaboration(
    '62000000-0000-0000-0000-000000000002',
    'Le garde de blocage doit refuser ceci.',
    'workflow-request-after-block-001',
    'globe'
  )$$,
  '42501',
  'blocked_relationship',
  'block guard rejects a new collaboration request'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.respond_to_collaboration_request_v1(
    (select id from collaboration_workflow_context where key = 'blocked_request'),
    'decline',
    'workflow-transition-blocked-decline-001'
  ) ->> 'status',
  'declined',
  'blocked recipient can still close the pending request by declining'
);
select is(
  (public.set_user_block_v1(
    '61000000-0000-0000-0000-000000000001', false, null
  ) ->> 'is_blocked')::boolean,
  false,
  'recipient can remove the test block'
);

select is(
  (select count(*)::integer
   from public.list_my_collaboration_requests_v1(
     'accepted', array['accepted']::text[], null, 30
   )),
  1,
  'accepted scope returns the accepted collaboration only'
);
select throws_ok(
  $$select * from public.list_my_collaboration_requests_v1(
    'accepted', array['pending']::text[], null, 30
  )$$,
  '22023',
  'invalid_collaboration_status_filter',
  'accepted scope rejects an incoherent status filter'
);
select throws_ok(
  $$select * from public.list_my_collaboration_requests_v1(
    'received', null, '{"sort_at":"not-a-date","request_id":"bad"}'::jsonb, 30
  )$$,
  '22023',
  'invalid_collaboration_cursor',
  'malformed collaboration cursor is rejected'
);

-- The assertions above prove statement-level atomicity and durable invariants.
-- Competing accept/decline/cancel sessions must additionally be exercised by
-- the multi-connection integration runner; one pgTAP transaction cannot prove
-- row/advisory-lock race behavior without pretending to be concurrent.

select * from finish();
rollback;
