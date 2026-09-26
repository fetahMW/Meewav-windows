-- Host moderation of the same canonical floor queue used by native Android.
create or replace function public.rooms_classe_dismiss_floor_requests_v1(p_room_id uuid,p_user_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare request record;
begin
  perform public.rooms_classe_assert_live_v1(p_room_id,true);
  perform 1 from public.room_classe_settings_v1 where room_id=p_room_id for update;
  for request in
    update public.room_classe_floor_requests_v1
    set status='ended',ended_at=now(),ended_by=auth.uid(),end_reason='host_dismissed',revision=revision+1
    where room_id=p_room_id and status='requested' and (p_user_id is null or user_id=p_user_id)
    returning id,user_id,revision
  loop
    perform public.rooms_classe_emit_v1(p_room_id,'classe.floor.changed','user',request.user_id,
      jsonb_build_object('request_id',request.id,'revision',request.revision),null,now());
    perform public.rooms_classe_emit_v1(p_room_id,'classe.floor.cancelled','host',null,
      jsonb_build_object('request_id',request.id,'user_id',request.user_id),null,now());
  end loop;
end;
$$;
revoke all on function public.rooms_classe_dismiss_floor_requests_v1(uuid,uuid) from public,anon;
grant execute on function public.rooms_classe_dismiss_floor_requests_v1(uuid,uuid) to authenticated;
