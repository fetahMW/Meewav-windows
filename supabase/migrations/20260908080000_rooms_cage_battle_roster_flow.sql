-- Battle capacity is a ceiling, not a requirement to fill a tournament.
-- Keep the existing authorization, revision, idempotency and invitation checks.
begin;
do $battle_flow$
declare f record; original text; body text; updated integer := 0;
  draw_anchor text := 'v_count:=coalesce(array_length(v_ids,1),0); v_size:=v_requested;';
  lock_anchor text := 'v_rt:=public.rooms_cage_advance_v1(v_rt||jsonb_build_object(''lockedAt'',now(),''status'',''LOCKED''));';
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'rooms_apply_cage_command%'
  loop
    original := replace(pg_get_functiondef(f.oid),E'\r\n',E'\n');
    if position(draw_anchor in original)=0 then continue; end if;
    if position(lock_anchor in original)=0 or position('open-mic-battle' in original)=0 then
      raise exception 'cage_battle_flow_prerequisite_missing';
    end if;
    body := replace(original,draw_anchor,draw_anchor || E'\n   if v_config->>''format''=''open-mic-battle'' then if v_count>v_requested then raise exception ''cage_roster_too_large''; end if; v_size:=v_count; v_requested:=v_count; end if;');
    body := replace(body,lock_anchor,lock_anchor || E'\n   if v_config->>''format''=''open-mic-battle'' then v_rt:=public.rooms_cage_prepare_pair_v1(p_room_id,v_rt); end if;');
    execute body;
    updated := updated+1;
  end loop;
  if updated<>1 then raise exception 'cage_battle_flow_command_target_count: %',updated; end if;
end;
$battle_flow$;
commit;
