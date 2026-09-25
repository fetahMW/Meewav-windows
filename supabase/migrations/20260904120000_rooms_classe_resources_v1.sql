begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-classe-resources',
  'room-classe-resources',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/aac',
    'audio/flac', 'audio/mp4', 'audio/x-m4a'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.rooms_classe_resources_state_valid_v1(
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
  v_resources jsonb;
  v_resource jsonb;
  v_id uuid;
  v_path text;
  v_name text;
  v_kind text;
  v_mime text;
  v_extension text;
  v_size bigint;
  v_added_at timestamptz;
  v_ids text[] := '{}';
begin
  if p_room_type <> 'classe' then return true; end if;
  if not (coalesce(p_state->'classe', '{}'::jsonb) ? 'resources') then return true; end if;
  v_resources := p_state #> '{classe,resources}';
  if jsonb_typeof(v_resources) <> 'array' or jsonb_array_length(v_resources) > 24 then return false; end if;

  for v_resource in select value from jsonb_array_elements(v_resources)
  loop
    if jsonb_typeof(v_resource) <> 'object'
       or (v_resource - array['id','name','kind','mimeType','size','addedAt','mediaPath']::text[]) <> '{}'::jsonb
       or jsonb_typeof(v_resource->'id') is distinct from 'string'
       or jsonb_typeof(v_resource->'name') is distinct from 'string'
       or jsonb_typeof(v_resource->'kind') is distinct from 'string'
       or jsonb_typeof(v_resource->'mimeType') is distinct from 'string'
       or jsonb_typeof(v_resource->'size') is distinct from 'number'
       or jsonb_typeof(v_resource->'addedAt') is distinct from 'string'
       or jsonb_typeof(v_resource->'mediaPath') is distinct from 'string' then
      return false;
    end if;

    v_id := public.rooms_classe_uuid_text_v1(v_resource->>'id');
    v_name := btrim(v_resource->>'name');
    v_kind := v_resource->>'kind';
    v_mime := v_resource->>'mimeType';
    v_size := (v_resource->>'size')::bigint;
    v_added_at := (v_resource->>'addedAt')::timestamptz;
    v_path := v_resource->>'mediaPath';
    v_extension := lower(split_part(v_path, '.', -1));

    if v_id is null
       or v_id::text = any(v_ids)
       or char_length(v_name) not between 1 and 120
       or v_name ~ '[[:cntrl:]]'
       or v_kind not in ('image', 'audio')
       or v_size not between 1 and 26214400
       or v_added_at is null
       or char_length(v_path) > 240
       or split_part(v_path, '/', 1) <> p_room_id::text
       or v_path !~* (
         '^' || p_room_id::text
         || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
         || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
         || '\.(jpg|jpeg|png|webp|gif|wav|mp3|aac|flac|m4a)$'
       )
       or (v_kind = 'image' and v_mime not in ('image/jpeg','image/png','image/webp','image/gif'))
       or (v_kind = 'audio' and v_mime not in ('audio/wav','audio/x-wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a'))
       or (v_mime = 'image/jpeg' and v_extension not in ('jpg','jpeg'))
       or (v_mime = 'image/png' and v_extension <> 'png')
       or (v_mime = 'image/webp' and v_extension <> 'webp')
       or (v_mime = 'image/gif' and v_extension <> 'gif')
       or (v_mime in ('audio/wav','audio/x-wav') and v_extension <> 'wav')
       or (v_mime = 'audio/mpeg' and v_extension <> 'mp3')
       or (v_mime = 'audio/aac' and v_extension <> 'aac')
       or (v_mime = 'audio/flac' and v_extension <> 'flac')
       or (v_mime in ('audio/mp4','audio/x-m4a') and v_extension <> 'm4a') then
      return false;
    end if;
    v_ids := array_append(v_ids, v_id::text);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.rooms_classe_resources_state_valid_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rooms_classe_resources_state_valid_v1(uuid, text, jsonb)
  to service_role;

alter table public.room_specialized_state_v1
  drop constraint if exists rooms_classe_resources_state_valid_v1;
alter table public.room_specialized_state_v1
  add constraint rooms_classe_resources_state_valid_v1
  check (public.rooms_classe_resources_state_valid_v1(room_id, room_type, state))
  not valid;
alter table public.room_specialized_state_v1
  validate constraint rooms_classe_resources_state_valid_v1;

create or replace function public.rooms_classe_resource_can_upload_v1(p_name text)
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
    where specialized.room_type = 'classe'
      and room.status = 'live'
      and public.rooms_specialized_is_control_v1(room.id, auth.uid())
      and p_name ~* (
        '^' || room.id::text || '/' || auth.uid()::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(jpg|jpeg|png|webp|gif|wav|mp3|aac|flac|m4a)$'
      )
  );
$$;

create or replace function public.rooms_classe_resource_can_delete_v1(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rooms_classe_resource_can_upload_v1(p_name)
    and not exists (
      select 1
      from public.room_specialized_state_v1 specialized,
      lateral jsonb_array_elements(
        case when jsonb_typeof(specialized.state #> '{classe,resources}') = 'array'
          then specialized.state #> '{classe,resources}' else '[]'::jsonb end
      ) resource
      where specialized.room_type = 'classe'
        and specialized.room_id::text = split_part(p_name, '/', 1)
        and resource.value->>'mediaPath' = p_name
    );
$$;

revoke all on function public.rooms_classe_resource_can_upload_v1(text)
  from public, anon, authenticated;
revoke all on function public.rooms_classe_resource_can_delete_v1(text)
  from public, anon, authenticated;
grant execute on function public.rooms_classe_resource_can_upload_v1(text)
  to authenticated, service_role;
grant execute on function public.rooms_classe_resource_can_delete_v1(text)
  to authenticated, service_role;

drop policy if exists room_classe_resource_control_upload_v1 on storage.objects;
create policy room_classe_resource_control_upload_v1
on storage.objects for insert to authenticated
with check (
  bucket_id = 'room-classe-resources'
  and public.rooms_classe_resource_can_upload_v1(name)
);

-- Browsers never receive SELECT on the private bucket. A server-side issuer
-- authorizes one resource id, then signs the exact object for two minutes.
drop policy if exists room_classe_resource_browser_read_v1 on storage.objects;

drop policy if exists room_classe_resource_control_delete_v1 on storage.objects;
create policy room_classe_resource_control_delete_v1
on storage.objects for delete to authenticated
using (
  bucket_id = 'room-classe-resources'
  and public.rooms_classe_resource_can_delete_v1(name)
);

create or replace function public.rooms_authorize_classe_resource_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_resource_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_resource jsonb;
  v_path text;
  v_name text;
begin
  perform public.rooms_specialized_require_service_role_v1();
  if p_room_id is null or p_user_id is null or p_resource_id is null then
    raise exception using errcode = '22023', message = 'invalid_class_resource_request';
  end if;
  select specialized.* into v_row
  from public.room_specialized_state_v1 specialized
  join public.rooms_v2 room on room.id = specialized.room_id
  where specialized.room_id = p_room_id
    and specialized.room_type = 'classe'
    and room.status = 'live';
  if not found then raise exception using errcode = 'P0002', message = 'class_resource_unavailable'; end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = p_room_id and ban.user_id = p_user_id
  ) then raise exception using errcode = '42501', message = 'class_resource_unavailable'; end if;
  if not public.rooms_specialized_is_control_v1(p_room_id, p_user_id)
     and not public.rooms_classe_active_seat_v1(p_room_id, p_user_id) then
    raise exception using errcode = '42501', message = 'class_resource_unavailable';
  end if;

  select resource.value into v_resource
  from jsonb_array_elements(
    case when jsonb_typeof(v_row.state #> '{classe,resources}') = 'array'
      then v_row.state #> '{classe,resources}' else '[]'::jsonb end
  ) resource
  where resource.value->>'id' = p_resource_id::text
  limit 1;
  if v_resource is null then raise exception using errcode = 'P0002', message = 'class_resource_unavailable'; end if;
  v_path := v_resource->>'mediaPath';
  v_name := v_resource->>'name';
  if not public.rooms_classe_resources_state_valid_v1(
    p_room_id,
    'classe',
    jsonb_build_object('classe', jsonb_build_object('resources', jsonb_build_array(v_resource)))
  ) or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'room-classe-resources' and object.name = v_path
  ) then raise exception using errcode = 'P0002', message = 'class_resource_unavailable'; end if;
  return jsonb_build_object(
    'room_id', p_room_id::text,
    'resource_id', p_resource_id::text,
    'media_path', v_path,
    'download_name', v_name
  );
end;
$$;

revoke all on function public.rooms_authorize_classe_resource_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_authorize_classe_resource_v1(uuid, uuid, uuid)
  to service_role;

create or replace function public.rooms_project_classe_resources_v1(
  p_state jsonb,
  p_room_type text,
  p_control boolean,
  p_has_active_seat boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resources jsonb := '[]'::jsonb;
  v_resource jsonb;
begin
  if p_room_type <> 'classe' then return p_state; end if;
  if not p_control and not p_has_active_seat then
    return jsonb_set(p_state, '{classe,resources}', '[]'::jsonb, true);
  end if;
  if p_control then return p_state; end if;
  for v_resource in select value from jsonb_array_elements(
    case when jsonb_typeof(p_state #> '{classe,resources}') = 'array'
      then p_state #> '{classe,resources}' else '[]'::jsonb end
  ) loop
    v_resources := v_resources || jsonb_build_array(v_resource - 'mediaPath' - 'mediaUrl');
  end loop;
  return jsonb_set(p_state, '{classe,resources}', v_resources, true);
end;
$$;

revoke all on function public.rooms_project_classe_resources_v1(jsonb, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.rooms_project_classe_resources_v1(jsonb, text, boolean, boolean)
  to service_role;

-- Compose every current specialized privacy pass, then remove Classe paths for
-- participants and all resource metadata for non-seated Viewers.
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
  v_classe_seat_number smallint;
  v_classe_access_kind text;
  v_actor_role text;
begin
  select room.status into v_room_status from public.rooms_v2 room where room.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;
  select * into v_row from public.room_specialized_state_v1 specialized where specialized.room_id = p_room_id;
  if not found then return null; end if;
  if exists (select 1 from public.room_bans_v2 ban where ban.room_id = p_room_id and ban.user_id = v_uid) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;
  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 participant
      where participant.room_id = p_room_id and participant.user_id = v_uid
        and participant.left_at is null and participant.role in ('guest', 'artist')
    );
  end if;
  if v_row.room_type = 'classe' and public.rooms_classe_active_seat_v1(p_room_id, v_uid) then
    select entitlement.seat_number, entitlement.access_kind
    into v_classe_seat_number, v_classe_access_kind
    from public.room_classe_seat_entitlements_v1 entitlement
    where entitlement.room_id = p_room_id and entitlement.student_id = v_uid and entitlement.status = 'active';
  end if;
  v_actor_role := case
    when v_uid is null then 'visitor'
    when exists (select 1 from public.rooms_v2 room where room.id = p_room_id and room.host_id = v_uid) then 'host'
    when v_control then 'regisseur'
    when v_classe_seat_number is not null then 'premium_participant'
    else 'viewer'
  end;
  if v_row.room_type = 'classe' then
    v_eligible := v_control or v_classe_seat_number is not null;
  else
    v_eligible := v_control or (
      v_uid is not null and (v_row.room_type <> 'loge' or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state))
    );
  end if;

  v_projected := public.rooms_specialized_project_state_v3(v_row.state, v_row.room_type, v_uid, v_control, v_artist, v_room_status);
  if v_row.room_type = 'classe' then
    v_projected := public.rooms_project_classe_seats_v1(p_room_id, v_projected, v_uid, v_control);
  end if;
  v_projected := public.rooms_project_classe_questions_v1(
    v_projected, v_row.room_type, v_uid, v_control, v_classe_seat_number is not null
  );
  v_projected := public.rooms_project_classe_resources_v1(
    v_projected, v_row.room_type, v_control, v_classe_seat_number is not null
  );
  if v_row.room_type = 'scene' then
    v_projected := public.rooms_specialized_project_scene_evaluations_v1(v_projected, p_room_id, v_uid, v_control);
  end if;
  if v_row.room_type = 'wave' then
    v_projected := public.rooms_specialized_sanitize_wave_votes_v1(v_projected, v_row.state, v_uid, v_control);
  end if;
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé', 'description', '', 'mediaName', '', 'mediaPath', null,
      'playing', false, 'replayIncluded', false, 'liveOnly', true, 'expiresAt', null,
      'durationSeconds', null, 'channels', null, 'sampleRate', null, 'waveformPeaks', '[]'::jsonb
    ), true);
    v_projected := jsonb_set(v_projected, '{loge,questionsOpen}', 'false'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,questions}', '[]'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,moments}', '[]'::jsonb, true);
  end if;
  return jsonb_set(v_projected, '{audience}', jsonb_build_object(
    'eligible', v_eligible,
    'actorRole', v_actor_role,
    'classeSeatNumber', v_classe_seat_number,
    'classeAccessKind', v_classe_access_kind
  ), true);
end;
$$;

revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
grant execute on function public.rooms_get_specialized_state_v1(uuid) to anon, authenticated, service_role;

comment on function public.rooms_authorize_classe_resource_v1(uuid, uuid, uuid)
  is 'Service-only authority for one private Class resource; accepts controls and active entitled seats only.';

commit;
