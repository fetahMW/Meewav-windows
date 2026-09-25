begin;

create extension if not exists pgtap with schema extensions;
select plan(58);

-- ---------------------------------------------------------------------------
-- Contract and least privilege
-- ---------------------------------------------------------------------------

select has_table('public', 'artist_groups', 'artist groups table exists');
select has_table('public', 'artist_group_members', 'artist group roster exists');
select has_table('public', 'artist_group_invitations', 'artist group invitations exist');
select has_table('public', 'artist_group_activity', 'artist group activity exists');
select has_table('public', 'artist_group_idempotency', 'artist group idempotency ledger exists');
select has_column('public', 'artist_group_members', 'authority_role', 'authority role is explicit');
select has_column('public', 'artist_group_members', 'artistic_role', 'artistic role is independent');

select ok(
  not exists (
    select 1 from unnest(array[
      'public.create_artist_group_v1(text,text,text,text,text)',
      'public.list_my_artist_groups_v1(text,jsonb,integer)',
      'public.get_artist_group_detail_v1(uuid)',
      'public.list_artist_group_activity_v1(uuid,jsonb,integer)',
      'public.list_my_artist_group_invitations_v1(jsonb,integer)',
      'public.invite_artist_group_member_v1(uuid,uuid,text,text,text)',
      'public.respond_to_artist_group_invitation_v1(uuid,text,text)',
      'public.cancel_artist_group_invitation_v1(uuid,text)',
      'public.update_artist_group_v1(uuid,text,text,text,text)',
      'public.set_my_artist_group_preferences_v1(uuid,boolean,text,boolean,text)',
      'public.set_artist_group_authority_role_v1(uuid,uuid,text,text)',
      'public.set_artist_group_artistic_role_v1(uuid,uuid,text,text)',
      'public.transfer_artist_group_ownership_v1(uuid,uuid,text,text)',
      'public.remove_artist_group_member_v1(uuid,uuid,text)',
      'public.leave_artist_group_v1(uuid,text)',
      'public.set_artist_group_archived_v1(uuid,boolean,text)',
      'public.delete_artist_group_v1(uuid,text,text)'
    ]) as expected(signature)
    where to_regprocedure(expected.signature) is null
  ),
  'all Artist Groups v1 RPCs exist'
);

select ok(
  not exists (
    select 1 from unnest(array[
      'public.artist_groups', 'public.artist_group_members',
      'public.artist_group_invitations', 'public.artist_group_activity',
      'public.artist_group_idempotency'
    ]) as private_table(name)
    where has_table_privilege('authenticated', private_table.name, 'select')
  ),
  'authenticated cannot select raw Artist Group tables'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.artist_groups', 'public.artist_group_members',
      'public.artist_group_invitations', 'public.artist_group_activity',
      'public.artist_group_idempotency'
    ]) as private_table(name)
    cross join unnest(array['insert', 'update', 'delete']) mutation(privilege)
    where has_table_privilege('authenticated', private_table.name, mutation.privilege)
  ),
  'authenticated cannot mutate raw Artist Group tables'
);
select ok(
  (
    select bool_and(class.relrowsecurity)
    from pg_class class
    where class.oid in (
      'public.artist_groups'::regclass,
      'public.artist_group_members'::regclass,
      'public.artist_group_invitations'::regclass,
      'public.artist_group_activity'::regclass,
      'public.artist_group_idempotency'::regclass
    )
  ),
  'all raw Artist Group tables have RLS enabled'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.create_artist_group_v1(text,text,text,text,text)',
      'public.list_my_artist_groups_v1(text,jsonb,integer)',
      'public.get_artist_group_detail_v1(uuid)',
      'public.list_artist_group_activity_v1(uuid,jsonb,integer)',
      'public.list_my_artist_group_invitations_v1(jsonb,integer)',
      'public.invite_artist_group_member_v1(uuid,uuid,text,text,text)',
      'public.respond_to_artist_group_invitation_v1(uuid,text,text)',
      'public.cancel_artist_group_invitation_v1(uuid,text)',
      'public.update_artist_group_v1(uuid,text,text,text,text)',
      'public.set_my_artist_group_preferences_v1(uuid,boolean,text,boolean,text)',
      'public.set_artist_group_authority_role_v1(uuid,uuid,text,text)',
      'public.set_artist_group_artistic_role_v1(uuid,uuid,text,text)',
      'public.transfer_artist_group_ownership_v1(uuid,uuid,text,text)',
      'public.remove_artist_group_member_v1(uuid,uuid,text)',
      'public.leave_artist_group_v1(uuid,text)',
      'public.set_artist_group_archived_v1(uuid,boolean,text)',
      'public.delete_artist_group_v1(uuid,text,text)'
    ]) rpc(signature)
    where not has_function_privilege('authenticated', rpc.signature, 'execute')
  ),
  'authenticated can execute the intended RPC surface'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.create_artist_group_v1(text,text,text,text,text)',
      'public.list_my_artist_groups_v1(text,jsonb,integer)',
      'public.get_artist_group_detail_v1(uuid)',
      'public.invite_artist_group_member_v1(uuid,uuid,text,text,text)',
      'public.respond_to_artist_group_invitation_v1(uuid,text,text)',
      'public.delete_artist_group_v1(uuid,text,text)'
    ]) rpc(signature)
    where has_function_privilege('anon', rpc.signature, 'execute')
  ),
  'anonymous clients cannot execute Artist Group RPCs'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.artist_group_activity'::regclass
      and tgname = 'artist_group_activity_immutable'
      and not tgisinternal
  ),
  'activity immutability trigger exists'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'artist_group_members'
      and indexname = 'artist_group_one_active_owner_idx'
  ),
  'one-active-owner invariant is indexed'
);
select ok(
  position(
    'jsonb_build_object' in pg_get_functiondef(
      'public.create_artist_group_v1(text,text,text,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'concat_ws' in pg_get_functiondef(
      'public.create_artist_group_v1(text,text,text,text,text)'::regprocedure
    )
  ) = 0,
  'group creation hashes a canonical structured payload without delimiter collisions'
);
select ok(
  position(
    'jsonb_build_object' in pg_get_functiondef(
      'public.invite_artist_group_member_v1(uuid,uuid,text,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'concat_ws' in pg_get_functiondef(
      'public.invite_artist_group_member_v1(uuid,uuid,text,text,text)'::regprocedure
    )
  ) = 0,
  'group invitations hash a canonical structured payload without delimiter collisions'
);
select ok(
  to_regclass('public.artist_group_sessions') is null
  and to_regclass('public.artist_group_votes') is null
  and to_regclass('public.artist_group_project_links') is null,
  'sessions, votes and project links are outside this phase'
);

-- ---------------------------------------------------------------------------
-- Three authenticated fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'group-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Group A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'group-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Group B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '73000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'group-c@example.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Group C"}'::jsonb, now(), now());

create temporary table artist_group_test_context (
  group_id uuid,
  conversation_id uuid,
  invitation_b uuid,
  invitation_c uuid,
  create_result jsonb,
  respond_result jsonb
);
insert into artist_group_test_context default values;
grant select, insert, update, delete on artist_group_test_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1('group_a', 'Group A', 'avatar_7', 'pianist', 'Paris', 'FR', 48.85, 2.35, false, true)$$,
  'owner completes onboarding'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1('group_b', 'Group B', 'avatar_25', 'beatmaker', 'Paris', 'FR', 48.86, 2.36, false, true)$$,
  'member B completes onboarding'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1('group_c', 'Group C', 'avatar_17', 'dj', 'Paris', 'FR', 48.87, 2.37, false, true)$$,
  'member C completes onboarding'
);

-- ---------------------------------------------------------------------------
-- Atomic create + safe projections + idempotency
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update artist_group_test_context
set create_result = public.create_artist_group_v1(
  'Collectif Horizon', 'Création collaborative', 'discoverable', 'Pianiste', 'group-create-0001'
);
update artist_group_test_context
set group_id = (create_result ->> 'group_id')::uuid,
    conversation_id = (create_result ->> 'conversation_id')::uuid;
select ok((select group_id is not null and conversation_id is not null from artist_group_test_context), 'create returns linked identifiers');

reset role;
select is(
  (select conversation.kind from public.messaging_conversations conversation
   join artist_group_test_context context on context.conversation_id = conversation.id),
  'group', 'linked Messaging conversation is a group'
);
select is(
  (select member.authority_role from public.artist_group_members member
   join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '71000000-0000-4000-8000-000000000001'),
  'owner', 'creator is the active authority owner'
);
select is(
  (select member.artistic_role from public.artist_group_members member
   join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '71000000-0000-4000-8000-000000000001'),
  'Pianiste', 'artistic role is stored separately from authority'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.list_my_artist_groups_v1('active', null, 30)), 1, 'owner list contains the group');
select is(
  jsonb_array_length(public.get_artist_group_detail_v1((select group_id from artist_group_test_context)) -> 'members'),
  1, 'detail returns the initial owner roster'
);
select is(
  (public.create_artist_group_v1('Collectif Horizon', 'Création collaborative', 'discoverable', 'Pianiste', 'group-create-0001') ->> 'group_id')::uuid,
  (select group_id from artist_group_test_context), 'create replay returns the same group'
);
select throws_ok(
  $$select public.create_artist_group_v1('Autre collectif', null, 'private', null, 'group-create-0001')$$,
  '23505', 'idempotency_conflict', 'create key cannot be reused for another payload'
);

-- ---------------------------------------------------------------------------
-- Invite B, accept atomically into both rosters, then roles/preferences
-- ---------------------------------------------------------------------------

update artist_group_test_context set invitation_b = (
  public.invite_artist_group_member_v1(
    (select group_id from artist_group_test_context),
    '72000000-0000-4000-8000-000000000002', 'Beatmaker', 'Bienvenue', 'group-invite-b-0001'
  ) ->> 'invitation_id'
)::uuid;
select ok((select invitation_b is not null from artist_group_test_context), 'owner creates invitation B');
reset role;
select is(
  (select count(*)::integer from public.messaging_conversation_members member
   join artist_group_test_context context on context.conversation_id = member.conversation_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  0, 'invitation alone does not grant conversation access'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.list_my_artist_group_invitations_v1(null, 30)), 1, 'invitee sees one safe invitation');
update artist_group_test_context set respond_result = public.respond_to_artist_group_invitation_v1(
  (select invitation_b from artist_group_test_context), 'accept', 'group-accept-b-0001'
);
select is((select respond_result ->> 'status' from artist_group_test_context), 'accepted', 'B accepts the invitation');

reset role;
select is(
  (select member.membership_status from public.artist_group_members member
   join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  'active', 'accepted invite creates active group membership'
);
select is(
  (select member.membership_status from public.messaging_conversation_members member
   join artist_group_test_context context on context.conversation_id = member.conversation_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  'active', 'accepted invite creates active Messaging membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.respond_to_artist_group_invitation_v1(
    (select invitation_b from artist_group_test_context), 'accept', 'group-accept-b-0001'
  ) ->> 'idempotent',
  'true', 'invitation response replay is idempotent'
);
select lives_ok(
  format(
    $$select public.set_my_artist_group_preferences_v1('%s', false, 'hidden', true, 'group-prefs-b-0001')$$,
    (select group_id from artist_group_test_context)
  ),
  'member stores notification, roster visibility and archive preferences'
);

reset role;
select ok(
  (select not member.notifications_enabled and member.roster_visibility = 'hidden' and member.archived_at is not null
   from public.artist_group_members member join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  'member preferences persist in the private roster'
);
select ok(
  (select not member.notifications_enabled and member.archived_at is not null
   from public.messaging_conversation_members member join artist_group_test_context context on context.conversation_id = member.conversation_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  'Messaging preferences stay synchronized'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    $$select public.set_artist_group_authority_role_v1('%s', '72000000-0000-4000-8000-000000000002', 'admin', 'group-admin-b-0001')$$,
    (select group_id from artist_group_test_context)
  ), 'owner promotes B to admin'
);
select lives_ok(
  format(
    $$select public.set_artist_group_artistic_role_v1('%s', '72000000-0000-4000-8000-000000000002', 'Directeur musical', 'group-art-b-0001')$$,
    (select group_id from artist_group_test_context)
  ), 'owner changes B artistic role independently'
);
reset role;
select ok(
  (select member.authority_role = 'admin' and member.artistic_role = 'Directeur musical'
   from public.artist_group_members member join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '72000000-0000-4000-8000-000000000002'),
  'authority and artistic roles remain independent'
);

-- ---------------------------------------------------------------------------
-- C joins, admin removes C, ownership transfer, leave, archive and delete
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update artist_group_test_context set invitation_c = (
  public.invite_artist_group_member_v1(
    (select group_id from artist_group_test_context),
    '73000000-0000-4000-8000-000000000003', 'DJ', null, 'group-invite-c-0001'
  ) ->> 'invitation_id'
)::uuid;
select ok((select invitation_c is not null from artist_group_test_context), 'owner creates invitation C');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    $$select public.respond_to_artist_group_invitation_v1('%s', 'accept', 'group-accept-c-0001')$$,
    (select invitation_c from artist_group_test_context)
  ), 'C accepts the invitation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    $$select public.remove_artist_group_member_v1('%s', '73000000-0000-4000-8000-000000000003', 'group-remove-c-0001')$$,
    (select group_id from artist_group_test_context)
  ), 'admin removes a regular member'
);
reset role;
select is(
  (select member.membership_status from public.artist_group_members member
   join artist_group_test_context context on context.group_id = member.group_id
   where member.profile_id = '73000000-0000-4000-8000-000000000003'),
  'removed', 'removed member keeps an auditable terminal roster row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    $$select public.transfer_artist_group_ownership_v1('%s', '72000000-0000-4000-8000-000000000002', 'admin', 'group-transfer-b-0001')$$,
    (select group_id from artist_group_test_context)
  ), 'A transfers ownership to B'
);
reset role;
select is(
  (select member.profile_id from public.artist_group_members member
   join artist_group_test_context context on context.group_id = member.group_id
   where member.authority_role = 'owner' and member.membership_status = 'active'),
  '72000000-0000-4000-8000-000000000002'::uuid, 'group still has exactly the transferred owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format($$select public.leave_artist_group_v1('%s', 'group-leave-a-0001')$$, (select group_id from artist_group_test_context)),
  'former owner can leave after transfer'
);
select is((select count(*)::integer from public.list_my_artist_groups_v1('all', null, 30)), 0, 'leaver no longer sees the group');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format($$select public.set_artist_group_archived_v1('%s', true, 'group-archive-0001')$$, (select group_id from artist_group_test_context)),
  'owner archives the group'
);
reset role;
select ok(
  (select conversation.deleted_at is not null from public.messaging_conversations conversation
   join artist_group_test_context context on context.conversation_id = conversation.id),
  'archive disables the linked Messaging conversation'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format($$select public.set_artist_group_archived_v1('%s', false, 'group-restore-0001')$$, (select group_id from artist_group_test_context)),
  'owner restores the group'
);
select throws_ok(
  format($$select public.delete_artist_group_v1('%s', 'Mauvais nom', 'group-delete-bad-0001')$$, (select group_id from artist_group_test_context)),
  '22023', 'artist_group_delete_confirmation_mismatch', 'delete requires exact name confirmation'
);
select lives_ok(
  format($$select public.delete_artist_group_v1('%s', 'Collectif Horizon', 'group-delete-0001')$$, (select group_id from artist_group_test_context)),
  'owner soft-deletes the group'
);
select is((select count(*)::integer from public.list_my_artist_groups_v1('all', null, 30)), 0, 'deleted group disappears from client projections');

reset role;
select ok(
  (select count(*) > 0 from public.artist_group_activity activity
   join artist_group_test_context context on context.group_id = activity.group_id),
  'append-only activity survives group deletion'
);
select throws_ok(
  format($$update public.artist_group_activity set payload = '{}'::jsonb where group_id = '%s'$$, (select group_id from artist_group_test_context)),
  '55000', 'artist_group_activity_is_append_only', 'activity cannot be rewritten'
);

select * from finish();
rollback;
