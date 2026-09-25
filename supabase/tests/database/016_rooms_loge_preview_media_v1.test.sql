begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select ok(
  exists(select 1 from storage.buckets where id = 'room-loge-previews'),
  'private Loge preview bucket exists'
);
select is(
  (select public from storage.buckets where id = 'room-loge-previews'),
  false,
  'Loge preview bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'room-loge-previews'),
  26214400::bigint,
  'Loge preview bucket is capped at 25 MiB'
);
select ok(
  (select allowed_mime_types @> array['audio/wav', 'audio/mpeg', 'audio/mp4']::text[]
   from storage.buckets where id = 'room-loge-previews'),
  'Loge preview bucket has an explicit audio MIME allowlist'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname like 'room_loge_preview_%'),
  2,
  'Loge preview bucket exposes only upload and delete policies'
);
select ok(
  exists(select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname = 'room_loge_preview_control_upload_v1'
           and cmd = 'INSERT' and roles = array['authenticated']::name[]),
  'only authenticated controls can enter the upload policy'
);
select ok(
  exists(select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname = 'room_loge_preview_control_delete_v1'
           and cmd = 'DELETE' and roles = array['authenticated']::name[]),
  'only authenticated controls can enter the delete policy'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'room_loge_preview_%' and cmd = 'SELECT'),
  0,
  'no browser Storage SELECT path exists for Loge previews'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'room_loge_preview_%' and cmd = 'UPDATE'),
  0,
  'Loge previews cannot be overwritten'
);
select ok(
  not exists(select 1 from pg_policies
             where schemaname = 'storage' and tablename = 'objects'
               and policyname like 'room_loge_preview_%'
               and 'anon'::name = any(roles)),
  'anonymous callers receive no Loge preview Storage policy'
);

select ok(
  to_regprocedure('public.rooms_authorize_loge_preview_media_v1(uuid,uuid)') is not null,
  'service-only Loge preview media authority exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rooms_authorize_loge_preview_media_v1(uuid,uuid)',
    'execute'
  ),
  'authenticated callers cannot invoke the media authority directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.rooms_authorize_loge_preview_media_v1(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke the media authority directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.rooms_authorize_loge_preview_media_v1(uuid,uuid)',
    'execute'
  ),
  'service role can invoke the narrow media authority'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rooms_specialized_require_service_role_v1()',
    'execute'
  ),
  'authenticated callers cannot invoke the service-role guard'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.rooms_specialized_loge_preview_can_manage_v1(text)',
    'execute'
  ),
  'authenticated callers cannot probe the internal object management helper'
);
select ok(
  to_regprocedure('public.rooms_specialized_loge_preview_media_path_valid_v1(uuid,text,jsonb)') is not null,
  'Loge preview path validator exists'
);

select ok(
  public.rooms_specialized_loge_preview_media_path_valid_v1(
    '870f6601-0a9e-4d74-b89c-63be031b3936',
    'loge',
    '{"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":false,"liveOnly":false,"replayIncluded":true,"expiresAt":null}}}'::jsonb
  ),
  'canonical Room/uploader/object path is accepted'
);
select ok(
  not public.rooms_specialized_loge_preview_media_path_valid_v1(
    '870f6601-0a9e-4d74-b89c-63be031b3936',
    'loge',
    '{"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"970f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":false,"liveOnly":false,"replayIncluded":true,"expiresAt":null}}}'::jsonb
  ),
  'cross-Room path is rejected'
);
select ok(
  not public.rooms_specialized_loge_preview_media_path_valid_v1(
    '870f6601-0a9e-4d74-b89c-63be031b3936',
    'loge',
    '{"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":true,"liveOnly":true,"replayIncluded":true,"expiresAt":null}}}'::jsonb
  ),
  'live-only and replay modes cannot both be active'
);

select ok(
  (public.rooms_specialized_project_state_v3(
    '{"roomType":"loge","gifts":{},"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":false,"liveOnly":false,"replayIncluded":true,"expiresAt":null,"durationSeconds":120,"channels":2,"sampleRate":48000,"waveformPeaks":[]},"questions":[],"moments":[]}}'::jsonb,
    'loge',
    '74ee19ba-ad26-43a6-8574-7fb2977199a4',
    false,
    false,
    'ended'
  ) #> '{loge,preview,mediaPath}') = 'null'::jsonb,
  'eligible Viewer projection never contains the persistent media path'
);
select is(
  public.rooms_specialized_project_state_v3(
    '{"roomType":"loge","gifts":{},"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":false,"liveOnly":false,"replayIncluded":true,"expiresAt":null},"questions":[],"moments":[]}}'::jsonb,
    'loge',
    '74ee19ba-ad26-43a6-8574-7fb2977199a4',
    true,
    false,
    'ended'
  ) #>> '{loge,preview,mediaPath}',
  '870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a',
  'control projection keeps the persistent media path'
);
select is(
  public.rooms_specialized_project_state_v3(
    '{"roomType":"loge","gifts":{},"loge":{"preview":{"mediaName":"premix.m4a","mediaPath":"870f6601-0a9e-4d74-b89c-63be031b3936/74ee19ba-ad26-43a6-8574-7fb2977199a4/8e21be33-e5e6-4d60-b741-19dedeb0a5d9.m4a","playing":true,"liveOnly":true,"replayIncluded":false,"expiresAt":null,"durationSeconds":120,"channels":2,"sampleRate":48000,"waveformPeaks":[]},"questions":[],"moments":[]}}'::jsonb,
    'loge',
    '74ee19ba-ad26-43a6-8574-7fb2977199a4',
    false,
    false,
    'ended'
  ) #>> '{loge,preview,mediaName}',
  '',
  'ended Room cannot expose a live-only preview even with stale playing=true'
);
select ok(
  pg_get_functiondef('public.rooms_specialized_loge_preview_can_delete_v1(text)'::regprocedure)
    like '%specialized.state #>> ''{loge,preview,mediaPath}'' = p_name%',
  'delete policy helper refuses the currently referenced object'
);

select * from finish();
rollback;
