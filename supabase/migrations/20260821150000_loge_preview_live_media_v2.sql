-- La Loge Avant-première is a live gesture, not a scheduled publication.
-- Extend the private bucket to universal media and authorize viewers only
-- while a guarded live transport session is active.

update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'audio/wav','audio/x-wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a',
      'video/mp4','video/webm','image/jpeg','image/png','image/webp'
    ]
where id = 'room-loge-previews';

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
begin
  if p_room_type <> 'loge' then return true; end if;
  v_preview := p_state #> '{loge,preview}';
  if v_preview is null or jsonb_typeof(v_preview) <> 'object' then return false; end if;
  if jsonb_typeof(v_preview->'mediaName') is distinct from 'string' then return false; end if;
  if char_length(v_preview->>'mediaName') > 255 then return false; end if;
  if v_preview ? 'mediaKind'
     and jsonb_typeof(v_preview->'mediaKind') <> 'null'
     and (jsonb_typeof(v_preview->'mediaKind') <> 'string' or v_preview->>'mediaKind' not in ('audio','video','image')) then
    return false;
  end if;
  if not (v_preview ? 'mediaPath') or jsonb_typeof(v_preview->'mediaPath') = 'null' then return true; end if;
  if jsonb_typeof(v_preview->'mediaPath') <> 'string' then return false; end if;
  v_media_path := v_preview->>'mediaPath';
  return char_length(v_media_path) <= 240
    and split_part(v_media_path, '/', 1) = p_room_id::text
    and v_media_path ~* ('^' || p_room_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      || '\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$')
    and char_length(btrim(coalesce(v_preview->>'mediaName',''))) between 1 and 255;
exception when others then return false;
end;
$$;

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
      and p_name ~* ('^' || room.id::text || '/' || auth.uid()::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$')
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
      and room.status in ('live','ended')
      and public.rooms_specialized_is_control_v1(room.id, auth.uid())
      and p_name ~* ('^' || room.id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$')
  );
$$;

create or replace function public.rooms_authorize_loge_preview_media_v1(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_preview jsonb;
  v_media_path text;
  v_control boolean;
begin
  perform public.rooms_specialized_require_service_role_v1();
  select specialized.* into v_row
  from public.room_specialized_state_v1 specialized
  join public.rooms_v2 room on room.id = specialized.room_id
  where specialized.room_id = p_room_id and specialized.room_type = 'loge' and room.status = 'live';
  if not found or p_user_id is null or exists (
    select 1 from public.room_bans_v2 ban where ban.room_id = p_room_id and ban.user_id = p_user_id
  ) then raise exception using errcode='42501', message='loge_preview_media_not_authorized'; end if;
  v_preview := v_row.state #> '{loge,preview}';
  if v_preview is null or jsonb_typeof(v_preview->'mediaPath') is distinct from 'string'
     or not public.rooms_specialized_loge_preview_media_path_valid_v1(p_room_id,'loge',v_row.state) then
    raise exception using errcode='42501', message='loge_preview_media_not_authorized';
  end if;
  v_media_path := v_preview->>'mediaPath';
  if not exists (select 1 from storage.objects object where object.bucket_id='room-loge-previews' and object.name=v_media_path) then
    raise exception using errcode='42501', message='loge_preview_media_not_authorized';
  end if;
  v_control := public.rooms_specialized_is_control_v1(p_room_id,p_user_id);
  if not v_control and (
    not public.rooms_specialized_loge_eligible_v1(p_room_id,p_user_id,v_row.state)
    or coalesce(v_preview->>'mediaName','') = ''
    or coalesce(v_preview->>'sessionId','') = ''
    or coalesce(v_preview->>'transportStatus','idle') not in ('playing','paused')
  ) then raise exception using errcode='42501', message='loge_preview_media_not_authorized'; end if;
  return jsonb_build_object('room_id',p_room_id,'media_path',v_media_path,'is_control',v_control,'preview_expires_at',null);
end;
$$;

comment on function public.rooms_authorize_loge_preview_media_v1(uuid,uuid)
is 'Service-only issuer for live Loge preview media. Viewer access exists only during an active guarded transport session.';

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
  v_state := public.rooms_specialized_project_state_v2(p_state,p_room_type,p_user_id,p_control,p_artist);
  if p_control or p_room_type <> 'loge' or (v_state #> '{loge,preview}') is null then return v_state; end if;
  v_preview := v_state #> '{loge,preview}';
  v_available := coalesce(
    p_room_status = 'live'
    and coalesce(v_preview->>'mediaName','') <> ''
    and jsonb_typeof(v_preview->'mediaPath') = 'string'
    and coalesce(v_preview->>'sessionId','') <> ''
    and coalesce(v_preview->>'transportStatus','idle') in ('playing','paused'),
    false
  );
  v_state := jsonb_set(v_state,'{loge,preview,mediaPath}','null'::jsonb,true);
  if not v_available then
    v_state := jsonb_set(v_state,'{loge,preview,mediaName}','""'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,mediaKind}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,playing}','false'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,transportStatus}','"idle"'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,sessionId}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,durationSeconds}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,channels}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,sampleRate}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{loge,preview,waveformPeaks}','[]'::jsonb,true);
  end if;
  return v_state;
end;
$$;

revoke all on function public.rooms_specialized_project_state_v3(jsonb,text,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.rooms_specialized_project_state_v3(jsonb,text,uuid,boolean,boolean,text) to service_role;
