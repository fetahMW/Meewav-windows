begin;

create extension if not exists pgtap with schema extensions;
select plan(88);

-- ---------------------------------------------------------------------------
-- Stable surface, private ledgers and Storage contract.
-- ---------------------------------------------------------------------------

select has_table(
  'public', 'messaging_attachment_uploads',
  'private upload reservation ledger exists'
);
select has_table(
  'public', 'messaging_message_attachments',
  'message attachment links exist'
);
select has_table(
  'public', 'collaboration_request_attachments',
  'collaboration attachment links exist'
);
select has_table(
  'public', 'messaging_attachment_cleanup_jobs',
  'server-only attachment cleanup outbox exists'
);
select has_column(
  'public', 'messaging_messages', 'attachment_manifest_hash',
  'messages keep an immutable attachment manifest hash'
);
select ok(
  exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'messaging-attachments' and not bucket.public
  ),
  'Messaging attachments use a private bucket'
);
select is(
  (select bucket.file_size_limit::bigint from storage.buckets bucket
   where bucket.id = 'messaging-attachments'),
  52428800::bigint,
  'the bucket enforces the 50 MiB per-object ceiling'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.prepare_messaging_upload_v1(uuid,text,text,text,bigint,uuid,uuid)',
      'public.finalize_messaging_upload_v1(uuid,integer,text)',
      'public.discard_messaging_upload_v1(uuid)',
      'public.send_message_v2(uuid,uuid,text,text,jsonb,jsonb,uuid)',
      'public.attach_collaboration_uploads_v1(uuid,jsonb,text)',
      'public.get_conversation_messages_v2(uuid,bigint,integer)',
      'public.list_my_collaboration_requests_v2(text,text[],jsonb,integer)'
    ]) rpc(signature)
    where to_regprocedure(rpc.signature) is null
  ),
  'all attachment RPCs exist with stable signatures'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.prepare_messaging_upload_v1(uuid,text,text,text,bigint,uuid,uuid)',
      'public.finalize_messaging_upload_v1(uuid,integer,text)',
      'public.discard_messaging_upload_v1(uuid)',
      'public.send_message_v2(uuid,uuid,text,text,jsonb,jsonb,uuid)',
      'public.attach_collaboration_uploads_v1(uuid,jsonb,text)',
      'public.get_conversation_messages_v2(uuid,bigint,integer)',
      'public.list_my_collaboration_requests_v2(text,text[],jsonb,integer)'
    ]) rpc(signature)
    where not has_function_privilege('authenticated', rpc.signature, 'execute')
  ),
  'authenticated Web and iOS clients can call the intended RPCs'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.prepare_messaging_upload_v1(uuid,text,text,text,bigint,uuid,uuid)',
      'public.finalize_messaging_upload_v1(uuid,integer,text)',
      'public.discard_messaging_upload_v1(uuid)',
      'public.send_message_v2(uuid,uuid,text,text,jsonb,jsonb,uuid)',
      'public.attach_collaboration_uploads_v1(uuid,jsonb,text)',
      'public.get_conversation_messages_v2(uuid,bigint,integer)',
      'public.list_my_collaboration_requests_v2(text,text[],jsonb,integer)'
    ]) rpc(signature)
    where has_function_privilege('anon', rpc.signature, 'execute')
  ),
  'anonymous clients cannot call attachment RPCs'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.expire_messaging_attachment_uploads_v1(integer)',
      'public.claim_messaging_attachment_cleanup_v1(integer)',
      'public.complete_messaging_attachment_cleanup_v1(uuid,boolean,text)'
    ]) rpc(signature)
    where to_regprocedure(rpc.signature) is null
      or not has_function_privilege('service_role', rpc.signature, 'execute')
      or has_function_privilege('authenticated', rpc.signature, 'execute')
      or has_function_privilege('anon', rpc.signature, 'execute')
  ),
  'cleanup RPCs are service-only and exist with stable signatures'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.messaging_attachment_uploads',
      'public.messaging_message_attachments',
      'public.collaboration_request_attachments',
      'public.messaging_attachment_cleanup_jobs'
    ]) private_table(name)
    where has_table_privilege('authenticated', private_table.name, 'select')
  ),
  'authenticated clients cannot read raw attachment ledgers'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.messaging_attachment_uploads',
      'public.messaging_message_attachments',
      'public.collaboration_request_attachments',
      'public.messaging_attachment_cleanup_jobs'
    ]) private_table(name)
    cross join unnest(array['insert', 'update', 'delete']) mutation(privilege)
    where has_table_privilege('authenticated', private_table.name, mutation.privilege)
  ),
  'authenticated clients cannot mutate raw attachment ledgers'
);
select ok(
  (
    select bool_and(class.relrowsecurity)
    from pg_class class
    where class.oid in (
      'public.messaging_attachment_uploads'::regclass,
      'public.messaging_message_attachments'::regclass,
      'public.collaboration_request_attachments'::regclass,
      'public.messaging_attachment_cleanup_jobs'::regclass
    )
  ),
  'all private attachment ledgers have RLS enabled'
);
select is(
  (select constraint_definition.confdeltype::text
   from pg_constraint constraint_definition
   where constraint_definition.conname =
     'messaging_message_attachments_media_file_id_fkey'),
  'n',
  'message snapshots survive media deletion with a NULL link'
);
select is(
  (select constraint_definition.confdeltype::text
   from pg_constraint constraint_definition
   where constraint_definition.conname =
     'collaboration_request_attachments_media_file_id_fkey'),
  'n',
  'collaboration snapshots survive media deletion with a NULL link'
);
select is(
  public.messaging_attachment_max_bytes_v1('image'),
  10485760::bigint,
  'images are capped at 10 MiB'
);
select is(
  public.messaging_attachment_max_bytes_v1('audio'),
  52428800::bigint,
  'audio is capped at 50 MiB'
);
select is(
  public.messaging_attachment_quota_v1('active_reservations'),
  24::bigint,
  'at most 24 unfinished reservations can be active per account'
);
select is(
  public.messaging_attachment_quota_v1('hourly_reservations'),
  40::bigint,
  'reservation churn is bounded to 40 creations per account and hour'
);
select is(
  public.messaging_attachment_quota_v1('active_bytes'),
  536870912::bigint,
  'active reserved bytes are capped at 512 MiB per account'
);
select is(
  public.messaging_attachment_quota_v1('hourly_bytes'),
  1073741824::bigint,
  'rolling reserved bytes are capped at 1 GiB per account and hour'
);
select has_trigger(
  'public', 'media_files', 'aa_enforce_messaging_media_privacy_v1',
  'all Messaging media passes through the early privacy normalizer'
);
select ok(
  exists (
    select 1 from pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.media_files'::regclass
      and constraint_definition.conname = 'media_files_messaging_always_private_v1'
      and constraint_definition.convalidated
  ),
  'the Messaging media privacy invariant is validated'
);
select ok(
  position(
    'source_pillar <> ''messaging'''
    in pg_get_viewdef('public.published_media_files'::regclass, true)
  ) > 0,
  'the public media projection explicitly excludes Messaging'
);
select ok(
  exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'profile_media_published_select'
      and position('source_pillar' in coalesce(policy.qual, '')) > 0
      and position('messaging' in coalesce(policy.qual, '')) > 0
  ),
  'the shared Profile Storage publication policy also excludes Messaging'
);
select ok(
  position(
    'conversation.deleted_at is null'
    in lower(pg_get_functiondef(
      'public.messaging_can_read_storage_object_v1(text)'::regprocedure
    ))
  ) > 0,
  'signed reads reject attachments whose conversation is deleted'
);
select is(
  public.messaging_attachment_media_type_v1('voice_note', 'audio/webm'),
  'audio',
  'Web voice-note MIME is accepted'
);
select is(
  public.messaging_attachment_media_type_v1('document', 'application/zip'),
  null::text,
  'unsupported document MIME is rejected'
);
select is(
  public.messaging_attachment_extension_v1('video/quicktime'),
  'mov',
  'iOS QuickTime receives a deterministic extension'
);
select ok(
  not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname like 'messaging_attachments%'
      and policy.cmd = 'UPDATE'
  ),
  'no Storage UPDATE policy exists: clients upload with upsert=false'
);

-- ---------------------------------------------------------------------------
-- Three transaction-local accounts.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'attachments-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Attachments A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'attachments-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Attachments B"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '83000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'attachments-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Attachments C"}'::jsonb, now(), now()
  );

create temporary table messaging_attachment_test_context (
  key text primary key,
  value jsonb not null
);
grant select, insert, update, delete on messaging_attachment_test_context
  to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'attachments_a', 'Attachments A', 'avatar_7', 'pianist', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'sender can complete onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'attachments_b', 'Attachments B', 'avatar_16', 'acoustic_guitarist', 'Paris', 'FR',
    48.8530, 2.3690, false, true
  )$$,
  'recipient can complete onboarding'
);
update public.profiles set collab_available = true where id = auth.uid();

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding(
    'attachments_c', 'Attachments C', 'avatar_21', 'dj', 'Paris', 'FR',
    48.8600, 2.3400, false, true
  )$$,
  'unrelated account can complete onboarding'
);

-- ---------------------------------------------------------------------------
-- Conversation attachment lifecycle and participant-only reads.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into messaging_attachment_test_context(key, value)
values (
  'direct',
  public.get_or_create_direct_conversation_v1(
    '82000000-0000-4000-8000-000000000002',
    'attachment-direct-0001'
  )
);
select is(
  (select value ->> 'kind' from messaging_attachment_test_context where key = 'direct'),
  'direct',
  'sender creates the participant-scoped direct conversation'
);

insert into messaging_attachment_test_context(key, value)
select 'audio', public.prepare_messaging_upload_v1(
  '84000000-0000-4000-8000-000000000001',
  'audio', 'prise.wav', 'audio/wav', 4096,
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  null
);
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'audio'),
  'uploading',
  'owner receives an uploading reservation'
);
select is(
  (public.prepare_messaging_upload_v1(
    '84000000-0000-4000-8000-000000000001',
    'audio', 'prise.wav', 'audio/wav', 4096,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'),
    null
  ) ->> 'idempotent')::boolean,
  true,
  'preparation retry returns the same reservation'
);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '84000000-0000-4000-8000-000000000001',
    'audio', 'prise.wav', 'audio/wav', 8192,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '23505', 'upload_idempotency_conflict',
  'a reused client upload id cannot change its file contract'
);
select is(
  (select concat_ws('|', media.source_pillar, media.visibility,
      media.is_public::text, media.status,
      (media.published_at is null)::text,
      (media.scheduled_at is null)::text)
   from public.media_files media
   where media.id = (select (value ->> 'media_file_id')::uuid
                     from messaging_attachment_test_context where key = 'audio')),
  'messaging|private|false|uploading|true|true',
  'a new Messaging media row is private and non-published before attachment'
);
select lives_ok(
  $$update public.media_files
    set status = 'published', visibility = 'public', published_at = now()
    where id = (select (value ->> 'media_file_id')::uuid
                from messaging_attachment_test_context where key = 'audio')$$,
  'legacy publication-shaped updates are safely normalized'
);
select is(
  (select concat_ws('|', media.visibility, media.is_public::text,
      media.status, (media.published_at is null)::text)
   from public.media_files media
   where media.id = (select (value ->> 'media_file_id')::uuid
                     from messaging_attachment_test_context where key = 'audio')),
  'private|false|processing|true',
  'an unattached Messaging row cannot be made public through owner updates'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '85000000-0000-4000-8000-000000000001',
    'audio', 'intrus.wav', 'audio/wav', 4096,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '42501', 'not_a_conversation_member',
  'an unrelated account cannot reserve an object in the conversation'
);

reset role;
update public.messaging_conversations
set deleted_at = now()
where id = (select (value ->> 'conversation_id')::uuid
            from messaging_attachment_test_context where key = 'direct');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.messaging_can_upload_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'audio')
  ),
  false,
  'a pending object cannot upload after its conversation is deleted'
);
select is(
  public.messaging_can_read_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'audio')
  ),
  false,
  'an owner cannot sign a pending object after its conversation is deleted'
);
reset role;
update public.messaging_conversations
set deleted_at = null
where id = (select (value ->> 'conversation_id')::uuid
            from messaging_attachment_test_context where key = 'direct');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into storage.objects(bucket_id, name, metadata)
    select value ->> 'bucket', value ->> 'path',
      jsonb_build_object('size', 4096, 'mimetype', 'audio/wav')
    from messaging_attachment_test_context where key = 'audio'$$,
  'owner can upload only the exact reserved Storage path'
);
update messaging_attachment_test_context
set value = value || public.finalize_messaging_upload_v1(
  (value ->> 'upload_id')::uuid, 4200, repeat('a', 64)
)
where key = 'audio';
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'audio'),
  'ready',
  'server Storage metadata finalizes the upload'
);
select ok(
  (select media.checksum_sha256 is null
      and media.visibility = 'private'
      and not coalesce(media.is_public, false)
      and media.metadata ->> 'messaging_validation' = 'storage_metadata_only'
      and media.metadata ->> 'client_checksum_sha256' = repeat('a', 64)
   from public.media_files media
   where media.id = (select (value ->> 'media_file_id')::uuid
                     from messaging_attachment_test_context where key = 'audio')),
  'client checksum and MIME metadata stay explicitly quarantined from publication'
);
select is(
  (public.finalize_messaging_upload_v1(
    (select (value ->> 'upload_id')::uuid
     from messaging_attachment_test_context where key = 'audio'),
    4200, repeat('a', 64)
  ) ->> 'idempotent')::boolean,
  true,
  'finalization retry is idempotent'
);

insert into messaging_attachment_test_context(key, value)
select 'audio_message', public.send_message_v2(
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  '86000000-0000-4000-8000-000000000001',
  'audio', 'Écoute cette prise', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'upload_id', (select value ->> 'upload_id'
                  from messaging_attachment_test_context where key = 'audio'),
    'sort_order', 0,
    'role', 'primary'
  )),
  null
);
select is(
  (select value ->> 'kind' from messaging_attachment_test_context where key = 'audio_message'),
  'audio',
  'atomic send links the finalized audio'
);
select is(
  (public.send_message_v2(
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'),
    '86000000-0000-4000-8000-000000000001',
    'audio', 'Écoute cette prise', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'upload_id', (select value ->> 'upload_id'
                    from messaging_attachment_test_context where key = 'audio'),
      'sort_order', 0,
      'role', 'primary'
    )), null
  ) ->> 'idempotent')::boolean,
  true,
  'structured message retry is idempotent'
);
select throws_ok(
  $$select public.send_message_v2(
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'),
    '86000000-0000-4000-8000-000000000001',
    'file', 'Écoute cette prise', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'upload_id', (select value ->> 'upload_id'
                    from messaging_attachment_test_context where key = 'audio'),
      'sort_order', 0,
      'role', 'document'
    )), null
  )$$,
  '23505', 'idempotency_conflict',
  'message idempotency detects a changed manifest contract'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select jsonb_array_length(message.attachments)
   from public.get_conversation_messages_v2(
     (select (value ->> 'conversation_id')::uuid
      from messaging_attachment_test_context where key = 'direct'), null, 50
   ) message
   where message.id = (select (value ->> 'message_id')::uuid
                       from messaging_attachment_test_context where key = 'audio_message')),
  1,
  'the other participant receives one safe attachment projection'
);
select is(
  (select message.attachments -> 0 ->> 'storage_bucket'
   from public.get_conversation_messages_v2(
     (select (value ->> 'conversation_id')::uuid
      from messaging_attachment_test_context where key = 'direct'), null, 50
   ) message
   where message.id = (select (value ->> 'message_id')::uuid
                       from messaging_attachment_test_context where key = 'audio_message')),
  'messaging-attachments',
  'the authorized projection exposes only the private bucket/path pair'
);
select is(
  public.messaging_can_read_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'audio')
  ),
  true,
  'the other participant can request a signed URL'
);

reset role;
update public.messaging_conversations
set deleted_at = now()
where id = (select (value ->> 'conversation_id')::uuid
            from messaging_attachment_test_context where key = 'direct');
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.messaging_can_read_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'audio')
  ),
  false,
  'participants cannot sign an attachment after its conversation is deleted'
);
reset role;
update public.messaging_conversations
set deleted_at = null
where id = (select (value ->> 'conversation_id')::uuid
            from messaging_attachment_test_context where key = 'direct');

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.get_conversation_messages_v2(
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null, 50
  )$$,
  '42501', 'not_a_conversation_member',
  'an unrelated account cannot read the message projection'
);
select is(
  public.messaging_can_read_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'audio')
  ),
  false,
  'an unrelated account cannot sign the private object'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update public.media_files
    set status = 'archived'
    where id = (select (value ->> 'media_file_id')::uuid
                from messaging_attachment_test_context where key = 'audio')$$,
  '42501', 'attached_messaging_media_immutable',
  'browser owners cannot archive media already attached to history'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
delete from public.media_files
where id = (select (value ->> 'media_file_id')::uuid
            from messaging_attachment_test_context where key = 'audio');
select is(
  (select attachment.media_file_id::text
   from public.messaging_message_attachments attachment
   where attachment.message_id =
     (select (value ->> 'message_id')::uuid
      from messaging_attachment_test_context where key = 'audio_message')),
  null::text,
  'trusted account deletion clears the media link'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select (message.attachments -> 0 ->> 'available')::boolean
   from public.get_conversation_messages_v2(
     (select (value ->> 'conversation_id')::uuid
      from messaging_attachment_test_context where key = 'direct'), null, 50
   ) message
   where message.id = (select (value ->> 'message_id')::uuid
                       from messaging_attachment_test_context where key = 'audio_message')),
  false,
  'history keeps a safe unavailable placeholder after account media deletion'
);

-- ---------------------------------------------------------------------------
-- Discard lifecycle removes the physical object only after SQL authorization.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into messaging_attachment_test_context(key, value)
select 'discard', public.prepare_messaging_upload_v1(
  '87000000-0000-4000-8000-000000000001',
  'document', 'brief.pdf', 'application/pdf', 2048,
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'), null
);
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'discard'),
  'uploading',
  'a disposable document receives a separate reservation'
);
select lives_ok(
  $$insert into storage.objects(bucket_id, name, metadata)
    select value ->> 'bucket', value ->> 'path',
      jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
    from messaging_attachment_test_context where key = 'discard'$$,
  'the reserved document can be uploaded'
);
update messaging_attachment_test_context
set value = value || public.finalize_messaging_upload_v1(
  (value ->> 'upload_id')::uuid, null, null
)
where key = 'discard';
update messaging_attachment_test_context
set value = value || public.discard_messaging_upload_v1((value ->> 'upload_id')::uuid)
where key = 'discard';
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'discard'),
  'discarded',
  'discard marks the unattached reservation before Storage deletion'
);
select is(
  (select job.status from public.messaging_attachment_cleanup_jobs job
   where job.upload_id = (select (value ->> 'upload_id')::uuid
                          from messaging_attachment_test_context where key = 'discard')),
  'pending',
  'discard also queues server cleanup so correctness never depends on the client'
);
select is(
  (public.discard_messaging_upload_v1(
    (select (value ->> 'upload_id')::uuid
     from messaging_attachment_test_context where key = 'discard')
  ) ->> 'idempotent')::boolean,
  true,
  'discard retry is idempotent'
);
select is(
  public.messaging_can_delete_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'discard')
  ),
  true,
  'only the discarded unattached object becomes deletable'
);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'messaging-attachments'
      and name = (select value ->> 'path'
                  from messaging_attachment_test_context where key = 'discard')$$,
  'the owner removes the discarded physical object through Storage RLS'
);

-- ---------------------------------------------------------------------------
-- Collaboration attachments reuse the same private lifecycle.
-- ---------------------------------------------------------------------------

insert into messaging_attachment_test_context(key, value)
select 'collab_image', public.prepare_messaging_upload_v1(
  '88000000-0000-4000-8000-000000000001',
  'image', 'moodboard.webp', 'image/webp', 1024,
  null, '82000000-0000-4000-8000-000000000002'
);
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'collab_image'),
  'uploading',
  'sender can reserve a collaboration attachment for an available recipient'
);
select lives_ok(
  $$insert into storage.objects(bucket_id, name, metadata)
    select value ->> 'bucket', value ->> 'path',
      jsonb_build_object('size', 1024, 'mimetype', 'image/webp')
    from messaging_attachment_test_context where key = 'collab_image'$$,
  'collaboration image uploads through the same private policy'
);
update messaging_attachment_test_context
set value = value || public.finalize_messaging_upload_v1(
  (value ->> 'upload_id')::uuid, null, null
)
where key = 'collab_image';
insert into messaging_attachment_test_context(key, value)
values (
  'collab_request',
  public.request_profile_collaboration(
    '82000000-0000-4000-8000-000000000002',
    'Construisons ce morceau ensemble.',
    'attachment-collab-request-0001',
    'globe'
  )
);
select ok(
  (select value ->> 'requestId' from messaging_attachment_test_context
   where key = 'collab_request') is not null,
  'the existing Globe flow creates the collaboration request'
);
insert into messaging_attachment_test_context(key, value)
select 'collab_attach', public.attach_collaboration_uploads_v1(
  (select (value ->> 'requestId')::uuid
   from messaging_attachment_test_context where key = 'collab_request'),
  jsonb_build_array(jsonb_build_object(
    'upload_id', (select value ->> 'upload_id'
                  from messaging_attachment_test_context where key = 'collab_image'),
    'label', 'Moodboard'
  )),
  'attachment-collab-link-0001'
);
select is(
  (select (value ->> 'attachment_count')::integer
   from messaging_attachment_test_context where key = 'collab_attach'),
  1,
  'sender atomically links the finalized image to the request'
);
select is(
  (public.attach_collaboration_uploads_v1(
    (select (value ->> 'requestId')::uuid
     from messaging_attachment_test_context where key = 'collab_request'),
    jsonb_build_array(jsonb_build_object(
      'upload_id', (select value ->> 'upload_id'
                    from messaging_attachment_test_context where key = 'collab_image'),
      'label', 'Moodboard'
    )),
    'attachment-collab-link-0001'
  ) ->> 'idempotent')::boolean,
  true,
  'collaboration attachment retry is idempotent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select jsonb_array_length(request.attachments)
   from public.list_my_collaboration_requests_v2('received', null, null, 30) request
   where request.request_id =
     (select (value ->> 'requestId')::uuid
      from messaging_attachment_test_context where key = 'collab_request')),
  1,
  'recipient receives the collaboration attachment projection'
);
select is(
  public.messaging_can_read_storage_object_v1(
    (select value ->> 'path' from messaging_attachment_test_context where key = 'collab_image')
  ),
  true,
  'the collaboration recipient can sign its private object'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.discard_messaging_upload_v1(
    (select (value ->> 'upload_id')::uuid
     from messaging_attachment_test_context where key = 'collab_image')
  )$$,
  '42501', 'attached_upload_cannot_be_discarded',
  'an attached collaboration object cannot be discarded'
);

-- ---------------------------------------------------------------------------
-- Per-account quota enforcement is serialized and includes reserved bytes.
-- ---------------------------------------------------------------------------

reset role;
insert into public.messaging_attachment_uploads (
  id, owner_profile_id, conversation_id, client_upload_id, purpose,
  display_name, storage_path, expected_mime_type, expected_size_bytes, status
)
select
  md5('quota-active-count-id-' || series.value)::uuid,
  '81000000-0000-4000-8000-000000000001',
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  md5('quota-active-count-client-' || series.value)::uuid,
  'image', 'quota.png',
  '81000000-0000-4000-8000-000000000001/quota/active-count-'
    || series.value || '.png',
  'image/png', 1, 'uploading'
from generate_series(1, 24) series(value);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '89000000-0000-4000-8000-000000000001',
    'image', 'quota.png', 'image/png', 1,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '54000', 'too_many_pending_uploads',
  'active reservation count is enforced per account'
);
reset role;
delete from public.messaging_attachment_uploads
where storage_path like '81000000-0000-4000-8000-000000000001/quota/active-count-%';

insert into public.messaging_attachment_uploads (
  id, owner_profile_id, conversation_id, client_upload_id, purpose,
  display_name, storage_path, expected_mime_type, expected_size_bytes, status
)
select
  md5('quota-active-bytes-id-' || series.value)::uuid,
  '81000000-0000-4000-8000-000000000001',
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  md5('quota-active-bytes-client-' || series.value)::uuid,
  'audio', 'quota.wav',
  '81000000-0000-4000-8000-000000000001/quota/active-bytes-'
    || series.value || '.wav',
  'audio/wav', 52428800, 'uploading'
from generate_series(1, 11) series(value);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '89000000-0000-4000-8000-000000000002',
    'image', 'quota.png', 'image/png', 1,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '54000', 'pending_upload_bytes_limit',
  'active reserved bytes are enforced per account'
);
reset role;
delete from public.messaging_attachment_uploads
where storage_path like '81000000-0000-4000-8000-000000000001/quota/active-bytes-%';

insert into public.messaging_attachment_uploads (
  id, owner_profile_id, conversation_id, client_upload_id, purpose,
  display_name, storage_path, expected_mime_type, expected_size_bytes, status
)
select
  md5('quota-hourly-bytes-id-' || series.value)::uuid,
  '81000000-0000-4000-8000-000000000001',
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  md5('quota-hourly-bytes-client-' || series.value)::uuid,
  'audio', 'quota.wav',
  '81000000-0000-4000-8000-000000000001/quota/hourly-bytes-'
    || series.value || '.wav',
  'audio/wav', 52428800, 'attached'
from generate_series(1, 20) series(value);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '89000000-0000-4000-8000-000000000003',
    'audio', 'quota.wav', 'audio/wav', 52428800,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '54000', 'attachment_upload_hourly_bytes_limit',
  'rolling reserved bytes are enforced even after attachment'
);
reset role;
delete from public.messaging_attachment_uploads
where storage_path like '81000000-0000-4000-8000-000000000001/quota/hourly-bytes-%';

insert into public.messaging_attachment_uploads (
  id, owner_profile_id, conversation_id, client_upload_id, purpose,
  display_name, storage_path, expected_mime_type, expected_size_bytes, status
)
select
  md5('quota-hourly-count-id-' || series.value)::uuid,
  '81000000-0000-4000-8000-000000000001',
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'),
  md5('quota-hourly-count-client-' || series.value)::uuid,
  'image', 'quota.png',
  '81000000-0000-4000-8000-000000000001/quota/hourly-count-'
    || series.value || '.png',
  'image/png', 1, 'attached'
from generate_series(1, 40) series(value);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_messaging_upload_v1(
    '89000000-0000-4000-8000-000000000004',
    'image', 'quota.png', 'image/png', 1,
    (select (value ->> 'conversation_id')::uuid
     from messaging_attachment_test_context where key = 'direct'), null
  )$$,
  '54000', 'attachment_upload_rate_limit',
  'rolling reservation count is enforced per account'
);
reset role;
delete from public.messaging_attachment_uploads
where storage_path like '81000000-0000-4000-8000-000000000001/quota/hourly-count-%';

-- ---------------------------------------------------------------------------
-- Server-driven expiry and durable Storage cleanup outbox.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into messaging_attachment_test_context(key, value)
select 'expiry', public.prepare_messaging_upload_v1(
  '89000000-0000-4000-8000-000000000005',
  'document', 'expire.pdf', 'application/pdf', 1024,
  (select (value ->> 'conversation_id')::uuid
   from messaging_attachment_test_context where key = 'direct'), null
);
select is(
  (select value ->> 'status' from messaging_attachment_test_context where key = 'expiry'),
  'uploading',
  'an expiring object starts as a private upload reservation'
);
select lives_ok(
  $$insert into storage.objects(bucket_id, name, metadata)
    select value ->> 'bucket', value ->> 'path',
      jsonb_build_object('size', 1024, 'mimetype', 'application/pdf')
    from messaging_attachment_test_context where key = 'expiry'$$,
  'the expiring reservation may have a physical Storage object'
);

reset role;
update public.messaging_attachment_uploads
set expires_at = now() - interval '1 minute'
where id = (select (value ->> 'upload_id')::uuid
            from messaging_attachment_test_context where key = 'expiry');
select is(
  public.expire_messaging_attachment_uploads_v1(10),
  1,
  'server expiry transitions abandoned reservations without a client call'
);
select is(
  (select upload.status from public.messaging_attachment_uploads upload
   where upload.id = (select (value ->> 'upload_id')::uuid
                      from messaging_attachment_test_context where key = 'expiry')),
  'expired',
  'the abandoned reservation is durably expired'
);
select is(
  (select concat_ws('|', media.status, media.visibility, media.is_public::text,
      (media.deleted_at is not null)::text)
   from public.media_files media
   where media.id = (select (value ->> 'media_file_id')::uuid
                     from messaging_attachment_test_context where key = 'expiry')),
  'archived|private|false|true',
  'expiry archives only the private Messaging catalog row'
);
select is(
  (select job.status from public.messaging_attachment_cleanup_jobs job
   where job.upload_id = (select (value ->> 'upload_id')::uuid
                          from messaging_attachment_test_context where key = 'expiry')),
  'pending',
  'expiry durably queues physical Storage cleanup'
);
insert into messaging_attachment_test_context(key, value)
select 'cleanup_claim', to_jsonb(claimed)
from public.claim_messaging_attachment_cleanup_v1(10) claimed
where claimed.upload_id = (select (value ->> 'upload_id')::uuid
                           from messaging_attachment_test_context where key = 'expiry');
select is(
  (select value ->> 'storage_path'
   from messaging_attachment_test_context where key = 'cleanup_claim'),
  (select value ->> 'path'
   from messaging_attachment_test_context where key = 'expiry'),
  'a trusted worker claims the exact private Storage path'
);
select is(
  public.complete_messaging_attachment_cleanup_v1(
    (select (value ->> 'job_id')::uuid
     from messaging_attachment_test_context where key = 'cleanup_claim'),
    true, null
  ),
  true,
  'the trusted worker acknowledges Storage deletion idempotently'
);
select is(
  (select job.status from public.messaging_attachment_cleanup_jobs job
   where job.id = (select (value ->> 'job_id')::uuid
                   from messaging_attachment_test_context where key = 'cleanup_claim')),
  'completed',
  'completed cleanup jobs leave no client-owned retry obligation'
);

select * from finish();
rollback;
