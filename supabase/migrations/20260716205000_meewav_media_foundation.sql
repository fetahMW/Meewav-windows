-- Canonical media metadata extends the existing iOS public.media_files table.
-- Originals live in a private bucket; publication is expressed by metadata +
-- RLS rather than by making an entire bucket public.

create extension if not exists pgcrypto;

alter table public.media_files
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists checksum_sha256 text,
  add column if not exists status text not null default 'draft',
  add column if not exists visibility text not null default 'private',
  add column if not exists produced_on_meewav boolean not null default false,
  add column if not exists source_pillar text not null default 'profile',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists profile_order integer not null default 100,
  add column if not exists version bigint not null default 1;

-- New uploads use storage paths and therefore do not require a permanent URL.
-- Existing URLs are retained unchanged for iOS compatibility.
alter table public.media_files alter column file_url drop not null;

update public.media_files
set status = case when coalesce(is_public, false) then 'published' else 'draft' end,
    visibility = case when coalesce(is_public, false) then 'public' else 'private' end,
    published_at = case
      when coalesce(is_public, false) then coalesce(published_at, created_at, now())
      else published_at
    end,
    size_bytes = coalesce(size_bytes, file_size::bigint),
    source_pillar = coalesce(nullif(source_pillar, ''), 'profile')
where status is null
   or visibility is null
   or size_bytes is null
   or source_pillar is null
   or (coalesce(is_public, false) and published_at is null);

-- A local device filename is not public product metadata. Scrub the historical
-- Web key before any row can be exposed through a published profile.
update public.media_files
set metadata = coalesce(metadata, '{}'::jsonb) - 'original_filename'
where coalesce(metadata, '{}'::jsonb) ? 'original_filename';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_type_check_v2'
  ) then
    alter table public.media_files
      add constraint media_files_type_check_v2
      check (type in ('audio', 'video', 'image', 'document', 'pdf')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_status_check_v2'
  ) then
    alter table public.media_files
      add constraint media_files_status_check_v2
      check (status in ('draft', 'uploading', 'processing', 'ready', 'scheduled', 'published', 'failed', 'archived')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_visibility_check_v2'
  ) then
    alter table public.media_files
      add constraint media_files_visibility_check_v2
      check (visibility in ('private', 'unlisted', 'public')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_source_pillar_check_v2'
  ) then
    alter table public.media_files
      add constraint media_files_source_pillar_check_v2
      check (source_pillar in ('profile', 'globe', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_nonnegative_sizes_v2'
  ) then
    alter table public.media_files
      add constraint media_files_nonnegative_sizes_v2
      check (
        coalesce(file_size, 0) >= 0
        and coalesce(size_bytes, 0) >= 0
        and coalesce(duration_ms, 0) >= 0
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_metadata_size_v2'
  ) then
    alter table public.media_files
      add constraint media_files_metadata_size_v2
      check (octet_length(metadata::text) <= 8192) not valid;
  end if;
end;
$$;

create index if not exists media_files_owner_status_created_idx
  on public.media_files(user_id, status, created_at desc)
  where deleted_at is null;
create index if not exists media_files_public_published_idx
  on public.media_files(published_at desc)
  where status = 'published' and visibility = 'public' and deleted_at is null;
create unique index if not exists media_files_storage_object_unique_idx
  on public.media_files(storage_bucket, storage_path)
  where storage_path is not null and deleted_at is null;
create index if not exists media_files_produced_on_meewav_idx
  on public.media_files(user_id, produced_on_meewav, created_at desc)
  where deleted_at is null;

create or replace function public.meewav_media_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  if new.is_public is distinct from old.is_public
     and new.status is not distinct from old.status then
    -- iOS V1 compatibility: its metadata contract only toggles is_public.
    if new.is_public is true then
      new.status := 'published';
      new.visibility := 'public';
      new.published_at := coalesce(new.published_at, now());
    else
      new.status := case when old.status = 'published' then 'ready' else new.status end;
      new.visibility := 'private';
    end if;
  elsif new.status = 'published' and new.visibility = 'public' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  new.is_public := (new.status = 'published' and new.visibility = 'public');
  return new;
end;
$$;

create or replace function public.meewav_media_client_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_service boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
  v_is_existing_published boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_is_existing_published := old.status = 'published'
      and old.visibility = 'public'
      and new.file_url is not distinct from old.file_url;
  end if;

  new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'original_filename';

  if octet_length(coalesce(new.metadata, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22001', message = 'media_metadata_too_large';
  end if;

  if tg_op = 'INSERT' and not v_is_service then
    new.produced_on_meewav := false;
  elsif tg_op = 'UPDATE'
    and new.produced_on_meewav is distinct from old.produced_on_meewav
    and not v_is_service then
    raise exception using errcode = '42501', message = 'produced_on_meewav_is_server_managed';
  end if;

  if tg_op = 'INSERT' then
    if new.is_public is true and new.status = 'draft' then
      -- iOS V1 compatibility for a metadata row created already public.
      new.status := 'published';
      new.visibility := 'public';
      new.published_at := coalesce(new.published_at, now());
    end if;
    new.is_public := (new.status = 'published' and new.visibility = 'public');
  elsif new.is_public is distinct from old.is_public
    and new.status is not distinct from old.status then
    -- Normalize the legacy iOS toggle here, before validating publication.
    -- The historical touch trigger runs afterwards and therefore cannot be the
    -- only place where this transition is interpreted.
    if new.is_public is true then
      new.status := 'published';
      new.visibility := 'public';
      new.published_at := coalesce(new.published_at, now());
    else
      new.status := case when old.status = 'published' then 'ready' else new.status end;
      new.visibility := 'private';
    end if;
  end if;

  if new.status = 'published' and new.visibility = 'public' then
    if not (
      new.storage_bucket is not null
      and new.storage_path is not null
      and exists (
        select 1
        from storage.objects o
        where o.bucket_id = new.storage_bucket
          and o.name = new.storage_path
      )
    ) and not (
      -- Rows that were already public before this migration remain editable,
      -- but a browser cannot turn a new arbitrary external URL into public
      -- media. Trusted server code may curate a legacy HTTPS URL explicitly.
      v_is_existing_published
    ) and not (
      v_is_service
      and nullif(btrim(coalesce(new.file_url, '')), '') ~ '^https://'
    ) then
      raise exception using
        errcode = '23514',
        message = 'published_media_requires_uploaded_object';
    end if;

    new.is_public := true;
    new.published_at := coalesce(new.published_at, now());
  else
    new.is_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists media_files_client_guard_v2 on public.media_files;
create trigger media_files_client_guard_v2
before insert or update on public.media_files
for each row execute function public.meewav_media_client_guard();

drop trigger if exists media_files_touch_updated_at_v2 on public.media_files;
create trigger media_files_touch_updated_at_v2
before update on public.media_files
for each row execute function public.meewav_media_touch_updated_at();

create or replace function public.archive_media_file(p_media_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  update public.media_files
  set status = 'archived',
      visibility = 'private',
      is_public = false,
      deleted_at = coalesce(deleted_at, now())
  where id = p_media_id and user_id = auth.uid() and deleted_at is null;

  v_changed := found;
  return v_changed;
end;
$$;

-- Legacy artist_media was never deployed by the Web branch. If it exists in a
-- developer database, remove its unsafe anonymous policy without deleting data.
do $$
begin
  if to_regclass('public.artist_media') is not null then
    execute 'alter table public.artist_media enable row level security';
    execute 'drop policy if exists artist_media_public_read_active on public.artist_media';
    execute 'drop policy if exists artist_media_owner_soft_delete on public.artist_media';
    execute 'revoke delete on public.artist_media from anon, authenticated';
    execute 'comment on table public.artist_media is ''DEPRECATED compatibility table. Use public.media_files; no public read or hard delete.''';
  end if;
end;
$$;

-- Private source bucket. Access to a published object is still possible through
-- the object policy when the matching metadata row is public and published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  false,
  262144000,
  array[
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/flac',
    'video/mp4', 'video/quicktime', 'video/webm',
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_media_owner_select on storage.objects;
create policy profile_media_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_published_select on storage.objects;
create policy profile_media_published_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'profile-media'
  and exists (
    select 1 from public.media_files m
    where m.storage_bucket = storage.objects.bucket_id
      and m.storage_path = storage.objects.name
      and m.status = 'published'
      and m.visibility = 'public'
      and m.deleted_at is null
  )
);

drop policy if exists profile_media_owner_insert on storage.objects;
create policy profile_media_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_owner_update on storage.objects;
create policy profile_media_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_owner_delete on storage.objects;
create policy profile_media_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.media_files enable row level security;
drop policy if exists "Voir les fichiers publics" on public.media_files;
drop policy if exists "Gérer ses fichiers" on public.media_files;
drop policy if exists "Modifier ses fichiers" on public.media_files;
drop policy if exists "Supprimer ses fichiers" on public.media_files;

drop policy if exists media_files_owner_select on public.media_files;
create policy media_files_owner_select on public.media_files
for select to authenticated using (user_id = auth.uid());
drop policy if exists media_files_published_select on public.media_files;
drop policy if exists media_files_owner_insert on public.media_files;
create policy media_files_owner_insert on public.media_files
for insert to authenticated with check (
  user_id = auth.uid()
  and status in ('draft', 'uploading')
  and visibility in ('private', 'unlisted')
  and (storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text)
);
drop policy if exists media_files_owner_update on public.media_files;
create policy media_files_owner_update on public.media_files
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text)
);
drop policy if exists media_files_owner_delete_legacy on public.media_files;
create policy media_files_owner_delete_legacy on public.media_files
for delete to authenticated using (user_id = auth.uid());

-- Remove the historical table-wide authenticated mutation grant. iOS V1 still
-- needs owner SELECT * and hard-delete temporarily, but inserts and updates are
-- now constrained to the explicit columns below plus the RLS owner policies.
revoke all on public.media_files from authenticated;
grant select, delete on public.media_files to authenticated;
-- Anonymous and third-party reads must use published_media_files. Direct table
-- reads are owner-only so internal processing/storage columns never leak.
revoke all on public.media_files from anon;
grant insert (
  id, user_id, type, name, format, file_size, size_bytes, duration_ms,
  file_url, cover_url, folder_id, storage_bucket, storage_path, mime_type,
  status, visibility, produced_on_meewav, source_pillar, metadata,
  scheduled_at, profile_order
) on public.media_files to authenticated;
grant update (
  name, cover_url, status, visibility, metadata, scheduled_at,
  published_at, profile_order
) on public.media_files to authenticated;
grant all on public.media_files to service_role;

revoke all on function public.archive_media_file(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_media_file(uuid) to authenticated;
revoke all on function public.meewav_media_touch_updated_at()
  from public, anon, authenticated;
revoke all on function public.meewav_media_client_guard()
  from public, anon, authenticated;

create or replace view public.published_media_files
with (security_invoker = false, security_barrier = true)
as
select
  m.id,
  m.user_id as owner_profile_id,
  m.type,
  m.name,
  m.format,
  m.size_bytes,
  m.duration_ms,
  m.file_url,
  m.cover_url,
  m.storage_bucket,
  m.storage_path,
  m.mime_type,
  m.produced_on_meewav,
  m.source_pillar,
  m.metadata - 'original_filename' - 'upload_source' as metadata,
  m.published_at,
  m.created_at,
  m.updated_at
from public.media_files m
where m.status = 'published'
  and m.visibility = 'public'
  and m.deleted_at is null;

grant select on public.published_media_files to anon, authenticated;

comment on table public.media_files is
  'Shared iOS/Web media catalog. New source files use private profile-media storage paths; public access is metadata-gated.';
comment on view public.published_media_files is
  'Safe published-media projection. It excludes checksums and deletion/internal processing state.';
