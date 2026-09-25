-- Private, direct-to-Storage ingestion for the normalized Wave v3 aggregate.
--
-- This migration deliberately does not create a second Wave domain. An upload
-- reserves a wave_loop_submissions_v3 row and a wave_audio_assets_v3 row. Only
-- the isolated processing worker may promote the verified asset to an immutable
-- wave_loop_versions_v3 row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-wave-private',
  'room-wave-private',
  false,
  52428800,
  array[
    'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mpeg', 'audio/mp4',
    'audio/aac', 'audio/ogg', 'audio/webm'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.wave_categories_v3
  add column if not exists accepting_submissions boolean not null default true;

-- Upload provenance is captured even when the richer v5 rules/reference
-- registry is deployed later. v5 adds the rules-revision foreign keys; the
-- integer rules version remains a durable fallback for staged deployments.
alter table public.wave_loop_submissions_v3
  add column if not exists based_on_beat_revision_id uuid
    references public.wave_beat_revisions_v3(id) on delete restrict,
  add column if not exists based_on_rules_revision_id uuid,
  add column if not exists based_on_rules_version integer check (based_on_rules_version is null or based_on_rules_version > 0);

alter table public.wave_loop_versions_v3
  add column if not exists based_on_beat_revision_id uuid
    references public.wave_beat_revisions_v3(id) on delete restrict,
  add column if not exists based_on_rules_revision_id uuid,
  add column if not exists based_on_rules_version integer check (based_on_rules_version is null or based_on_rules_version > 0);

create table if not exists public.wave_ingestion_policy_v4 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  max_asset_bytes bigint not null default 52428800 check (max_asset_bytes between 1024 and 1073741824),
  max_active_uploads integer not null default 20 check (max_active_uploads between 1 and 500),
  max_active_uploads_per_contributor integer not null default 1
    check (max_active_uploads_per_contributor between 1 and 20),
  ticket_rate_window_seconds integer not null default 600 check (ticket_rate_window_seconds between 30 and 86400),
  ticket_rate_limit integer not null default 5 check (ticket_rate_limit between 1 and 100),
  upload_ttl_seconds integer not null default 600 check (upload_ttl_seconds between 60 and 7200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_asset_uploads_v4 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  submission_id uuid not null references public.wave_loop_submissions_v3(id) on delete cascade,
  target_version_number integer not null check (target_version_number > 0),
  asset_id uuid not null unique references public.wave_audio_assets_v3(id) on delete restrict,
  category_id uuid not null references public.wave_categories_v3(id) on delete restrict,
  requested_slot_id uuid references public.wave_slots_v3(id) on delete set null,
  reservation_id uuid,
  based_on_beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  based_on_rules_revision_id uuid,
  based_on_rules_version integer not null check (based_on_rules_version > 0),
  purpose text not null check (purpose in ('LOOP_ORIGINAL', 'LOOP_CORRECTION', 'HOST_BASE_LOOP')),
  original_file_name text not null check (
    length(btrim(original_file_name)) between 1 and 255
    and original_file_name !~ '[\\/[:cntrl:]]'
  ),
  claimed_mime_type text not null check (claimed_mime_type like 'audio/%' and length(claimed_mime_type) <= 128),
  expected_byte_size bigint not null check (expected_byte_size between 1 and 1073741824),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'room-wave-private'
    check (storage_bucket = 'room-wave-private'),
  storage_path text not null unique check (
    storage_path ~ '^sessions/[0-9a-f-]{36}/assets/[0-9a-f-]{36}/[0-9a-f]{32}\.blob$'
  ),
  terms_version text not null check (length(btrim(terms_version)) between 1 and 128),
  terms_accepted_at timestamptz not null,
  state text not null default 'AWAITING_UPLOAD' check (
    state in (
      'AWAITING_UPLOAD', 'UPLOADED', 'VERIFYING', 'PROCESSING', 'READY',
      'REJECTED', 'PROCESSING_FAILED', 'EXPIRED'
    )
  ),
  progress_percent numeric(5,2) check (progress_percent is null or progress_percent between 0 and 100),
  observed_byte_size bigint check (observed_byte_size is null or observed_byte_size >= 0),
  observed_mime_type text,
  observed_etag text,
  analysis_id uuid references public.wave_loop_analysis_v3(id) on delete set null,
  playback_asset_id uuid references public.wave_audio_assets_v3(id) on delete set null,
  preview_asset_id uuid references public.wave_audio_assets_v3(id) on delete set null,
  waveform_asset_id uuid references public.wave_audio_assets_v3(id) on delete set null,
  failure_code text check (failure_code is null or length(failure_code) between 1 and 100),
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  correlation_id text not null check (length(correlation_id) between 1 and 256),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, actor_id, idempotency_key),
  check (expires_at > created_at),
  check (terms_accepted_at <= created_at + interval '5 minutes')
);

create table if not exists public.wave_asset_derivatives_v4 (
  asset_id uuid primary key references public.wave_audio_assets_v3(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  source_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  derivative_kind text not null check (
    derivative_kind in ('ORIGINAL', 'PLAYBACK_DERIVATIVE', 'PREVIEW_DERIVATIVE', 'WAVEFORM')
  ),
  state text not null default 'AWAITING_UPLOAD' check (
    state in ('AWAITING_UPLOAD', 'PROCESSING', 'READY', 'FAILED')
  ),
  target_sample_rate integer check (target_sample_rate is null or target_sample_rate = 48000),
  target_channels integer check (target_channels is null or target_channels = 2),
  target_codec text check (target_codec is null or length(target_codec) between 1 and 80),
  artifact_role text not null default 'GENERAL' check (
    artifact_role in (
      'GENERAL', 'SOURCE_ORIGINAL', 'PLAYBACK_CANONICAL', 'LIGHT_PREVIEW',
      'WAVEFORM', 'VOTE_PREVIEW', 'PRIVATE_AUDITION',
      'PRODUCTION_REFERENCE_STUDIO', 'PRODUCTION_REFERENCE_LIGHT'
    )
  ),
  access_scope text not null default 'SERVICE' check (
    access_scope in ('SERVICE', 'HOST', 'AUTHORIZED_CONTRIBUTOR', 'ELIGIBLE_VOTER')
  ),
  temporal_exact boolean not null default false,
  loudness_standard text check (loudness_standard is null or loudness_standard in ('ITU-R_BS.1770', 'EBU_R128')),
  integrated_lufs numeric(6,2),
  true_peak_dbfs numeric(6,2),
  comparison_duration_ms integer check (comparison_duration_ms is null or comparison_duration_ms > 0),
  comparison_context_hash text check (
    comparison_context_hash is null or length(comparison_context_hash) between 16 and 256
  ),
  retention_state text not null default 'ACTIVE' check (
    retention_state in ('ACTIVE', 'ELIGIBLE', 'QUEUED', 'DELETING', 'DELETED', 'LEGAL_HOLD')
  ),
  retention_until timestamptz,
  legal_hold_reason text,
  deleted_at timestamptz,
  worker_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (derivative_kind = 'ORIGINAL' and source_asset_id is null)
    or (derivative_kind <> 'ORIGINAL' and source_asset_id is not null)
  ),
  check (
    derivative_kind = 'ORIGINAL'
    or (target_sample_rate = 48000 and target_channels = 2 and target_codec is not null)
  ),
  check (
    artifact_role <> 'VOTE_PREVIEW'
    or (
      temporal_exact and loudness_standard is not null and integrated_lufs is not null
      and true_peak_dbfs is not null and comparison_duration_ms is not null
      and comparison_context_hash is not null
    )
  ),
  check (
    artifact_role not in ('PRODUCTION_REFERENCE_STUDIO', 'PRODUCTION_REFERENCE_LIGHT')
    or (temporal_exact and access_scope in ('HOST', 'AUTHORIZED_CONTRIBUTOR'))
  ),
  check ((retention_state = 'LEGAL_HOLD') = (legal_hold_reason is not null)),
  check ((retention_state = 'DELETED') = (deleted_at is not null))
);

create table if not exists public.wave_asset_retention_v4 (
  asset_id uuid primary key references public.wave_audio_assets_v3(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  state text not null default 'ACTIVE' check (
    state in ('ACTIVE', 'ELIGIBLE', 'QUEUED', 'DELETING', 'DELETED', 'LEGAL_HOLD')
  ),
  policy_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(policy_snapshot) = 'object' and pg_column_size(policy_snapshot) <= 32768),
  earliest_delete_at timestamptz,
  reason text,
  legal_hold_reason text,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'LEGAL_HOLD') = (legal_hold_reason is not null)),
  check ((state = 'DELETED') = (storage_deleted_at is not null)),
  check (state not in ('ELIGIBLE', 'QUEUED', 'DELETING') or earliest_delete_at is not null)
);

create index if not exists wave_asset_derivative_source_v4
on public.wave_asset_derivatives_v4(source_asset_id, derivative_kind);

create or replace function public.rooms_wave_guard_asset_derivative_v4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.wave_audio_assets_v3%rowtype;
  v_source public.wave_audio_assets_v3%rowtype;
begin
  select * into v_asset from public.wave_audio_assets_v3 asset where asset.id = new.asset_id;
  if not found or v_asset.session_id <> new.session_id then
    raise exception using errcode = '23514', message = 'wave_derivative_asset_scope_invalid';
  end if;
  if new.source_asset_id is not null then
    select * into v_source from public.wave_audio_assets_v3 asset where asset.id = new.source_asset_id;
    if not found or v_source.session_id <> new.session_id then
      raise exception using errcode = '23514', message = 'wave_derivative_source_scope_invalid';
    end if;
  end if;
  if new.artifact_role = 'SOURCE_ORIGINAL'
     and (new.derivative_kind <> 'ORIGINAL' or v_asset.kind <> 'ORIGINAL') then
    raise exception using errcode = '23514', message = 'wave_original_lineage_invalid';
  end if;
  if new.artifact_role = 'PLAYBACK_CANONICAL'
     and new.derivative_kind <> 'PLAYBACK_DERIVATIVE' then
    raise exception using errcode = '23514', message = 'wave_playback_lineage_invalid';
  end if;
  if new.artifact_role in ('LIGHT_PREVIEW', 'VOTE_PREVIEW', 'PRIVATE_AUDITION', 'PRODUCTION_REFERENCE_LIGHT')
     and new.derivative_kind <> 'PREVIEW_DERIVATIVE' then
    raise exception using errcode = '23514', message = 'wave_preview_lineage_invalid';
  end if;
  if new.artifact_role = 'WAVEFORM' and new.derivative_kind <> 'WAVEFORM' then
    raise exception using errcode = '23514', message = 'wave_waveform_lineage_invalid';
  end if;
  if new.artifact_role = 'PRODUCTION_REFERENCE_STUDIO'
     and v_asset.mime_type not in ('audio/wav', 'audio/x-wav', 'audio/flac') then
    raise exception using errcode = '23514', message = 'wave_production_reference_studio_format_invalid';
  end if;
  if new.artifact_role = 'PRODUCTION_REFERENCE_LIGHT'
     and v_asset.mime_type not in ('audio/mpeg', 'audio/aac', 'audio/mp4', 'audio/ogg', 'audio/webm') then
    raise exception using errcode = '23514', message = 'wave_production_reference_light_format_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists wave_asset_derivative_guard_v4 on public.wave_asset_derivatives_v4;
create trigger wave_asset_derivative_guard_v4
before insert or update on public.wave_asset_derivatives_v4
for each row execute function public.rooms_wave_guard_asset_derivative_v4();

create unique index if not exists wave_asset_upload_one_active_per_submission_v4
on public.wave_asset_uploads_v4(submission_id)
where state in ('AWAITING_UPLOAD', 'UPLOADED', 'VERIFYING', 'PROCESSING');

create index if not exists wave_asset_upload_actor_rate_v4
on public.wave_asset_uploads_v4(session_id, actor_id, created_at desc);

create index if not exists wave_asset_upload_status_v4
on public.wave_asset_uploads_v4(session_id, state, created_at);

create table if not exists public.wave_asset_processing_outbox_v4 (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.wave_asset_uploads_v4(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  asset_id uuid not null references public.wave_audio_assets_v3(id) on delete restrict,
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'DEAD')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  leased_by text,
  leased_at timestamptz,
  last_error_code text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 32768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((state = 'PROCESSING') = (lease_token is not null and leased_at is not null and leased_by is not null)),
  check ((state = 'SUCCEEDED') = (completed_at is not null))
);

create table if not exists public.wave_asset_gc_outbox_v4 (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.wave_audio_assets_v3(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'DEAD')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  next_attempt_at timestamptz not null,
  lease_token uuid,
  leased_by text,
  leased_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((state = 'PROCESSING') = (lease_token is not null and leased_at is not null and leased_by is not null)),
  check ((state = 'SUCCEEDED') = (completed_at is not null))
);

create index if not exists wave_asset_gc_due_v4
on public.wave_asset_gc_outbox_v4(next_attempt_at, created_at)
where state in ('PENDING', 'RETRY', 'PROCESSING');

create table if not exists public.wave_asset_command_receipts_v4 (
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  command_name text not null check (length(command_name) between 1 and 80),
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key(session_id, actor_id, command_name, idempotency_key),
  check (expires_at > created_at)
);

create table if not exists public.wave_private_auditions_v4 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  candidate_version_id uuid not null references public.wave_loop_versions_v3(id) on delete restrict,
  reference_beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  mode text not null check (mode in ('SOLO', 'WITH_BEAT')),
  state text not null check (state in ('PREPARING', 'READY', 'FAILED', 'NOT_CONFIGURED')),
  preview_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  failure_code text,
  correlation_id text not null check (length(correlation_id) between 1 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, candidate_version_id, reference_beat_revision_id, mode),
  check ((state = 'READY') = (preview_asset_id is not null))
);

create table if not exists public.wave_private_audition_outbox_v4 (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null unique references public.wave_private_auditions_v4(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'DEAD')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  leased_at timestamptz,
  leased_by text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((state = 'PROCESSING') = (lease_token is not null and leased_at is not null and leased_by is not null)),
  check ((state = 'SUCCEEDED') = (completed_at is not null))
);

create index if not exists wave_private_audition_due_v4
on public.wave_private_audition_outbox_v4(next_attempt_at, created_at)
where state in ('PENDING', 'RETRY', 'PROCESSING');

create index if not exists wave_asset_processing_due_v4
on public.wave_asset_processing_outbox_v4(next_attempt_at, created_at)
where state in ('PENDING', 'RETRY', 'PROCESSING');

create or replace function public.rooms_wave_upload_status_v4(p_upload public.wave_asset_uploads_v4)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'waveId', p_upload.session_id,
    'uploadId', p_upload.id,
    'assetId', p_upload.asset_id,
    'state', p_upload.state,
    'progressPercent', p_upload.progress_percent,
    'analysisId', p_upload.analysis_id,
    'previewAssetId', p_upload.preview_asset_id,
    'waveformAssetId', p_upload.waveform_asset_id,
    'failureCode', p_upload.failure_code,
    'updatedAt', p_upload.updated_at
  );
$$;

create or replace function public.rooms_wave_request_asset_upload_v4(
  p_session_id uuid,
  p_purpose text,
  p_category_code text,
  p_file_name text,
  p_byte_size bigint,
  p_claimed_mime_type text,
  p_sha256 text,
  p_terms_version text,
  p_terms_accepted_at timestamptz,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.wave_actor_id', true), '')::uuid);
  v_session public.wave_sessions_v3%rowtype;
  v_category public.wave_categories_v3%rowtype;
  v_policy public.wave_ingestion_policy_v4%rowtype;
  v_existing public.wave_asset_uploads_v4%rowtype;
  v_upload public.wave_asset_uploads_v4%rowtype;
  v_submission public.wave_loop_submissions_v3%rowtype;
  v_asset_id uuid := gen_random_uuid();
  v_upload_id uuid := gen_random_uuid();
  v_slot_id uuid;
  v_request_hash text;
  v_storage_path text;
  v_credit_name text;
  v_title text;
  v_active_count integer;
  v_actor_active_count integer;
  v_recent_count integer;
  v_submission_count integer;
  v_max_submissions integer := 1;
  v_is_control boolean;
  v_target_version integer := 1;
  v_active_rules_revision_id uuid;
  v_reservation_token uuid;
  v_reservation_id uuid;
  v_consumed_reservation_id uuid;
  v_reserved_slot_id uuid;
  v_reserved_category_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_purpose not in ('LOOP_ORIGINAL', 'LOOP_CORRECTION', 'HOST_BASE_LOOP') then
    raise exception using errcode = '22023', message = 'wave_upload_purpose_invalid';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'wave_upload_idempotency_invalid';
  end if;
  if p_file_name is null or length(btrim(p_file_name)) not between 1 and 255
     or p_file_name ~ '[\\/[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'wave_upload_filename_invalid';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_claimed_mime_type is null or p_claimed_mime_type not like 'audio/%' then
    raise exception using errcode = '22023', message = 'wave_upload_metadata_invalid';
  end if;
  if p_terms_version is null or length(btrim(p_terms_version)) not between 1 and 128
     or p_terms_accepted_at is null or p_terms_accepted_at > now() + interval '5 minutes'
     or p_terms_accepted_at < now() - interval '7 days' then
    raise exception using errcode = '22023', message = 'wave_upload_consent_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text || ':' || v_actor::text || ':wave-upload', 0));

  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_upload_forbidden';
  end if;
  if p_purpose = 'LOOP_ORIGINAL' then
    begin
      v_reservation_token := nullif(current_setting('app.wave_reservation_token', true), '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'wave_slot_reservation_token_invalid';
    end;
    if v_reservation_token is null then
      raise exception using errcode = '42501', message = 'wave_slot_reservation_required';
    end if;
    execute $reservation$
      select reservation.id, reservation.slot_id, reservation.category_id
      from public.wave_slot_reservations_v5 reservation
      where reservation.reservation_token = $1
        and reservation.session_id = $2
        and reservation.contributor_id = $3
        and (
          (reservation.status = 'RESERVED' and reservation.expires_at > now())
          or (
            reservation.status = 'CONSUMED'
            and exists (
              select 1
              from public.wave_asset_uploads_v4 upload
              where upload.reservation_id = reservation.id
                and upload.session_id = $2
                and upload.actor_id = $3
                and upload.idempotency_key = $4
                and upload.state = 'AWAITING_UPLOAD'
                and upload.expires_at > now()
            )
          )
        )
      for update
    $reservation$ into v_reservation_id, v_reserved_slot_id, v_reserved_category_id
      using v_reservation_token, p_session_id, v_actor, p_idempotency_key;
    if v_reservation_id is null then
      raise exception using errcode = '55000', message = 'wave_slot_reservation_expired';
    end if;
  end if;
  v_is_control := public.rooms_wave_is_control_v3(p_session_id, v_actor);
  if p_purpose = 'HOST_BASE_LOOP' and not v_is_control then
    raise exception using errcode = '42501', message = 'wave_host_base_control_required';
  end if;
  if p_purpose = 'HOST_BASE_LOOP' then
    if v_session.status not in ('READY', 'LIVE') then
      raise exception using errcode = '55000', message = 'wave_host_base_upload_closed';
    end if;
  elsif v_session.status <> 'LIVE' then
    raise exception using errcode = '55000', message = 'wave_submissions_not_live';
  end if;
  if p_purpose <> 'HOST_BASE_LOOP' and v_session.current_beat_revision_id is null then
    raise exception using errcode = '55000', message = 'wave_production_reference_required';
  end if;

  -- v5 owns the immutable rules revision registry. Dynamic lookup keeps v4
  -- independently deployable while capturing the UUID whenever v5 is present.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wave_sessions_v3'
      and column_name = 'active_rules_revision_id'
  ) then
    execute 'select active_rules_revision_id from public.wave_sessions_v3 where id = $1'
      into v_active_rules_revision_id using p_session_id;
  end if;

  -- Reclaim stale ticket reservations before enforcing active-upload and
  -- per-submission uniqueness. Physical late objects remain untrusted and are
  -- collected separately by the private Storage GC worker.
  update public.wave_asset_uploads_v4
  set state = 'EXPIRED', failure_code = 'UPLOAD_TICKET_EXPIRED', updated_at = now()
  where session_id = p_session_id and actor_id = v_actor
    and state = 'AWAITING_UPLOAD' and expires_at <= now();
  update public.wave_audio_assets_v3 asset
  set status = 'FAILED', updated_at = now()
  where asset.id in (
    select upload.asset_id from public.wave_asset_uploads_v4 upload
    where upload.session_id = p_session_id and upload.actor_id = v_actor
      and upload.state = 'EXPIRED' and upload.failure_code = 'UPLOAD_TICKET_EXPIRED'
  ) and asset.status = 'UPLOADING';
  update public.wave_asset_derivatives_v4 derivative
  set state = 'FAILED', updated_at = now()
  where derivative.asset_id in (
    select upload.asset_id from public.wave_asset_uploads_v4 upload
    where upload.session_id = p_session_id and upload.actor_id = v_actor
      and upload.state = 'EXPIRED' and upload.failure_code = 'UPLOAD_TICKET_EXPIRED'
  ) and derivative.state = 'AWAITING_UPLOAD';
  update public.wave_loop_submissions_v3 submission
  set status = 'REMOVED', status_reason = 'UPLOAD_TICKET_EXPIRED',
      removed_at = now(), updated_at = now()
  where submission.status = 'UPLOADING' and submission.id in (
    select upload.submission_id from public.wave_asset_uploads_v4 upload
    where upload.session_id = p_session_id and upload.actor_id = v_actor
      and upload.state = 'EXPIRED' and upload.failure_code = 'UPLOAD_TICKET_EXPIRED'
  );

  select * into v_category
  from public.wave_categories_v3 category
  where category.session_id = p_session_id and category.code = lower(btrim(p_category_code));
  if not found then raise exception using errcode = '22023', message = 'wave_category_unknown'; end if;
  if v_reservation_id is not null and v_reserved_category_id <> v_category.id then
    raise exception using errcode = '22023', message = 'wave_slot_reservation_category_mismatch';
  end if;
  if not v_category.accepting_submissions then
    raise exception using errcode = '55000', message = 'wave_category_closed';
  end if;
  if not (p_claimed_mime_type = any(v_session.accepted_mime_types)) then
    raise exception using errcode = '22023', message = 'wave_mime_not_allowed';
  end if;

  insert into public.wave_ingestion_policy_v4(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  select * into v_policy from public.wave_ingestion_policy_v4 where session_id = p_session_id for update;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > v_policy.max_asset_bytes then
    raise exception using errcode = '22023', message = 'wave_asset_too_large';
  end if;

  v_request_hash := md5(concat_ws(':', p_session_id, p_purpose, lower(btrim(p_category_code)),
    p_file_name, p_byte_size, p_claimed_mime_type, p_sha256, p_terms_version, p_terms_accepted_at,
    v_session.current_beat_revision_id, v_session.rules_version, v_active_rules_revision_id));
  select * into v_existing
  from public.wave_asset_uploads_v4 upload
  where upload.session_id = p_session_id and upload.actor_id = v_actor
    and upload.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'wave_upload_idempotency_conflict';
    end if;
    if v_existing.state = 'EXPIRED' or v_existing.expires_at <= now() then
      raise exception using errcode = '55000', message = 'wave_upload_ticket_expired';
    end if;
    if v_existing.state <> 'AWAITING_UPLOAD' then
      raise exception using errcode = '55000', message = 'wave_upload_ticket_already_consumed';
    end if;
    return jsonb_build_object(
      'uploadId', v_existing.id,
      'assetId', v_existing.asset_id,
      'objectKey', v_existing.storage_path,
      'expiresAt', v_existing.expires_at,
      'maxBytes', v_policy.max_asset_bytes,
      'claimedMimeType', v_existing.claimed_mime_type,
      'state', v_existing.state
    );
  end if;

  select count(*) into v_recent_count
  from public.wave_asset_uploads_v4 upload
  where upload.session_id = p_session_id and upload.actor_id = v_actor
    and upload.created_at >= now() - make_interval(secs => v_policy.ticket_rate_window_seconds);
  if v_recent_count >= v_policy.ticket_rate_limit then
    raise exception using errcode = '42900', message = 'wave_upload_rate_limited';
  end if;
  select count(*) into v_active_count from public.wave_asset_uploads_v4 upload
  where upload.session_id = p_session_id
    and upload.state in ('AWAITING_UPLOAD', 'UPLOADED', 'VERIFYING', 'PROCESSING')
    and upload.expires_at > now();
  if v_active_count >= v_policy.max_active_uploads then
    raise exception using errcode = '53300', message = 'wave_submission_slots_full';
  end if;
  select count(*) into v_actor_active_count from public.wave_asset_uploads_v4 upload
  where upload.session_id = p_session_id and upload.actor_id = v_actor
    and upload.state in ('AWAITING_UPLOAD', 'UPLOADED', 'VERIFYING', 'PROCESSING')
    and upload.expires_at > now();
  if v_actor_active_count >= v_policy.max_active_uploads_per_contributor then
    raise exception using errcode = '53300', message = 'wave_contributor_upload_already_active';
  end if;

  select max(allowance.max_submissions) into v_max_submissions
  from public.wave_submission_allowances_v3 allowance
  where allowance.session_id = p_session_id and allowance.contributor_id = v_actor
    and allowance.revoked_at is null and (allowance.expires_at is null or allowance.expires_at > now())
    and (allowance.category_id is null or allowance.category_id = v_category.id);
  if v_max_submissions is null then
    if v_is_control then
      v_max_submissions := 100;
    else
      raise exception using errcode = '42501', message = 'wave_contributor_not_authorized';
    end if;
  end if;

  if v_reservation_id is not null then
    v_slot_id := v_reserved_slot_id;
  else
    select slot.id into v_slot_id
    from public.wave_slots_v3 slot
    where slot.session_id = p_session_id and slot.category_id = v_category.id and slot.state = 'OPEN'
    order by slot.slot_index limit 1;
  end if;
  if v_slot_id is null then
    raise exception using errcode = '53300', message = 'wave_category_has_no_open_slot';
  end if;

  if p_purpose = 'LOOP_CORRECTION' then
    select * into v_submission
    from public.wave_loop_submissions_v3 submission
    where submission.session_id = p_session_id and submission.category_id = v_category.id
      and submission.contributor_id = v_actor
      and submission.status in ('NEEDS_CORRECTION', 'PROCESSING_FAILED')
    order by submission.updated_at desc limit 1 for update;
    if not found then
      raise exception using errcode = '22023', message = 'wave_correction_target_required';
    end if;
    v_target_version := v_submission.current_version_number + 1;
  else
    select count(*) into v_submission_count
    from public.wave_loop_submissions_v3 submission
    where submission.session_id = p_session_id and submission.contributor_id = v_actor
      and submission.status not in ('NOT_SELECTED', 'REJECTED', 'SUPERSEDED', 'REMOVED', 'PROCESSING_FAILED');
    if p_purpose <> 'HOST_BASE_LOOP' and v_submission_count >= v_max_submissions then
      raise exception using errcode = '53300', message = 'wave_submission_quota_reached';
    end if;
    select coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(profile.username), ''), 'Membre Wave')
      into v_credit_name from public.profiles profile where profile.id = v_actor;
    v_credit_name := coalesce(v_credit_name, 'Membre Wave');
    v_title := regexp_replace(p_file_name, '\.[^.]+$', '');
    if length(btrim(v_title)) = 0 then v_title := 'Boucle Wave'; end if;
    insert into public.wave_loop_submissions_v3(
      id, session_id, category_id, requested_slot_id, contributor_id, credit_name, title, status,
      based_on_beat_revision_id, based_on_rules_revision_id, based_on_rules_version
    ) values (
      gen_random_uuid(), p_session_id, v_category.id, v_slot_id, v_actor,
      left(v_credit_name, 120), left(v_title, 160), 'UPLOADING',
      v_session.current_beat_revision_id, v_active_rules_revision_id, v_session.rules_version
    ) returning * into v_submission;
    insert into public.wave_rights_consents_v3(
      session_id, submission_id, contributor_id, status, terms_version, consent_scope, evidence, accepted_at
    ) values (
      p_session_id, v_submission.id, v_actor, 'GRANTED', left(p_terms_version, 80),
      'WAVE_CONTRIBUTION_UPLOAD_AND_LIVE_PREVIEW',
      jsonb_build_object('uploadId', v_upload_id, 'purpose', p_purpose, 'sha256', p_sha256),
      p_terms_accepted_at
    );
  end if;

  v_storage_path := 'sessions/' || p_session_id || '/assets/' || v_asset_id || '/'
    || replace(gen_random_uuid()::text, '-', '') || '.blob';
  insert into public.wave_audio_assets_v3(
    id, session_id, owner_id, kind, status, storage_bucket, storage_path, mime_type,
    byte_size, sha256, metadata
  ) values (
    v_asset_id, p_session_id, v_actor, 'ORIGINAL', 'UPLOADING', 'room-wave-private', v_storage_path,
    p_claimed_mime_type, p_byte_size, p_sha256,
    jsonb_build_object('uploadId', v_upload_id, 'purpose', p_purpose, 'unverified', true)
  );
  insert into public.wave_asset_derivatives_v4(
    asset_id, session_id, source_asset_id, derivative_kind, state,
    artifact_role, access_scope, temporal_exact
  ) values (
    v_asset_id, p_session_id, null, 'ORIGINAL', 'AWAITING_UPLOAD',
    'SOURCE_ORIGINAL', 'SERVICE', true
  );
  insert into public.wave_asset_retention_v4(
    asset_id, session_id, state, policy_snapshot
  ) values (
    v_asset_id, p_session_id, 'ACTIVE',
    jsonb_build_object(
      'policy', 'RIGHTS_GOVERNED', 'termsVersion', p_terms_version,
      'createdFrom', 'UPLOAD_TICKET_V4', 'rulesVersion', v_session.rules_version
    )
  );

  insert into public.wave_asset_uploads_v4(
    id, session_id, actor_id, submission_id, target_version_number, asset_id, category_id,
    requested_slot_id, reservation_id, based_on_beat_revision_id, based_on_rules_revision_id,
    based_on_rules_version, purpose, original_file_name, claimed_mime_type, expected_byte_size,
    expected_sha256, storage_path, terms_version, terms_accepted_at, idempotency_key,
    request_hash, correlation_id, expires_at
  ) values (
    v_upload_id, p_session_id, v_actor, v_submission.id, v_target_version, v_asset_id, v_category.id,
    v_slot_id, v_reservation_id, v_session.current_beat_revision_id, v_active_rules_revision_id, v_session.rules_version,
    p_purpose, p_file_name, p_claimed_mime_type, p_byte_size, p_sha256,
    v_storage_path, p_terms_version, p_terms_accepted_at, p_idempotency_key,
    v_request_hash, coalesce(nullif(p_correlation_id, ''), gen_random_uuid()::text),
    now() + make_interval(secs => v_policy.upload_ttl_seconds)
  ) returning * into v_upload;

  if v_reservation_id is not null then
    execute $consume$
      update public.wave_slot_reservations_v5
      set status = 'CONSUMED', consumed_submission_id = $1
      where id = $2 and status = 'RESERVED'
      returning id
    $consume$ into v_consumed_reservation_id using v_submission.id, v_reservation_id;
    if v_consumed_reservation_id is null then
      raise exception using errcode = '40001', message = 'wave_slot_reservation_concurrent_use';
    end if;
    with allowance as (
      select id from public.wave_submission_allowances_v3
      where session_id = p_session_id and contributor_id = v_actor
        and revoked_at is null and (expires_at is null or expires_at > now())
        and (category_id is null or category_id = v_category.id)
        and used_submissions < max_submissions
      order by category_id nulls last limit 1 for update
    )
    update public.wave_submission_allowances_v3 target
    set used_submissions = target.used_submissions + 1
    from allowance where target.id = allowance.id;
    if not found then
      raise exception using errcode = '40001', message = 'wave_submission_allowance_concurrent_use';
    end if;
  end if;

  perform public.rooms_wave_append_event_v3(
    p_session_id, 'submission.created', v_actor, 'submission', v_submission.id,
    jsonb_build_object('categoryId', v_category.id, 'status', 'UPLOADING'), v_upload.correlation_id
  );

  return jsonb_build_object(
    'uploadId', v_upload.id,
    'assetId', v_upload.asset_id,
    'objectKey', v_upload.storage_path,
    'expiresAt', v_upload.expires_at,
    'maxBytes', v_policy.max_asset_bytes,
    'claimedMimeType', v_upload.claimed_mime_type,
    'state', v_upload.state
  );
end;
$$;

create or replace function public.rooms_wave_confirm_asset_upload_v4(
  p_session_id uuid,
  p_upload_id uuid,
  p_asset_id uuid,
  p_byte_size bigint,
  p_sha256 text,
  p_observed_byte_size bigint,
  p_observed_mime_type text,
  p_observed_etag text,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.wave_actor_id', true), '')::uuid);
  v_upload public.wave_asset_uploads_v4%rowtype;
  v_existing public.wave_asset_command_receipts_v4%rowtype;
  v_request_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 200
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'wave_upload_confirmation_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_upload_id::text || ':wave-confirm', 0));
  select * into v_upload from public.wave_asset_uploads_v4 upload
  where upload.id = p_upload_id and upload.session_id = p_session_id and upload.asset_id = p_asset_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_upload_not_found'; end if;
  if v_upload.actor_id <> v_actor and not public.rooms_wave_is_control_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_upload_confirmation_forbidden';
  end if;

  v_request_hash := md5(concat_ws(':', p_upload_id, p_asset_id, p_byte_size, p_sha256,
    p_observed_byte_size, p_observed_mime_type, p_observed_etag));
  select * into v_existing from public.wave_asset_command_receipts_v4 receipt
  where receipt.session_id = p_session_id and receipt.actor_id = v_actor
    and receipt.command_name = 'confirm_asset_upload_v4' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'wave_upload_confirmation_idempotency_conflict';
    end if;
    return v_existing.result;
  end if;

  if v_upload.state <> 'AWAITING_UPLOAD' then
    raise exception using errcode = '55000', message = 'wave_upload_not_awaiting_confirmation';
  end if;
  if v_upload.expires_at <= now() then
    update public.wave_asset_uploads_v4 set state = 'EXPIRED', failure_code = 'UPLOAD_TICKET_EXPIRED', updated_at = now()
    where id = v_upload.id returning * into v_upload;
    update public.wave_audio_assets_v3 set status = 'FAILED', updated_at = now() where id = v_upload.asset_id;
    update public.wave_loop_submissions_v3 set status = 'REMOVED', status_reason = 'UPLOAD_TICKET_EXPIRED', removed_at = now()
    where id = v_upload.submission_id and status = 'UPLOADING';
    raise exception using errcode = '55000', message = 'wave_upload_ticket_expired';
  end if;
  if p_byte_size <> v_upload.expected_byte_size or p_sha256 <> v_upload.expected_sha256
     or p_observed_byte_size is null or p_observed_byte_size <> v_upload.expected_byte_size then
    raise exception using errcode = '22023', message = 'wave_upload_object_size_mismatch';
  end if;

  update public.wave_asset_uploads_v4
  set state = 'PROCESSING', progress_percent = 0, observed_byte_size = p_observed_byte_size,
      observed_mime_type = nullif(p_observed_mime_type, ''), observed_etag = nullif(p_observed_etag, ''),
      confirmed_at = now(), updated_at = now(), correlation_id = coalesce(nullif(p_correlation_id, ''), correlation_id)
  where id = v_upload.id returning * into v_upload;
  update public.wave_audio_assets_v3
  set status = 'PROCESSING', byte_size = p_observed_byte_size,
      metadata = metadata || jsonb_build_object('storageConfirmedAt', now(), 'storageMimeType', p_observed_mime_type,
        'unverified', true), updated_at = now()
  where id = v_upload.asset_id;
  update public.wave_asset_derivatives_v4
  set state = 'PROCESSING', updated_at = now() where asset_id = v_upload.asset_id;
  update public.wave_loop_submissions_v3 set status = 'PROCESSING'
  where id = v_upload.submission_id and status in ('UPLOADING', 'PROCESSING_FAILED', 'NEEDS_CORRECTION');

  insert into public.wave_asset_processing_outbox_v4(upload_id, session_id, asset_id, payload)
  values (
    v_upload.id, v_upload.session_id, v_upload.asset_id,
    jsonb_build_object('submissionId', v_upload.submission_id, 'targetVersionNumber', v_upload.target_version_number,
      'storageBucket', v_upload.storage_bucket, 'storagePath', v_upload.storage_path,
      'expectedSha256', v_upload.expected_sha256, 'expectedByteSize', v_upload.expected_byte_size)
  ) on conflict (upload_id) do nothing;

  perform public.rooms_wave_append_event_v3(
    p_session_id, 'submission.processing', v_actor, 'submission', v_upload.submission_id,
    jsonb_build_object('status', 'PROCESSING'),
    v_upload.correlation_id
  );
  v_result := public.rooms_wave_upload_status_v4(v_upload);
  insert into public.wave_asset_command_receipts_v4(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_session_id, v_actor, 'confirm_asset_upload_v4', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_wave_get_asset_processing_status_v4(
  p_session_id uuid,
  p_asset_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_upload public.wave_asset_uploads_v4%rowtype;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select * into v_upload from public.wave_asset_uploads_v4 upload
  where upload.session_id = p_session_id and upload.asset_id = p_asset_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_asset_not_found'; end if;
  if v_upload.actor_id <> v_actor and not public.rooms_wave_is_control_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_asset_status_forbidden';
  end if;
  return public.rooms_wave_upload_status_v4(v_upload);
end;
$$;

create or replace function public.rooms_wave_request_private_audition_v4(
  p_session_id uuid,
  p_candidate_version_id uuid,
  p_reference_beat_revision_id uuid,
  p_mode text,
  p_render_available boolean,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_candidate record;
  v_session public.wave_sessions_v3%rowtype;
  v_audition public.wave_private_auditions_v4%rowtype;
  v_preview_asset_id uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if not public.rooms_wave_is_control_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_private_audition_control_required';
  end if;
  if p_mode not in ('SOLO', 'WITH_BEAT') then
    raise exception using errcode = '22023', message = 'wave_private_audition_mode_invalid';
  end if;
  select * into v_session from public.wave_sessions_v3 session where session.id = p_session_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if v_session.current_beat_revision_id <> p_reference_beat_revision_id then
    raise exception using errcode = '55000', message = 'wave_private_audition_reference_stale';
  end if;
  select version.id, version.audio_asset_id, version.version_number, submission.current_version_number,
    submission.status into v_candidate
  from public.wave_loop_versions_v3 version
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  where version.id = p_candidate_version_id and submission.session_id = p_session_id;
  if not found or v_candidate.version_number <> v_candidate.current_version_number
     or v_candidate.status in ('REJECTED', 'SUPERSEDED', 'REMOVED', 'PROCESSING_FAILED') then
    raise exception using errcode = '55000', message = 'wave_private_audition_candidate_invalid';
  end if;

  if p_mode = 'SOLO' then
    select preview.id into v_preview_asset_id
    from public.wave_asset_derivatives_v4 playback_lineage
    join public.wave_asset_derivatives_v4 preview_lineage
      on preview_lineage.source_asset_id = playback_lineage.asset_id
     and preview_lineage.derivative_kind = 'PREVIEW_DERIVATIVE' and preview_lineage.state = 'READY'
    join public.wave_audio_assets_v3 preview on preview.id = preview_lineage.asset_id
    join public.wave_asset_retention_v4 retention on retention.asset_id = preview.id
    where playback_lineage.source_asset_id = v_candidate.audio_asset_id
      and playback_lineage.derivative_kind = 'PLAYBACK_DERIVATIVE'
      and playback_lineage.state = 'READY' and playback_lineage.artifact_role = 'PLAYBACK_CANONICAL'
      and preview_lineage.artifact_role = 'LIGHT_PREVIEW'
      and preview.status = 'READY' and retention.state in ('ACTIVE', 'LEGAL_HOLD')
    order by preview.created_at desc limit 1;
  end if;

  insert into public.wave_private_auditions_v4(
    session_id, requested_by, candidate_version_id, reference_beat_revision_id,
    mode, state, preview_asset_id, correlation_id
  ) values (
    p_session_id, v_actor, p_candidate_version_id, p_reference_beat_revision_id, p_mode,
    case when v_preview_asset_id is not null then 'READY'
         when p_render_available then 'PREPARING'
         else 'NOT_CONFIGURED' end,
    v_preview_asset_id, coalesce(nullif(p_correlation_id, ''), gen_random_uuid()::text)
  )
  on conflict (session_id, candidate_version_id, reference_beat_revision_id, mode)
  do update set
    requested_by = excluded.requested_by,
    preview_asset_id = coalesce(
      public.wave_private_auditions_v4.preview_asset_id,
      excluded.preview_asset_id
    ),
    state = case
      when public.wave_private_auditions_v4.state = 'READY' then 'READY'
      when excluded.state = 'READY' then 'READY'
      when excluded.state = 'PREPARING' then 'PREPARING'
      else 'NOT_CONFIGURED'
    end,
    failure_code = null,
    correlation_id = excluded.correlation_id,
    updated_at = now()
  returning * into v_audition;

  if v_audition.state = 'PREPARING' then
    insert into public.wave_private_audition_outbox_v4(audition_id, session_id)
    values (v_audition.id, p_session_id)
    on conflict (audition_id) do update
      set state = 'PENDING', attempt_count = 0, next_attempt_at = now(),
          lease_token = null, leased_at = null, leased_by = null,
          last_error_code = null, completed_at = null, updated_at = now()
      where public.wave_private_audition_outbox_v4.state in ('DEAD', 'SUCCEEDED');
  end if;
  return jsonb_build_object(
    'waveId', p_session_id,
    'requestId', v_audition.id,
    'candidateVersionId', p_candidate_version_id,
    'referenceBeatRevisionId', p_reference_beat_revision_id,
    'mode', p_mode,
    'state', v_audition.state,
    'previewAssetId', v_audition.preview_asset_id,
    'updatedAt', v_audition.updated_at
  );
end;
$$;

create or replace function public.rooms_wave_claim_private_auditions_v4(
  p_worker_id text,
  p_limit integer default 1
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  audition_id uuid,
  session_id uuid,
  candidate_version_id uuid,
  candidate_original_asset_id uuid,
  candidate_playback_asset_id uuid,
  reference_beat_revision_id uuid,
  reference_render_asset_id uuid,
  audition_mode text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_audition_worker_required';
  end if;
  if p_worker_id is null or length(btrim(p_worker_id)) not between 3 and 120
     or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'wave_audition_claim_invalid';
  end if;

  return query
  with candidates as (
    select job.id
    from public.wave_private_audition_outbox_v4 job
    join public.wave_private_auditions_v4 audition on audition.id = job.audition_id
    where audition.state = 'PREPARING' and (
      (job.state in ('PENDING', 'RETRY') and job.next_attempt_at <= now())
      or (job.state = 'PROCESSING' and job.leased_at < now() - interval '5 minutes')
    )
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.wave_private_audition_outbox_v4 job
    set state = 'PROCESSING', attempt_count = job.attempt_count + 1,
        lease_token = gen_random_uuid(), leased_by = p_worker_id,
        leased_at = now(), updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.lease_token, audition.id, audition.session_id,
    audition.candidate_version_id, version.audio_asset_id,
    playback.asset_id, audition.reference_beat_revision_id,
    revision.render_asset_id, audition.mode
  from claimed
  join public.wave_private_auditions_v4 audition on audition.id = claimed.audition_id
  join public.wave_loop_versions_v3 version on version.id = audition.candidate_version_id
  join public.wave_beat_revisions_v3 revision on revision.id = audition.reference_beat_revision_id
  left join lateral (
    select lineage.asset_id
    from public.wave_asset_derivatives_v4 lineage
    join public.wave_audio_assets_v3 asset on asset.id = lineage.asset_id
    where lineage.source_asset_id = version.audio_asset_id
      and lineage.derivative_kind = 'PLAYBACK_DERIVATIVE'
      and lineage.state = 'READY' and asset.status = 'READY'
    order by lineage.created_at desc
    limit 1
  ) playback on true;
end;
$$;

create or replace function public.rooms_wave_complete_private_audition_v4(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_preview_asset_id uuid default null,
  p_failure_code text default null,
  p_worker_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.wave_private_audition_outbox_v4%rowtype;
  v_audition public.wave_private_auditions_v4%rowtype;
  v_session public.wave_sessions_v3%rowtype;
  v_candidate_original_asset_id uuid;
  v_candidate_playback_asset_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_audition_worker_required';
  end if;
  select * into v_job
  from public.wave_private_audition_outbox_v4 job
  where job.id = p_outbox_id and job.state = 'PROCESSING' and job.lease_token = p_lease_token
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'wave_audition_lease_invalid';
  end if;
  select * into v_audition
  from public.wave_private_auditions_v4 audition
  where audition.id = v_job.audition_id
  for update;
  select * into v_session
  from public.wave_sessions_v3 session
  where session.id = v_audition.session_id
  for update;

  if not p_succeeded then
    update public.wave_private_audition_outbox_v4
    set state = case when attempt_count >= 5 then 'DEAD' else 'RETRY' end,
        next_attempt_at = now() + make_interval(secs => least(900, 15 * (2 ^ least(attempt_count, 6))::integer)),
        lease_token = null, leased_by = null, leased_at = null,
        last_error_code = coalesce(nullif(p_failure_code, ''), 'AUDITION_RENDER_FAILED'),
        updated_at = now()
    where id = v_job.id;
    if v_job.attempt_count >= 5 then
      update public.wave_private_auditions_v4
      set state = 'FAILED', preview_asset_id = null,
          failure_code = coalesce(nullif(p_failure_code, ''), 'AUDITION_RENDER_FAILED'),
          updated_at = now()
      where id = v_audition.id
      returning * into v_audition;
    end if;
    return jsonb_build_object(
      'waveId', v_audition.session_id, 'requestId', v_audition.id,
      'candidateVersionId', v_audition.candidate_version_id,
      'referenceBeatRevisionId', v_audition.reference_beat_revision_id,
      'mode', v_audition.mode, 'state', v_audition.state,
      'previewAssetId', v_audition.preview_asset_id,
      'failureCode', v_audition.failure_code, 'updatedAt', v_audition.updated_at
    );
  end if;

  if p_worker_version is null or length(btrim(p_worker_version)) not between 3 and 120 then
    raise exception using errcode = '22023', message = 'wave_audition_worker_evidence_required';
  end if;
  if v_session.current_beat_revision_id is distinct from v_audition.reference_beat_revision_id then
    update public.wave_private_auditions_v4
    set state = 'FAILED', preview_asset_id = null, failure_code = 'REFERENCE_REVISION_CHANGED', updated_at = now()
    where id = v_audition.id returning * into v_audition;
    update public.wave_private_audition_outbox_v4
    set state = 'SUCCEEDED', completed_at = now(), lease_token = null, leased_by = null,
        leased_at = null, last_error_code = 'REFERENCE_REVISION_CHANGED', updated_at = now()
    where id = v_job.id;
    return jsonb_build_object(
      'waveId', v_audition.session_id, 'requestId', v_audition.id,
      'candidateVersionId', v_audition.candidate_version_id,
      'referenceBeatRevisionId', v_audition.reference_beat_revision_id,
      'mode', v_audition.mode, 'state', v_audition.state,
      'previewAssetId', null, 'failureCode', v_audition.failure_code,
      'updatedAt', v_audition.updated_at
    );
  end if;

  select version.audio_asset_id into v_candidate_original_asset_id
  from public.wave_loop_versions_v3 version
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  where version.id = v_audition.candidate_version_id
    and submission.session_id = v_audition.session_id;
  select lineage.asset_id into v_candidate_playback_asset_id
  from public.wave_asset_derivatives_v4 lineage
  join public.wave_audio_assets_v3 asset on asset.id = lineage.asset_id
  where lineage.source_asset_id = v_candidate_original_asset_id
    and lineage.derivative_kind = 'PLAYBACK_DERIVATIVE'
    and lineage.state = 'READY' and asset.status = 'READY'
  order by lineage.created_at desc limit 1;

  if p_preview_asset_id is null or v_candidate_playback_asset_id is null or not exists (
    select 1
    from public.wave_audio_assets_v3 asset
    join public.wave_asset_derivatives_v4 lineage on lineage.asset_id = asset.id
    join public.wave_asset_retention_v4 retention on retention.asset_id = asset.id
    where asset.id = p_preview_asset_id
      and asset.session_id = v_audition.session_id
      and asset.storage_bucket = 'room-wave-private'
      and asset.kind in ('PREVIEW', 'RENDER') and asset.status = 'READY'
      and asset.source_asset_id = v_candidate_playback_asset_id
      and lineage.derivative_kind = 'PREVIEW_DERIVATIVE'
      and lineage.source_asset_id = v_candidate_playback_asset_id
      and lineage.state = 'READY'
      and lineage.artifact_role = 'PRIVATE_AUDITION' and lineage.temporal_exact
      and lineage.target_sample_rate = 48000 and lineage.target_channels = 2
      and retention.state in ('ACTIVE', 'LEGAL_HOLD')
      and asset.metadata->>'auditionId' = v_audition.id::text
      and asset.metadata->>'candidateVersionId' = v_audition.candidate_version_id::text
      and asset.metadata->>'referenceBeatRevisionId' = v_audition.reference_beat_revision_id::text
  ) then
    raise exception using errcode = '23514', message = 'wave_audition_preview_derivative_invalid';
  end if;

  update public.wave_private_auditions_v4
  set state = 'READY', preview_asset_id = p_preview_asset_id,
      failure_code = null, updated_at = now()
  where id = v_audition.id returning * into v_audition;
  update public.wave_private_audition_outbox_v4
  set state = 'SUCCEEDED', completed_at = now(), lease_token = null,
      leased_by = null, leased_at = null, last_error_code = null, updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'waveId', v_audition.session_id, 'requestId', v_audition.id,
    'candidateVersionId', v_audition.candidate_version_id,
    'referenceBeatRevisionId', v_audition.reference_beat_revision_id,
    'mode', v_audition.mode, 'state', v_audition.state,
    'previewAssetId', v_audition.preview_asset_id,
    'failureCode', null, 'updatedAt', v_audition.updated_at
  );
end;
$$;

create or replace function public.rooms_wave_claim_asset_processing_v4(
  p_worker_id text,
  p_limit integer default 1
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  upload_id uuid,
  session_id uuid,
  asset_id uuid,
  storage_bucket text,
  storage_path text,
  expected_byte_size bigint,
  expected_sha256 text,
  claimed_mime_type text,
  target_version_number integer,
  submission_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_processing_worker_required';
  end if;
  if p_worker_id is null or length(btrim(p_worker_id)) not between 3 and 120
     or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'wave_processing_claim_invalid';
  end if;
  return query
  with candidates as (
    select job.id
    from public.wave_asset_processing_outbox_v4 job
    where (
      job.state in ('PENDING', 'RETRY') and job.next_attempt_at <= now()
    ) or (
      job.state = 'PROCESSING' and job.leased_at < now() - interval '5 minutes'
    )
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.wave_asset_processing_outbox_v4 job
    set state = 'PROCESSING', attempt_count = job.attempt_count + 1,
        lease_token = gen_random_uuid(), leased_by = p_worker_id, leased_at = now(), updated_at = now()
    from candidates where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.lease_token, upload.id, upload.session_id, upload.asset_id,
    upload.storage_bucket, upload.storage_path, upload.expected_byte_size, upload.expected_sha256,
    upload.claimed_mime_type, upload.target_version_number, upload.submission_id
  from claimed join public.wave_asset_uploads_v4 upload on upload.id = claimed.upload_id;
end;
$$;

create or replace function public.rooms_wave_complete_asset_processing_v4(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_failure_code text default null,
  p_analysis jsonb default null,
  p_playback_asset_id uuid default null,
  p_preview_asset_id uuid default null,
  p_waveform_asset_id uuid default null,
  p_worker_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.wave_asset_processing_outbox_v4%rowtype;
  v_upload public.wave_asset_uploads_v4%rowtype;
  v_submission public.wave_loop_submissions_v3%rowtype;
  v_version_id uuid;
  v_analysis_id uuid;
  v_compatibility public.wave_compatibility_v3;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_processing_worker_required';
  end if;
  select * into v_job from public.wave_asset_processing_outbox_v4 job
  where job.id = p_outbox_id and job.state = 'PROCESSING' and job.lease_token = p_lease_token
  for update;
  if not found then raise exception using errcode = '55000', message = 'wave_processing_lease_invalid'; end if;
  select * into v_upload from public.wave_asset_uploads_v4 upload where upload.id = v_job.upload_id for update;
  select * into v_submission from public.wave_loop_submissions_v3 submission where submission.id = v_upload.submission_id for update;

  if not p_succeeded then
    update public.wave_asset_processing_outbox_v4
    set state = case when attempt_count >= 5 then 'DEAD' else 'RETRY' end,
        next_attempt_at = now() + make_interval(secs => least(900, 15 * (2 ^ least(attempt_count, 6))::integer)),
        lease_token = null, leased_by = null, leased_at = null,
        last_error_code = coalesce(nullif(p_failure_code, ''), 'PROCESSING_FAILED'), updated_at = now()
    where id = v_job.id;
    if v_job.attempt_count >= 5 then
      update public.wave_asset_uploads_v4
      set state = 'PROCESSING_FAILED', failure_code = coalesce(nullif(p_failure_code, ''), 'PROCESSING_FAILED'),
          progress_percent = null, updated_at = now()
      where id = v_upload.id returning * into v_upload;
      update public.wave_audio_assets_v3 set status = 'FAILED', updated_at = now() where id = v_upload.asset_id;
      update public.wave_asset_derivatives_v4 set state = 'FAILED', updated_at = now()
      where asset_id = v_upload.asset_id;
      update public.wave_loop_submissions_v3 set status = 'PROCESSING_FAILED',
        status_reason = coalesce(nullif(p_failure_code, ''), 'PROCESSING_FAILED') where id = v_upload.submission_id;
      perform public.rooms_wave_append_event_v3(v_upload.session_id, 'submission.rejected', null,
        'submission', v_upload.submission_id,
        jsonb_build_object('failureCode', v_upload.failure_code), v_upload.correlation_id);
    end if;
    return public.rooms_wave_upload_status_v4(v_upload);
  end if;

  if p_analysis is null or jsonb_typeof(p_analysis) <> 'object'
     or p_worker_version is null or length(btrim(p_worker_version)) < 3
     or p_analysis->>'sha256' is distinct from v_upload.expected_sha256
     or coalesce((p_analysis->>'byteSize')::bigint, -1) <> v_upload.expected_byte_size
     or coalesce((p_analysis->>'safe')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'wave_processing_verification_required';
  end if;
  v_compatibility := coalesce(nullif(p_analysis->>'compatibility', '')::public.wave_compatibility_v3, 'NEEDS_REVIEW');

  if p_playback_asset_id is null or not exists (
    select 1 from public.wave_audio_assets_v3 asset
    join public.wave_asset_derivatives_v4 derivative on derivative.asset_id = asset.id
    join public.wave_asset_retention_v4 retention on retention.asset_id = asset.id
    where asset.id = p_playback_asset_id and asset.session_id = v_upload.session_id
      and asset.source_asset_id = v_upload.asset_id
      and asset.kind in ('PLAYBACK_DERIVATIVE', 'NORMALIZED_PREVIEW')
      and asset.status = 'READY' and derivative.derivative_kind = 'PLAYBACK_DERIVATIVE'
      and derivative.source_asset_id = v_upload.asset_id and derivative.state = 'READY'
      and derivative.artifact_role = 'PLAYBACK_CANONICAL' and derivative.temporal_exact
      and derivative.target_sample_rate = 48000 and derivative.target_channels = 2
      and retention.state in ('ACTIVE', 'LEGAL_HOLD')
  ) then raise exception using errcode = '23514', message = 'wave_playback_derivative_required'; end if;
  if p_preview_asset_id is not null and not exists (
    select 1 from public.wave_audio_assets_v3 asset
    join public.wave_asset_derivatives_v4 derivative on derivative.asset_id = asset.id
    join public.wave_asset_retention_v4 retention on retention.asset_id = asset.id
    where asset.id = p_preview_asset_id and asset.session_id = v_upload.session_id
      and asset.source_asset_id = p_playback_asset_id
      and asset.kind in ('PREVIEW_DERIVATIVE', 'PREVIEW')
      and asset.status = 'READY' and derivative.derivative_kind = 'PREVIEW_DERIVATIVE'
      and derivative.source_asset_id = p_playback_asset_id and derivative.state = 'READY'
      and derivative.artifact_role = 'LIGHT_PREVIEW' and derivative.temporal_exact
      and retention.state in ('ACTIVE', 'LEGAL_HOLD')
  ) then raise exception using errcode = '23514', message = 'wave_preview_asset_invalid'; end if;
  if p_preview_asset_id is null then
    raise exception using errcode = '23514', message = 'wave_preview_derivative_required';
  end if;
  if p_waveform_asset_id is null or not exists (
    select 1 from public.wave_audio_assets_v3 asset
    join public.wave_asset_derivatives_v4 derivative on derivative.asset_id = asset.id
    join public.wave_asset_retention_v4 retention on retention.asset_id = asset.id
    where asset.id = p_waveform_asset_id and asset.session_id = v_upload.session_id
      and asset.source_asset_id = p_playback_asset_id and asset.kind = 'WAVEFORM' and asset.status = 'READY'
      and derivative.derivative_kind = 'WAVEFORM' and derivative.source_asset_id = p_playback_asset_id
      and derivative.state = 'READY' and derivative.artifact_role = 'WAVEFORM'
      and retention.state in ('ACTIVE', 'LEGAL_HOLD')
  ) then raise exception using errcode = '23514', message = 'wave_waveform_asset_invalid'; end if;

  insert into public.wave_loop_versions_v3(
    submission_id, version_number, audio_asset_id, created_by, supersedes_version_id,
    correction_reason, technical_fingerprint, declared_bpm, declared_key, declared_bars,
    based_on_beat_revision_id, based_on_rules_revision_id, based_on_rules_version
  ) values (
    v_submission.id, v_upload.target_version_number, v_upload.asset_id, v_upload.actor_id,
    case when v_upload.target_version_number > 1 then (
      select version.id from public.wave_loop_versions_v3 version
      where version.submission_id = v_submission.id and version.version_number = v_upload.target_version_number - 1
    ) else null end,
    case when v_upload.target_version_number > 1 then 'Correction audio vérifiée' else null end,
    v_upload.expected_sha256,
    nullif(p_analysis->>'bpm', '')::numeric, nullif(p_analysis->>'key', ''), nullif(p_analysis->>'bars', '')::integer,
    v_upload.based_on_beat_revision_id, v_upload.based_on_rules_revision_id, v_upload.based_on_rules_version
  ) returning id into v_version_id;

  insert into public.wave_loop_analysis_v3(
    loop_version_id, compatibility, estimated_bpm, estimated_key, estimated_bars,
    estimated_time_signature, start_offset_ms, sample_rate, bit_depth, channels,
    loudness_lufs, peak_dbfs, clipped, excessive_silence, corrupt, details, worker_version
  ) values (
    v_version_id, v_compatibility, nullif(p_analysis->>'bpm', '')::numeric,
    nullif(p_analysis->>'key', ''), nullif(p_analysis->>'bars', '')::integer,
    nullif(p_analysis->>'timeSignature', ''), nullif(p_analysis->>'startOffsetMs', '')::integer,
    nullif(p_analysis->>'sampleRate', '')::integer, nullif(p_analysis->>'bitDepth', '')::integer,
    nullif(p_analysis->>'channels', '')::integer, nullif(p_analysis->>'loudnessLufs', '')::numeric,
    nullif(p_analysis->>'peakDbfs', '')::numeric, coalesce((p_analysis->>'clipped')::boolean, false),
    coalesce((p_analysis->>'excessiveSilence')::boolean, false), false,
    p_analysis - array['sha256','byteSize','safe'], p_worker_version
  ) returning id into v_analysis_id;

  update public.wave_audio_assets_v3
  set status = 'READY', duration_ms = nullif(p_analysis->>'durationMs', '')::integer,
      metadata = metadata || jsonb_build_object('verifiedAt', now(), 'unverified', false,
        'workerVersion', p_worker_version), updated_at = now()
  where id = v_upload.asset_id;
  update public.wave_asset_derivatives_v4
  set state = 'READY', updated_at = now() where asset_id = v_upload.asset_id;
  update public.wave_loop_submissions_v3
  set status = case when v_compatibility = 'COMPATIBLE' then 'RECEIVED' else 'NEEDS_REVIEW' end,
      current_version_number = v_upload.target_version_number,
      status_reason = case when v_compatibility = 'COMPATIBLE' then null else 'AUTOMATIC_ANALYSIS_REQUIRES_HOST_REVIEW' end
  where id = v_upload.submission_id;
  update public.wave_asset_uploads_v4
  set state = 'READY', progress_percent = 100, analysis_id = v_analysis_id,
      playback_asset_id = p_playback_asset_id,
      preview_asset_id = p_preview_asset_id, waveform_asset_id = p_waveform_asset_id,
      failure_code = null, updated_at = now()
  where id = v_upload.id returning * into v_upload;
  update public.wave_asset_processing_outbox_v4
  set state = 'SUCCEEDED', completed_at = now(), lease_token = null, leased_by = null,
      leased_at = null, updated_at = now(), last_error_code = null where id = v_job.id;
  perform public.rooms_wave_append_event_v3(v_upload.session_id, 'submission.ready', null,
    'submission', v_upload.submission_id,
    jsonb_build_object('loopVersionId', v_version_id, 'compatibility', v_compatibility), v_upload.correlation_id);
  return public.rooms_wave_upload_status_v4(v_upload);
end;
$$;

create or replace function public.rooms_wave_schedule_asset_gc_v4(
  p_asset_id uuid,
  p_earliest_delete_at timestamptz,
  p_reason text,
  p_policy_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.wave_audio_assets_v3%rowtype;
  v_retention public.wave_asset_retention_v4%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_asset_gc_worker_required';
  end if;
  if p_earliest_delete_at is null or p_earliest_delete_at < now()
     or p_reason is null or length(btrim(p_reason)) not between 3 and 160
     or p_policy_snapshot is null or jsonb_typeof(p_policy_snapshot) <> 'object'
     or pg_column_size(p_policy_snapshot) > 32768 then
    raise exception using errcode = '22023', message = 'wave_asset_gc_schedule_invalid';
  end if;
  select * into v_asset from public.wave_audio_assets_v3 asset where asset.id = p_asset_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_asset_not_found'; end if;
  select * into v_retention from public.wave_asset_retention_v4 retention
  where retention.asset_id = p_asset_id for update;
  if not found then raise exception using errcode = '55000', message = 'wave_asset_retention_missing'; end if;
  if v_retention.state = 'LEGAL_HOLD' then
    raise exception using errcode = '55000', message = 'wave_asset_legal_hold';
  end if;
  if v_asset.kind = 'ORIGINAL'
     and coalesce(p_policy_snapshot->>'rightsDisposition', '')
       not in ('EXPIRED', 'REVOKED', 'DELETE_AFTER_SESSION', 'ADMIN_ERASURE') then
    raise exception using errcode = '55000', message = 'wave_original_rights_disposition_required';
  end if;

  update public.wave_asset_retention_v4
  set state = 'QUEUED', earliest_delete_at = p_earliest_delete_at,
      reason = left(btrim(p_reason), 160), policy_snapshot = p_policy_snapshot,
      legal_hold_reason = null, storage_deleted_at = null, updated_at = now()
  where asset_id = p_asset_id returning * into v_retention;
  update public.wave_asset_derivatives_v4
  set retention_state = 'QUEUED', retention_until = p_earliest_delete_at,
      legal_hold_reason = null, deleted_at = null, updated_at = now()
  where asset_id = p_asset_id;
  insert into public.wave_asset_gc_outbox_v4(asset_id, session_id, state, next_attempt_at)
  values (p_asset_id, v_asset.session_id, 'PENDING', p_earliest_delete_at)
  on conflict (asset_id) do update
    set state = 'PENDING', attempt_count = 0, next_attempt_at = excluded.next_attempt_at,
        lease_token = null, leased_by = null, leased_at = null,
        last_error_code = null, completed_at = null, updated_at = now();
  return jsonb_build_object(
    'assetId', p_asset_id, 'waveId', v_asset.session_id,
    'state', v_retention.state, 'earliestDeleteAt', v_retention.earliest_delete_at
  );
end;
$$;

create or replace function public.rooms_wave_claim_asset_gc_v4(
  p_worker_id text,
  p_limit integer default 20
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  asset_id uuid,
  session_id uuid,
  storage_bucket text,
  storage_path text,
  asset_kind public.wave_asset_kind_v3,
  policy_snapshot jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_asset_gc_worker_required';
  end if;
  if p_worker_id is null or length(btrim(p_worker_id)) not between 3 and 120
     or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'wave_asset_gc_claim_invalid';
  end if;
  return query
  with candidates as (
    select job.id
    from public.wave_asset_gc_outbox_v4 job
    join public.wave_asset_retention_v4 retention on retention.asset_id = job.asset_id
    where retention.state = 'QUEUED' and retention.earliest_delete_at <= now()
      and (
        (job.state in ('PENDING', 'RETRY') and job.next_attempt_at <= now())
        or (job.state = 'PROCESSING' and job.leased_at < now() - interval '5 minutes')
      )
    order by job.next_attempt_at, job.created_at
    for update of job skip locked
    limit p_limit
  ), claimed as (
    update public.wave_asset_gc_outbox_v4 job
    set state = 'PROCESSING', attempt_count = job.attempt_count + 1,
        lease_token = gen_random_uuid(), leased_by = p_worker_id,
        leased_at = now(), updated_at = now()
    from candidates where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.lease_token, asset.id, asset.session_id,
    asset.storage_bucket, asset.storage_path, asset.kind, retention.policy_snapshot
  from claimed
  join public.wave_audio_assets_v3 asset on asset.id = claimed.asset_id
  join public.wave_asset_retention_v4 retention on retention.asset_id = asset.id;
end;
$$;

create or replace function public.rooms_wave_complete_asset_gc_v4(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_storage_object_deleted boolean,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.wave_asset_gc_outbox_v4%rowtype;
  v_asset public.wave_audio_assets_v3%rowtype;
  v_retention public.wave_asset_retention_v4%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'wave_asset_gc_worker_required';
  end if;
  select * into v_job from public.wave_asset_gc_outbox_v4 job
  where job.id = p_outbox_id and job.state = 'PROCESSING' and job.lease_token = p_lease_token
  for update;
  if not found then raise exception using errcode = '55000', message = 'wave_asset_gc_lease_invalid'; end if;
  select * into v_asset from public.wave_audio_assets_v3 asset where asset.id = v_job.asset_id for update;
  select * into v_retention from public.wave_asset_retention_v4 retention
  where retention.asset_id = v_job.asset_id for update;
  if v_retention.state = 'LEGAL_HOLD' then
    raise exception using errcode = '55000', message = 'wave_asset_legal_hold';
  end if;

  if not p_storage_object_deleted then
    update public.wave_asset_gc_outbox_v4
    set state = case when attempt_count >= 5 then 'DEAD' else 'RETRY' end,
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempt_count, 7))::integer)),
        lease_token = null, leased_by = null, leased_at = null,
        last_error_code = coalesce(nullif(p_failure_code, ''), 'STORAGE_DELETE_NOT_CONFIRMED'),
        updated_at = now()
    where id = v_job.id;
    return jsonb_build_object(
      'assetId', v_asset.id, 'waveId', v_asset.session_id,
      'state', v_retention.state, 'deleted', false
    );
  end if;

  update public.wave_audio_assets_v3 set status = 'DELETED', updated_at = now() where id = v_asset.id;
  update public.wave_asset_retention_v4
  set state = 'DELETED', storage_deleted_at = now(), updated_at = now()
  where asset_id = v_asset.id returning * into v_retention;
  update public.wave_asset_derivatives_v4
  set retention_state = 'DELETED', deleted_at = now(), updated_at = now()
  where asset_id = v_asset.id;
  update public.wave_asset_gc_outbox_v4
  set state = 'SUCCEEDED', completed_at = now(), lease_token = null,
      leased_by = null, leased_at = null, last_error_code = null, updated_at = now()
  where id = v_job.id;
  return jsonb_build_object(
    'assetId', v_asset.id, 'waveId', v_asset.session_id,
    'state', v_retention.state, 'deleted', true
  );
end;
$$;

alter table public.wave_ingestion_policy_v4 enable row level security;
alter table public.wave_asset_uploads_v4 enable row level security;
alter table public.wave_asset_derivatives_v4 enable row level security;
alter table public.wave_asset_retention_v4 enable row level security;
alter table public.wave_asset_processing_outbox_v4 enable row level security;
alter table public.wave_asset_gc_outbox_v4 enable row level security;
alter table public.wave_asset_command_receipts_v4 enable row level security;
alter table public.wave_private_auditions_v4 enable row level security;
alter table public.wave_private_audition_outbox_v4 enable row level security;

revoke all on table public.wave_ingestion_policy_v4, public.wave_asset_uploads_v4,
  public.wave_asset_derivatives_v4, public.wave_asset_retention_v4,
  public.wave_asset_processing_outbox_v4, public.wave_asset_gc_outbox_v4,
  public.wave_asset_command_receipts_v4, public.wave_private_auditions_v4,
  public.wave_private_audition_outbox_v4
  from public, anon, authenticated;
grant all on table public.wave_ingestion_policy_v4, public.wave_asset_uploads_v4,
  public.wave_asset_derivatives_v4, public.wave_asset_retention_v4,
  public.wave_asset_processing_outbox_v4, public.wave_asset_gc_outbox_v4,
  public.wave_asset_command_receipts_v4 to service_role;
grant all on table public.wave_private_auditions_v4, public.wave_private_audition_outbox_v4 to service_role;

-- Storage objects remain private and are never listed/read through RLS. The
-- Edge gateway mints a one-object signed upload token after the request RPC.
drop policy if exists wave_private_objects_no_direct_client_v4 on storage.objects;
create policy wave_private_objects_no_direct_client_v4
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'room-wave-private')
with check (bucket_id <> 'room-wave-private');

revoke all on function public.rooms_wave_upload_status_v4(public.wave_asset_uploads_v4) from public, anon, authenticated;
revoke all on function public.rooms_wave_guard_asset_derivative_v4() from public, anon, authenticated;
revoke all on function public.rooms_wave_request_asset_upload_v4(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text) from public, anon;
revoke all on function public.rooms_wave_get_asset_processing_status_v4(uuid, uuid) from public, anon;
revoke all on function public.rooms_wave_request_private_audition_v4(uuid, uuid, uuid, text, boolean, text) from public, anon;
revoke all on function public.rooms_wave_claim_private_auditions_v4(text, integer) from public, anon, authenticated;
revoke all on function public.rooms_wave_complete_private_audition_v4(uuid, uuid, boolean, uuid, text, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_claim_asset_processing_v4(text, integer) from public, anon, authenticated;
revoke all on function public.rooms_wave_complete_asset_processing_v4(uuid, uuid, boolean, text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_schedule_asset_gc_v4(uuid, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.rooms_wave_claim_asset_gc_v4(text, integer) from public, anon, authenticated;
revoke all on function public.rooms_wave_complete_asset_gc_v4(uuid, uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.rooms_wave_request_asset_upload_v4(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text) to authenticated, service_role;
grant execute on function public.rooms_wave_get_asset_processing_status_v4(uuid, uuid) to authenticated, service_role;
grant execute on function public.rooms_wave_request_private_audition_v4(uuid, uuid, uuid, text, boolean, text) to authenticated, service_role;
grant execute on function public.rooms_wave_claim_private_auditions_v4(text, integer) to service_role;
grant execute on function public.rooms_wave_complete_private_audition_v4(uuid, uuid, boolean, uuid, text, text) to service_role;
grant execute on function public.rooms_wave_claim_asset_processing_v4(text, integer) to service_role;
grant execute on function public.rooms_wave_complete_asset_processing_v4(uuid, uuid, boolean, text, jsonb, uuid, uuid, uuid, text) to service_role;
grant execute on function public.rooms_wave_schedule_asset_gc_v4(uuid, timestamptz, text, jsonb) to service_role;
grant execute on function public.rooms_wave_claim_asset_gc_v4(text, integer) to service_role;
grant execute on function public.rooms_wave_complete_asset_gc_v4(uuid, uuid, boolean, text) to service_role;

comment on table public.wave_asset_uploads_v4 is
  'Authoritative private upload intents. Signed Storage URLs are minted only by the authenticated Edge gateway; confirmation only enqueues verification.';
comment on table public.wave_asset_processing_outbox_v4 is
  'Durable leased outbox for isolated audio verification/analysis workers. READY is impossible until a worker supplies hash, byte-size and safety evidence.';
comment on table public.wave_private_auditions_v4 is
  'Host-only audition authority binding one immutable candidate version and one current reference beat revision. WITH_BEAT is queued for server rendering; browsers never mix stems.';
comment on function public.rooms_wave_complete_private_audition_v4(uuid, uuid, boolean, uuid, text, text) is
  'Worker-only completion for a locked private audition. READY requires a private 48 kHz preview derivative whose metadata binds the exact audition, candidate version and reference revision.';
comment on table public.wave_asset_derivatives_v4 is
  'Immutable asset lineage: ORIGINAL -> canonical 48 kHz stereo PLAYBACK_DERIVATIVE -> PREVIEW_DERIVATIVE and WAVEFORM. Rows describe worker-produced private artifacts, never browser-generated audio.';
comment on table public.wave_asset_retention_v4 is
  'Per-asset retention and legal-hold projection. Deletion is service-worker-only and must retain the immutable database audit row after private Storage deletion.';
comment on function public.rooms_wave_complete_asset_processing_v4(uuid, uuid, boolean, text, jsonb, uuid, uuid, uuid, text) is
  'Worker-only promotion from wave_audio_assets_v3 to immutable wave_loop_versions_v3 after real verification and analysis.';
