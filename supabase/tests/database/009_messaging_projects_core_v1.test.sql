begin;

create extension if not exists pgtap with schema extensions;
select plan(83);

-- 01-06: durable core tables.
select has_table('public', 'creative_projects', 'project authority root exists');
select has_table('public', 'creative_project_members', 'project membership ledger exists');
select has_table('public', 'creative_project_invitations', 'project invitation ledger exists');
select has_table('public', 'creative_project_conversations', 'project chat link exists');
select has_table('public', 'creative_project_tasks', 'project task ledger exists');
select has_table('public', 'creative_project_activity', 'append-only project activity exists');

-- 07-13: browser security boundary and RPC contract.
select ok(
  (
    select bool_and(class.relrowsecurity)
    from pg_class class
    where class.oid in (
      'public.creative_projects'::regclass,
      'public.creative_project_members'::regclass,
      'public.creative_project_invitations'::regclass,
      'public.creative_project_conversations'::regclass,
      'public.creative_project_tasks'::regclass,
      'public.creative_project_activity'::regclass
    )
  ),
  'all private project tables have RLS enabled'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.creative_projects',
      'public.creative_project_members',
      'public.creative_project_invitations',
      'public.creative_project_conversations',
      'public.creative_project_tasks',
      'public.creative_project_activity'
    ]) private_table(name)
    where has_table_privilege('authenticated', private_table.name, 'select')
  ),
  'authenticated cannot read raw project tables'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.creative_projects',
      'public.creative_project_members',
      'public.creative_project_invitations',
      'public.creative_project_conversations',
      'public.creative_project_tasks',
      'public.creative_project_activity'
    ]) private_table(name)
    cross join unnest(array['insert', 'update', 'delete']) mutation(privilege)
    where has_table_privilege('authenticated', private_table.name, mutation.privilege)
  ),
  'authenticated cannot mutate raw project tables'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_my_creative_projects_v1(jsonb,integer,text[],text)',
      'public.get_creative_project_workspace_v1(uuid)',
      'public.list_my_creative_project_invitations_v1(text,text[],jsonb,integer)',
      'public.create_creative_project_v1(text,text,text,integer,text,text,timestamptz,text,text)',
      'public.update_creative_project_v1(uuid,text,text,text,integer,text,text,timestamptz,text,timestamptz)',
      'public.invite_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text)',
      'public.respond_to_creative_project_invitation_v1(uuid,text,text)',
      'public.cancel_creative_project_invitation_v1(uuid)',
      'public.update_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean)',
      'public.transfer_creative_project_ownership_v1(uuid,uuid)',
      'public.remove_or_leave_creative_project_v1(uuid,uuid)',
      'public.upsert_creative_project_task_v1(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz)',
      'public.delete_creative_project_task_v1(uuid,uuid)',
      'public.set_creative_project_status_v1(uuid,text,timestamptz)',
      'public.delete_creative_project_v1(uuid)'
    ]) rpc(signature)
    where to_regprocedure(rpc.signature) is null
  ),
  'every intended project RPC exists'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_my_creative_projects_v1(jsonb,integer,text[],text)',
      'public.get_creative_project_workspace_v1(uuid)',
      'public.list_my_creative_project_invitations_v1(text,text[],jsonb,integer)',
      'public.create_creative_project_v1(text,text,text,integer,text,text,timestamptz,text,text)',
      'public.update_creative_project_v1(uuid,text,text,text,integer,text,text,timestamptz,text,timestamptz)',
      'public.invite_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text)',
      'public.respond_to_creative_project_invitation_v1(uuid,text,text)',
      'public.cancel_creative_project_invitation_v1(uuid)',
      'public.update_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean)',
      'public.transfer_creative_project_ownership_v1(uuid,uuid)',
      'public.remove_or_leave_creative_project_v1(uuid,uuid)',
      'public.upsert_creative_project_task_v1(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz)',
      'public.delete_creative_project_task_v1(uuid,uuid)',
      'public.set_creative_project_status_v1(uuid,text,timestamptz)',
      'public.delete_creative_project_v1(uuid)'
    ]) rpc(signature)
    where not has_function_privilege('authenticated', rpc.signature, 'execute')
  ),
  'authenticated can execute the narrow project RPC surface'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_my_creative_projects_v1(jsonb,integer,text[],text)',
      'public.get_creative_project_workspace_v1(uuid)',
      'public.list_my_creative_project_invitations_v1(text,text[],jsonb,integer)',
      'public.create_creative_project_v1(text,text,text,integer,text,text,timestamptz,text,text)',
      'public.update_creative_project_v1(uuid,text,text,text,integer,text,text,timestamptz,text,timestamptz)',
      'public.invite_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text)',
      'public.respond_to_creative_project_invitation_v1(uuid,text,text)',
      'public.cancel_creative_project_invitation_v1(uuid)',
      'public.update_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean)',
      'public.transfer_creative_project_ownership_v1(uuid,uuid)',
      'public.remove_or_leave_creative_project_v1(uuid,uuid)',
      'public.upsert_creative_project_task_v1(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz)',
      'public.delete_creative_project_task_v1(uuid,uuid)',
      'public.set_creative_project_status_v1(uuid,text,timestamptz)',
      'public.delete_creative_project_v1(uuid)'
    ]) rpc(signature)
    where has_function_privilege('anon', rpc.signature, 'execute')
  ),
  'anonymous cannot execute project RPCs'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.messaging_projects_touch_updated_at_v1()',
      'public.messaging_project_is_active_member_v1(uuid,uuid)',
      'public.messaging_project_has_permission_v1(uuid,text,uuid)',
      'public.messaging_project_append_activity_v1(uuid,uuid,text,uuid,uuid,jsonb)',
      'public.messaging_project_profile_name_v1(uuid)',
      'public.messaging_projects_prepare_profile_delete_v1()'
    ]) helper(signature)
    where has_function_privilege('authenticated', helper.signature, 'execute')
       or has_function_privilege('anon', helper.signature, 'execute')
  ),
  'browser roles cannot execute internal project helpers'
);

create temporary table messaging_projects_test_context (
  key text primary key,
  id uuid,
  value jsonb
);
grant select, insert, update, delete on messaging_projects_test_context to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'project-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Project Owner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'project-member@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Project Member"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '83000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'project-outsider@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Project Outsider"}'::jsonb, now(), now()
  );

-- 14-16: three valid profiles.
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'project_owner', 'Project Owner', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'project owner completes onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'project_member', 'Project Member', 'avatar_25', 'beatmaker', 'Paris', 'FR',
    48.8600, 2.3600, false, true
  )$$,
  'project member completes onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'project_outsider', 'Project Outsider', 'avatar_17', 'dj', 'Paris', 'FR',
    48.8700, 2.3700, false, true
  )$$,
  'project outsider completes onboarding'
);

-- 17-29: owner atomically creates project, membership and project chat.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into messaging_projects_test_context(key, value)
    values ('created', public.create_creative_project_v1(
      'Aurora Tapes', 'Projet nocturne', 'Ambient', 92, 'Dm',
      'Finaliser le master', null, 'Mix v2', 'project-create-stable-0001'
    ))$$,
  'owner can atomically create a project'
);
insert into messaging_projects_test_context(key, id)
select 'project', (value ->> 'project_id')::uuid
from messaging_projects_test_context where key = 'created';
insert into messaging_projects_test_context(key, id)
select 'conversation', (value ->> 'conversation_id')::uuid
from messaging_projects_test_context where key = 'created';
select is(
  (select (value ->> 'idempotent')::boolean from messaging_projects_test_context where key = 'created'),
  false,
  'first project creation is not a replay'
);

reset role;
select is(
  (select owner_profile_id from public.creative_projects where id = (select id from messaging_projects_test_context where key = 'project')),
  '81000000-0000-4000-8000-000000000001'::uuid,
  'project stores its owner authority root'
);
select is(
  (select authority_role from public.creative_project_members
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and profile_id = '81000000-0000-4000-8000-000000000001'),
  'owner',
  'project owner membership is created atomically'
);
select is(
  (select kind from public.messaging_conversations
   where id = (select id from messaging_projects_test_context where key = 'conversation')),
  'project',
  'atomic chat uses the project conversation kind'
);
select is(
  (select conversation_id from public.creative_project_conversations
   where project_id = (select id from messaging_projects_test_context where key = 'project')),
  (select id from messaging_projects_test_context where key = 'conversation'),
  'project points to exactly one durable conversation'
);
select is(
  (select role from public.messaging_conversation_members
   where conversation_id = (select id from messaging_projects_test_context where key = 'conversation')
     and profile_id = '81000000-0000-4000-8000-000000000001'),
  'owner',
  'project owner is also conversation owner'
);
select is(
  (select count(*)::integer from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and event_type = 'project_created'),
  1,
  'project creation appends one immutable activity event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.create_creative_project_v1(
    'Aurora Tapes', 'Projet nocturne', 'Ambient', 92, 'Dm',
    'Finaliser le master', null, 'Mix v2', 'project-create-stable-0001'
  ) ->> 'idempotent')::boolean,
  true,
  'project creation safely replays with the same idempotency key'
);
select is(
  (public.create_creative_project_v1(
    'Aurora Tapes', 'Projet nocturne', 'Ambient', 92, 'Dm',
    'Finaliser le master', null, 'Mix v2', 'project-create-stable-0001'
  ) ->> 'project_id')::uuid,
  (select id from messaging_projects_test_context where key = 'project'),
  'project creation replay returns the original project'
);
select throws_ok(
  $$select public.create_creative_project_v1(
    'Different payload', '', null, null, null, null, null, null,
    'project-create-stable-0001'
  )$$,
  '23505',
  'idempotency_conflict',
  'an idempotency key cannot be reused with another project payload'
);
select is(
  (select count(*)::integer from public.list_my_creative_projects_v1()),
  1,
  'owner sees the project through the bounded list RPC'
);
select is(
  (public.get_creative_project_workspace_v1(
    (select id from messaging_projects_test_context where key = 'project')
  ) #>> '{membership,authority_role}'),
  'owner',
  'workspace projection includes current authority without raw table access'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select public.get_creative_project_workspace_v1(%L::uuid)',
    (select id from messaging_projects_test_context where key = 'project')
  ),
  '42501',
  'project_not_found_or_forbidden',
  'outsider cannot inspect a private project workspace'
);

-- 30-57: invitation, block graph, delegated permissions, chat and tasks.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into messaging_projects_test_context(key, value)
    values ('invitation', public.invite_creative_project_member_v1(
      (select id from messaging_projects_test_context where key = 'project'),
      '82000000-0000-4000-8000-000000000002',
      'contributor', 'Beatmaker', true, true, false, true, true,
      'project-invite-stable-0001'
    ))$$,
  'owner can invite a project member with explicit permissions'
);
insert into messaging_projects_test_context(key, id)
select 'invitation_id', (value ->> 'invitation_id')::uuid
from messaging_projects_test_context where key = 'invitation';

reset role;
select is(
  (select status from public.creative_project_invitations
   where id = (select id from messaging_projects_test_context where key = 'invitation_id')),
  'pending',
  'project invitation is pending before its recipient responds'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.invite_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002',
    'contributor', 'Beatmaker', true, true, false, true, true,
    'project-invite-stable-0001'
  ) ->> 'idempotent')::boolean,
  true,
  'project invitation safely replays'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.list_my_creative_project_invitations_v1()),
  1,
  'recipient sees its pending invitation through a bounded projection'
);
select lives_ok(
  $$insert into messaging_projects_test_context(key, value)
    values ('accepted', public.respond_to_creative_project_invitation_v1(
      (select id from messaging_projects_test_context where key = 'invitation_id'),
      'accept', 'project-accept-stable-0001'
    ))$$,
  'recipient can atomically accept project membership and chat access'
);

reset role;
select is(
  (select status from public.creative_project_invitations
   where id = (select id from messaging_projects_test_context where key = 'invitation_id')),
  'accepted',
  'accepted project invitation is persisted'
);
select ok(
  exists (
    select 1 from public.creative_project_members
    where project_id = (select id from messaging_projects_test_context where key = 'project')
      and profile_id = '82000000-0000-4000-8000-000000000002'
      and authority_role = 'contributor'
      and can_edit and can_invite and can_manage_stems and can_create_tasks
      and not can_manage_members
      and left_at is null
  ),
  'accepted member receives exactly the proposed project permissions'
);
select ok(
  exists (
    select 1 from public.messaging_conversation_members
    where conversation_id = (select id from messaging_projects_test_context where key = 'conversation')
      and profile_id = '82000000-0000-4000-8000-000000000002'
      and role = 'member' and membership_status = 'active' and left_at is null
  ),
  'accepted member is atomically added to project chat'
);
select is(
  (select count(*)::integer from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and event_type = 'invitation_accepted'),
  1,
  'invitation acceptance appends one activity event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '83000000-0000-4000-8000-000000000003', true, 'project_member_graph_test'
  )$$,
  'owner blocks the prospective member before delegated invitation coverage'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.invite_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '83000000-0000-4000-8000-000000000003',
    'viewer', null, false, false, false, false, false,
    'project-member-blocked-0001'
  )$$,
  '42501',
  'blocked_relationship',
  'delegated invitation checks the invitee against every active project member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '83000000-0000-4000-8000-000000000003', false, null
  )$$,
  'owner removes the project invitation test block'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.invite_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '83000000-0000-4000-8000-000000000003',
    'contributor', null, false, false, true, false, false,
    'project-member-escalate-0001'
  )$$,
  '42501',
  'delegated_permissions_exceeded',
  'can-invite alone cannot grant a permission the inviter does not hold'
);
select lives_ok(
  $$insert into messaging_projects_test_context(key, value)
    values ('outsider_invitation', public.invite_creative_project_member_v1(
      (select id from messaging_projects_test_context where key = 'project'),
      '83000000-0000-4000-8000-000000000003',
      'viewer', null, false, false, false, false, false,
      'project-member-viewer-0001'
    ))$$,
  'delegated inviter can issue a least-privilege viewer invitation'
);
insert into messaging_projects_test_context(key, id)
select 'outsider_invitation_id', (value ->> 'invitation_id')::uuid
from messaging_projects_test_context where key = 'outsider_invitation';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '83000000-0000-4000-8000-000000000003', true, 'project_accept_graph_test'
  )$$,
  'owner blocks the invitee after the invitation was issued'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.respond_to_creative_project_invitation_v1(
    (select id from messaging_projects_test_context where key = 'outsider_invitation_id'),
    'accept', 'project-outsider-accept-0001'
  )$$,
  '42501',
  'blocked_relationship',
  'acceptance rechecks the invitee against every active project member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_user_block_v1(
    '83000000-0000-4000-8000-000000000003', false, null
  )$$,
  'owner removes the acceptance test block'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.respond_to_creative_project_invitation_v1(
    (select id from messaging_projects_test_context where key = 'outsider_invitation_id'),
    'accept', 'project-outsider-accept-0001'
  )$$,
  'viewer can accept once the complete project member graph is safe'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002',
    'contributor', 'Beatmaker', true, true, true, true, true
  )$$,
  'owner can explicitly grant project member-management authority'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.update_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002',
    'admin', 'Beatmaker', true, true, true, true, true
  )$$,
  '42501',
  'self_member_update_forbidden',
  'project manager cannot use member management to elevate itself'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.list_my_creative_projects_v1()),
  1,
  'accepted member sees the project in its own list'
);
select lives_ok(
  format(
    'select public.send_message_v1(%L::uuid, %L::uuid, ''text'', ''Le mix est prêt'', ''{"domain":"creative_project"}''::jsonb, null)',
    (select id from messaging_projects_test_context where key = 'conversation'),
    '84000000-0000-4000-8000-000000000001'
  ),
  'accepted project member can send text through the shared chat contract'
);

reset role;
select is(
  (select count(*)::integer from public.messaging_messages
   where conversation_id = (select id from messaging_projects_test_context where key = 'conversation')
     and sender_profile_id = '82000000-0000-4000-8000-000000000002'
     and body = 'Le mix est prêt'),
  1,
  'project chat message is linked to the project conversation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.upsert_creative_project_task_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '85000000-0000-4000-8000-000000000001',
    'Valider le mix', '', null, 'in_progress', null, null
  )$$,
  'member with task permission can create a task using a durable client id'
);

reset role;
select is(
  (select title from public.creative_project_tasks
   where id = '85000000-0000-4000-8000-000000000001'),
  'Valider le mix',
  'project task is persisted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.upsert_creative_project_task_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '85000000-0000-4000-8000-000000000001',
    'Valider le mix', '', null, 'in_progress', null, null
  ) ->> 'idempotent')::boolean,
  true,
  'task retry is idempotent with the same client task id and payload'
);

reset role;
select is(
  (select count(*)::integer from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and event_type = 'task_created'),
  1,
  'task retry does not duplicate append-only activity'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select public.set_creative_project_status_v1(%L::uuid, ''completed'', null)',
    (select id from messaging_projects_test_context where key = 'project')
  ),
  '42501',
  'permission_denied',
  'contributor cannot complete a project without admin authority'
);

-- 58-72: role elevation, status, transfer, leave and soft deletion.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_creative_project_member_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002',
    'admin', 'Beatmaker', true, true, true, true, true
  )$$,
  'owner can promote a member to project admin'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_creative_project_status_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    'completed', null
  )$$,
  'project admin can complete the project'
);

reset role;
select is(
  (select count(*)::integer from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and event_type = 'project_completed'),
  1,
  'project completion appends an activity event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.transfer_creative_project_ownership_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002'
  )$$,
  'owner can transfer ownership to an active project member'
);
select is(
  (public.transfer_creative_project_ownership_v1(
    (select id from messaging_projects_test_context where key = 'project'),
    '82000000-0000-4000-8000-000000000002'
  ) ->> 'idempotent')::boolean,
  true,
  'lost ownership-transfer response can be retried idempotently'
);

reset role;
select is(
  (select owner_profile_id from public.creative_projects
   where id = (select id from messaging_projects_test_context where key = 'project')),
  '82000000-0000-4000-8000-000000000002'::uuid,
  'transferred project stores the new owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.remove_or_leave_creative_project_v1(
    (select id from messaging_projects_test_context where key = 'project'), null
  )$$,
  'former owner can leave after transferring ownership'
);
select is(
  (public.remove_or_leave_creative_project_v1(
    (select id from messaging_projects_test_context where key = 'project'), null
  ) ->> 'idempotent')::boolean,
  true,
  'project leave can be retried after a lost response'
);
select is(
  (select count(*)::integer from public.list_my_creative_projects_v1()),
  0,
  'former member no longer sees the project after leaving'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.delete_creative_project_v1(
    (select id from messaging_projects_test_context where key = 'project')
  )$$,
  'current owner can soft-delete the project and linked chat'
);

reset role;
select ok(
  (select deleted_at is not null from public.creative_projects
   where id = (select id from messaging_projects_test_context where key = 'project')),
  'project deletion is a recoverable soft deletion'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.list_my_creative_projects_v1()),
  0,
  'deleted project disappears from the member list projection'
);

reset role;
select is(
  (select count(*)::integer from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'project')
     and event_type = 'project_deleted'),
  1,
  'project deletion remains visible in the append-only server ledger'
);
select ok(
  not has_table_privilege('service_role', 'public.creative_project_activity', 'update')
  and not has_table_privilege('service_role', 'public.creative_project_activity', 'delete'),
  'service role cannot rewrite or delete append-only project activity'
);

-- 73-83: profile deletion reconciles divergent Project/chat succession.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into messaging_projects_test_context(key, value)
    values ('profile-delete-created', public.create_creative_project_v1(
      'Succession Lab', 'Project owner deletion coverage', 'Electronic', 118, 'Am',
      'Preserve one durable chat owner', null, 'Authority review',
      'project-profile-delete-stable-0001'
    ))$$,
  'owner creates the project used for profile-deletion succession coverage'
);

reset role;
insert into messaging_projects_test_context(key, id)
select 'profile-delete-project', (value ->> 'project_id')::uuid
from messaging_projects_test_context where key = 'profile-delete-created';
insert into messaging_projects_test_context(key, id)
select 'profile-delete-conversation', (value ->> 'conversation_id')::uuid
from messaging_projects_test_context where key = 'profile-delete-created';

-- The older contributor would win an age-only succession, while the newer
-- Project admin must win the Project authority order.
insert into public.creative_project_members (
  project_id, profile_id, authority_role, artistic_role,
  can_edit, can_invite, can_manage_members, can_manage_stems, can_create_tasks,
  joined_at
) values
  (
    (select id from messaging_projects_test_context where key = 'profile-delete-project'),
    '82000000-0000-4000-8000-000000000002',
    'contributor', 'Producer', true, false, false, true, true,
    now() - interval '30 days'
  ),
  (
    (select id from messaging_projects_test_context where key = 'profile-delete-project'),
    '83000000-0000-4000-8000-000000000003',
    'admin', 'Director', true, true, true, true, true,
    now() - interval '1 day'
  );

update public.messaging_conversation_members
set role = 'member', updated_at = now()
where conversation_id = (
  select id from messaging_projects_test_context where key = 'profile-delete-conversation'
)
  and profile_id = '81000000-0000-4000-8000-000000000001';

insert into public.messaging_conversation_members (
  conversation_id, profile_id, role, joined_at, membership_status
) values
  (
    (select id from messaging_projects_test_context where key = 'profile-delete-conversation'),
    '82000000-0000-4000-8000-000000000002',
    'owner', now() - interval '30 days', 'active'
  ),
  (
    (select id from messaging_projects_test_context where key = 'profile-delete-conversation'),
    '83000000-0000-4000-8000-000000000003',
    'member', now() - interval '1 day', 'active'
  );

select is(
  (select authority_role
   from public.creative_project_members
   where project_id = (select id from messaging_projects_test_context where key = 'profile-delete-project')
     and profile_id = '83000000-0000-4000-8000-000000000003'),
  'admin',
  'newer successor has the stronger Project authority before deletion'
);
select is(
  (select profile_id
   from public.messaging_conversation_members
   where conversation_id = (select id from messaging_projects_test_context where key = 'profile-delete-conversation')
     and membership_status = 'active'
     and left_at is null
     and role = 'owner'
   order by profile_id
   limit 1),
  '82000000-0000-4000-8000-000000000002'::uuid,
  'conversation begins with another already-promoted active owner'
);

select lives_ok(
  $$delete from public.profiles
    where id = '81000000-0000-4000-8000-000000000001'$$,
  'hard owner-profile deletion reconciles Project and conversation succession'
);
select is(
  (select owner_profile_id
   from public.creative_projects
   where id = (select id from messaging_projects_test_context where key = 'profile-delete-project')),
  '83000000-0000-4000-8000-000000000003'::uuid,
  'Project authority promotes the admin even though the contributor is older'
);
select is(
  (select count(*)::integer
   from public.creative_project_members
   where project_id = (select id from messaging_projects_test_context where key = 'profile-delete-project')
     and left_at is null
     and authority_role = 'owner'),
  1,
  'surviving Project has exactly one active authority owner'
);
select is(
  (select authority_role
   from public.creative_project_members
   where project_id = (select id from messaging_projects_test_context where key = 'profile-delete-project')
     and profile_id = '83000000-0000-4000-8000-000000000003'),
  'owner',
  'Project-selected successor receives owner authority'
);
select is(
  (select count(*)::integer
   from public.messaging_conversation_members
   where conversation_id = (select id from messaging_projects_test_context where key = 'profile-delete-conversation')
     and membership_status = 'active'
     and left_at is null
     and role = 'owner'
   order by profile_id
   limit 1),
  1,
  'surviving Project conversation has exactly one active owner'
);
select is(
  (select profile_id
   from public.messaging_conversation_members
   where conversation_id = (select id from messaging_projects_test_context where key = 'profile-delete-conversation')
     and membership_status = 'active'
     and left_at is null
     and role = 'owner'),
  '83000000-0000-4000-8000-000000000003'::uuid,
  'Project-selected successor is also the sole active conversation owner'
);
select is(
  (select role
   from public.messaging_conversation_members
   where conversation_id = (select id from messaging_projects_test_context where key = 'profile-delete-conversation')
     and profile_id = '82000000-0000-4000-8000-000000000002'),
  'member',
  'previously promoted conversation owner is cleanly demoted from Project authority'
);
select is(
  (select count(*)::integer
   from public.creative_project_activity
   where project_id = (select id from messaging_projects_test_context where key = 'profile-delete-project')
     and event_type = 'ownership_transferred'
     and subject_profile_id = '83000000-0000-4000-8000-000000000003'),
  1,
  'profile deletion records one ownership transfer to the reconciled successor'
);

select * from finish();
rollback;
