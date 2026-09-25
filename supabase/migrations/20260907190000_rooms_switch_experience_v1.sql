-- One live / one media session. Six experiences; each tools state is retained.
begin;
-- Existing Cage validator/initializer, with an explicit CASE expression boundary.
create or replace function public.rooms_cage_valid_config_v1(p_config jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_count integer; v_rules jsonb;
begin
  if jsonb_typeof(p_config) is distinct from 'object' or not (p_config ?& array['version','title','discipline','format','participantCount','rosterMode','rosterProfileIds','rules'])
    or (p_config->>'version')::integer is distinct from 1
    or exists(select 1 from jsonb_each(p_config) where key in ('format','rosterMode','participantCount','rules') and value='null'::jsonb)
    or nullif(btrim(p_config->>'title'),'') is null
    or p_config->>'format' not in ('tournament','championship','open-mic')
    or p_config->>'rosterMode' not in ('prepared','first-eligible','manual','random')
    or jsonb_typeof(p_config->'rosterProfileIds') is distinct from 'array'
    or pg_column_size(p_config)>65536 then raise exception 'cage_configuration_invalid'; end if;
  v_count := (p_config->>'participantCount')::integer;
  v_rules := p_config->'rules';
  if v_count is null or v_count<(case when p_config->>'format'='open-mic' then 1 else 2 end) or v_count>64 or jsonb_typeof(v_rules) is distinct from 'object'
    or not (v_rules ?& array['performanceMode','rounds','passageDurationSeconds','votingDurationSeconds','votingMode','tieBreak','allowByes','allowFormatReduction','allowReplacement','disconnectGraceSeconds','noShowGraceSeconds'])
    or v_rules->>'performanceMode' not in ('successive','alternating','simultaneous')
    or (v_rules->>'rounds')::integer not between 1 and 9
    or (v_rules->>'passageDurationSeconds')::integer not between 10 and 1800
    or (v_rules->>'votingDurationSeconds')::integer not between 10 and 600
    or v_rules->>'votingMode' not in ('public','jury','mixed')
    or v_rules->>'tieBreak' not in ('sudden-death','replay')
    or (v_rules->>'disconnectGraceSeconds')::integer not between 10 and 600
    or (v_rules->>'noShowGraceSeconds')::integer not between 10 and 1800
    or exists(select 1 from jsonb_each(v_rules) where value='null'::jsonb)
    or exists(select 1 from jsonb_each(v_rules) where key in ('allowByes','allowFormatReduction','allowReplacement') and jsonb_typeof(value)<>'boolean')
    then raise exception 'cage_rules_invalid'; end if;
  if p_config->>'format'='open-mic' and (v_rules->>'openMicFeedback' is null or v_rules->>'openMicFeedback' not in ('appreciation','scored','none')) then raise exception 'cage_open_mic_feedback_configuration_required'; end if;
  if p_config->>'format'='tournament' and (v_count & (v_count-1)) <> 0
    and not coalesce((v_rules->>'allowByes')::boolean,false) then raise exception 'cage_format_requires_byes'; end if;
  if jsonb_array_length(p_config->'rosterProfileIds') > v_count then raise exception 'cage_roster_too_large'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_config->'rosterProfileIds') id where id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_config->'rosterProfileIds')) then raise exception 'cage_roster_identity_invalid'; end if;
  return p_config || jsonb_build_object('title',left(btrim(p_config->>'title'),100));
end;
$$;

create or replace function public.rooms_cage_empty_state_v1(p_room_id uuid,p_config jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('roomId',p_room_id::text,'roomType','cage','revision',0,'updatedAt',null,
    'gifts',jsonb_build_object('stock','[]'::jsonb,'transactions','[]'::jsonb,'redemptions','[]'::jsonb),
    'cage',jsonb_build_object('format',p_config->>'format','event',jsonb_build_object('title',p_config->>'title','discipline',p_config->>'discipline','status','ready','seeding','manual','updatedAt',null),
      'matches','[]'::jsonb,'currentMatchId','','currentRound',1,'battleRound',1,'battleRoundCount',(p_config#>>'{rules,rounds}')::integer,
      'passageDurationSeconds',(p_config#>>'{rules,passageDurationSeconds}')::integer,'battleStatus','ready','battleStartedAt',null,'battleElapsedSeconds',0,'battleActiveSide',null,
      'votingMode',case when p_config#>>'{rules,votingMode}'='mixed' then 'weighted' else p_config#>>'{rules,votingMode}' end,
      'votingOpen',false,'votingDurationSeconds',(p_config#>>'{rules,votingDurationSeconds}')::integer,'votingEndsAt',null,'resultsHidden',true,'votes','{}'::jsonb,'resultHistory','[]'::jsonb,
      'runtime',jsonb_build_object('version',1,'config',p_config,'status','CHECK_IN','participants','[]'::jsonb,'matches','[]'::jsonb,'lockedAt',null,'activeMatchId',null,'preparedMatchId',null,'openMicEntries','[]'::jsonb,'activeEntryId',null,'preparedEntryId',null,'autoRegie',false,'publicBracketVisible',false,'journal','[]'::jsonb,'processedCommandIds','[]'::jsonb)));
$$;

create table public.room_experience_v1 (
 room_id uuid primary key references public.rooms_v2(id) on delete cascade,
 current_type text not null,previous_type text not null,version bigint not null default 0 check(version>=0),change_id uuid,changed_at timestamptz
);
create table public.room_experience_acceptance_v1 (
 room_id uuid references public.rooms_v2(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,accepted_version bigint not null,primary key(room_id,user_id)
);
create table public.room_experience_requests_v1 (
 room_id uuid references public.rooms_v2(id) on delete cascade,request_id uuid not null,actor_id uuid not null,destination text not null,version bigint not null,config jsonb not null,primary key(room_id,request_id)
);
create table public.room_experience_tools_v1 (
 room_id uuid references public.rooms_v2(id) on delete cascade,room_type text not null,state jsonb not null,primary key(room_id,room_type)
);
alter table public.room_experience_tools_v1 enable row level security;
revoke all on public.room_experience_tools_v1 from public,anon,authenticated;
grant all on public.room_experience_tools_v1 to service_role;
alter table public.room_experience_v1 enable row level security;
alter table public.room_experience_acceptance_v1 enable row level security;
alter table public.room_experience_requests_v1 enable row level security;
revoke all on public.room_experience_v1,public.room_experience_acceptance_v1,public.room_experience_requests_v1 from public,anon,authenticated;
grant all on public.room_experience_v1,public.room_experience_acceptance_v1,public.room_experience_requests_v1 to service_role;
create function public.rooms_experience_member_v1(p_room_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.rooms_v2 r where r.id=p_room_id and r.status='live' and (r.host_id=auth.uid() or exists(select 1 from public.room_participants_v2 p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null))) or exists(select 1 from public.room_bans_v2 b where b.room_id=p_room_id and b.user_id=auth.uid()) then raise exception 'switch_forbidden' using errcode='42501';end if;
end $$;
revoke all on function public.rooms_experience_member_v1(uuid) from public,anon,authenticated;
create function public.rooms_get_experience_v1(p_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.room_experience_v1%rowtype;r public.rooms_v2%rowtype;accepted bigint;
begin
 perform public.rooms_experience_member_v1(p_room_id);
 select * into r from public.rooms_v2 where id=p_room_id for update;
 insert into public.room_experience_v1(room_id,current_type,previous_type) values(r.id,r.type,r.type) on conflict do nothing;
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 insert into public.room_experience_acceptance_v1 values(p_room_id,auth.uid(),s.version) on conflict do nothing;
 select accepted_version into accepted from public.room_experience_acceptance_v1 where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('roomId',r.id,'current',s.current_type,'from',s.previous_type,'version',s.version,'changeId',s.change_id,'changedAt',s.changed_at,'acceptedVersion',case when r.host_id=auth.uid() then s.version else accepted end,'available',true,'prepared',(select coalesce(jsonb_agg(distinct kind),'[]'::jsonb) from (select s.current_type kind union select room_type from public.room_experience_tools_v1 where room_id=p_room_id union select room_type from public.room_specialized_state_v1 where room_id=p_room_id) prepared));
end $$;
revoke all on function public.rooms_get_experience_v1(uuid) from public,anon;
grant execute on function public.rooms_get_experience_v1(uuid) to authenticated;
create function public.rooms_accept_experience_v1(p_room_id uuid,p_version bigint,p_change_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.room_experience_v1%rowtype;
begin
 perform public.rooms_experience_member_v1(p_room_id);
 perform 1 from public.rooms_v2 where id=p_room_id for update;
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 if not found or s.version<>p_version or s.change_id is distinct from p_change_id then raise exception 'switch_stale' using errcode='40001';end if;
 insert into public.room_experience_acceptance_v1 values(p_room_id,auth.uid(),s.version) on conflict(room_id,user_id) do update set accepted_version=excluded.accepted_version;
 return public.rooms_get_experience_v1(p_room_id);
end $$;
revoke all on function public.rooms_accept_experience_v1(uuid,bigint,uuid) from public,anon;
grant execute on function public.rooms_accept_experience_v1(uuid,bigint,uuid) to authenticated;
create function public.rooms_assert_experience_v1(p_room_id uuid,p_type text) returns void language plpgsql security definer set search_path='' as $$
declare s public.room_experience_v1%rowtype;host uuid;
begin
 select host_id into host from public.rooms_v2 where id=p_room_id for update;
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 if not found or s.version=0 then return;end if;
 if s.current_type<>p_type then raise exception 'switch_stale' using errcode='40001';end if;
 if auth.role()='service_role' then return;end if;
 perform public.rooms_experience_member_v1(p_room_id);
 if host<>auth.uid() and not exists(select 1 from public.room_experience_acceptance_v1 where room_id=p_room_id and user_id=auth.uid() and accepted_version=s.version) then raise exception 'switch_stale' using errcode='40001';end if;
end $$;
revoke all on function public.rooms_assert_experience_v1(uuid,text) from public,anon,authenticated;
create function public.rooms_switch_experience_v1(p_room_id uuid,p_expected_version bigint,p_request_id uuid,p_destination text,p_config jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms_v2%rowtype;s public.room_experience_v1%rowtype;prior public.room_experience_requests_v1%rowtype;t jsonb;scene jsonb;program jsonb;host_name text;minutes integer;private_call boolean; v jsonb; dest jsonb; kind text; n integer; wave_id uuid;
begin
 perform set_config('meewav.switch_config',p_config::text,true);
 perform public.rooms_experience_member_v1(p_room_id);
 select * into r from public.rooms_v2 where id=p_room_id for update;
 if r.host_id<>auth.uid() or p_request_id is null then raise exception 'switch_forbidden' using errcode='42501';end if;
 select * into prior from public.room_experience_requests_v1 where room_id=p_room_id and request_id=p_request_id;
 if found then
  if prior.destination<>p_destination or prior.config is distinct from p_config then raise exception 'switch_conflict' using errcode='40001';end if;
  return public.rooms_get_experience_v1(p_room_id);
 end if;
 perform public.rooms_get_experience_v1(p_room_id);
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 if s.version<>p_expected_version then raise exception 'switch_conflict' using errcode='40001';end if;
 if s.current_type=p_destination then raise exception 'switch_current_room' using errcode='22023';end if;
 if s.current_type not in ('place','scene','cage','classe','wave','loge') or p_destination not in ('place','scene','cage','classe','wave','loge') then raise exception 'switch_destination_unavailable' using errcode='22023';end if;
 if s.changed_at>clock_timestamp()-interval '5 seconds' then raise exception 'switch_rate_limit' using errcode='55000';end if;
 if coalesce((to_jsonb(r)->>'is_recording')::boolean,false) then raise exception 'switch_busy' using errcode='55000';end if;
 if to_regclass('public.room_live_call_invitations_v1') is not null then
  execute 'select exists(select 1 from public.room_live_call_invitations_v1 where room_id=$1 and status in (''pending'',''accepted''))' into private_call using p_room_id;
  if private_call then raise exception 'switch_private_media' using errcode='55000';end if;
 end if;
 if s.current_type='place' then
  select state into t from public.room_place_tools_v1 where room_id=p_room_id for update;
  if t is not null and ((t#>>'{floor,status}') in ('running','paused') or (t#>>'{floor,current}') is not null or jsonb_array_length(coalesce(t#>'{floor,queue}','[]'))>0 or (t#>>'{clash,status}') not in ('ended','cancelled') or exists(select 1 from jsonb_array_elements(coalesce(t->'challenges','[]')) x where x->>'status' not in ('done','cancelled'))) then raise exception 'switch_busy' using errcode='55000';end if;
 else
  select state into t from public.room_specialized_state_v1 where room_id=p_room_id for update;
  if t is not null and (coalesce((t#>>'{scene,prompter,playing}')::boolean,false) or t#>>'{scene,fundraiser,status}'='live' or exists(select 1 from jsonb_array_elements(coalesce(t#>'{scene,program}','[]')) e where e->>'status'='live') or exists(select 1 from jsonb_each(coalesce(t#>'{scene,evaluation,byPerformance}','{}')) e where (e.value->>'open')::boolean)) then raise exception 'switch_busy' using errcode='55000';end if;
 end if;
 if t is not null and (
   (t#>>'{classe,privateTalkStudentId}') is not null or (t#>>'{classe,activeSpeakerId}') is not null or (t#>>'{classe,publicCallStudentId}') is not null
   or coalesce((t#>>'{loge,preview,playing}')::boolean,false)
   or exists(select 1 from jsonb_array_elements(coalesce(t#>'{loge,moments}','[]')) e where e->>'status'='live')
   or coalesce((t#>>'{cage,votingOpen}')::boolean,false)
   or t#>>'{cage,battleStatus}' in ('countdown','live-a','live-b','paused','incident')
 ) then raise exception 'switch_busy' using errcode='55000';end if;
 if s.current_type='wave' and to_regclass('public.wave_sessions_v3') is not null then
  execute 'select exists(select 1 from public.wave_sessions_v3 where room_id=$1 and lifecycle_state in (''CLOSURE_VOTE'',''FINALIZING''))' into private_call using p_room_id;
  if private_call then raise exception 'switch_busy' using errcode='55000';end if;
  if to_regclass('public.wave_vote_rounds_v3') is not null then
   execute 'select exists(select 1 from public.wave_vote_rounds_v3 v join public.wave_sessions_v3 w on w.id=v.session_id where w.room_id=$1 and v.status in (''LISTENING'',''OPEN'',''SUSPENDED''))' into private_call using p_room_id;
   if private_call then raise exception 'switch_busy' using errcode='55000';end if;
  end if;
 end if;
 if s.current_type='wave' then insert into public.room_experience_tools_v1 values(p_room_id,'wave',jsonb_build_object('roomType','wave')) on conflict do nothing;end if;
 -- Archive before replacing the single active specialized row. Private fields remain private.
 insert into public.room_experience_tools_v1(room_id,room_type,state)
 select room_id,room_type,state from public.room_specialized_state_v1 where room_id=p_room_id
 on conflict(room_id,room_type) do update set state=excluded.state;
 select state into dest from public.room_experience_tools_v1 where room_id=p_room_id and room_type=p_destination;
 select coalesce(display_name,username,'Host') into host_name from public.profiles where id=r.host_id;
 if p_config is null or pg_column_size(p_config)>65536 then raise exception 'switch_scene_config_invalid' using errcode='22023';end if;
 if p_destination='scene' then
  t=dest;
  p_config=coalesce(p_config#>'{launch,values}',p_config);
  if t is null then
   if jsonb_typeof(p_config)<>'object' or length(coalesce(p_config->>'program','')) not between 1 and 4000 or coalesce(p_config->>'duration','') !~ '^[0-9]+$' or jsonb_typeof(p_config->'evaluation') is distinct from 'boolean' then raise exception 'switch_scene_config_invalid' using errcode='22023';end if;
   minutes=(p_config->>'duration')::integer;
   if minutes not between 1 and 120 then raise exception 'switch_scene_config_invalid' using errcode='22023';end if;
   select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'title',btrim(line),'artistId',r.host_id,'artistName',host_name,'kind','Morceau','durationMinutes',minutes,'status','upcoming','evaluationEnabled',(p_config->>'evaluation')::boolean) order by v.ord) into program from regexp_split_to_table(p_config->>'program',E'\n') with ordinality as v(line,ord) where length(btrim(line))>0;
   if program is null or jsonb_array_length(program)>24 then raise exception 'switch_scene_config_invalid' using errcode='22023';end if;
   scene=jsonb_build_object('people','[]'::jsonb,'program',program,'prompter',jsonb_build_object('texts','[]'::jsonb,'activeTextId','','playing',false,'line',0,'speed',1,'fontSize',30,'lineHeight',1.55,'alignment','center','countdown',0,'controller','regie','mirrored',false,'readingMode','expanded'),'evaluation',jsonb_build_object('defaultEnabled',(p_config->>'evaluation')::boolean,'defaultMinimumResponses',5,'defaultResultsVisibility','private','byPerformance','{}'::jsonb,'viewerCompletedPerformanceIds','[]'::jsonb),'fundraiser',jsonb_build_object('id',gen_random_uuid(),'title','','beneficiary','','targetAmount',0,'currency','EUR','description','','imageUrl','','endAt',null,'status','draft','visibleInLive',false,'highlighted',false,'collectedAmount',0,'contributionCount',0,'paymentAvailable',false));
   t=jsonb_build_object('roomId',p_room_id,'roomType','scene','revision',1,'updatedAt',now(),'scene',scene,'gifts',jsonb_build_object('purchaseEnabled',false,'transactions','[]'::jsonb,'redemptions','[]'::jsonb,'stock','[]'::jsonb));
   dest=t;
  end if;
 elsif p_destination in ('cage','classe','loge') and dest is null then
  v=p_config#>'{launch,values}';
  if p_destination='cage' then
   perform public.rooms_cage_valid_config_v1(p_config->'cage');
   dest=public.rooms_cage_empty_state_v1(p_room_id,p_config->'cage');
  else
   if p_config#>>'{launch,roomType}' is distinct from p_destination or jsonb_typeof(v) is distinct from 'object' then raise exception 'switch_config_invalid' using errcode='22023';end if;
   dest=jsonb_build_object('roomId',p_room_id,'roomType',p_destination,'revision',1,'updatedAt',now(),'gifts',jsonb_build_object('stock','[]'::jsonb,'transactions','[]'::jsonb,'redemptions','[]'::jsonb));
   if p_destination='classe' then
    if coalesce(v->>'seats','') !~ '^[0-9]+$' then raise exception 'switch_config_invalid' using errcode='22023';end if;
    n=(v->>'seats')::integer;
    if n not between 4 and 24 or jsonb_typeof(v->'handsOpen') is distinct from 'boolean' or jsonb_typeof(v->'questionsOpen') is distinct from 'boolean' then raise exception 'switch_config_invalid' using errcode='22023';end if;
    dest=dest||jsonb_build_object('classe',jsonb_build_object('people','[]'::jsonb,'handsOpen',v->'handsOpen','questionsOpen',v->'questionsOpen','seatsLocked',false,'seatPriceCents',499,'raisedHands','[]'::jsonb,'questions','[]'::jsonb,'resources','[]'::jsonb,'activeSpeakerId',null,'publicCallStudentId',null,'privateTalkStudentId',null,'screenShareOwnerId',null,'featuredQuestionId',null,'seats',(select jsonb_agg(jsonb_build_object('number',i,'status','free','canSpeak',false,'canShareScreen',false,'handRaised',false)) from generate_series(1,n) i)));
   else
    if jsonb_typeof(v->'questionsOpen') is distinct from 'boolean' or jsonb_typeof(v->'liveOnly') is distinct from 'boolean' or length(coalesce(v->>'previewTitle',''))>4000 or length(coalesce(v->>'previewDescription',''))>4000 then raise exception 'switch_config_invalid' using errcode='22023';end if;
    dest=dest||jsonb_build_object('loge',jsonb_build_object('legendaryHost',true,'questionsOpen',v->'questionsOpen','questions','[]'::jsonb,'moments','[]'::jsonb,'preview',jsonb_build_object('title',coalesce(v->>'previewTitle',''),'description',coalesce(v->>'previewDescription',''),'mediaName','','mediaKind','audio','mediaPath',null,'playing',false,'transportStatus','idle','sessionId',null,'startedAt',null,'positionSeconds',0,'volume',1,'replayIncluded',not (v->>'liveOnly')::boolean,'liveOnly',v->'liveOnly','expiresAt',null,'durationSeconds',null,'channels',null,'sampleRate',null,'waveformPeaks','[]'::jsonb)));
   end if;
  end if;
 elsif p_destination='wave' then
  -- The normalized engine and its actual prepared reference are authoritative.
  execute 'select w.id from public.wave_sessions_v3 w join public.wave_production_references_v5 ref on ref.id=w.production_reference_id join public.wave_audio_assets_v3 a on a.id=coalesce(ref.light_asset_id,ref.studio_asset_id) and a.status=''READY'' where w.room_id=$1 and w.active_rules_revision_id is not null' into wave_id using p_room_id;
  if wave_id is null then raise exception 'switch_wave_preparation_required' using errcode='55000';end if;
 end if;
 if p_destination<>'place' and p_destination<>'wave' then
  n=greatest(s.version,coalesce((dest->>'revision')::integer,0),coalesce((select revision from public.room_specialized_state_v1 where room_id=p_room_id),0))+1;
  dest=jsonb_set(dest,'{revision}',to_jsonb(n));
  insert into public.room_specialized_state_v1(room_id,room_type,revision,state,updated_by) values(p_room_id,p_destination,n,dest,auth.uid())
  on conflict(room_id) do update set room_type=excluded.room_type,revision=excluded.revision,state=excluded.state,updated_by=excluded.updated_by;
 else
  delete from public.room_specialized_state_v1 where room_id=p_room_id;
  update public.room_place_tools_v1 set state=jsonb_set(state,'{revision}',to_jsonb(coalesce((state->>'revision')::bigint,0)+1)),updated_at=now() where room_id=p_room_id;
 end if;
 insert into public.room_experience_acceptance_v1(room_id,user_id,accepted_version) select p_room_id,p.user_id,s.version from public.room_participants_v2 p where p.room_id=p_room_id and p.left_at is null on conflict do nothing;
 update public.room_experience_v1 set previous_type=current_type,current_type=p_destination,version=version+1,change_id=p_request_id,changed_at=clock_timestamp() where room_id=p_room_id;
 insert into public.room_experience_requests_v1 values(p_room_id,p_request_id,auth.uid(),p_destination,s.version+1,coalesce(current_setting('meewav.switch_config',true)::jsonb,p_config));
 insert into public.room_experience_acceptance_v1 values(p_room_id,auth.uid(),s.version+1) on conflict(room_id,user_id) do update set accepted_version=excluded.accepted_version;
 update public.rooms_v2 set type=p_destination,updated_at=now() where id=p_room_id;
 insert into public.room_messages_v2(room_id,user_id,content,is_system) values(p_room_id,auth.uid(),host_name || ' poursuit le live dans ' || case p_destination when 'scene' then 'La Scène.' when 'cage' then 'La Cage.' when 'wave' then 'La Wave.' when 'classe' then 'La Classe.' when 'loge' then 'La Loge.' else 'La Place.' end,true);
 return public.rooms_get_experience_v1(p_room_id);
end $$;
revoke all on function public.rooms_switch_experience_v1(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.rooms_switch_experience_v1(uuid,bigint,uuid,text,jsonb) to authenticated;
-- A direct table update must not bypass activity/access checks.
create function public.rooms_experience_type_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.type is distinct from new.type and not exists(select 1 from public.room_experience_v1 s where s.room_id=new.id and s.current_type=new.type and s.previous_type=old.type and s.version>0) then raise exception 'switch_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function public.rooms_experience_type_guard_v1() from public,anon,authenticated;
create trigger rooms_experience_type_guard before update of type on public.rooms_v2 for each row execute function public.rooms_experience_type_guard_v1();

-- Guard existing reducers, including old clients. No grants remain on renamed implementations.
do $$
declare fn record;old_name text;params text;expected text;
begin
 for fn in select p.*,pg_get_function_identity_arguments(p.oid) as identity_args,pg_get_function_arguments(p.oid) as full_args,pg_get_function_result(p.oid) as result_type from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rooms_apply_place_tools_v1','rooms_commit_specialized_state_v1','rooms_initialize_specialized_state_v1','rooms_apply_specialized_viewer_action_v1','rooms_cast_scene_evaluation_v1','rooms_apply_cage_command_v1','rooms_cage_presence_v1') loop
  old_name='sw_legacy_'||fn.oid;
  select string_agg(quote_ident(a),',') into params from unnest(fn.proargnames) a;
  expected=case when fn.proname='rooms_apply_place_tools_v1' then quote_literal('place') when 'p_room_type'=any(fn.proargnames) then 'p_room_type' when fn.proname in ('rooms_apply_cage_command_v1','rooms_cage_presence_v1') then quote_literal('cage') when fn.proname='rooms_cast_scene_evaluation_v1' then quote_literal('scene') else '(select type from public.rooms_v2 where id=p_room_id)' end;
  execute format('alter function public.%I(%s) rename to %I',fn.proname,fn.identity_args,old_name);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',old_name,fn.identity_args);
  execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $body$ begin perform public.rooms_assert_experience_v1(p_room_id,%s); return public.%I(%s); end $body$',fn.proname,fn.full_args,fn.result_type,expected,old_name,params);
  execute format('revoke all on function public.%I(%s) from public,anon',fn.proname,fn.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',fn.proname,fn.identity_args);
 end loop;
end $$;
commit;
