begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'messaging_message_pins', 'shared message pin ledger exists');
select has_column('public', 'messaging_message_pins', 'pinned_at', 'pins keep their timestamp');
select has_column('public', 'messaging_message_pins', 'pinned_by_profile_id', 'pins keep their author');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.messaging_message_pins'::regclass),
  'pin ledger keeps RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.messaging_message_pins', 'select'),
  'authenticated clients cannot read the private pin ledger directly'
);
select ok(
  not exists (
    select 1 from unnest(array['insert', 'update', 'delete']) privilege
    where has_table_privilege('authenticated', 'public.messaging_message_pins', privilege)
  ),
  'authenticated clients cannot mutate the private pin ledger directly'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.get_conversation_messages_v3(uuid,bigint,integer)',
      'public.set_message_pinned_v1(uuid,boolean)',
      'public.delete_message_v1(uuid)',
      'public.forward_message_v1(uuid,uuid,uuid)'
    ]) signature
    where to_regprocedure(signature) is null
  ),
  'all message action RPCs exist with stable signatures'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.get_conversation_messages_v3(uuid,bigint,integer)',
      'public.set_message_pinned_v1(uuid,boolean)',
      'public.delete_message_v1(uuid)',
      'public.forward_message_v1(uuid,uuid,uuid)'
    ]) signature
    where not has_function_privilege('authenticated', signature, 'execute')
  ),
  'authenticated clients can execute all message action RPCs'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.get_conversation_messages_v3(uuid,bigint,integer)',
      'public.set_message_pinned_v1(uuid,boolean)',
      'public.delete_message_v1(uuid)',
      'public.forward_message_v1(uuid,uuid,uuid)'
    ]) signature
    where has_function_privilege('anon', signature, 'execute')
  ),
  'anonymous clients cannot execute message action RPCs'
);
select ok(
  not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'get_conversation_messages_v3',
        'set_message_pinned_v1',
        'delete_message_v1',
        'forward_message_v1'
      )
      and not procedure.prosecdef
  ),
  'message action RPCs run behind the server authority boundary'
);
select ok(
  pg_get_functiondef('public.get_conversation_messages_v3(uuid,bigint,integer)'::regprocedure)
    like '%get_conversation_messages_v2%',
  'V3 extends the attachment-aware safe projection'
);
select ok(
  pg_get_functiondef('public.forward_message_v1(uuid,uuid,uuid)'::regprocedure)
    like '%message_forward_attachments_unsupported%',
  'forwarding private attachments fails closed'
);
select ok(
  pg_get_functiondef('public.forward_message_v1(uuid,uuid,uuid)'::regprocedure)
    like '%send_message_v1%',
  'forwarding reuses the rate-limited idempotent send path'
);
select ok(
  pg_get_functiondef('public.delete_message_v1(uuid)'::regprocedure)
    like '%sender_profile_id is distinct from v_user_id%',
  'message deletion is restricted to its author'
);
select ok(
  pg_get_functiondef('public.delete_message_v1(uuid)'::regprocedure)
    like '%set deleted_at = v_deleted_at%',
  'message deletion is a reversible-safe soft delete rather than a hard delete'
);
select ok(
  pg_get_functiondef('public.set_message_pinned_v1(uuid,boolean)'::regprocedure)
    like '%messaging_is_member_v1%',
  'pin changes require active conversation membership'
);
select has_trigger(
  'public', 'messaging_message_pins', 'messaging_realtime_message_pins_v1',
  'pin changes invalidate authorized conversation clients'
);
select fk_ok(
  'public', 'messaging_message_pins', array['message_id', 'conversation_id'],
  'public', 'messaging_messages', array['id', 'conversation_id'],
  'pin rows cannot cross conversation boundaries'
);

select * from finish();
rollback;
