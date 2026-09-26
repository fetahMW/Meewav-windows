-- Preserve existing Android call IDs and its conversation FK while allowing
-- the canonical messaging conversation IDs used by the desktop client.
begin;
create table if not exists public.messaging_video_calls_v1 (
  id uuid primary key default gen_random_uuid(), conversation_id uuid,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ringing' check(status in ('ringing','accepted','declined','ended','missed')),
  created_at timestamptz not null default now(), answered_at timestamptz, ended_at timestamptz,
  caller_seen_at timestamptz not null default now(), callee_seen_at timestamptz not null default now(),
  check(caller_id<>callee_id)
);
alter table public.messaging_video_calls_v1 alter column conversation_id drop not null;
do $$begin
  if to_regclass('public.messaging_direct_conversations_v1') is not null and not exists(
    select 1 from pg_constraint where conrelid='public.messaging_video_calls_v1'::regclass and contype='f'
      and confrelid=to_regclass('public.messaging_direct_conversations_v1')
  ) then
    alter table public.messaging_video_calls_v1 add constraint messaging_calls_legacy_conversation_fk
      foreign key(conversation_id) references public.messaging_direct_conversations_v1(id) on delete cascade;
  end if;
end;$$;
alter table public.messaging_video_calls_v1 add column if not exists canonical_conversation_id uuid
  references public.messaging_conversations(id) on delete cascade;
alter table public.messaging_video_calls_v1 add column if not exists media_kind text not null default 'video' check(media_kind in ('audio','video'));
alter table public.messaging_video_calls_v1 add constraint messaging_calls_one_conversation
  check((conversation_id is null) <> (canonical_conversation_id is null));
create index if not exists messaging_calls_caller_created on public.messaging_video_calls_v1(caller_id,created_at desc);
create index if not exists messaging_calls_callee_created on public.messaging_video_calls_v1(callee_id,created_at desc);
alter table public.messaging_video_calls_v1 enable row level security;
revoke all on public.messaging_video_calls_v1 from public,anon,authenticated;
drop policy if exists messaging_calls_private_broadcast_v1 on realtime.messages;
create policy messaging_calls_private_broadcast_v1 on realtime.messages for select to authenticated
  using(extension='broadcast' and realtime.topic()='messaging:calls:'||(select auth.uid())::text);
create or replace function public.messaging_video_call_broadcast_v1() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform realtime.send(jsonb_build_object('callId',new.id),'call_changed','messaging:calls:'||new.caller_id::text,true);
    perform realtime.send(jsonb_build_object('callId',new.id),'call_changed','messaging:calls:'||new.callee_id::text,true);
  end if;
  return new;
end;$$;
revoke all on function public.messaging_video_call_broadcast_v1() from public,anon,authenticated;
drop trigger if exists messaging_video_call_changed_v1 on public.messaging_video_calls_v1;
create trigger messaging_video_call_changed_v1 after insert or update on public.messaging_video_calls_v1
  for each row execute function public.messaging_video_call_broadcast_v1();

-- Internal only. Legacy and canonical conversations each keep their own
-- membership authority; neither branch grants access through the other one.
create function public.messaging_call_peer_v2(p_id uuid,p_user uuid,p_canonical boolean) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare peer uuid; valid boolean;
begin
  if p_canonical then
    select case when d.profile_low_id=p_user then d.profile_high_id else d.profile_low_id end into peer
    from public.messaging_direct_pairs d join public.messaging_conversations c on c.id=d.conversation_id
    where d.conversation_id=p_id and p_user in(d.profile_low_id,d.profile_high_id) and c.kind='direct' and c.deleted_at is null;
    if peer is null then return null;end if;
    select count(*)=2 into valid from public.messaging_conversation_members
      where conversation_id=p_id and profile_id in(p_user,peer) and membership_status='active' and left_at is null;
  elsif to_regclass('public.messaging_direct_conversations_v1') is not null and to_regclass('public.messaging_conversation_participants_v1') is not null then
    execute 'select case when participant_low_id=$2 then participant_high_id else participant_low_id end from public.messaging_direct_conversations_v1 where id=$1 and $2 in(participant_low_id,participant_high_id)'
      into peer using p_id,p_user;
    if peer is null then return null;end if;
    execute 'select count(*)=2 from public.messaging_conversation_participants_v1 where conversation_id=$1 and user_id in($2,$3)'
      into valid using p_id,p_user,peer;
    -- Keep the active-membership guard added by the Android audio-call
    -- migration, even while that conversation still uses its legacy pair.
    valid:=valid and exists(select 1 from public.messaging_conversations where id=p_id and kind='direct' and deleted_at is null)
      and (select count(*)=2 from public.messaging_conversation_members where conversation_id=p_id
        and profile_id in(p_user,peer) and membership_status='active' and left_at is null);
  end if;
  if not coalesce(valid,false) or public.messaging_profiles_blocked_v1(p_user,peer) then return null;end if;
  return peer;
end;$$;
revoke all on function public.messaging_call_peer_v2(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.messaging_video_call_v1(p_action text,p_conversation_id uuid default null,p_call_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();peer uuid;c public.messaging_video_calls_v1;canonical boolean;name text;
begin
  if u is null then raise exception 'authentication_required' using errcode='28000';end if;
  if p_action is null or p_action not in('start','start_audio','peek','sync','accept','decline','end','media') then raise exception 'invalid_action' using errcode='22023';end if;
  if p_action in('start','start_audio') then
    canonical:=exists(select 1 from public.messaging_direct_pairs where conversation_id=p_conversation_id);
    peer:=public.messaging_call_peer_v2(p_conversation_id,u,canonical);
    if peer is null then raise exception 'call_not_allowed' using errcode='42501';end if;
    perform pg_advisory_xact_lock(hashtextextended(least(u,peer)::text,109));
    perform pg_advisory_xact_lock(hashtextextended(greatest(u,peer)::text,109));
  end if;
  update public.messaging_video_calls_v1 set status='missed',ended_at=now()
    where (u in(caller_id,callee_id) or peer in(caller_id,callee_id)) and status in('ringing','accepted')
    and ((status='ringing' and created_at<now()-interval '45 seconds')
      or (status='accepted' and (caller_seen_at<now()-interval '35 seconds' or callee_seen_at<now()-interval '35 seconds')));
  if p_action in('start','start_audio') then
    if exists(select 1 from public.messaging_video_calls_v1 where (u in(caller_id,callee_id) or peer in(caller_id,callee_id)) and status in('ringing','accepted')) then
      raise exception 'call_busy' using errcode='55000';end if;
    if (select count(*) from public.messaging_video_calls_v1 where caller_id=u and created_at>now()-interval '1 minute')>=4 then
      raise exception 'call_rate_limited' using errcode='54000';end if;
    if public.messaging_call_peer_v2(p_conversation_id,u,canonical) is distinct from peer then raise exception 'call_not_allowed' using errcode='42501';end if;
    insert into public.messaging_video_calls_v1(conversation_id,canonical_conversation_id,caller_id,callee_id,media_kind)
      values(case when not canonical then p_conversation_id end,case when canonical then p_conversation_id end,u,peer,
        case when p_action='start_audio' then 'audio' else 'video' end) returning * into c;
  else
    select * into c from public.messaging_video_calls_v1
      where u in(caller_id,callee_id) and (id=p_call_id or (p_call_id is null and status in('ringing','accepted')))
      order by created_at desc limit 1 for update;
    if c.id is null then return null;end if;
    peer:=case when c.caller_id=u then c.callee_id else c.caller_id end;
    if c.status in('ringing','accepted') and public.messaging_call_peer_v2(coalesce(c.canonical_conversation_id,c.conversation_id),u,c.canonical_conversation_id is not null) is distinct from peer then
      update public.messaging_video_calls_v1 set status='ended',ended_at=now() where id=c.id returning * into c;
    end if;
    if p_action in('accept','decline') and c.status='ringing' then
      if c.callee_id<>u then raise exception 'recipient_only' using errcode='42501';end if;
      update public.messaging_video_calls_v1 set status=case when p_action='accept' then 'accepted' else 'declined' end,
        answered_at=case when p_action='accept' then now() end,ended_at=case when p_action='decline' then now() end,
        caller_seen_at=now(),callee_seen_at=now() where id=c.id returning * into c;
    elsif p_action='end' and c.status in('ringing','accepted') then
      update public.messaging_video_calls_v1 set status='ended',ended_at=now() where id=c.id returning * into c;
    elsif p_action in('sync','media') and c.status='accepted' then
      update public.messaging_video_calls_v1 set caller_seen_at=case when caller_id=u then now() else caller_seen_at end,
        callee_seen_at=case when callee_id=u then now() else callee_seen_at end where id=c.id returning * into c;
    end if;
  end if;
  -- Return non-accepted state rather than throwing after a revocation: the
  -- token issuer denies it, while the ended state and broadcast can commit.
  select coalesce(nullif(to_jsonb(p)->>'display_name',''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'username',''),'Contact Meewav') into name from public.profiles p where p.id=peer;
  return jsonb_build_object('kind',c.media_kind,'id',c.id,'conversationId',coalesce(c.canonical_conversation_id,c.conversation_id),'status',c.status,
    'incoming',c.callee_id=u,'peerId',peer,'peerName',name,'createdAt',c.created_at,'answeredAt',c.answered_at,'roomId','mw-call-'||c.id::text);
end;$$;
revoke all on function public.messaging_video_call_v1(text,uuid,uuid) from public,anon;
grant execute on function public.messaging_video_call_v1(text,uuid,uuid) to authenticated;
commit;
