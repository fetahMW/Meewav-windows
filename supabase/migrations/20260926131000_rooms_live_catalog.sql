-- Both clients use one safe catalogue: no unfinished launch and no inference
-- from the historical physical `place` type for specialized rooms.
create function public.rooms_live_catalog_v1()
returns table(id uuid,host_id uuid,type text,title text,cover_url text,video_format text,participants_count integer,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,r.host_id,coalesce(case when e.version>0 then e.current_type end,s.room_type,r.type),r.title,r.cover_url,r.video_format,r.participants_count,r.created_at
  from public.rooms_v2 r
  left join public.room_experience_v1 e on e.room_id=r.id
  left join public.room_specialized_state_v1 s on s.room_id=r.id
  where auth.uid() is not null and r.status='live' and r.launch_status='ready'
    and coalesce(case when e.version>0 then e.current_type end,s.room_type,r.type) in('place','classe','loge','scene','cage','wave')
    and not exists(select 1 from public.room_bans_v2 b where b.room_id=r.id and b.user_id=auth.uid())
  order by r.created_at desc,r.id limit 200;
$$;
revoke all on function public.rooms_live_catalog_v1() from public,anon;
grant execute on function public.rooms_live_catalog_v1() to authenticated;
