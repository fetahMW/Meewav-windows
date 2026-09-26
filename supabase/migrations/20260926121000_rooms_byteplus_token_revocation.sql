-- Short-lived RTC bearer grants are server-only and expire after two minutes.
-- Retain every still-valid publishing token, including in-flight renewals, so
-- LimitTokenPrivilege can revoke publication without ejecting a spectator.
create table if not exists public.room_byteplus_tokens_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text primary key,
  generation uuid not null,
  expires_at timestamptz not null
);
create index if not exists room_byteplus_tokens_v1_target on public.room_byteplus_tokens_v1(room_id,user_id,expires_at);
alter table public.room_byteplus_tokens_v1 enable row level security;
revoke all on public.room_byteplus_tokens_v1 from public,anon,authenticated;
grant select,insert,delete on public.room_byteplus_tokens_v1 to service_role;
create table if not exists public.room_byteplus_bans_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
alter table public.room_byteplus_bans_v1 enable row level security;
revoke all on public.room_byteplus_bans_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.room_byteplus_bans_v1 to service_role;

create or replace function public.rooms_record_byteplus_token_v1(p_room_id uuid,p_user_id uuid,p_token text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_policy jsonb;v_generation uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  if p_expires_at <= now() or p_expires_at > now()+interval '130 seconds' or length(p_token)>32768 then
    raise exception 'Invalid token expiry' using errcode='22023';
  end if;
  -- Serialize issuance with stage mutations to close the sign/demotion race.
  perform 1 from public.rooms_v2 where id=p_room_id for update;
  v_policy:=public.rooms_byteplus_media_policy_v1(p_room_id,p_user_id);
  if not (v_policy->>'canPublish')::boolean then raise exception 'Publication revoked' using errcode='42501';end if;
  perform public.rooms_set_livekit_publication_authorization_v1(p_room_id,p_user_id,true,'byteplus_token');
  select generation into v_generation from public.room_livekit_publication_grants_v1 where room_id=p_room_id and user_id=p_user_id;
  delete from public.room_byteplus_tokens_v1 where expires_at<now();
  insert into public.room_byteplus_tokens_v1(room_id,user_id,token,generation,expires_at) values(p_room_id,p_user_id,p_token,v_generation,p_expires_at) on conflict do nothing;
end;
$$;
revoke all on function public.rooms_record_byteplus_token_v1(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rooms_record_byteplus_token_v1(uuid,uuid,text,timestamptz) to service_role;
