-- La Place: public conversation state, server-owned consent and clocks.
-- These commands never change microphone, camera or audio permissions.
begin;

create or replace function public.rooms_place_tools_empty_v1()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"version":1,"revision":0,"floor":{"prompt":"","open":true,"seconds":60,"remaining":60,"deadline":null,"queue":[],"current":null,"status":"idle","completed":[]},"clash":null,"challenges":[]}'::jsonb;
$$;

create table if not exists public.room_place_tools_v1 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  state jsonb not null default public.rooms_place_tools_empty_v1()
    check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 131072),
  updated_at timestamptz not null default now()
);
alter table public.room_place_tools_v1 enable row level security;
revoke all on public.room_place_tools_v1 from anon, authenticated;
grant select on public.room_place_tools_v1 to anon, authenticated;
grant all on public.room_place_tools_v1 to service_role;
create policy place_tools_read_visible_room on public.room_place_tools_v1 for select to anon, authenticated using (
  exists (select 1 from public.rooms_v2 r where r.id = room_id and r.status in ('live', 'ended'))
  and not exists (select 1 from public.room_bans_v2 b where b.room_id = room_place_tools_v1.room_id and b.user_id = auth.uid())
);

-- Invoker security preserves rooms_v2 visibility policies.
create or replace function public.rooms_get_place_tools_v1(p_room_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((select t.state from public.room_place_tools_v1 t where t.room_id = r.id), public.rooms_place_tools_empty_v1())
  from public.rooms_v2 r where r.id = p_room_id and r.status in ('live', 'ended')
  and not exists (select 1 from public.room_bans_v2 b where b.room_id = r.id and b.user_id = auth.uid());
$$;

-- Pure transition function, tested independently of the deployment.
create or replace function public.rooms_reduce_place_tools_v1(p_state jsonb, p_command jsonb, p_actor text, p_host boolean, p_people text[], p_now bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  s jsonb := p_state; f jsonb := p_state->'floor'; c jsonb := p_state->'clash';
  challenges jsonb := p_state->'challenges'; challenge jsonb; item jsonb;
  action text := p_command->>'type'; person text; next_person text; title text; target text;
  seconds integer; remaining integer; rounds integer; idx integer; current_idx integer := 0;
begin
  if p_actor is null or p_actor = '' then raise exception 'place_tools_auth_required'; end if;
  if action is null or action not in (
    'floor.configure','floor.open','floor.join','floor.leave','floor.next','floor.pause','floor.resume','floor.end',
    'clash.invite','clash.accept','clash.decline','clash.start','clash.next','clash.pause','clash.resume','clash.end',
    'challenge.create','challenge.accept','challenge.start','challenge.complete','challenge.validate','challenge.cancel'
  ) then raise exception 'place_tools_command_invalid'; end if;
  if not p_host and action not in ('floor.join','floor.leave','clash.accept','clash.decline','challenge.create','challenge.accept','challenge.complete') then
    raise exception 'place_tools_host_required' using errcode = '42501';
  end if;
  if action in ('floor.configure','clash.invite','challenge.create') then
    seconds := (p_command->>'seconds')::integer;
    if seconds is null or seconds not in (30,60,90,120,180,300) then raise exception 'place_tools_duration_invalid'; end if;
  end if;
  if action in ('clash.invite','challenge.create') then
    title := trim(p_command->>'title');
    if title is null or length(title) not between 1 and 160 then raise exception 'place_tools_title_invalid'; end if;
    perform (p_command->>'id')::uuid;
    if p_command->>'id' is null then raise exception 'place_tools_id_invalid'; end if;
  end if;

  if action = 'floor.configure' then
    if f->>'current' is not null then raise exception 'place_tools_turn_active'; end if;
    f := f || jsonb_build_object('prompt',left(trim(coalesce(p_command->>'prompt','')),160),'seconds',seconds,'remaining',seconds);
  elsif action = 'floor.open' then
    if jsonb_typeof(p_command->'open') is distinct from 'boolean' then raise exception 'place_tools_open_invalid'; end if;
    f := f || jsonb_build_object('open',p_command->'open');
  elsif action in ('floor.join','floor.leave') then
    person := p_command->>'personId';
    if person is null or (not p_host and person <> p_actor) then raise exception 'place_tools_identity_mismatch' using errcode = '42501'; end if;
    if action = 'floor.join' then
      if not (person = any(p_people)) then raise exception 'place_tools_person_unavailable'; end if;
      if not (f->>'open')::boolean then raise exception 'place_tools_queue_closed'; end if;
      if f->'queue' ? person or f->>'current' = person then return s; end if;
      if jsonb_array_length(f->'queue') >= 50 then raise exception 'place_tools_queue_full'; end if;
      f := jsonb_set(f,'{queue}',(f->'queue') || jsonb_build_array(person));
    else
      f := jsonb_set(f,'{queue}',(f->'queue') - person);
      if f->>'current' = person then f := f || '{"current":null,"deadline":null,"status":"ended"}'::jsonb; end if;
    end if;
  elsif action = 'floor.next' then
    select q.value into next_person from jsonb_array_elements_text(f->'queue') with ordinality q(value,n)
      where q.value = any(p_people) order by q.n limit 1;
    if next_person is null then raise exception 'place_tools_queue_empty'; end if;
    if f->>'current' is not null then f := jsonb_set(f,'{completed}',(f->'completed') || jsonb_build_array(f->>'current')); end if;
    f := f || jsonb_build_object('queue',(select coalesce(jsonb_agg(q.value order by q.n),'[]'::jsonb) from jsonb_array_elements_text(f->'queue') with ordinality q(value,n) where q.value <> next_person and q.value = any(p_people)),
      'current',next_person,'status','running','remaining',f->'seconds','deadline',p_now + (f->>'seconds')::bigint * 1000);
  elsif action = 'floor.pause' then
    if f->>'status' <> 'running' then return s; end if;
    remaining := greatest(0,ceil(((f->>'deadline')::bigint - p_now) / 1000.0)::integer);
    f := f || jsonb_build_object('remaining',remaining,'deadline',null,'status','paused');
  elsif action = 'floor.resume' then
    if f->>'status' <> 'paused' or (f->>'remaining')::integer <= 0 then return s; end if;
    f := f || jsonb_build_object('deadline',p_now + (f->>'remaining')::bigint * 1000,'status','running');
  elsif action = 'floor.end' then
    if f->>'current' is not null then f := jsonb_set(f,'{completed}',(f->'completed') || jsonb_build_array(f->>'current')); end if;
    f := f || jsonb_build_object('current',null,'deadline',null,'remaining',f->'seconds','status','ended');
  elsif action = 'clash.invite' then
    if c->>'status' is not null and c->>'status' not in ('ended','cancelled') then raise exception 'place_tools_clash_active'; end if;
    if p_command->>'left' is null or p_command->>'right' is null or p_command->>'left' = p_command->>'right'
      or not (p_command->>'left' = any(p_people)) or not (p_command->>'right' = any(p_people)) then raise exception 'place_tools_people_invalid'; end if;
    rounds := (p_command->>'rounds')::integer;
    if rounds is null or rounds not in (1,3,5) then raise exception 'place_tools_rounds_invalid'; end if;
    c := jsonb_build_object('id',p_command->>'id','title',title,'left',p_command->>'left','right',p_command->>'right',
      'rounds',rounds,'round',1,'turn',0,'seconds',seconds,'remaining',seconds,'deadline',null,'accepted','[]'::jsonb,'status','inviting');
  elsif action in ('clash.accept','clash.decline') then
    if c->>'status' is distinct from 'inviting' or p_actor not in (c->>'left',c->>'right') then raise exception 'place_tools_no_invitation'; end if;
    if action = 'clash.decline' then c := c || '{"status":"cancelled"}'::jsonb;
    elsif not (c->'accepted' ? p_actor) then c := jsonb_set(c,'{accepted}',(c->'accepted') || jsonb_build_array(p_actor));
    else return s;
    end if;
  elsif action = 'clash.start' then
    if c->>'status' is distinct from 'inviting' or not (c->'accepted' ? (c->>'left')) or not (c->'accepted' ? (c->>'right')) then raise exception 'place_tools_consent_required'; end if;
    if not (c->>'left' = any(p_people)) or not (c->>'right' = any(p_people)) then raise exception 'place_tools_person_unavailable'; end if;
    c := c || jsonb_build_object('status','running','remaining',c->'seconds','deadline',p_now + (c->>'seconds')::bigint * 1000);
  elsif action = 'clash.next' then
    if c->>'status' is null or c->>'status' not in ('running','paused') then return s; end if;
    if (c->>'turn')::integer = 1 and (c->>'round')::integer >= (c->>'rounds')::integer then
      c := c || '{"status":"ended","deadline":null,"remaining":0}'::jsonb;
    else
      c := c || jsonb_build_object('round',(c->>'round')::integer + (c->>'turn')::integer,'turn',1 - (c->>'turn')::integer,
        'status','running','remaining',c->'seconds','deadline',p_now + (c->>'seconds')::bigint * 1000);
    end if;
  elsif action = 'clash.pause' then
    if c->>'status' is distinct from 'running' then return s; end if;
    remaining := greatest(0,ceil(((c->>'deadline')::bigint - p_now) / 1000.0)::integer);
    c := c || jsonb_build_object('remaining',remaining,'deadline',null,'status','paused');
  elsif action = 'clash.resume' then
    if c->>'status' is distinct from 'paused' or (c->>'remaining')::integer <= 0 then return s; end if;
    c := c || jsonb_build_object('deadline',p_now + (c->>'remaining')::bigint * 1000,'status','running');
  elsif action = 'clash.end' then
    if c is not null and c <> 'null'::jsonb then c := c || jsonb_build_object('status',case when c->>'status' = 'inviting' then 'cancelled' else 'ended' end,'deadline',null); end if;
  elsif action = 'challenge.create' then
    if exists (select 1 from jsonb_array_elements(challenges) a where a->>'id' = p_command->>'id') then return s; end if;
    if (select count(*) from jsonb_array_elements(challenges) a where a->>'status' in ('open','running')) >= 6 then raise exception 'place_tools_challenges_full'; end if;
    target := p_command->>'target';
    if target is not null and not (target = any(p_people)) then raise exception 'place_tools_person_unavailable'; end if;
    challenges := jsonb_build_array(jsonb_build_object('id',p_command->>'id','title',title,'author',p_actor,'target',target,
      'seconds',seconds,'remaining',seconds,'deadline',null,'accepted','[]'::jsonb,'completed','[]'::jsonb,'status','open')) || challenges;
    select coalesce(jsonb_agg(a.value order by a.n),'[]'::jsonb) into challenges from jsonb_array_elements(challenges) with ordinality a(value,n) where a.n <= 20 or a.value->>'status' in ('open','running');
  else
    for item in select value from jsonb_array_elements(challenges) loop
      if item->>'id' = p_command->>'id' then challenge := item; idx := current_idx; exit; end if;
      current_idx := current_idx + 1;
    end loop;
    if challenge is null then raise exception 'place_tools_challenge_missing'; end if;
    if action = 'challenge.accept' then
      if challenge->>'status' <> 'open' then raise exception 'place_tools_challenge_closed'; end if;
      if challenge->>'target' is not null and challenge->>'target' <> p_actor then raise exception 'place_tools_identity_mismatch' using errcode = '42501'; end if;
      if challenge->'accepted' ? p_actor then return s; end if;
      if jsonb_array_length(challenge->'accepted') >= 50 then raise exception 'place_tools_challenge_full'; end if;
      challenge := jsonb_set(challenge,'{accepted}',(challenge->'accepted') || jsonb_build_array(p_actor));
    elsif action = 'challenge.start' then
      if challenge->>'status' <> 'open' or jsonb_array_length(challenge->'accepted') = 0 then raise exception 'place_tools_consent_required'; end if;
      challenge := challenge || jsonb_build_object('status','running','remaining',challenge->'seconds','deadline',p_now + (challenge->>'seconds')::bigint * 1000);
    elsif action = 'challenge.complete' then
      if challenge->>'status' <> 'running' or not (challenge->'accepted' ? p_actor) then raise exception 'place_tools_participation_required'; end if;
      if challenge->'completed' ? p_actor then return s; end if;
      challenge := jsonb_set(challenge,'{completed}',(challenge->'completed') || jsonb_build_array(p_actor));
    elsif action = 'challenge.validate' then
      if challenge->>'status' <> 'running' or jsonb_array_length(challenge->'completed') = 0 then raise exception 'place_tools_completion_required'; end if;
      challenge := challenge || '{"status":"done","deadline":null}'::jsonb;
    elsif action = 'challenge.cancel' then
      if challenge->>'status' not in ('open','running') then return s; end if;
      challenge := challenge || '{"status":"cancelled","deadline":null}'::jsonb;
    end if;
    challenges := jsonb_set(challenges,array[idx::text],challenge);
  end if;
  -- Keep completed floor turns bounded in long-running rooms.
  f := jsonb_set(f,'{completed}',(select coalesce(jsonb_agg(a.value order by a.n),'[]'::jsonb) from jsonb_array_elements(f->'completed') with ordinality a(value,n) where a.n > jsonb_array_length(f->'completed') - 50));
  return s || jsonb_build_object('floor',f,'clash',c,'challenges',challenges,'revision',(s->>'revision')::bigint + 1);
end;
$$;

create or replace function public.rooms_apply_place_tools_v1(p_room_id uuid, p_expected_revision bigint, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); host_id uuid; people text[]; current_state jsonb; next_state jsonb;
begin
  if uid is null then raise exception 'place_tools_auth_required' using errcode = '42501'; end if;
  select r.host_id into host_id from public.rooms_v2 r where r.id = p_room_id and r.status = 'live';
  if host_id is null then raise exception 'place_tools_room_unavailable'; end if;
  if exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = uid) then raise exception 'place_tools_access_revoked' using errcode = '42501'; end if;
  select array_agg(distinct p.id) into people from (
    select host_id::text as id union all
    select rp.user_id::text from public.room_participants_v2 rp where rp.room_id = p_room_id and rp.left_at is null
      and not exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = rp.user_id)
  ) p;
  if not (uid::text = any(people)) then raise exception 'place_tools_membership_required' using errcode = '42501'; end if;
  if pg_column_size(p_command) > 4096 then raise exception 'place_tools_command_too_large'; end if;
  insert into public.room_place_tools_v1(room_id) values(p_room_id) on conflict do nothing;
  select t.state into current_state from public.room_place_tools_v1 t where t.room_id = p_room_id for update;
  if (current_state->>'revision')::bigint is distinct from p_expected_revision then raise exception 'place_tools_revision_conflict' using errcode = '40001'; end if;
  next_state := public.rooms_reduce_place_tools_v1(current_state,p_command,uid::text,uid = host_id,people,(extract(epoch from clock_timestamp()) * 1000)::bigint);
  if next_state is distinct from current_state then update public.room_place_tools_v1 set state = next_state, updated_at = now() where room_id = p_room_id; end if;
  return next_state;
end;
$$;

revoke all on function public.rooms_place_tools_empty_v1() from public;
grant execute on function public.rooms_place_tools_empty_v1() to anon, authenticated, service_role;
revoke all on function public.rooms_reduce_place_tools_v1(jsonb,jsonb,text,boolean,text[],bigint) from public, anon, authenticated;
grant execute on function public.rooms_reduce_place_tools_v1(jsonb,jsonb,text,boolean,text[],bigint) to service_role;
revoke all on function public.rooms_get_place_tools_v1(uuid) from public;
grant execute on function public.rooms_get_place_tools_v1(uuid) to anon, authenticated, service_role;
revoke all on function public.rooms_apply_place_tools_v1(uuid,bigint,jsonb) from public, anon;
grant execute on function public.rooms_apply_place_tools_v1(uuid,bigint,jsonb) to authenticated, service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_place_tools_v1') then
    alter publication supabase_realtime add table public.room_place_tools_v1;
  end if;
end $$;
commit;
