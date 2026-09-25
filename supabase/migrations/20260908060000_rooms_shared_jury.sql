-- One voting policy per live, shared by polls, ratings, Wave and Cage.
begin;
create table public.room_voting_policies (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  mode text not null default 'public' check (mode in ('public','mixed','jury')),
  juror_ids uuid[] not null default '{}',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (cardinality(juror_ids) <= 4 and (mode='public' or cardinality(juror_ids) between 1 and 4))
);
alter table public.room_voting_policies enable row level security;
create policy room_voting_policy_read on public.room_voting_policies for select to authenticated using (
  exists(select 1 from public.room_participants_v2 p where p.room_id=room_voting_policies.room_id and p.user_id=auth.uid() and p.left_at is null)
  and not exists(select 1 from public.room_bans_v2 b where b.room_id=room_voting_policies.room_id and b.user_id=auth.uid())
);
grant select on public.room_voting_policies to authenticated;
revoke insert,update,delete on public.room_voting_policies from anon,authenticated;
alter publication supabase_realtime add table public.room_voting_policies;

create or replace function public.rooms_get_voting_policy_v1(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_policy public.room_voting_policies%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.room_participants_v2 where room_id=p_room_id and user_id=auth.uid() and left_at is null)
    or exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=auth.uid()) then raise exception 'room_membership_required' using errcode='42501'; end if;
  select * into v_policy from public.room_voting_policies where room_id=p_room_id;
  return jsonb_build_object('mode',coalesce(v_policy.mode,'public'),'jurorIds',coalesce(to_jsonb(v_policy.juror_ids),'[]'::jsonb),'revision',coalesce(v_policy.revision,0));
end;
$$;

create or replace function public.rooms_set_voting_policy_v1(p_room_id uuid,p_mode text,p_juror_ids uuid[],p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ids uuid[];v_revision bigint;
begin
  if auth.uid() is null or not public.rooms_specialized_is_control_v1(p_room_id,auth.uid())
    or exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=auth.uid())
    or not exists(select 1 from public.rooms_v2 where id=p_room_id and status='live') then raise exception 'room_control_required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('room-voting-policy:'||p_room_id::text,0));
  select coalesce(array_agg(distinct id),'{}'::uuid[]) into v_ids from unnest(p_juror_ids) id where id is not null;
  if p_mode is null or p_mode not in ('public','mixed','jury') or cardinality(v_ids)>4 or (p_mode<>'public' and cardinality(v_ids)<1) then raise exception 'room_jury_one_to_four_required';end if;
  if exists(select 1 from unnest(v_ids) id where not exists(
    select 1 from public.room_invitations_v2 i join public.room_participants_v2 p on p.room_id=i.room_id and p.user_id=i.guest_id
    where i.room_id=p_room_id and i.guest_id=id and i.status in ('ready','backstage') and i.ended_at is null and p.left_at is null
      and not exists(select 1 from public.room_bans_v2 b where b.room_id=p_room_id and b.user_id=id))) then raise exception 'room_jury_backstage_required';end if;
  insert into public.room_voting_policies(room_id) values(p_room_id) on conflict do nothing;
  select revision into v_revision from public.room_voting_policies where room_id=p_room_id for update;
  if p_expected_revision is distinct from v_revision then raise exception 'room_voting_revision_conflict' using errcode='40001';end if;
  update public.room_voting_policies set mode=p_mode,juror_ids=v_ids,revision=revision+1,updated_at=now(),updated_by=auth.uid() where room_id=p_room_id;
  return public.rooms_get_voting_policy_v1(p_room_id);
end;
$$;

-- Private helpers: never accept a client-supplied electorate or a weighted score.
create or replace function public.rooms_require_voter_v1(p_room_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_policy public.room_voting_policies%rowtype;
begin
  select * into v_policy from public.room_voting_policies where room_id=p_room_id for share;
  if v_policy.mode='jury' and not (p_actor=any(v_policy.juror_ids)) then raise exception 'room_vote_reserved_to_jury' using errcode='42501';end if;
end;
$$;

create or replace function public.rooms_vote_share_v1(p_room_id uuid,p_ballots jsonb,p_choice text)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_mode text;v_ids uuid[];v_public numeric;v_jury numeric;v_public_choice numeric;v_jury_choice numeric;
begin
  select mode,juror_ids into v_mode,v_ids from public.room_voting_policies where room_id=p_room_id;
  v_mode:=coalesce(v_mode,'public');v_ids:=coalesce(v_ids,'{}');
  select count(*) filter(where v_mode='public' or not (key=any(v_ids::text[]))),
    count(*) filter(where v_mode<>'public' and key=any(v_ids::text[])),
    count(*) filter(where value=p_choice and (v_mode='public' or not (key=any(v_ids::text[])))),
    count(*) filter(where value=p_choice and v_mode<>'public' and key=any(v_ids::text[]))
    into v_public,v_jury,v_public_choice,v_jury_choice from jsonb_each_text(coalesce(p_ballots,'{}'));
  if v_mode='mixed' then
    if v_public=0 or v_jury=0 then return null;end if;
    return .5*v_public_choice/v_public+.5*v_jury_choice/v_jury;
  elsif v_mode='jury' then return v_jury_choice/nullif(v_jury,0);
  else return v_public_choice/nullif(v_public,0);end if;
end;
$$;

create or replace function public.rooms_guard_shared_ballot_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_room uuid;v_actor uuid;
begin
  if TG_TABLE_NAME='room_poll_votes_v2' then select room_id into v_room from public.room_polls_v2 where id=NEW.poll_id;v_actor:=NEW.user_id;
  elsif TG_TABLE_NAME='wave_votes_v3' then select s.room_id into v_room from public.wave_vote_rounds_v3 r join public.wave_sessions_v3 s on s.id=r.session_id where r.id=NEW.round_id;v_actor:=NEW.voter_id;
  elsif TG_TABLE_NAME='wave_closing_ballots_v5' then select s.room_id into v_room from public.wave_closing_votes_v5 r join public.wave_sessions_v3 s on s.id=r.session_id where r.id=NEW.closing_vote_id;v_actor:=NEW.voter_id;
  end if;
  if v_room is null or v_actor is null then raise exception 'room_vote_context_missing';end if;
  perform public.rooms_require_voter_v1(v_room,v_actor);return NEW;
end;
$$;
create trigger room_poll_shared_jury before insert or update on public.room_poll_votes_v2 for each row execute function public.rooms_guard_shared_ballot_v1();
create trigger wave_shared_jury before insert or update on public.wave_votes_v3 for each row execute function public.rooms_guard_shared_ballot_v1();
create trigger wave_closing_shared_jury before insert or update on public.wave_closing_ballots_v5 for each row execute function public.rooms_guard_shared_ballot_v1();

revoke all on function public.rooms_require_voter_v1(uuid,uuid), public.rooms_vote_share_v1(uuid,jsonb,text), public.rooms_guard_shared_ballot_v1() from public,anon,authenticated;
revoke all on function public.rooms_get_voting_policy_v1(uuid),public.rooms_set_voting_policy_v1(uuid,text,uuid[],bigint) from public,anon;
grant execute on function public.rooms_get_voting_policy_v1(uuid),public.rooms_set_voting_policy_v1(uuid,text,uuid[],bigint) to authenticated;

create or replace function public.rooms_voter_counts_v1(p_room_id uuid,p_actor text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.room_voting_policies where room_id=p_room_id and mode='jury' and not(p_actor=any(juror_ids::text[])));
$$;
revoke all on function public.rooms_voter_counts_v1(uuid,text) from public,anon,authenticated;

create or replace function public.rooms_scene_weighted_average_v1(p_room_id uuid,p_performance_id text)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_ballots jsonb;v_average numeric:=0;v_share numeric;v_rating integer;
begin
  select jsonb_object_agg(user_id::text,rating) into v_ballots from public.room_scene_evaluation_votes_v1 where room_id=p_room_id and performance_id=p_performance_id;
  for v_rating in 1..5 loop
    v_share:=public.rooms_vote_share_v1(p_room_id,v_ballots,v_rating::text);
    if v_share is null then return null;end if;
    v_average:=v_average+v_rating*v_share;
  end loop;
  return v_average;
end;
$$;
revoke all on function public.rooms_scene_weighted_average_v1(uuid,text) from public,anon,authenticated;

-- Retain each installed command's authorization, idempotence and media checks.
-- Amend only electorate guards and result calculations in the existing bodies.
do $jury_adapters$
declare v_proc record;v_sql text;v_before text;v_share text;v_room text;
begin
  for v_proc in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname like 'rooms_apply_cage_command%'
      or p.proname in ('rooms_cage_reconcile_v1','rooms_finalize_wave_vote_v3','rooms_wave_finalize_closing_vote_v5','rooms_poll_state_v3','rooms_cast_scene_evaluation_v1','rooms_specialized_project_scene_evaluations_v1'))
  loop
    v_sql:=replace(pg_get_functiondef(v_proc.oid),E'\r\n',E'\n');v_before:=v_sql;
    if v_proc.proname like 'rooms_apply_cage_command%' and position('v_a_score' in v_sql)>0 then
      v_sql:=replace(v_sql,$s$if v_config#>>'{rules,votingMode}'<>'public' then raise exception 'cage_jury_contract_required'; end if;$s$,
        $s$if v_config#>>'{rules,votingMode}'<>'public' and not exists(select 1 from public.room_voting_policies where room_id=p_room_id and mode<>'public') then raise exception 'cage_jury_contract_required';end if;$s$);
      v_sql:=regexp_replace(v_sql,'\mbegin\M',E'begin\n if p_action in (''vote.cast'',''openmic.feedback.cast'') then perform public.rooms_require_voter_v1(p_room_id,auth.uid());end if;','i');
      v_share:='public.rooms_vote_share_v1(p_room_id,v_m#>''{vote,ballots}'',''A'')';
      v_sql:=replace(v_sql,'if v_a_score=v_b_score then','if '||v_share||' is null or abs('||v_share||'-.5)<.00000001 then');
      v_sql:=replace(v_sql,'when v_a_score>v_b_score then','when '||v_share||'>.5 then');
      v_sql:=replace(v_sql,'''scoreA'',v_a_score,''scoreB'',v_b_score','''scoreA'',v_a_score,''scoreB'',v_b_score,''weightedScoreA'',100*'||v_share||',''weightedScoreB'',100*(1-'||v_share||')');
    elsif v_proc.proname='rooms_cage_reconcile_v1' then
      v_share:='public.rooms_vote_share_v1(p_room_id,v_m#>''{vote,ballots}'',''A'')';
      v_sql:=replace(v_sql,'if v_a=v_b then','if '||v_share||' is null or abs('||v_share||'-.5)<.00000001 then');
      v_sql:=replace(v_sql,'when v_a>v_b then','when '||v_share||'>.5 then');
      v_sql:=replace(v_sql,'''scoreA'',v_a,''scoreB'',v_b','''scoreA'',v_a,''scoreB'',v_b,''weightedScoreA'',100*'||v_share||',''weightedScoreB'',100*(1-'||v_share||')');
    elsif v_proc.proname='rooms_finalize_wave_vote_v3' then
      v_share:='public.rooms_vote_share_v1(v_session.room_id,(select jsonb_object_agg(voter_id::text,choice) from public.wave_votes_v3 where round_id=p_round_id),''APPROVE'')';
      v_sql:=replace(v_sql,'from public.wave_votes_v3 vote where vote.round_id = p_round_id;', 'from public.wave_votes_v3 vote where vote.round_id = p_round_id and public.rooms_voter_counts_v1(v_session.room_id,vote.voter_id::text);');
      v_sql:=replace(v_sql,'v_approved := v_total >= v_round.quorum', 'if '||v_share||' is null and exists(select 1 from public.room_voting_policies where room_id=v_session.room_id and mode<>''public'') then raise exception ''room_vote_group_missing'';end if; v_approved := v_total >= v_round.quorum');
      v_sql:=replace(v_sql,'(v_approve::numeric / v_total::numeric)',v_share);
    elsif v_proc.proname='rooms_wave_finalize_closing_vote_v5' then
      v_room:='(select room_id from public.wave_sessions_v3 where id=v_vote.session_id)';
      v_share:='public.rooms_vote_share_v1('||v_room||',(select jsonb_object_agg(voter_id::text,choice) from public.wave_closing_ballots_v5 where closing_vote_id=p_closing_vote_id),''APPROVE'')';
      v_sql:=replace(v_sql,'where closing_vote_id = p_closing_vote_id;', 'where closing_vote_id = p_closing_vote_id and public.rooms_voter_counts_v1('||v_room||',voter_id::text);');
      v_sql:=replace(v_sql,'v_approved := v_total >= v_vote.quorum', 'if '||v_share||' is null and exists(select 1 from public.room_voting_policies where room_id='||v_room||' and mode<>''public'') then raise exception ''room_vote_group_missing'';end if; v_approved := v_total >= v_vote.quorum');
      v_sql:=replace(v_sql,'v_approve::numeric / v_total::numeric',v_share);
    elsif v_proc.proname='rooms_poll_state_v3' then
      v_sql:=replace(v_sql,'''option_index'', series.option_position,','''option_index'', series.option_position,''weighted_percent'',coalesce(100*public.rooms_vote_share_v1(v_poll.room_id,(select jsonb_object_agg(user_id::text,option_index) from public.room_poll_votes_v2 where poll_id=p_poll_id),series.option_position::text),0),');
      v_sql:=replace(v_sql,'and vote.option_index = series.option_position','and vote.option_index = series.option_position and public.rooms_voter_counts_v1(v_poll.room_id,vote.user_id::text)');
    elsif v_proc.proname='rooms_cast_scene_evaluation_v1' then
      v_sql:=regexp_replace(v_sql,'\mbegin\M',E'begin\n perform public.rooms_require_voter_v1(p_room_id,auth.uid());','i');
      v_sql:=replace(v_sql,'v_state := jsonb_set(v_state, array[''scene'',''evaluation'',''byPerformance'',p_performance_id]', 'v_evaluation := v_evaluation || jsonb_build_object(''weightedAverage'',public.rooms_scene_weighted_average_v1(p_room_id,p_performance_id)); v_state := jsonb_set(v_state, array[''scene'',''evaluation'',''byPerformance'',p_performance_id]');
    elsif v_proc.proname='rooms_specialized_project_scene_evaluations_v1' then
      v_sql:=replace(v_sql,'if p_control or (v_state #> ''{scene,evaluation}'') is null then return v_state; end if;',E'if (v_state #> ''{scene,evaluation}'') is null then return v_state; end if;\n for v_key,v_evaluation in select key,value from jsonb_each(coalesce(v_state#>''{scene,evaluation,byPerformance}'',''{}'')) loop\n v_state:=jsonb_set(v_state,array[''scene'',''evaluation'',''byPerformance'',v_key,''weightedAverage''],coalesce(to_jsonb(public.rooms_scene_weighted_average_v1(p_room_id,v_key)),''null''::jsonb),true);end loop;\n if p_control then return v_state;end if;');
      v_sql:=replace(v_sql,'if not v_public then','if not v_public then v_evaluation:=v_evaluation-''weightedAverage'';');
    end if;
    if v_proc.proname like 'rooms_apply_cage_command%' or v_proc.proname='rooms_cage_reconcile_v1' then
      v_sql:=replace(v_sql,'''weightedScoreA'',','''votingMode'',coalesce((select mode from public.room_voting_policies where room_id=p_room_id),''public''),''weightedScoreA'',');
    end if;
    if v_sql<>v_before then execute v_sql;end if;
  end loop;
end;
$jury_adapters$;

create or replace function public.rooms_rating_average_v1(p_room_id uuid,p_ballots jsonb)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_average numeric:=0;v_share numeric;v_rating integer;
begin
  for v_rating in 1..5 loop
    v_share:=public.rooms_vote_share_v1(p_room_id,p_ballots,v_rating::text);
    if v_share is null then return null;end if;
    v_average:=v_average+v_rating*v_share;
  end loop;
  return v_average;
end;
$$;
revoke all on function public.rooms_rating_average_v1(uuid,jsonb) from public,anon,authenticated;
do $open_mic_jury$
declare v_sql text;
begin
  select pg_get_functiondef('public.rooms_cage_apply_open_mic_v1(uuid,jsonb,text,jsonb,text)'::regprocedure) into v_sql;
  v_sql:=replace(v_sql,'from jsonb_each_text(v_entry#>''{feedback,responses}'');','from jsonb_each_text(v_entry#>''{feedback,responses}'') where public.rooms_voter_counts_v1(p_room_id,key);');
  v_sql:=replace(v_sql,'then v_total::numeric/v_count else null end','then public.rooms_rating_average_v1(p_room_id,v_entry#>''{feedback,responses}'') else null end');
  execute v_sql;
end;
$open_mic_jury$;

-- Recalculate the Scene electorate before its existing minimum-response privacy rule.
do $scene_jury$
declare body text;
begin
  body:=replace(pg_get_functiondef('public.rooms_specialized_project_scene_evaluations_v1(jsonb,uuid,uuid,boolean)'::regprocedure),E'\r\n',E'\n');
  body:=replace(body,'v_state:=jsonb_set(v_state,array[''scene'',''evaluation'',''byPerformance'',v_key,''weightedAverage'']',
    $s$if exists(select 1 from public.room_voting_policies where room_id=p_room_id and mode='jury') then
      v_evaluation:=v_evaluation||jsonb_build_object(
        'responseCount',(select count(*) from public.room_scene_evaluation_votes_v1 where room_id=p_room_id and performance_id=v_key and public.rooms_voter_counts_v1(p_room_id,user_id::text)),
        'minimumResponses',least(coalesce((v_evaluation->>'minimumResponses')::integer,1),(select cardinality(juror_ids) from public.room_voting_policies where room_id=p_room_id)));
      v_state:=jsonb_set(v_state,array['scene','evaluation','byPerformance',v_key],v_evaluation,true);
    end if;
    v_state:=jsonb_set(v_state,array['scene','evaluation','byPerformance',v_key,'weightedAverage']$s$);
  execute body;
end;
$scene_jury$;
commit;
