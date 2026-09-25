-- Retarget preparation to the artist explicitly chosen by the host.
begin;
create or replace function public.rooms_cage_prepare_open_mic_v1(p_room_id uuid,p_runtime jsonb,p_entry_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rt jsonb:=p_runtime; v_entry jsonb; v_previous jsonb; v_person jsonb; v_inv public.room_invitations_v2%rowtype; v_host uuid;
begin
 if v_rt#>>'{config,format}'<>'open-mic' then raise exception 'cage_open_mic_required'; end if;
 if v_rt->>'preparedEntryId' is not null then
   if p_entry_id is null or p_entry_id=v_rt->>'preparedEntryId' then return v_rt; end if;
   select value into v_previous from jsonb_array_elements(coalesce(v_rt->'openMicEntries','[]')) where value->>'id'=v_rt->>'preparedEntryId';
   if v_previous->>'id'=v_rt->>'activeEntryId' then raise exception 'cage_passage_already_active'; end if;
   if v_previous is not null then
     v_rt:=jsonb_set(v_rt,'{openMicEntries}',public.rooms_cage_match_replace_v1(v_rt->'openMicEntries',v_previous||jsonb_build_object('status','WAITING')));
   end if;
   v_rt:=jsonb_set(v_rt,'{preparedEntryId}','null'::jsonb);
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


-- Publish a result selector, never a client-provided score or winner.
create or replace function public.rooms_publish_cage_results_v1(p_room_id uuid,p_payload jsonb,p_idempotency_key uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_room public.rooms_v2%rowtype; v_row public.room_specialized_state_v1%rowtype;
 v_receipt public.room_cage_commands_v1%rowtype; v_rt jsonb; v_state jsonb; v_match jsonb; v_revision bigint;
 v_enabled boolean; v_match_id text;
begin
 if v_uid is null or p_idempotency_key is null then raise exception 'cage_auth_required' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' or pg_column_size(p_payload)>16384 then raise exception 'cage_payload_invalid'; end if;
 v_enabled:=(p_payload->>'enabled')::boolean; v_match_id:=nullif(p_payload->>'matchId','');
 perform pg_advisory_xact_lock(hashtextextended('meewav:rooms:program-transition:'||p_room_id::text,0));
 select * into v_room from public.rooms_v2 where id=p_room_id for update;
 if not found or v_room.status<>'live' then raise exception 'cage_room_not_live'; end if;
 if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid)
   or not public.rooms_specialized_is_control_v1(p_room_id,v_uid) then raise exception 'cage_control_required' using errcode='42501'; end if;
 select * into v_row from public.room_specialized_state_v1 where room_id=p_room_id and room_type='cage' for update;
 if not found or v_row.state#>'{cage,runtime}' is null then raise exception 'cage_launch_configuration_missing'; end if;
 select * into v_receipt from public.room_cage_commands_v1 where room_id=p_room_id and actor_id=v_uid and idempotency_key=p_idempotency_key;
 if found then
  if v_receipt.action<>'broadcast.results' or v_receipt.payload is distinct from p_payload then raise exception 'cage_idempotency_payload_conflict'; end if;
  return public.rooms_get_cage_state_v1(p_room_id);
 end if;
 if p_expected_revision is distinct from v_row.revision then raise exception 'cage_revision_conflict' using errcode='40001'; end if;
 v_rt:=v_row.state#>'{cage,runtime}';
 if v_enabled then
  if v_match_id is not null then
   select value into v_match from jsonb_array_elements(v_rt->'matches') where value->>'id'=v_match_id;
   if v_match is null or v_match->>'status' not in ('RESOLVED','CLOSED') then raise exception 'cage_results_not_ready'; end if;
  elsif v_rt->>'status' is distinct from 'COMPLETED' then raise exception 'cage_results_not_ready'; end if;
 end if;
 v_rt:=jsonb_set(v_rt,'{publicResults}',case when v_enabled then jsonb_build_object('matchId',v_match_id) else 'null'::jsonb end,true);
 v_revision:=v_row.revision+1;
 v_state:=jsonb_set(v_row.state,'{cage,runtime}',v_rt)||jsonb_build_object('revision',v_revision,'updatedAt',now());
 update public.room_specialized_state_v1 set state=v_state,revision=v_revision,updated_by=v_uid,updated_at=now() where room_id=p_room_id and room_type='cage';
 insert into public.room_cage_commands_v1(room_id,actor_id,idempotency_key,action,payload,revision) values(p_room_id,v_uid,p_idempotency_key,'broadcast.results',p_payload,v_revision);
 insert into public.room_cage_events_v1(room_id,revision,actor_id,kind,detail) values(p_room_id,v_revision,v_uid,'broadcast.results',jsonb_build_object('enabled',v_enabled,'matchId',v_match_id));
 update public.room_specialized_state_signal_v1 set revision=v_revision,updated_at=now() where room_id=p_room_id;
 return public.rooms_get_cage_state_v1(p_room_id);
end;
$$;
revoke all on function public.rooms_publish_cage_results_v1(uuid,jsonb,uuid,bigint) from public,anon;
grant execute on function public.rooms_publish_cage_results_v1(uuid,jsonb,uuid,bigint) to authenticated,service_role;
commit;
