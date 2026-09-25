begin;
-- Reuse the existing manual seat ledger; profiles are never supplied by the client.
alter function public.rooms_switch_experience_v1(uuid,bigint,uuid,text,jsonb) rename to rooms_switch_experience_before_roster_v1;
revoke all on function public.rooms_switch_experience_before_roster_v1(uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
create function public.rooms_switch_experience_v1(p_room_id uuid,p_expected_version bigint,p_request_id uuid,p_destination text,p_config jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare host_id uuid; ids uuid[]; result jsonb; item record;
begin
 select r.host_id into host_id from public.rooms_v2 r where r.id=p_room_id for update;
 if host_id is distinct from auth.uid() then raise exception 'switch_forbidden' using errcode='42501'; end if;
 if p_destination<>'classe' or exists(select 1 from public.room_experience_requests_v1 where room_id=p_room_id and request_id=p_request_id) then
  return public.rooms_switch_experience_before_roster_v1(p_room_id,p_expected_version,p_request_id,p_destination,p_config);
 end if;
 if jsonb_typeof(p_config->'studentIds') is distinct from 'array' or jsonb_array_length(p_config->'studentIds') not between 1 and 24 then raise exception 'switch_class_selection'; end if;
 begin
  select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(p_config->'studentIds') with ordinality;
 exception when invalid_text_representation then raise exception 'switch_class_selection'; end;
 if (select count(distinct id) from unnest(ids) id)<>cardinality(ids) or host_id=any(ids) or (p_config#>>'{launch,values,seats}')::integer is distinct from 24 then raise exception 'switch_class_selection'; end if;
 perform 1 from public.room_queue_v2 where room_id=p_room_id and user_id=any(ids) and removed_at is null for update;
 if (select count(distinct user_id) from public.room_queue_v2 where room_id=p_room_id and user_id=any(ids) and removed_at is null)<>cardinality(ids) then raise exception 'switch_class_selection'; end if;
 if exists(select 1 from public.room_classe_seat_entitlements_v1 e where e.room_id=p_room_id and e.status='active' and e.student_id is distinct from ids[e.seat_number]) then raise exception 'switch_class_seats_conflict'; end if;
 if exists(select 1 from unnest(ids) student_id where public.rooms_live_call_room_access_revoked_v1(p_room_id,student_id)) then raise exception 'switch_class_selection'; end if;
 for item in select id,ordinality from unnest(ids) with ordinality as students(id,ordinality) loop
  insert into public.room_classe_seat_entitlements_v1(room_id,seat_number,student_id,access_kind,status,granted_by,source_reference)
  values(p_room_id,item.ordinality::smallint,item.id,'manual_grant','active',auth.uid(),p_request_id::text)
  on conflict(room_id,seat_number) do update set student_id=excluded.student_id,access_kind='manual_grant',status='active',granted_by=auth.uid(),source_reference=excluded.source_reference,revoked_at=null,updated_at=now()
  where public.room_classe_seat_entitlements_v1.status='revoked';
 end loop;
 result=public.rooms_switch_experience_before_roster_v1(p_room_id,p_expected_version,p_request_id,p_destination,p_config);
 update public.room_specialized_state_v1 set state=public.rooms_project_classe_seats_v1(p_room_id,state,null,true) where room_id=p_room_id and room_type='classe';
 return result;
end $$;
revoke all on function public.rooms_switch_experience_v1(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.rooms_switch_experience_v1(uuid,bigint,uuid,text,jsonb) to authenticated;
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rooms_classe_has_entitlement_v1','rooms_upsert_classe_seat_entitlement_v1','rooms_set_classe_manual_seat_v1') loop
  definition=pg_get_functiondef(f.oid);
  execute replace(definition, 'room.type = ''place''', 'room.type in (''place'', ''classe'')');
 end loop;
end $$;
commit;
