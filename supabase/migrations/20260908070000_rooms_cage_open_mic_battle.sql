-- Extend the installed Cage functions without replacing subsequent vote/permission fixes.
begin;
create or replace function public.rooms_cage_is_incumbent_v1(p_runtime jsonb,p_match jsonb,p_person jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_runtime#>>'{config,format}'='open-mic-battle' and p_person->>'guestStatus'='on_stage'
   and exists(select 1 from jsonb_array_elements(p_runtime->'matches') previous
     where previous->>'id'=p_match#>>'{sourceA,matchId}' and previous->>'status' in ('RESOLVED','CLOSED')
       and previous->>'winnerId'=p_person->>'id'),false);
$$;
revoke all on function public.rooms_cage_is_incumbent_v1(jsonb,jsonb,jsonb) from public,anon,authenticated;

do $battle$
declare f record; body text; original text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname in ('rooms_cage_valid_config_v1','rooms_configure_cage_v1',
 'rooms_cage_prepare_pair_v1','rooms_cage_promote_pair_v1','rooms_cage_resolve_v1','rooms_cage_refresh_regie_v1')
 or p.proname like 'rooms_apply_cage_command%') loop
   original:=replace(pg_get_functiondef(f.oid),E'\r\n',E'\n'); body:=original;
   body:=replace(body,$s$('tournament','championship','open-mic')$s$,$s$('tournament','championship','open-mic','open-mic-battle')$s$);
   body:=replace(body,$s$('tournament','championship')$s$,$s$('tournament','championship','open-mic-battle')$s$);
   if f.proname='rooms_cage_prepare_pair_v1' then
     body:=replace(body,$s$if v_person->>'guestStatus'='on_stage' then raise exception 'cage_next_pair_still_on_stage'; end if;$s$,
       $s$if v_person->>'guestStatus'='on_stage' then
         if public.rooms_cage_is_incumbent_v1(v_rt,v_m,v_person) and public.rooms_cage_ready_v1(v_person) then continue; end if;
         raise exception 'cage_next_pair_still_on_stage'; end if;$s$);
     body:=replace(body,$s$and v_person->>'guestStatus'='backstage' then 'READY'$s$,
       $s$and (v_person->>'guestStatus'='backstage' or public.rooms_cage_is_incumbent_v1(v_rt,v_m,v_person)) then 'READY'$s$);
   elsif f.proname='rooms_cage_promote_pair_v1' then
     body:=replace(body,$s$if v_inv.status not in ('ready','backstage') or v_inv.id is null$s$,
       $s$if (v_inv.status not in ('ready','backstage') and not (v_inv.status='onstage' and public.rooms_cage_is_incumbent_v1(v_rt,v_m,v_person))) or v_inv.id is null$s$);
     body:=replace(body,$s$where room_id=p_room_id and status='onstage' and ended_at is null) then raise exception 'cage_stage_not_empty'$s$,
       $s$where room_id=p_room_id and status='onstage' and ended_at is null
       and not (v_rt#>>'{config,format}'='open-mic-battle' and guest_id::text in (v_m->>'participantAId',v_m->>'participantBId'))) then raise exception 'cage_stage_not_empty'$s$);
     body:=replace(body,$s$onstage_at=now()$s$,$s$onstage_at=case when status='onstage' then onstage_at else now() end$s$);
   elsif f.proname='rooms_cage_resolve_v1' then
     body:=replace(body,$s$end,'guestStatus','backstage')$s$,
       $s$end,'guestStatus',case when v_rt#>>'{config,format}'='open-mic-battle' then
       case when v_p->>'id'=p_winner then v_p->>'guestStatus' else 'audience' end else 'backstage' end)$s$);
     body:=replace(body,$s$update public.room_invitations_v2 set status='backstage',backstage_at=now()$s$,
       $s$if v_rt#>>'{config,format}'='open-mic-battle' then
         update public.room_invitations_v2 set status='ended',ended_at=now()
         where room_id=p_room_id and guest_id::text in(v_m->>'participantAId',v_m->>'participantBId')
           and guest_id::text<>p_winner and ended_at is null;
         update public.room_queue_v2 set removed_at=now() where room_id=p_room_id
           and user_id::text in(v_m->>'participantAId',v_m->>'participantBId') and user_id::text<>p_winner and removed_at is null;
       else
       update public.room_invitations_v2 set status='backstage',backstage_at=now()$s$);
     body:=replace(body,$s$and status='onstage' and ended_at is null;
 foreach v_id$s$,$s$and status='onstage' and ended_at is null;
       end if;
 foreach v_id$s$);
     body:=replace(body,$s$perform public.rooms_v2_upsert_participant(p_room_id,v_id::uuid,'guest');$s$,
       $s$perform public.rooms_v2_upsert_participant(p_room_id,v_id::uuid,case when v_rt#>>'{config,format}'='open-mic-battle' and v_id<>p_winner then 'viewer' else 'guest' end);$s$);
   elsif f.proname='rooms_cage_refresh_regie_v1' then
     body:=replace(body,$s$and value->>'status'='READY' and value->>'guestStatus'='backstage')=2$s$,
       $s$and ((value->>'status'='READY' and value->>'guestStatus'='backstage') or public.rooms_cage_is_incumbent_v1(v_rt,v_next,value)))=2$s$);
   elsif f.proname like 'rooms_apply_cage_command%' and position('v_rotation:=v_ids' in body)>0 then
     body:=replace(body,$s$when v_config->>'format'='championship' then v_count$s$,
       $s$when v_config->>'format' in ('championship','open-mic-battle') then v_count$s$);
     body:=replace(body,$s$if v_config->>'format'='championship' then
     v_rotation$s$,
       $s$if v_config->>'format'='open-mic-battle' then
     for v_i in 1..v_count-1 loop
       v_matches:=v_matches||jsonb_build_array(public.rooms_cage_new_match_v1('battle-'||v_i,v_i,v_i,'Duel '||v_i,
         case when v_i=1 then v_ids[1] else null end,v_ids[v_i+1],
         case when v_i=1 then null else 'battle-'||(v_i-1) end,null,v_config));
     end loop;
   elsif v_config->>'format'='championship' then
     v_rotation$s$);
   end if;
   if body is distinct from original then execute body; end if;
 end loop;
end;
$battle$;
commit;
