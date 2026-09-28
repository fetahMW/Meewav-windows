begin;
alter table public.rooms_v2 add column if not exists launch_status text not null default 'ready'
  check(launch_status in ('preparing','ready'));
-- Preparation can use existing host-only Wave processing RPCs, while every
-- existing permissive room read policy is constrained for other accounts.
create policy rooms_hide_unprepared_launch on public.rooms_v2 as restrictive for select
  to anon,authenticated using(launch_status='ready' or host_id=auth.uid());
create table public.room_desktop_launches_v1 (
  request_id uuid primary key, room_id uuid not null unique references public.rooms_v2(id),
  host_id uuid not null references auth.users(id), configuration jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.room_desktop_launches_v1 enable row level security;
revoke all on public.room_desktop_launches_v1 from public,anon,authenticated;

create function public.rooms_create_desktop_v1(p_configuration jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text:=p_configuration->>'roomType';r public.rooms_v2%rowtype;receipt public.room_desktop_launches_v1%rowtype;v jsonb;cfg jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
  if p_request_id is null or kind is null or kind not in ('place','scene','classe','loge','wave')
    or coalesce(p_configuration->>'access','public')<>'public'
    or length(btrim(coalesce(p_configuration->>'title',''))) not between 1 and 120
    or length(coalesce(p_configuration->>'description',''))>4000 or pg_column_size(p_configuration)>65536 then
    raise exception 'launch_configuration_invalid' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('meewav:launch:'||p_request_id::text,0));
  select * into receipt from public.room_desktop_launches_v1 where request_id=p_request_id;
  if found then
    if receipt.host_id<>auth.uid() or receipt.configuration is distinct from p_configuration then raise exception 'launch_request_conflict' using errcode='40001';end if;
    select * into r from public.rooms_v2 where id=receipt.room_id;
    if r.status<>'live' then raise exception 'launch_room_ended' using errcode='55000';end if;
    return jsonb_build_object('id',r.id,'ready',r.launch_status='ready','version',coalesce((select version from public.room_experience_v1 where room_id=r.id),0));
  end if;
  v:=coalesce(p_configuration->'values','{}');
  insert into public.rooms_v2(id,host_id,type,title,description,status,livekit_room_name,video_format,queue_open,launch_status)
  values(p_request_id,auth.uid(),'place',btrim(p_configuration->>'title'),nullif(concat_ws(E'\n',nullif(btrim(p_configuration->>'description'),''),nullif(btrim(v->>'topic'),'')),''),
    'live','room-'||p_request_id::text,'landscape',coalesce((v->>'queueOpen')::boolean,false),case when kind='wave' then 'preparing' else 'ready' end)
  returning * into r;
  insert into public.room_participants_v2(room_id,user_id,role) values(r.id,auth.uid(),'host');
  perform public.rooms_get_experience_v1(r.id);
  update public.room_experience_v1 set changed_at=clock_timestamp()-interval '6 seconds' where room_id=r.id;
  cfg:=jsonb_build_object('launch',p_configuration);
  if kind='classe' then
    -- Initial enrolment is configured after creation; switching an existing
    -- room keeps its stricter queued-roster admission contract.
    perform public.rooms_switch_experience_before_roster_v1(r.id,0,p_request_id,kind,cfg);
  elsif kind not in ('place','wave') then
    perform public.rooms_switch_experience_v1(r.id,0,p_request_id,kind,cfg);
  end if;
  insert into public.room_desktop_launches_v1 values(p_request_id,r.id,auth.uid(),p_configuration,now());
  return jsonb_build_object('id',r.id,'ready',kind<>'wave','version',case when kind in ('place','wave') then 0 else 1 end);
end;
$$;
revoke all on function public.rooms_create_desktop_v1(jsonb,uuid) from public,anon;
grant execute on function public.rooms_create_desktop_v1(jsonb,uuid) to authenticated;

create function public.rooms_complete_desktop_wave_v1(p_room_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.room_desktop_launches_v1%rowtype;r public.rooms_v2%rowtype;session_id uuid;
begin
  select * into receipt from public.room_desktop_launches_v1 where room_id=p_room_id and request_id=p_request_id;
  if not found or receipt.host_id is distinct from auth.uid() or receipt.configuration->>'roomType'<>'wave' then
    raise exception 'launch_forbidden' using errcode='42501';end if;
  select * into r from public.rooms_v2 where id=p_room_id for update;
  if r.status<>'live' then raise exception 'launch_room_ended' using errcode='55000';end if;
  if r.launch_status='ready' then return r.id;end if;
  perform public.rooms_switch_experience_v1(r.id,0,p_request_id,'wave',jsonb_build_object('launch',receipt.configuration));
  select id into session_id from public.wave_sessions_v3 where room_id=r.id;
  perform public.rooms_launch_wave_production_v5(session_id,'desktop-launch:'||p_request_id::text,p_request_id::text);
  update public.rooms_v2 set launch_status='ready',updated_at=now() where id=r.id;
  return r.id;
end;
$$;
revoke all on function public.rooms_complete_desktop_wave_v1(uuid,uuid) from public,anon;
grant execute on function public.rooms_complete_desktop_wave_v1(uuid,uuid) to authenticated;
commit;
