-- La Scène: private, one-per-account performance evaluations.
-- Fundraiser money remains owned by the real Rooms payment ledger; this
-- migration deliberately provides no browser mutation for collected totals.

create table if not exists public.room_scene_evaluation_votes_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  performance_id text not null check (char_length(performance_id) between 1 and 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  reactions text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (room_id, performance_id, user_id),
  check (reactions <@ array['energy','presence','originality','mastery']::text[]),
  check (cardinality(reactions) <= 4)
);

alter table public.room_scene_evaluation_votes_v1 enable row level security;
revoke all on public.room_scene_evaluation_votes_v1 from public, anon, authenticated;
grant all on public.room_scene_evaluation_votes_v1 to service_role;

create or replace function public.rooms_specialized_project_scene_evaluations_v1(
  p_state jsonb,
  p_room_id uuid,
  p_user_id uuid,
  p_control boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_evaluations jsonb := '{}'::jsonb;
  v_key text;
  v_evaluation jsonb;
  v_public boolean;
  v_completed jsonb := '[]'::jsonb;
begin
  if p_control or (v_state #> '{scene,evaluation}') is null then return v_state; end if;

  for v_key, v_evaluation in
    select key, value from jsonb_each(coalesce(v_state #> '{scene,evaluation,byPerformance}', '{}'::jsonb))
  loop
    v_evaluation := jsonb_set(v_evaluation, '{responses}', '{}'::jsonb, true);
    v_public := coalesce(v_evaluation->>'resultsVisibility', 'private') = 'public'
      and coalesce((v_evaluation->>'responseCount')::integer, 0) >= greatest(1, coalesce((v_evaluation->>'minimumResponses')::integer, 1));
    if not v_public then
      v_evaluation := jsonb_set(v_evaluation, '{responseCount}', '0'::jsonb, true);
      v_evaluation := jsonb_set(v_evaluation, '{ratingTotal}', '0'::jsonb, true);
      v_evaluation := jsonb_set(v_evaluation, '{ratingCounts}', '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb, true);
      v_evaluation := jsonb_set(v_evaluation, '{reactionCounts}', '{"energy":0,"presence":0,"originality":0,"mastery":0}'::jsonb, true);
    end if;
    v_evaluations := v_evaluations || jsonb_build_object(v_key, v_evaluation);
  end loop;
  v_state := jsonb_set(v_state, '{scene,evaluation,byPerformance}', v_evaluations, true);

  if p_user_id is not null then
    select coalesce(jsonb_agg(v.performance_id order by v.created_at), '[]'::jsonb)
      into v_completed
      from public.room_scene_evaluation_votes_v1 v
      where v.room_id = p_room_id and v.user_id = p_user_id;
  end if;
  return jsonb_set(v_state, '{scene,evaluation,viewerCompletedPerformanceIds}', v_completed, true);
end;
$$;

revoke all on function public.rooms_specialized_project_scene_evaluations_v1(jsonb, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.rooms_specialized_project_scene_evaluations_v1(jsonb, uuid, uuid, boolean) to service_role;

-- Preserve the existing role projection and add the Scene evaluation privacy
-- pass for every client, including clients still using the v1 getter.
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
    and (v_row.room_type <> 'loge' or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state))
  );
  v_projected := public.rooms_specialized_project_state_v1(v_row.state, v_row.room_type, v_uid, v_control, v_artist);
  if v_row.room_type = 'scene' then
    v_projected := public.rooms_specialized_project_scene_evaluations_v1(v_projected, p_room_id, v_uid, v_control);
  end if;
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé', 'description', '', 'mediaName', '', 'playing', false,
      'replayIncluded', false, 'liveOnly', true, 'expiresAt', null
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

create or replace function public.rooms_cast_scene_evaluation_v1(
  p_room_id uuid,
  p_performance_id text,
  p_rating smallint,
  p_reactions text[] default '{}',
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.room_specialized_state_v1%rowtype;
  v_room_status text;
  v_state jsonb;
  v_performance jsonb;
  v_evaluation jsonb;
  v_reaction text;
  v_revision bigint;
begin
  if v_uid is null then raise exception 'room_specialized_auth_required' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'scene_evaluation_rating_invalid' using errcode = '22023'; end if;
  if p_reactions is null or cardinality(p_reactions) > 4 or not p_reactions <@ array['energy','presence','originality','mastery']::text[] then
    raise exception 'scene_evaluation_reactions_invalid' using errcode = '22023';
  end if;
  p_reactions := array(select distinct unnest(p_reactions));
  select r.status into v_room_status from public.rooms_v2 r where r.id = p_room_id for share;
  if not found or v_room_status <> 'live' then raise exception 'room_specialized_room_not_live' using errcode = '55000'; end if;
  if exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = v_uid) then raise exception 'room_specialized_access_revoked' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('rooms:scene-evaluation:' || p_room_id::text || ':' || p_performance_id, 0));
  select * into v_row from public.room_specialized_state_v1 s where s.room_id = p_room_id for update;
  if not found or v_row.room_type <> 'scene' then raise exception 'scene_evaluation_room_not_found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.room_specialized_action_receipts_v1 x
    where x.room_id = p_room_id and x.user_id = v_uid and x.idempotency_key = p_idempotency_key and x.action = 'scene.evaluation.cast'
  ) then return public.rooms_get_specialized_state_v1(p_room_id); end if;

  v_state := v_row.state;
  select value into v_performance
    from jsonb_array_elements(coalesce(v_state #> '{scene,program}', '[]'::jsonb))
    where value->>'id' = p_performance_id limit 1;
  if v_performance is null
     or v_performance->>'status' <> 'done'
     or not coalesce((v_performance->>'evaluationEnabled')::boolean, false) then
    raise exception 'scene_evaluation_unavailable' using errcode = '55000';
  end if;
  v_evaluation := v_state #> array['scene','evaluation','byPerformance',p_performance_id];
  if v_evaluation is null or not coalesce((v_evaluation->>'open')::boolean, false) then raise exception 'scene_evaluation_unavailable' using errcode = '55000'; end if;
  if exists (select 1 from public.room_scene_evaluation_votes_v1 v where v.room_id = p_room_id and v.performance_id = p_performance_id and v.user_id = v_uid) then
    raise exception 'scene_evaluation_already_submitted' using errcode = '23505';
  end if;

  insert into public.room_scene_evaluation_votes_v1(room_id, performance_id, user_id, rating, reactions)
  values (p_room_id, p_performance_id, v_uid, p_rating, array(select distinct unnest(p_reactions)));
  v_evaluation := jsonb_set(v_evaluation, '{responseCount}', to_jsonb(coalesce((v_evaluation->>'responseCount')::integer, 0) + 1), true);
  v_evaluation := jsonb_set(v_evaluation, '{ratingTotal}', to_jsonb(coalesce((v_evaluation->>'ratingTotal')::integer, 0) + p_rating), true);
  v_evaluation := jsonb_set(v_evaluation, array['ratingCounts',p_rating::text], to_jsonb(coalesce((v_evaluation #>> array['ratingCounts',p_rating::text])::integer, 0) + 1), true);
  foreach v_reaction in array p_reactions loop
    v_evaluation := jsonb_set(v_evaluation, array['reactionCounts',v_reaction], to_jsonb(coalesce((v_evaluation #>> array['reactionCounts',v_reaction])::integer, 0) + 1), true);
  end loop;
  v_evaluation := jsonb_set(v_evaluation, '{responses}', '{}'::jsonb, true);
  v_state := jsonb_set(v_state, array['scene','evaluation','byPerformance',p_performance_id], v_evaluation, true);

  v_revision := v_row.revision + 1;
  v_state := v_state || jsonb_build_object('revision', v_revision, 'updatedAt', now());
  update public.room_specialized_state_v1 set state = v_state, revision = v_revision, updated_by = v_uid, updated_at = now() where room_id = p_room_id;
  insert into public.room_specialized_action_receipts_v1(room_id,user_id,idempotency_key,action,revision)
  values(p_room_id,v_uid,p_idempotency_key,'scene.evaluation.cast',v_revision);
  insert into public.room_specialized_state_signal_v1(room_id,room_type,revision) values(p_room_id,'scene',v_revision)
  on conflict(room_id) do update set revision=excluded.revision, room_type=excluded.room_type, updated_at=now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_cast_scene_evaluation_v1(uuid, text, smallint, text[], uuid) from public, anon;
grant execute on function public.rooms_cast_scene_evaluation_v1(uuid, text, smallint, text[], uuid) to authenticated, service_role;

comment on table public.room_scene_evaluation_votes_v1 is 'Private one-vote-per-account ledger for voluntary La Scène performance evaluations.';
comment on function public.rooms_cast_scene_evaluation_v1(uuid, text, smallint, text[], uuid) is 'Validates ended performance, eligibility and one-vote semantics before updating aggregate Scene results.';
