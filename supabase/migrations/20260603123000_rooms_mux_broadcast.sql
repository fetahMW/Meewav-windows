create table if not exists public.room_broadcasts_v2 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  mux_live_stream_id text,
  mux_playback_id text,
  mux_status text not null default 'idle'
    check (mux_status in ('idle', 'starting', 'active', 'stopped', 'failed')),
  byteplus_task_id text,
  byteplus_status text not null default 'idle'
    check (byteplus_status in ('idle', 'starting', 'active', 'stopped', 'failed')),
  error_message text,
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.room_broadcasts_v2 replica identity full;
create trigger room_broadcasts_v2_updated_at
before update on public.room_broadcasts_v2
for each row execute function public.update_updated_at();
alter table public.room_broadcasts_v2 enable row level security;
create policy "Voir les broadcasts de rooms visibles"
on public.room_broadcasts_v2
for select
to authenticated
using (
  exists (
    select 1
    from public.rooms_v2 r
    where r.id = room_broadcasts_v2.room_id
      and r.status <> 'ended'
  )
);
grant all on table public.room_broadcasts_v2 to anon;
grant all on table public.room_broadcasts_v2 to authenticated;
grant all on table public.room_broadcasts_v2 to service_role;
alter publication supabase_realtime add table public.room_broadcasts_v2;
