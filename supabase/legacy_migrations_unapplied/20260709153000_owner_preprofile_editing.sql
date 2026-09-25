-- Meewav owner pre-profile editing V1
-- Structure only: the hover popup exposes edit affordances, but uploads must go
-- through a confirmed picker/upload flow before metadata is written.

create extension if not exists pgcrypto;

do $$
declare
  target_table regclass;
  target_name text;
begin
  foreach target_table in array array[
    to_regclass('public.mock_artists'),
    to_regclass('public.musicians')
  ]
  loop
    if target_table is null then
      continue;
    end if;

    target_name := split_part(target_table::text, '.', 2);

    execute format($sql$
      alter table %s
        add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
        add column if not exists bio text,
        add column if not exists role text,
        add column if not exists profile_photo_url text,
        add column if not exists map_marker_color text
    $sql$, target_table);

    execute format('alter table %s enable row level security', target_table);

    execute format('drop policy if exists %I on %s', target_name || '_owner_update_own_preprofile', target_table);
    execute format($sql$
      create policy %I
      on %s
      for update
      to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid())
    $sql$, target_name || '_owner_update_own_preprofile', target_table);

    execute format('drop policy if exists %I on %s', target_name || '_public_read_preprofile', target_table);
    execute format($sql$
      create policy %I
      on %s
      for select
      to anon, authenticated
      using (true)
    $sql$, target_name || '_public_read_preprofile', target_table);
  end loop;
end;
$$;

create table if not exists public.artist_media (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  artist_table text not null default 'mock_artists'
    check (artist_table in ('mock_artists', 'musicians')),
  artist_id uuid not null,
  type text not null check (type in ('short', 'audio')),
  title text not null,
  url text not null,
  cover_url text,
  duration text,
  sort_order integer not null default 100,
  is_featured boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_media_artist_idx
on public.artist_media (artist_table, artist_id)
where deleted_at is null;

create index if not exists artist_media_owner_idx
on public.artist_media (owner_user_id)
where deleted_at is null;

alter table public.artist_media enable row level security;

drop policy if exists artist_media_public_read_active on public.artist_media;
create policy artist_media_public_read_active
on public.artist_media
for select
to anon, authenticated
using (deleted_at is null);

drop policy if exists artist_media_owner_insert on public.artist_media;
create policy artist_media_owner_insert
on public.artist_media
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists artist_media_owner_update on public.artist_media;
create policy artist_media_owner_update
on public.artist_media
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists artist_media_owner_soft_delete on public.artist_media;
create policy artist_media_owner_soft_delete
on public.artist_media
for delete
to authenticated
using (owner_user_id = auth.uid());

create or replace function public.touch_artist_media_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists artist_media_touch_updated_at on public.artist_media;
create trigger artist_media_touch_updated_at
before update on public.artist_media
for each row
execute function public.touch_artist_media_updated_at();

insert into storage.buckets (id, name, public)
values
  ('artist-portraits', 'artist-portraits', true),
  ('artist-shorts', 'artist-shorts', true),
  ('artist-audio', 'artist-audio', true),
  ('artist-covers', 'artist-covers', true)
on conflict (id) do nothing;

do $$
declare
  bucket_name text;
begin
  foreach bucket_name in array array[
    'artist-portraits',
    'artist-shorts',
    'artist-audio',
    'artist-covers'
  ]
  loop
    execute format('drop policy if exists %I on storage.objects', bucket_name || '_public_read');
    execute format($sql$
      create policy %I
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = %L)
    $sql$, bucket_name || '_public_read', bucket_name);

    execute format('drop policy if exists %I on storage.objects', bucket_name || '_owner_write');
    execute format($sql$
      create policy %I
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = %L
        and split_part(name, '/', 1) = auth.uid()::text
      )
    $sql$, bucket_name || '_owner_write', bucket_name);

    execute format('drop policy if exists %I on storage.objects', bucket_name || '_owner_update');
    execute format($sql$
      create policy %I
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = %L
        and split_part(name, '/', 1) = auth.uid()::text
      )
      with check (
        bucket_id = %L
        and split_part(name, '/', 1) = auth.uid()::text
      )
    $sql$, bucket_name || '_owner_update', bucket_name, bucket_name);
  end loop;
end;
$$;
