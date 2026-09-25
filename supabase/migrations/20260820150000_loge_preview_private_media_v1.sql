-- Persist La Loge preview audio in a private bucket. The authoritative state
-- stores only an opaque object path; browsers receive short-lived URLs through
-- the service-only authority below, never through a Viewer Storage policy.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-loge-previews',
  'room-loge-previews',
  false,
  26214400,
  array[
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    'audio/x-m4a'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.rooms_specialized_loge_preview_media_path_valid_v1(
  p_room_id uuid,
  p_room_type text,
  p_state jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_preview jsonb;
  v_media_path text;
  v_expires_at timestamptz;
begin
  if p_room_type <> 'loge' then return true; end if;
  v_preview := p_state #> '{loge,preview}';
  if v_preview is null or jsonb_typeof(v_preview) <> 'object' then return false; end if;

  if jsonb_typeof(v_preview->'mediaName') is distinct from 'string'
     or jsonb_typeof(v_preview->'playing') is distinct from 'boolean'
     or jsonb_typeof(v_preview->'liveOnly') is distinct from 'boolean'
     or jsonb_typeof(v_preview->'replayIncluded') is distinct from 'boolean' then
    return false;
  end if;
  if char_length(v_preview->>'mediaName') > 255 then return false; end if;
  if coalesce((v_preview->>'liveOnly')::boolean, false)
     and coalesce((v_preview->>'replayIncluded')::boolean, false) then
    return false;
  end if;
  if v_preview ? 'expiresAt' and jsonb_typeof(v_preview->'expiresAt') <> 'null' then
    if jsonb_typeof(v_preview->'expiresAt') <> 'string'
       or btrim(v_preview->>'expiresAt') = '' then
      return false;
    end if;
    v_expires_at := (v_preview->>'expiresAt')::timestamptz;
  end if;

  if not (v_preview ? 'mediaPath') or jsonb_typeof(v_preview->'mediaPath') = 'null' then
    return true;
  end if;
  if jsonb_typeof(v_preview->'mediaPath') <> 'string' then return false; end if;

  v_media_path := v_preview->>'mediaPath';
  return char_length(v_media_path) <= 240
    and split_part(v_media_path, '/', 1) = p_room_id::text
    and v_media_path ~* (
      '^' || p_room_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      || '\.(wav|mp3|aac|flac|m4a)$'
    )
    and char_length(btrim(coalesce(v_preview->>'mediaName', ''))) between 1 and 255;
exception when others then
  return false;
end;
$$;

create or replace function public.rooms_specialized_require_service_role_v1()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'room_specialized_service_role_required';
  end if;
end;
$$;

revoke all on function public.rooms_specialized_loge_preview_media_path_valid_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rooms_specialized_loge_preview_media_path_valid_v1(uuid, text, jsonb)
  to service_role;
revoke all on function public.rooms_specialized_require_service_role_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_specialized_require_service_role_v1()
  to service_role;

alter table public.room_specialized_state_v1
  drop constraint if exists room_specialized_loge_preview_media_path_valid_v1;
alter table public.room_specialized_state_v1
  add constraint room_specialized_loge_preview_media_path_valid_v1
  check (public.rooms_specialized_loge_preview_media_path_valid_v1(room_id, room_type, state))
  not valid;
alter table public.room_specialized_state_v1
  validate constraint room_specialized_loge_preview_media_path_valid_v1;

create or replace function public.rooms_specialized_loge_preview_can_upload_v1(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.rooms_v2 room
    join public.room_specialized_state_v1 specialized on specialized.room_id = room.id
    where specialized.room_type = 'loge'
      and room.status = 'live'
      and public.rooms_specialized_is_control_v1(room.id, auth.uid())
      and p_name ~* (
        '^' || room.id::text || '/' || auth.uid()::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(wav|mp3|aac|flac|m4a)$'
      )
  );
$$;

create or replace function public.rooms_specialized_loge_preview_can_manage_v1(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.rooms_v2 room
    join public.room_specialized_state_v1 specialized on specialized.room_id = room.id
    where specialized.room_type = 'loge'
      and room.status in ('live', 'ended')
      and public.rooms_specialized_is_control_v1(room.id, auth.uid())
      and p_name ~* (
        '^' || room.id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(wav|mp3|aac|flac|m4a)$'
      )
  );
$$;

create or replace function public.rooms_specialized_loge_preview_can_delete_v1(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rooms_specialized_loge_preview_can_manage_v1(p_name)
    and not exists (
      select 1
      from public.room_specialized_state_v1 specialized
      where specialized.room_type = 'loge'
        and specialized.room_id::text = split_part(p_name, '/', 1)
        and specialized.state #>> '{loge,preview,mediaPath}' = p_name
    );
$$;

revoke all on function public.rooms_specialized_loge_preview_can_upload_v1(text)
  from public, anon, authenticated;
revoke all on function public.rooms_specialized_loge_preview_can_manage_v1(text)
  from public, anon, authenticated;
revoke all on function public.rooms_specialized_loge_preview_can_delete_v1(text)
  from public, anon, authenticated;
grant execute on function public.rooms_specialized_loge_preview_can_upload_v1(text)
  to authenticated, service_role;
grant execute on function public.rooms_specialized_loge_preview_can_manage_v1(text)
  to service_role;
grant execute on function public.rooms_specialized_loge_preview_can_delete_v1(text)
  to authenticated, service_role;

drop policy if exists room_loge_preview_control_upload_v1 on storage.objects;
create policy room_loge_preview_control_upload_v1
on storage.objects for insert to authenticated
with check (
  bucket_id = 'room-loge-previews'
  and public.rooms_specialized_loge_preview_can_upload_v1(name)
);

-- No browser role receives SELECT on this bucket. Controls and eligible
-- Viewers alike obtain playback URLs through the same server-side issuer.
drop policy if exists room_loge_preview_control_read_v1 on storage.objects;

drop policy if exists room_loge_preview_control_delete_v1 on storage.objects;
create policy room_loge_preview_control_delete_v1
on storage.objects for delete to authenticated
using (
  bucket_id = 'room-loge-previews'
  and public.rooms_specialized_loge_preview_can_delete_v1(name)
);

create or replace function public.rooms_authorize_loge_preview_media_v1(
  p_room_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_room_status text;
  v_preview jsonb;
  v_media_path text;
  v_preview_expires_at timestamptz;
  v_control boolean := false;
  v_available boolean := false;
begin
  perform public.rooms_specialized_require_service_role_v1();
  if p_room_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_loge_preview_media_request';
  end if;

  select specialized.*
    into v_row
  from public.room_specialized_state_v1 specialized
  join public.rooms_v2 room on room.id = specialized.room_id
  where specialized.room_id = p_room_id
    and specialized.room_type = 'loge';
  if not found then
    raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
  end if;
  select room.status into v_room_status
  from public.rooms_v2 room
  where room.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then
    raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
  end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = p_room_id and ban.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
  end if;

  v_preview := v_row.state #> '{loge,preview}';
  if v_preview is null
     or jsonb_typeof(v_preview) <> 'object'
     or jsonb_typeof(v_preview->'mediaPath') is distinct from 'string' then
    raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
  end if;
  v_media_path := v_preview->>'mediaPath';
  if not public.rooms_specialized_loge_preview_media_path_valid_v1(
    p_room_id,
    'loge',
    v_row.state
  ) or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'room-loge-previews'
      and object.name = v_media_path
  ) then
    raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
  end if;

  v_control := public.rooms_specialized_is_control_v1(p_room_id, p_user_id);
  if nullif(v_preview->>'expiresAt', '') is not null then
    begin
      v_preview_expires_at := (v_preview->>'expiresAt')::timestamptz;
    exception when others then
      raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
    end;
  end if;

  if not v_control then
    if not public.rooms_specialized_loge_eligible_v1(p_room_id, p_user_id, v_row.state)
       or coalesce(v_preview->>'mediaName', '') = ''
       or (v_preview_expires_at is not null and v_preview_expires_at <= now()) then
      raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
    end if;
    v_available := case
      when coalesce((v_preview->>'liveOnly')::boolean, false) then
        v_room_status = 'live'
        and coalesce((v_preview->>'playing')::boolean, false)
      when coalesce((v_preview->>'replayIncluded')::boolean, false) then
        v_room_status in ('live', 'ended')
      else false
    end;
    if not v_available then
      raise exception using errcode = '42501', message = 'loge_preview_media_not_authorized';
    end if;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'media_path', v_media_path,
    'is_control', v_control,
    'preview_expires_at', v_preview_expires_at
  );
end;
$$;

revoke all on function public.rooms_authorize_loge_preview_media_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_authorize_loge_preview_media_v1(uuid, uuid)
  to service_role;

create or replace function public.rooms_specialized_project_state_v3(
  p_state jsonb,
  p_room_type text,
  p_user_id uuid,
  p_control boolean default false,
  p_artist boolean default false,
  p_room_status text default 'live'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_preview jsonb;
  v_available boolean;
begin
  v_state := public.rooms_specialized_project_state_v2(
    p_state,
    p_room_type,
    p_user_id,
    p_control,
    p_artist
  );
  if p_control or p_room_type <> 'loge' or (v_state #> '{loge,preview}') is null then
    return v_state;
  end if;

  v_preview := v_state #> '{loge,preview}';
  v_available := coalesce(
    coalesce(v_preview->>'mediaName', '') <> ''
    and jsonb_typeof(v_preview->'mediaPath') = 'string'
    and (
      nullif(v_preview->>'expiresAt', '') is null
      or (v_preview->>'expiresAt')::timestamptz > now()
    )
    and case
      when coalesce((v_preview->>'liveOnly')::boolean, false) then
        p_room_status = 'live'
        and coalesce((v_preview->>'playing')::boolean, false)
      when coalesce((v_preview->>'replayIncluded')::boolean, false) then
        p_room_status in ('live', 'ended')
      else false
    end,
    false
  );

  -- Object paths are control-only. The Viewer signs by room id through the
  -- authority function and never receives the persistent Storage locator.
  v_state := jsonb_set(v_state, '{loge,preview,mediaPath}', 'null'::jsonb, true);
  if not v_available then
    v_state := jsonb_set(v_state, '{loge,preview,mediaName}', '""'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,playing}', 'false'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,durationSeconds}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,channels}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,sampleRate}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,waveformPeaks}', '[]'::jsonb, true);
  end if;
  return v_state;
end;
$$;

revoke all on function public.rooms_specialized_project_state_v3(jsonb, text, uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.rooms_specialized_project_state_v3(jsonb, text, uuid, boolean, boolean, text)
  to service_role;

create or replace function public.rooms_get_specialized_state_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_uid uuid := auth.uid();
  v_control boolean;
  v_artist boolean := false;
  v_eligible boolean := false;
  v_projected jsonb;
  v_room_status text;
begin
  select room.status into v_room_status
  from public.rooms_v2 room
  where room.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;

  select * into v_row
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id;
  if not found then return null; end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = p_room_id and ban.user_id = v_uid
  ) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;

  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 participant
      where participant.room_id = p_room_id
        and participant.user_id = v_uid
        and participant.left_at is null
        and participant.role in ('guest', 'artist')
    );
  end if;
  v_eligible := v_control or (
    v_uid is not null
    and (
      v_row.room_type <> 'loge'
      or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state)
    )
  );

  v_projected := public.rooms_specialized_project_state_v3(
    v_row.state,
    v_row.room_type,
    v_uid,
    v_control,
    v_artist,
    v_room_status
  );
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé',
      'description', '',
      'mediaName', '',
      'mediaPath', null,
      'playing', false,
      'replayIncluded', false,
      'liveOnly', true,
      'expiresAt', null,
      'durationSeconds', null,
      'channels', null,
      'sampleRate', null,
      'waveformPeaks', '[]'::jsonb
    ), true);
    v_projected := jsonb_set(v_projected, '{loge,questionsOpen}', 'false'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,questions}', '[]'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,moments}', '[]'::jsonb, true);
  end if;
  return jsonb_set(
    v_projected,
    '{audience}',
    jsonb_build_object('eligible', v_eligible),
    true
  );
end;
$$;

revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
grant execute on function public.rooms_get_specialized_state_v1(uuid)
  to anon, authenticated, service_role;

comment on function public.rooms_authorize_loge_preview_media_v1(uuid, uuid)
  is 'Service-only authorization for short-lived Loge preview URLs. Resolves the exact private object from authoritative state.';
comment on function public.rooms_specialized_project_state_v3(jsonb, text, uuid, boolean, boolean, text)
  is 'Specialized Room projection that keeps Loge mediaPath control-only and applies Room status to preview availability.';
