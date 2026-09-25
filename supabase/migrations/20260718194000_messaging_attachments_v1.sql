begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Meewav Messaging v1 — private attachments.
--
-- This phase is additive. It keeps the Phase A RPCs stable, reuses the
-- canonical media_files catalog, never stores a signed URL and does not touch
-- any Rooms object.
-- ---------------------------------------------------------------------------

alter table public.messaging_messages
  add column if not exists attachment_manifest_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.messaging_messages'::regclass
      and conname = 'messaging_messages_attachment_manifest_hash_check'
  ) then
    alter table public.messaging_messages
      add constraint messaging_messages_attachment_manifest_hash_check
      check (
        attachment_manifest_hash is null
        or attachment_manifest_hash ~ '^[0-9a-f]{64}$'
      );
  end if;
end;
$$;

create table if not exists public.messaging_attachment_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null
    references public.profiles(id) on delete cascade,
  media_file_id uuid unique
    references public.media_files(id) on delete set null,
  conversation_id uuid
    references public.messaging_conversations(id) on delete cascade,
  collaboration_recipient_profile_id uuid
    references public.profiles(id) on delete cascade,
  client_upload_id uuid not null,
  purpose text not null check (purpose in (
    'image', 'audio', 'video', 'document', 'voice_note', 'track_stem'
  )),
  display_name text not null check (char_length(display_name) between 1 and 180),
  storage_bucket text not null default 'messaging-attachments'
    check (storage_bucket = 'messaging-attachments'),
  storage_path text not null unique,
  expected_mime_type text not null,
  expected_size_bytes bigint not null check (expected_size_bytes > 0),
  actual_mime_type text,
  actual_size_bytes bigint check (actual_size_bytes is null or actual_size_bytes > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  checksum_sha256 text check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status text not null default 'uploading' check (status in (
    'uploading', 'processing', 'ready', 'attached',
    'discarded', 'failed', 'expired'
  )),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  finalized_at timestamptz,
  attached_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, client_upload_id),
  check (
    (conversation_id is not null)::integer
    + (collaboration_recipient_profile_id is not null)::integer = 1
  )
);

create index if not exists messaging_attachment_uploads_owner_status_idx
  on public.messaging_attachment_uploads(owner_profile_id, status, created_at desc);
create index if not exists messaging_attachment_uploads_conversation_idx
  on public.messaging_attachment_uploads(conversation_id, status)
  where conversation_id is not null;
create index if not exists messaging_attachment_uploads_collab_target_idx
  on public.messaging_attachment_uploads(
    collaboration_recipient_profile_id, status, created_at desc
  ) where collaboration_recipient_profile_id is not null;
create index if not exists messaging_attachment_uploads_expiry_idx
  on public.messaging_attachment_uploads(expires_at)
  where status in ('uploading', 'processing', 'ready');

create table if not exists public.messaging_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references public.messaging_messages(id) on delete cascade,
  upload_id uuid
    references public.messaging_attachment_uploads(id) on delete set null,
  media_file_id uuid
    references public.media_files(id) on delete set null,
  sort_order smallint not null check (sort_order between 0 and 7),
  attachment_role text not null check (attachment_role in (
    'primary', 'stem', 'cover', 'preview', 'document'
  )),
  purpose_snapshot text not null check (purpose_snapshot in (
    'image', 'audio', 'video', 'document', 'voice_note', 'track_stem'
  )),
  media_type_snapshot text not null check (
    media_type_snapshot in ('image', 'audio', 'video', 'document')
  ),
  display_name_snapshot text not null
    check (char_length(display_name_snapshot) between 1 and 180),
  mime_type_snapshot text not null,
  size_bytes_snapshot bigint not null check (size_bytes_snapshot > 0),
  duration_ms_snapshot integer
    check (duration_ms_snapshot is null or duration_ms_snapshot >= 0),
  bpm smallint check (bpm is null or bpm between 20 and 300),
  musical_key text check (musical_key is null or char_length(musical_key) <= 24),
  label text check (label is null or char_length(label) between 1 and 180),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  unique (message_id, sort_order),
  unique (message_id, upload_id)
);

create index if not exists messaging_message_attachments_media_idx
  on public.messaging_message_attachments(media_file_id)
  where media_file_id is not null;

create table if not exists public.collaboration_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.collaboration_requests(id) on delete cascade,
  upload_id uuid
    references public.messaging_attachment_uploads(id) on delete set null,
  media_file_id uuid
    references public.media_files(id) on delete set null,
  sort_order smallint not null check (sort_order between 0 and 2),
  purpose_snapshot text not null check (purpose_snapshot in (
    'image', 'audio', 'video', 'document', 'voice_note', 'track_stem'
  )),
  media_type_snapshot text not null check (
    media_type_snapshot in ('image', 'audio', 'video', 'document')
  ),
  display_name_snapshot text not null
    check (char_length(display_name_snapshot) between 1 and 180),
  mime_type_snapshot text not null,
  size_bytes_snapshot bigint not null check (size_bytes_snapshot > 0),
  duration_ms_snapshot integer
    check (duration_ms_snapshot is null or duration_ms_snapshot >= 0),
  bpm smallint check (bpm is null or bpm between 20 and 300),
  musical_key text check (musical_key is null or char_length(musical_key) <= 24),
  label text check (label is null or char_length(label) between 1 and 180),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  unique (request_id, sort_order),
  unique (request_id, upload_id)
);

create index if not exists collaboration_request_attachments_media_idx
  on public.collaboration_request_attachments(media_file_id)
  where media_file_id is not null;

-- Durable server outbox for physical object cleanup. PostgreSQL owns expiry and
-- queuing; a trusted worker consumes this outbox through the Storage API so a
-- browser/iOS client is never responsible for eventually removing an orphan.
create table if not exists public.messaging_attachment_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique
    references public.messaging_attachment_uploads(id) on delete cascade,
  owner_profile_id uuid not null
    references public.profiles(id) on delete cascade,
  storage_bucket text not null check (storage_bucket = 'messaging-attachments'),
  storage_path text not null,
  reason text not null check (reason in ('discarded', 'failed', 'expired')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messaging_attachment_cleanup_jobs_claim_idx
  on public.messaging_attachment_cleanup_jobs(status, available_at, created_at)
  where status <> 'completed';

-- ---------------------------------------------------------------------------
-- Shared validation helpers.
-- ---------------------------------------------------------------------------

create or replace function public.messaging_attachment_max_bytes_v1(
  p_purpose text
)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_purpose
    when 'image' then 10485760::bigint       -- 10 MiB
    when 'document' then 15728640::bigint    -- 15 MiB
    when 'voice_note' then 15728640::bigint  -- 15 MiB
    when 'audio' then 52428800::bigint       -- 50 MiB
    when 'video' then 52428800::bigint       -- 50 MiB
    when 'track_stem' then 52428800::bigint  -- 50 MiB per stem
    else 0::bigint
  end;
$$;

-- Per-account reservation quotas. One structured message may legitimately
-- contain eight 50 MiB stems, hence a 512 MiB active ceiling. The rolling
-- one-hour ceiling limits abusive churn even when reservations are discarded.
create or replace function public.messaging_attachment_quota_v1(
  p_quota text
)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(p_quota, '')))
    when 'active_reservations' then 24::bigint
    when 'hourly_reservations' then 40::bigint
    when 'active_bytes' then 536870912::bigint       -- 512 MiB
    when 'hourly_bytes' then 1073741824::bigint      -- 1 GiB
    else 0::bigint
  end;
$$;

create or replace function public.messaging_attachment_media_type_v1(
  p_purpose text,
  p_mime_type text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_mime text := lower(split_part(trim(coalesce(p_mime_type, '')), ';', 1));
begin
  if p_purpose = 'image'
     and v_mime in ('image/jpeg', 'image/png', 'image/webp') then
    return 'image';
  elsif p_purpose = 'document' and v_mime = 'application/pdf' then
    return 'document';
  elsif p_purpose in ('audio', 'voice_note', 'track_stem')
     and v_mime in (
       'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
       'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac'
     ) then
    return 'audio';
  elsif p_purpose = 'video'
     and v_mime in ('video/mp4', 'video/quicktime', 'video/webm') then
    return 'video';
  end if;
  return null;
end;
$$;

create or replace function public.messaging_attachment_extension_v1(
  p_mime_type text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(split_part(trim(coalesce(p_mime_type, '')), ';', 1))
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    when 'audio/webm' then 'webm'
    when 'audio/ogg' then 'ogg'
    when 'audio/mpeg' then 'mp3'
    when 'audio/mp4' then 'm4a'
    when 'audio/m4a' then 'm4a'
    when 'audio/x-m4a' then 'm4a'
    when 'audio/wav' then 'wav'
    when 'audio/x-wav' then 'wav'
    when 'audio/flac' then 'flac'
    when 'video/mp4' then 'mp4'
    when 'video/quicktime' then 'mov'
    when 'video/webm' then 'webm'
    else null
  end;
$$;

create or replace function public.messaging_media_is_attached_v1(
  p_media_file_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_media_file_id is not null and (
    exists (
      select 1 from public.messaging_message_attachments attachment
      where attachment.media_file_id = p_media_file_id
    )
    or exists (
      select 1 from public.collaboration_request_attachments attachment
      where attachment.media_file_id = p_media_file_id
    )
  );
$$;

-- Existing Profile/iOS media behavior is unchanged. Only an already-attached
-- Messaging object is protected from destructive browser mutations. Trusted
-- service/account-deletion cascades can still remove it; the nullable link and
-- snapshots preserve a visible placeholder in message history.
create or replace function public.guard_attached_messaging_media_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trusted boolean := coalesce(auth.role(), '') = 'service_role'
    or (
      auth.uid() is null
      and session_user in ('postgres', 'supabase_admin')
    );
begin
  if old.source_pillar <> 'messaging'
     or not public.messaging_media_is_attached_v1(old.id)
     or v_trusted then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'attached_messaging_media_immutable';
  end if;

  if new.user_id is distinct from old.user_id
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.file_url is distinct from old.file_url
     or new.status is distinct from old.status
     or new.visibility is distinct from old.visibility
     or new.deleted_at is distinct from old.deleted_at
     or new.source_pillar is distinct from old.source_pillar then
    raise exception using errcode = '42501', message = 'attached_messaging_media_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_attached_messaging_media_v1 on public.media_files;
create trigger guard_attached_messaging_media_v1
before update or delete on public.media_files
for each row execute function public.guard_attached_messaging_media_v1();

-- Messaging originals are conversation-private assets, never profile/public
-- media. This normalizer runs before the shared iOS compatibility trigger so a
-- legacy `is_public` toggle is neutralized before publication validation.
create or replace function public.enforce_messaging_media_privacy_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.source_pillar = 'messaging'
       and new.source_pillar is distinct from old.source_pillar then
      raise exception using
        errcode = '42501',
        message = 'messaging_media_source_immutable';
    end if;
  end if;

  if new.source_pillar = 'messaging' then
    new.visibility := 'private';
    new.is_public := false;
    new.published_at := null;
    new.scheduled_at := null;
    if new.status in ('scheduled', 'published') then
      -- `processing`/`ready` mean usable inside a private conversation only.
      -- They do not claim content-sniffing, malware scanning or publication.
      new.status := case
        when new.storage_path is null then 'draft'
        else 'processing'
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aa_enforce_messaging_media_privacy_v1
  on public.media_files;
create trigger aa_enforce_messaging_media_privacy_v1
before insert or update on public.media_files
for each row execute function public.enforce_messaging_media_privacy_v1();

-- Repair any pre-release rows before validating the invariant. This does not
-- touch Profile, Globe, Rooms or any other media source pillar.
update public.media_files
set visibility = 'private',
    is_public = false,
    status = case
      when status in ('scheduled', 'published') and storage_path is null then 'draft'
      when status in ('scheduled', 'published') then 'processing'
      else status
    end,
    published_at = null,
    scheduled_at = null
where source_pillar = 'messaging'
  and (
    visibility <> 'private'
    or coalesce(is_public, false)
    or status in ('scheduled', 'published')
    or published_at is not null
    or scheduled_at is not null
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_files'::regclass
      and conname = 'media_files_messaging_always_private_v1'
  ) then
    alter table public.media_files
      add constraint media_files_messaging_always_private_v1
      check (
        source_pillar <> 'messaging'
        or (
          visibility = 'private'
          and not coalesce(is_public, false)
          and status not in ('scheduled', 'published')
          and published_at is null
          and scheduled_at is null
        )
      ) not valid;
  end if;
end;
$$;
alter table public.media_files
  validate constraint media_files_messaging_always_private_v1;

-- Defense in depth at the owner RLS boundary. The trigger + validated check
-- remain authoritative for SECURITY DEFINER and trusted server writes.
drop policy if exists media_files_owner_insert on public.media_files;
create policy media_files_owner_insert on public.media_files
for insert to authenticated with check (
  user_id = auth.uid()
  and status in ('draft', 'uploading')
  and visibility in ('private', 'unlisted')
  and (storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text)
  and (
    source_pillar <> 'messaging'
    or (
      visibility = 'private'
      and not coalesce(is_public, false)
      and status <> 'published'
      and published_at is null
    )
  )
);

drop policy if exists media_files_owner_update on public.media_files;
create policy media_files_owner_update on public.media_files
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text)
  and (
    source_pillar <> 'messaging'
    or (
      visibility = 'private'
      and not coalesce(is_public, false)
      and status not in ('scheduled', 'published')
      and published_at is null
      and scheduled_at is null
    )
  )
);

-- Public consumers use this safe projection. Messaging is excluded explicitly,
-- even if a future regression corrupts its publication metadata.
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
  and m.source_pillar <> 'messaging'
  and m.deleted_at is null;

grant select on public.published_media_files to anon, authenticated;

-- The shared Profile bucket policy is also hardened without changing any
-- non-Messaging publication behavior used by iOS/Profile.
drop policy if exists profile_media_published_select on storage.objects;
create policy profile_media_published_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'profile-media'
  and exists (
    select 1 from public.media_files media
    where media.storage_bucket = storage.objects.bucket_id
      and media.storage_path = storage.objects.name
      and media.status = 'published'
      and media.visibility = 'public'
      and media.source_pillar <> 'messaging'
      and media.deleted_at is null
  )
);

create or replace function public.messaging_can_upload_storage_object_v1(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.messaging_attachment_uploads upload
    where upload.storage_path = p_storage_path
      and upload.storage_bucket = 'messaging-attachments'
      and upload.owner_profile_id = auth.uid()
      and upload.status = 'uploading'
      and upload.expires_at > now()
      and (
        upload.conversation_id is null
        or exists (
          select 1 from public.messaging_conversations conversation
          where conversation.id = upload.conversation_id
            and conversation.deleted_at is null
        )
      )
  );
$$;

create or replace function public.messaging_can_read_storage_object_v1(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.messaging_attachment_uploads upload
      where upload.storage_path = p_storage_path
        and upload.owner_profile_id = auth.uid()
        and upload.status in ('uploading', 'processing', 'ready')
        and upload.expires_at > now()
        and (
          upload.conversation_id is null
          or exists (
            select 1 from public.messaging_conversations conversation
            where conversation.id = upload.conversation_id
              and conversation.deleted_at is null
          )
        )
    )
    or exists (
      select 1
      from public.messaging_attachment_uploads upload
      join public.messaging_message_attachments attachment
        on attachment.upload_id = upload.id
      join public.messaging_messages message on message.id = attachment.message_id
      join public.messaging_conversations conversation
        on conversation.id = message.conversation_id
      join public.messaging_conversation_members member
        on member.conversation_id = message.conversation_id
       and member.profile_id = auth.uid()
      where upload.storage_path = p_storage_path
        and attachment.media_file_id is not null
        and conversation.deleted_at is null
        and message.deleted_at is null
        and message.moderation_status = 'visible'
        and member.membership_status = 'active'
        and member.left_at is null
    )
    or exists (
      select 1
      from public.messaging_attachment_uploads upload
      join public.collaboration_request_attachments attachment
        on attachment.upload_id = upload.id
      join public.collaboration_requests request on request.id = attachment.request_id
      where upload.storage_path = p_storage_path
        and attachment.media_file_id is not null
        and auth.uid() in (request.sender_profile_id, request.recipient_profile_id)
    )
  );
$$;

create or replace function public.messaging_can_delete_storage_object_v1(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.messaging_attachment_uploads upload
    where upload.storage_path = p_storage_path
      and upload.owner_profile_id = auth.uid()
      and upload.status in ('discarded', 'failed', 'expired')
      and not exists (
        select 1 from public.messaging_message_attachments attachment
        where attachment.upload_id = upload.id
      )
      and not exists (
        select 1 from public.collaboration_request_attachments attachment
        where attachment.upload_id = upload.id
      )
  );
$$;

-- Queue every terminal, unattached reservation for a trusted server worker.
-- The worker must use the Storage API (not DELETE storage.objects) so the
-- physical blob and Storage metadata are removed together.
create or replace function public.queue_messaging_attachment_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('discarded', 'failed', 'expired') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if public.messaging_media_is_attached_v1(new.media_file_id)
     or exists (
       select 1 from public.messaging_message_attachments attachment
       where attachment.upload_id = new.id
     )
     or exists (
       select 1 from public.collaboration_request_attachments attachment
       where attachment.upload_id = new.id
     ) then
    return new;
  end if;

  insert into public.messaging_attachment_cleanup_jobs (
    upload_id, owner_profile_id, storage_bucket, storage_path, reason
  ) values (
    new.id, new.owner_profile_id, new.storage_bucket, new.storage_path, new.status
  )
  on conflict (upload_id) do update
  set reason = excluded.reason,
      status = 'pending',
      available_at = now(),
      claimed_at = null,
      completed_at = null,
      last_error = null,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists messaging_attachment_uploads_queue_cleanup
  on public.messaging_attachment_uploads;
create trigger messaging_attachment_uploads_queue_cleanup
after insert or update of status on public.messaging_attachment_uploads
for each row execute function public.queue_messaging_attachment_cleanup_v1();

-- Runs from pg_cron/service_role, never from a browser. Expiration is durable:
-- the status transition enqueues a cleanup job even if the Storage worker is
-- temporarily unavailable.
create or replace function public.expire_messaging_attachment_uploads_v1(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_upload_ids uuid[];
  v_expired_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_cleanup_limit';
  end if;

  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into v_upload_ids
  from (
    select upload.id
    from public.messaging_attachment_uploads upload
    where upload.status in ('uploading', 'processing', 'ready')
      and upload.expires_at <= now()
      and not public.messaging_media_is_attached_v1(upload.media_file_id)
      and not exists (
        select 1 from public.messaging_message_attachments attachment
        where attachment.upload_id = upload.id
      )
      and not exists (
        select 1 from public.collaboration_request_attachments attachment
        where attachment.upload_id = upload.id
      )
    order by upload.expires_at, upload.id
    for update skip locked
    limit p_limit
  ) candidate;

  if coalesce(cardinality(v_upload_ids), 0) = 0 then
    return 0;
  end if;

  update public.messaging_attachment_uploads upload
  set status = 'expired', updated_at = now()
  where upload.id = any(v_upload_ids);
  get diagnostics v_expired_count = row_count;

  update public.media_files media
  set status = 'archived',
      visibility = 'private',
      is_public = false,
      published_at = null,
      scheduled_at = null,
      deleted_at = coalesce(media.deleted_at, now())
  where media.source_pillar = 'messaging'
    and media.id in (
      select upload.media_file_id
      from public.messaging_attachment_uploads upload
      where upload.id = any(v_upload_ids)
        and upload.media_file_id is not null
    );

  return v_expired_count;
end;
$$;

create or replace function public.claim_messaging_attachment_cleanup_v1(
  p_limit integer default 100
)
returns table (
  job_id uuid,
  upload_id uuid,
  storage_bucket text,
  storage_path text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid_cleanup_limit';
  end if;

  return query
  with candidates as (
    select job.id
    from public.messaging_attachment_cleanup_jobs job
    where (
      job.status = 'pending'
      or (job.status = 'processing' and job.claimed_at < now() - interval '15 minutes')
    )
      and job.available_at <= now()
    order by job.available_at, job.created_at, job.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.messaging_attachment_cleanup_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        claimed_at = now(),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.upload_id, job.storage_bucket, job.storage_path,
      job.attempt_count
  )
  select claimed.id, claimed.upload_id, claimed.storage_bucket,
    claimed.storage_path, claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.complete_messaging_attachment_cleanup_v1(
  p_job_id uuid,
  p_succeeded boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_job_id is null or p_succeeded is null then
    raise exception using errcode = '22023', message = 'invalid_cleanup_result';
  end if;

  update public.messaging_attachment_cleanup_jobs job
  set status = case when p_succeeded then 'completed' else 'pending' end,
      completed_at = case when p_succeeded then now() else null end,
      claimed_at = case when p_succeeded then job.claimed_at else null end,
      available_at = case
        when p_succeeded then job.available_at
        else now() + (
          least(3600, 30 * power(2, least(job.attempt_count, 7))::integer)
          * interval '1 second'
        )
      end,
      last_error = case
        when p_succeeded then null
        else left(coalesce(nullif(trim(p_error), ''), 'storage_cleanup_failed'), 1000)
      end,
      updated_at = now()
  where job.id = p_job_id
    and job.status = 'processing';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

-- Schedule expiry when pg_cron is installed (standard on hosted Supabase). The
-- dynamic call keeps local/test databases without pg_cron fully compatible.
do $schedule$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1, $2, $3)'
      using 'messaging-attachments-expiry-v1', '*/10 * * * *',
        'select public.expire_messaging_attachment_uploads_v1(500);';
  end if;
end;
$schedule$;

-- ---------------------------------------------------------------------------
-- Private Storage bucket and narrowly-scoped object policies.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messaging-attachments',
  'messaging-attachments',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
    'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists messaging_attachments_insert on storage.objects;
create policy messaging_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'messaging-attachments'
  and public.messaging_can_upload_storage_object_v1(name)
);

drop policy if exists messaging_attachments_select on storage.objects;
create policy messaging_attachments_select on storage.objects
for select to authenticated
using (
  bucket_id = 'messaging-attachments'
  and public.messaging_can_read_storage_object_v1(name)
);

drop policy if exists messaging_attachments_delete on storage.objects;
create policy messaging_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'messaging-attachments'
  and public.messaging_can_delete_storage_object_v1(name)
);

-- No UPDATE policy: Web and iOS upload with upsert=false. A new object/version
-- receives a new reservation and path.

-- ---------------------------------------------------------------------------
-- Upload lifecycle.
-- ---------------------------------------------------------------------------

create or replace function public.prepare_messaging_upload_v1(
  p_client_upload_id uuid,
  p_purpose text,
  p_display_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_conversation_id uuid default null,
  p_collaboration_recipient_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_purpose text := lower(trim(coalesce(p_purpose, '')));
  v_mime text := lower(split_part(trim(coalesce(p_mime_type, '')), ';', 1));
  v_display_name text := regexp_replace(
    trim(coalesce(p_display_name, '')), '[[:cntrl:]/\\]+', '_', 'g'
  );
  v_media_type text;
  v_extension text;
  v_upload public.messaging_attachment_uploads%rowtype;
  v_upload_id uuid := gen_random_uuid();
  v_media_file_id uuid := gen_random_uuid();
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_client_upload_id is null then
    raise exception using errcode = '22023', message = 'client_upload_id_required';
  end if;
  if (p_conversation_id is not null)::integer
     + (p_collaboration_recipient_profile_id is not null)::integer <> 1 then
    raise exception using errcode = '22023', message = 'invalid_upload_scope';
  end if;
  if char_length(v_display_name) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'invalid_attachment_name';
  end if;

  v_media_type := public.messaging_attachment_media_type_v1(v_purpose, v_mime);
  v_extension := public.messaging_attachment_extension_v1(v_mime);
  if v_media_type is null or v_extension is null then
    raise exception using errcode = '22023', message = 'unsupported_attachment_type';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0
     or p_size_bytes > public.messaging_attachment_max_bytes_v1(v_purpose) then
    raise exception using errcode = '22023', message = 'attachment_size_limit';
  end if;

  if p_conversation_id is not null
     and not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  if p_collaboration_recipient_profile_id is not null then
    if p_collaboration_recipient_profile_id = v_user_id then
      raise exception using errcode = '23514', message = 'cannot_attach_for_self';
    end if;
    if public.messaging_profiles_blocked_v1(
      v_user_id, p_collaboration_recipient_profile_id
    ) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;
    if not exists (
      select 1 from public.profiles profile
      where profile.id = p_collaboration_recipient_profile_id
        and coalesce(profile.show_on_public_profile, false)
        and not coalesce(profile.is_ghost_mode, true)
        and coalesce(profile.collab_available, false)
    ) then
      raise exception using errcode = '23503', message = 'recipient_profile_not_available';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:upload:' || v_user_id::text || ':' || p_client_upload_id::text,
    0
  ));

  select upload.* into v_upload
  from public.messaging_attachment_uploads upload
  where upload.owner_profile_id = v_user_id
    and upload.client_upload_id = p_client_upload_id;
  if found then
    if v_upload.purpose <> v_purpose
       or v_upload.display_name <> v_display_name
       or v_upload.expected_mime_type <> v_mime
       or v_upload.expected_size_bytes <> p_size_bytes
       or v_upload.conversation_id is distinct from p_conversation_id
       or v_upload.collaboration_recipient_profile_id
          is distinct from p_collaboration_recipient_profile_id then
      raise exception using errcode = '23505', message = 'upload_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'upload_id', v_upload.id,
      'media_file_id', v_upload.media_file_id,
      'bucket', v_upload.storage_bucket,
      'path', v_upload.storage_path,
      'status', v_upload.status,
      'expires_at', v_upload.expires_at,
      'max_size_bytes', public.messaging_attachment_max_bytes_v1(v_upload.purpose)
    );
  end if;

  -- Serialize quota accounting per account. The client-id lock above preserves
  -- idempotency while this owner lock prevents concurrent uploads from racing
  -- past count or byte ceilings.
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:upload-quota:' || v_user_id::text,
    0
  ));

  -- Bound abandoned reservations before they reach Storage.
  if (
    select count(*) from public.messaging_attachment_uploads upload
    where upload.owner_profile_id = v_user_id
      and upload.created_at > now() - interval '1 hour'
  ) >= public.messaging_attachment_quota_v1('hourly_reservations') then
    raise exception using errcode = '54000', message = 'attachment_upload_rate_limit';
  end if;
  if coalesce((
    select sum(upload.expected_size_bytes)
    from public.messaging_attachment_uploads upload
    where upload.owner_profile_id = v_user_id
      and upload.created_at > now() - interval '1 hour'
  ), 0) + p_size_bytes > public.messaging_attachment_quota_v1('hourly_bytes') then
    raise exception using errcode = '54000', message = 'attachment_upload_hourly_bytes_limit';
  end if;
  if (
    select count(*) from public.messaging_attachment_uploads upload
    where upload.owner_profile_id = v_user_id
      and upload.status in ('uploading', 'processing', 'ready')
      and upload.expires_at > now()
  ) >= public.messaging_attachment_quota_v1('active_reservations') then
    raise exception using errcode = '54000', message = 'too_many_pending_uploads';
  end if;
  if coalesce((
    select sum(upload.expected_size_bytes)
    from public.messaging_attachment_uploads upload
    where upload.owner_profile_id = v_user_id
      and upload.status in ('uploading', 'processing', 'ready')
      and upload.expires_at > now()
  ), 0) + p_size_bytes > public.messaging_attachment_quota_v1('active_bytes') then
    raise exception using errcode = '54000', message = 'pending_upload_bytes_limit';
  end if;

  v_storage_path := v_user_id::text
    || case when p_conversation_id is not null
      then '/conversation/' || p_conversation_id::text
      else '/collaboration/' || p_collaboration_recipient_profile_id::text
    end
    || '/' || v_upload_id::text || '/original.' || v_extension;

  insert into public.media_files (
    id, user_id, type, name, format, file_size, size_bytes, duration_ms,
    file_url, cover_url, storage_bucket, storage_path, mime_type,
    status, visibility, is_public, published_at, scheduled_at,
    source_pillar, metadata
  ) values (
    v_media_file_id, v_user_id, v_media_type, v_display_name,
    upper(v_extension), p_size_bytes::integer, p_size_bytes, null,
    null, null, 'messaging-attachments', v_storage_path, v_mime,
    'uploading', 'private', false, null, null, 'messaging',
    jsonb_build_object(
      'schema_version', 1,
      'messaging_upload_id', v_upload_id,
      'purpose', v_purpose
    )
  );

  insert into public.messaging_attachment_uploads (
    id, owner_profile_id, media_file_id, conversation_id,
    collaboration_recipient_profile_id, client_upload_id, purpose,
    display_name, storage_path, expected_mime_type, expected_size_bytes
  ) values (
    v_upload_id, v_user_id, v_media_file_id, p_conversation_id,
    p_collaboration_recipient_profile_id, p_client_upload_id, v_purpose,
    v_display_name, v_storage_path, v_mime, p_size_bytes
  ) returning * into v_upload;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'upload_id', v_upload.id,
    'media_file_id', v_upload.media_file_id,
    'bucket', v_upload.storage_bucket,
    'path', v_upload.storage_path,
    'status', v_upload.status,
    'expires_at', v_upload.expires_at,
    'max_size_bytes', public.messaging_attachment_max_bytes_v1(v_upload.purpose)
  );
end;
$$;

create or replace function public.finalize_messaging_upload_v1(
  p_upload_id uuid,
  p_duration_ms integer default null,
  p_checksum_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload public.messaging_attachment_uploads%rowtype;
  v_object storage.objects%rowtype;
  v_actual_size bigint;
  v_actual_mime text;
  v_checksum text := lower(trim(coalesce(p_checksum_sha256, '')));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_upload_id is null then
    raise exception using errcode = '22023', message = 'upload_id_required';
  end if;
  if p_duration_ms is not null and p_duration_ms < 0 then
    raise exception using errcode = '22023', message = 'invalid_attachment_duration';
  end if;
  if nullif(v_checksum, '') is not null and v_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_attachment_checksum';
  end if;

  select upload.* into v_upload
  from public.messaging_attachment_uploads upload
  where upload.id = p_upload_id
    and upload.owner_profile_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'attachment_upload_not_found';
  end if;
  if v_upload.status in ('ready', 'attached') then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'upload_id', v_upload.id,
      'media_file_id', v_upload.media_file_id, 'status', v_upload.status,
      'mime_type', v_upload.actual_mime_type,
      'size_bytes', v_upload.actual_size_bytes,
      'duration_ms', v_upload.duration_ms
    );
  end if;
  if v_upload.status <> 'uploading' then
    raise exception using errcode = 'P0001', message = 'attachment_upload_not_finalizable';
  end if;
  if v_upload.expires_at <= now() then
    update public.messaging_attachment_uploads
    set status = 'expired', updated_at = now()
    where id = v_upload.id;
    raise exception using errcode = 'P0001', message = 'attachment_upload_expired';
  end if;

  select object.* into v_object
  from storage.objects object
  where object.bucket_id = v_upload.storage_bucket
    and object.name = v_upload.storage_path;
  if not found then
    raise exception using errcode = 'P0002', message = 'attachment_storage_object_missing';
  end if;

  begin
    v_actual_size := nullif(v_object.metadata ->> 'size', '')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'attachment_storage_metadata_invalid';
  end;
  v_actual_mime := lower(split_part(trim(coalesce(
    v_object.metadata ->> 'mimetype',
    v_object.metadata ->> 'contentType',
    ''
  )), ';', 1));

  if v_actual_size is null or v_actual_size <> v_upload.expected_size_bytes then
    raise exception using errcode = '22023', message = 'attachment_size_mismatch';
  end if;
  if v_actual_mime <> v_upload.expected_mime_type
     or public.messaging_attachment_media_type_v1(
       v_upload.purpose, v_actual_mime
     ) is null then
    raise exception using errcode = '22023', message = 'attachment_mime_mismatch';
  end if;
  if v_upload.purpose = 'voice_note'
     and (p_duration_ms is null or p_duration_ms <= 0 or p_duration_ms > 600000) then
    raise exception using errcode = '22023', message = 'voice_note_duration_limit';
  end if;

  update public.messaging_attachment_uploads
  set actual_mime_type = v_actual_mime,
      actual_size_bytes = v_actual_size,
      duration_ms = p_duration_ms,
      -- This is a client claim retained for later server verification. Storage
      -- metadata validates the upload contract, not the file bytes themselves.
      checksum_sha256 = nullif(v_checksum, ''),
      status = 'ready',
      finalized_at = now(),
      updated_at = now()
  where id = v_upload.id
  returning * into v_upload;

  update public.media_files
  set mime_type = v_actual_mime,
      file_size = v_actual_size::integer,
      size_bytes = v_actual_size,
      duration_ms = p_duration_ms,
      checksum_sha256 = null,
      status = 'ready',
      visibility = 'private',
      is_public = false,
      published_at = null,
      scheduled_at = null,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'messaging_validation', 'storage_metadata_only',
          'client_checksum_sha256', nullif(v_checksum, '')
        ))
  where id = v_upload.media_file_id
    and user_id = v_user_id
    and source_pillar = 'messaging';

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'upload_id', v_upload.id,
    'media_file_id', v_upload.media_file_id, 'status', v_upload.status,
    'mime_type', v_upload.actual_mime_type,
    'size_bytes', v_upload.actual_size_bytes,
    'duration_ms', v_upload.duration_ms
  );
end;
$$;

create or replace function public.discard_messaging_upload_v1(
  p_upload_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload public.messaging_attachment_uploads%rowtype;
  v_was_discarded boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select upload.* into v_upload
  from public.messaging_attachment_uploads upload
  where upload.id = p_upload_id
    and upload.owner_profile_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'attachment_upload_not_found';
  end if;
  if v_upload.status = 'attached'
     or exists (
       select 1 from public.messaging_message_attachments attachment
       where attachment.upload_id = v_upload.id
     )
     or exists (
       select 1 from public.collaboration_request_attachments attachment
       where attachment.upload_id = v_upload.id
     ) then
    raise exception using errcode = '42501', message = 'attached_upload_cannot_be_discarded';
  end if;

  v_was_discarded := v_upload.status = 'discarded';
  if v_upload.status <> 'discarded' then
    update public.messaging_attachment_uploads
    set status = 'discarded', discarded_at = now(), updated_at = now()
    where id = v_upload.id
    returning * into v_upload;

    update public.media_files
    set status = 'archived', visibility = 'private', is_public = false,
        deleted_at = coalesce(deleted_at, now())
    where id = v_upload.media_file_id
      and user_id = v_user_id
      and source_pillar = 'messaging';
  end if;

  -- A client may remove the object immediately through the Storage API, but the
  -- durable server cleanup outbox owns eventual deletion. SQL never deletes
  -- storage.objects directly, which would leave the physical blob orphaned.
  return jsonb_build_object(
    'ok', true,
    'idempotent', v_was_discarded,
    'upload_id', v_upload.id,
    'bucket', v_upload.storage_bucket,
    'path', v_upload.storage_path,
    'status', v_upload.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic message send with structured content and private attachments.
-- `send_message_v1` remains unchanged for existing Web/iOS text clients.
-- ---------------------------------------------------------------------------

create or replace function public.send_message_v2(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_kind text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_attachments jsonb default '[]'::jsonb,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_manifest_hash text;
  v_attachment_count integer;
  v_total_size bigint := 0;
  v_index integer;
  v_entry jsonb;
  v_upload_id uuid;
  v_upload_ids uuid[] := '{}'::uuid[];
  v_sort_order integer;
  v_sort_orders integer[] := '{}'::integer[];
  v_role text;
  v_label text;
  v_metadata jsonb;
  v_bpm integer;
  v_musical_key text;
  v_upload public.messaging_attachment_uploads%rowtype;
  v_media_type text;
  v_existing public.messaging_messages%rowtype;
  v_result jsonb;
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_conversation_id is null or p_client_message_id is null then
    raise exception using errcode = '22023', message = 'message_identity_required';
  end if;
  if v_kind not in ('text', 'brief', 'image', 'video', 'audio', 'file', 'track_pack') then
    raise exception using errcode = '22023', message = 'unsupported_message_kind';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid_message_body';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
     or octet_length(v_payload::text) > 8192 then
    raise exception using errcode = '22023', message = 'invalid_message_payload';
  end if;
  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
  end if;

  v_attachment_count := jsonb_array_length(v_attachments);
  if v_attachment_count > 8 then
    raise exception using errcode = '22023', message = 'message_attachment_limit';
  end if;
  if v_kind in ('text', 'brief') and v_attachment_count <> 0 then
    raise exception using errcode = '22023', message = 'message_kind_rejects_attachments';
  elsif v_kind in ('image', 'video', 'audio') and v_attachment_count <> 1 then
    raise exception using errcode = '22023', message = 'message_kind_requires_one_attachment';
  elsif v_kind in ('file', 'track_pack') and v_attachment_count not between 1 and 8 then
    raise exception using errcode = '22023', message = 'message_kind_requires_attachments';
  end if;

  if v_kind = 'brief' then
    if coalesce((v_payload ->> 'schema_version')::integer, 0) <> 1 then
      raise exception using errcode = '22023', message = 'invalid_brief_schema';
    end if;
    if v_payload ? 'style_key'
       and char_length(trim(coalesce(v_payload ->> 'style_key', ''))) not between 1 and 40 then
      raise exception using errcode = '22023', message = 'invalid_brief_style';
    end if;
    if v_payload ? 'bpm'
       and (v_payload ->> 'bpm')::integer not between 20 and 300 then
      raise exception using errcode = '22023', message = 'invalid_brief_bpm';
    end if;
  end if;
  if v_kind = 'track_pack'
     and coalesce((v_payload ->> 'schema_version')::integer, 0) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_track_pack_schema';
  end if;

  v_manifest_hash := encode(digest(v_attachments::text, 'sha256'), 'hex');

  -- The sender-scoped lock is the same concurrency boundary as Phase A.
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:sender:' || v_user_id::text,
    0
  ));

  select message.* into v_existing
  from public.messaging_messages message
  where message.sender_profile_id = v_user_id
    and message.client_message_id = p_client_message_id;
  if found then
    if v_existing.conversation_id <> p_conversation_id
       or v_existing.kind <> v_kind
       or coalesce(v_existing.body, '') <> v_body
       or v_existing.payload <> v_payload
       or v_existing.reply_to_message_id is distinct from p_reply_to_message_id
       or coalesce(
         v_existing.attachment_manifest_hash,
         encode(digest('[]'::jsonb::text, 'sha256'), 'hex')
       ) <> v_manifest_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'message_id', v_existing.id,
      'sequence', v_existing.sequence,
      'created_at', v_existing.created_at,
      'kind', v_kind,
      'attachment_count', v_attachment_count
    );
  end if;

  if v_attachment_count > 0 then
    for v_index in 0..v_attachment_count - 1 loop
      v_entry := v_attachments -> v_index;
      if jsonb_typeof(v_entry) <> 'object' then
        raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
      end if;
      begin
        v_upload_id := (v_entry ->> 'upload_id')::uuid;
        v_sort_order := coalesce((v_entry ->> 'sort_order')::integer, v_index);
        v_bpm := nullif(v_entry ->> 'bpm', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
      end;
      if v_upload_id is null
         or v_sort_order not between 0 and 7
         or v_upload_id = any(v_upload_ids)
         or v_sort_order = any(v_sort_orders) then
        raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
      end if;
      if v_bpm is not null and v_bpm not between 20 and 300 then
        raise exception using errcode = '22023', message = 'invalid_attachment_bpm';
      end if;
      v_musical_key := nullif(trim(coalesce(v_entry ->> 'musical_key', '')), '');
      if v_musical_key is not null and char_length(v_musical_key) > 24 then
        raise exception using errcode = '22023', message = 'invalid_attachment_key';
      end if;
      v_label := nullif(regexp_replace(
        trim(coalesce(v_entry ->> 'label', '')), '[[:cntrl:]/\\]+', '_', 'g'
      ), '');
      if v_label is not null and char_length(v_label) > 180 then
        raise exception using errcode = '22023', message = 'invalid_attachment_label';
      end if;
      v_metadata := coalesce(v_entry -> 'metadata', '{}'::jsonb);
      if jsonb_typeof(v_metadata) <> 'object'
         or octet_length(v_metadata::text) > 4096 then
        raise exception using errcode = '22023', message = 'invalid_attachment_metadata';
      end if;

      select upload.* into v_upload
      from public.messaging_attachment_uploads upload
      where upload.id = v_upload_id
        and upload.owner_profile_id = v_user_id
      for update;
      if not found
         or v_upload.conversation_id is distinct from p_conversation_id then
        raise exception using errcode = 'P0002', message = 'attachment_upload_not_found';
      end if;
      if v_upload.status <> 'ready'
         or v_upload.expires_at <= now()
         or v_upload.media_file_id is null then
        raise exception using errcode = 'P0001', message = 'attachment_upload_not_ready';
      end if;

      v_role := lower(trim(coalesce(v_entry ->> 'role', case
        when v_upload.purpose = 'track_stem' then 'stem'
        when v_upload.purpose = 'document' then 'document'
        else 'primary'
      end)));
      if (v_kind = 'image' and v_upload.purpose <> 'image')
         or (v_kind = 'video' and v_upload.purpose <> 'video')
         or (v_kind = 'audio' and v_upload.purpose not in ('audio', 'voice_note'))
         or (v_kind = 'file' and v_upload.purpose <> 'document')
         or (v_kind = 'track_pack' and v_upload.purpose <> 'track_stem') then
        raise exception using errcode = '22023', message = 'attachment_kind_mismatch';
      end if;
      if (v_kind = 'track_pack' and v_role <> 'stem')
         or (v_kind = 'file' and v_role <> 'document')
         or (v_kind in ('image', 'video', 'audio') and v_role <> 'primary') then
        raise exception using errcode = '22023', message = 'attachment_role_mismatch';
      end if;

      v_upload_ids := array_append(v_upload_ids, v_upload_id);
      v_sort_orders := array_append(v_sort_orders, v_sort_order);
      v_total_size := v_total_size + coalesce(v_upload.actual_size_bytes, 0);
    end loop;
  end if;

  if v_kind = 'track_pack' and v_total_size > 209715200::bigint then
    raise exception using errcode = '22023', message = 'track_pack_total_size_limit';
  end if;

  -- Phase A owns the battle-tested membership, block, rate and sequence logic.
  -- Its text insert is updated to the requested structured kind before commit.
  v_result := public.send_message_v1(
    p_conversation_id,
    p_client_message_id,
    'text',
    v_body,
    v_payload,
    p_reply_to_message_id
  );
  v_message_id := (v_result ->> 'message_id')::uuid;

  update public.messaging_messages
  set kind = v_kind,
      body = v_body,
      payload = v_payload,
      attachment_manifest_hash = v_manifest_hash,
      updated_at = now()
  where id = v_message_id
    and sender_profile_id = v_user_id;

  if v_attachment_count > 0 then
    for v_index in 0..v_attachment_count - 1 loop
      v_entry := v_attachments -> v_index;
      v_upload_id := (v_entry ->> 'upload_id')::uuid;
      v_sort_order := coalesce((v_entry ->> 'sort_order')::integer, v_index);
      v_bpm := nullif(v_entry ->> 'bpm', '')::integer;
      v_musical_key := nullif(trim(coalesce(v_entry ->> 'musical_key', '')), '');
      v_label := nullif(regexp_replace(
        trim(coalesce(v_entry ->> 'label', '')), '[[:cntrl:]/\\]+', '_', 'g'
      ), '');
      v_metadata := coalesce(v_entry -> 'metadata', '{}'::jsonb);

      select upload.* into strict v_upload
      from public.messaging_attachment_uploads upload
      where upload.id = v_upload_id;
      v_media_type := public.messaging_attachment_media_type_v1(
        v_upload.purpose, v_upload.actual_mime_type
      );
      v_role := lower(trim(coalesce(v_entry ->> 'role', case
        when v_upload.purpose = 'track_stem' then 'stem'
        when v_upload.purpose = 'document' then 'document'
        else 'primary'
      end)));

      insert into public.messaging_message_attachments (
        message_id, upload_id, media_file_id, sort_order, attachment_role,
        purpose_snapshot, media_type_snapshot, display_name_snapshot,
        mime_type_snapshot, size_bytes_snapshot, duration_ms_snapshot,
        bpm, musical_key, label, metadata
      ) values (
        v_message_id, v_upload.id, v_upload.media_file_id, v_sort_order, v_role,
        v_upload.purpose, v_media_type, v_upload.display_name,
        v_upload.actual_mime_type, v_upload.actual_size_bytes,
        v_upload.duration_ms, v_bpm, v_musical_key, v_label, v_metadata
      );

      update public.messaging_attachment_uploads
      set status = 'attached', attached_at = now(), updated_at = now()
      where id = v_upload.id;
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'kind', v_kind,
    'attachment_count', v_attachment_count
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'invalid_structured_message_payload';
end;
$$;

-- Attach a prepared batch to a collaboration request. Request creation remains
-- owned by the existing Globe/Messaging workflow; this idempotent step is safe
-- to retry and never allows the recipient to attach the sender's files.
create or replace function public.attach_collaboration_uploads_v1(
  p_request_id uuid,
  p_attachments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_manifest_hash text;
  v_existing_key public.messaging_idempotency_keys%rowtype;
  v_request public.collaboration_requests%rowtype;
  v_count integer;
  v_index integer;
  v_entry jsonb;
  v_upload_id uuid;
  v_upload_ids uuid[] := '{}'::uuid[];
  v_upload public.messaging_attachment_uploads%rowtype;
  v_media_type text;
  v_label text;
  v_metadata jsonb;
  v_bpm integer;
  v_musical_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'collaboration_request_required';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
  end if;
  v_count := jsonb_array_length(v_attachments);
  if v_count not between 1 and 3 then
    raise exception using errcode = '22023', message = 'collaboration_attachment_limit';
  end if;
  v_manifest_hash := encode(digest(v_attachments::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:collab-attachments:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));
  select ledger.* into v_existing_key
  from public.messaging_idempotency_keys ledger
  where ledger.profile_id = v_user_id
    and ledger.operation = 'attach_collaboration_uploads'
    and ledger.idempotency_key = v_idempotency_key;
  if found then
    if v_existing_key.result_id <> p_request_id
       or v_existing_key.request_hash <> v_manifest_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'request_id', p_request_id, 'attachment_count', v_count
    );
  end if;

  select request.* into v_request
  from public.collaboration_requests request
  where request.id = p_request_id
    and request.sender_profile_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'collaboration_request_not_found';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'collaboration_request_already_resolved';
  end if;
  if public.messaging_profiles_blocked_v1(
    v_request.sender_profile_id, v_request.recipient_profile_id
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  if exists (
    select 1 from public.collaboration_request_attachments attachment
    where attachment.request_id = p_request_id
  ) then
    raise exception using errcode = '23505', message = 'collaboration_attachments_already_set';
  end if;

  for v_index in 0..v_count - 1 loop
    v_entry := v_attachments -> v_index;
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
    end if;
    begin
      v_upload_id := (v_entry ->> 'upload_id')::uuid;
      v_bpm := nullif(v_entry ->> 'bpm', '')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
    end;
    if v_upload_id is null or v_upload_id = any(v_upload_ids) then
      raise exception using errcode = '22023', message = 'invalid_attachment_manifest';
    end if;
    if v_bpm is not null and v_bpm not between 20 and 300 then
      raise exception using errcode = '22023', message = 'invalid_attachment_bpm';
    end if;
    v_musical_key := nullif(trim(coalesce(v_entry ->> 'musical_key', '')), '');
    if v_musical_key is not null and char_length(v_musical_key) > 24 then
      raise exception using errcode = '22023', message = 'invalid_attachment_key';
    end if;
    v_label := nullif(regexp_replace(
      trim(coalesce(v_entry ->> 'label', '')), '[[:cntrl:]/\\]+', '_', 'g'
    ), '');
    if v_label is not null and char_length(v_label) > 180 then
      raise exception using errcode = '22023', message = 'invalid_attachment_label';
    end if;
    v_metadata := coalesce(v_entry -> 'metadata', '{}'::jsonb);
    if jsonb_typeof(v_metadata) <> 'object'
       or octet_length(v_metadata::text) > 4096 then
      raise exception using errcode = '22023', message = 'invalid_attachment_metadata';
    end if;

    select upload.* into v_upload
    from public.messaging_attachment_uploads upload
    where upload.id = v_upload_id
      and upload.owner_profile_id = v_user_id
    for update;
    if not found
       or v_upload.collaboration_recipient_profile_id
          is distinct from v_request.recipient_profile_id then
      raise exception using errcode = 'P0002', message = 'attachment_upload_not_found';
    end if;
    if v_upload.status <> 'ready'
       or v_upload.expires_at <= now()
       or v_upload.media_file_id is null
       or v_upload.purpose = 'track_stem' then
      raise exception using errcode = 'P0001', message = 'attachment_upload_not_ready';
    end if;

    v_media_type := public.messaging_attachment_media_type_v1(
      v_upload.purpose, v_upload.actual_mime_type
    );
    insert into public.collaboration_request_attachments (
      request_id, upload_id, media_file_id, sort_order,
      purpose_snapshot, media_type_snapshot, display_name_snapshot,
      mime_type_snapshot, size_bytes_snapshot, duration_ms_snapshot,
      bpm, musical_key, label, metadata
    ) values (
      p_request_id, v_upload.id, v_upload.media_file_id, v_index,
      v_upload.purpose, v_media_type, v_upload.display_name,
      v_upload.actual_mime_type, v_upload.actual_size_bytes,
      v_upload.duration_ms, v_bpm, v_musical_key, v_label, v_metadata
    );
    update public.messaging_attachment_uploads
    set status = 'attached', attached_at = now(), updated_at = now()
    where id = v_upload.id;
    v_upload_ids := array_append(v_upload_ids, v_upload_id);
  end loop;

  insert into public.messaging_idempotency_keys (
    profile_id, operation, idempotency_key, request_hash, result_id
  ) values (
    v_user_id, 'attach_collaboration_uploads', v_idempotency_key,
    v_manifest_hash, p_request_id
  );

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'request_id', p_request_id, 'attachment_count', v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Safe read projections. Paths are returned only after participant checks and
-- are signed in-memory by the authenticated Storage SDK, never persisted.
-- ---------------------------------------------------------------------------

create or replace function public.get_conversation_messages_v2(
  p_conversation_id uuid,
  p_before_sequence bigint default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_profile_id uuid,
  client_message_id uuid,
  sequence bigint,
  kind text,
  body text,
  payload jsonb,
  reply_to_message_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status text,
  reactions jsonb,
  attachments jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    message.id,
    message.conversation_id,
    message.sender_profile_id,
    message.client_message_id,
    message.sequence,
    message.kind,
    message.body,
    message.payload,
    message.reply_to_message_id,
    message.edited_at,
    message.deleted_at,
    message.moderation_status,
    message.reactions,
    case when message.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'attachment_id', attachment.id,
        'media_file_id', attachment.media_file_id,
        'available', attachment.media_file_id is not null,
        'sort_order', attachment.sort_order,
        'role', attachment.attachment_role,
        'purpose', attachment.purpose_snapshot,
        'media_type', attachment.media_type_snapshot,
        'display_name', attachment.display_name_snapshot,
        'mime_type', attachment.mime_type_snapshot,
        'size_bytes', attachment.size_bytes_snapshot,
        'duration_ms', attachment.duration_ms_snapshot,
        'bpm', attachment.bpm,
        'musical_key', attachment.musical_key,
        'label', attachment.label,
        'metadata', attachment.metadata,
        'storage_bucket', case when attachment.media_file_id is not null
          then upload.storage_bucket else null end,
        'storage_path', case when attachment.media_file_id is not null
          then upload.storage_path else null end
      ) order by attachment.sort_order, attachment.id)
      from public.messaging_message_attachments attachment
      left join public.messaging_attachment_uploads upload
        on upload.id = attachment.upload_id
      where attachment.message_id = message.id
    ), '[]'::jsonb) end,
    message.created_at,
    message.updated_at
  from public.get_conversation_messages_v1(
    p_conversation_id, p_before_sequence, p_limit
  ) message;
$$;

create or replace function public.list_my_collaboration_requests_v2(
  p_scope text default 'received',
  p_statuses text[] default null,
  p_cursor jsonb default null,
  p_limit integer default 30
)
returns table (
  request_id uuid,
  direction text,
  status text,
  message text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  responded_at timestamptz,
  conversation_id uuid,
  viewed_at timestamptz,
  is_unread boolean,
  can_accept boolean,
  can_decline boolean,
  can_cancel boolean,
  relationship_blocked boolean,
  other_profile_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_avatar_style_key text,
  other_primary_role_key text,
  other_city text,
  other_country_code text,
  other_is_verified boolean,
  other_grade_level smallint,
  other_grade_code text,
  other_grade_label text,
  other_grade_visual_key text,
  attachments jsonb,
  page_cursor jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    request.request_id,
    request.direction,
    request.status,
    request.message,
    request.source,
    request.created_at,
    request.updated_at,
    request.responded_at,
    request.conversation_id,
    request.viewed_at,
    request.is_unread,
    request.can_accept,
    request.can_decline,
    request.can_cancel,
    request.relationship_blocked,
    request.other_profile_id,
    request.other_username,
    request.other_display_name,
    request.other_avatar_url,
    request.other_avatar_style_key,
    request.other_primary_role_key,
    request.other_city,
    request.other_country_code,
    request.other_is_verified,
    request.other_grade_level,
    request.other_grade_code,
    request.other_grade_label,
    request.other_grade_visual_key,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'attachment_id', attachment.id,
        'media_file_id', attachment.media_file_id,
        'available', attachment.media_file_id is not null,
        'sort_order', attachment.sort_order,
        'purpose', attachment.purpose_snapshot,
        'media_type', attachment.media_type_snapshot,
        'display_name', attachment.display_name_snapshot,
        'mime_type', attachment.mime_type_snapshot,
        'size_bytes', attachment.size_bytes_snapshot,
        'duration_ms', attachment.duration_ms_snapshot,
        'bpm', attachment.bpm,
        'musical_key', attachment.musical_key,
        'label', attachment.label,
        'metadata', attachment.metadata,
        'storage_bucket', case when attachment.media_file_id is not null
          then upload.storage_bucket else null end,
        'storage_path', case when attachment.media_file_id is not null
          then upload.storage_path else null end
      ) order by attachment.sort_order, attachment.id)
      from public.collaboration_request_attachments attachment
      left join public.messaging_attachment_uploads upload
        on upload.id = attachment.upload_id
      where attachment.request_id = request.request_id
    ), '[]'::jsonb),
    request.page_cursor
  from public.list_my_collaboration_requests_v1(
    p_scope, p_statuses, p_cursor, p_limit
  ) request;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants and stable public surface.
-- ---------------------------------------------------------------------------

drop trigger if exists messaging_attachment_uploads_touch_updated_at
  on public.messaging_attachment_uploads;
create trigger messaging_attachment_uploads_touch_updated_at
before update on public.messaging_attachment_uploads
for each row execute function public.meewav_touch_updated_at();

drop trigger if exists messaging_attachment_cleanup_jobs_touch_updated_at
  on public.messaging_attachment_cleanup_jobs;
create trigger messaging_attachment_cleanup_jobs_touch_updated_at
before update on public.messaging_attachment_cleanup_jobs
for each row execute function public.meewav_touch_updated_at();

alter table public.messaging_attachment_uploads enable row level security;
alter table public.messaging_message_attachments enable row level security;
alter table public.collaboration_request_attachments enable row level security;
alter table public.messaging_attachment_cleanup_jobs enable row level security;

revoke all on public.messaging_attachment_uploads from anon, authenticated;
revoke all on public.messaging_message_attachments from anon, authenticated;
revoke all on public.collaboration_request_attachments from anon, authenticated;
revoke all on public.messaging_attachment_cleanup_jobs from anon, authenticated;
grant all on public.messaging_attachment_uploads,
  public.messaging_message_attachments,
  public.collaboration_request_attachments,
  public.messaging_attachment_cleanup_jobs to service_role;

revoke all on function public.prepare_messaging_upload_v1(
  uuid, text, text, text, bigint, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.prepare_messaging_upload_v1(
  uuid, text, text, text, bigint, uuid, uuid
) to authenticated, service_role;

revoke all on function public.finalize_messaging_upload_v1(
  uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.finalize_messaging_upload_v1(
  uuid, integer, text
) to authenticated, service_role;

revoke all on function public.discard_messaging_upload_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.discard_messaging_upload_v1(uuid)
  to authenticated, service_role;

revoke all on function public.send_message_v2(
  uuid, uuid, text, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.send_message_v2(
  uuid, uuid, text, text, jsonb, jsonb, uuid
) to authenticated, service_role;

revoke all on function public.attach_collaboration_uploads_v1(
  uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.attach_collaboration_uploads_v1(
  uuid, jsonb, text
) to authenticated, service_role;

revoke all on function public.get_conversation_messages_v2(
  uuid, bigint, integer
) from public, anon, authenticated;
grant execute on function public.get_conversation_messages_v2(
  uuid, bigint, integer
) to authenticated, service_role;

revoke all on function public.list_my_collaboration_requests_v2(
  text, text[], jsonb, integer
) from public, anon, authenticated;
grant execute on function public.list_my_collaboration_requests_v2(
  text, text[], jsonb, integer
) to authenticated, service_role;

-- Storage policies invoke these safe booleans under caller RLS. They expose
-- no row contents and therefore may be executable by authenticated clients.
revoke all on function public.messaging_can_upload_storage_object_v1(text)
  from public, anon, authenticated;
grant execute on function public.messaging_can_upload_storage_object_v1(text)
  to authenticated, service_role;
revoke all on function public.messaging_can_read_storage_object_v1(text)
  from public, anon, authenticated;
grant execute on function public.messaging_can_read_storage_object_v1(text)
  to authenticated, service_role;
revoke all on function public.messaging_can_delete_storage_object_v1(text)
  from public, anon, authenticated;
grant execute on function public.messaging_can_delete_storage_object_v1(text)
  to authenticated, service_role;

revoke all on function public.messaging_attachment_max_bytes_v1(text)
  from public, anon, authenticated;
revoke all on function public.messaging_attachment_quota_v1(text)
  from public, anon, authenticated;
revoke all on function public.messaging_attachment_media_type_v1(text, text)
  from public, anon, authenticated;
revoke all on function public.messaging_attachment_extension_v1(text)
  from public, anon, authenticated;
revoke all on function public.messaging_media_is_attached_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.guard_attached_messaging_media_v1()
  from public, anon, authenticated;
revoke all on function public.enforce_messaging_media_privacy_v1()
  from public, anon, authenticated;
revoke all on function public.queue_messaging_attachment_cleanup_v1()
  from public, anon, authenticated;

revoke all on function public.expire_messaging_attachment_uploads_v1(integer)
  from public, anon, authenticated;
grant execute on function public.expire_messaging_attachment_uploads_v1(integer)
  to service_role;
revoke all on function public.claim_messaging_attachment_cleanup_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_messaging_attachment_cleanup_v1(integer)
  to service_role;
revoke all on function public.complete_messaging_attachment_cleanup_v1(
  uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_messaging_attachment_cleanup_v1(
  uuid, boolean, text
) to service_role;

comment on table public.messaging_attachment_uploads is
  'One-hour private Storage reservation shared by Web and iOS Messaging clients.';
comment on table public.messaging_message_attachments is
  'Immutable message-to-media role links with deletion-safe participant snapshots.';
comment on table public.collaboration_request_attachments is
  'Participant-only collaboration attachment links with deletion-safe snapshots.';
comment on table public.messaging_attachment_cleanup_jobs is
  'Durable server-only outbox. A trusted worker deletes terminal Messaging blobs through the Storage API; clients never own cleanup correctness.';
comment on column public.messaging_attachment_uploads.checksum_sha256 is
  'Unverified client checksum claim retained for a future trusted scanner; never used to publish Messaging media.';
comment on function public.send_message_v2(
  uuid, uuid, text, text, jsonb, jsonb, uuid
) is 'Idempotent structured Messaging send. Validates and attaches only finalized owner uploads in the same conversation.';

commit;
