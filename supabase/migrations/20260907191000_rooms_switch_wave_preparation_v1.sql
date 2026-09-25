-- Prepare the normalized Wave engine while the current live remains unchanged.
begin;
create table public.room_experience_wave_preparation_v1(room_id uuid primary key references public.rooms_v2(id) on delete cascade,actor_id uuid not null,config jsonb not null,created_at timestamptz not null default now());
alter table public.room_experience_wave_preparation_v1 enable row level security;
revoke all on public.room_experience_wave_preparation_v1 from public,anon,authenticated;
grant all on public.room_experience_wave_preparation_v1 to service_role;
-- Reuse the existing initializer; admit only an explicitly host-prepared switch.
do $$ declare definition text; begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rooms_initialize_wave_production_v3';
 if definition is not null then
  if position('v_room public.rooms_v2%rowtype' in definition)=0 then definition=replace(definition,'v_actor uuid := auth.uid();','v_actor uuid := auth.uid(); v_room public.rooms_v2%rowtype;');end if;
  definition=replace(definition,'if lower(replace(v_room.type', 'if not exists(select 1 from public.room_experience_wave_preparation_v1 prep where prep.room_id=p_room_id and prep.actor_id=auth.uid()) and lower(replace(v_room.type');
  execute definition;
 end if;
end $$;
create function public.rooms_prepare_wave_switch_v1(p_room_id uuid,p_expected_version bigint,p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare host uuid;s record;rules jsonb;session_id uuid;bpm numeric;bars integer;stored jsonb;
begin
 perform public.rooms_experience_member_v1(p_room_id);
 select host_id into host from public.rooms_v2 where id=p_room_id for update;
 if host is distinct from auth.uid() then raise exception 'switch_forbidden' using errcode='42501';end if;
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 if not found or s.version<>p_expected_version then raise exception 'switch_conflict' using errcode='40001';end if;
 if p_config#>>'{launch,roomType}' is distinct from 'wave' or pg_column_size(p_config)>65536 then raise exception 'switch_config_invalid';end if;
 bpm=(p_config#>>'{launch,values,bpm}')::numeric;bars=(p_config#>>'{launch,baseLoop,bars}')::integer;
 if bpm not between 40 and 240 or bars not in (4,8,16) or length(coalesce(p_config#>>'{launch,values,key}','')) not between 1 and 24 then raise exception 'switch_config_invalid';end if;
 rules=jsonb_build_object('bpm',bpm,'musicalKey',p_config#>>'{launch,values,key}','timeSignature','4/4','expectedBars',bars,'maxDurationMs',ceil(60000/bpm*4*16),'acceptedMimeTypes',jsonb_build_array('audio/wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a'),'desiredLoopTypes',jsonb_build_array('drums','bass','melody','vocal'),'effectsPolicy','EITHER','categories',jsonb_build_array(jsonb_build_object('code','drums','label','Batterie','maxSlots',4),jsonb_build_object('code','bass','label','Basse','maxSlots',2),jsonb_build_object('code','melody','label','Mélodie','maxSlots',4),jsonb_build_object('code','vocal','label','Voix','maxSlots',4)));
 select config into stored from public.room_experience_wave_preparation_v1 where room_id=p_room_id;
 if stored is not null and stored is distinct from rules then raise exception 'switch_wave_rules_already_prepared';end if;
 insert into public.room_experience_wave_preparation_v1(room_id,actor_id,config) values(p_room_id,auth.uid(),rules) on conflict do nothing;
 perform public.rooms_initialize_wave_production_v3(p_room_id,rules,'switch-prepare:'||p_room_id::text);
 select id into session_id from public.wave_sessions_v3 where room_id=p_room_id;
 return jsonb_build_object('sessionId',session_id);
end $$;
revoke all on function public.rooms_prepare_wave_switch_v1(uuid,bigint,jsonb) from public,anon;
grant execute on function public.rooms_prepare_wave_switch_v1(uuid,bigint,jsonb) to authenticated;
create function public.rooms_complete_wave_switch_base_v1(p_room_id uuid,p_expected_version bigint,p_asset_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare host uuid;s record;w record;u record;version_id uuid;beat uuid;ref uuid;
begin
 perform public.rooms_experience_member_v1(p_room_id);
 select host_id into host from public.rooms_v2 where id=p_room_id for update;
 if host is distinct from auth.uid() then raise exception 'switch_forbidden' using errcode='42501';end if;
 select * into s from public.room_experience_v1 where room_id=p_room_id;
 if not found or s.version<>p_expected_version then raise exception 'switch_conflict' using errcode='40001';end if;
 select * into w from public.wave_sessions_v3 where room_id=p_room_id for update;
 select * into u from public.wave_asset_uploads_v4 where asset_id=p_asset_id and session_id=w.id and actor_id=auth.uid() and purpose='HOST_BASE_LOOP' and state='READY';
 if not found or u.playback_asset_id is null or u.preview_asset_id is null then raise exception 'switch_wave_audio_processing';end if;
 select loop_version_id into version_id from public.wave_loop_analysis_v3 where id=u.analysis_id and compatibility='COMPATIBLE';
 if version_id is null then raise exception 'switch_wave_audio_incompatible';end if;
 beat=w.current_beat_revision_id;ref=w.production_reference_id;
 if exists(select 1 from public.wave_beat_tracks_v3 where beat_revision_id=beat and is_host_base and loop_version_id<>version_id) then raise exception 'switch_wave_base_already_prepared';end if;
 insert into public.wave_beat_tracks_v3(beat_revision_id,loop_version_id,position,is_host_base)
 select beat,version_id,0,true where not exists(select 1 from public.wave_beat_tracks_v3 where beat_revision_id=beat and is_host_base);
 update public.wave_beat_revisions_v3 set render_asset_id=u.playback_asset_id,render_status='READY' where id=beat and render_asset_id is null;
 update public.wave_production_references_v5 set studio_asset_id=coalesce(studio_asset_id,u.playback_asset_id),light_asset_id=coalesce(light_asset_id,u.preview_asset_id) where id=ref;
end $$;
revoke all on function public.rooms_complete_wave_switch_base_v1(uuid,bigint,uuid) from public,anon;
grant execute on function public.rooms_complete_wave_switch_base_v1(uuid,bigint,uuid) to authenticated;
-- Old Wave commands must not remain valid after a switch, even from an old client.
do $$ declare fn record;old_name text;params text;session_arg text; begin
 for fn in select p.*,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result_type from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rooms_start_wave_vote_v3','rooms_cast_wave_vote_v3','rooms_finalize_wave_vote_v3','rooms_set_wave_category_open_v5','rooms_review_wave_submission_v5','rooms_reject_wave_submission_v5','rooms_request_wave_submission_correction_v5','rooms_mark_wave_submission_ready_for_vote_v5','rooms_start_wave_closing_vote_v5','rooms_cast_wave_closing_vote_v5','rooms_finalize_wave_closing_vote_v5','rooms_wave_viewer_upload_v6','rooms_wave_viewer_media_grant_v6') loop
  session_arg=case when 'p_session_id'=any(fn.proargnames) then 'p_session_id' when 'p_wave_id'=any(fn.proargnames) then 'p_wave_id' when 'p_round_id'=any(fn.proargnames) then '(select session_id from public.wave_vote_rounds_v3 where id=p_round_id)' when 'p_closing_vote_id'=any(fn.proargnames) then '(select session_id from public.wave_closing_votes_v5 where id=p_closing_vote_id)' else null end;
  if session_arg is null then continue;end if;
  old_name='sw_wave_legacy_'||fn.oid;select string_agg(quote_ident(a),',') into params from unnest(fn.proargnames) a;
  execute format('alter function public.%I(%s) rename to %I',fn.proname,fn.identity_args,old_name);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',old_name,fn.identity_args);
  execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $body$ declare room uuid; begin select room_id into room from public.wave_sessions_v3 where id=%s; perform public.rooms_assert_experience_v1(room,''wave''); return public.%I(%s); end $body$',fn.proname,fn.full_args,fn.result_type,session_arg,old_name,params);
  execute format('revoke all on function public.%I(%s) from public,anon',fn.proname,fn.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',fn.proname,fn.identity_args);
 end loop;
end $$;
-- A prepared host base remains downloadable without changing the live audio bus.
do $$ declare definition text; begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rooms_wave_viewer_snapshot_v6';
 if definition is not null then
  definition=replace(definition, 'v_program.source = ''HOST_DAW'' and reference.id = v_session.production_reference_id', 'reference.id = v_session.production_reference_id');
  execute definition;
 end if;
end $$;
commit;
