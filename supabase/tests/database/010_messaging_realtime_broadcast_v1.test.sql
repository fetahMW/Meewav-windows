begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_function(
  'public', 'messaging_emit_private_change_v1',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'private invalidation emitter exists'
);
select has_function('public', 'messaging_broadcast_conversation_change_v1', array[]::text[], 'conversation broadcaster exists');
select has_function('public', 'messaging_broadcast_collaboration_change_v1', array[]::text[], 'collaboration broadcaster exists');
select has_function('public', 'messaging_broadcast_project_change_v1', array[]::text[], 'project broadcaster exists');
select has_function('public', 'messaging_broadcast_artist_group_change_v1', array[]::text[], 'group broadcaster exists');

select has_trigger('public', 'messaging_conversations', 'messaging_realtime_conversations_v1', 'conversation metadata invalidates clients');
select has_trigger('public', 'messaging_conversation_members', 'messaging_realtime_members_v1', 'membership invalidates clients');
select has_trigger('public', 'messaging_messages', 'messaging_realtime_messages_v1', 'messages invalidate clients');
select has_trigger('public', 'messaging_message_reactions', 'messaging_realtime_reactions_v1', 'reactions invalidate clients');
select has_trigger('public', 'collaboration_requests', 'messaging_realtime_collaborations_v1', 'collaborations invalidate clients');
select has_trigger('public', 'collaboration_request_participant_state', 'messaging_realtime_collab_participants_v1', 'collaboration participant state invalidates clients');
select has_trigger('public', 'collaboration_request_transitions', 'messaging_realtime_collab_transitions_v1', 'collaboration transitions invalidate clients');
select has_trigger('public', 'collaboration_request_attachments', 'messaging_realtime_collab_attachments_v1', 'collaboration attachments invalidate clients');
select has_trigger('public', 'creative_projects', 'messaging_realtime_projects_v1', 'projects invalidate clients');
select has_trigger('public', 'creative_project_members', 'messaging_realtime_project_members_v1', 'project members invalidate clients');
select has_trigger('public', 'creative_project_invitations', 'messaging_realtime_project_invitations_v1', 'project invitations invalidate clients');
select has_trigger('public', 'creative_project_tasks', 'messaging_realtime_project_tasks_v1', 'project tasks invalidate clients');
select has_trigger('public', 'creative_project_activity', 'messaging_realtime_project_activity_v1', 'project activity invalidates clients');
select has_trigger('public', 'artist_groups', 'messaging_realtime_groups_v1', 'artist groups invalidate clients');
select has_trigger('public', 'artist_group_members', 'messaging_realtime_group_members_v1', 'artist group members invalidate clients');
select has_trigger('public', 'artist_group_invitations', 'messaging_realtime_group_invitations_v1', 'artist group invitations invalidate clients');
select has_trigger('public', 'artist_group_activity', 'messaging_realtime_group_activity_v1', 'artist group activity invalidates clients');

select ok(
  (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'Realtime messages keeps RLS enabled'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'messaging_user_private_broadcasts_v1'
  ),
  'private per-user Broadcast policy exists'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'messaging_user_private_broadcasts_v1'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
      and qual like '%messaging:user:%'
      and qual like '%auth.uid()%'
  ),
  'only the authenticated user topic is selected'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)',
    'execute'
  ),
  'anonymous clients cannot emit invalidations'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)',
    'execute'
  ),
  'authenticated clients cannot forge invalidations'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)',
    'execute'
  ),
  'service role can invoke the private emitter'
);
select ok(
  (
    select bool_and(procedure.prosecdef)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'messaging_emit_private_change_v1',
        'messaging_broadcast_conversation_change_v1',
        'messaging_broadcast_collaboration_change_v1',
        'messaging_broadcast_project_change_v1',
        'messaging_broadcast_artist_group_change_v1'
      )
  ),
  'broadcast functions execute behind the server authority boundary'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)'::regprocedure)
      like '%realtime.send%messaging:user:%true%'
  ),
  'the emitter uses a private user topic'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
      like '%if not v_topology_changed%return new;%'
  ),
  'private member preference updates return before participant fan-out'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
      like '%old.profile_id is distinct from new.profile_id%'
      and pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
        like '%old.membership_status is distinct from new.membership_status%'
      and pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
        like '%old.left_at is distinct from new.left_at%'
      and pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
        like '%old.role is distinct from new.role%'
  ),
  'conversation membership topology changes are explicitly classified'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
      like '%union%select v_affected_profile_id%union%select v_previous_profile_id%'
  ),
  'topology recipients are unioned so each profile is invalidated once'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_broadcast_conversation_change_v1()'::regprocedure)
      like '%where recipient.profile_id is not null%'
  ),
  'conversation broadcaster never emits a null private recipient'
);
select ok(
  (
    select pg_get_functiondef('public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)'::regprocedure)
      not like '%message_body%'
      and pg_get_functiondef('public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)'::regprocedure)
        not like '%storage_path%'
      and pg_get_functiondef('public.messaging_emit_private_change_v1(uuid,text,uuid,text,text)'::regprocedure)
        not like '%attachment_path%'
  ),
  'Realtime invalidations contain no message or attachment content fields'
);

select * from finish();
rollback;
