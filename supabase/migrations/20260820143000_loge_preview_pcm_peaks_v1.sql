-- Persist a compact, real PCM analysis for La Loge previews while keeping
-- unavailable media (and its recognizable waveform) out of Viewer projections.

create or replace function public.rooms_specialized_loge_preview_analysis_valid_v1(p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_preview jsonb;
  v_peaks jsonb;
  v_length integer;
  v_index integer;
  v_minimum numeric;
  v_maximum numeric;
begin
  if coalesce(p_state->>'roomType', '') <> 'loge' or (p_state #> '{loge,preview}') is null then
    return true;
  end if;

  v_preview := p_state #> '{loge,preview}';

  if v_preview ? 'durationSeconds' and jsonb_typeof(v_preview->'durationSeconds') <> 'null' then
    if jsonb_typeof(v_preview->'durationSeconds') <> 'number' then return false; end if;
    if (v_preview->>'durationSeconds')::numeric < 0 or (v_preview->>'durationSeconds')::numeric > 86400 then return false; end if;
  end if;

  if v_preview ? 'channels' and jsonb_typeof(v_preview->'channels') <> 'null' then
    if jsonb_typeof(v_preview->'channels') <> 'number' then return false; end if;
    if (v_preview->>'channels')::numeric <> trunc((v_preview->>'channels')::numeric)
       or (v_preview->>'channels')::integer not between 1 and 8 then return false; end if;
  end if;

  if v_preview ? 'sampleRate' and jsonb_typeof(v_preview->'sampleRate') <> 'null' then
    if jsonb_typeof(v_preview->'sampleRate') <> 'number' then return false; end if;
    if (v_preview->>'sampleRate')::numeric <> trunc((v_preview->>'sampleRate')::numeric)
       or (v_preview->>'sampleRate')::integer not between 8000 and 384000 then return false; end if;
  end if;

  if not (v_preview ? 'waveformPeaks') then return true; end if;
  v_peaks := v_preview->'waveformPeaks';
  if jsonb_typeof(v_peaks) <> 'array' then return false; end if;
  v_length := jsonb_array_length(v_peaks);
  if v_length > 1024 or mod(v_length, 2) <> 0 then return false; end if;

  v_index := 0;
  while v_index < v_length loop
    if jsonb_typeof(v_peaks->v_index) <> 'number'
       or jsonb_typeof(v_peaks->(v_index + 1)) <> 'number' then return false; end if;
    v_minimum := (v_peaks->>v_index)::numeric;
    v_maximum := (v_peaks->>(v_index + 1))::numeric;
    if v_minimum <> trunc(v_minimum) or v_maximum <> trunc(v_maximum)
       or v_minimum < -32768 or v_maximum > 32767
       or v_minimum > v_maximum then return false; end if;
    v_index := v_index + 2;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.rooms_specialized_loge_preview_analysis_valid_v1(jsonb) from public, anon, authenticated;
grant execute on function public.rooms_specialized_loge_preview_analysis_valid_v1(jsonb) to service_role;

alter table public.room_specialized_state_v1
  drop constraint if exists room_specialized_loge_preview_analysis_valid_v1;
alter table public.room_specialized_state_v1
  add constraint room_specialized_loge_preview_analysis_valid_v1
  check (public.rooms_specialized_loge_preview_analysis_valid_v1(state)) not valid;
alter table public.room_specialized_state_v1
  validate constraint room_specialized_loge_preview_analysis_valid_v1;

create or replace function public.rooms_specialized_project_state_v2(
  p_state jsonb,
  p_room_type text,
  p_user_id uuid,
  p_control boolean default false,
  p_artist boolean default false
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
begin
  v_state := public.rooms_specialized_project_state_v1(p_state, p_room_type, p_user_id, p_control, p_artist);
  if p_control or p_room_type <> 'loge' or (v_state #> '{loge,preview}') is null then return v_state; end if;

  v_preview := v_state #> '{loge,preview}';
  if coalesce(v_preview->>'mediaName', '') = ''
     or (nullif(v_preview->>'expiresAt', '') is not null and (v_preview->>'expiresAt')::timestamptz <= now())
     or (coalesce((v_preview->>'liveOnly')::boolean, false) and not coalesce((v_preview->>'playing')::boolean, false))
     or (not coalesce((v_preview->>'liveOnly')::boolean, false) and not coalesce((v_preview->>'replayIncluded')::boolean, false)) then
    v_state := jsonb_set(v_state, '{loge,preview,mediaName}', '""'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,mediaPath}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,playing}', 'false'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,durationSeconds}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,channels}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,sampleRate}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{loge,preview,waveformPeaks}', '[]'::jsonb, true);
  end if;
  return v_state;
end;
$$;

revoke all on function public.rooms_specialized_project_state_v2(jsonb, text, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.rooms_specialized_project_state_v2(jsonb, text, uuid, boolean, boolean) to service_role;

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
  select r.status into v_room_status from public.rooms_v2 r where r.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;
  select * into v_row from public.room_specialized_state_v1 s where s.room_id = p_room_id;
  if not found then return null; end if;
  if exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = v_uid) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;
  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 p
      where p.room_id = p_room_id and p.user_id = v_uid and p.left_at is null and p.role in ('guest', 'artist')
    );
  end if;
  v_eligible := v_control or (
    v_uid is not null
    and (
      v_row.room_type <> 'loge'
      or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state)
    )
  );
  v_projected := public.rooms_specialized_project_state_v2(v_row.state, v_row.room_type, v_uid, v_control, v_artist);
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé', 'description', '', 'mediaName', '', 'mediaPath', null, 'playing', false,
      'replayIncluded', false, 'liveOnly', true, 'expiresAt', null,
      'durationSeconds', null, 'channels', null, 'sampleRate', null, 'waveformPeaks', '[]'::jsonb
    ), true);
    v_projected := jsonb_set(v_projected, '{loge,questionsOpen}', 'false'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,questions}', '[]'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,moments}', '[]'::jsonb, true);
  end if;
  return jsonb_set(v_projected, '{audience}', jsonb_build_object('eligible', v_eligible), true);
end;
$$;

revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
grant execute on function public.rooms_get_specialized_state_v1(uuid) to anon, authenticated, service_role;

comment on function public.rooms_specialized_loge_preview_analysis_valid_v1(jsonb)
  is 'Bounds and validates compact int16 PCM min/max bins stored with a Loge preview.';
