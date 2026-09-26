-- Preserve durable outbox/scheduler names while replacing the RTC provider.
create or replace function public.rooms_reconcile_livekit_guest_publication_v1(p_room_id uuid,p_user_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text;v_authorized boolean:=false;v_stage boolean:=false;
begin
  select coalesce(s.room_type,r.type) into v_kind from public.rooms_v2 r
    left join public.room_specialized_state_v1 s on s.room_id=r.id where r.id=p_room_id;
  if v_kind='classe' and to_regclass('public.room_classe_floor_requests_v1') is not null then
    execute 'select exists(select 1 from public.room_classe_floor_requests_v1 f join public.rooms_v2 r on r.id=f.room_id join public.room_participants_v2 p on p.room_id=r.id and p.user_id=f.user_id and p.left_at is null where f.room_id=$1 and f.user_id=$2 and f.status=''granted'' and r.status=''live'' and not exists(select 1 from public.room_bans_v2 b where b.room_id=r.id and b.user_id=f.user_id))'
      into v_authorized using p_room_id,p_user_id;
  elsif v_kind<>'classe' then
    select exists(select 1 from public.rooms_v2 r join public.room_participants_v2 p on p.room_id=r.id
      and p.user_id=p_user_id and p.role='guest' and p.left_at is null
      join public.room_invitations_v2 i on i.room_id=r.id and i.guest_id=p.user_id and i.status='onstage' and i.ended_at is null
      where r.id=p_room_id and r.status='live' and not exists(select 1 from public.room_bans_v2 b where b.room_id=r.id and b.user_id=p.user_id)) into v_authorized;
  end if;
  if v_kind='classe' and to_regclass('public.room_classe_participations_v1') is not null then
    execute 'select exists(select 1 from public.room_classe_participations_v1 f join public.rooms_v2 r on r.id=f.room_id join public.room_participants_v2 p on p.room_id=r.id and p.user_id=f.user_id and p.left_at is null where f.room_id=$1 and f.user_id=$2 and f.status=''onstage'' and r.status=''live'' and not exists(select 1 from public.room_bans_v2 b where b.room_id=r.id and b.user_id=f.user_id))'
      into v_stage using p_room_id,p_user_id;
    v_authorized:=coalesce(v_authorized,false) or v_stage;
  end if;
  perform public.rooms_set_livekit_publication_authorization_v1(p_room_id,p_user_id,coalesce(v_authorized,false),p_reason);
end;
$$;
revoke all on function public.rooms_reconcile_livekit_guest_publication_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rooms_reconcile_livekit_guest_publication_v1(uuid,uuid,text) to service_role;

create function public.rooms_byteplus_floor_changed_v1() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    perform public.rooms_reconcile_livekit_guest_publication_v1(old.room_id,old.user_id,'classe_floor_removed');return old;
  end if;
  perform public.rooms_reconcile_livekit_guest_publication_v1(new.room_id,new.user_id,'classe_floor_changed');return new;
end;
$$;
revoke all on function public.rooms_byteplus_floor_changed_v1() from public,anon,authenticated;
do $$ declare definition text;begin
  if to_regclass('public.room_classe_floor_requests_v1') is not null then
    execute 'create trigger rooms_byteplus_floor_changed after insert or update or delete on public.room_classe_floor_requests_v1 for each row execute function public.rooms_byteplus_floor_changed_v1()';
  end if;
  if to_regclass('public.room_classe_participations_v1') is not null then
    execute 'create trigger rooms_byteplus_participation_changed after insert or update or delete on public.room_classe_participations_v1 for each row execute function public.rooms_byteplus_floor_changed_v1()';
  end if;
  select pg_get_functiondef('public.rooms_livekit_room_changed_v1()'::regprocedure) into definition;
  execute replace(definition,'if new.type <> ''place'' then return new; end if;','');
end;$$;
