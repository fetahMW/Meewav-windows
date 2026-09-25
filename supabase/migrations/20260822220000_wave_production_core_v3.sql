-- Normalized, private production core for La Wave.
--
-- This schema deliberately stores authoritative workflow state and references to
-- media/render artifacts. It does not pretend to mix or synchronize audio in
-- PostgreSQL: HOST_DAW and SERVER_RENDER only identify the official program
-- source selected by the control plane.

do $$ begin
  create type public.wave_session_status_v3 as enum ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_loop_status_v3 as enum (
    'UPLOADING', 'PROCESSING', 'RECEIVED', 'NEEDS_REVIEW', 'NEEDS_CORRECTION',
    'READY_FOR_VOTE', 'VOTING', 'ACCEPTED', 'NOT_SELECTED', 'REJECTED',
    'SUPERSEDED', 'REMOVED', 'PROCESSING_FAILED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_vote_kind_v3 as enum ('ADMISSION', 'REPLACEMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_vote_status_v3 as enum ('LISTENING', 'OPEN', 'FINALIZED', 'CANCELLED', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_vote_choice_v3 as enum ('APPROVE', 'CONTINUE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_program_source_v3 as enum ('HOST_DAW', 'SERVER_RENDER', 'SILENCE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_asset_kind_v3 as enum (
    'ORIGINAL', 'PLAYBACK_DERIVATIVE', 'PREVIEW_DERIVATIVE',
    'PREVIEW', 'WAVEFORM', 'NORMALIZED_PREVIEW', 'RENDER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_asset_status_v3 as enum ('UPLOADING', 'PROCESSING', 'READY', 'QUARANTINED', 'FAILED', 'DELETED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_compatibility_v3 as enum ('COMPATIBLE', 'NEEDS_REVIEW', 'INCOMPATIBLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.wave_render_status_v3 as enum ('IDLE', 'REQUESTED', 'PROCESSING', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

create table if not exists public.wave_sessions_v3 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms_v2(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete restrict,
  status public.wave_session_status_v3 not null default 'DRAFT',
  rules_version integer not null default 1 check (rules_version > 0),
  bpm numeric(7,3) not null check (bpm between 20 and 400),
  musical_key text not null check (length(btrim(musical_key)) between 1 and 24),
  time_signature text not null default '4/4' check (time_signature ~ '^[1-9][0-9]?/[124816]$'),
  expected_bars integer not null check (expected_bars between 1 and 256),
  max_duration_ms integer not null check (max_duration_ms between 250 and 900000),
  accepted_mime_types text[] not null check (cardinality(accepted_mime_types) between 1 and 16),
  desired_loop_types text[] not null check (cardinality(desired_loop_types) between 1 and 32),
  effects_policy text not null default 'EITHER' check (effects_policy in ('DRY', 'PROCESSED', 'EITHER')),
  recommended_lufs numeric(5,2),
  rules_locked_at timestamptz,
  current_beat_revision_id uuid,
  active_vote_round_id uuid,
  event_sequence bigint not null default 0 check (event_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_categories_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  position integer not null check (position between 0 and 63),
  min_slots integer not null default 0 check (min_slots between 0 and 32),
  max_slots integer not null default 1 check (max_slots between 1 and 32 and max_slots >= min_slots),
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, code),
  unique (session_id, position)
);

create table if not exists public.wave_submission_allowances_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.wave_categories_v3(id) on delete cascade,
  max_submissions integer not null default 1 check (max_submissions between 1 and 100),
  used_submissions integer not null default 0 check (used_submissions >= 0 and used_submissions <= max_submissions),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create unique index if not exists wave_submission_allowance_scope_v3
on public.wave_submission_allowances_v3(session_id, contributor_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.wave_slots_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  category_id uuid not null references public.wave_categories_v3(id) on delete cascade,
  slot_index integer not null check (slot_index between 0 and 31),
  label text not null check (length(btrim(label)) between 1 and 80),
  state text not null default 'OPEN' check (state in ('OPEN', 'OCCUPIED', 'LOCKED')),
  accepted_version_id uuid,
  created_at timestamptz not null default now(),
  unique(category_id, slot_index),
  unique(session_id, id)
);

create table if not exists public.wave_loop_submissions_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  category_id uuid not null references public.wave_categories_v3(id) on delete restrict,
  requested_slot_id uuid references public.wave_slots_v3(id) on delete set null,
  contributor_id uuid not null references auth.users(id) on delete restrict,
  credit_name text not null check (length(btrim(credit_name)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 160),
  status public.wave_loop_status_v3 not null default 'UPLOADING',
  status_reason text,
  current_version_number integer not null default 0 check (current_version_number >= 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  check ((status = 'REMOVED') = (removed_at is not null))
);

create index if not exists wave_loop_submissions_session_status_v3
on public.wave_loop_submissions_v3(session_id, status, submitted_at);
create index if not exists wave_loop_submissions_contributor_v3
on public.wave_loop_submissions_v3(session_id, contributor_id, submitted_at);

-- No public URL is stored. Only object-storage coordinates and opaque artifact
-- identifiers are persisted; the table has no authenticated SELECT policy.
create table if not exists public.wave_audio_assets_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  kind public.wave_asset_kind_v3 not null,
  status public.wave_asset_status_v3 not null default 'UPLOADING',
  storage_bucket text not null check (length(storage_bucket) between 1 and 80),
  storage_path text not null check (length(storage_path) between 1 and 1024 and storage_path !~ '(^|/)\.\.(/|$)'),
  mime_type text not null check (mime_type like 'audio/%' or kind in ('WAVEFORM', 'RENDER')),
  byte_size bigint check (byte_size is null or byte_size between 0 and 1073741824),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  source_asset_id uuid references public.wave_audio_assets_v3(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_bucket, storage_path)
);

create table if not exists public.wave_loop_versions_v3 (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wave_loop_submissions_v3(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  audio_asset_id uuid not null unique references public.wave_audio_assets_v3(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  supersedes_version_id uuid references public.wave_loop_versions_v3(id) on delete restrict,
  correction_reason text,
  technical_fingerprint text not null check (length(technical_fingerprint) between 16 and 256),
  declared_bpm numeric(7,3) check (declared_bpm is null or declared_bpm between 20 and 400),
  declared_key text,
  declared_bars integer check (declared_bars is null or declared_bars between 1 and 256),
  created_at timestamptz not null default now(),
  unique(submission_id, version_number),
  check ((version_number = 1 and supersedes_version_id is null) or version_number > 1),
  check (version_number = 1 or length(btrim(coalesce(correction_reason, ''))) > 0)
);

alter table public.wave_slots_v3
  drop constraint if exists wave_slots_v3_accepted_version_id_fkey;
alter table public.wave_slots_v3
  add constraint wave_slots_v3_accepted_version_id_fkey
  foreign key (accepted_version_id) references public.wave_loop_versions_v3(id) on delete restrict;

create table if not exists public.wave_loop_analysis_v3 (
  id uuid primary key default gen_random_uuid(),
  loop_version_id uuid not null references public.wave_loop_versions_v3(id) on delete cascade,
  attempt integer not null default 1 check (attempt > 0),
  compatibility public.wave_compatibility_v3 not null,
  estimated_bpm numeric(7,3) check (estimated_bpm is null or estimated_bpm between 20 and 400),
  estimated_key text,
  estimated_bars integer check (estimated_bars is null or estimated_bars between 1 and 256),
  estimated_time_signature text,
  start_offset_ms integer check (start_offset_ms is null or start_offset_ms >= 0),
  sample_rate integer check (sample_rate is null or sample_rate between 8000 and 384000),
  bit_depth integer check (bit_depth is null or bit_depth in (8, 16, 20, 24, 32, 64)),
  channels integer check (channels is null or channels between 1 and 16),
  loudness_lufs numeric(6,2),
  peak_dbfs numeric(6,2),
  clipped boolean not null default false,
  excessive_silence boolean not null default false,
  corrupt boolean not null default false,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 131072),
  worker_version text not null,
  analyzed_at timestamptz not null default now(),
  unique(loop_version_id, attempt)
);

create table if not exists public.wave_beat_revisions_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  parent_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  reason text not null check (reason in ('INITIAL', 'ADMISSION', 'REPLACEMENT', 'REMOVAL', 'ROLLBACK')),
  source_vote_round_id uuid,
  render_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  render_status public.wave_render_status_v3 not null default 'IDLE',
  content_hash text not null check (length(content_hash) between 8 and 256),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(session_id, revision_number),
  unique(session_id, id),
  check ((revision_number = 1 and parent_revision_id is null and reason = 'INITIAL') or revision_number > 1)
);

create table if not exists public.wave_beat_tracks_v3 (
  id uuid primary key default gen_random_uuid(),
  beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete cascade,
  category_id uuid references public.wave_categories_v3(id) on delete restrict,
  slot_id uuid references public.wave_slots_v3(id) on delete restrict,
  loop_version_id uuid not null references public.wave_loop_versions_v3(id) on delete restrict,
  position integer not null check (position between 0 and 255),
  gain numeric(6,3) not null default 1 check (gain between 0 and 4),
  muted boolean not null default false,
  is_host_base boolean not null default false,
  provenance_vote_round_id uuid,
  created_at timestamptz not null default now(),
  check (
    (is_host_base and category_id is null and slot_id is null)
    or (not is_host_base and category_id is not null and slot_id is not null)
  ),
  unique(beat_revision_id, position),
  unique(beat_revision_id, loop_version_id)
);

create unique index if not exists wave_beat_tracks_slot_once_v3
on public.wave_beat_tracks_v3(beat_revision_id, slot_id) where slot_id is not null;
create unique index if not exists wave_beat_tracks_host_base_once_v3
on public.wave_beat_tracks_v3(beat_revision_id) where is_host_base;

create table if not exists public.wave_vote_rounds_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  kind public.wave_vote_kind_v3 not null,
  status public.wave_vote_status_v3 not null default 'LISTENING',
  candidate_version_id uuid not null references public.wave_loop_versions_v3(id) on delete restrict,
  target_slot_id uuid not null references public.wave_slots_v3(id) on delete restrict,
  replaces_track_id uuid references public.wave_beat_tracks_v3(id) on delete restrict,
  reference_beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  locked_preview_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  listening_started_at timestamptz not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  quorum integer not null check (quorum > 0),
  approval_threshold numeric(5,4) not null check (approval_threshold > 0.5 and approval_threshold <= 1),
  eligible_voters integer check (eligible_voters is null or eligible_voters >= 0),
  approve_count integer check (approve_count is null or approve_count >= 0),
  continue_count integer check (continue_count is null or continue_count >= 0),
  approved boolean,
  finalization_key text unique,
  finalized_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (listening_started_at <= opens_at and opens_at < closes_at),
  check (
    (kind = 'ADMISSION' and replaces_track_id is null)
    or (kind = 'REPLACEMENT' and replaces_track_id is not null)
  ),
  check (
    (status = 'FINALIZED' and finalized_at is not null and approved is not null and finalization_key is not null)
    or (status <> 'FINALIZED' and finalized_at is null and approved is null)
  )
);

create unique index if not exists wave_vote_one_active_per_session_v3
on public.wave_vote_rounds_v3(session_id)
where status in ('LISTENING', 'OPEN');

create table if not exists public.wave_votes_v3 (
  round_id uuid not null references public.wave_vote_rounds_v3(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete restrict,
  choice public.wave_vote_choice_v3 not null,
  cast_at timestamptz not null default now(),
  primary key(round_id, voter_id)
);

alter table public.wave_sessions_v3
  drop constraint if exists wave_sessions_v3_current_beat_revision_id_fkey;
alter table public.wave_sessions_v3
  add constraint wave_sessions_v3_current_beat_revision_id_fkey
  foreign key (current_beat_revision_id) references public.wave_beat_revisions_v3(id) on delete restrict;
alter table public.wave_sessions_v3
  drop constraint if exists wave_sessions_v3_active_vote_round_id_fkey;
alter table public.wave_sessions_v3
  add constraint wave_sessions_v3_active_vote_round_id_fkey
  foreign key (active_vote_round_id) references public.wave_vote_rounds_v3(id) on delete restrict;
alter table public.wave_beat_revisions_v3
  drop constraint if exists wave_beat_revisions_v3_source_vote_round_id_fkey;
alter table public.wave_beat_revisions_v3
  add constraint wave_beat_revisions_v3_source_vote_round_id_fkey
  foreign key (source_vote_round_id) references public.wave_vote_rounds_v3(id) on delete restrict;
alter table public.wave_beat_tracks_v3
  drop constraint if exists wave_beat_tracks_v3_provenance_vote_round_id_fkey;
alter table public.wave_beat_tracks_v3
  add constraint wave_beat_tracks_v3_provenance_vote_round_id_fkey
  foreign key (provenance_vote_round_id) references public.wave_vote_rounds_v3(id) on delete restrict;

create table if not exists public.wave_program_audio_state_v3 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  source public.wave_program_source_v3 not null default 'SILENCE',
  source_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  source_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  source_rtc_publication_id text,
  render_status public.wave_render_status_v3 not null default 'IDLE',
  musical_position_beats numeric(14,4) not null default 0 check (musical_position_beats >= 0),
  transition_ms integer not null default 0 check (transition_ms between 0 and 2000),
  generation bigint not null default 1 check (generation > 0),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  check (
    (source = 'HOST_DAW' and length(btrim(coalesce(source_rtc_publication_id, ''))) > 0 and source_revision_id is null and source_asset_id is null)
    or (source = 'SERVER_RENDER' and source_revision_id is not null and source_rtc_publication_id is null)
    or (source = 'SILENCE' and source_revision_id is null and source_asset_id is null and source_rtc_publication_id is null)
  ),
  check (source = 'SERVER_RENDER' or render_status in ('IDLE', 'READY')),
  check (render_status <> 'READY' or source <> 'SERVER_RENDER' or source_asset_id is not null)
);

create table if not exists public.wave_event_v1 (
  wave_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  id uuid not null default gen_random_uuid(),
  type text not null check (type ~ '^[a-z][a-z0-9_.-]{2,95}$'),
  actor_id uuid references auth.users(id) on delete set null,
  correlation_id text not null check (length(correlation_id) between 1 and 256),
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 131072),
  occurred_at timestamptz not null default now(),
  primary key(wave_id, sequence),
  unique(id)
);

create table if not exists public.wave_idempotency_v3 (
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  command_name text not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 262144),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key(session_id, actor_id, command_name, idempotency_key),
  check (expires_at > created_at)
);

create table if not exists public.wave_rights_consents_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  submission_id uuid not null references public.wave_loop_submissions_v3(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('GRANTED', 'REVOKED')),
  terms_version text not null check (length(terms_version) between 1 and 80),
  consent_scope text not null check (length(consent_scope) between 1 and 200),
  supersedes_consent_id uuid references public.wave_rights_consents_v3(id) on delete restrict,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 32768),
  accepted_at timestamptz not null default now()
);

create index if not exists wave_rights_consents_submission_v3
on public.wave_rights_consents_v3(submission_id, accepted_at desc);

create table if not exists public.wave_moderation_actions_v3 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  submission_id uuid references public.wave_loop_submissions_v3(id) on delete set null,
  loop_version_id uuid references public.wave_loop_versions_v3(id) on delete set null,
  audio_asset_id uuid references public.wave_audio_assets_v3(id) on delete set null,
  action text not null check (action in ('FLAG', 'QUARANTINE', 'REJECT', 'REMOVE', 'RESTORE', 'FREEZE_VOTE')),
  reason_code text not null check (length(reason_code) between 1 and 80),
  notes text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 65536),
  created_at timestamptz not null default now(),
  check (submission_id is not null or loop_version_id is not null or audio_asset_id is not null)
);

create index if not exists wave_events_cursor_v3 on public.wave_event_v1(wave_id, sequence);
create index if not exists wave_votes_round_choice_v3 on public.wave_votes_v3(round_id, choice);
create index if not exists wave_beat_tracks_revision_v3 on public.wave_beat_tracks_v3(beat_revision_id, position);

create or replace function public.rooms_wave_is_control_v3(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from public.wave_sessions_v3 session
      where session.id = p_session_id
        and public.rooms_specialized_is_control_v1(session.room_id, p_user_id)
    );
$$;

create or replace function public.rooms_wave_is_member_v3(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or (
      p_user_id is not null
      and exists (
        select 1
        from public.wave_sessions_v3 session
        where session.id = p_session_id
          and (
            public.rooms_specialized_is_control_v1(session.room_id, p_user_id)
            or exists (
              select 1 from public.room_participants_v2 participant
              where participant.room_id = session.room_id
                and participant.user_id = p_user_id
                and participant.left_at is null
            )
          )
          and not exists (
            select 1 from public.room_bans_v2 ban
            where ban.room_id = session.room_id and ban.user_id = p_user_id
          )
      )
    );
$$;

create or replace function public.rooms_wave_append_event_v3(
  p_session_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
begin
  update public.wave_sessions_v3
  set event_sequence = event_sequence + 1,
      updated_at = now()
  where id = p_session_id
  returning event_sequence into v_sequence;

  if v_sequence is null then
    raise exception using errcode = 'P0002', message = 'wave_session_not_found';
  end if;

  insert into public.wave_event_v1(wave_id, sequence, type, actor_id, correlation_id, entity_type, entity_id, payload)
  values (
    p_session_id, v_sequence, p_event_type, p_actor_id,
    coalesce(nullif(p_correlation_id, ''), gen_random_uuid()::text),
    p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb)
  );
  return v_sequence;
end;
$$;

create or replace function public.rooms_start_wave_vote_v3(
  p_session_id uuid,
  p_kind public.wave_vote_kind_v3,
  p_candidate_version_id uuid,
  p_target_slot_id uuid,
  p_replaces_track_id uuid,
  p_reference_revision_id uuid,
  p_listen_seconds integer,
  p_vote_seconds integer,
  p_quorum integer,
  p_approval_threshold numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.wave_actor_id', true), '')::uuid);
  v_session public.wave_sessions_v3%rowtype;
  v_candidate record;
  v_slot public.wave_slots_v3%rowtype;
  v_round_id uuid;
  v_preview_asset_id uuid;
  v_request_hash text;
  v_stored_hash text;
  v_result jsonb;
  v_eligible integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if p_listen_seconds not between 1 and 900 or p_vote_seconds not between 5 and 900
     or p_quorum <= 0 or p_approval_threshold <= 0.5 or p_approval_threshold > 1 then
    raise exception using errcode = '22023', message = 'invalid_vote_configuration';
  end if;
  v_request_hash := md5(concat_ws(':', p_session_id, p_kind, p_candidate_version_id, p_target_slot_id,
    p_replaces_track_id, p_reference_revision_id, p_listen_seconds, p_vote_seconds, p_quorum, p_approval_threshold));

  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if v_session.host_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;

  select receipt.request_hash, receipt.result into v_stored_hash, v_result
  from public.wave_idempotency_v3 receipt
  where receipt.session_id = p_session_id and receipt.actor_id = v_actor
    and receipt.command_name = 'start_vote' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_request_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;

  if v_session.status not in ('READY', 'LIVE') or not exists (
    select 1 from public.rooms_v2 room where room.id = v_session.room_id and room.status = 'live'
  ) then
    raise exception using errcode = '55000', message = 'wave_is_not_live';
  end if;
  if v_session.active_vote_round_id is not null or exists (
    select 1 from public.wave_vote_rounds_v3 round
    where round.session_id = p_session_id and round.status in ('LISTENING', 'OPEN')
  ) then
    raise exception using errcode = '55000', message = 'wave_vote_already_active';
  end if;
  if v_session.current_beat_revision_id is distinct from p_reference_revision_id then
    raise exception using errcode = '55000', message = 'wave_reference_revision_is_stale';
  end if;

  select version.id as version_id, version.audio_asset_id, version.version_number,
         submission.id as submission_id, submission.status as submission_status,
         submission.current_version_number, submission.category_id
  into v_candidate
  from public.wave_loop_versions_v3 version
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  where version.id = p_candidate_version_id and submission.session_id = p_session_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_candidate_version_not_found'; end if;
  if v_candidate.submission_status <> 'READY_FOR_VOTE'
     or v_candidate.version_number <> v_candidate.current_version_number then
    raise exception using errcode = '55000', message = 'wave_candidate_version_not_ready';
  end if;
  if not exists (
    select 1 from public.wave_audio_assets_v3 asset
    where asset.id = v_candidate.audio_asset_id and asset.session_id = p_session_id and asset.status = 'READY'
  ) then
    raise exception using errcode = '55000', message = 'wave_candidate_asset_not_ready';
  end if;
  if coalesce((
    select analysis.compatibility
    from public.wave_loop_analysis_v3 analysis
    where analysis.loop_version_id = p_candidate_version_id
    order by analysis.attempt desc limit 1
  ), 'INCOMPATIBLE'::public.wave_compatibility_v3) = 'INCOMPATIBLE' then
    raise exception using errcode = '55000', message = 'wave_candidate_analysis_incompatible';
  end if;
  if coalesce((
    select consent.status
    from public.wave_rights_consents_v3 consent
    where consent.submission_id = v_candidate.submission_id
      and consent.contributor_id = (
        select submission.contributor_id from public.wave_loop_submissions_v3 submission
        where submission.id = v_candidate.submission_id
      )
    order by consent.accepted_at desc, consent.id desc limit 1
  ), 'REVOKED') <> 'GRANTED' then
    raise exception using errcode = '55000', message = 'wave_rights_consent_required';
  end if;

  select * into v_slot from public.wave_slots_v3 where id = p_target_slot_id;
  if not found or v_slot.session_id <> p_session_id or v_slot.category_id <> v_candidate.category_id then
    raise exception using errcode = '23514', message = 'wave_vote_target_slot_invalid';
  end if;

  if p_kind = 'ADMISSION' then
    if p_replaces_track_id is not null or exists (
      select 1 from public.wave_beat_tracks_v3 track
      where track.beat_revision_id = p_reference_revision_id and track.slot_id = p_target_slot_id
    ) then
      raise exception using errcode = '23514', message = 'wave_admission_slot_not_empty';
    end if;
  else
    if p_replaces_track_id is null or not exists (
      select 1 from public.wave_beat_tracks_v3 track
      where track.id = p_replaces_track_id and track.beat_revision_id = p_reference_revision_id
        and track.slot_id = p_target_slot_id and not track.is_host_base
    ) then
      raise exception using errcode = '23514', message = 'wave_replacement_track_invalid';
    end if;
  end if;

  select asset.id into v_preview_asset_id
  from public.wave_audio_assets_v3 asset
  where asset.session_id = p_session_id and asset.status = 'READY'
    and asset.kind in ('PREVIEW_DERIVATIVE', 'NORMALIZED_PREVIEW', 'PREVIEW')
    and asset.source_asset_id = v_candidate.audio_asset_id
  order by case asset.kind when 'PREVIEW_DERIVATIVE' then 0 when 'NORMALIZED_PREVIEW' then 1 else 2 end,
           asset.created_at desc limit 1;
  v_preview_asset_id := coalesce(v_preview_asset_id, v_candidate.audio_asset_id);

  select count(distinct participant.user_id)::integer into v_eligible
  from public.room_participants_v2 participant
  where participant.room_id = v_session.room_id and participant.left_at is null
    and not exists (
      select 1 from public.room_bans_v2 ban
      where ban.room_id = participant.room_id and ban.user_id = participant.user_id
    );

  insert into public.wave_vote_rounds_v3(
    session_id, kind, candidate_version_id, target_slot_id, replaces_track_id,
    reference_beat_revision_id, locked_preview_asset_id, listening_started_at,
    opens_at, closes_at, quorum, approval_threshold, eligible_voters, created_by
  ) values (
    p_session_id, p_kind, p_candidate_version_id, p_target_slot_id, p_replaces_track_id,
    p_reference_revision_id, v_preview_asset_id, now(),
    now() + make_interval(secs => p_listen_seconds),
    now() + make_interval(secs => p_listen_seconds + p_vote_seconds),
    p_quorum, p_approval_threshold, v_eligible, v_actor
  ) returning id, locked_preview_asset_id into v_round_id, v_preview_asset_id;

  update public.wave_loop_submissions_v3 set status = 'VOTING' where id = v_candidate.submission_id;
  update public.wave_sessions_v3
  set active_vote_round_id = v_round_id, status = 'LIVE', updated_at = now()
  where id = p_session_id;
  perform public.rooms_wave_append_event_v3(
    p_session_id, 'vote.started', v_actor, 'vote_round', v_round_id,
    jsonb_build_object(
      'kind', p_kind, 'candidateVersionId', p_candidate_version_id,
      'referenceBeatRevisionId', p_reference_revision_id, 'previewAssetId', v_preview_asset_id
    )
  );
  v_result := jsonb_build_object(
    'roundId', v_round_id, 'status', 'LISTENING', 'kind', p_kind,
    'candidateVersionId', p_candidate_version_id, 'referenceBeatRevisionId', p_reference_revision_id,
    'serverNow', now()
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_session_id, v_actor, 'start_vote', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_cast_wave_vote_v3(
  p_round_id uuid,
  p_choice public.wave_vote_choice_v3,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_session public.wave_sessions_v3%rowtype;
  v_round public.wave_vote_rounds_v3%rowtype;
  v_request_hash text;
  v_stored_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  select session_id into v_session_id from public.wave_vote_rounds_v3 where id = p_round_id;
  if v_session_id is null then raise exception using errcode = 'P0002', message = 'wave_vote_not_found'; end if;
  -- Ballots must not serialize the whole Wave aggregate. The primary key on
  -- (round_id, voter_id) is the atomic arbiter for concurrent/double votes.
  select * into v_session from public.wave_sessions_v3 where id = v_session_id;
  select * into v_round from public.wave_vote_rounds_v3 where id = p_round_id;
  v_request_hash := md5(p_round_id::text || ':' || p_choice::text);

  select receipt.request_hash, receipt.result into v_stored_hash, v_result
  from public.wave_idempotency_v3 receipt
  where receipt.session_id = v_session_id and receipt.actor_id = v_actor
    and receipt.command_name = 'cast_vote' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_request_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;

  if not public.rooms_wave_is_member_v3(v_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_vote_forbidden';
  end if;
  if not exists (select 1 from public.rooms_v2 room where room.id = v_session.room_id and room.status = 'live') then
    raise exception using errcode = '55000', message = 'wave_is_not_live';
  end if;
  if v_round.status not in ('LISTENING', 'OPEN') then
    raise exception using errcode = '55000', message = 'wave_vote_is_not_open';
  end if;
  if now() < v_round.opens_at then
    raise exception using errcode = '55000', message = 'wave_vote_listening_not_complete';
  end if;
  if now() >= v_round.closes_at then
    raise exception using errcode = '55000', message = 'wave_vote_window_closed';
  end if;
  if exists (select 1 from public.wave_votes_v3 vote where vote.round_id = p_round_id and vote.voter_id = v_actor) then
    raise exception using errcode = '23505', message = 'wave_vote_already_cast';
  end if;

  insert into public.wave_votes_v3(round_id, voter_id, choice) values (p_round_id, v_actor, p_choice);
  v_result := jsonb_build_object('roundId', p_round_id, 'accepted', true, 'serverCastAt', now());
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_session_id, v_actor, 'cast_vote', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_finalize_wave_vote_v3(
  p_round_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_session public.wave_sessions_v3%rowtype;
  v_round public.wave_vote_rounds_v3%rowtype;
  v_submission_id uuid;
  v_category_id uuid;
  v_total integer;
  v_approve integer;
  v_continue integer;
  v_approved boolean;
  v_revision_id uuid;
  v_activation_id uuid;
  v_revision_number integer;
  v_position integer;
  v_request_hash text;
  v_stored_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  select session_id into v_session_id from public.wave_vote_rounds_v3 where id = p_round_id;
  if v_session_id is null then raise exception using errcode = 'P0002', message = 'wave_vote_not_found'; end if;
  select * into v_session from public.wave_sessions_v3 where id = v_session_id for update;
  select * into v_round from public.wave_vote_rounds_v3 where id = p_round_id for update;
  if v_session.host_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  v_request_hash := md5(p_round_id::text || ':finalize');

  select receipt.request_hash, receipt.result into v_stored_hash, v_result
  from public.wave_idempotency_v3 receipt
  where receipt.session_id = v_session_id and receipt.actor_id = v_actor
    and receipt.command_name = 'finalize_vote' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_request_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;
  if v_round.status = 'FINALIZED' then
    raise exception using errcode = '55000', message = 'wave_vote_already_finalized';
  end if;
  if v_round.status not in ('LISTENING', 'OPEN') or now() < v_round.closes_at then
    raise exception using errcode = '55000', message = 'wave_vote_cannot_finalize_yet';
  end if;
  if v_session.current_beat_revision_id is distinct from v_round.reference_beat_revision_id then
    raise exception using errcode = '55000', message = 'wave_reference_revision_changed';
  end if;

  select count(*)::integer,
         count(*) filter (where vote.choice = 'APPROVE')::integer,
         count(*) filter (where vote.choice = 'CONTINUE')::integer
  into v_total, v_approve, v_continue
  from public.wave_votes_v3 vote where vote.round_id = p_round_id;
  v_approved := v_total >= v_round.quorum
    and v_total > 0
    and (v_approve::numeric / v_total::numeric) >= v_round.approval_threshold;

  select submission.id, submission.category_id into v_submission_id, v_category_id
  from public.wave_loop_versions_v3 version
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  where version.id = v_round.candidate_version_id
    and submission.session_id = v_session_id
    and submission.status = 'VOTING'
    and submission.current_version_number = version.version_number;
  if not found then
    raise exception using errcode = '55000', message = 'wave_locked_candidate_changed';
  end if;

  if v_approved then
    -- Acceptance occurs in the same transaction and before the track validation
    -- trigger. Any subsequent failure rolls the status change back as well.
    update public.wave_loop_submissions_v3 set status = 'ACCEPTED' where id = v_submission_id;
    select coalesce(max(revision.revision_number), 0) + 1 into v_revision_number
    from public.wave_beat_revisions_v3 revision where revision.session_id = v_session_id;
    insert into public.wave_beat_revisions_v3(
      session_id, revision_number, parent_revision_id, reason, source_vote_round_id,
      content_hash, created_by
    ) values (
      v_session_id, v_revision_number, v_round.reference_beat_revision_id,
      case when v_round.kind = 'ADMISSION' then 'ADMISSION' else 'REPLACEMENT' end,
      p_round_id,
      md5(v_round.reference_beat_revision_id::text || ':' || p_round_id::text || ':' || v_round.candidate_version_id::text),
      v_actor
    ) returning id into v_revision_id;

    insert into public.wave_beat_tracks_v3(
      beat_revision_id, category_id, slot_id, loop_version_id, position,
      gain, muted, is_host_base, provenance_vote_round_id
    )
    select v_revision_id, track.category_id, track.slot_id, track.loop_version_id, track.position,
           track.gain, track.muted, track.is_host_base, track.provenance_vote_round_id
    from public.wave_beat_tracks_v3 track
    where track.beat_revision_id = v_round.reference_beat_revision_id
      and (v_round.kind = 'ADMISSION' or track.id <> v_round.replaces_track_id);

    select coalesce(max(track.position), -1) + 1 into v_position
    from public.wave_beat_tracks_v3 track where track.beat_revision_id = v_revision_id;
    insert into public.wave_beat_tracks_v3(
      beat_revision_id, category_id, slot_id, loop_version_id, position,
      gain, muted, is_host_base, provenance_vote_round_id
    ) values (
      v_revision_id, v_category_id, v_round.target_slot_id, v_round.candidate_version_id,
      v_position, 1, false, false, p_round_id
    );
    update public.wave_slots_v3
    set state = 'OCCUPIED', accepted_version_id = v_round.candidate_version_id
    where id = v_round.target_slot_id;
    insert into public.wave_activation_queue_v5(
      session_id, source_vote_round_id, previous_revision_id, target_revision_id,
      candidate_version_id, quantization, state, requested_by
    ) values (
      v_session_id, p_round_id, v_round.reference_beat_revision_id, v_revision_id,
      v_round.candidate_version_id, 'CYCLE', 'PENDING_ACTIVATION', v_actor
    ) returning id into v_activation_id;
  else
    update public.wave_loop_submissions_v3 set status = 'NOT_SELECTED' where id = v_submission_id;
  end if;

  update public.wave_vote_rounds_v3
  set status = 'FINALIZED', approve_count = v_approve, continue_count = v_continue,
      approved = v_approved, finalization_key = p_idempotency_key, finalized_at = now()
  where id = p_round_id;
  update public.wave_sessions_v3 set active_vote_round_id = null, updated_at = now() where id = v_session_id;
  perform public.rooms_wave_append_event_v3(
    v_session_id, 'vote.result', v_actor, 'vote_round', p_round_id,
    jsonb_build_object(
      'approved', v_approved, 'approveCount', v_approve, 'continueCount', v_continue,
      'beatRevisionId', v_revision_id, 'activationId', v_activation_id,
      'candidateVersionId', v_round.candidate_version_id
    )
  );
  v_result := jsonb_build_object(
    'roundId', p_round_id, 'approved', v_approved, 'approveCount', v_approve,
    'continueCount', v_continue, 'totalVotes', v_total,
    'beatRevisionId', v_revision_id, 'activationId', v_activation_id, 'serverFinalizedAt', now()
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_session_id, v_actor, 'finalize_vote', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_change_wave_program_source_v3(
  p_session_id uuid,
  p_source public.wave_program_source_v3,
  p_revision_id uuid,
  p_asset_id uuid,
  p_rtc_publication_id text,
  p_render_status public.wave_render_status_v3,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.wave_sessions_v3%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_request_hash text;
  v_stored_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if not public.rooms_wave_is_control_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_control_required';
  end if;
  v_request_hash := md5(concat_ws(':', p_session_id, p_source, p_revision_id, p_asset_id, p_rtc_publication_id, p_render_status));
  select receipt.request_hash, receipt.result into v_stored_hash, v_result
  from public.wave_idempotency_v3 receipt
  where receipt.session_id = p_session_id and receipt.actor_id = v_actor
    and receipt.command_name = 'change_program_source' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_request_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;

  if p_source = 'HOST_DAW' then
    if length(btrim(coalesce(p_rtc_publication_id, ''))) = 0 or p_revision_id is not null or p_asset_id is not null then
      raise exception using errcode = '23514', message = 'wave_host_daw_source_invalid';
    end if;
  elsif p_source = 'SERVER_RENDER' then
    if p_revision_id is null or not exists (
      select 1 from public.wave_beat_revisions_v3 revision
      where revision.id = p_revision_id and revision.session_id = p_session_id
    ) then
      raise exception using errcode = '23514', message = 'wave_render_revision_invalid';
    end if;
    if p_render_status = 'READY' and (p_asset_id is null or not exists (
      select 1 from public.wave_audio_assets_v3 asset
      where asset.id = p_asset_id and asset.session_id = p_session_id
        and asset.kind = 'RENDER' and asset.status = 'READY'
    )) then
      raise exception using errcode = '23514', message = 'wave_render_asset_not_ready';
    end if;
    if p_rtc_publication_id is not null then
      raise exception using errcode = '23514', message = 'wave_render_cannot_use_rtc_publication';
    end if;
  else
    if p_revision_id is not null or p_asset_id is not null or p_rtc_publication_id is not null then
      raise exception using errcode = '23514', message = 'wave_silence_source_invalid';
    end if;
  end if;

  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_session_id for update;
  update public.wave_program_audio_state_v3
  set source = p_source,
      source_revision_id = case when p_source = 'SERVER_RENDER' then p_revision_id else null end,
      source_asset_id = case when p_source = 'SERVER_RENDER' then p_asset_id else null end,
      source_rtc_publication_id = case when p_source = 'HOST_DAW' then p_rtc_publication_id else null end,
      render_status = case when p_source = 'SERVER_RENDER' then p_render_status else 'IDLE' end,
      generation = v_program.generation + 1,
      changed_by = v_actor,
      changed_at = now()
  where session_id = p_session_id
  returning * into v_program;

  perform public.rooms_wave_append_event_v3(
    p_session_id, 'program_audio.changed', v_actor, 'program_audio', p_session_id,
    jsonb_build_object(
      'source', v_program.source, 'sourceRevisionId', v_program.source_revision_id,
      'sourceAssetId', v_program.source_asset_id, 'renderStatus', v_program.render_status,
      'generation', v_program.generation
    )
  );
  v_result := jsonb_build_object(
    'source', v_program.source, 'sourceRevisionId', v_program.source_revision_id,
    'sourceAssetId', v_program.source_asset_id, 'renderStatus', v_program.render_status,
    'generation', v_program.generation, 'changedAt', v_program.changed_at
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_session_id, v_actor, 'change_program_source', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_wave_reject_mutation_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = tg_table_name || '_is_append_only';
end;
$$;

drop trigger if exists wave_loop_versions_immutable_v3 on public.wave_loop_versions_v3;
create trigger wave_loop_versions_immutable_v3 before update or delete on public.wave_loop_versions_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_loop_analysis_immutable_v3 on public.wave_loop_analysis_v3;
create trigger wave_loop_analysis_immutable_v3 before update or delete on public.wave_loop_analysis_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_beat_revisions_immutable_v3 on public.wave_beat_revisions_v3;
create trigger wave_beat_revisions_immutable_v3 before update or delete on public.wave_beat_revisions_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_beat_tracks_immutable_v3 on public.wave_beat_tracks_v3;
create trigger wave_beat_tracks_immutable_v3 before update or delete on public.wave_beat_tracks_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_votes_immutable_v3 on public.wave_votes_v3;
create trigger wave_votes_immutable_v3 before update or delete on public.wave_votes_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_events_append_only_v3 on public.wave_event_v1;
create trigger wave_events_append_only_v3 before update or delete on public.wave_event_v1
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_consents_append_only_v3 on public.wave_rights_consents_v3;
create trigger wave_consents_append_only_v3 before update or delete on public.wave_rights_consents_v3
for each row execute function public.rooms_wave_reject_mutation_v3();
drop trigger if exists wave_moderation_append_only_v3 on public.wave_moderation_actions_v3;
create trigger wave_moderation_append_only_v3 before update or delete on public.wave_moderation_actions_v3
for each row execute function public.rooms_wave_reject_mutation_v3();

create or replace function public.rooms_wave_guard_vote_lock_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.session_id, new.kind, new.candidate_version_id, new.target_slot_id,
    new.replaces_track_id, new.reference_beat_revision_id, new.locked_preview_asset_id,
    new.listening_started_at, new.opens_at, new.closes_at, new.quorum, new.approval_threshold
  ) is distinct from row(
    old.session_id, old.kind, old.candidate_version_id, old.target_slot_id,
    old.replaces_track_id, old.reference_beat_revision_id, old.locked_preview_asset_id,
    old.listening_started_at, old.opens_at, old.closes_at, old.quorum, old.approval_threshold
  ) then
    raise exception using errcode = '55000', message = 'wave_vote_lock_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists wave_vote_lock_immutable_v3 on public.wave_vote_rounds_v3;
create trigger wave_vote_lock_immutable_v3 before update on public.wave_vote_rounds_v3
for each row execute function public.rooms_wave_guard_vote_lock_v3();

create or replace function public.rooms_wave_submission_transition_allowed_v3(
  p_from public.wave_loop_status_v3,
  p_to public.wave_loop_status_v3
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('UPLOADING', 'PROCESSING'), ('UPLOADING', 'REMOVED'),
    ('PROCESSING', 'RECEIVED'), ('PROCESSING', 'NEEDS_REVIEW'), ('PROCESSING', 'PROCESSING_FAILED'), ('PROCESSING', 'REMOVED'),
    ('PROCESSING_FAILED', 'UPLOADING'), ('PROCESSING_FAILED', 'REMOVED'),
    ('RECEIVED', 'NEEDS_REVIEW'), ('RECEIVED', 'NEEDS_CORRECTION'), ('RECEIVED', 'READY_FOR_VOTE'), ('RECEIVED', 'REJECTED'), ('RECEIVED', 'REMOVED'),
    ('NEEDS_REVIEW', 'NEEDS_CORRECTION'), ('NEEDS_REVIEW', 'READY_FOR_VOTE'), ('NEEDS_REVIEW', 'REJECTED'), ('NEEDS_REVIEW', 'REMOVED'),
    ('NEEDS_CORRECTION', 'PROCESSING'), ('NEEDS_CORRECTION', 'SUPERSEDED'), ('NEEDS_CORRECTION', 'REJECTED'), ('NEEDS_CORRECTION', 'REMOVED'),
    ('READY_FOR_VOTE', 'VOTING'), ('READY_FOR_VOTE', 'NEEDS_CORRECTION'), ('READY_FOR_VOTE', 'REJECTED'), ('READY_FOR_VOTE', 'REMOVED'),
    ('VOTING', 'ACCEPTED'), ('VOTING', 'NOT_SELECTED'), ('VOTING', 'READY_FOR_VOTE'),
    ('NOT_SELECTED', 'NEEDS_CORRECTION'), ('NOT_SELECTED', 'READY_FOR_VOTE'), ('NOT_SELECTED', 'REJECTED'), ('NOT_SELECTED', 'REMOVED'),
    ('ACCEPTED', 'REMOVED'), ('SUPERSEDED', 'REMOVED'), ('REJECTED', 'REMOVED')
  );
$$;

create or replace function public.rooms_wave_guard_submission_transition_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.session_id, new.category_id, new.contributor_id) is distinct from
     row(old.session_id, old.category_id, old.contributor_id) then
    raise exception using errcode = '55000', message = 'wave_submission_identity_immutable';
  end if;
  if old.status = 'VOTING' and new.current_version_number is distinct from old.current_version_number then
    raise exception using errcode = '55000', message = 'wave_vote_candidate_version_locked';
  end if;
  if not public.rooms_wave_submission_transition_allowed_v3(old.status, new.status) then
    raise exception using errcode = '23514', message = 'wave_submission_transition_forbidden';
  end if;
  if new.status in ('REJECTED', 'REMOVED') and exists (
    select 1
    from public.wave_sessions_v3 session
    join public.wave_beat_tracks_v3 track on track.beat_revision_id = session.current_beat_revision_id
    join public.wave_loop_versions_v3 version on version.id = track.loop_version_id
    where session.id = new.session_id and version.submission_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'wave_current_beat_contains_submission';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wave_submission_transition_v3 on public.wave_loop_submissions_v3;
create trigger wave_submission_transition_v3 before update on public.wave_loop_submissions_v3
for each row execute function public.rooms_wave_guard_submission_transition_v3();

create or replace function public.rooms_wave_validate_version_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_asset_session_id uuid;
  v_previous record;
begin
  select submission.session_id into v_session_id
  from public.wave_loop_submissions_v3 submission where submission.id = new.submission_id;
  select asset.session_id into v_asset_session_id
  from public.wave_audio_assets_v3 asset where asset.id = new.audio_asset_id;
  if v_session_id is null or v_asset_session_id is distinct from v_session_id then
    raise exception using errcode = '23514', message = 'wave_version_asset_cross_session';
  end if;
  if new.version_number = 1 then
    if new.supersedes_version_id is not null then
      raise exception using errcode = '23514', message = 'wave_first_version_cannot_supersede';
    end if;
  else
    select version.submission_id, version.version_number into v_previous
    from public.wave_loop_versions_v3 version where version.id = new.supersedes_version_id;
    if not found or v_previous.submission_id <> new.submission_id
       or v_previous.version_number <> new.version_number - 1 then
      raise exception using errcode = '23514', message = 'wave_version_chain_invalid';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists wave_version_chain_v3 on public.wave_loop_versions_v3;
create trigger wave_version_chain_v3 before insert on public.wave_loop_versions_v3
for each row execute function public.rooms_wave_validate_version_v3();

create or replace function public.rooms_wave_validate_consent_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_submission public.wave_loop_submissions_v3%rowtype;
begin
  select * into v_submission from public.wave_loop_submissions_v3 where id = new.submission_id;
  if not found or v_submission.session_id <> new.session_id
     or v_submission.contributor_id <> new.contributor_id then
    raise exception using errcode = '23514', message = 'wave_consent_subject_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists wave_consent_subject_v3 on public.wave_rights_consents_v3;
create trigger wave_consent_subject_v3 before insert on public.wave_rights_consents_v3
for each row execute function public.rooms_wave_validate_consent_v3();

create or replace function public.rooms_wave_validate_beat_track_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_revision_session uuid;
  v_version_session uuid;
  v_version_number integer;
  v_current_version integer;
  v_status public.wave_loop_status_v3;
  v_slot_session uuid;
begin
  select revision.session_id into v_revision_session
  from public.wave_beat_revisions_v3 revision
  where revision.id = new.beat_revision_id;

  select submission.session_id, version.version_number, submission.current_version_number, submission.status
  into v_version_session, v_version_number, v_current_version, v_status
  from public.wave_loop_versions_v3 version
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  where version.id = new.loop_version_id;

  if v_revision_session is null or v_version_session is distinct from v_revision_session then
    raise exception using errcode = '23514', message = 'wave_track_cross_session';
  end if;
  if v_status <> 'ACCEPTED' or v_version_number <> v_current_version then
    raise exception using errcode = '23514', message = 'wave_track_requires_exact_accepted_version';
  end if;

  if not new.is_host_base then
    select slot.session_id into v_slot_session from public.wave_slots_v3 slot where slot.id = new.slot_id;
    if v_slot_session is distinct from v_revision_session then
      raise exception using errcode = '23514', message = 'wave_track_slot_cross_session';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists wave_beat_track_acceptance_v3 on public.wave_beat_tracks_v3;
create trigger wave_beat_track_acceptance_v3 before insert on public.wave_beat_tracks_v3
for each row execute function public.rooms_wave_validate_beat_track_v3();

create or replace function public.rooms_get_wave_snapshot_v3(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.wave_sessions_v3%rowtype;
  v_control boolean;
  v_categories jsonb;
  v_submissions jsonb;
  v_beat jsonb;
  v_vote jsonb;
  v_program jsonb;
begin
  select * into v_session from public.wave_sessions_v3 where id = p_session_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'wave_session_not_found';
  end if;
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_snapshot_forbidden';
  end if;
  v_control := public.rooms_wave_is_control_v3(p_session_id, v_actor);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', category.id,
      'code', category.code,
      'label', category.label,
      'position', category.position,
      'minSlots', category.min_slots,
      'maxSlots', category.max_slots,
      'required', category.required,
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', slot.id,
          'index', slot.slot_index,
          'label', slot.label,
          'state', slot.state,
          'acceptedVersionId', slot.accepted_version_id
        ) order by slot.slot_index)
        from public.wave_slots_v3 slot
        where slot.category_id = category.id
      ), '[]'::jsonb)
    ) order by category.position
  ), '[]'::jsonb) into v_categories
  from public.wave_categories_v3 category
  where category.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', submission.id,
    'categoryId', submission.category_id,
    'requestedSlotId', submission.requested_slot_id,
    'contributorId', submission.contributor_id,
    'creditName', submission.credit_name,
    'title', submission.title,
    'status', submission.status,
    'statusReason', case when v_control then submission.status_reason else null end,
    'currentVersionNumber', submission.current_version_number,
    'submittedAt', submission.submitted_at,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'assetId', version.audio_asset_id,
        'supersedesVersionId', version.supersedes_version_id,
        'declaredBpm', version.declared_bpm,
        'declaredKey', version.declared_key,
        'declaredBars', version.declared_bars,
        'analysis', (
          select jsonb_build_object(
            'compatibility', analysis.compatibility,
            'estimatedBpm', analysis.estimated_bpm,
            'estimatedKey', analysis.estimated_key,
            'estimatedBars', analysis.estimated_bars,
            'sampleRate', analysis.sample_rate,
            'bitDepth', analysis.bit_depth,
            'channels', analysis.channels,
            'loudnessLufs', analysis.loudness_lufs,
            'peakDbfs', analysis.peak_dbfs,
            'clipped', analysis.clipped,
            'excessiveSilence', analysis.excessive_silence,
            'corrupt', analysis.corrupt,
            'analyzedAt', analysis.analyzed_at
          )
          from public.wave_loop_analysis_v3 analysis
          where analysis.loop_version_id = version.id
          order by analysis.attempt desc limit 1
        ),
        'createdAt', version.created_at
      ) order by version.version_number)
      from public.wave_loop_versions_v3 version
      where version.submission_id = submission.id
    ), '[]'::jsonb)
  ) order by submission.submitted_at), '[]'::jsonb) into v_submissions
  from public.wave_loop_submissions_v3 submission
  where submission.session_id = p_session_id
    and (v_control or submission.contributor_id = v_actor);

  select jsonb_build_object(
    'id', revision.id,
    'revisionNumber', revision.revision_number,
    'parentRevisionId', revision.parent_revision_id,
    'reason', revision.reason,
    'renderAssetId', revision.render_asset_id,
    'renderStatus', revision.render_status,
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', track.id,
        'categoryId', track.category_id,
        'slotId', track.slot_id,
        'loopVersionId', track.loop_version_id,
        'position', track.position,
        'gain', track.gain,
        'muted', track.muted,
        'isHostBase', track.is_host_base,
        'creditName', submission.credit_name,
        'contributorId', submission.contributor_id
      ) order by track.position)
      from public.wave_beat_tracks_v3 track
      join public.wave_loop_versions_v3 version on version.id = track.loop_version_id
      join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
      where track.beat_revision_id = revision.id
    ), '[]'::jsonb),
    'createdAt', revision.created_at
  ) into v_beat
  from public.wave_beat_revisions_v3 revision
  where revision.id = v_session.current_beat_revision_id;

  select jsonb_build_object(
    'id', round.id,
    'kind', round.kind,
    'status', round.status,
    'candidateVersionId', round.candidate_version_id,
    'targetSlotId', round.target_slot_id,
    'replacesTrackId', round.replaces_track_id,
    'referenceBeatRevisionId', round.reference_beat_revision_id,
    'previewAssetId', round.locked_preview_asset_id,
    'listeningStartedAt', round.listening_started_at,
    'opensAt', round.opens_at,
    'closesAt', round.closes_at,
    'quorum', round.quorum,
    'approvalThreshold', round.approval_threshold,
    'totalVotes', (select count(*) from public.wave_votes_v3 vote where vote.round_id = round.id),
    'approveCount', case when round.status = 'FINALIZED' then round.approve_count else null end,
    'continueCount', case when round.status = 'FINALIZED' then round.continue_count else null end,
    'approved', case when round.status = 'FINALIZED' then round.approved else null end
  ) into v_vote
  from public.wave_vote_rounds_v3 round
  where round.id = v_session.active_vote_round_id
     or (round.session_id = p_session_id and round.status = 'FINALIZED')
  order by (round.id = v_session.active_vote_round_id) desc, round.created_at desc
  limit 1;

  select jsonb_build_object(
    'source', program.source,
    'sourceRevisionId', program.source_revision_id,
    'sourceAssetId', program.source_asset_id,
    'sourceRtcPublicationId', case when v_control then program.source_rtc_publication_id else null end,
    'renderStatus', program.render_status,
    'generation', program.generation,
    'changedAt', program.changed_at
  ) into v_program
  from public.wave_program_audio_state_v3 program
  where program.session_id = p_session_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'roomId', v_session.room_id,
      'status', v_session.status,
      'rulesVersion', v_session.rules_version,
      'bpm', v_session.bpm,
      'musicalKey', v_session.musical_key,
      'timeSignature', v_session.time_signature,
      'expectedBars', v_session.expected_bars,
      'maxDurationMs', v_session.max_duration_ms,
      'acceptedMimeTypes', to_jsonb(v_session.accepted_mime_types),
      'desiredLoopTypes', to_jsonb(v_session.desired_loop_types),
      'effectsPolicy', v_session.effects_policy,
      'recommendedLufs', v_session.recommended_lufs,
      'rulesLockedAt', v_session.rules_locked_at,
      'cursor', v_session.event_sequence
    ),
    'categories', v_categories,
    'submissions', v_submissions,
    'beat', coalesce(v_beat, 'null'::jsonb),
    'vote', coalesce(v_vote, 'null'::jsonb),
    'programAudio', coalesce(v_program, 'null'::jsonb)
  );
end;
$$;

create or replace function public.rooms_initialize_wave_production_v3(
  p_room_id uuid,
  p_rules jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.wave_sessions_v3%rowtype;
  v_revision_id uuid;
  v_category jsonb;
  v_category_id uuid;
  v_category_position integer := 0;
  v_slot_index integer;
  v_slot_count integer;
  v_accepted_mime_types text[];
  v_desired_loop_types text[];
  v_request_hash text;
  v_result jsonb;
  v_stored_hash text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if jsonb_typeof(p_rules) <> 'object' or jsonb_typeof(p_rules->'categories') <> 'array'
     or jsonb_array_length(p_rules->'categories') = 0 then
    raise exception using errcode = '22023', message = 'wave_rules_categories_required';
  end if;

  select * into v_room from public.rooms_v2 where id = p_room_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if not public.rooms_specialized_is_control_v1(p_room_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_control_required';
  end if;
  if lower(replace(v_room.type, '_', ' ')) not in ('wave', 'la wave')
     and not exists (
       select 1 from public.room_specialized_state_v1 specialized
       where specialized.room_id = p_room_id and specialized.room_type = 'wave'
     ) then
    raise exception using errcode = '23514', message = 'room_is_not_wave';
  end if;

  select * into v_session from public.wave_sessions_v3 where room_id = p_room_id;
  if found then
    select receipt.request_hash, receipt.result into v_stored_hash, v_result
    from public.wave_idempotency_v3 receipt
    where receipt.session_id = v_session.id and receipt.actor_id = v_actor
      and receipt.command_name = 'initialize' and receipt.idempotency_key = p_idempotency_key;
    if found then return v_result; end if;
    return public.rooms_get_wave_snapshot_v3(v_session.id);
  end if;

  select coalesce(array_agg(value), array[]::text[]) into v_accepted_mime_types
  from jsonb_array_elements_text(coalesce(p_rules->'acceptedMimeTypes', '["audio/wav","audio/flac"]'::jsonb));
  select coalesce(array_agg(value), array[]::text[]) into v_desired_loop_types
  from jsonb_array_elements_text(coalesce(p_rules->'desiredLoopTypes', '["drums","bass","melody","vocal"]'::jsonb));

  insert into public.wave_sessions_v3(
    room_id, host_id, status, bpm, musical_key, time_signature, expected_bars,
    max_duration_ms, accepted_mime_types, desired_loop_types, effects_policy,
    recommended_lufs, rules_locked_at
  ) values (
    p_room_id, v_room.host_id, 'READY',
    (p_rules->>'bpm')::numeric,
    p_rules->>'musicalKey',
    coalesce(nullif(p_rules->>'timeSignature', ''), '4/4'),
    (p_rules->>'expectedBars')::integer,
    (p_rules->>'maxDurationMs')::integer,
    v_accepted_mime_types,
    v_desired_loop_types,
    upper(coalesce(nullif(p_rules->>'effectsPolicy', ''), 'EITHER')),
    nullif(p_rules->>'recommendedLufs', '')::numeric,
    now()
  ) returning * into v_session;

  for v_category in select value from jsonb_array_elements(p_rules->'categories') loop
    v_slot_count := coalesce((v_category->>'maxSlots')::integer, 1);
    insert into public.wave_categories_v3(session_id, code, label, position, min_slots, max_slots, required)
    values (
      v_session.id,
      lower(v_category->>'code'),
      v_category->>'label',
      coalesce((v_category->>'position')::integer, v_category_position),
      coalesce((v_category->>'minSlots')::integer, 0),
      v_slot_count,
      coalesce((v_category->>'required')::boolean, false)
    ) returning id into v_category_id;

    for v_slot_index in 0..(v_slot_count - 1) loop
      insert into public.wave_slots_v3(session_id, category_id, slot_index, label)
      values (v_session.id, v_category_id, v_slot_index, (v_category->>'label') || ' ' || (v_slot_index + 1));
    end loop;
    v_category_position := v_category_position + 1;
  end loop;

  insert into public.wave_beat_revisions_v3(
    session_id, revision_number, reason, content_hash, created_by
  ) values (
    v_session.id, 1, 'INITIAL', md5(v_session.id::text || ':initial'), v_actor
  ) returning id into v_revision_id;

  update public.wave_sessions_v3 set current_beat_revision_id = v_revision_id where id = v_session.id;
  insert into public.wave_program_audio_state_v3(
    session_id, source, source_rtc_publication_id, render_status, changed_by
  ) values (
    -- Fail closed until the media coordinator attests a real publication and
    -- detects a non-silent DAW audio level. Never synthesize a publication ID.
    v_session.id, 'SILENCE', null, 'IDLE', v_actor
  );

  perform public.rooms_wave_append_event_v3(
    v_session.id, 'wave.started', v_actor, 'session', v_session.id,
    jsonb_build_object('roomId', p_room_id, 'rulesVersion', 1, 'beatRevisionId', v_revision_id)
  );
  v_result := public.rooms_get_wave_snapshot_v3(v_session.id);
  v_request_hash := md5(p_room_id::text || coalesce(p_rules::text, 'null'));
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_session.id, v_actor, 'initialize', p_idempotency_key, v_request_hash, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then
    raise exception using errcode = '22023', message = 'invalid_wave_rules';
end;
$$;

create or replace function public.rooms_wave_program_audio_projection_v1(p_wave_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'waveId', program.session_id,
    -- Never disguise the internal fail-safe SILENCE state as a ready render.
    'source', program.source::text,
    'beatRevisionId', case
      when program.source = 'SERVER_RENDER' then program.source_revision_id
      else null
    end,
    'musicalPositionBeats', program.musical_position_beats,
    'changedAt', program.changed_at,
    'changedBy', program.changed_by,
    'sequence', program.generation,
    'transitionMs', program.transition_ms
  )
  from public.wave_program_audio_state_v3 program
  join public.wave_sessions_v3 session on session.id = program.session_id
  where program.session_id = p_wave_id;
$$;

-- Stable public contract consumed by src/features/rooms/wave-infra.
-- SERVER_RENDER is only selectable after a worker registered a READY render;
-- the RPC never asks a browser to reconstruct stems independently.
create or replace function public.rooms_wave_switch_program_audio_v1(
  p_wave_id uuid,
  p_source text,
  p_expected_sequence bigint,
  p_idempotency_key text,
  p_beat_revision_id uuid,
  p_musical_position_beats numeric,
  p_transition_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.wave_actor_id', true), '')::uuid);
  v_session public.wave_sessions_v3%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_render_asset_id uuid;
  v_request_hash text;
  v_stored_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_source not in ('SERVER_RENDER', 'HOST_DAW') then
    raise exception using errcode = '22023', message = 'wave_program_source_invalid';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160
     or p_expected_sequence < 1 or p_musical_position_beats < 0
     or p_transition_ms not between 0 and 2000 then
    raise exception using errcode = '22023', message = 'wave_program_command_invalid';
  end if;

  select * into v_session from public.wave_sessions_v3 where id = p_wave_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if v_session.host_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_wave_id for update;
  v_request_hash := md5(concat_ws(':', p_wave_id, p_source, p_expected_sequence,
    p_beat_revision_id, p_musical_position_beats, p_transition_ms));

  select receipt.request_hash, receipt.result into v_stored_hash, v_result
  from public.wave_idempotency_v3 receipt
  where receipt.session_id = p_wave_id and receipt.actor_id = v_actor
    and receipt.command_name = 'switch_program_audio_v1' and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_request_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;
  if v_program.generation <> p_expected_sequence then
    raise exception using errcode = '40001', message = 'wave_program_sequence_conflict';
  end if;

  if p_source = 'SERVER_RENDER' then
    if p_beat_revision_id is null then
      raise exception using errcode = '22023', message = 'wave_render_revision_required';
    end if;
    select revision.render_asset_id into v_render_asset_id
    from public.wave_beat_revisions_v3 revision
    join public.wave_audio_assets_v3 asset on asset.id = revision.render_asset_id
    where revision.id = p_beat_revision_id and revision.session_id = p_wave_id
      and revision.render_status = 'READY' and asset.kind = 'RENDER' and asset.status = 'READY';
    if v_render_asset_id is null then
      raise exception using errcode = '55000', message = 'wave_render_not_ready';
    end if;
    update public.wave_program_audio_state_v3
    set source = 'SERVER_RENDER', source_revision_id = p_beat_revision_id,
        source_asset_id = v_render_asset_id, source_rtc_publication_id = null,
        render_status = 'READY', musical_position_beats = p_musical_position_beats,
        transition_ms = p_transition_ms, generation = generation + 1,
        changed_by = v_actor, changed_at = now()
    where session_id = p_wave_id;
  else
    -- v3 cannot attest a real DAW publication or audio level. Fail closed;
    -- the additive runtime coordinator installs the fenced/quantized handler.
    raise exception using errcode = '55000', message = 'wave_runtime_coordinator_required';
  end if;

  perform public.rooms_wave_append_event_v3(
    p_wave_id, 'program_audio.changed', v_actor, 'program_audio', p_wave_id,
    jsonb_build_object(
      'source', p_source, 'beatRevisionId', p_beat_revision_id,
      'musicalPositionBeats', p_musical_position_beats, 'transitionMs', p_transition_ms
    ),
    p_idempotency_key
  );
  v_result := jsonb_build_object(
    'correlationId', p_idempotency_key,
    'data', public.rooms_wave_program_audio_projection_v1(p_wave_id)
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_wave_id, v_actor, 'switch_program_audio_v1', p_idempotency_key, v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_wave_recover_v1(
  p_wave_id uuid,
  p_after_sequence bigint,
  p_after_event_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.wave_sessions_v3%rowtype;
  v_snapshot jsonb;
  v_events jsonb;
  v_cursor_event_id uuid;
  v_permissions text[];
begin
  if p_after_sequence < 0 or p_correlation_id is null or length(p_correlation_id) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'wave_recovery_cursor_invalid';
  end if;
  select * into v_session from public.wave_sessions_v3 where id = p_wave_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if not public.rooms_wave_is_member_v3(p_wave_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_recovery_forbidden';
  end if;
  if p_after_event_id is not null and not exists (
    select 1 from public.wave_event_v1 event
    where event.wave_id = p_wave_id and event.sequence = p_after_sequence and event.id = p_after_event_id
  ) then
    raise exception using errcode = '22023', message = 'wave_recovery_cursor_mismatch';
  end if;

  v_permissions := case when public.rooms_wave_is_control_v3(p_wave_id, v_actor)
    then array['wave:read', 'wave:vote', 'wave:control']::text[]
    else array['wave:read', 'wave:vote']::text[] end;
  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'waveId', v_session.id,
    'roomId', v_session.room_id,
    'sequence', v_session.event_sequence,
    'generatedAt', now(),
    'programAudio', public.rooms_wave_program_audio_projection_v1(p_wave_id),
    'permissions', to_jsonb(v_permissions),
    'state', public.rooms_get_wave_snapshot_v3(p_wave_id)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'waveId', event.wave_id,
    'sequence', event.sequence,
    'type', event.type,
    'actorId', event.actor_id,
    'correlationId', event.correlation_id,
    'occurredAt', event.occurred_at,
    'payload', event.payload
  ) order by event.sequence), '[]'::jsonb) into v_events
  from public.wave_event_v1 event
  where event.wave_id = p_wave_id
    and event.sequence > p_after_sequence
    and event.sequence <= v_session.event_sequence;

  select event.id into v_cursor_event_id
  from public.wave_event_v1 event
  where event.wave_id = p_wave_id and event.sequence <= v_session.event_sequence
  order by event.sequence desc limit 1;

  return jsonb_build_object(
    'correlationId', p_correlation_id,
    'data', jsonb_build_object(
      'snapshot', v_snapshot,
      'events', v_events,
      'cursor', jsonb_build_object(
        'waveId', p_wave_id,
        'sequence', v_session.event_sequence,
        'eventId', v_cursor_event_id
      )
    )
  );
end;
$$;

-- Private by default. Authenticated clients use the transaction RPCs and the
-- projected snapshot; workers keep service_role access for assets/analysis.
alter table public.wave_sessions_v3 enable row level security;
alter table public.wave_categories_v3 enable row level security;
alter table public.wave_submission_allowances_v3 enable row level security;
alter table public.wave_slots_v3 enable row level security;
alter table public.wave_loop_submissions_v3 enable row level security;
alter table public.wave_audio_assets_v3 enable row level security;
alter table public.wave_loop_versions_v3 enable row level security;
alter table public.wave_loop_analysis_v3 enable row level security;
alter table public.wave_beat_revisions_v3 enable row level security;
alter table public.wave_beat_tracks_v3 enable row level security;
alter table public.wave_vote_rounds_v3 enable row level security;
alter table public.wave_votes_v3 enable row level security;
alter table public.wave_program_audio_state_v3 enable row level security;
alter table public.wave_event_v1 enable row level security;
alter table public.wave_idempotency_v3 enable row level security;
alter table public.wave_rights_consents_v3 enable row level security;
alter table public.wave_moderation_actions_v3 enable row level security;

alter table public.wave_event_v1 replica identity full;
drop policy if exists wave_event_member_read_v1 on public.wave_event_v1;
create policy wave_event_member_read_v1
on public.wave_event_v1
for select
to authenticated
using (public.rooms_wave_is_member_v3(wave_id, auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wave_event_v1'
     ) then
    alter publication supabase_realtime add table public.wave_event_v1;
  end if;
end;
$$;

revoke all on table
  public.wave_sessions_v3,
  public.wave_categories_v3,
  public.wave_submission_allowances_v3,
  public.wave_slots_v3,
  public.wave_loop_submissions_v3,
  public.wave_audio_assets_v3,
  public.wave_loop_versions_v3,
  public.wave_loop_analysis_v3,
  public.wave_beat_revisions_v3,
  public.wave_beat_tracks_v3,
  public.wave_vote_rounds_v3,
  public.wave_votes_v3,
  public.wave_program_audio_state_v3,
  public.wave_event_v1,
  public.wave_idempotency_v3,
  public.wave_rights_consents_v3,
  public.wave_moderation_actions_v3
from public, anon, authenticated;

grant all on table
  public.wave_sessions_v3,
  public.wave_categories_v3,
  public.wave_submission_allowances_v3,
  public.wave_slots_v3,
  public.wave_loop_submissions_v3,
  public.wave_audio_assets_v3,
  public.wave_loop_versions_v3,
  public.wave_loop_analysis_v3,
  public.wave_beat_revisions_v3,
  public.wave_beat_tracks_v3,
  public.wave_vote_rounds_v3,
  public.wave_votes_v3,
  public.wave_program_audio_state_v3,
  public.wave_event_v1,
  public.wave_idempotency_v3,
  public.wave_rights_consents_v3,
  public.wave_moderation_actions_v3
to service_role;

grant select on table public.wave_event_v1 to authenticated;

revoke all on function public.rooms_wave_is_control_v3(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rooms_wave_is_member_v3(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rooms_wave_append_event_v3(uuid, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_reject_mutation_v3() from public, anon, authenticated;
revoke all on function public.rooms_wave_guard_vote_lock_v3() from public, anon, authenticated;
revoke all on function public.rooms_wave_submission_transition_allowed_v3(public.wave_loop_status_v3, public.wave_loop_status_v3) from public, anon, authenticated;
revoke all on function public.rooms_wave_guard_submission_transition_v3() from public, anon, authenticated;
revoke all on function public.rooms_wave_validate_beat_track_v3() from public, anon, authenticated;
revoke all on function public.rooms_wave_program_audio_projection_v1(uuid) from public, anon, authenticated;

grant execute on function public.rooms_wave_is_control_v3(uuid, uuid) to service_role;
grant execute on function public.rooms_wave_is_member_v3(uuid, uuid) to authenticated, service_role;
grant execute on function public.rooms_wave_append_event_v3(uuid, text, uuid, text, uuid, jsonb, text) to service_role;
grant execute on function public.rooms_wave_submission_transition_allowed_v3(public.wave_loop_status_v3, public.wave_loop_status_v3) to service_role;
grant execute on function public.rooms_wave_program_audio_projection_v1(uuid) to service_role;

revoke all on function public.rooms_get_wave_snapshot_v3(uuid) from public, anon;
revoke all on function public.rooms_initialize_wave_production_v3(uuid, jsonb, text) from public, anon;
revoke all on function public.rooms_start_wave_vote_v3(uuid, public.wave_vote_kind_v3, uuid, uuid, uuid, uuid, integer, integer, integer, numeric, text) from public, anon;
revoke all on function public.rooms_cast_wave_vote_v3(uuid, public.wave_vote_choice_v3, text) from public, anon;
revoke all on function public.rooms_finalize_wave_vote_v3(uuid, text) from public, anon;
revoke all on function public.rooms_change_wave_program_source_v3(uuid, public.wave_program_source_v3, uuid, uuid, text, public.wave_render_status_v3, text) from public, anon;
revoke all on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer) from public, anon;
revoke all on function public.rooms_wave_recover_v1(uuid, bigint, uuid, text) from public, anon;

grant execute on function public.rooms_get_wave_snapshot_v3(uuid) to authenticated, service_role;
grant execute on function public.rooms_initialize_wave_production_v3(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.rooms_start_wave_vote_v3(uuid, public.wave_vote_kind_v3, uuid, uuid, uuid, uuid, integer, integer, integer, numeric, text) to authenticated, service_role;
grant execute on function public.rooms_cast_wave_vote_v3(uuid, public.wave_vote_choice_v3, text) to authenticated, service_role;
grant execute on function public.rooms_finalize_wave_vote_v3(uuid, text) to authenticated, service_role;
grant execute on function public.rooms_change_wave_program_source_v3(uuid, public.wave_program_source_v3, uuid, uuid, text, public.wave_render_status_v3, text) to service_role;
grant execute on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer) to service_role;
grant execute on function public.rooms_wave_recover_v1(uuid, bigint, uuid, text) to authenticated, service_role;

grant usage on type
  public.wave_session_status_v3,
  public.wave_loop_status_v3,
  public.wave_vote_kind_v3,
  public.wave_vote_status_v3,
  public.wave_vote_choice_v3,
  public.wave_program_source_v3,
  public.wave_asset_kind_v3,
  public.wave_asset_status_v3,
  public.wave_compatibility_v3,
  public.wave_render_status_v3
to authenticated, service_role;

comment on table public.wave_audio_assets_v3 is
  'Private Wave artifact registry. Storage coordinates are service-role only; client snapshots expose opaque IDs, never public URLs.';
comment on table public.wave_beat_revisions_v3 is
  'Immutable Wave beat ledger. Every admission/replacement creates a new revision; no destructive editing.';
comment on table public.wave_event_v1 is
  'Append-only per-session event log with server-allocated monotonic sequence for deterministic reconnect.';
comment on table public.wave_program_audio_state_v3 is
  'Control-plane identity of the official program source. This table is not an audio engine.';
