-- Change the Cage format at a safe program boundary; keep the existing live and guest media.
begin;
create or replace function public.rooms_configure_cage_v1(
  p_room_id uuid, p_payload jsonb, p_idempotency_key uuid, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_room public.rooms_v2%rowtype;
  v_row public.room_specialized_state_v1%rowtype; v_receipt public.room_cage_commands_v1%rowtype;
  v_old jsonb; v_rt jsonb; v_state jsonb; v_config jsonb; v_people jsonb; v_person jsonb;
  v_selected jsonb; v_entries jsonb := '[]'; v_next_people jsonb := '[]';
  v_count integer; v_seed integer; v_revision bigint; v_format text := p_payload->>'format';
begin
  if v_uid is null or p_idempotency_key is null then raise exception 'cage_auth_required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>16384 then raise exception 'cage_payload_invalid'; end if;
  if v_format is null or v_format not in ('tournament','championship','open-mic') then raise exception 'cage_format_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('meewav:rooms:program-transition:'||p_room_id::text,0));
  select * into v_room from public.rooms_v2 where id=p_room_id for update;
  if not found or v_room.status<>'live' then raise exception 'cage_room_not_live'; end if;
  if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid)
    or not public.rooms_specialized_is_control_v1(p_room_id,v_uid) then raise exception 'cage_control_required' using errcode='42501'; end if;
  select * into v_row from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage' for update;
  if not found or v_row.state#>'{cage,runtime}' is null then raise exception 'cage_launch_configuration_missing'; end if;
  select * into v_receipt from public.room_cage_commands_v1 where room_id=p_room_id and actor_id=v_uid and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.action<>'competition.configure' or v_receipt.payload is distinct from p_payload then raise exception 'cage_idempotency_payload_conflict'; end if;
    return public.rooms_get_cage_state_v1(p_room_id);
  end if;
  if p_expected_revision is distinct from v_row.revision then raise exception 'cage_revision_conflict' using errcode='40001'; end if;
  v_old:=v_row.state#>'{cage,runtime}';
  v_people:=public.rooms_cage_people_v1(p_room_id,v_old);
  if exists(select 1 from jsonb_array_elements(v_people) where value->>'guestStatus'='on_stage')
    or exists(select 1 from jsonb_array_elements(v_old->'matches') where value->>'status' in ('ON_STAGE','IN_PROGRESS','PAUSED','READY_FOR_VOTE','VOTING','TIE_BREAK'))
    or exists(select 1 from jsonb_array_elements(coalesce(v_old->'openMicEntries','[]')) where value->>'status' in ('ON_STAGE','IN_PROGRESS','PAUSED') or value#>>'{feedback,open}'='true')
    then raise exception 'cage_format_change_active'; end if;
  if (jsonb_array_length(v_old->'matches')>0 or jsonb_array_length(coalesce(v_old->'openMicEntries','[]'))>0)
    and p_payload->>'confirmReset' is distinct from 'true' then raise exception 'cage_format_reset_confirmation_required'; end if;
  if p_payload ? 'participantCount' and (jsonb_typeof(p_payload->'participantCount')<>'number' or (p_payload->>'participantCount') !~ '^[0-9]+$') then raise exception 'cage_format_size_invalid'; end if;
  v_count:=coalesce((p_payload->>'participantCount')::integer,(v_old#>>'{config,participantCount}')::integer);
  if v_count<(case when v_format='open-mic' then 1 else 2 end) or v_count>64 then raise exception 'cage_format_size_invalid'; end if;
  select coalesce(jsonb_agg(id order by seed),'[]') into v_selected from (
    select value->>'id' id,(value->>'seed')::integer seed from jsonb_array_elements(v_people)
    where value->>'seed' is not null and value->>'present'='true' and value->>'registered'='true' and value->>'eligible'='true'
    order by (value->>'seed')::integer limit v_count) selected;
  v_config:=(v_old->'config')||jsonb_build_object('format',v_format,'participantCount',v_count,'rosterMode','prepared','rosterProfileIds',v_selected);
  v_config:=jsonb_set(v_config,'{rules,openMicFeedback}',to_jsonb(coalesce(p_payload->>'openMicFeedback',v_config#>>'{rules,openMicFeedback}','appreciation')));
  if v_config#>>'{rules,openMicFeedback}' not in ('appreciation','scored','none') then raise exception 'cage_open_mic_feedback_configuration_required'; end if;
  v_config:=public.rooms_cage_valid_config_v1(v_config);
  for v_person in select value from jsonb_array_elements(v_people) loop
    select ord::integer into v_seed from jsonb_array_elements_text(v_selected) with ordinality a(id,ord) where id=v_person->>'id';
    v_person:=(v_person-'replacesId')||jsonb_build_object('seed',v_seed,'status',case when v_seed is null then 'WAITING' else 'SELECTED' end,'graceEndsAt',null);
    v_next_people:=v_next_people||jsonb_build_array(v_person);
    if v_format='open-mic' and v_seed is not null then
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('id','openmic-'||(v_person->>'id'),'order',v_seed,'participantId',v_person->>'id','status','WAITING',
        'timer',jsonb_build_object('startedAt',null,'elapsedSeconds',0),'durationSeconds',v_config#>'{rules,passageDurationSeconds}','incident',null));
    end if;
  end loop;
  v_rt:=public.rooms_cage_empty_state_v1(p_room_id,v_config)#>'{cage,runtime}';
  v_rt:=v_rt||jsonb_build_object('participants',v_next_people,'openMicEntries',v_entries,'feedbackEntryId',null,
    'status',case when v_format='open-mic' and jsonb_array_length(v_entries)>0 then 'PREPARING' else 'CHECK_IN' end,
    'journal',jsonb_build_array(jsonb_build_object('id',p_idempotency_key::text,'at',now(),'actorId',v_uid::text,'action','competition.configure','matchId',null,'detail',(v_old#>>'{config,format}')||' → '||v_format))||coalesce(v_old->'journal','[]'));
  v_revision:=v_row.revision+1;
  v_state:=jsonb_set(v_row.state,'{cage}',(v_row.state->'cage')||(public.rooms_cage_empty_state_v1(p_room_id,v_config)->'cage')||jsonb_build_object('runtime',v_rt,'openMicEntries','[]'::jsonb));
  v_state:=jsonb_set(v_state,'{cage}',public.rooms_cage_project_visual_v1(v_state->'cage'))||jsonb_build_object('revision',v_revision,'updatedAt',now());
  if pg_column_size(v_state)>1048576 then raise exception 'cage_state_limit'; end if;
  update public.room_specialized_state_v1 set state=v_state,revision=v_revision,updated_by=v_uid,updated_at=now() where room_id=p_room_id and room_type='cage';
  insert into public.room_cage_commands_v1(room_id,actor_id,idempotency_key,action,payload,revision) values(p_room_id,v_uid,p_idempotency_key,'competition.configure',p_payload,v_revision);
  insert into public.room_cage_events_v1(room_id,revision,actor_id,kind,detail) values(p_room_id,v_revision,v_uid,'competition.configure',jsonb_build_object('previousRuntime',v_old,'configuration',v_config));
  update public.room_specialized_state_signal_v1 set revision=v_revision,updated_at=now() where room_id=p_room_id;
  return public.rooms_get_cage_state_v1(p_room_id);
end;
$$;
revoke all on function public.rooms_configure_cage_v1(uuid,jsonb,uuid,bigint) from public,anon;
grant execute on function public.rooms_configure_cage_v1(uuid,jsonb,uuid,bigint) to authenticated,service_role;
commit;
