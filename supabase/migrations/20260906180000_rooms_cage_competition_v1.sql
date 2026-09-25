-- La Cage: one authoritative competition snapshot and idempotent commands.
-- The existing invitation and mixer stores remain the only guest/audio stores.
begin;

create table if not exists public.room_cage_launches_v1 (
  session_id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms_v2(id) on delete cascade,
  host_id uuid not null references public.profiles(id),
  request_id uuid not null,
  configuration jsonb not null,
  created_at timestamptz not null default now(),
  unique(host_id, request_id)
);
create table if not exists public.room_cage_presence_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  camera boolean not null default false,
  microphone boolean not null default false,
  mixer boolean not null default false,
  permissions boolean not null default false,
  ready boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
create table if not exists public.room_cage_commands_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  action text not null,
  payload jsonb not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(room_id,actor_id,idempotency_key)
);
create table if not exists public.room_cage_events_v1 (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  revision bigint not null,
  actor_id uuid references public.profiles(id),
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.room_cage_launches_v1 enable row level security;
alter table public.room_cage_presence_v1 enable row level security;
alter table public.room_cage_commands_v1 enable row level security;
alter table public.room_cage_events_v1 enable row level security;
revoke all on public.room_cage_launches_v1,public.room_cage_presence_v1,public.room_cage_commands_v1,public.room_cage_events_v1 from public,anon,authenticated;
grant all on public.room_cage_launches_v1,public.room_cage_presence_v1,public.room_cage_commands_v1,public.room_cage_events_v1 to service_role;

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

create or replace function public.rooms_cage_launch_v1(p_configuration jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_existing public.room_cage_launches_v1%rowtype; v_config jsonb; v_room uuid; v_session uuid;
begin
  if v_uid is null or p_request_id is null then raise exception 'cage_auth_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cage:launch:'||v_uid::text||':'||p_request_id::text,0));
  select * into v_existing from public.room_cage_launches_v1 where host_id=v_uid and request_id=p_request_id;
  if found then
    if v_existing.configuration is distinct from public.rooms_cage_valid_config_v1(p_configuration) then raise exception 'cage_idempotency_payload_conflict'; end if;
    return jsonb_build_object('roomId',v_existing.room_id,'sessionId',v_existing.session_id);
  end if;
  v_config:=public.rooms_cage_valid_config_v1(p_configuration);
  v_room:=gen_random_uuid(); v_session:=gen_random_uuid();
  -- The shared media authority admits Place transport. The immutable Cage
  -- snapshot, not this transport discriminator, identifies the competition.
  insert into public.rooms_v2(id,host_id,type,title,status,livekit_room_name,queue_open)
    values(v_room,v_uid,'place',v_config->>'title','live','cage-'||v_room::text,true);
  insert into public.room_participants_v2(room_id,user_id,role) values(v_room,v_uid,'host');
  insert into public.room_cage_launches_v1(session_id,room_id,host_id,request_id,configuration) values(v_session,v_room,v_uid,p_request_id,v_config);
  insert into public.room_specialized_state_v1(room_id,room_type,revision,state,updated_by)
    values(v_room,'cage',0,public.rooms_cage_empty_state_v1(v_room,v_config),v_uid);
  insert into public.room_specialized_state_signal_v1(room_id,room_type,revision) values(v_room,'cage',0);
  perform public.rooms_reconcile_program_layout_v1(v_room);
  insert into public.room_cage_events_v1(room_id,revision,actor_id,kind,detail) values(v_room,0,v_uid,'session.launched',jsonb_build_object('sessionId',v_session,'templateId',v_config->>'templateId'));
  return jsonb_build_object('roomId',v_room,'sessionId',v_session);
end;
$$;

create or replace function public.rooms_cage_presence_v1(p_room_id uuid,p_camera boolean,p_microphone boolean,p_mixer boolean,p_permissions boolean,p_ready boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_ready boolean; v_old public.room_cage_presence_v1%rowtype;
begin
  if v_uid is null or not exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=v_uid and left_at is null)
    or not exists(select 1 from public.rooms_v2 where id=p_room_id and status='live')
    or exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid)
    then raise exception 'cage_presence_forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('meewav:rooms:program-transition:'||p_room_id::text,0));
  select * into v_old from public.room_cage_presence_v1 where room_id=p_room_id and user_id=v_uid;
  v_ready:=coalesce((p_ready or v_old.ready) and p_camera and p_microphone and p_mixer and p_permissions,false)
    and exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and guest_id=v_uid and status in ('accepted','ready','backstage','onstage') and ended_at is null);
  insert into public.room_cage_presence_v1(room_id,user_id,camera,microphone,mixer,permissions,ready,seen_at)
    values(p_room_id,v_uid,coalesce(p_camera,false),coalesce(p_microphone,false),coalesce(p_mixer,false),coalesce(p_permissions,false),v_ready,now())
    on conflict(room_id,user_id) do update set camera=excluded.camera,microphone=excluded.microphone,mixer=excluded.mixer,permissions=excluded.permissions,ready=excluded.ready,seen_at=excluded.seen_at;
  if v_old.ready is distinct from v_ready or v_old.seen_at is null or v_old.seen_at < now()-interval '40 seconds' then
    update public.room_specialized_state_signal_v1 set updated_at=now() where room_id=p_room_id;
  end if;
  perform public.rooms_cage_reconcile_v1(p_room_id);
  return jsonb_build_object('present',true,'ready',v_ready,'serverNow',now());
end;
$$;

create or replace function public.rooms_cage_match_replace_v1(p_matches jsonb,p_match jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(case when value->>'id'=p_match->>'id' then p_match else value end order by ord),'[]')
 from jsonb_array_elements(p_matches) with ordinality as a(value,ord);
$$;

create or replace function public.rooms_cage_steps_v1(p_config jsonb,p_tie boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_steps jsonb:='[]'; v_r integer; v_side text; v_rounds integer:=case when p_tie and p_config#>>'{rules,tieBreak}'='sudden-death' then 1 else (p_config#>>'{rules,rounds}')::integer end;
begin
 for v_r in 1..v_rounds loop
   if p_config#>>'{rules,performanceMode}'='simultaneous' then
     v_steps:=v_steps||jsonb_build_array(jsonb_build_object('id','round-'||v_r,'label','Manche '||v_r,'side','BOTH','durationSeconds',(p_config#>>'{rules,passageDurationSeconds}')::integer));
   else
     foreach v_side in array case when p_config#>>'{rules,performanceMode}'='alternating' and v_r%2=0 then array['B','A'] else array['A','B'] end loop
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('id','round-'||v_r||'-'||v_side,'label','Passage '||v_side||' · manche '||v_r,'side',v_side,'durationSeconds',(p_config#>>'{rules,passageDurationSeconds}')::integer));
     end loop;
   end if;
 end loop;
 return v_steps;
end;
$$;

create or replace function public.rooms_cage_new_match_v1(p_id text,p_round integer,p_order integer,p_label text,p_a text,p_b text,p_source_a text,p_source_b text,p_config jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p_id,'round',p_round,'order',p_order,'label',p_label,'participantAId',p_a,'participantBId',p_b,
   'sourceA',case when p_source_a is null then null else jsonb_build_object('matchId',p_source_a,'kind','winner') end,
   'sourceB',case when p_source_b is null then null else jsonb_build_object('matchId',p_source_b,'kind','winner') end,
   'status','WAITING','stepIndex',0,'steps',public.rooms_cage_steps_v1(p_config),'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'vote',null,'winnerId',null,'incident',null);
$$;

-- Only this helper determines advancement. Later rounds contain source slots,
-- never guessed participant identities, and BYEs never create fake entrants.
create or replace function public.rooms_cage_advance_v1(p_runtime jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_matches jsonb:=p_runtime->'matches'; v_m jsonb; v_source jsonb; v_a text; v_b text; v_pass integer; v_changed boolean; v_winner text;
begin
 if v_rt#>>'{config,format}'<>'tournament' then return v_rt; end if;
 for v_pass in 1..7 loop
   v_changed:=false;
   for v_m in select value from jsonb_array_elements(v_matches) order by (value->>'round')::integer,(value->>'order')::integer loop
     if v_m->>'status' in ('RESOLVED','CLOSED') then continue; end if;
     v_a:=v_m->>'participantAId'; v_b:=v_m->>'participantBId';
     if v_m#>>'{sourceA,matchId}' is not null then
       select value into v_source from jsonb_array_elements(v_matches) where value->>'id'=v_m#>>'{sourceA,matchId}';
       if v_source->>'status' in ('RESOLVED','CLOSED') then
         v_a:=v_source->>'winnerId';
         select coalesce((select value->>'id' from jsonb_array_elements(v_rt->'participants') where value->>'replacesId'=v_a and value->>'seed' is not null limit 1),v_a) into v_a;
       end if;
     end if;
     if v_m#>>'{sourceB,matchId}' is not null then
       select value into v_source from jsonb_array_elements(v_matches) where value->>'id'=v_m#>>'{sourceB,matchId}';
       if v_source->>'status' in ('RESOLVED','CLOSED') then
         v_b:=v_source->>'winnerId';
         select coalesce((select value->>'id' from jsonb_array_elements(v_rt->'participants') where value->>'replacesId'=v_b and value->>'seed' is not null limit 1),v_b) into v_b;
       end if;
     end if;
     if v_a is distinct from v_m->>'participantAId' or v_b is distinct from v_m->>'participantBId' then v_changed:=true; end if;
     v_m:=v_m||jsonb_build_object('participantAId',v_a,'participantBId',v_b);
     if coalesce((v_rt#>>'{config,rules,allowByes}')::boolean,false)
       and v_rt->>'lockedAt' is not null and v_m->>'status'='WAITING'
       and (v_a is null or v_b is null)
       and (v_m#>>'{sourceA,matchId}' is null or exists(select 1 from jsonb_array_elements(v_matches) where value->>'id'=v_m#>>'{sourceA,matchId}' and value->>'status' in ('RESOLVED','CLOSED')))
       and (v_m#>>'{sourceB,matchId}' is null or exists(select 1 from jsonb_array_elements(v_matches) where value->>'id'=v_m#>>'{sourceB,matchId}' and value->>'status' in ('RESOLVED','CLOSED'))) then
       v_winner:=coalesce(v_a,v_b);
       v_m:=v_m||jsonb_build_object('status','RESOLVED','winnerId',v_winner,'resolution','bye'); v_changed:=true;
     end if;
     v_matches:=public.rooms_cage_match_replace_v1(v_matches,v_m);
   end loop;
   exit when not v_changed;
 end loop;
 return jsonb_set(v_rt,'{matches}',v_matches);
end;
$$;

create or replace function public.rooms_cage_ready_v1(p_person jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce((p_person->>'present')::boolean and (p_person->>'registered')::boolean and (p_person->>'eligible')::boolean
   and p_person->>'status' not in ('ELIMINATED','FORFEIT','DISQUALIFIED')
   and (p_person#>>'{readiness,camera}')::boolean and (p_person#>>'{readiness,microphone}')::boolean
   and (p_person#>>'{readiness,connection}')::boolean and (p_person#>>'{readiness,mixer}')::boolean
   and (p_person#>>'{readiness,permissions}')::boolean,false);
$$;

create or replace function public.rooms_cage_prepare_pair_v1(p_room_id uuid,p_runtime jsonb,p_match_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_m jsonb; v_people jsonb:='[]'; v_person jsonb; v_id text; v_inv public.room_invitations_v2%rowtype; v_host uuid;
begin
 if v_rt#>>'{config,format}' not in ('tournament','championship') then raise exception 'cage_duel_format_required'; end if;
 if v_rt->>'lockedAt' is null then raise exception 'cage_bracket_not_locked'; end if;
 if v_rt->>'preparedMatchId' is not null then
   if p_match_id is null or p_match_id=v_rt->>'preparedMatchId' then return v_rt; end if;
   raise exception 'cage_pair_already_preparing';
 end if;
 select candidate.value into v_m from jsonb_array_elements(v_rt->'matches') candidate(value) where candidate.value->>'status' in ('WAITING','POSTPONED')
   and candidate.value->>'participantAId' is not null and candidate.value->>'participantBId' is not null
   and candidate.value->>'id' is distinct from v_rt->>'activeMatchId'
   and (p_match_id is null or candidate.value->>'id'=p_match_id)
   order by case when candidate.value->>'status'='POSTPONED' then 1 else 0 end,(candidate.value->>'round')::integer,(candidate.value->>'order')::integer limit 1;
 if v_m is null then raise exception 'cage_next_match_unavailable'; end if;
 select host_id into v_host from public.rooms_v2 where id=p_room_id;
 foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
   select value into v_person from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_id;
   if v_person->>'guestStatus'='on_stage' then raise exception 'cage_next_pair_still_on_stage'; end if;
   if not coalesce((v_person->>'present')::boolean,false) or not coalesce((v_person->>'eligible')::boolean,false) then raise exception 'cage_participant_unavailable'; end if;
   select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=v_id::uuid for update;
   if v_inv.id is null then
     if not exists(select 1 from public.room_queue_v2 where room_id=p_room_id and user_id=v_id::uuid and removed_at is null) then raise exception 'cage_registration_required'; end if;
     insert into public.room_invitations_v2(room_id,host_id,guest_id,status) values(p_room_id,v_host,v_id::uuid,'pending');
   elsif v_inv.status not in ('pending','accepted','ready','backstage') or v_inv.ended_at is not null then raise exception 'cage_invitation_unavailable'; end if;
 end loop;
 for v_person in select value from jsonb_array_elements(v_rt->'participants') loop
   if v_person->>'id' in (v_m->>'participantAId',v_m->>'participantBId') then
     v_person:=v_person||jsonb_build_object('status',case when public.rooms_cage_ready_v1(v_person) and v_person->>'guestStatus'='backstage' then 'READY' else 'GREENHOUSE' end);
   end if;
   v_people:=v_people||jsonb_build_array(v_person);
 end loop;
 v_m:=v_m||jsonb_build_object('status','GREENHOUSE');
 return v_rt||jsonb_build_object('preparedMatchId',v_m->>'id','participants',v_people,'matches',public.rooms_cage_match_replace_v1(v_rt->'matches',v_m));
end;
$$;

create or replace function public.rooms_cage_promote_pair_v1(p_room_id uuid,p_runtime jsonb,p_match_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_m jsonb; v_active jsonb; v_person jsonb; v_id text; v_people jsonb:='[]'; v_inv public.room_invitations_v2%rowtype;
begin
 if v_rt#>>'{config,format}' not in ('tournament','championship') then raise exception 'cage_duel_format_required'; end if;
 select value into v_active from jsonb_array_elements(v_rt->'matches') where value->>'id'=v_rt->>'activeMatchId';
 if v_active->>'status' not in ('RESOLVED','CLOSED','POSTPONED') then raise exception 'cage_match_already_active'; end if;
 select value into v_m from jsonb_array_elements(v_rt->'matches') where value->>'id'=coalesce(p_match_id,v_rt->>'preparedMatchId') and value->>'status' in ('GREENHOUSE','READY');
 if v_m is null then raise exception 'cage_prepared_pair_required'; end if;
 -- Both validations and both guest transitions occur in the same transaction.
 foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
   select value into v_person from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_id;
   if not public.rooms_cage_ready_v1(v_person) then raise exception 'cage_greenhouse_not_ready'; end if;
   select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=v_id::uuid and ended_at is null for update;
   if v_inv.status not in ('ready','backstage') or v_inv.id is null then raise exception 'cage_guest_consent_required'; end if;
   if not exists(select 1 from public.room_cage_presence_v1 where room_id=p_room_id and user_id=v_id::uuid and ready and seen_at>now()-interval '45 seconds') then raise exception 'cage_ready_presence_expired'; end if;
 end loop;
 if exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and status='onstage' and ended_at is null) then raise exception 'cage_stage_not_empty'; end if;
 update public.room_invitations_v2 set status='onstage',backstage_at=coalesce(backstage_at,now()),onstage_at=now()
   where room_id=p_room_id and guest_id::text in (v_m->>'participantAId',v_m->>'participantBId');
 foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
   perform public.rooms_v2_upsert_participant(p_room_id,v_id::uuid,'guest');
 end loop;
 perform public.rooms_reconcile_program_layout_v1(p_room_id);
 -- No mixer row is deleted, reset or copied: personal processing stays intact.
 for v_person in select value from jsonb_array_elements(v_rt->'participants') loop
   if v_person->>'id' in (v_m->>'participantAId',v_m->>'participantBId') then v_person:=v_person||jsonb_build_object('status','ON_STAGE','guestStatus','on_stage'); end if;
   v_people:=v_people||jsonb_build_array(v_person);
 end loop;
 v_m:=v_m||jsonb_build_object('status','ON_STAGE');
 return v_rt||jsonb_build_object('activeMatchId',v_m->>'id','preparedMatchId',null,'status','RUNNING','participants',v_people,'matches',public.rooms_cage_match_replace_v1(v_rt->'matches',v_m));
end;
$$;

create or replace function public.rooms_cage_resolve_v1(p_room_id uuid,p_runtime jsonb,p_match jsonb,p_winner text,p_resolution text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_m jsonb:=p_match; v_people jsonb:='[]'; v_p jsonb; v_id text;
begin
 if v_rt#>>'{config,format}' not in ('tournament','championship') then raise exception 'cage_duel_format_required'; end if;
 if p_winner is null or p_winner not in(v_m->>'participantAId',v_m->>'participantBId') then raise exception 'cage_winner_invalid'; end if;
 if v_m->>'status' in ('RESOLVED','CLOSED') then
   if v_m->>'winnerId'=p_winner then return v_rt; end if;
   raise exception 'cage_result_immutable';
 end if;
 v_m:=v_m||jsonb_build_object('status','RESOLVED','winnerId',p_winner,'resolution',p_resolution,'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'incident',null);
 if v_m->'vote' is not null and v_m->'vote'<>'null'::jsonb then v_m:=jsonb_set(v_m,'{vote}',v_m->'vote'||jsonb_build_object('open',false,'closedAt',now())); end if;
 for v_p in select value from jsonb_array_elements(v_rt->'participants') loop
   if v_p->>'id' in(v_m->>'participantAId',v_m->>'participantBId') then
     v_p:=v_p||jsonb_build_object('status',case when v_rt#>>'{config,format}'='championship' then 'SELECTED' when v_p->>'id'=p_winner then 'ADVANCED' when p_resolution='forfeit' then 'FORFEIT' else 'ELIMINATED' end,'guestStatus','backstage');
   end if;
   v_people:=v_people||jsonb_build_array(v_p);
 end loop;
 update public.room_invitations_v2 set status='backstage',backstage_at=now()
   where room_id=p_room_id and guest_id::text in(v_m->>'participantAId',v_m->>'participantBId') and status='onstage' and ended_at is null;
 foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
   if exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=v_id::uuid and left_at is null) then
     perform public.rooms_v2_upsert_participant(p_room_id,v_id::uuid,'guest');
   end if;
 end loop;
 perform public.rooms_reconcile_program_layout_v1(p_room_id);
 v_rt:=v_rt||jsonb_build_object('participants',v_people,'matches',public.rooms_cage_match_replace_v1(v_rt->'matches',v_m));
 v_rt:=public.rooms_cage_advance_v1(v_rt);
 if not exists(select 1 from jsonb_array_elements(v_rt->'matches') where value->>'status' not in ('RESOLVED','CLOSED')) then
   v_rt:=v_rt||jsonb_build_object('status','COMPLETED','preparedMatchId',null);
 else
   if v_rt->>'preparedMatchId'=v_m->>'id' then v_rt:=jsonb_set(v_rt,'{preparedMatchId}','null'); end if;
   if v_rt->>'preparedMatchId' is null then
     begin v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt); exception when raise_exception then null; end;
   end if;
   if coalesce((v_rt->>'autoRegie')::boolean,false) and v_rt->>'preparedMatchId' is not null then
     begin v_rt:=public.rooms_cage_promote_pair_v1(p_room_id,v_rt); exception when raise_exception then null; end;
     if v_rt->>'preparedMatchId' is null then
       begin v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt); exception when raise_exception then null; end;
     end if;
   end if;
 end if;
 return v_rt;
end;
$$;

create or replace function public.rooms_cage_person_v1(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',id::text,'name',coalesce(nullif(display_name,''),nullif(full_name,''),username,'Participant'),'role',coalesce(primary_role_key,artist_type,'Artiste'),'avatarUrl',coalesce(avatar_url,profile_image_url,''),'gradeLevel',greatest(1,least(6,coalesce(grade,1))),'microphone','off','camera','off') from public.profiles where id=p_profile_id;
$$;
create or replace function public.rooms_cage_people_v1(p_room_id uuid,p_runtime jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb:='[]'; v_row record; v_old jsonb; v_present boolean; v_registered boolean; v_eligible boolean; v_ready boolean; v_status text;
begin
  for v_row in
    select distinct p.id,pr.seen_at,pr.camera,pr.microphone,pr.mixer,pr.permissions,pr.ready,i.status as invite_status, i.ended_at,
      rp.left_at,rp.user_id as joined_id,q.id as queue_id,q.removed_at
    from public.profiles p
    left join public.room_participants_v2 rp on rp.room_id=p_room_id and rp.user_id=p.id
    left join public.room_cage_presence_v1 pr on pr.room_id=p_room_id and pr.user_id=p.id
    left join public.room_queue_v2 q on q.room_id=p_room_id and q.user_id=p.id
    left join public.room_invitations_v2 i on i.room_id=p_room_id and i.guest_id=p.id
    where p.id::text in(select value->>'id' from jsonb_array_elements(coalesce(p_runtime->'participants','[]')))
      or p.id::text in(select value from jsonb_array_elements_text(coalesce(p_runtime#>'{config,rosterProfileIds}','[]')))
      or (rp.left_at is null and rp.user_id is not null and ((q.id is not null and q.removed_at is null) or (i.ended_at is null and i.status in ('pending','accepted','ready','backstage','onstage'))))
    order by p.id
  loop
    select value into v_old from jsonb_array_elements(coalesce(p_runtime->'participants','[]')) where value->>'id'=v_row.id::text;
    if v_old is null and p_runtime->>'lockedAt' is null then
      select jsonb_build_object('seed',ord,'status','SELECTED') into v_old
        from jsonb_array_elements_text(coalesce(p_runtime#>'{config,rosterProfileIds}','[]')) with ordinality a(id,ord) where id=v_row.id::text;
    end if;
    v_present:=v_row.joined_id is not null and v_row.left_at is null and coalesce(v_row.seen_at>now()-interval '45 seconds',false);
    v_registered:=(v_row.queue_id is not null and v_row.removed_at is null) or (v_row.ended_at is null and v_row.invite_status in ('pending','accepted','ready','backstage','onstage'));
    v_eligible:=coalesce(v_registered,false) and not exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_row.id)
      and coalesce(v_old->>'status','WAITING') not in ('ELIMINATED','FORFEIT','DISQUALIFIED');
    v_ready:=v_present and coalesce(v_row.ready and v_row.camera and v_row.microphone and v_row.mixer and v_row.permissions,false) and v_row.invite_status in ('ready','backstage','onstage');
    v_status:=coalesce(v_old->>'status','WAITING');
    if v_status in ('GREENHOUSE','READY','CALLED') then v_status:=case when v_ready then 'READY' else 'GREENHOUSE' end; end if;
    v_result:=v_result||jsonb_build_array(coalesce(v_old,'{}')||jsonb_build_object('id',v_row.id::text,'person',public.rooms_cage_person_v1(v_row.id),
      'present',v_present,'registered',coalesce(v_registered,false),'eligible',v_eligible,'seed',v_old->'seed','status',v_status,
      'readiness',jsonb_build_object('camera',coalesce(v_row.camera,false),'microphone',coalesce(v_row.microphone,false),'connection',v_present,'mixer',coalesce(v_row.mixer,false),'permissions',coalesce(v_row.permissions,false)),
      'guestStatus',case when v_row.invite_status='onstage' then 'on_stage' when v_row.invite_status in ('ready','backstage') then 'backstage' when v_row.invite_status in ('pending','accepted') then 'waiting' else 'audience' end,'graceEndsAt',v_old->'graceEndsAt'));
  end loop;
  return v_result;
end;
$$;

create or replace function public.rooms_cage_prepare_open_mic_v1(p_room_id uuid,p_runtime jsonb,p_entry_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_entry jsonb; v_person jsonb; v_inv public.room_invitations_v2%rowtype; v_host uuid;
begin
 if v_rt#>>'{config,format}'<>'open-mic' then raise exception 'cage_open_mic_required'; end if;
 if v_rt->>'preparedEntryId' is not null then
   if p_entry_id is null or p_entry_id=v_rt->>'preparedEntryId' then return v_rt; end if;
   raise exception 'cage_passage_already_preparing';
 end if;
 select value into v_entry from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]'))
   where value->>'status' in ('WAITING','POSTPONED') and value->>'id' is distinct from v_rt->>'activeEntryId'
   and (p_entry_id is null or value->>'id'=p_entry_id)
   order by case when value->>'status'='POSTPONED' then 1 else 0 end,(value->>'order')::integer limit 1;
 if v_entry is null then raise exception 'cage_next_passage_unavailable'; end if;
 select value into v_person from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_entry->>'participantId';
 if not coalesce((v_person->>'present')::boolean and (v_person->>'registered')::boolean and (v_person->>'eligible')::boolean,false) or v_person->>'guestStatus'='on_stage' then raise exception 'cage_participant_unavailable'; end if;
 select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid for update;
 if v_inv.id is null then
   select host_id into v_host from public.rooms_v2 where id=p_room_id;
   if not exists(select 1 from public.room_queue_v2 where room_id=p_room_id and user_id=(v_entry->>'participantId')::uuid and removed_at is null) then raise exception 'cage_registration_required'; end if;
   insert into public.room_invitations_v2(room_id,host_id,guest_id,status) values(p_room_id,v_host,(v_entry->>'participantId')::uuid,'pending');
 elsif v_inv.status not in ('pending','accepted','ready','backstage') or v_inv.ended_at is not null then raise exception 'cage_invitation_unavailable'; end if;
 v_person:=v_person||jsonb_build_object('status',case when public.rooms_cage_ready_v1(v_person) and v_person->>'guestStatus'='backstage' then 'READY' else 'GREENHOUSE' end);
 v_entry:=v_entry||jsonb_build_object('status',case when v_person->>'status'='READY' then 'READY' else 'GREENHOUSE' end);
 return v_rt||jsonb_build_object('preparedEntryId',v_entry->>'id','participants',public.rooms_cage_match_replace_v1(v_rt->'participants',v_person),'openMicEntries',public.rooms_cage_match_replace_v1(v_rt->'openMicEntries',v_entry));
end;
$$;

create or replace function public.rooms_cage_promote_open_mic_v1(p_room_id uuid,p_runtime jsonb,p_entry_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_entry jsonb; v_current jsonb; v_person jsonb; v_inv public.room_invitations_v2%rowtype;
begin
 if v_rt#>>'{config,format}'<>'open-mic' then raise exception 'cage_open_mic_required'; end if;
 select value into v_current from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'id'=v_rt->>'activeEntryId';
 if v_current->>'status' not in ('PERFORMED','POSTPONED','SKIPPED') then raise exception 'cage_passage_already_active'; end if;
 select value into v_entry from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'id'=coalesce(p_entry_id,v_rt->>'preparedEntryId') and value->>'id'=v_rt->>'preparedEntryId' and value->>'status' in ('READY','GREENHOUSE');
 if v_entry is null then raise exception 'cage_prepared_passage_required'; end if;
 select value into v_person from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_entry->>'participantId';
 if not public.rooms_cage_ready_v1(v_person) then raise exception 'cage_greenhouse_not_ready'; end if;
 select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid and ended_at is null for update;
 if v_inv.id is null or v_inv.status not in ('ready','backstage') then raise exception 'cage_guest_consent_required'; end if;
 if not exists(select 1 from public.room_cage_presence_v1 where room_id=p_room_id and user_id=v_inv.guest_id and ready and seen_at>now()-interval '45 seconds') then raise exception 'cage_ready_presence_expired'; end if;
 if exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and status='onstage' and ended_at is null) then raise exception 'cage_stage_not_empty'; end if;
 update public.room_invitations_v2 set status='onstage',backstage_at=coalesce(backstage_at,now()),onstage_at=now() where id=v_inv.id;
 perform public.rooms_v2_upsert_participant(p_room_id,v_inv.guest_id,'guest');
 perform public.rooms_reconcile_program_layout_v1(p_room_id);
 v_person:=v_person||jsonb_build_object('status','ON_STAGE','guestStatus','on_stage');
 v_entry:=v_entry||jsonb_build_object('status','ON_STAGE');
 return v_rt||jsonb_build_object('activeEntryId',v_entry->>'id','preparedEntryId',null,'status','RUNNING','lockedAt',coalesce(nullif(v_rt->'lockedAt','null'::jsonb),to_jsonb(now())),
   'participants',public.rooms_cage_match_replace_v1(v_rt->'participants',v_person),'openMicEntries',public.rooms_cage_match_replace_v1(v_rt->'openMicEntries',v_entry));
end;
$$;

-- Caller holds the shared programme transition lock. Replace one occupied seat,
-- preserving the programme capacity and every participant's personal mixer.
create or replace function public.rooms_cage_replace_stage_guest_v1(p_room_id uuid,p_previous_id text,p_replacement_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_inv public.room_invitations_v2%rowtype;
begin
 if not exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and guest_id=p_previous_id::uuid and status='onstage' and ended_at is null) then raise exception 'cage_previous_guest_not_on_stage'; end if;
 select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=p_replacement_id::uuid and ended_at is null for update;
 if v_inv.id is null or v_inv.status not in ('ready','backstage') then raise exception 'cage_guest_consent_required'; end if;
 if not exists(select 1 from public.room_cage_presence_v1 pr join public.room_participants_v2 rp on rp.room_id=pr.room_id and rp.user_id=pr.user_id
   where pr.room_id=p_room_id and pr.user_id=p_replacement_id::uuid and rp.left_at is null and pr.ready and pr.camera and pr.microphone and pr.mixer and pr.permissions and pr.seen_at>now()-interval '45 seconds') then raise exception 'cage_ready_presence_expired'; end if;
 update public.room_invitations_v2 set status='backstage',backstage_at=now() where room_id=p_room_id and guest_id=p_previous_id::uuid and status='onstage' and ended_at is null;
 update public.room_invitations_v2 set status='onstage',backstage_at=coalesce(backstage_at,now()),onstage_at=now() where id=v_inv.id;
 if exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=p_previous_id::uuid and left_at is null) then perform public.rooms_v2_upsert_participant(p_room_id,p_previous_id::uuid,'guest'); end if;
 perform public.rooms_v2_upsert_participant(p_room_id,p_replacement_id::uuid,'guest');
 perform public.rooms_reconcile_program_layout_v1(p_room_id);
end;
$$;

create or replace function public.rooms_cage_apply_open_mic_v1(p_room_id uuid,p_runtime jsonb,p_action text,p_payload jsonb,p_expected_entry_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_entries jsonb:=coalesce(p_runtime->'openMicEntries','[]'); v_entry jsonb; v_other jsonb; v_current jsonb; v_person jsonb; v_people jsonb:=p_runtime->'participants';
 v_id text; v_ids text[]; v_order integer; v_direction integer; v_elapsed numeric; v_next_entries jsonb; v_count integer; v_mode text; v_score integer; v_total integer; v_uid uuid:=auth.uid();
begin
 if v_rt#>>'{config,format}'<>'open-mic' then raise exception 'cage_open_mic_required'; end if;
 if jsonb_array_length(v_rt->'matches')<>0 then raise exception 'cage_open_mic_must_not_have_matches'; end if;
 if p_action='openmic.schedule' then
   if jsonb_typeof(p_payload->'participantIds') is distinct from 'array' then raise exception 'cage_participants_required'; end if;
   select array_agg(value order by ord) into v_ids from jsonb_array_elements_text(p_payload->'participantIds') with ordinality a(value,ord);
   v_count:=coalesce(array_length(v_ids,1),0);
   if v_count<1 or v_count>(v_rt#>>'{config,participantCount}')::integer or v_count<>(select count(distinct id) from unnest(v_ids) id) then raise exception 'cage_program_roster_invalid'; end if;
   select coalesce(max((value->>'order')::integer),0) into v_order from jsonb_array_elements(v_entries);
   foreach v_id in array v_ids loop
     if exists(select 1 from jsonb_array_elements(v_entries) where value->>'participantId'=v_id) then continue; end if;
     if jsonb_array_length(v_entries)>=(v_rt#>>'{config,participantCount}')::integer then raise exception 'cage_roster_full'; end if;
     select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id;
     if not coalesce((v_person->>'present')::boolean and (v_person->>'registered')::boolean and (v_person->>'eligible')::boolean,false) then raise exception 'cage_participant_unavailable'; end if;
     v_order:=v_order+1;
     v_entries:=v_entries||jsonb_build_array(jsonb_build_object('id','openmic-'||gen_random_uuid()::text,'order',v_order,'participantId',v_id,'status','WAITING','durationSeconds',(v_rt#>>'{config,rules,passageDurationSeconds}')::integer,'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'incident',null));
     v_people:=public.rooms_cage_match_replace_v1(v_people,v_person||jsonb_build_object('seed',v_order,'status','SELECTED'));
   end loop;
   return v_rt||jsonb_build_object('participants',v_people,'openMicEntries',v_entries,'status',case when v_rt->>'activeEntryId' is null then 'PREPARING' else v_rt->>'status' end);
 elsif p_action='openmic.prepare' then return public.rooms_cage_prepare_open_mic_v1(p_room_id,v_rt,p_payload->>'entryId');
 elsif p_action='openmic.promote' then
   v_rt:=public.rooms_cage_promote_open_mic_v1(p_room_id,v_rt,p_payload->>'entryId');
   begin v_rt:=public.rooms_cage_prepare_open_mic_v1(p_room_id,v_rt); exception when raise_exception then null; end;
   return v_rt;
 end if;
 select value into v_entry from jsonb_array_elements(v_entries) where value->>'id'=coalesce(p_payload->>'entryId',case when p_action like 'openmic.feedback.%' then v_rt->>'feedbackEntryId' else v_rt->>'activeEntryId' end);
 if p_action in ('participant.forfeit','participant.replace') and p_payload->>'participantId' is not null then
   select value into v_entry from jsonb_array_elements(v_entries) where value->>'participantId'=p_payload->>'participantId' and value->>'status' not in ('PERFORMED','SKIPPED') order by (value->>'order')::integer limit 1;
 end if;
 if v_entry is null then raise exception 'cage_passage_missing'; end if;
 if p_action in ('openmic.move','openmic.remove','openmic.start','openmic.pause','openmic.resume','openmic.end','openmic.incident','openmic.restart','openmic.report','openmic.feedback.open','openmic.feedback.close','openmic.feedback.cast','participant.forfeit','participant.replace') and (p_expected_entry_id is null or p_expected_entry_id is distinct from v_entry->>'id') then raise exception 'cage_passage_changed'; end if;
 select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_entry->>'participantId';
 if p_action in ('openmic.start','openmic.pause','openmic.resume','openmic.end','openmic.incident','openmic.restart') and v_entry->>'id' is distinct from v_rt->>'activeEntryId' then raise exception 'cage_passage_not_active'; end if;
 case p_action
 when 'openmic.move' then
   if v_entry->>'status'<>'WAITING' then raise exception 'cage_passage_already_called'; end if;
   v_direction:=(p_payload->>'direction')::integer;
   if v_direction is null or v_direction not in(-1,1) then raise exception 'cage_program_direction_invalid'; end if;
   select value into v_other from jsonb_array_elements(v_entries) where (value->>'order')::integer=(v_entry->>'order')::integer+v_direction and value->>'status'='WAITING';
   if v_other is null then raise exception 'cage_program_position_invalid'; end if;
   v_order:=(v_entry->>'order')::integer;
   v_entry:=jsonb_set(v_entry,'{order}',v_other->'order');v_other:=jsonb_set(v_other,'{order}',to_jsonb(v_order));
   v_entries:=public.rooms_cage_match_replace_v1(v_entries,v_other);
   select jsonb_agg(case when value->>'id'=v_entry->>'participantId' then value||jsonb_build_object('seed',v_entry->'order') when value->>'id'=v_other->>'participantId' then value||jsonb_build_object('seed',v_other->'order') else value end) into v_people from jsonb_array_elements(v_people);
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_entry->>'participantId';
 when 'openmic.remove' then
   if v_entry->>'status' not in ('WAITING','POSTPONED') then raise exception 'cage_passage_already_called'; end if;
   select coalesce(jsonb_agg(value||jsonb_build_object('order',ord) order by ord),'[]') into v_entries from(select value,row_number() over(order by (value->>'order')::integer) ord from jsonb_array_elements(v_entries) where value->>'id'<>v_entry->>'id') ordered;
   select jsonb_agg(case when person.value->>'id'=v_entry->>'participantId' then person.value||jsonb_build_object('seed',null,'status','WAITING') else person.value||jsonb_build_object('seed',coalesce((select item->'order' from jsonb_array_elements(v_entries) item where item->>'participantId'=person.value->>'id'),person.value->'seed')) end) into v_people from jsonb_array_elements(v_people) person(value);
   return v_rt||jsonb_build_object('openMicEntries',v_entries,'participants',v_people);
 when 'openmic.start','openmic.resume' then
   if (p_action='openmic.start' and v_entry->>'status'<>'ON_STAGE') or (p_action='openmic.resume' and v_entry->>'status'<>'PAUSED') then raise exception 'cage_passage_not_startable'; end if;
   if not public.rooms_cage_ready_v1(v_person) or not exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid and status='onstage' and ended_at is null) then raise exception 'cage_stage_not_ready'; end if;
   v_entry:=v_entry||jsonb_build_object('status','IN_PROGRESS','timer',jsonb_build_object('startedAt',now(),'elapsedSeconds',coalesce(v_entry#>'{timer,elapsedSeconds}','0')),'incident',null);
   v_person:=v_person||jsonb_build_object('status','PERFORMING');v_rt:=v_rt||jsonb_build_object('status','RUNNING');
 when 'openmic.pause','openmic.incident' then
   if v_entry->>'status'<>'IN_PROGRESS' and not(p_action='openmic.incident' and v_entry->>'status'='PAUSED') then raise exception 'cage_passage_not_running'; end if;
   v_elapsed:=coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)+case when v_entry#>>'{timer,startedAt}' is null then 0 else greatest(0,extract(epoch from now()-(v_entry#>>'{timer,startedAt}')::timestamptz)) end;
   v_entry:=v_entry||jsonb_build_object('status','PAUSED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   if p_action='openmic.incident' then v_entry:=jsonb_set(v_entry,'{incident}',jsonb_build_object('participantId',v_entry->>'participantId','reason',left(coalesce(p_payload->>'reason','Incident technique'),240),'openedAt',now(),'graceEndsAt',now()+make_interval(secs=>(v_rt#>>'{config,rules,disconnectGraceSeconds}')::integer))); end if;
   v_rt:=v_rt||jsonb_build_object('status','PAUSED');
 when 'openmic.restart' then
   if v_entry->>'status'<>'PAUSED' or jsonb_typeof(v_entry->'incident') is distinct from 'object' then raise exception 'cage_restart_requires_incident'; end if;
   if not public.rooms_cage_ready_v1(v_person) or v_person->>'guestStatus'<>'on_stage' then raise exception 'cage_stage_not_ready'; end if;
   v_entry:=v_entry||jsonb_build_object('status','ON_STAGE','incident',null,'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0));
 when 'openmic.end' then
   if v_entry->>'status'<>'IN_PROGRESS' then raise exception 'cage_passage_not_running'; end if;
   v_elapsed:=coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)+greatest(0,extract(epoch from now()-(v_entry#>>'{timer,startedAt}')::timestamptz));
   v_entry:=v_entry||jsonb_build_object('status','PERFORMED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   v_person:=v_person||jsonb_build_object('status','PERFORMED','guestStatus','backstage');
   update public.room_invitations_v2 set status='backstage',backstage_at=now() where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid and status='onstage' and ended_at is null;
   perform public.rooms_v2_upsert_participant(p_room_id,(v_entry->>'participantId')::uuid,'guest');
   perform public.rooms_reconcile_program_layout_v1(p_room_id);
 when 'openmic.report' then
   if v_entry->>'status' not in ('WAITING','GREENHOUSE','READY','ON_STAGE','PAUSED') then raise exception 'cage_report_requires_pause'; end if;
   if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'cage_report_reason_required'; end if;
   v_elapsed:=coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)+case when v_entry#>>'{timer,startedAt}' is null then 0 else greatest(0,extract(epoch from now()-(v_entry#>>'{timer,startedAt}')::timestamptz)) end;
   v_entry:=v_entry||jsonb_build_object('status','POSTPONED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   update public.room_invitations_v2 set status='backstage',backstage_at=now() where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid and status='onstage' and ended_at is null;
   perform public.rooms_reconcile_program_layout_v1(p_room_id);
   v_person:=v_person||jsonb_build_object('status',case when public.rooms_cage_ready_v1(v_person) then 'READY' else 'GREENHOUSE' end,'guestStatus',case when v_person->>'guestStatus'='on_stage' then 'backstage' else v_person->>'guestStatus' end);
   v_rt:=v_rt||jsonb_build_object('activeEntryId',case when v_rt->>'activeEntryId'=v_entry->>'id' then null else v_rt->>'activeEntryId' end,'preparedEntryId',case when v_rt->>'preparedEntryId'=v_entry->>'id' then null else v_rt->>'preparedEntryId' end);
 when 'participant.replace' then
   if not coalesce((v_rt#>>'{config,rules,allowReplacement}')::boolean,false) or v_entry->>'status' not in ('WAITING','GREENHOUSE','READY','POSTPONED','ON_STAGE')
     or coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)>0 or v_entry#>>'{timer,startedAt}' is not null then raise exception 'cage_replacement_passage_started'; end if;
   if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'cage_replacement_reason_required'; end if;
   select value into v_other from jsonb_array_elements(v_people) where value->>'id'=p_payload->>'replacementId';
   if v_other is null or exists(select 1 from jsonb_array_elements(v_entries) where value->>'participantId'=v_other->>'id')
     or not public.rooms_cage_ready_v1(v_other) or v_other->>'guestStatus'<>'backstage' then raise exception 'cage_replacement_not_ready'; end if;
   if v_person->>'guestStatus'='on_stage' then perform public.rooms_cage_replace_stage_guest_v1(p_room_id,v_person->>'id',v_other->>'id'); end if;
   v_other:=v_other||jsonb_build_object('seed',v_person->'seed','replacesId',v_person->>'id','guestStatus',v_person->>'guestStatus','status',case when v_entry->>'status'='ON_STAGE' then 'ON_STAGE' else 'READY' end);
   v_person:=v_person||jsonb_build_object('seed',null,'status','NO_SHOW','guestStatus','backstage');
   v_people:=public.rooms_cage_match_replace_v1(v_people,v_other);
   v_entry:=v_entry||jsonb_build_object('participantId',v_other->>'id','status',case when v_entry->>'status' in ('GREENHOUSE','READY') then 'READY' else v_entry->>'status' end);
 when 'participant.forfeit' then
   if v_entry->>'status' in ('PERFORMED','SKIPPED') then raise exception 'cage_passage_closed'; end if;
   if coalesce((v_person->>'present')::boolean,false) and jsonb_typeof(v_entry->'incident') is distinct from 'object' then raise exception 'cage_forfeit_requires_absence_or_incident'; end if;
   if coalesce((v_entry#>>'{incident,graceEndsAt}')::timestamptz,(v_person->>'graceEndsAt')::timestamptz) is null or coalesce((v_entry#>>'{incident,graceEndsAt}')::timestamptz,(v_person->>'graceEndsAt')::timestamptz)>now() then raise exception 'cage_grace_period_active'; end if;
   v_elapsed:=coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)+case when v_entry#>>'{timer,startedAt}' is null then 0 else greatest(0,extract(epoch from now()-(v_entry#>>'{timer,startedAt}')::timestamptz)) end;
   v_entry:=v_entry||jsonb_build_object('status','SKIPPED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   v_person:=v_person||jsonb_build_object('status','NO_SHOW','guestStatus','backstage');
   update public.room_invitations_v2 set status='backstage',backstage_at=now() where room_id=p_room_id and guest_id=(v_entry->>'participantId')::uuid and status='onstage' and ended_at is null;
   perform public.rooms_reconcile_program_layout_v1(p_room_id);
   v_rt:=v_rt||jsonb_build_object('preparedEntryId',case when v_rt->>'preparedEntryId'=v_entry->>'id' then null else v_rt->>'preparedEntryId' end);
 when 'openmic.feedback.open' then
   v_mode:=coalesce(v_rt#>>'{config,rules,openMicFeedback}','none');
   if v_mode not in ('appreciation','scored') then raise exception 'cage_open_mic_feedback_disabled'; end if;
   if v_entry->>'status'<>'PERFORMED' then raise exception 'cage_passage_not_finished'; end if;
   if jsonb_typeof(v_entry->'feedback')='object' then raise exception 'cage_open_mic_feedback_already_created'; end if;
   if exists(select 1 from jsonb_array_elements(v_entries) where coalesce((value#>>'{feedback,open}')::boolean,false)) then raise exception 'cage_open_mic_feedback_already_open'; end if;
   v_entry:=v_entry||jsonb_build_object('feedback',jsonb_build_object('mode',v_mode,'open',true,'endsAt',now()+make_interval(secs=>(v_rt#>>'{config,rules,votingDurationSeconds}')::integer),'closedAt',null,'responses','{}'::jsonb,'count',0,'total',0,'average',null));
   v_rt:=v_rt||jsonb_build_object('feedbackEntryId',v_entry->>'id');
 when 'openmic.feedback.cast' then
   if public.rooms_specialized_is_control_v1(p_room_id,v_uid) or v_uid::text=v_entry->>'participantId' or not exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=v_uid and left_at is null) then raise exception 'cage_public_viewer_required'; end if;
   if not coalesce((v_entry#>>'{feedback,open}')::boolean,false) or (v_entry#>>'{feedback,endsAt}')::timestamptz<=now() then raise exception 'cage_open_mic_feedback_closed'; end if;
   if (v_entry#>'{feedback,responses}') ? v_uid::text then raise exception 'cage_open_mic_feedback_already_cast'; end if;
   v_score:=case when v_entry#>>'{feedback,mode}'='appreciation' then 1 else (p_payload->>'score')::integer end;
   if v_score is null or v_score not between 1 and 5 then raise exception 'cage_open_mic_score_invalid'; end if;
   v_entry:=jsonb_set(v_entry,array['feedback','responses',v_uid::text],to_jsonb(v_score),true);
 when 'openmic.feedback.close' then
   if not coalesce((v_entry#>>'{feedback,open}')::boolean,false) then raise exception 'cage_open_mic_feedback_not_open'; end if;
   select count(*),coalesce(sum(value::integer),0) into v_count,v_total from jsonb_each_text(v_entry#>'{feedback,responses}');
   v_entry:=jsonb_set(v_entry,'{feedback}',v_entry->'feedback'||jsonb_build_object('open',false,'closedAt',now(),'count',v_count,'total',v_total,'average',case when v_entry#>>'{feedback,mode}'='scored' and v_count>0 then v_total::numeric/v_count else null end));
   v_rt:=v_rt||jsonb_build_object('feedbackEntryId',null);
 else raise exception 'cage_open_mic_action_unknown';
 end case;
 v_rt:=v_rt||jsonb_build_object('participants',public.rooms_cage_match_replace_v1(v_people,v_person),'openMicEntries',public.rooms_cage_match_replace_v1(v_entries,v_entry));
 if p_action='openmic.feedback.close' and not exists(select 1 from jsonb_array_elements(v_rt->'openMicEntries') where value->>'status' not in ('PERFORMED','SKIPPED') or (value->>'status'='PERFORMED' and value#>>'{feedback,closedAt}' is null)) then
   v_rt:=v_rt||jsonb_build_object('status','COMPLETED');
 end if;
 if p_action in ('openmic.end','participant.forfeit') then
   if not exists(select 1 from jsonb_array_elements(v_rt->'openMicEntries') where value->>'status' not in ('PERFORMED','SKIPPED')) then
     return v_rt||jsonb_build_object('status',case when coalesce(v_rt#>>'{config,rules,openMicFeedback}','none')='none' or not exists(select 1 from jsonb_array_elements(v_rt->'openMicEntries') where value->>'status'='PERFORMED' and value#>>'{feedback,closedAt}' is null) then 'COMPLETED' else 'RUNNING' end,'preparedEntryId',null);
   end if;
   if v_rt->>'preparedEntryId' is null then begin v_rt:=public.rooms_cage_prepare_open_mic_v1(p_room_id,v_rt); exception when raise_exception then null; end; end if;
   if coalesce((v_rt->>'autoRegie')::boolean,false) and v_rt->>'preparedEntryId' is not null then
     begin v_rt:=public.rooms_cage_promote_open_mic_v1(p_room_id,v_rt); exception when raise_exception then null; end;
     if v_rt->>'preparedEntryId' is null then begin v_rt:=public.rooms_cage_prepare_open_mic_v1(p_room_id,v_rt); exception when raise_exception then null; end; end if;
   end if;
 end if;
 return v_rt;
end;
$$;

-- A ready participant may finish the Greenhouse after the previous performance.
-- Reevaluate that transition on commands and presence refreshes, without ever
-- starting an artistic timer. Only an explicitly prepared item can be promoted.
create or replace function public.rooms_cage_refresh_regie_v1(p_room_id uuid,p_runtime jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_next jsonb; v_active jsonb; v_ready boolean;
begin
 if v_rt->>'status' in ('COMPLETED','CANCELLED') then return v_rt; end if;
 v_rt:=jsonb_set(v_rt,'{participants}',public.rooms_cage_people_v1(p_room_id,v_rt));
 if v_rt#>>'{config,format}'='open-mic' then
   select value into v_next from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'id'=v_rt->>'preparedEntryId' and value->>'status' in ('GREENHOUSE','READY');
   if v_next is null then return v_rt; end if;
   v_ready:=exists(select 1 from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_next->>'participantId' and public.rooms_cage_ready_v1(value) and value->>'status'='READY' and value->>'guestStatus'='backstage');
   v_next:=v_next||jsonb_build_object('status',case when v_ready then 'READY' else 'GREENHOUSE' end);
   v_rt:=jsonb_set(v_rt,'{openMicEntries}',public.rooms_cage_match_replace_v1(v_rt->'openMicEntries',v_next));
   select value into v_active from jsonb_array_elements(v_rt->'openMicEntries') where value->>'id'=v_rt->>'activeEntryId';
   if v_ready and coalesce((v_rt->>'autoRegie')::boolean,false) and (v_active is null or v_active->>'status' in ('PERFORMED','SKIPPED','POSTPONED')) then
     begin
       v_rt:=public.rooms_cage_promote_open_mic_v1(p_room_id,v_rt,v_next->>'id');
       begin v_rt:=public.rooms_cage_prepare_open_mic_v1(p_room_id,v_rt); exception when raise_exception then null; end;
     exception when raise_exception then null; end;
   end if;
 else
   select value into v_next from jsonb_array_elements(v_rt->'matches') where value->>'id'=v_rt->>'preparedMatchId' and value->>'status' in ('GREENHOUSE','READY');
   if v_next is null then return v_rt; end if;
   v_ready:=(select count(*) from jsonb_array_elements(v_rt->'participants') where value->>'id' in (v_next->>'participantAId',v_next->>'participantBId') and public.rooms_cage_ready_v1(value) and value->>'status'='READY' and value->>'guestStatus'='backstage')=2;
   v_next:=v_next||jsonb_build_object('status',case when v_ready then 'READY' else 'GREENHOUSE' end);
   v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_rt->'matches',v_next));
   select value into v_active from jsonb_array_elements(v_rt->'matches') where value->>'id'=v_rt->>'activeMatchId';
   if v_ready and v_rt->>'lockedAt' is not null and coalesce((v_rt->>'autoRegie')::boolean,false) and (v_active is null or v_active->>'status' in ('RESOLVED','CLOSED','POSTPONED')) then
     begin
       v_rt:=public.rooms_cage_promote_pair_v1(p_room_id,v_rt,v_next->>'id');
       begin v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt); exception when raise_exception then null; end;
     exception when raise_exception then null; end;
   end if;
 end if;
 return v_rt;
end;
$$;

-- Compatibility projection for the already-approved ring and video programme.
create or replace function public.rooms_cage_project_visual_v1(p_cage jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_rt jsonb:=p_cage->'runtime'; v_matches jsonb:='[]'; v_m jsonb; v_a jsonb; v_b jsonb; v_current jsonb; v_step jsonb; v_status text; v_entries jsonb:='[]'; v_entry jsonb; v_feedback jsonb;
begin
  if v_rt#>>'{config,format}'='open-mic' then
    for v_entry in select value from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) order by (value->>'order')::integer loop
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('id',v_entry->>'id','personId',v_entry->>'participantId','order',v_entry->'order',
        'status',case when v_entry->>'id'=v_rt->>'activeEntryId' and v_entry->>'status' in ('ON_STAGE','IN_PROGRESS','PAUSED') then 'live' when v_entry->>'status'='READY' then 'ready' when v_entry->>'status'='PERFORMED' then 'done' when v_entry->>'status'='SKIPPED' then 'absent' else 'scheduled' end,'slot','Passage '||(v_entry->>'order')));
      if v_entry->>'id'=v_rt->>'activeEntryId' then v_current:=v_entry; end if;
      if v_entry->>'id'=v_rt->>'feedbackEntryId' then v_feedback:=v_entry->'feedback'; end if;
    end loop;
    return p_cage||jsonb_build_object('matches','[]'::jsonb,'openMicEntries',v_entries,'currentMatchId','','currentRound',1,'battleRound',1,'battleRoundCount',1,
      'battleStatus',case when v_current->>'status'='IN_PROGRESS' then 'live-a' when v_current->>'status'='PAUSED' then case when jsonb_typeof(v_current->'incident')='object' then 'incident' else 'paused' end when v_current->>'status' in ('PERFORMED','SKIPPED') then 'done' else 'ready' end,
      'battleStartedAt',v_current#>'{timer,startedAt}','battleElapsedSeconds',coalesce(v_current#>'{timer,elapsedSeconds}','0'),'battleActiveSide',case when v_current is null then null else 'A' end,
      'passageDurationSeconds',coalesce(v_current->'durationSeconds',v_rt#>'{config,rules,passageDurationSeconds}'),'votingOpen',coalesce(v_feedback->'open','false'),'votingEndsAt',v_feedback->'endsAt','resultsHidden',v_feedback->>'closedAt' is null,'votes','{}'::jsonb,'resultHistory','[]'::jsonb,
      'event',coalesce(p_cage->'event','{}')||jsonb_build_object('status',case when v_rt->>'status'='COMPLETED' then 'completed' when v_rt->>'status' in ('RUNNING','PAUSED') then 'live' else 'ready' end));
  end if;
  for v_m in select value from jsonb_array_elements(coalesce(v_rt->'matches','[]')) loop
    select value->'person' into v_a from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_m->>'participantAId';
    select value->'person' into v_b from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_m->>'participantBId';
    if v_a is not null and v_b is not null then
      v_matches:=v_matches||jsonb_build_array(jsonb_build_object('id',v_m->>'id','round',v_m->'round','competitorA',v_a,'competitorB',v_b,'status',case when v_m->>'status' in ('RESOLVED','CLOSED') then 'done' when v_m->>'status' in ('IN_PROGRESS','PAUSED','VOTING','READY_FOR_VOTE','ON_STAGE') then 'live' else 'ready' end,'scoreA',coalesce(v_m#>'{vote,scoreA}','0'),'scoreB',coalesce(v_m#>'{vote,scoreB}','0'),'winnerId',v_m->'winnerId'));
    end if;
    if v_m->>'id'=v_rt->>'activeMatchId' then v_current:=v_m; end if;
  end loop;
  v_step:=v_current->'steps'->coalesce((v_current->>'stepIndex')::integer,0);
  v_status:=case when v_current->>'status'='IN_PROGRESS' then case when v_step->>'side'='B' then 'live-b' else 'live-a' end when v_current->>'status'='PAUSED' then case when v_current->'incident' not in ('null'::jsonb,'{}'::jsonb) then 'incident' else 'paused' end when v_current->>'status' in ('RESOLVED','CLOSED','READY_FOR_VOTE','VOTING') then 'done' else 'ready' end;
  return p_cage||jsonb_build_object('matches',v_matches,'currentMatchId',coalesce(v_rt->>'activeMatchId',''),'currentRound',coalesce(v_current->'round','1'),
    'battleStatus',v_status,'battleRound',1+coalesce((v_current->>'stepIndex')::integer,0)/case when v_rt#>>'{config,rules,performanceMode}'='simultaneous' then 1 else 2 end,
    'battleStartedAt',v_current#>'{timer,startedAt}','battleElapsedSeconds',coalesce(v_current#>'{timer,elapsedSeconds}','0'),'battleActiveSide',case when v_step->>'side'='B' then '"B"'::jsonb when v_current is null then 'null'::jsonb else '"A"'::jsonb end,
    'votingOpen',coalesce(v_current#>'{vote,open}','false'),'votingEndsAt',v_current#>'{vote,endsAt}','resultsHidden',v_current#>>'{vote,closedAt}' is null,'votes',coalesce(v_current#>'{vote,ballots}','{}'),
    'event',coalesce(p_cage->'event','{}')||jsonb_build_object('status',case when v_rt->>'status'='COMPLETED' then 'completed' when v_rt->>'status' in ('RUNNING','FINAL','PAUSED') then 'live' else 'ready' end));
end;
$$;

create or replace function public.rooms_get_cage_state_v1(p_room_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_state jsonb; v_rt jsonb; v_matches jsonb:='[]'; v_m jsonb; v_entries jsonb:='[]'; v_entry jsonb; v_feedback jsonb; v_uid uuid:=auth.uid(); v_control boolean;
begin
  if not exists(select 1 from public.rooms_v2 where id=p_room_id and status in ('live','ended')) then return null; end if;
  if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid) then raise exception 'cage_access_revoked' using errcode='42501'; end if;
  perform public.rooms_cage_reconcile_v1(p_room_id);
  select state into v_state from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage';
  if v_state is null or v_state#>'{cage,runtime}' is null then return null; end if;
  v_control:=public.rooms_specialized_is_control_v1(p_room_id,v_uid);
  v_rt:=v_state#>'{cage,runtime}';
  v_rt:=jsonb_set(v_rt,'{participants}',public.rooms_cage_people_v1(p_room_id,v_rt));
  for v_m in select value from jsonb_array_elements(v_rt->'matches') loop
    if v_m->>'id'=v_rt->>'preparedMatchId' and v_m->>'status' in ('GREENHOUSE','READY') then
      v_m:=v_m||jsonb_build_object('status',case when
        (select count(*) from jsonb_array_elements(v_rt->'participants') where value->>'id' in (v_m->>'participantAId',v_m->>'participantBId') and public.rooms_cage_ready_v1(value) and value->>'status'='READY')=2
        then 'READY' else 'GREENHOUSE' end);
    end if;
    if not v_control and v_m->'incident' is not null and v_m->'incident'<>'null'::jsonb then
      v_m:=jsonb_set(v_m,'{incident,reason}','"Incident technique — reconnexion"');
    end if;
    if jsonb_typeof(v_m->'vote')='object' and v_m#>>'{vote,closedAt}' is null then
      v_m:=jsonb_set(v_m,'{vote}',coalesce(v_m->'vote','{}')||jsonb_build_object('ballots',case when (v_m#>'{vote,ballots}') ? v_uid::text then jsonb_build_object(v_uid::text,v_m#>array['vote','ballots',v_uid::text]) else '{}'::jsonb end,'scoreA',0,'scoreB',0));
    elsif jsonb_typeof(v_m->'vote')='object' then v_m:=jsonb_set(v_m,'{vote,ballots}',case when (v_m#>'{vote,ballots}') ? v_uid::text then jsonb_build_object(v_uid::text,v_m#>array['vote','ballots',v_uid::text]) else '{}'::jsonb end); end if;
    v_matches:=v_matches||jsonb_build_array(v_m);
  end loop;
  v_rt:=jsonb_set(v_rt,'{matches}',v_matches);
  for v_entry in select value from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) loop
    if v_entry->>'id'=v_rt->>'preparedEntryId' and v_entry->>'status' in ('GREENHOUSE','READY') then
      v_entry:=v_entry||jsonb_build_object('status',case when exists(select 1 from jsonb_array_elements(v_rt->'participants') where value->>'id'=v_entry->>'participantId' and public.rooms_cage_ready_v1(value) and value->>'status'='READY') then 'READY' else 'GREENHOUSE' end);
    end if;
    if not v_control and jsonb_typeof(v_entry->'incident')='object' then v_entry:=jsonb_set(v_entry,'{incident,reason}','"Incident technique — reconnexion"'); end if;
    if jsonb_typeof(v_entry->'feedback')='object' then
      v_feedback:=v_entry->'feedback';
      v_feedback:=v_feedback||jsonb_build_object('responses',case when (v_feedback->'responses') ? v_uid::text then jsonb_build_object(v_uid::text,v_feedback#>array['responses',v_uid::text]) else '{}'::jsonb end);
      if v_feedback->>'closedAt' is null then v_feedback:=v_feedback||jsonb_build_object('count',0,'total',0,'average',null); end if;
      v_entry:=jsonb_set(v_entry,'{feedback}',v_feedback);
    end if;
    v_entries:=v_entries||jsonb_build_array(v_entry);
  end loop;
  v_rt:=jsonb_set(v_rt,'{openMicEntries}',v_entries,true);
  v_rt:=v_rt-'processedCommandIds';
  if not v_control then
    v_rt:=jsonb_set(v_rt,'{journal}','[]');
    v_rt:=jsonb_set(v_rt,'{participants}',coalesce((select jsonb_agg(case when value->>'id'=v_uid::text then value else value-'readiness'-'present'-'registered'-'eligible'-'guestStatus'-'graceEndsAt' end)
      from jsonb_array_elements(v_rt->'participants') person(value) where value->>'seed' is not null or value->>'id'=v_uid::text
        or exists(select 1 from jsonb_array_elements(v_rt->'matches') match(value) where person.value->>'id' in(match.value->>'participantAId',match.value->>'participantBId'))
        or exists(select 1 from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) entry(value) where person.value->>'id'=entry.value->>'participantId')),'[]'));
    v_rt:=jsonb_set(v_rt,'{config}',v_rt->'config'-'rosterProfileIds'-'templateId');
  end if;
  v_state:=jsonb_set(v_state,'{cage,runtime}',v_rt);
  v_state:=jsonb_set(v_state,'{cage}',public.rooms_cage_project_visual_v1(v_state->'cage'));
  return v_state||jsonb_build_object('serverNow',now(),'audience',jsonb_build_object('eligible',v_uid is not null,'actorRole',case when v_control then 'host' when v_uid is null then 'visitor' else 'viewer' end));
end;
$$;

-- Called on projection refresh: elapsed official time and lost connection are
-- reconciled under the same row lock even if the Host has reloaded or left.
create or replace function public.rooms_cage_reconcile_v1(p_room_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.room_specialized_state_v1%rowtype; v_rt jsonb; v_before jsonb; v_m jsonb; v_entry jsonb; v_id text; v_lost text; v_a integer; v_b integer; v_elapsed numeric; v_reason text; v_revision bigint; v_state jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('meewav:rooms:program-transition:'||p_room_id::text,0));
 select * into v_row from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage' for update;
 if not found or v_row.state#>'{cage,runtime}' is null or not exists(select 1 from public.rooms_v2 where id=p_room_id and status='live') then return; end if;
 v_rt:=v_row.state#>'{cage,runtime}';
 if v_rt#>>'{config,format}'='open-mic' then
   select value into v_entry from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'id'=v_rt->>'activeEntryId';
   if v_entry->>'status'='IN_PROGRESS' then
     v_id:=v_entry->>'participantId';
     if not exists(select 1 from public.room_cage_presence_v1 pr join public.room_participants_v2 p on p.room_id=pr.room_id and p.user_id=pr.user_id
       where pr.room_id=p_room_id and pr.user_id::text=v_id and p.left_at is null and pr.seen_at>now()-interval '45 seconds' and pr.camera and pr.microphone and pr.mixer and pr.permissions) then
       v_lost:=v_id;
       v_elapsed:=coalesce((v_entry#>>'{timer,elapsedSeconds}')::numeric,0)+greatest(0,extract(epoch from now()-(v_entry#>>'{timer,startedAt}')::timestamptz));
       v_entry:=v_entry||jsonb_build_object('status','PAUSED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed),
         'incident',jsonb_build_object('participantId',v_id,'reason','Incident technique — reconnexion','openedAt',now(),'graceEndsAt',now()+make_interval(secs=>(v_rt#>>'{config,rules,disconnectGraceSeconds}')::integer)));
       v_rt:=v_rt||jsonb_build_object('status','PAUSED','openMicEntries',public.rooms_cage_match_replace_v1(v_rt->'openMicEntries',v_entry));
       v_reason:='openmic.connection-lost'; v_m:=v_entry;
     end if;
   end if;
   select value into v_entry from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where coalesce((value#>>'{feedback,open}')::boolean,false) and (value#>>'{feedback,endsAt}')::timestamptz<=now() limit 1;
   if v_entry is not null then
     v_rt:=public.rooms_cage_apply_open_mic_v1(p_room_id,v_rt,'openmic.feedback.close',jsonb_build_object('entryId',v_entry->>'id'),v_entry->>'id');
     v_reason:=case when v_reason is null then 'openmic.feedback.expired' else 'openmic.connection-lost-and-feedback-expired' end; v_m:=v_entry;
   end if;
 else
 select value into v_m from jsonb_array_elements(v_rt->'matches') where value->>'id'=v_rt->>'activeMatchId';
 if v_m->>'status'='IN_PROGRESS' then
   foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
     if not exists(select 1 from public.room_cage_presence_v1 pr join public.room_participants_v2 p on p.room_id=pr.room_id and p.user_id=pr.user_id
       where pr.room_id=p_room_id and pr.user_id::text=v_id and p.left_at is null and pr.seen_at>now()-interval '45 seconds' and pr.camera and pr.microphone and pr.mixer and pr.permissions) then v_lost:=v_id; exit; end if;
   end loop;
   if v_lost is not null then
     v_elapsed:=coalesce((v_m#>>'{timer,elapsedSeconds}')::numeric,0)+greatest(0,extract(epoch from now()-(v_m#>>'{timer,startedAt}')::timestamptz));
     v_m:=v_m||jsonb_build_object('status','PAUSED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed),
       'incident',jsonb_build_object('participantId',v_lost,'reason','Incident technique — reconnexion','openedAt',now(),'graceEndsAt',now()+make_interval(secs=>(v_rt#>>'{config,rules,disconnectGraceSeconds}')::integer)));
     v_rt:=v_rt||jsonb_build_object('status','PAUSED','matches',public.rooms_cage_match_replace_v1(v_rt->'matches',v_m));
     v_reason:='match.connection-lost';
   end if;
 elsif v_m->>'status'='VOTING' and coalesce((v_m#>>'{vote,open}')::boolean,false) and (v_m#>>'{vote,endsAt}')::timestamptz<=now() then
   select count(*) filter(where value='A'),count(*) filter(where value='B') into v_a,v_b from jsonb_each_text(v_m#>'{vote,ballots}');
   v_m:=jsonb_set(v_m,'{vote}',v_m->'vote'||jsonb_build_object('open',false,'closedAt',now(),'scoreA',v_a,'scoreB',v_b));
   if v_a=v_b then
     v_m:=v_m||jsonb_build_object('status','TIE_BREAK','stepIndex',0,'steps',public.rooms_cage_steps_v1(v_rt->'config',true),'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'tieBreakRound',coalesce((v_m->>'tieBreakRound')::integer,0)+1);
     v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_rt->'matches',v_m));
   else
     v_rt:=jsonb_set(v_rt,'{participants}',public.rooms_cage_people_v1(p_room_id,v_rt));
     v_rt:=public.rooms_cage_resolve_v1(p_room_id,v_rt,v_m,case when v_a>v_b then v_m->>'participantAId' else v_m->>'participantBId' end,'public');
   end if;
   v_reason:='vote.expired';
 end if;
 end if;
 v_before:=v_rt;
 v_rt:=public.rooms_cage_refresh_regie_v1(p_room_id,v_rt);
 if (v_rt-'participants') is distinct from (v_before-'participants') then
   v_reason:=concat_ws('+',v_reason,case when v_rt->>'activeEntryId' is distinct from v_before->>'activeEntryId' or v_rt->>'activeMatchId' is distinct from v_before->>'activeMatchId' then 'regie.auto-promote' else 'regie.readiness' end);
 end if;
 if v_reason is null then return; end if;
 v_revision:=v_row.revision+1;
 v_rt:=jsonb_set(v_rt,'{journal}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now(),'actorId','system','action',v_reason,'matchId',coalesce(v_m->>'id',v_rt->>'activeEntryId',v_rt->>'activeMatchId'),'detail',case when v_lost is not null then 'Incident technique — reconnexion' when v_reason like 'regie.%' then 'Préparation vérifiée · régie synchronisée' else 'Vote clos automatiquement' end))||coalesce(v_rt->'journal','[]'));
 v_state:=jsonb_set(v_row.state,'{cage,runtime}',v_rt);
 v_state:=jsonb_set(v_state,'{cage}',public.rooms_cage_project_visual_v1(v_state->'cage'))||jsonb_build_object('revision',v_revision,'updatedAt',now());
 update public.room_specialized_state_v1 set state=v_state,revision=v_revision,updated_at=now() where room_id=p_room_id;
 insert into public.room_cage_events_v1(room_id,revision,kind,detail) values(p_room_id,v_revision,v_reason,jsonb_build_object('matchId',v_m->>'id','participantId',v_lost));
 update public.room_specialized_state_signal_v1 set revision=v_revision,updated_at=now() where room_id=p_room_id;
end;
$$;

create or replace function public.rooms_apply_cage_command_v1(
 p_room_id uuid,p_action text,p_payload jsonb,p_idempotency_key uuid,p_expected_revision bigint,
 p_expected_match_id text default null,p_expected_step_index integer default null,p_expected_entry_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_room public.rooms_v2%rowtype; v_row public.room_specialized_state_v1%rowtype; v_receipt public.room_cage_commands_v1%rowtype;
 v_state jsonb; v_rt jsonb; v_config jsonb; v_people jsonb; v_person jsonb; v_other jsonb; v_next_people jsonb; v_selected jsonb; v_matches jsonb; v_m jsonb; v_next jsonb;
 v_id text; v_replacement text; v_mode text; v_shortage text; v_ids text[]; v_slots text[]; v_rotation text[]; v_a text; v_b text; v_winner text; v_side text;
 v_size integer; v_count integer; v_requested integer; v_rounds integer; v_r integer; v_i integer; v_j integer; v_order integer; v_idx integer; v_seed integer;
 v_ballots jsonb; v_a_score integer; v_b_score integer; v_elapsed numeric; v_target_status text; v_detail text; v_revision bigint; v_control boolean; v_inv public.room_invitations_v2%rowtype;
begin
 if v_uid is null or p_idempotency_key is null then raise exception 'cage_auth_required' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>16384 then raise exception 'cage_payload_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meewav:rooms:program-transition:'||p_room_id::text,0));
 select * into v_room from public.rooms_v2 where id=p_room_id for update;
 if not found or v_room.status<>'live' then raise exception 'cage_room_not_live'; end if;
 if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid) then raise exception 'cage_access_revoked' using errcode='42501'; end if;
 v_control:=public.rooms_specialized_is_control_v1(p_room_id,v_uid);
 if not v_control and p_action not in ('vote.cast','regie.ready','openmic.feedback.cast') then raise exception 'cage_control_required' using errcode='42501'; end if;
 select * into v_row from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage' for update;
 if not found or v_row.state#>'{cage,runtime}' is null then raise exception 'cage_launch_configuration_missing'; end if;
 select * into v_receipt from public.room_cage_commands_v1 where room_id=p_room_id and actor_id=v_uid and idempotency_key=p_idempotency_key;
 if found then
   if v_receipt.action<>p_action or v_receipt.payload is distinct from p_payload then raise exception 'cage_idempotency_payload_conflict'; end if;
   return public.rooms_get_cage_state_v1(p_room_id);
 end if;
 if p_action not in ('vote.cast','regie.ready','openmic.feedback.cast') and p_expected_revision is distinct from v_row.revision then raise exception 'cage_revision_conflict' using errcode='40001'; end if;
 v_state:=v_row.state; v_rt:=v_state#>'{cage,runtime}'; v_config:=v_rt->'config';
 v_people:=public.rooms_cage_people_v1(p_room_id,v_rt); v_rt:=jsonb_set(v_rt,'{participants}',v_people);
 v_matches:=v_rt->'matches';
  select value into v_m from jsonb_array_elements(v_matches) where value->>'id'=v_rt->>'activeMatchId';
 if p_action='match.report' and p_payload->>'matchId' is not null then
   select value into v_m from jsonb_array_elements(v_matches) where value->>'id'=p_payload->>'matchId';
 end if;
 if p_action like 'match.%' or p_action like 'vote.%' then
   if v_m is null or p_expected_match_id is null or p_expected_match_id is distinct from v_m->>'id' then raise exception 'cage_match_changed'; end if;
   if p_expected_step_index is not null and p_expected_step_index is distinct from (v_m->>'stepIndex')::integer then raise exception 'cage_step_changed'; end if;
 end if;
 if (p_action like 'roster.%' or p_action in ('bracket.generate','bracket.reset','bracket.lock')) and v_rt->>'lockedAt' is not null then raise exception 'cage_bracket_locked'; end if;
 if v_rt->>'status'='CANCELLED' or (v_rt->>'status'='COMPLETED' and p_action<>'broadcast.bracket' and p_action not like 'openmic.feedback.%') then raise exception 'cage_competition_closed'; end if;
 v_detail:=p_action;

 if p_action like 'openmic.%' or (v_config->>'format'='open-mic' and p_action in ('participant.forfeit','participant.replace')) then
   v_rt:=public.rooms_cage_apply_open_mic_v1(p_room_id,v_rt,p_action,p_payload,p_expected_entry_id);
 else
 if v_config->>'format'='open-mic' and (p_action like 'bracket.%' or p_action like 'match.%' or p_action like 'vote.%' or p_action in ('regie.prepare','regie.promote')) then raise exception 'cage_open_mic_program_action_required'; end if;
 case p_action
 when 'roster.select' then
   if jsonb_typeof(p_payload->'participantIds') is distinct from 'array' then raise exception 'cage_participants_required'; end if;
   v_seed:=(select count(*) from jsonb_array_elements(v_people) where value->>'seed' is not null);
   for v_id in select distinct value from jsonb_array_elements_text(p_payload->'participantIds') loop
     select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id;
     if v_person is null or not coalesce((v_person->>'present')::boolean and (v_person->>'registered')::boolean and (v_person->>'eligible')::boolean,false) then raise exception 'cage_participant_unavailable'; end if;
     if v_person->>'seed' is not null then continue; end if;
     v_seed:=v_seed+1;
     if v_seed>(v_config->>'participantCount')::integer then raise exception 'cage_roster_full'; end if;
     v_people:=public.rooms_cage_match_replace_v1(v_people,v_person||jsonb_build_object('seed',v_seed,'status','SELECTED'));
   end loop;
   v_rt:=v_rt||jsonb_build_object('participants',v_people,'matches','[]'::jsonb,'status','CHECK_IN');
 when 'roster.remove' then
   v_id:=p_payload->>'participantId';
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id and value->>'seed' is not null;
   if v_person is null then raise exception 'cage_selected_participant_required'; end if;
   v_seed:=(v_person->>'seed')::integer; v_next_people:='[]';
   for v_person in select value from jsonb_array_elements(v_people) loop
     if v_person->>'id'=v_id then v_person:=v_person||jsonb_build_object('seed',null,'status','WAITING');
     elsif (v_person->>'seed')::integer>v_seed then v_person:=jsonb_set(v_person,'{seed}',to_jsonb((v_person->>'seed')::integer-1)); end if;
     v_next_people:=v_next_people||jsonb_build_array(v_person);
   end loop;
   v_rt:=v_rt||jsonb_build_object('participants',v_next_people,'matches','[]'::jsonb,'status','CHECK_IN');
 when 'roster.move' then
   v_id:=p_payload->>'participantId'; v_seed:=(p_payload->>'toSeed')::integer;
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id and value->>'seed' is not null;
   v_count:=(select count(*) from jsonb_array_elements(v_people) where value->>'seed' is not null);
   if v_person is null or v_seed is null or v_seed not between 1 and v_count then raise exception 'cage_seed_invalid'; end if;
   v_idx:=(v_person->>'seed')::integer; v_next_people:='[]';
   for v_person in select value from jsonb_array_elements(v_people) loop
     v_j:=(v_person->>'seed')::integer;
     if v_person->>'id'=v_id then v_j:=v_seed;
     elsif v_seed<v_idx and v_j>=v_seed and v_j<v_idx then v_j:=v_j+1;
     elsif v_seed>v_idx and v_j<=v_seed and v_j>v_idx then v_j:=v_j-1; end if;
     v_next_people:=v_next_people||jsonb_build_array(v_person||jsonb_build_object('seed',v_j));
   end loop;
   v_rt:=v_rt||jsonb_build_object('participants',v_next_people,'matches','[]'::jsonb);
 when 'bracket.reset' then
   select coalesce(jsonb_agg(value||jsonb_build_object('seed',null,'status','WAITING')),'[]') into v_people from jsonb_array_elements(v_people);
   v_rt:=v_rt||jsonb_build_object('participants',v_people,'matches','[]'::jsonb,'activeMatchId',null,'preparedMatchId',null,'status','CHECK_IN');
 when 'bracket.generate' then
   v_mode:=coalesce(p_payload->>'mode','manual'); v_shortage:=coalesce(p_payload->>'shortage','wait'); v_requested:=(v_config->>'participantCount')::integer;
   if v_mode not in ('manual','random','first-eligible') or v_shortage not in ('wait','byes','reduce') then raise exception 'cage_draw_mode_invalid'; end if;
   if v_mode='manual' then
     select array_agg(value->>'id' order by (value->>'seed')::integer) into v_ids from jsonb_array_elements(v_people) where value->>'seed' is not null;
     if exists(select 1 from jsonb_array_elements(v_people) where value->>'id'=any(v_ids) and not coalesce((value->>'present')::boolean and (value->>'registered')::boolean and (value->>'eligible')::boolean,false)) then raise exception 'cage_selected_participant_unavailable'; end if;
   elsif v_mode='random' then
     select array_agg(id) into v_ids from(select value->>'id' id from jsonb_array_elements(v_people) where (value->>'present')::boolean and (value->>'registered')::boolean and (value->>'eligible')::boolean order by random() limit v_requested) draw;
   else
     select array_agg(id order by joined_at,id) into v_ids from(select value->>'id' id,rp.joined_at from jsonb_array_elements(v_people) join public.room_participants_v2 rp on rp.room_id=p_room_id and rp.user_id::text=value->>'id' where (value->>'present')::boolean and (value->>'registered')::boolean and (value->>'eligible')::boolean order by rp.joined_at limit v_requested) draw;
   end if;
   v_count:=coalesce(array_length(v_ids,1),0); v_size:=v_requested;
   if v_count<2 then raise exception 'cage_not_enough_participants'; end if;
   if v_count<v_requested then
     if v_shortage='wait' then raise exception 'cage_waiting_for_participants';
     elsif v_shortage='byes' and not coalesce((v_config#>>'{rules,allowByes}')::boolean,false) then raise exception 'cage_byes_forbidden';
     elsif v_shortage='reduce' then
       if not coalesce((v_config#>>'{rules,allowFormatReduction}')::boolean,false) then raise exception 'cage_format_reduction_forbidden'; end if;
       v_size:=case when v_config->>'format'='championship' then v_count else power(2,floor(log(2,v_count)))::integer end;
       v_ids:=v_ids[1:v_size]; v_count:=v_size;
       v_config:=jsonb_set(v_config,'{participantCount}',to_jsonb(v_size));
       v_rt:=jsonb_set(v_rt,'{config}',v_config);
     end if;
   end if;
   if v_count>v_size then raise exception 'cage_roster_too_large'; end if;
   v_next_people:='[]';
   for v_person in select value from jsonb_array_elements(v_people) loop
     v_seed:=array_position(v_ids,v_person->>'id');
     v_next_people:=v_next_people||jsonb_build_array(v_person||jsonb_build_object('seed',v_seed,'status',case when v_seed is null then 'WAITING' else 'SELECTED' end));
   end loop;
   v_matches:='[]'; v_order:=0;
   if v_config->>'format'='championship' then
     v_rotation:=v_ids; if array_length(v_rotation,1)%2=1 then v_rotation:=array_append(v_rotation,null::text); end if;
     v_size:=array_length(v_rotation,1);
     for v_r in 1..v_size-1 loop
       for v_i in 1..v_size/2 loop
         v_a:=v_rotation[v_i];v_b:=v_rotation[v_size+1-v_i];
         if v_a is null or v_b is null then continue; end if;
         v_order:=v_order+1; v_matches:=v_matches||jsonb_build_array(public.rooms_cage_new_match_v1('championship-r'||v_r||'-m'||v_i,v_r,v_order,'Journée '||v_r,v_a,v_b,null,null,v_config));
       end loop;
       v_rotation:=array[v_rotation[1],v_rotation[v_size]]||v_rotation[2:v_size-1];
     end loop;
   else
     v_size:=power(2,ceil(log(2,v_size)))::integer; v_rounds:=log(2,v_size)::integer;
     v_slots:=array_fill(null::text,array[v_size]);
     -- Spread real entrants before assigning opponents, distributing BYEs.
     for v_i in 1..v_count loop
       v_j:=case when v_i<=v_size/2 then v_i*2-1 else (v_i-v_size/2)*2 end; v_slots[v_j]:=v_ids[v_i];
     end loop;
     for v_r in 1..v_rounds loop
       for v_i in 1..(v_size/power(2,v_r))::integer loop
         v_order:=v_order+1;
         v_matches:=v_matches||jsonb_build_array(public.rooms_cage_new_match_v1('tournament-r'||v_r||'-m'||v_i,v_r,v_order,
           case when v_r=v_rounds then 'Finale' when v_r=v_rounds-1 then 'Demi-finale' when v_r=v_rounds-2 then 'Quart de finale' when v_r=v_rounds-3 then 'Huitième' else 'Tour '||v_r end,
           case when v_r=1 then v_slots[v_i*2-1] else null end,case when v_r=1 then v_slots[v_i*2] else null end,
           case when v_r=1 then null else 'tournament-r'||(v_r-1)||'-m'||(v_i*2-1) end,case when v_r=1 then null else 'tournament-r'||(v_r-1)||'-m'||(v_i*2) end,v_config));
       end loop;
     end loop;
   end if;
   v_rt:=v_rt||jsonb_build_object('participants',v_next_people,'matches',v_matches,'activeMatchId',null,'preparedMatchId',null,'status','SEEDED');
 when 'bracket.lock' then
   if jsonb_array_length(v_matches)=0 then raise exception 'cage_bracket_not_generated'; end if;
   if exists(select 1 from jsonb_array_elements(v_people) where value->>'seed' is not null and not coalesce((value->>'present')::boolean and (value->>'registered')::boolean and (value->>'eligible')::boolean,false)) then raise exception 'cage_selected_participant_unavailable'; end if;
   v_rt:=public.rooms_cage_advance_v1(v_rt||jsonb_build_object('lockedAt',now(),'status','LOCKED'));
 when 'regie.prepare' then v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt,p_payload->>'matchId');
 when 'regie.promote' then
   v_rt:=public.rooms_cage_promote_pair_v1(p_room_id,v_rt,p_payload->>'matchId');
   begin v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt); exception when raise_exception then null; end;
 when 'regie.auto' then v_rt:=jsonb_set(v_rt,'{autoRegie}',to_jsonb(coalesce((p_payload->>'enabled')::boolean,false)));
 when 'broadcast.bracket' then v_rt:=jsonb_set(v_rt,'{publicBracketVisible}',to_jsonb(coalesce((p_payload->>'enabled')::boolean,false)),true);
 when 'regie.ready' then
   if p_payload->>'participantId' is distinct from v_uid::text then raise exception 'cage_own_readiness_only' using errcode='42501'; end if;
   if not exists(select 1 from public.room_cage_presence_v1 where room_id=p_room_id and user_id=v_uid and camera and microphone and mixer and permissions and seen_at>now()-interval '45 seconds') then raise exception 'cage_device_checks_required'; end if;
   select * into v_inv from public.room_invitations_v2 where room_id=p_room_id and guest_id=v_uid and ended_at is null for update;
   if v_inv.status not in ('accepted','ready','backstage') or v_inv.id is null then raise exception 'cage_invitation_consent_required'; end if;
   if v_inv.status='accepted' then perform public.rooms_mark_invitation_ready_v2(v_inv.id); end if;
   update public.room_cage_presence_v1 set ready=true where room_id=p_room_id and user_id=v_uid;
   v_rt:=jsonb_set(v_rt,'{participants}',public.rooms_cage_people_v1(p_room_id,v_rt));
 when 'match.start','match.resume' then
   if (p_action='match.start' and v_m->>'status' not in ('ON_STAGE','TIE_BREAK')) or (p_action='match.resume' and v_m->>'status'<>'PAUSED') then raise exception 'cage_match_not_startable'; end if;
   foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
     select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id;
     if not public.rooms_cage_ready_v1(v_person) or not exists(select 1 from public.room_invitations_v2 where room_id=p_room_id and guest_id=v_id::uuid and status='onstage' and ended_at is null) then raise exception 'cage_stage_not_ready'; end if;
   end loop;
   v_m:=v_m||jsonb_build_object('status','IN_PROGRESS','incident',null,'timer',jsonb_build_object('startedAt',now(),'elapsedSeconds',coalesce(v_m#>'{timer,elapsedSeconds}','0')));
   v_side:=v_m->'steps'->(v_m->>'stepIndex')::integer->>'side';
   select jsonb_agg(case when (value->>'id'=v_m->>'participantAId' and v_side in ('A','BOTH')) or (value->>'id'=v_m->>'participantBId' and v_side in ('B','BOTH')) then value||jsonb_build_object('status','PERFORMING') else value end) into v_people from jsonb_array_elements(v_people);
   v_rt:=v_rt||jsonb_build_object('status','RUNNING','participants',v_people,'matches',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'match.pause','match.incident' then
   if v_m->>'status'<>'IN_PROGRESS' and not(p_action='match.incident' and v_m->>'status'='PAUSED') then raise exception 'cage_match_not_running'; end if;
   v_elapsed:=coalesce((v_m#>>'{timer,elapsedSeconds}')::numeric,0)+case when v_m#>>'{timer,startedAt}' is null then 0 else greatest(0,extract(epoch from now()-(v_m#>>'{timer,startedAt}')::timestamptz)) end;
   v_m:=v_m||jsonb_build_object('status','PAUSED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   if p_action='match.incident' then
     if p_payload->>'participantId' not in(v_m->>'participantAId',v_m->>'participantBId') then raise exception 'cage_incident_participant_invalid'; end if;
     v_m:=jsonb_set(v_m,'{incident}',jsonb_build_object('participantId',p_payload->>'participantId','reason',left(coalesce(p_payload->>'reason','Incident technique'),240),'openedAt',now(),'graceEndsAt',now()+make_interval(secs=>(v_config#>>'{rules,disconnectGraceSeconds}')::integer)));
   end if;
   v_rt:=v_rt||jsonb_build_object('status','PAUSED','matches',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'match.restart' then
   if v_m->>'status'<>'PAUSED' or jsonb_typeof(v_m->'incident') is distinct from 'object' then raise exception 'cage_restart_requires_incident'; end if;
   v_m:=v_m||jsonb_build_object('status','ON_STAGE','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'incident',null);
   v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'match.end-step' then
   if v_m->>'status'<>'IN_PROGRESS' then raise exception 'cage_match_not_running'; end if;
   v_side:=v_m->'steps'->(v_m->>'stepIndex')::integer->>'side';
   select jsonb_agg(case when (value->>'id'=v_m->>'participantAId' and v_side in ('A','BOTH')) or (value->>'id'=v_m->>'participantBId' and v_side in ('B','BOTH')) then value||jsonb_build_object('status','PERFORMED') else value end) into v_people from jsonb_array_elements(v_people);
   v_rt:=jsonb_set(v_rt,'{participants}',v_people);
   v_idx:=(v_m->>'stepIndex')::integer+1;
   v_m:=v_m||jsonb_build_object('stepIndex',v_idx,'status',case when v_idx>=jsonb_array_length(v_m->'steps') then 'READY_FOR_VOTE' else 'ON_STAGE' end,'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0));
   v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'vote.open' then
   if v_m->>'status'<>'READY_FOR_VOTE' then raise exception 'cage_performances_not_finished'; end if;
   if v_config#>>'{rules,votingMode}'<>'public' then raise exception 'cage_jury_contract_required'; end if;
   v_m:=v_m||jsonb_build_object('status','VOTING','vote',jsonb_build_object('roundId',gen_random_uuid(),'open',true,'endsAt',now()+make_interval(secs=>(v_config#>>'{rules,votingDurationSeconds}')::integer),'ballots','{}'::jsonb,'scoreA',0,'scoreB',0,'closedAt',null));
   v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'vote.cast' then
   if not exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=v_uid and left_at is null) then raise exception 'cage_viewer_not_eligible'; end if;
   if v_control or v_uid::text in(v_m->>'participantAId',v_m->>'participantBId') then raise exception 'cage_public_viewer_required'; end if;
   if v_m->>'status'<>'VOTING' or not coalesce((v_m#>>'{vote,open}')::boolean,false) or (v_m#>>'{vote,endsAt}')::timestamptz<=now() then raise exception 'cage_vote_closed'; end if;
   v_side:=p_payload->>'choice'; if v_side is null or v_side not in ('A','B') then raise exception 'cage_vote_choice_invalid'; end if;
   if (v_m#>'{vote,ballots}') ? v_uid::text then raise exception 'cage_vote_already_cast'; end if;
   v_m:=jsonb_set(v_m,array['vote','ballots',v_uid::text],to_jsonb(v_side),true);
   v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_matches,v_m));
 when 'vote.close' then
   if v_m->>'status'<>'VOTING' or not coalesce((v_m#>>'{vote,open}')::boolean,false) then raise exception 'cage_vote_not_open'; end if;
   select count(*) filter(where value='A'),count(*) filter(where value='B') into v_a_score,v_b_score from jsonb_each_text(v_m#>'{vote,ballots}');
   v_m:=jsonb_set(v_m,'{vote}',v_m->'vote'||jsonb_build_object('open',false,'closedAt',now(),'scoreA',v_a_score,'scoreB',v_b_score));
   if v_a_score=v_b_score then
     v_m:=v_m||jsonb_build_object('status','TIE_BREAK','stepIndex',0,'steps',public.rooms_cage_steps_v1(v_config,true),'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'tieBreakRound',coalesce((v_m->>'tieBreakRound')::integer,0)+1);
     v_rt:=jsonb_set(v_rt,'{matches}',public.rooms_cage_match_replace_v1(v_matches,v_m));
   else
     v_winner:=case when v_a_score>v_b_score then v_m->>'participantAId' else v_m->>'participantBId' end;
     v_rt:=public.rooms_cage_resolve_v1(p_room_id,v_rt,v_m,v_winner,'public');
   end if;
 when 'participant.recall','participant.grace' then
   v_id:=p_payload->>'participantId';
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id and value->>'seed' is not null;
   if v_person is null or v_person->>'status' in ('ELIMINATED','FORFEIT','DISQUALIFIED') then raise exception 'cage_participant_not_callable'; end if;
   if v_config->>'format'='open-mic' then
     if not exists(select 1 from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'participantId'=v_id and value->>'status' not in ('PERFORMED','SKIPPED')) then raise exception 'cage_passage_missing'; end if;
     v_person:=v_person||jsonb_build_object('status',case when v_person->>'guestStatus'='on_stage' then v_person->>'status' else 'CALLED' end,'graceEndsAt',now()+make_interval(secs=>(v_config#>>'{rules,noShowGraceSeconds}')::integer));
   elsif p_action='participant.recall' then
     if v_person->>'status' not in ('GREENHOUSE','READY','CALLED','NO_SHOW') then raise exception 'cage_recall_not_available'; end if;
     v_person:=v_person||jsonb_build_object('status',case when public.rooms_cage_ready_v1(v_person) then 'READY' else 'GREENHOUSE' end);
   else
     v_person:=v_person||jsonb_build_object('graceEndsAt',now()+make_interval(secs=>(v_config#>>'{rules,noShowGraceSeconds}')::integer));
   end if;
   v_rt:=jsonb_set(v_rt,'{participants}',public.rooms_cage_match_replace_v1(v_people,v_person));
 when 'participant.replace' then
   if v_rt->>'lockedAt' is not null and not coalesce((v_config#>>'{rules,allowReplacement}')::boolean,false) then raise exception 'cage_replacement_forbidden'; end if;
   v_id:=p_payload->>'participantId'; v_replacement:=p_payload->>'replacementId';
   if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'cage_replacement_reason_required'; end if;
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id and value->>'seed' is not null;
   select value into v_other from jsonb_array_elements(v_people) where value->>'id'=v_replacement and value->>'seed' is null;
   if v_person is null or v_person->>'status' in ('ELIMINATED','FORFEIT','DISQUALIFIED') then raise exception 'cage_participant_not_replaceable'; end if;
   if v_other is null or not public.rooms_cage_ready_v1(v_other) or v_other->>'guestStatus'<>'backstage' then raise exception 'cage_replacement_not_ready'; end if;
   if exists(select 1 from jsonb_array_elements(v_matches) where value->>'status' not in ('RESOLVED','CLOSED') and v_id in(value->>'participantAId',value->>'participantBId')
     and (value->>'status' in ('PAUSED','IN_PROGRESS','VOTING','READY_FOR_VOTE','TIE_BREAK') or coalesce((value->>'stepIndex')::integer,0)>0
       or coalesce((value#>>'{timer,elapsedSeconds}')::numeric,0)>0 or value#>>'{timer,startedAt}' is not null)) then raise exception 'cage_replacement_match_started'; end if;
   if v_person->>'guestStatus'='on_stage' then perform public.rooms_cage_replace_stage_guest_v1(p_room_id,v_id,v_replacement); end if;
   v_other:=v_other||jsonb_build_object('seed',v_person->'seed','status',case when v_person->>'guestStatus'='on_stage' then 'ON_STAGE' else 'READY' end,'guestStatus',v_person->>'guestStatus','replacesId',v_id);
   v_person:=v_person||jsonb_build_object('seed',null,'status','NO_SHOW','guestStatus','backstage');
   v_people:=public.rooms_cage_match_replace_v1(public.rooms_cage_match_replace_v1(v_people,v_person),v_other);
   v_next:='[]';
   for v_m in select value from jsonb_array_elements(v_matches) loop
     if v_m->>'status' not in ('RESOLVED','CLOSED') then
       if v_m->>'participantAId'=v_id then v_m:=jsonb_set(v_m,'{participantAId}',to_jsonb(v_replacement)); end if;
       if v_m->>'participantBId'=v_id then v_m:=jsonb_set(v_m,'{participantBId}',to_jsonb(v_replacement)); end if;
     end if;
     v_next:=v_next||jsonb_build_array(v_m);
   end loop;
   v_detail:=(v_other#>>'{person,name}')||' remplace '||(v_person#>>'{person,name}')||' · '||left(p_payload->>'reason',240);
   v_rt:=v_rt||jsonb_build_object('participants',v_people,'matches',v_next);
 when 'participant.forfeit' then
   v_id:=p_payload->>'participantId';
   select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id;
   select value into v_m from jsonb_array_elements(v_matches) where value->>'status' not in ('RESOLVED','CLOSED') and v_id in(value->>'participantAId',value->>'participantBId') and value->>'participantAId' is not null and value->>'participantBId' is not null order by (value->>'order')::integer limit 1;
   if v_m is null or v_person is null then raise exception 'cage_forfeit_match_missing'; end if;
   if coalesce((v_person->>'present')::boolean,false) and v_m->'incident' in ('null'::jsonb,'{}'::jsonb) then raise exception 'cage_forfeit_requires_absence_or_incident'; end if;
   if coalesce((v_m#>>'{incident,graceEndsAt}')::timestamptz,(v_person->>'graceEndsAt')::timestamptz) is null or coalesce((v_m#>>'{incident,graceEndsAt}')::timestamptz,(v_person->>'graceEndsAt')::timestamptz)>now() then raise exception 'cage_grace_period_active'; end if;
   v_winner:=case when v_id=v_m->>'participantAId' then v_m->>'participantBId' else v_m->>'participantAId' end;
   v_rt:=public.rooms_cage_resolve_v1(p_room_id,v_rt,v_m,v_winner,'forfeit');
 when 'match.report' then
   if v_m->>'status' not in ('ON_STAGE','PAUSED','WAITING','GREENHOUSE','READY','CALLING') then raise exception 'cage_report_requires_pause'; end if;
   if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'cage_report_reason_required'; end if;
   v_elapsed:=coalesce((v_m#>>'{timer,elapsedSeconds}')::numeric,0)+case when v_m#>>'{timer,startedAt}' is null then 0 else greatest(0,extract(epoch from now()-(v_m#>>'{timer,startedAt}')::timestamptz)) end;
   v_m:=v_m||jsonb_build_object('status','POSTPONED','timer',jsonb_build_object('startedAt',null,'elapsedSeconds',v_elapsed));
   update public.room_invitations_v2 set status='backstage',backstage_at=now() where room_id=p_room_id and guest_id::text in(v_m->>'participantAId',v_m->>'participantBId') and status='onstage';
   foreach v_id in array array[v_m->>'participantAId',v_m->>'participantBId'] loop
     if exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=v_id::uuid and left_at is null) then
       perform public.rooms_v2_upsert_participant(p_room_id,v_id::uuid,'guest');
     end if;
     select value into v_person from jsonb_array_elements(v_people) where value->>'id'=v_id;
     if v_person is not null then v_people:=public.rooms_cage_match_replace_v1(v_people,v_person||jsonb_build_object('guestStatus',case when v_person->>'guestStatus'='on_stage' then 'backstage' else v_person->>'guestStatus' end,'status',case when public.rooms_cage_ready_v1(v_person) then 'READY' else 'GREENHOUSE' end)); end if;
   end loop;
   perform public.rooms_reconcile_program_layout_v1(p_room_id);
   v_rt:=v_rt||jsonb_build_object('participants',v_people,'activeMatchId',case when v_rt->>'activeMatchId'=v_m->>'id' then null else v_rt->>'activeMatchId' end,
     'preparedMatchId',case when v_rt->>'preparedMatchId'=v_m->>'id' then null else v_rt->>'preparedMatchId' end,'matches',public.rooms_cage_match_replace_v1(v_matches,v_m));
 else raise exception 'cage_action_unknown';
 end case;
 end if;

 v_rt:=public.rooms_cage_refresh_regie_v1(p_room_id,v_rt);
 v_revision:=v_row.revision+1;
 v_rt:=jsonb_set(v_rt,'{journal}',jsonb_build_array(jsonb_build_object('id',p_idempotency_key::text,'at',now(),'actorId',v_uid::text,'action',p_action,'matchId',coalesce(p_expected_entry_id,p_expected_match_id,v_rt->>'activeEntryId',v_rt->>'activeMatchId'),'detail',v_detail))||coalesce(v_rt->'journal','[]'));
 if jsonb_array_length(v_rt->'journal')>100 then v_rt:=jsonb_set(v_rt,'{journal}',(select jsonb_agg(value order by ord) from jsonb_array_elements(v_rt->'journal') with ordinality a(value,ord) where ord<=100)); end if;
 v_state:=jsonb_set(v_state,'{cage,runtime}',v_rt);
 v_state:=jsonb_set(v_state,'{cage}',public.rooms_cage_project_visual_v1(v_state->'cage'))||jsonb_build_object('revision',v_revision,'updatedAt',now());
 if pg_column_size(v_state)>1048576 then raise exception 'cage_state_limit'; end if;
 update public.room_specialized_state_v1 set state=v_state,revision=v_revision,updated_by=v_uid,updated_at=now() where room_id=p_room_id;
 insert into public.room_cage_commands_v1(room_id,actor_id,idempotency_key,action,payload,revision) values(p_room_id,v_uid,p_idempotency_key,p_action,p_payload,v_revision);
 insert into public.room_cage_events_v1(room_id,revision,actor_id,kind,detail) values(p_room_id,v_revision,v_uid,p_action,jsonb_build_object('matchId',coalesce(p_expected_entry_id,p_expected_match_id,v_rt->>'activeEntryId',v_rt->>'activeMatchId'),'description',v_detail,'payload',p_payload-'accountId'));
 update public.room_specialized_state_signal_v1 set revision=v_revision,updated_at=now() where room_id=p_room_id;
 return public.rooms_get_cage_state_v1(p_room_id);
end;
$$;

-- Close the legacy writable JSONB paths. Renamed implementations are callable
-- only by these security-definer wrappers, preserving every other Room.
alter function public.rooms_get_specialized_state_v1(uuid) rename to rooms_get_specialized_state_before_cage_v1;
revoke all on function public.rooms_get_specialized_state_before_cage_v1(uuid) from public,anon,authenticated;
create function public.rooms_get_specialized_state_v1(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage') then return public.rooms_get_cage_state_v1(p_room_id); end if;
 return public.rooms_get_specialized_state_before_cage_v1(p_room_id);
end;
$$;

alter function public.rooms_commit_specialized_state_v1(uuid,text,bigint,jsonb) rename to rooms_commit_specialized_state_before_cage_v1;
revoke all on function public.rooms_commit_specialized_state_before_cage_v1(uuid,text,bigint,jsonb) from public,anon,authenticated;
create function public.rooms_commit_specialized_state_v1(p_room_id uuid,p_room_type text,p_expected_revision bigint,p_next_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_room_type='cage' or exists(select 1 from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage') then raise exception 'cage_authoritative_command_required' using errcode='42501'; end if;
 return public.rooms_commit_specialized_state_before_cage_v1(p_room_id,p_room_type,p_expected_revision,p_next_state);
end;
$$;

alter function public.rooms_initialize_specialized_state_v1(uuid,text,jsonb) rename to rooms_initialize_specialized_state_before_cage_v1;
revoke all on function public.rooms_initialize_specialized_state_before_cage_v1(uuid,text,jsonb) from public,anon,authenticated;
create function public.rooms_initialize_specialized_state_v1(p_room_id uuid,p_room_type text,p_initial_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_room_type='cage' or exists(select 1 from public.room_cage_launches_v1 where room_id=p_room_id) then raise exception 'cage_launch_snapshot_required' using errcode='42501'; end if;
 return public.rooms_initialize_specialized_state_before_cage_v1(p_room_id,p_room_type,p_initial_state);
end;
$$;

alter function public.rooms_apply_specialized_viewer_action_v1(uuid,text,jsonb,uuid) rename to rooms_apply_specialized_viewer_action_before_cage_v1;
revoke all on function public.rooms_apply_specialized_viewer_action_before_cage_v1(uuid,text,jsonb,uuid) from public,anon,authenticated;
create function public.rooms_apply_specialized_viewer_action_v1(p_room_id uuid,p_action text,p_payload jsonb,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action like 'cage.%' or exists(select 1 from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage') then raise exception 'cage_authoritative_command_required' using errcode='42501'; end if;
 return public.rooms_apply_specialized_viewer_action_before_cage_v1(p_room_id,p_action,p_payload,p_idempotency_key);
end;
$$;

-- Helpers are implementation details, not alternative APIs bypassing guards.
do $$ declare v_proc regprocedure; begin
 for v_proc in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rooms_cage_%' loop
   execute format('revoke all on function %s from public, anon, authenticated',v_proc);
 end loop;
end $$;
revoke all on function public.rooms_get_cage_state_v1(uuid) from public;
revoke all on function public.rooms_apply_cage_command_v1(uuid,text,jsonb,uuid,bigint,text,integer,text) from public,anon;
grant execute on function public.rooms_cage_launch_v1(jsonb,uuid) to authenticated,service_role;
grant execute on function public.rooms_cage_presence_v1(uuid,boolean,boolean,boolean,boolean,boolean) to authenticated,service_role;
grant execute on function public.rooms_get_cage_state_v1(uuid) to anon,authenticated,service_role;
grant execute on function public.rooms_apply_cage_command_v1(uuid,text,jsonb,uuid,bigint,text,integer,text) to authenticated,service_role;
revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
revoke all on function public.rooms_commit_specialized_state_v1(uuid,text,bigint,jsonb) from public,anon;
revoke all on function public.rooms_initialize_specialized_state_v1(uuid,text,jsonb) from public,anon;
revoke all on function public.rooms_apply_specialized_viewer_action_v1(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.rooms_get_specialized_state_v1(uuid) to anon,authenticated,service_role;
grant execute on function public.rooms_commit_specialized_state_v1(uuid,text,bigint,jsonb) to authenticated,service_role;
grant execute on function public.rooms_initialize_specialized_state_v1(uuid,text,jsonb) to authenticated,service_role;
grant execute on function public.rooms_apply_specialized_viewer_action_v1(uuid,text,jsonb,uuid) to authenticated,service_role;

comment on table public.room_cage_launches_v1 is 'Immutable live snapshot, independent from the profile competition template.';
comment on table public.room_cage_events_v1 is 'Append-only audit of official Cage transitions and automatic recovery.';
comment on function public.rooms_apply_cage_command_v1(uuid,text,jsonb,uuid,bigint,text,integer,text) is 'Authoritative Cage command, serialized per Room; guest transitions and public verdict advancement commit atomically.';
commit;
