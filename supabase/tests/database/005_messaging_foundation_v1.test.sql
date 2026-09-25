begin;

create extension if not exists pgtap with schema extensions;

-- This suite deliberately exercises the same SECURITY DEFINER RPC surface as
-- the Web/iOS clients. While `role authenticated` is active, it never reads a
-- messaging base table; only RPC results and this transaction-local fixture are
-- queried. Internal state is inspected only after `reset role`.
select plan(104);

-- ---------------------------------------------------------------------------
-- Contract, grants and delete semantics
-- ---------------------------------------------------------------------------

select has_table('public', 'user_blocks', 'block relationship table exists');
select has_table('public', 'content_reports', 'safe reporting ledger exists');
select has_table('public', 'messaging_conversations', 'conversation table exists');
select has_table('public', 'messaging_direct_pairs', 'canonical direct-pair table exists');
select has_table('public', 'messaging_conversation_members', 'conversation membership exists');
select has_table('public', 'messaging_messages', 'message ledger exists');
select has_table('public', 'messaging_message_reactions', 'message reactions exist');
select has_table('public', 'messaging_idempotency_keys', 'idempotency ledger exists');

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.set_user_block_v1(uuid,boolean,text)',
      'public.report_content_v1(text,uuid,text,text,text)',
      'public.list_my_content_reports_v1(timestamp with time zone,integer)',
      'public.get_or_create_direct_conversation_v1(uuid,text)',
      'public.search_messageable_profiles_v1(text,integer)',
      'public.create_group_conversation_v1(text,uuid[],text)',
      'public.list_my_conversation_invitations_v1(integer)',
      'public.respond_to_conversation_invitation_v1(uuid,boolean)',
      'public.list_my_conversations_v1(jsonb,integer,text[],boolean,text)',
      'public.get_conversation_messages_v1(uuid,bigint,integer)',
      'public.get_conversation_members_v1(uuid)',
      'public.send_message_v1(uuid,uuid,text,text,jsonb,uuid)',
      'public.mark_conversation_read_v1(uuid,bigint)',
      'public.set_conversation_preferences_v1(uuid,boolean,timestamp with time zone,boolean,boolean)',
      'public.set_conversation_hidden_v1(uuid,boolean)',
      'public.leave_group_conversation_v1(uuid)',
      'public.set_message_reaction_v1(uuid,text,boolean)'
    ]) as expected(signature)
    where to_regprocedure(expected.signature) is null
  ),
  'all Messaging v1 RPCs exist with their stable signatures'
);

select ok(
  to_regprocedure(
    'public.list_my_conversations_v1(jsonb,integer,text[],boolean,text)'
  ) is not null,
  'inbox filter accepts the p_kinds text[] contract'
);
select ok(
  to_regprocedure(
    'public.list_my_conversations_v1(jsonb,integer,text,boolean,text)'
  ) is null,
  'obsolete scalar kind inbox overload is absent'
);
select ok(
  to_regprocedure('public.toggle_message_reaction_v1(uuid,text)') is null,
  'unsafe reaction toggle RPC is absent'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.content_reports',
      'public.messaging_conversations',
      'public.messaging_direct_pairs',
      'public.messaging_conversation_members',
      'public.messaging_messages',
      'public.messaging_message_reactions',
      'public.messaging_idempotency_keys'
    ]) as private_table(name)
    where has_table_privilege('authenticated', private_table.name, 'select')
  ),
  'authenticated clients cannot select private Messaging tables directly'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.user_blocks',
      'public.content_reports',
      'public.messaging_conversations',
      'public.messaging_direct_pairs',
      'public.messaging_conversation_members',
      'public.messaging_messages',
      'public.messaging_message_reactions',
      'public.messaging_idempotency_keys'
    ]) as private_table(name)
    cross join unnest(array['insert', 'update', 'delete']) as mutation(privilege)
    where has_table_privilege(
      'authenticated', private_table.name, mutation.privilege
    )
  ),
  'authenticated clients cannot mutate Messaging tables directly'
);
select ok(
  has_table_privilege('authenticated', 'public.user_blocks', 'select'),
  'authenticated clients can inspect only their block rows through RLS'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.set_user_block_v1(uuid,boolean,text)',
      'public.report_content_v1(text,uuid,text,text,text)',
      'public.list_my_content_reports_v1(timestamp with time zone,integer)',
      'public.get_or_create_direct_conversation_v1(uuid,text)',
      'public.search_messageable_profiles_v1(text,integer)',
      'public.create_group_conversation_v1(text,uuid[],text)',
      'public.list_my_conversation_invitations_v1(integer)',
      'public.respond_to_conversation_invitation_v1(uuid,boolean)',
      'public.list_my_conversations_v1(jsonb,integer,text[],boolean,text)',
      'public.get_conversation_messages_v1(uuid,bigint,integer)',
      'public.get_conversation_members_v1(uuid)',
      'public.send_message_v1(uuid,uuid,text,text,jsonb,uuid)',
      'public.mark_conversation_read_v1(uuid,bigint)',
      'public.set_conversation_preferences_v1(uuid,boolean,timestamp with time zone,boolean,boolean)',
      'public.set_conversation_hidden_v1(uuid,boolean)',
      'public.leave_group_conversation_v1(uuid)',
      'public.set_message_reaction_v1(uuid,text,boolean)'
    ]) as expected(signature)
    where not has_function_privilege(
      'authenticated', expected.signature, 'execute'
    )
  ),
  'authenticated clients can execute every intended Messaging v1 RPC'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.set_user_block_v1(uuid,boolean,text)',
      'public.report_content_v1(text,uuid,text,text,text)',
      'public.list_my_content_reports_v1(timestamp with time zone,integer)',
      'public.get_or_create_direct_conversation_v1(uuid,text)',
      'public.search_messageable_profiles_v1(text,integer)',
      'public.create_group_conversation_v1(text,uuid[],text)',
      'public.list_my_conversation_invitations_v1(integer)',
      'public.respond_to_conversation_invitation_v1(uuid,boolean)',
      'public.list_my_conversations_v1(jsonb,integer,text[],boolean,text)',
      'public.get_conversation_messages_v1(uuid,bigint,integer)',
      'public.get_conversation_members_v1(uuid)',
      'public.send_message_v1(uuid,uuid,text,text,jsonb,uuid)',
      'public.mark_conversation_read_v1(uuid,bigint)',
      'public.set_conversation_preferences_v1(uuid,boolean,timestamp with time zone,boolean,boolean)',
      'public.set_conversation_hidden_v1(uuid,boolean)',
      'public.leave_group_conversation_v1(uuid)',
      'public.set_message_reaction_v1(uuid,text,boolean)'
    ]) as expected(signature)
    where has_function_privilege('anon', expected.signature, 'execute')
  ),
  'anonymous clients cannot execute authenticated Messaging RPCs'
);
select is(
  (
    select constraint_definition.confdeltype::text
    from pg_constraint constraint_definition
    where constraint_definition.conname =
      'messaging_conversations_created_by_profile_id_fkey'
  ),
  'n',
  'conversation creator is preserved as NULL on profile deletion'
);
select is(
  (
    select constraint_definition.confdeltype::text
    from pg_constraint constraint_definition
    where constraint_definition.conname =
      'messaging_messages_sender_profile_id_fkey'
  ),
  'n',
  'message history preserves a NULL sender on profile deletion'
);
select ok(
  position(
    'last_read_sequence < v_read_sequence'
    in pg_get_functiondef(
      'public.mark_conversation_read_v1(uuid,bigint)'::regprocedure
    )
  ) > 0,
  'mark read skips unchanged cursors to prevent a Realtime invalidation loop'
);

-- ---------------------------------------------------------------------------
-- Four independent authenticated profiles and transaction-local identifiers
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'message-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Message A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '52000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'message-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Message B"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '53000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'message-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Message C"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '54000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'message-d@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Message D"}'::jsonb, now(), now()
  );

create temporary table messaging_test_context (
  direct_id uuid,
  direct_create jsonb,
  message_one_id uuid,
  message_two_id uuid,
  message_three_id uuid,
  group_one_id uuid,
  group_two_id uuid,
  page_one_id uuid,
  page_one_cursor jsonb,
  report_id uuid
);
insert into messaging_test_context default values;
grant select, insert, update, delete on messaging_test_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'message_a', 'Message A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'user A completes onboarding'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'message_b', 'Message B', 'avatar_25', 'beatmaker', 'Paris', 'FR',
    48.8600, 2.3600, false, true
  )$$,
  'user B completes onboarding'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '53000000-0000-0000-0000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'message_c', 'Message C', 'avatar_17', 'dj', 'Paris', 'FR',
    48.8700, 2.3700, false, true
  )$$,
  'user C completes onboarding'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '54000000-0000-0000-0000-000000000004', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'message_d', 'Message D', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8800, 2.3800, false, true
  )$$,
  'user D completes onboarding'
);

reset role;
update public.profiles
set full_name = 'PRIVATE SECRET ALPHA'
where id = '51000000-0000-0000-0000-000000000001';
update public.profiles
set is_ghost_mode = true
where id = '53000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.search_messageable_profiles_v1('message_a', 20)
  ),
  1,
  'profile search finds a public messageable profile'
);
select is(
  (
    select count(*)::integer
    from public.search_messageable_profiles_v1('message_b', 20)
  ),
  0,
  'profile search excludes the current profile'
);
select is(
  (
    select count(*)::integer
    from public.search_messageable_profiles_v1('message_c', 20)
  ),
  0,
  'profile search excludes ghost profiles'
);
select is(
  (
    select count(*)::integer
    from public.search_messageable_profiles_v1('PRIVATE SECRET', 20)
  ),
  0,
  'profile search never searches the private full_name field'
);
select throws_ok(
  $$select * from public.search_messageable_profiles_v1('x', 20)$$,
  '22023',
  'invalid_profile_search',
  'profile search rejects undersized queries'
);

reset role;
update public.profiles
set is_ghost_mode = false
where id = '53000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Direct conversation, idempotent delivery, read state and preferences
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
update messaging_test_context
set direct_create = public.get_or_create_direct_conversation_v1(
      '52000000-0000-0000-0000-000000000002',
      'direct-a-b-0001'
    );
update messaging_test_context
set direct_id = (direct_create ->> 'conversation_id')::uuid;
select is(
  (select (direct_create ->> 'idempotent')::boolean from messaging_test_context),
  false,
  'first direct conversation creation is not a replay'
);
select is(
  (
    public.get_or_create_direct_conversation_v1(
      '52000000-0000-0000-0000-000000000002',
      'direct-a-b-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'same direct conversation request is idempotent'
);
select throws_ok(
  $$select public.get_or_create_direct_conversation_v1(
    '53000000-0000-0000-0000-000000000003',
    'direct-a-b-0001'
  )$$,
  '23505',
  'idempotency_conflict',
  'a direct-conversation key cannot be reused with another recipient'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    public.get_or_create_direct_conversation_v1(
      '51000000-0000-0000-0000-000000000001',
      'direct-b-a-0001'
    ) ->> 'conversation_id'
  ),
  (select direct_id::text from messaging_test_context),
  'the reverse participant order returns the canonical direct conversation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
update messaging_test_context
set message_one_id = (
  public.send_message_v1(
    direct_id,
    '61000000-0000-0000-0000-000000000001',
    'text', 'Premier message', '{}'::jsonb, null
  ) ->> 'message_id'
)::uuid;
select is(
  (
    public.send_message_v1(
      (select direct_id from messaging_test_context),
      '61000000-0000-0000-0000-000000000001',
      'text', 'Premier message', '{}'::jsonb, null
    ) ->> 'idempotent'
  )::boolean,
  true,
  'message retry with the same payload is idempotent'
);
select throws_ok(
  $$select public.send_message_v1(
    (select direct_id from messaging_test_context),
    '61000000-0000-0000-0000-000000000001',
    'text', 'Contenu divergent', '{}'::jsonb, null
  )$$,
  '23505',
  'idempotency_conflict',
  'message key cannot be replayed with a divergent payload'
);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  0,
  'sender never receives an unread count for the sent message'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  1,
  'recipient receives one unread visible message'
);
select is(
  (
    public.mark_conversation_read_v1(
      (select direct_id from messaging_test_context), null
    ) ->> 'last_read_sequence'
  )::bigint,
  1::bigint,
  'mark read advances through the latest message sequence'
);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  0,
  'mark read clears the recipient unread count'
);
update messaging_test_context
set message_two_id = (
  public.send_message_v1(
    direct_id,
    '62000000-0000-0000-0000-000000000002',
    'text', 'Réponse de B', '{}'::jsonb, null
  ) ->> 'message_id'
)::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  1,
  'a reply becomes unread for the other participant'
);
select is(
  (
    select count(*)::integer
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
  ),
  2,
  'message history exposes the two visible messages'
);
select is(
  (
    select body
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
    order by sequence desc
    limit 1
  ),
  'Réponse de B',
  'message history is ordered from the latest sequence'
);
select ok(
  (
    with preference as (
      select public.set_conversation_preferences_v1(
        (select direct_id from messaging_test_context),
        true, now() + interval '1 hour', true, false
      ) as result
    )
    select (result ->> 'pinned_at') is not null
      and (result ->> 'muted_until') is not null
      and (result ->> 'archived_at') is not null
      and not (result ->> 'notifications_enabled')::boolean
    from preference
  ),
  'conversation preferences set the complete explicit state'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  0,
  'archived conversation is removed from the active inbox'
);
select lives_ok(
  $$select public.set_conversation_preferences_v1(
    (select direct_id from messaging_test_context),
    false, null, false, true
  )$$,
  'conversation preferences can be restored explicitly'
);
select is(
  (
    public.set_conversation_hidden_v1(
      (select direct_id from messaging_test_context), true
    ) ->> 'hidden_before_sequence'
  )::bigint,
  2::bigint,
  'hiding a conversation records the current visible history threshold'
);
select is(
  (
    select count(*)::integer
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
  ),
  0,
  'hidden conversation history is absent from the client RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
update messaging_test_context
set message_three_id = (
  public.send_message_v1(
    direct_id,
    '63000000-0000-0000-0000-000000000003',
    'text', 'Nouveau message après masquage', '{}'::jsonb, null
  ) ->> 'message_id'
)::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  1,
  'new post-hide message reappears and is unread'
);
select is(
  (
    select count(*)::integer
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
  ),
  1,
  'post-hide history contains only messages after the threshold'
);
select lives_ok(
  $$select public.set_conversation_hidden_v1(
    (select direct_id from messaging_test_context), false
  )$$,
  'conversation history can be unhidden explicitly'
);
select is(
  (
    select count(*)::integer
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
  ),
  3,
  'unhiding restores all visible history'
);

-- Explicit desired-state reactions are safe to retry.
select is(
  (
    public.set_message_reaction_v1(
      (select message_one_id from messaging_test_context), '✅', true
    ) ->> 'active'
  )::boolean,
  true,
  'reaction can be activated explicitly'
);
select is(
  (
    public.set_message_reaction_v1(
      (select message_one_id from messaging_test_context), '✅', true
    ) ->> 'active'
  )::boolean,
  true,
  'activating an existing reaction is an idempotent desired state'
);
select is(
  (
    select jsonb_array_length(reactions)
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
    where id = (select message_one_id from messaging_test_context)
  ),
  1,
  'message read RPC exposes one active reaction'
);
select is(
  (
    public.set_message_reaction_v1(
      (select message_one_id from messaging_test_context), '✅', false
    ) ->> 'active'
  )::boolean,
  false,
  'reaction can be removed explicitly'
);
select is(
  (
    public.set_message_reaction_v1(
      (select message_one_id from messaging_test_context), '✅', false
    ) ->> 'active'
  )::boolean,
  false,
  'removing an absent reaction remains idempotent'
);
select is(
  (
    select jsonb_array_length(reactions)
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 50
    )
    where id = (select message_one_id from messaging_test_context)
  ),
  0,
  'removed reaction disappears from the safe message projection'
);

-- ---------------------------------------------------------------------------
-- Blocking and reporting
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    public.set_user_block_v1(
      '51000000-0000-0000-0000-000000000001', true, 'safety_test'
    ) ->> 'is_blocked'
  )::boolean,
  true,
  'a user can explicitly block another profile'
);
select is(
  (
    select count(*)::integer
    from public.search_messageable_profiles_v1('message_a', 20)
  ),
  0,
  'blocked profiles are excluded from messageable search'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.send_message_v1(
    (select direct_id from messaging_test_context),
    '64000000-0000-0000-0000-000000000004',
    'text', 'Ce message doit être bloqué', '{}'::jsonb, null
  )$$,
  '42501',
  'blocked_relationship',
  'a block in either direction prevents direct-message delivery'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    public.set_user_block_v1(
      '51000000-0000-0000-0000-000000000001', false, null
    ) ->> 'is_blocked'
  )::boolean,
  false,
  'a block can be removed explicitly'
);
update messaging_test_context
set report_id = (
  public.report_content_v1(
    'message', message_one_id, 'spam', 'Test report', 'report-b-0001'
  ) ->> 'report_id'
)::uuid;
select is(
  (
    public.report_content_v1(
      'message',
      (select message_one_id from messaging_test_context),
      'spam', 'Test report', 'report-b-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'identical report retry is idempotent'
);
select throws_ok(
  $$select public.report_content_v1(
    'message',
    (select message_one_id from messaging_test_context),
    'harassment', 'Test report', 'report-b-0001'
  )$$,
  '23505',
  'idempotency_conflict',
  'report key cannot be reused with a divergent category'
);
select is(
  (select count(*)::integer from public.list_my_content_reports_v1(null, 30)),
  1,
  'reporter can list the safe projection of personal reports'
);
select ok(
  (
    select not (to_jsonb(report_row) ? 'reporter_profile_id')
      and not (to_jsonb(report_row) ? 'resolution_metadata')
    from public.list_my_content_reports_v1(null, 30) report_row
    limit 1
  ),
  'safe report projection excludes reporter and moderation metadata'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '53000000-0000-0000-0000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.report_content_v1(
    'message',
    (select message_one_id from messaging_test_context),
    'spam', null, 'report-c-0001'
  )$$,
  '42501',
  'report_subject_not_found_or_forbidden',
  'non-member cannot report a private conversation message by UUID'
);

-- ---------------------------------------------------------------------------
-- Group invitation consent, filtering and stable cursor pagination
-- ---------------------------------------------------------------------------

-- Blocking between any two requested members must reject the whole group.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '53000000-0000-0000-0000-000000000003', true, 'group_safety_test'
  )$$,
  'B blocks C before a group invitation test'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_group_conversation_v1(
    'Groupe bloqué',
    array[
      '52000000-0000-0000-0000-000000000002',
      '53000000-0000-0000-0000-000000000003'
    ]::uuid[],
    'group-block-0001'
  )$$,
  '42501',
  'blocked_relationship',
  'group creation checks blocks between every requested participant'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '53000000-0000-0000-0000-000000000003', false, null
  )$$,
  'B removes the group test block'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
update messaging_test_context
set group_one_id = (
  public.create_group_conversation_v1(
    'Groupe principal',
    array[
      '52000000-0000-0000-0000-000000000002',
      '53000000-0000-0000-0000-000000000003'
    ]::uuid[],
    'group-main-0001'
  ) ->> 'conversation_id'
)::uuid;
select is(
  (
    public.create_group_conversation_v1(
      'Groupe principal',
      array[
        '53000000-0000-0000-0000-000000000003',
        '52000000-0000-0000-0000-000000000002'
      ]::uuid[],
      'group-main-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'group retry is idempotent across member input order'
);
select throws_ok(
  $$select public.create_group_conversation_v1(
    'Titre divergent',
    array[
      '52000000-0000-0000-0000-000000000002',
      '53000000-0000-0000-0000-000000000003'
    ]::uuid[],
    'group-main-0001'
  )$$,
  '23505',
  'idempotency_conflict',
  'group key cannot be replayed with a divergent title'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.send_message_v1(
    (select group_one_id from messaging_test_context),
    '65000000-0000-0000-0000-000000000005',
    'text', 'Invitation non acceptée', '{}'::jsonb, null
  )$$,
  '42501',
  'not_a_conversation_member',
  'an invited profile cannot send before accepting'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversation_invitations_v1(30)
    where conversation_id = (
      select group_one_id from messaging_test_context
    )
  ),
  1,
  'invited profile sees one pending group invitation'
);
select is(
  (
    public.respond_to_conversation_invitation_v1(
      (select group_one_id from messaging_test_context), true
    ) ->> 'idempotent'
  )::boolean,
  false,
  'first group invitation acceptance changes state'
);
select is(
  (
    public.respond_to_conversation_invitation_v1(
      (select group_one_id from messaging_test_context), true
    ) ->> 'idempotent'
  )::boolean,
  true,
  'repeated group invitation acceptance is idempotent'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '53000000-0000-0000-0000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    public.respond_to_conversation_invitation_v1(
      (select group_one_id from messaging_test_context), false
    ) ->> 'idempotent'
  )::boolean,
  false,
  'first group invitation refusal changes state'
);
select is(
  (
    public.respond_to_conversation_invitation_v1(
      (select group_one_id from messaging_test_context), false
    ) ->> 'idempotent'
  )::boolean,
  true,
  'repeated group invitation refusal is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      null, 30, array['group']::text[], false, null
    )
    where conversation_id = (
      select group_one_id from messaging_test_context
    )
  ),
  0,
  'declined invite never grants group membership'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.get_conversation_members_v1(
      (select group_one_id from messaging_test_context)
    )
  ),
  2,
  'group member projection contains only active members'
);
update messaging_test_context
set group_two_id = (
  public.create_group_conversation_v1(
    'Groupe succession',
    array['54000000-0000-0000-0000-000000000004']::uuid[],
    'group-next-0001'
  ) ->> 'conversation_id'
)::uuid;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '54000000-0000-0000-0000-000000000004', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.respond_to_conversation_invitation_v1(
    (select group_two_id from messaging_test_context), true
  )$$,
  'D accepts the succession group invitation'
);

reset role;
update public.messaging_conversations
set metadata = metadata || jsonb_build_object('managed_by', 'artist_groups_v1')
where id = (select group_two_id from messaging_test_context);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '54000000-0000-0000-0000-000000000004', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.leave_group_conversation_v1(
    (select group_two_id from messaging_test_context)
  )$$,
  '42501',
  'managed_conversation_requires_domain_rpc',
  'generic group leave cannot desynchronize a domain-managed conversation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
  ),
  1,
  'p_kinds direct filter returns only the direct conversation'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      null, 30, array['group']::text[], false, null
    )
  ),
  2,
  'p_kinds group filter returns both active groups'
);
select throws_ok(
  $$select * from public.list_my_conversations_v1(
    null, 30, array['room']::text[], false, null
  )$$,
  '22023',
  'invalid_conversation_kind',
  'p_kinds rejects unsupported conversation kinds'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      null, 30, array['group']::text[], false, 'Groupe principal'
    )
  ),
  1,
  'inbox search filters group titles'
);
select lives_ok(
  $$select public.set_conversation_preferences_v1(
    (select direct_id from messaging_test_context),
    true, null, false, true
  )$$,
  'direct conversation is pinned for deterministic cursor coverage'
);
with first_page as (
  select conversation_id, page_cursor
  from public.list_my_conversations_v1(
    null, 1, array['direct', 'group']::text[], false, null
  )
)
update messaging_test_context context
set page_one_id = first_page.conversation_id,
    page_one_cursor = first_page.page_cursor
from first_page;
select is(
  (select page_one_id from messaging_test_context),
  (select direct_id from messaging_test_context),
  'pinned conversation is the first composite-cursor page'
);
select is(
  (
    select count(*)::integer
    from public.list_my_conversations_v1(
      (select page_one_cursor from messaging_test_context),
      1, array['direct', 'group']::text[], false, null
    )
  ),
  1,
  'composite cursor returns the next page'
);
select isnt(
  (
    select conversation_id
    from public.list_my_conversations_v1(
      (select page_one_cursor from messaging_test_context),
      1, array['direct', 'group']::text[], false, null
    )
  ),
  (select page_one_id from messaging_test_context),
  'composite cursor does not duplicate the prior page'
);
select throws_ok(
  $$select * from public.list_my_conversations_v1(
    '{"pinned":true}'::jsonb,
    30, array['direct', 'group']::text[], false, null
  )$$,
  '22023',
  'invalid_conversation_cursor',
  'incomplete composite cursor is rejected'
);
select is(
  (
    public.leave_group_conversation_v1(
      (select group_one_id from messaging_test_context)
    ) ->> 'transferred_owner_to'
  ),
  '52000000-0000-0000-0000-000000000002',
  'departing owner transfers the group to an active member'
);
select is(
  (
    public.leave_group_conversation_v1(
      (select group_one_id from messaging_test_context)
    ) ->> 'idempotent'
  )::boolean,
  true,
  'repeated group leave is idempotent'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select role
    from public.get_conversation_members_v1(
      (select group_one_id from messaging_test_context)
    )
    where profile_id = '52000000-0000-0000-0000-000000000002'
  ),
  'owner',
  'new owner is visible through the safe member projection'
);

-- ---------------------------------------------------------------------------
-- Moderation invisibility and profile-deletion history preservation
-- ---------------------------------------------------------------------------

reset role;
insert into public.messaging_messages (
  id, conversation_id, sender_profile_id, client_message_id,
  sequence, kind, body, payload, moderation_status
)
select
  '71000000-0000-0000-0000-000000000001', direct_id,
  '52000000-0000-0000-0000-000000000002',
  '72000000-0000-0000-0000-000000000001',
  90, 'text', 'MODERATION HIDDEN SECRET', '{}'::jsonb, 'hidden'
from messaging_test_context;
insert into public.messaging_messages (
  id, conversation_id, sender_profile_id, client_message_id,
  sequence, kind, body, payload, moderation_status
)
select
  '71000000-0000-0000-0000-000000000002', direct_id,
  '51000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000002',
  91, 'text', 'MODERATION QUARANTINE SECRET', '{}'::jsonb, 'quarantined'
from messaging_test_context;
update public.messaging_conversations conversation
set next_sequence = 92,
    last_message_id = '71000000-0000-0000-0000-000000000002',
    last_message_at = now(),
    updated_at = now()
where conversation.id = (select direct_id from messaging_test_context);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.get_conversation_messages_v1(
      (select direct_id from messaging_test_context), null, 100
    )
  ),
  3,
  'hidden and quarantined messages are absent from history RPC'
);
select is(
  (
    select unread_count::integer
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  0,
  'hidden and quarantined messages never increase unread count'
);
select is(
  (
    select last_message_body
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  'Nouveau message après masquage',
  'inbox preview selects the latest visible message, not moderation content'
);

reset role;
delete from public.profiles
where id = '51000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.messaging_conversations conversation
    where conversation.id = (select direct_id from messaging_test_context)
  ),
  1,
  'hard profile deletion preserves the direct conversation history'
);
select is(
  (
    select count(*)::integer
    from public.messaging_conversation_members member
    where member.conversation_id = (
      select direct_id from messaging_test_context
    )
      and member.profile_id = '52000000-0000-0000-0000-000000000002'
      and member.membership_status = 'active'
      and member.left_at is null
  ),
  1,
  'surviving direct participant keeps membership after account deletion'
);
select is(
  (
    select sender_profile_id
    from public.messaging_messages message
    where message.id = (select message_one_id from messaging_test_context)
  ),
  null::uuid,
  'deleted profile messages retain history with an anonymized NULL sender'
);
select is(
  (
    select member.role
    from public.messaging_conversation_members member
    where member.conversation_id = (
      select group_two_id from messaging_test_context
    )
      and member.profile_id = '54000000-0000-0000-0000-000000000004'
  ),
  'owner',
  'profile deletion transfers owned group to an active successor'
);
select ok(
  (
    select conversation.deleted_at is null
    from public.messaging_conversations conversation
    where conversation.id = (select group_two_id from messaging_test_context)
  ),
  'group remains active after its owner profile is deleted'
);
select ok(
  (
    select (conversation.metadata ->> 'has_deleted_participant')::boolean
    from public.messaging_conversations conversation
    where conversation.id = (select direct_id from messaging_test_context)
  ),
  'direct conversation is marked as containing a deleted participant'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '52000000-0000-0000-0000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select title
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  'Compte supprimé',
  'surviving participant receives a stable deleted-account title'
);
select is(
  (
    select counterpart_profile_id
    from public.list_my_conversations_v1(
      null, 30, array['direct']::text[], false, null
    )
    where conversation_id = (
      select direct_id from messaging_test_context
    )
  ),
  null::uuid,
  'deleted direct counterpart is never exposed as a stale profile UUID'
);

-- Advisory-lock race guarantees need independent database sessions. They are
-- intentionally covered by a separate multi-connection integration runner;
-- a single pgTAP transaction must not pretend to prove concurrency safety.

select * from finish();
rollback;
