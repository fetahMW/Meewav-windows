-- P0 runtime invariants for the normalized Wave production core.
-- Host artistic authority, private audition, quantized activation, ballot
-- eligibility, coordinator fencing and privacy are additive to v3/v4.

alter type public.wave_asset_kind_v3 add value if not exists 'PLAYBACK_DERIVATIVE';
alter type public.wave_asset_kind_v3 add value if not exists 'PREVIEW_DERIVATIVE';

do $$ begin
  create type public.wave_activation_state_v5 as enum ('PENDING_ACTIVATION', 'ACTIVE', 'SUPERSEDED', 'FAILED', 'CANCELLED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.wave_quantization_v5 as enum ('MEASURE', 'CYCLE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.wave_audition_state_v5 as enum ('REQUESTED', 'READY', 'PLAYING', 'STOPPED', 'FAILED');
exception when duplicate_object then null; end $$;

alter table public.wave_sessions_v3
  add column if not exists final_beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  add column if not exists production_mix_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  add column if not exists finalized_at timestamptz;

create unique index if not exists wave_one_active_session_per_host_v5
on public.wave_sessions_v3(host_id)
where status in ('DRAFT', 'READY', 'LIVE', 'PAUSED');

alter table public.wave_audio_assets_v3
  add column if not exists original_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  add column if not exists sample_rate integer check (sample_rate is null or sample_rate between 8000 and 384000),
  add column if not exists channel_count integer check (channel_count is null or channel_count between 1 and 16),
  add column if not exists canonical_codec text,
  add column if not exists canonical_container text;

create table if not exists public.wave_vote_policy_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  dynamic_quorum_ratio numeric(5,4) not null default 0.15 check (dynamic_quorum_ratio > 0 and dynamic_quorum_ratio <= 1),
  minimum_quorum integer not null default 3 check (minimum_quorum > 0),
  require_full_preview boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_musical_clock_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  bpm numeric(7,3) not null check (bpm between 20 and 400),
  time_signature text not null check (time_signature ~ '^[1-9][0-9]?/[124816]$'),
  cycle_bars integer not null check (cycle_bars between 1 and 64),
  current_bar bigint not null default 1 check (current_bar > 0),
  current_beat numeric(8,4) not null default 1 check (current_beat >= 1),
  media_time_seconds numeric(16,6) not null default 0 check (media_time_seconds >= 0),
  anchor_at timestamptz not null default now(),
  fencing_epoch bigint not null default 1 check (fencing_epoch > 0),
  updated_by text not null default 'INITIALIZE',
  updated_at timestamptz not null default now()
);

insert into public.wave_musical_clock_v5(session_id, bpm, time_signature, cycle_bars)
select session.id, session.bpm, session.time_signature, least(greatest(session.expected_bars, 1), 64)
from public.wave_sessions_v3 session
on conflict (session_id) do nothing;

insert into public.wave_vote_policy_v5(session_id)
select session.id from public.wave_sessions_v3 session
on conflict (session_id) do nothing;

create table if not exists public.wave_vote_previews_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  candidate_version_id uuid not null references public.wave_loop_versions_v3(id) on delete restrict,
  reference_beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  asset_id uuid not null unique references public.wave_audio_assets_v3(id) on delete restrict,
  mode text not null check (mode in ('SOLO', 'WITH_BEAT')),
  status text not null check (status in ('REQUESTED', 'PROCESSING', 'READY', 'FAILED')),
  full_duration_ms integer not null check (full_duration_ms > 0),
  content_hash text not null check (length(content_hash) between 16 and 256),
  clock_epoch bigint not null check (clock_epoch > 0),
  quantization public.wave_quantization_v5 not null default 'CYCLE',
  created_at timestamptz not null default now(),
  unique(candidate_version_id, reference_beat_revision_id, mode)
);

create table if not exists public.wave_private_auditions_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  reference_beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  candidate_version_id uuid not null references public.wave_loop_versions_v3(id) on delete restrict,
  preview_id uuid not null references public.wave_vote_previews_v5(id) on delete restrict,
  state public.wave_audition_state_v5 not null default 'REQUESTED',
  requested_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  check (stopped_at is null or started_at is not null),
  unique(session_id, id)
);

create unique index if not exists wave_one_private_audition_v5
on public.wave_private_auditions_v5(session_id)
where state in ('REQUESTED', 'READY', 'PLAYING');

create table if not exists public.wave_activation_queue_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  source_vote_round_id uuid references public.wave_vote_rounds_v3(id) on delete restrict,
  previous_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  target_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  candidate_version_id uuid references public.wave_loop_versions_v3(id) on delete restrict,
  quantization public.wave_quantization_v5 not null default 'CYCLE',
  state public.wave_activation_state_v5 not null default 'PENDING_ACTIVATION',
  target_clock_epoch bigint,
  target_bar bigint,
  target_beat numeric(8,4) not null default 1,
  target_media_time_seconds numeric(16,6),
  render_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 160),
  activated_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  check (
    (state in ('ACTIVE', 'SUPERSEDED') and activated_at is not null and render_asset_id is not null and failure_code is null)
    or (state = 'FAILED' and failure_code is not null and activated_at is null)
    or (state in ('PENDING_ACTIVATION', 'CANCELLED') and activated_at is null)
  )
);
create unique index if not exists wave_activation_idempotency_v5
on public.wave_activation_queue_v5(session_id, idempotency_key) where idempotency_key is not null;

create unique index if not exists wave_one_pending_activation_v5
on public.wave_activation_queue_v5(session_id)
where state = 'PENDING_ACTIVATION';
create unique index if not exists wave_one_active_activation_v5
on public.wave_activation_queue_v5(session_id)
where state = 'ACTIVE';

create table if not exists public.wave_program_switch_queue_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  source text not null check (source in ('HOST_DAW')),
  rtc_publication_id text not null check (length(rtc_publication_id) between 3 and 512),
  expected_program_generation bigint not null check (expected_program_generation > 0),
  target_clock_epoch bigint not null check (target_clock_epoch > 0),
  target_bar bigint not null check (target_bar > 0),
  target_at timestamptz not null,
  musical_position_beats numeric(16,6) not null default 0 check (musical_position_beats >= 0),
  transition_ms integer not null default 120 check (transition_ms between 0 and 2000),
  state text not null default 'PENDING' check (state in ('PENDING','ACTIVE','SUPERSEDED','FAILED','CANCELLED')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  failure_code text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, idempotency_key),
  check ((state = 'ACTIVE') = (activated_at is not null))
);
create unique index if not exists wave_one_pending_program_switch_v5
on public.wave_program_switch_queue_v5(session_id) where state = 'PENDING';

create table if not exists public.wave_program_switch_intents_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  source text not null check (source in ('SERVER_RENDER','HOST_DAW')),
  beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  expected_program_generation bigint not null check (expected_program_generation > 0),
  musical_position_beats numeric(16,6) not null default 0 check (musical_position_beats >= 0),
  transition_ms integer not null default 120 check (transition_ms between 0 and 2000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  state text not null default 'REQUESTED' check (state in ('REQUESTED','ENQUEUED','APPLIED','REJECTED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, requested_by, idempotency_key),
  check ((source = 'SERVER_RENDER') = (beat_revision_id is not null))
);

create table if not exists public.wave_vote_listen_receipts_v5 (
  round_id uuid not null references public.wave_vote_rounds_v3(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete restrict,
  preview_id uuid not null references public.wave_vote_previews_v5(id) on delete restrict,
  listening_started_at timestamptz not null,
  listening_completed_at timestamptz,
  heard_ms integer not null default 0 check (heard_ms >= 0),
  eligible boolean not null default false,
  server_stream_delay_ms integer not null default 0 check (server_stream_delay_ms between 0 and 120000),
  receipt_token_hash text not null check (length(receipt_token_hash) between 16 and 256),
  primary key(round_id, voter_id),
  check (listening_completed_at is null or listening_completed_at >= listening_started_at)
);

create table if not exists public.wave_coordinator_leases_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  region text not null check (length(region) between 2 and 64),
  holder_id text not null check (length(holder_id) between 3 and 160),
  lease_token uuid not null unique,
  fencing_epoch bigint not null check (fencing_epoch > 0),
  leased_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > leased_at)
);

create table if not exists public.wave_transactional_outbox_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  fencing_epoch bigint not null check (fencing_epoch > 0),
  topic text not null check (length(topic) between 3 and 120),
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 131072),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  available_at timestamptz not null default now(),
  lease_token uuid,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check ((status = 'SENT') = (sent_at is not null))
);

create index if not exists wave_outbox_due_v5 on public.wave_transactional_outbox_v5(available_at, created_at)
where status in ('PENDING', 'FAILED');

create table if not exists public.wave_slot_reservations_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  category_id uuid not null references public.wave_categories_v3(id) on delete cascade,
  slot_id uuid not null references public.wave_slots_v3(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete cascade,
  reservation_token uuid not null unique default gen_random_uuid(),
  status text not null default 'RESERVED' check (status in ('RESERVED', 'CONSUMED', 'EXPIRED', 'RELEASED')),
  credit_cost integer not null default 1 check (credit_cost > 0),
  issued_while_category_open boolean not null,
  reserved_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  upload_may_complete_until timestamptz not null,
  consumed_submission_id uuid references public.wave_loop_submissions_v3(id) on delete set null,
  check (expires_at > reserved_at and upload_may_complete_until >= expires_at)
);

create unique index if not exists wave_slot_one_live_reservation_v5
on public.wave_slot_reservations_v5(slot_id) where status = 'RESERVED';

create table if not exists public.wave_credit_ledger_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete restrict,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('GRANT', 'RESERVATION', 'RELEASE', 'MODERATION_REFUND', 'ADMIN_ADJUSTMENT')),
  reservation_id uuid references public.wave_slot_reservations_v5(id) on delete set null,
  submission_id uuid references public.wave_loop_submissions_v3(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default now(),
  unique(session_id, contributor_id, idempotency_key)
);

create table if not exists public.wave_host_presence_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  connected boolean not null default false,
  daw_audio_available boolean not null default false,
  daw_rtc_publication_id text,
  daw_level_detected boolean not null default false,
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  fallback_revision_id uuid references public.wave_beat_revisions_v3(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((connected and disconnected_at is null) or (not connected and disconnected_at is not null))
);

insert into public.wave_host_presence_v5(session_id, fallback_revision_id)
select session.id, session.current_beat_revision_id from public.wave_sessions_v3 session
on conflict (session_id) do nothing;

-- A migration/restart cannot prove that a browser publication still exists.
update public.wave_host_presence_v5
set connected = false, disconnected_at = now(),
    daw_audio_available = false, daw_rtc_publication_id = null,
    daw_level_detected = false, updated_at = now();

create table if not exists public.wave_closing_votes_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  reference_beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  preview_asset_id uuid not null references public.wave_audio_assets_v3(id) on delete restrict,
  status text not null default 'LISTENING' check (status in ('LISTENING', 'OPEN', 'FINALIZED', 'CANCELLED')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  eligible_voters integer not null default 0 check (eligible_voters >= 0),
  quorum integer not null check (quorum > 0),
  approval_threshold numeric(5,4) not null check (approval_threshold > 0.5 and approval_threshold <= 1),
  approved boolean,
  final_beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (opens_at < closes_at),
  check ((status = 'FINALIZED') = (finalized_at is not null and approved is not null)),
  check (not coalesce(approved, false) or final_beat_revision_id = reference_beat_revision_id)
);

create unique index if not exists wave_one_active_closing_vote_v5
on public.wave_closing_votes_v5(session_id) where status in ('LISTENING', 'OPEN');

create table if not exists public.wave_closing_ballots_v5 (
  closing_vote_id uuid not null references public.wave_closing_votes_v5(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete restrict,
  choice public.wave_vote_choice_v3 not null,
  cast_at timestamptz not null default now(),
  primary key(closing_vote_id, voter_id)
);

create table if not exists public.wave_closing_listen_receipts_v5 (
  closing_vote_id uuid not null references public.wave_closing_votes_v5(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete restrict,
  heard_ms integer not null check (heard_ms > 0),
  completed_at timestamptz not null default now(),
  receipt_token_hash text not null check (length(receipt_token_hash) between 16 and 256),
  primary key(closing_vote_id, voter_id)
);

create table if not exists public.wave_closing_eligible_voters_v5 (
  closing_vote_id uuid not null references public.wave_closing_votes_v5(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete restrict,
  receipt_completed_at timestamptz not null,
  snapshotted_at timestamptz not null default now(),
  primary key(closing_vote_id, voter_id)
);

create table if not exists public.wave_private_mix_exports_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'REVOKED')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  rights_snapshot jsonb not null check (jsonb_typeof(rights_snapshot) = 'object' and pg_column_size(rights_snapshot) <= 131072),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'READY') = (asset_id is not null))
);

alter table public.wave_event_v1
  add column if not exists subject_user_id uuid references auth.users(id) on delete set null,
  add column if not exists audience text not null default 'ROOM' check (audience in ('ROOM', 'HOST', 'SUBJECT', 'SERVICE')),
  add column if not exists sensitive boolean not null default false;

-- Existing v3 rows predate audience metadata. Classify them before replacing
-- the permissive member RLS policy so historical uploads cannot leak.
update public.wave_event_v1 event
set subject_user_id = coalesce(event.subject_user_id,
      case when event.entity_type = 'submission' then (
        select submission.contributor_id from public.wave_loop_submissions_v3 submission
        where submission.id = event.entity_id
      ) when event.entity_type in ('audio_asset','asset') then (
        select asset.owner_id from public.wave_audio_assets_v3 asset where asset.id = event.entity_id
      ) end),
    audience = 'SUBJECT', sensitive = true
where event.type like 'submission.%' or event.type like 'asset.%' or event.type like 'upload.%';

update public.wave_event_v1 event
set audience = 'HOST', sensitive = true
where event.entity_type in ('private_audition','private_mix_export','moderation')
   or event.type like 'private_audition.%' or event.type like 'private_mix.%'
   or event.type like 'moderation.%';

-- The product lifecycle is intentionally separate from the older transport
-- status. This keeps legacy Rooms readable while giving the coordinator one
-- unambiguous production state machine.
do $$ begin
  create type public.wave_lifecycle_state_v5 as enum (
    'PREPARING', 'LIVE_ACTIVE', 'INTERMISSION', 'PAUSED', 'CLOSURE_VOTE',
    'FINALIZING', 'CLOSED', 'CANCELLED'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.wave_version_status_v5 as enum (
    'UPLOADING', 'PROCESSING', 'TECHNICALLY_READY', 'NEEDS_CORRECTION',
    'READY_FOR_VOTE', 'LOCKED_FOR_VOTE', 'ACCEPTED', 'NOT_SELECTED',
    'SUPERSEDED', 'REJECTED', 'REMOVED', 'PROCESSING_FAILED'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.wave_beat_activation_status_v5 as enum (
    'PENDING_RENDER', 'READY_FOR_ACTIVATION', 'TECHNICALLY_BLOCKED',
    'LEGALLY_BLOCKED', 'PENDING_ACTIVATION', 'ACTIVE', 'ACTIVATION_FAILED'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.wave_category_need_v5 as enum ('OPEN', 'PRIORITY', 'ENOUGH', 'CLOSED');
exception when duplicate_object then null; end $$;

alter table public.wave_sessions_v3
  add column if not exists lifecycle_state public.wave_lifecycle_state_v5 not null default 'PREPARING',
  add column if not exists submissions_during_intermission boolean not null default false,
  add column if not exists closure_cooldown_until timestamptz,
  add column if not exists active_rules_revision_id uuid,
  add column if not exists production_reference_id uuid;

update public.wave_sessions_v3
set lifecycle_state = case status
  when 'LIVE' then 'LIVE_ACTIVE'::public.wave_lifecycle_state_v5
  when 'PAUSED' then 'PAUSED'::public.wave_lifecycle_state_v5
  when 'ENDED' then 'CLOSED'::public.wave_lifecycle_state_v5
  when 'CANCELLED' then 'CANCELLED'::public.wave_lifecycle_state_v5
  else lifecycle_state end
where lifecycle_state = 'PREPARING';

alter table public.wave_categories_v3
  add column if not exists need_state public.wave_category_need_v5 not null default 'OPEN';

alter table public.wave_loop_submissions_v3
  add column if not exists based_on_beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  add column if not exists based_on_rules_revision_id uuid;

alter table public.wave_loop_versions_v3
  add column if not exists version_status public.wave_version_status_v5 not null default 'UPLOADING',
  add column if not exists based_on_beat_revision_id uuid references public.wave_beat_revisions_v3(id) on delete restrict,
  add column if not exists based_on_rules_revision_id uuid,
  add column if not exists start_offset_beats numeric(12,4) not null default 0 check (start_offset_beats = 0),
  add column if not exists tail_policy text not null default 'TRIM_TO_CYCLE' check (tail_policy in ('TRIM_TO_CYCLE', 'REJECT_OVERFLOW')),
  add column if not exists repeat_policy text not null default 'REPEAT_TO_CYCLE' check (repeat_policy = 'REPEAT_TO_CYCLE');

alter table public.wave_beat_revisions_v3
  add column if not exists activation_status public.wave_beat_activation_status_v5 not null default 'PENDING_RENDER';

alter table public.wave_vote_rounds_v3
  add column if not exists preview_id uuid references public.wave_vote_previews_v5(id) on delete restrict,
  add column if not exists quantization public.wave_quantization_v5 not null default 'CYCLE',
  add column if not exists preview_clock_epoch bigint,
  add column if not exists preview_boundary_bar bigint,
  add column if not exists eligible_snapshot_at timestamptz,
  add column if not exists media_timeline jsonb not null default '{}'::jsonb
    check (jsonb_typeof(media_timeline) = 'object' and pg_column_size(media_timeline) <= 32768);

create table if not exists public.wave_rules_revisions_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  bpm numeric(7,3) not null check (bpm between 20 and 400),
  musical_key text not null,
  time_signature text not null check (time_signature ~ '^[1-9][0-9]?/[124816]$'),
  cycle_bars integer not null check (cycle_bars between 1 and 64),
  accepted_loop_bars integer[] not null,
  max_duration_ms integer not null check (max_duration_ms between 250 and 900000),
  accepted_mime_types text[] not null,
  repeat_policy text not null default 'REPEAT_TO_CYCLE' check (repeat_policy = 'REPEAT_TO_CYCLE'),
  tail_policy text not null default 'TRIM_TO_CYCLE' check (tail_policy in ('TRIM_TO_CYCLE', 'REJECT_OVERFLOW')),
  submissions_during_intermission boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(session_id, revision_number),
  check (cardinality(accepted_loop_bars) between 1 and 16)
);

create table if not exists public.wave_production_references_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  beat_revision_id uuid not null references public.wave_beat_revisions_v3(id) on delete restrict,
  rules_revision_id uuid not null references public.wave_rules_revisions_v5(id) on delete restrict,
  studio_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  light_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  cycle_bars integer not null check (cycle_bars between 1 and 64),
  cycle_duration_ms integer not null check (cycle_duration_ms > 0),
  content_hash text not null check (length(content_hash) between 16 and 256),
  immutable_at timestamptz not null default now(),
  unique(session_id, beat_revision_id, rules_revision_id)
);

alter table public.wave_sessions_v3
  drop constraint if exists wave_sessions_v3_active_rules_revision_id_fkey,
  add constraint wave_sessions_v3_active_rules_revision_id_fkey
    foreign key (active_rules_revision_id) references public.wave_rules_revisions_v5(id) on delete restrict,
  drop constraint if exists wave_sessions_v3_production_reference_id_fkey,
  add constraint wave_sessions_v3_production_reference_id_fkey
    foreign key (production_reference_id) references public.wave_production_references_v5(id) on delete restrict;
alter table public.wave_loop_submissions_v3
  drop constraint if exists wave_loop_submissions_v3_based_on_rules_revision_id_fkey,
  add constraint wave_loop_submissions_v3_based_on_rules_revision_id_fkey
    foreign key (based_on_rules_revision_id) references public.wave_rules_revisions_v5(id) on delete restrict;
alter table public.wave_loop_versions_v3
  drop constraint if exists wave_loop_versions_v3_based_on_rules_revision_id_fkey,
  add constraint wave_loop_versions_v3_based_on_rules_revision_id_fkey
    foreign key (based_on_rules_revision_id) references public.wave_rules_revisions_v5(id) on delete restrict;
alter table public.wave_asset_uploads_v4
  drop constraint if exists wave_asset_uploads_v4_based_on_rules_revision_id_fkey,
  add constraint wave_asset_uploads_v4_based_on_rules_revision_id_fkey
    foreign key (based_on_rules_revision_id) references public.wave_rules_revisions_v5(id) on delete restrict;
alter table public.wave_asset_uploads_v4
  drop constraint if exists wave_asset_uploads_v4_reservation_id_fkey,
  add constraint wave_asset_uploads_v4_reservation_id_fkey
    foreign key (reservation_id) references public.wave_slot_reservations_v5(id) on delete restrict;

create table if not exists public.wave_vote_defaults_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  admission jsonb not null default '{"listenSeconds":8,"voteSeconds":30,"quorumRatio":0.15,"approvalThreshold":0.6}'::jsonb,
  replacement jsonb not null default '{"listenSeconds":8,"voteSeconds":30,"quorumRatio":0.15,"approvalThreshold":0.6}'::jsonb,
  closure jsonb not null default '{"listenSeconds":15,"voteSeconds":45,"quorumRatio":0.2,"approvalThreshold":0.6}'::jsonb,
  check (jsonb_typeof(admission) = 'object' and jsonb_typeof(replacement) = 'object' and jsonb_typeof(closure) = 'object')
);

create table if not exists public.wave_audio_buses_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  music_program_kind text not null default 'HOST_DAW' check (music_program_kind in ('COLLECTIVE_BEAT', 'HOST_DAW')),
  music_program_generation bigint not null default 1 check (music_program_generation > 0),
  voice_kind text not null default 'HOST_MIC' check (voice_kind = 'HOST_MIC'),
  voice_rtc_publication_id text,
  private_cue_enabled boolean not null default false,
  private_cue_host_id uuid not null references auth.users(id) on delete restrict,
  public_gain_db numeric(5,2) not null default 0 check (public_gain_db between -24 and 6),
  emergency_muted boolean not null default false,
  emergency_mute_reason text,
  egress_adapter text not null default 'UNASSIGNED' check (length(egress_adapter) between 3 and 80),
  coordinator_region text,
  updated_at timestamptz not null default now(),
  check (not emergency_muted or length(btrim(coalesce(emergency_mute_reason, ''))) > 0)
);

create table if not exists public.wave_beat_runtime_v5 (
  beat_revision_id uuid primary key references public.wave_beat_revisions_v3(id) on delete cascade,
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  activation_status public.wave_beat_activation_status_v5 not null default 'PENDING_RENDER',
  render_asset_id uuid references public.wave_audio_assets_v3(id) on delete restrict,
  failure_code text,
  updated_at timestamptz not null default now(),
  check (
    (activation_status = 'READY_FOR_ACTIVATION' and render_asset_id is not null and failure_code is null)
    or (activation_status in ('TECHNICALLY_BLOCKED', 'LEGALLY_BLOCKED', 'ACTIVATION_FAILED') and failure_code is not null)
    or (activation_status in ('PENDING_RENDER', 'PENDING_ACTIVATION', 'ACTIVE') and failure_code is null)
  )
);

create table if not exists public.wave_loop_version_runtime_v5 (
  loop_version_id uuid primary key references public.wave_loop_versions_v3(id) on delete cascade,
  submission_id uuid not null references public.wave_loop_submissions_v3(id) on delete cascade,
  status public.wave_version_status_v5 not null default 'UPLOADING',
  status_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.rooms_wave_seed_version_runtime_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wave_loop_version_runtime_v5(loop_version_id, submission_id, status)
  values (new.id, new.submission_id, 'TECHNICALLY_READY') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists wave_seed_version_runtime_v5 on public.wave_loop_versions_v3;
create trigger wave_seed_version_runtime_v5 after insert on public.wave_loop_versions_v3
for each row execute function public.rooms_wave_seed_version_runtime_v5();

insert into public.wave_loop_version_runtime_v5(loop_version_id, submission_id, status)
select version.id, version.submission_id,
  case submission.status
    when 'READY_FOR_VOTE' then 'READY_FOR_VOTE'::public.wave_version_status_v5
    when 'VOTING' then 'LOCKED_FOR_VOTE'::public.wave_version_status_v5
    when 'ACCEPTED' then 'ACCEPTED'::public.wave_version_status_v5
    when 'NOT_SELECTED' then 'NOT_SELECTED'::public.wave_version_status_v5
    when 'REJECTED' then 'REJECTED'::public.wave_version_status_v5
    when 'REMOVED' then 'REMOVED'::public.wave_version_status_v5
    else 'TECHNICALLY_READY'::public.wave_version_status_v5 end
from public.wave_loop_versions_v3 version
join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
on conflict do nothing;

create table if not exists public.wave_retention_policies_v5 (
  session_id uuid primary key references public.wave_sessions_v3(id) on delete cascade,
  abandoned_upload_hours integer not null default 24 check (abandoned_upload_hours between 1 and 720),
  rejected_asset_days integer not null default 30 check (rejected_asset_days between 1 and 3650),
  event_days integer not null default 365 check (event_days between 30 and 3650),
  original_asset_policy text not null default 'RIGHTS_GOVERNED' check (original_asset_policy in ('RIGHTS_GOVERNED', 'DELETE_AFTER_SESSION')),
  gc_cursor timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_gc_runs_v5 (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wave_sessions_v3(id) on delete cascade,
  state text not null default 'PLANNED' check (state in ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  cutoff_at timestamptz not null,
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  deleted_object_count integer not null default 0 check (deleted_object_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((state = 'SUCCEEDED') = (completed_at is not null))
);

alter table public.wave_activation_queue_v5
  add column if not exists target_at timestamptz;

create or replace function public.rooms_wave_is_master_v5(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.wave_sessions_v3 session
    where session.id = p_session_id and session.host_id = p_user_id
  );
$$;

create or replace function public.rooms_wave_seed_runtime_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules_id uuid;
  v_bars integer[];
begin
  select coalesce(array_agg(value order by value), array[new.expected_bars]) into v_bars
  from unnest(array[1,2,4,8,16,32,64]) value
  where value <= least(new.expected_bars, 64) and mod(least(new.expected_bars, 64), value) = 0;

  insert into public.wave_rules_revisions_v5(
    session_id, revision_number, bpm, musical_key, time_signature, cycle_bars,
    accepted_loop_bars, max_duration_ms, accepted_mime_types,
    submissions_during_intermission, created_by
  ) values (
    new.id, new.rules_version, new.bpm, new.musical_key, new.time_signature,
    least(new.expected_bars, 64), v_bars, new.max_duration_ms,
    new.accepted_mime_types, new.submissions_during_intermission, new.host_id
  ) returning id into v_rules_id;

  update public.wave_sessions_v3 set active_rules_revision_id = v_rules_id where id = new.id;
  insert into public.wave_musical_clock_v5(session_id, bpm, time_signature, cycle_bars)
  values (new.id, new.bpm, new.time_signature, least(new.expected_bars, 64)) on conflict do nothing;
  insert into public.wave_vote_policy_v5(session_id) values (new.id) on conflict do nothing;
  insert into public.wave_vote_defaults_v5(session_id) values (new.id) on conflict do nothing;
  insert into public.wave_audio_buses_v5(session_id, private_cue_host_id)
  values (new.id, new.host_id) on conflict do nothing;
  insert into public.wave_retention_policies_v5(session_id) values (new.id) on conflict do nothing;
  insert into public.wave_host_presence_v5(session_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists wave_seed_runtime_v5 on public.wave_sessions_v3;
create trigger wave_seed_runtime_v5 after insert on public.wave_sessions_v3
for each row execute function public.rooms_wave_seed_runtime_v5();

-- Backfill the additive runtime for Waves that existed before v5.
insert into public.wave_rules_revisions_v5(
  session_id, revision_number, bpm, musical_key, time_signature, cycle_bars,
  accepted_loop_bars, max_duration_ms, accepted_mime_types,
  submissions_during_intermission, created_by
)
select session.id, session.rules_version, session.bpm, session.musical_key,
       session.time_signature, least(session.expected_bars, 64),
       array[least(session.expected_bars, 64)], session.max_duration_ms,
       session.accepted_mime_types, session.submissions_during_intermission, session.host_id
from public.wave_sessions_v3 session
where not exists (select 1 from public.wave_rules_revisions_v5 rules where rules.session_id = session.id);

update public.wave_sessions_v3 session
set active_rules_revision_id = rules.id
from public.wave_rules_revisions_v5 rules
where rules.session_id = session.id and rules.revision_number = session.rules_version
  and session.active_rules_revision_id is null;

insert into public.wave_vote_defaults_v5(session_id)
select id from public.wave_sessions_v3 on conflict do nothing;
insert into public.wave_audio_buses_v5(session_id, private_cue_host_id)
select id, host_id from public.wave_sessions_v3 on conflict do nothing;
insert into public.wave_retention_policies_v5(session_id)
select id from public.wave_sessions_v3 on conflict do nothing;

create or replace function public.rooms_wave_seed_beat_runtime_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules public.wave_rules_revisions_v5%rowtype;
  v_reference_id uuid;
begin
  insert into public.wave_beat_runtime_v5(beat_revision_id, session_id, activation_status, render_asset_id)
  values (
    new.id, new.session_id,
    case when new.render_status = 'READY' and new.render_asset_id is not null
      then 'READY_FOR_ACTIVATION'::public.wave_beat_activation_status_v5
      else 'PENDING_RENDER'::public.wave_beat_activation_status_v5 end,
    new.render_asset_id
  ) on conflict do nothing;

  if new.reason = 'INITIAL' then
    select rules.* into v_rules
    from public.wave_sessions_v3 session
    join public.wave_rules_revisions_v5 rules on rules.id = session.active_rules_revision_id
    where session.id = new.session_id;
    if found then
      insert into public.wave_production_references_v5(
        session_id, beat_revision_id, rules_revision_id, cycle_bars,
        cycle_duration_ms, content_hash
      ) values (
        new.session_id, new.id, v_rules.id, v_rules.cycle_bars,
        ceil(v_rules.cycle_bars * split_part(v_rules.time_signature, '/', 1)::integer * 60000 / v_rules.bpm)::integer,
        md5(new.content_hash || ':' || v_rules.id::text)
      ) on conflict (session_id, beat_revision_id, rules_revision_id) do update
        set content_hash = excluded.content_hash
      returning id into v_reference_id;
      update public.wave_sessions_v3 set production_reference_id = v_reference_id
      where id = new.session_id and production_reference_id is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists wave_seed_beat_runtime_v5 on public.wave_beat_revisions_v3;
create trigger wave_seed_beat_runtime_v5 after insert on public.wave_beat_revisions_v3
for each row execute function public.rooms_wave_seed_beat_runtime_v5();

insert into public.wave_beat_runtime_v5(beat_revision_id, session_id, activation_status, render_asset_id)
select revision.id, revision.session_id,
       case when revision.render_status = 'READY' and revision.render_asset_id is not null
         then 'READY_FOR_ACTIVATION'::public.wave_beat_activation_status_v5
         else 'PENDING_RENDER'::public.wave_beat_activation_status_v5 end,
       revision.render_asset_id
from public.wave_beat_revisions_v3 revision
on conflict do nothing;

insert into public.wave_production_references_v5(
  session_id, beat_revision_id, rules_revision_id, cycle_bars, cycle_duration_ms, content_hash
)
select session.id, session.current_beat_revision_id, rules.id, rules.cycle_bars,
  ceil(rules.cycle_bars * split_part(rules.time_signature, '/', 1)::integer * 60000 / rules.bpm)::integer,
  md5(revision.content_hash || ':' || rules.id::text)
from public.wave_sessions_v3 session
join public.wave_rules_revisions_v5 rules on rules.id = session.active_rules_revision_id
join public.wave_beat_revisions_v3 revision on revision.id = session.current_beat_revision_id
where session.current_beat_revision_id is not null
on conflict (session_id, beat_revision_id, rules_revision_id) do nothing;

update public.wave_sessions_v3 session
set production_reference_id = reference.id
from public.wave_production_references_v5 reference
where reference.session_id = session.id and reference.beat_revision_id = session.current_beat_revision_id
  and reference.rules_revision_id = session.active_rules_revision_id
  and session.production_reference_id is null;

create or replace function public.rooms_wave_validate_rules_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_bar integer;
begin
  foreach v_bar in array new.accepted_loop_bars loop
    if v_bar <= 0 or v_bar > new.cycle_bars or mod(new.cycle_bars, v_bar) <> 0 then
      raise exception using errcode = '23514', message = 'wave_loop_bars_must_divide_cycle';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists wave_rules_validate_v5 on public.wave_rules_revisions_v5;
create trigger wave_rules_validate_v5 before insert or update on public.wave_rules_revisions_v5
for each row execute function public.rooms_wave_validate_rules_v5();

create or replace function public.rooms_wave_stamp_submission_reference_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select session.current_beat_revision_id, session.active_rules_revision_id
  into new.based_on_beat_revision_id, new.based_on_rules_revision_id
  from public.wave_sessions_v3 session where session.id = new.session_id;
  if new.based_on_rules_revision_id is null then
    raise exception using errcode = '55000', message = 'wave_rules_revision_missing';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_submission_reference_v5 on public.wave_loop_submissions_v3;
create trigger wave_submission_reference_v5 before insert on public.wave_loop_submissions_v3
for each row execute function public.rooms_wave_stamp_submission_reference_v5();

create or replace function public.rooms_wave_stamp_version_reference_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_submission public.wave_loop_submissions_v3%rowtype; v_rules public.wave_rules_revisions_v5%rowtype;
begin
  select * into v_submission from public.wave_loop_submissions_v3 where id = new.submission_id;
  new.based_on_beat_revision_id := v_submission.based_on_beat_revision_id;
  new.based_on_rules_revision_id := v_submission.based_on_rules_revision_id;
  select * into v_rules from public.wave_rules_revisions_v5 where id = new.based_on_rules_revision_id;
  if new.declared_bars is not null and not (new.declared_bars = any(v_rules.accepted_loop_bars)) then
    raise exception using errcode = '23514', message = 'wave_loop_bars_not_accepted';
  end if;
  new.start_offset_beats := 0;
  new.repeat_policy := 'REPEAT_TO_CYCLE';
  return new;
end;
$$;
drop trigger if exists wave_version_reference_v5 on public.wave_loop_versions_v3;
create trigger wave_version_reference_v5 before insert on public.wave_loop_versions_v3
for each row execute function public.rooms_wave_stamp_version_reference_v5();

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
  v_subject uuid;
  v_audience text := 'ROOM';
  v_sensitive boolean := false;
begin
  if p_entity_type = 'submission' and p_entity_id is not null then
    select contributor_id into v_subject from public.wave_loop_submissions_v3 where id = p_entity_id;
    v_audience := 'SUBJECT';
    v_sensitive := true;
  elsif p_event_type like 'asset.%' or p_event_type like 'audition.%'
     or p_event_type like 'private_mix.%' or p_event_type like 'moderation.%' then
    v_audience := 'HOST';
    v_sensitive := true;
  end if;

  update public.wave_sessions_v3
  set event_sequence = event_sequence + 1, updated_at = now()
  where id = p_session_id returning event_sequence into v_sequence;
  if v_sequence is null then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;

  insert into public.wave_event_v1(
    wave_id, sequence, type, actor_id, correlation_id, entity_type, entity_id,
    payload, subject_user_id, audience, sensitive
  ) values (
    p_session_id, v_sequence, p_event_type, p_actor_id,
    coalesce(nullif(p_correlation_id, ''), gen_random_uuid()::text),
    p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
    v_subject, v_audience, v_sensitive
  );
  return v_sequence;
end;
$$;

create or replace function public.rooms_wave_guard_human_decision_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'READY_FOR_VOTE' and old.status <> 'READY_FOR_VOTE'
     and current_setting('app.wave_human_decision', true) is distinct from 'host' then
    raise exception using errcode = '42501', message = 'wave_ready_for_vote_requires_host_decision';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_ready_for_vote_human_only_v5 on public.wave_loop_submissions_v3;
create trigger wave_ready_for_vote_human_only_v5 before update on public.wave_loop_submissions_v3
for each row execute function public.rooms_wave_guard_human_decision_v5();

create or replace function public.rooms_wave_sync_version_status_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_status public.wave_version_status_v5;
begin
  v_status := case new.status
    when 'UPLOADING' then 'UPLOADING'::public.wave_version_status_v5
    when 'PROCESSING' then 'PROCESSING'::public.wave_version_status_v5
    when 'PROCESSING_FAILED' then 'PROCESSING_FAILED'::public.wave_version_status_v5
    when 'NEEDS_CORRECTION' then 'NEEDS_CORRECTION'::public.wave_version_status_v5
    when 'READY_FOR_VOTE' then 'READY_FOR_VOTE'::public.wave_version_status_v5
    when 'VOTING' then 'LOCKED_FOR_VOTE'::public.wave_version_status_v5
    when 'ACCEPTED' then 'ACCEPTED'::public.wave_version_status_v5
    when 'NOT_SELECTED' then 'NOT_SELECTED'::public.wave_version_status_v5
    when 'SUPERSEDED' then 'SUPERSEDED'::public.wave_version_status_v5
    when 'REJECTED' then 'REJECTED'::public.wave_version_status_v5
    when 'REMOVED' then 'REMOVED'::public.wave_version_status_v5
    else 'TECHNICALLY_READY'::public.wave_version_status_v5 end;
  update public.wave_loop_version_runtime_v5 runtime
  set status = v_status, status_reason = new.status_reason, updated_at = now()
  from public.wave_loop_versions_v3 version
  where runtime.loop_version_id = version.id and version.submission_id = new.id
    and version.version_number = new.current_version_number;
  return new;
end;
$$;
drop trigger if exists wave_submission_sync_version_status_v5 on public.wave_loop_submissions_v3;
create trigger wave_submission_sync_version_status_v5 after update of status, status_reason on public.wave_loop_submissions_v3
for each row execute function public.rooms_wave_sync_version_status_v5();

create or replace function public.rooms_wave_decide_submission_v5(
  p_submission_id uuid,
  p_decision public.wave_loop_status_v3,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.wave_loop_submissions_v3%rowtype;
  v_existing jsonb;
  v_hash text;
  v_result jsonb;
begin
  if p_decision not in ('READY_FOR_VOTE', 'NEEDS_CORRECTION', 'REJECTED') then
    raise exception using errcode = '22023', message = 'wave_human_decision_invalid';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  select * into v_submission from public.wave_loop_submissions_v3 where id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_submission_not_found'; end if;
  if not public.rooms_wave_is_master_v5(v_submission.session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  if v_submission.status not in ('RECEIVED', 'NEEDS_REVIEW', 'NOT_SELECTED', 'READY_FOR_VOTE') then
    raise exception using errcode = '55000', message = 'wave_submission_not_decidable';
  end if;
  if p_decision in ('NEEDS_CORRECTION', 'REJECTED') and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'wave_decision_reason_required';
  end if;
  if p_decision = 'READY_FOR_VOTE' and not exists (
    select 1 from public.wave_loop_versions_v3 version
    join public.wave_loop_analysis_v3 analysis on analysis.loop_version_id = version.id
    join public.wave_audio_assets_v3 asset on asset.id = version.audio_asset_id
    where version.submission_id = v_submission.id
      and version.version_number = v_submission.current_version_number
      and analysis.compatibility <> 'INCOMPATIBLE' and not analysis.corrupt
      and asset.status = 'READY'
  ) then
    raise exception using errcode = '55000', message = 'wave_version_not_technically_prepared';
  end if;
  v_hash := md5(concat_ws(':', p_submission_id, p_decision, p_reason));
  select result into v_existing from public.wave_idempotency_v3
  where session_id = v_submission.session_id and actor_id = v_actor
    and command_name = 'decide_submission_v5' and idempotency_key = p_idempotency_key
    and request_hash = v_hash;
  if found then return v_existing; end if;

  perform set_config('app.wave_human_decision', 'host', true);
  update public.wave_loop_submissions_v3
  set status = p_decision, status_reason = nullif(btrim(p_reason), ''), updated_at = now()
  where id = p_submission_id;
  insert into public.wave_loop_version_runtime_v5(loop_version_id, submission_id, status, status_reason, decided_by)
  select version.id, version.submission_id, case p_decision
    when 'READY_FOR_VOTE' then 'READY_FOR_VOTE'::public.wave_version_status_v5
    when 'NEEDS_CORRECTION' then 'NEEDS_CORRECTION'::public.wave_version_status_v5
    else 'REJECTED'::public.wave_version_status_v5 end,
    nullif(btrim(p_reason), ''), v_actor
  from public.wave_loop_versions_v3 version
  where version.submission_id = p_submission_id and version.version_number = v_submission.current_version_number
  on conflict (loop_version_id) do update
  set status = excluded.status, status_reason = excluded.status_reason,
      decided_by = excluded.decided_by, updated_at = now();
  perform public.rooms_wave_append_event_v3(
    v_submission.session_id, 'submission.host_decision', v_actor, 'submission', p_submission_id,
    jsonb_build_object('decision', p_decision, 'reason', nullif(btrim(p_reason), '')),
    p_correlation_id
  );
  v_result := jsonb_build_object(
    'correlationId', coalesce(nullif(p_correlation_id, ''), p_idempotency_key),
    'data', jsonb_build_object('submissionId', p_submission_id, 'status', p_decision)
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_submission.session_id, v_actor, 'decide_submission_v5', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_wave_guard_asset_identity_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'ORIGINAL' and row(
    new.session_id, new.owner_id, new.kind, new.storage_bucket, new.storage_path,
    new.mime_type, new.byte_size, new.sha256, new.source_asset_id, new.original_asset_id
  ) is distinct from row(
    old.session_id, old.owner_id, old.kind, old.storage_bucket, old.storage_path,
    old.mime_type, old.byte_size, old.sha256, old.source_asset_id, old.original_asset_id
  ) then
    raise exception using errcode = '55000', message = 'wave_original_asset_is_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_asset_identity_immutable_v5 on public.wave_audio_assets_v3;
create trigger wave_asset_identity_immutable_v5 before update on public.wave_audio_assets_v3
for each row execute function public.rooms_wave_guard_asset_identity_v5();

create or replace function public.rooms_wave_validate_canonical_asset_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind::text in ('PLAYBACK_DERIVATIVE', 'PREVIEW_DERIVATIVE') then
    if new.source_asset_id is null or new.original_asset_id is null
       or new.sample_rate <> 48000 or new.channel_count <> 2
       or length(btrim(coalesce(new.canonical_codec, ''))) = 0
       or length(btrim(coalesce(new.canonical_container, ''))) = 0 then
      raise exception using errcode = '23514', message = 'wave_canonical_derivative_required';
    end if;
  elsif new.kind::text = 'ORIGINAL' and new.source_asset_id is not null then
    raise exception using errcode = '23514', message = 'wave_original_cannot_have_source';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_asset_canonical_v5 on public.wave_audio_assets_v3;
create trigger wave_asset_canonical_v5 before insert or update on public.wave_audio_assets_v3
for each row execute function public.rooms_wave_validate_canonical_asset_v5();

create or replace function public.rooms_wave_validate_production_reference_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.studio_asset_id is not null and not exists (
    select 1 from public.wave_audio_assets_v3 asset
    where asset.id = new.studio_asset_id and asset.session_id = new.session_id
      and asset.status = 'READY'
      and asset.mime_type in ('audio/wav', 'audio/x-wav', 'audio/flac')
  ) then raise exception using errcode = '23514', message = 'wave_studio_reference_must_be_lossless'; end if;
  if new.light_asset_id is not null and not exists (
    select 1 from public.wave_audio_assets_v3 asset
    where asset.id = new.light_asset_id and asset.session_id = new.session_id
      and asset.status = 'READY'
      and asset.mime_type in ('audio/mpeg', 'audio/aac', 'audio/mp4', 'audio/ogg', 'audio/webm')
  ) then raise exception using errcode = '23514', message = 'wave_light_reference_format_invalid'; end if;
  return new;
end;
$$;
drop trigger if exists wave_production_reference_assets_v5 on public.wave_production_references_v5;
create trigger wave_production_reference_assets_v5 before insert or update on public.wave_production_references_v5
for each row execute function public.rooms_wave_validate_production_reference_v5();

drop trigger if exists wave_rules_revisions_immutable_v5 on public.wave_rules_revisions_v5;
create trigger wave_rules_revisions_immutable_v5 before update or delete on public.wave_rules_revisions_v5
for each row execute function public.rooms_wave_reject_mutation_v3();

create or replace function public.rooms_wave_guard_production_reference_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '55000', message = 'wave_production_reference_is_immutable'; end if;
  if row(new.session_id, new.beat_revision_id, new.rules_revision_id, new.cycle_bars,
         new.cycle_duration_ms, new.content_hash, new.immutable_at)
     is distinct from row(old.session_id, old.beat_revision_id, old.rules_revision_id, old.cycle_bars,
         old.cycle_duration_ms, old.content_hash, old.immutable_at)
     or (old.studio_asset_id is not null and new.studio_asset_id is distinct from old.studio_asset_id)
     or (old.light_asset_id is not null and new.light_asset_id is distinct from old.light_asset_id) then
    raise exception using errcode = '55000', message = 'wave_production_reference_is_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_production_reference_immutable_v5 on public.wave_production_references_v5;
create trigger wave_production_reference_immutable_v5 before update or delete on public.wave_production_references_v5
for each row execute function public.rooms_wave_guard_production_reference_v5();

create or replace function public.rooms_wave_register_vote_preview_v5(
  p_session_id uuid,
  p_candidate_version_id uuid,
  p_reference_revision_id uuid,
  p_asset_id uuid,
  p_mode text,
  p_full_duration_ms integer,
  p_content_hash text,
  p_clock_epoch bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_preview_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if not exists (
    select 1 from public.wave_loop_versions_v3 version
    join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
    where version.id = p_candidate_version_id and submission.session_id = p_session_id
  ) or not exists (
    select 1 from public.wave_beat_revisions_v3 revision
    where revision.id = p_reference_revision_id and revision.session_id = p_session_id
  ) or not exists (
    select 1 from public.wave_audio_assets_v3 asset
    join public.wave_asset_derivatives_v4 derivative on derivative.asset_id = asset.id
    where asset.id = p_asset_id and asset.session_id = p_session_id and asset.status = 'READY'
      and asset.kind::text in ('PREVIEW_DERIVATIVE', 'PREVIEW')
      and derivative.derivative_kind = 'PREVIEW_DERIVATIVE'
      and derivative.artifact_role = 'VOTE_PREVIEW' and derivative.state = 'READY'
      and derivative.temporal_exact
      and derivative.comparison_duration_ms = p_full_duration_ms
      and derivative.comparison_context_hash = p_content_hash
      and asset.metadata->>'candidateVersionId' = p_candidate_version_id::text
      and asset.metadata->>'referenceBeatRevisionId' = p_reference_revision_id::text
      and asset.metadata->>'mode' = p_mode
  ) then
    raise exception using errcode = '23514', message = 'wave_vote_preview_lock_invalid';
  end if;
  insert into public.wave_vote_previews_v5(
    session_id, candidate_version_id, reference_beat_revision_id, asset_id,
    mode, status, full_duration_ms, content_hash, clock_epoch
  ) values (
    p_session_id, p_candidate_version_id, p_reference_revision_id, p_asset_id,
    p_mode, 'READY', p_full_duration_ms, p_content_hash, p_clock_epoch
  ) returning id into v_preview_id;
  return v_preview_id;
end;
$$;

create or replace function public.rooms_wave_prepare_vote_lock_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview public.wave_vote_previews_v5%rowtype;
  v_clock public.wave_musical_clock_v5%rowtype;
  v_presence public.wave_host_presence_v5%rowtype;
  v_beats_per_bar integer;
  v_elapsed_beats numeric;
  v_effective_bar bigint;
  v_boundary_bar bigint;
  v_seconds_to_boundary numeric;
  v_vote_window interval;
begin
  if not public.rooms_wave_is_master_v5(new.session_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'wave_master_required_to_start_vote';
  end if;
  select * into v_presence from public.wave_host_presence_v5 where session_id = new.session_id;
  if not found or not v_presence.connected then
    raise exception using errcode = '55000', message = 'wave_host_disconnected_new_vote_forbidden';
  end if;
  if exists (
    select 1 from public.wave_activation_queue_v5 activation
    where activation.session_id = new.session_id and activation.state = 'PENDING_ACTIVATION'
  ) then raise exception using errcode = '55000', message = 'wave_pending_activation_blocks_new_vote'; end if;
  select * into v_preview from public.wave_vote_previews_v5
  where session_id = new.session_id
    and candidate_version_id = new.candidate_version_id
    and reference_beat_revision_id = new.reference_beat_revision_id
    and status = 'READY'
  order by created_at desc limit 1;
  if not found then raise exception using errcode = '55000', message = 'wave_immutable_preview_not_ready'; end if;
  if not exists (
    select 1 from public.wave_loop_version_runtime_v5 runtime
    where runtime.loop_version_id = new.candidate_version_id and runtime.status = 'READY_FOR_VOTE'
  ) then raise exception using errcode = '55000', message = 'wave_candidate_not_human_approved'; end if;

  select * into v_clock from public.wave_musical_clock_v5 where session_id = new.session_id for share;
  if not found or v_preview.clock_epoch <> v_clock.fencing_epoch then
    raise exception using errcode = '55000', message = 'wave_preview_clock_epoch_stale';
  end if;
  v_beats_per_bar := split_part(v_clock.time_signature, '/', 1)::integer;
  v_elapsed_beats := greatest(0, extract(epoch from (now() - v_clock.anchor_at))) * v_clock.bpm / 60;
  v_effective_bar := v_clock.current_bar + floor((v_clock.current_beat - 1 + v_elapsed_beats) / v_beats_per_bar)::bigint;
  if v_preview.quantization = 'MEASURE' then
    v_boundary_bar := v_effective_bar + 1;
  else
    v_boundary_bar := ((v_effective_bar - 1) / v_clock.cycle_bars + 1) * v_clock.cycle_bars + 1;
  end if;
  v_seconds_to_boundary := greatest(0,
    ((v_boundary_bar - v_clock.current_bar) * v_beats_per_bar - (v_clock.current_beat - 1) - v_elapsed_beats)
    * 60 / v_clock.bpm
  );
  v_vote_window := new.closes_at - new.opens_at;
  new.preview_id := v_preview.id;
  new.locked_preview_asset_id := v_preview.asset_id;
  new.quantization := v_preview.quantization;
  new.preview_clock_epoch := v_clock.fencing_epoch;
  new.preview_boundary_bar := v_boundary_bar;
  new.listening_started_at := now() + make_interval(secs => v_seconds_to_boundary::double precision);
  new.opens_at := new.listening_started_at + make_interval(secs => v_preview.full_duration_ms::double precision / 1000);
  new.closes_at := new.opens_at + v_vote_window;
  new.eligible_snapshot_at := null;
  new.eligible_voters := 0;
  new.media_timeline := jsonb_build_object(
    'previewId', v_preview.id, 'clockEpoch', v_clock.fencing_epoch,
    'boundaryBar', v_boundary_bar, 'durationMs', v_preview.full_duration_ms,
    'mode', v_preview.mode, 'contentHash', v_preview.content_hash
  );
  return new;
end;
$$;
drop trigger if exists wave_vote_prepare_lock_v5 on public.wave_vote_rounds_v3;
create trigger wave_vote_prepare_lock_v5 before insert on public.wave_vote_rounds_v3
for each row execute function public.rooms_wave_prepare_vote_lock_v5();

create or replace function public.rooms_wave_guard_vote_lock_v3()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.session_id, new.kind, new.candidate_version_id, new.target_slot_id,
    new.replaces_track_id, new.reference_beat_revision_id, new.locked_preview_asset_id,
    new.preview_id, new.quantization, new.preview_clock_epoch, new.preview_boundary_bar,
    new.listening_started_at, new.opens_at, new.closes_at, new.approval_threshold,
    new.media_timeline
  ) is distinct from row(
    old.session_id, old.kind, old.candidate_version_id, old.target_slot_id,
    old.replaces_track_id, old.reference_beat_revision_id, old.locked_preview_asset_id,
    old.preview_id, old.quantization, old.preview_clock_epoch, old.preview_boundary_bar,
    old.listening_started_at, old.opens_at, old.closes_at, old.approval_threshold,
    old.media_timeline
  ) then
    raise exception using errcode = '55000', message = 'wave_vote_lock_is_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.rooms_wave_guard_vote_finalizer_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'FINALIZED' and old.status <> 'FINALIZED'
     and not public.rooms_wave_is_master_v5(new.session_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'wave_master_required_to_finalize_vote';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_vote_finalizer_host_only_v5 on public.wave_vote_rounds_v3;
create trigger wave_vote_finalizer_host_only_v5 before update on public.wave_vote_rounds_v3
for each row execute function public.rooms_wave_guard_vote_finalizer_v5();

create or replace function public.rooms_wave_record_vote_listen_receipt_v5(
  p_round_id uuid,
  p_voter_id uuid,
  p_heard_ms integer,
  p_stream_delay_ms integer,
  p_receipt_token_hash text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.wave_vote_rounds_v3%rowtype;
  v_preview public.wave_vote_previews_v5%rowtype;
  v_policy public.wave_vote_policy_v5%rowtype;
  v_eligible integer;
  v_quorum integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  select * into v_round from public.wave_vote_rounds_v3 where id = p_round_id;
  select * into v_preview from public.wave_vote_previews_v5 where id = v_round.preview_id;
  if not found or v_round.status not in ('LISTENING', 'OPEN') or now() >= v_round.closes_at then
    raise exception using errcode = '55000', message = 'wave_vote_receipt_window_closed';
  end if;
  if p_heard_ms < v_preview.full_duration_ms or length(p_receipt_token_hash) < 16 then
    raise exception using errcode = '55000', message = 'wave_vote_full_preview_required';
  end if;
  if not public.rooms_wave_is_member_v3(v_round.session_id, p_voter_id) then
    raise exception using errcode = '42501', message = 'wave_voter_not_eligible';
  end if;
  insert into public.wave_vote_listen_receipts_v5(
    round_id, voter_id, preview_id, listening_started_at, listening_completed_at,
    heard_ms, eligible, server_stream_delay_ms, receipt_token_hash
  ) values (
    p_round_id, p_voter_id, v_preview.id,
    greatest(v_round.listening_started_at, now() - make_interval(secs => p_heard_ms::double precision / 1000)),
    now(), p_heard_ms, true, p_stream_delay_ms, p_receipt_token_hash
  ) on conflict (round_id, voter_id) do update
  set heard_ms = greatest(public.wave_vote_listen_receipts_v5.heard_ms, excluded.heard_ms),
      listening_completed_at = excluded.listening_completed_at,
      eligible = true, server_stream_delay_ms = excluded.server_stream_delay_ms,
      receipt_token_hash = excluded.receipt_token_hash;

  select count(*)::integer into v_eligible from public.wave_vote_listen_receipts_v5
  where round_id = p_round_id and eligible;
  select * into v_policy from public.wave_vote_policy_v5 where session_id = v_round.session_id;
  v_quorum := greatest(v_policy.minimum_quorum, ceil(v_eligible * v_policy.dynamic_quorum_ratio)::integer);
  update public.wave_vote_rounds_v3
  set eligible_voters = v_eligible, quorum = v_quorum
  where id = p_round_id and eligible_snapshot_at is null;
  return jsonb_build_object(
    'correlationId', p_correlation_id,
    'data', jsonb_build_object('roundId', p_round_id, 'eligible', true)
  );
end;
$$;

create or replace function public.rooms_wave_require_vote_receipt_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.wave_vote_rounds_v3%rowtype;
begin
  select * into v_round from public.wave_vote_rounds_v3 where id = new.round_id;
  if v_round.status not in ('LISTENING', 'OPEN') or now() < v_round.opens_at or now() >= v_round.closes_at then
    raise exception using errcode = '55000', message = 'wave_vote_window_closed';
  end if;
  if not exists (
    select 1 from public.wave_vote_listen_receipts_v5 receipt
    join public.wave_vote_previews_v5 preview on preview.id = receipt.preview_id
    where receipt.round_id = new.round_id and receipt.voter_id = new.voter_id
      and receipt.eligible and receipt.listening_completed_at is not null
      and receipt.heard_ms >= preview.full_duration_ms and preview.id = v_round.preview_id
  ) then raise exception using errcode = '42501', message = 'wave_vote_listen_receipt_required'; end if;
  if v_round.eligible_snapshot_at is null then
    raise exception using errcode = '55000', message = 'wave_vote_eligibility_not_frozen';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_vote_receipt_required_v5 on public.wave_votes_v3;
create trigger wave_vote_receipt_required_v5 before insert on public.wave_votes_v3
for each row execute function public.rooms_wave_require_vote_receipt_v5();

create or replace function public.rooms_wave_freeze_vote_eligibility_v5(
  p_round_id uuid, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.wave_vote_rounds_v3%rowtype; v_policy public.wave_vote_policy_v5%rowtype;
  v_count integer; v_quorum integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  select * into v_round from public.wave_vote_rounds_v3 where id = p_round_id for update;
  if not found or v_round.status not in ('LISTENING','OPEN') or now() < v_round.opens_at or now() >= v_round.closes_at then
    raise exception using errcode = '55000', message = 'wave_vote_not_ready_to_open';
  end if;
  if v_round.eligible_snapshot_at is not null then
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', jsonb_build_object('roundId', p_round_id, 'status', 'OPEN',
        'eligibleVoters', v_round.eligible_voters, 'quorum', v_round.quorum));
  end if;
  select count(*)::integer into v_count from public.wave_vote_listen_receipts_v5
  where round_id = p_round_id and eligible;
  select * into v_policy from public.wave_vote_policy_v5 where session_id = v_round.session_id;
  v_quorum := greatest(v_policy.minimum_quorum, ceil(v_count * v_policy.dynamic_quorum_ratio)::integer);
  update public.wave_vote_rounds_v3
  set eligible_voters = v_count, quorum = v_quorum, eligible_snapshot_at = now(), status = 'OPEN'
  where id = p_round_id;
  perform public.rooms_wave_append_event_v3(v_round.session_id, 'vote.opened', null,
    'vote_round', p_round_id, jsonb_build_object('eligibleVoters', v_count, 'quorum', v_quorum), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('roundId', p_round_id, 'status', 'OPEN',
      'eligibleVoters', v_count, 'quorum', v_quorum));
end;
$$;

create or replace function public.rooms_wave_prepare_activation_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clock public.wave_musical_clock_v5%rowtype;
  v_beats_per_bar integer;
  v_elapsed_beats numeric;
  v_effective_bar bigint;
  v_target_bar bigint;
  v_seconds numeric;
begin
  select * into v_clock from public.wave_musical_clock_v5 where session_id = new.session_id;
  if not found then raise exception using errcode = '55000', message = 'wave_musical_clock_missing'; end if;
  if not exists (
    select 1 from public.wave_beat_revisions_v3 revision
    where revision.id = new.previous_revision_id and revision.session_id = new.session_id
  ) or not (
    (new.source_vote_round_id is null and new.target_revision_id = new.previous_revision_id)
    or exists (
    select 1 from public.wave_beat_revisions_v3 revision
    where revision.id = new.target_revision_id and revision.session_id = new.session_id
      and revision.parent_revision_id = new.previous_revision_id
    )
  ) then raise exception using errcode = '23514', message = 'wave_activation_revision_chain_invalid'; end if;
  v_beats_per_bar := split_part(v_clock.time_signature, '/', 1)::integer;
  v_elapsed_beats := greatest(0, extract(epoch from (now() - v_clock.anchor_at))) * v_clock.bpm / 60;
  v_effective_bar := v_clock.current_bar + floor((v_clock.current_beat - 1 + v_elapsed_beats) / v_beats_per_bar)::bigint;
  if new.quantization = 'MEASURE' then v_target_bar := v_effective_bar + 1;
  else v_target_bar := ((v_effective_bar - 1) / v_clock.cycle_bars + 1) * v_clock.cycle_bars + 1; end if;
  v_seconds := greatest(0,
    ((v_target_bar - v_clock.current_bar) * v_beats_per_bar - (v_clock.current_beat - 1) - v_elapsed_beats)
    * 60 / v_clock.bpm
  );
  new.target_clock_epoch := v_clock.fencing_epoch;
  new.target_bar := v_target_bar;
  new.target_beat := 1;
  new.target_media_time_seconds := v_clock.media_time_seconds
    + ((v_target_bar - v_clock.current_bar) * v_beats_per_bar) * 60 / v_clock.bpm;
  new.target_at := now() + make_interval(secs => v_seconds::double precision);
  insert into public.wave_beat_runtime_v5(beat_revision_id, session_id, activation_status)
  values (new.target_revision_id, new.session_id, 'PENDING_RENDER')
  on conflict (beat_revision_id) do update
  set activation_status = case
    when public.wave_beat_runtime_v5.activation_status in ('READY_FOR_ACTIVATION', 'ACTIVE')
      then public.wave_beat_runtime_v5.activation_status
    else 'PENDING_RENDER'::public.wave_beat_activation_status_v5 end,
      updated_at = now();
  return new;
end;
$$;

create or replace function public.rooms_wave_start_private_audition_v5(
  p_session_id uuid,
  p_candidate_version_id uuid,
  p_reference_revision_id uuid,
  p_preview_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_audition_id uuid; v_program_generation bigint;
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_private_audition_host_only';
  end if;
  if not exists (
    select 1 from public.wave_vote_previews_v5 preview
    where preview.id = p_preview_id and preview.session_id = p_session_id
      and preview.candidate_version_id = p_candidate_version_id
      and preview.reference_beat_revision_id = p_reference_revision_id
      and preview.status = 'READY'
  ) then raise exception using errcode = '55000', message = 'wave_private_audition_preview_not_ready'; end if;
  select generation into v_program_generation from public.wave_program_audio_state_v3 where session_id = p_session_id;
  update public.wave_private_auditions_v5 set state = 'STOPPED', stopped_at = now()
  where session_id = p_session_id and state in ('REQUESTED', 'READY', 'PLAYING');
  insert into public.wave_private_auditions_v5(
    session_id, reference_beat_revision_id, candidate_version_id, preview_id,
    state, requested_by, started_at
  ) values (
    p_session_id, p_reference_revision_id, p_candidate_version_id, p_preview_id,
    'PLAYING', v_actor, now()
  ) returning id into v_audition_id;
  update public.wave_audio_buses_v5 set private_cue_enabled = true, updated_at = now()
  where session_id = p_session_id and private_cue_host_id = v_actor;
  -- Deliberately no program-audio write and no ROOM event: this is the host-only cue bus.
  perform public.rooms_wave_append_event_v3(
    p_session_id, 'audition.private_started', v_actor, 'private_audition', v_audition_id,
    jsonb_build_object('candidateVersionId', p_candidate_version_id,
      'referenceBeatRevisionId', p_reference_revision_id,
      'programGenerationUnchanged', v_program_generation), p_correlation_id
  );
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('auditionId', v_audition_id, 'state', 'PLAYING'));
end;
$$;

create or replace function public.rooms_wave_stop_private_audition_v5(
  p_audition_id uuid, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_session_id uuid;
begin
  select session_id into v_session_id from public.wave_private_auditions_v5 where id = p_audition_id;
  if not public.rooms_wave_is_master_v5(v_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_private_audition_host_only';
  end if;
  update public.wave_private_auditions_v5 set state = 'STOPPED', stopped_at = now()
  where id = p_audition_id and state in ('REQUESTED', 'READY', 'PLAYING');
  update public.wave_audio_buses_v5 set private_cue_enabled = false, updated_at = now()
  where session_id = v_session_id;
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('auditionId', p_audition_id, 'state', 'STOPPED'));
end;
$$;

create or replace function public.rooms_wave_update_host_presence_v5(
  p_session_id uuid,
  p_connected boolean,
  p_daw_audio_available boolean,
  p_lease_token uuid,
  p_fencing_epoch bigint,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.wave_sessions_v3%rowtype; v_program public.wave_program_audio_state_v3%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  if not exists (
    select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = p_session_id and lease.lease_token = p_lease_token
      and lease.fencing_epoch = p_fencing_epoch and lease.expires_at > now()
  ) then raise exception using errcode = '40001', message = 'wave_fencing_token_stale'; end if;
  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_session_id;
  insert into public.wave_host_presence_v5(
    session_id, connected, daw_audio_available, daw_rtc_publication_id, daw_level_detected,
    last_seen_at, disconnected_at, fallback_revision_id
  ) values (
    p_session_id, p_connected, p_daw_audio_available, null, false, now(),
    case when p_connected then null else now() end, v_session.current_beat_revision_id
  ) on conflict (session_id) do update
  set connected = excluded.connected, daw_audio_available = excluded.daw_audio_available,
      daw_rtc_publication_id = case when excluded.daw_audio_available then public.wave_host_presence_v5.daw_rtc_publication_id else null end,
      daw_level_detected = case when excluded.daw_audio_available then public.wave_host_presence_v5.daw_level_detected else false end,
      last_seen_at = now(), disconnected_at = excluded.disconnected_at,
      fallback_revision_id = excluded.fallback_revision_id, updated_at = now();

  if not p_daw_audio_available and v_program.source = 'HOST_DAW'
     and exists (
       select 1 from public.wave_beat_runtime_v5 runtime
       where runtime.beat_revision_id = v_session.current_beat_revision_id
         and runtime.activation_status in ('READY_FOR_ACTIVATION', 'ACTIVE')
         and runtime.render_asset_id is not null
     ) and not exists (
       select 1 from public.wave_activation_queue_v5 activation
       where activation.session_id = p_session_id and activation.state = 'PENDING_ACTIVATION'
     ) then
    insert into public.wave_activation_queue_v5(
      session_id, previous_revision_id, target_revision_id, quantization, state
    ) values (
      p_session_id, v_session.current_beat_revision_id, v_session.current_beat_revision_id,
      'MEASURE', 'PENDING_ACTIVATION'
    );
  end if;
  -- An already launched public vote is intentionally not suspended here.
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('connected', p_connected,
      'dawAudioAvailable', p_daw_audio_available, 'activeVoteContinues', v_session.active_vote_round_id is not null));
end;
$$;

create or replace function public.rooms_wave_attest_host_daw_v5(
  p_session_id uuid,
  p_rtc_publication_id text,
  p_level_detected boolean,
  p_lease_token uuid,
  p_fencing_epoch bigint,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_rtc_publication_id is null or length(p_rtc_publication_id) not between 3 and 512
     or not p_level_detected then
    raise exception using errcode = '55000', message = 'wave_host_daw_track_and_level_required';
  end if;
  if not exists (select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = p_session_id and lease.lease_token = p_lease_token
      and lease.fencing_epoch = p_fencing_epoch and lease.expires_at > now()) then
    raise exception using errcode = '40001', message = 'wave_fencing_token_stale';
  end if;
  update public.wave_host_presence_v5
  set connected = true, disconnected_at = null, daw_audio_available = true,
      daw_rtc_publication_id = p_rtc_publication_id, daw_level_detected = true,
      last_seen_at = now(), updated_at = now()
  where session_id = p_session_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_host_presence_not_found'; end if;
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('dawAudioAvailable', true,
      'rtcPublicationId', p_rtc_publication_id, 'levelDetected', true));
end;
$$;

create or replace function public.rooms_wave_expire_reservations_v5(p_session_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_reservation public.wave_slot_reservations_v5%rowtype; v_balance integer; v_count integer := 0;
begin
  for v_reservation in
    select * from public.wave_slot_reservations_v5 reservation
    where reservation.status = 'RESERVED' and reservation.expires_at <= now()
      and (p_session_id is null or reservation.session_id = p_session_id)
    for update skip locked
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      v_reservation.session_id::text || ':' || v_reservation.contributor_id::text || ':wave-credits', 0
    ));
    select coalesce((select balance_after from public.wave_credit_ledger_v5 ledger
      where ledger.session_id = v_reservation.session_id
        and ledger.contributor_id = v_reservation.contributor_id
      order by ledger.created_at desc, ledger.id desc limit 1), 0) into v_balance;
    update public.wave_slot_reservations_v5 set status = 'EXPIRED'
    where id = v_reservation.id and status = 'RESERVED';
    if found then
      insert into public.wave_credit_ledger_v5(
        session_id, contributor_id, delta, balance_after, reason, reservation_id, idempotency_key
      ) values (
        v_reservation.session_id, v_reservation.contributor_id, v_reservation.credit_cost,
        v_balance + v_reservation.credit_cost, 'RELEASE', v_reservation.id,
        'expire:' || v_reservation.id::text
      ) on conflict (session_id, contributor_id, idempotency_key) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.rooms_wave_release_slot_v5(
  p_reservation_token uuid, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reservation public.wave_slot_reservations_v5%rowtype; v_balance integer;
begin
  select * into v_reservation from public.wave_slot_reservations_v5
  where reservation_token = p_reservation_token and contributor_id = auth.uid() for update;
  if not found or v_reservation.status <> 'RESERVED' then
    raise exception using errcode = '55000', message = 'wave_slot_reservation_not_releasable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_reservation.session_id::text || ':' || v_reservation.contributor_id::text || ':wave-credits', 0
  ));
  select coalesce((select balance_after from public.wave_credit_ledger_v5 ledger
    where ledger.session_id = v_reservation.session_id and ledger.contributor_id = v_reservation.contributor_id
    order by ledger.created_at desc, ledger.id desc limit 1), 0) into v_balance;
  update public.wave_slot_reservations_v5 set status = 'RELEASED' where id = v_reservation.id;
  insert into public.wave_credit_ledger_v5(
    session_id, contributor_id, delta, balance_after, reason, reservation_id, idempotency_key
  ) values (
    v_reservation.session_id, v_reservation.contributor_id, v_reservation.credit_cost,
    v_balance + v_reservation.credit_cost, 'RELEASE', v_reservation.id,
    'release:' || v_reservation.id::text
  );
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('reservationId', v_reservation.id, 'status', 'RELEASED'));
end;
$$;

create or replace function public.rooms_wave_reserve_slot_v5(
  p_session_id uuid,
  p_category_id uuid,
  p_slot_id uuid,
  p_ttl_seconds integer,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_session public.wave_sessions_v3%rowtype;
  v_category public.wave_categories_v3%rowtype; v_reservation public.wave_slot_reservations_v5%rowtype;
  v_balance integer; v_allowance public.wave_submission_allowances_v3%rowtype;
begin
  if p_ttl_seconds not between 60 and 1800 then raise exception using errcode = '22023', message = 'wave_slot_ttl_invalid'; end if;
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then raise exception using errcode = '42501', message = 'wave_member_required'; end if;
  perform public.rooms_wave_expire_reservations_v5(p_session_id);
  select * into v_session from public.wave_sessions_v3 where id = p_session_id;
  if v_session.lifecycle_state not in ('LIVE_ACTIVE', 'INTERMISSION')
     or (v_session.lifecycle_state = 'INTERMISSION' and not v_session.submissions_during_intermission) then
    raise exception using errcode = '55000', message = 'wave_submissions_closed';
  end if;
  select * into v_category from public.wave_categories_v3 where id = p_category_id and session_id = p_session_id;
  if not found or not v_category.accepting_submissions or v_category.need_state not in ('OPEN', 'PRIORITY') then
    raise exception using errcode = '55000', message = 'wave_category_closed';
  end if;
  if not exists (
    select 1 from public.wave_slots_v3 slot where slot.id = p_slot_id and slot.category_id = p_category_id and slot.state = 'OPEN'
  ) then raise exception using errcode = '55000', message = 'wave_slot_not_available'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_session_id::text || ':' || v_actor::text || ':wave-credits', 0
  ));
  select * into v_allowance from public.wave_submission_allowances_v3 allowance
  where allowance.session_id = p_session_id and allowance.contributor_id = v_actor
    and (allowance.category_id is null or allowance.category_id = p_category_id)
    and allowance.revoked_at is null and (allowance.expires_at is null or allowance.expires_at > now())
    and allowance.used_submissions < allowance.max_submissions
  order by allowance.category_id nulls last limit 1 for update;
  if not found then raise exception using errcode = '42501', message = 'wave_submission_allowance_required'; end if;
  select coalesce((select balance_after from public.wave_credit_ledger_v5
    where session_id = p_session_id and contributor_id = v_actor order by created_at desc limit 1),
    v_allowance.max_submissions - v_allowance.used_submissions) into v_balance;
  if v_balance < 1 then raise exception using errcode = '55000', message = 'wave_submission_credit_exhausted'; end if;
  insert into public.wave_slot_reservations_v5(
    session_id, category_id, slot_id, contributor_id, issued_while_category_open,
    expires_at, upload_may_complete_until
  ) values (
    p_session_id, p_category_id, p_slot_id, v_actor, true,
    now() + make_interval(secs => p_ttl_seconds),
    now() + make_interval(secs => p_ttl_seconds + 1800)
  ) returning * into v_reservation;
  insert into public.wave_credit_ledger_v5(
    session_id, contributor_id, delta, balance_after, reason, reservation_id, idempotency_key
  ) values (p_session_id, v_actor, -1, v_balance - 1, 'RESERVATION', v_reservation.id, p_idempotency_key);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('reservationId', v_reservation.id,
      'reservationToken', v_reservation.reservation_token, 'expiresAt', v_reservation.expires_at,
      'uploadMayCompleteUntil', v_reservation.upload_may_complete_until));
end;
$$;

create or replace function public.rooms_wave_heartbeat_slot_v5(
  p_reservation_token uuid, p_ttl_seconds integer, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reservation public.wave_slot_reservations_v5%rowtype;
begin
  update public.wave_slot_reservations_v5
  set heartbeat_at = now(), expires_at = least(upload_may_complete_until, now() + make_interval(secs => p_ttl_seconds))
  where reservation_token = p_reservation_token and contributor_id = auth.uid()
    and status = 'RESERVED' and expires_at > now()
  returning * into v_reservation;
  if not found then raise exception using errcode = '55000', message = 'wave_slot_reservation_expired'; end if;
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('reservationId', v_reservation.id, 'expiresAt', v_reservation.expires_at));
end;
$$;

create or replace function public.rooms_wave_request_asset_upload_v5(
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
  p_correlation_id text,
  p_reservation_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_category_id uuid; v_slot_id uuid;
  v_reservation jsonb; v_token uuid := p_reservation_token; v_result jsonb;
begin
  if p_purpose = 'LOOP_ORIGINAL' then
    perform public.rooms_wave_expire_reservations_v5(p_session_id);
    if v_token is null then
      select reservation.reservation_token into v_token
      from public.wave_asset_uploads_v4 upload
      join public.wave_slot_reservations_v5 reservation on reservation.id = upload.reservation_id
      where upload.session_id = p_session_id and upload.actor_id = v_actor
        and upload.idempotency_key = p_idempotency_key;
    end if;
    if v_token is null then
      select category.id into v_category_id from public.wave_categories_v3 category
      where category.session_id = p_session_id and category.code = lower(btrim(p_category_code));
      select slot.id into v_slot_id from public.wave_slots_v3 slot
      where slot.session_id = p_session_id and slot.category_id = v_category_id and slot.state = 'OPEN'
        and not exists (select 1 from public.wave_slot_reservations_v5 reservation
          where reservation.slot_id = slot.id and reservation.status = 'RESERVED')
      order by slot.slot_index limit 1;
      if v_slot_id is null then raise exception using errcode = '53300', message = 'wave_category_has_no_open_slot'; end if;
      v_reservation := public.rooms_wave_reserve_slot_v5(
        p_session_id, v_category_id, v_slot_id, 600,
        'upload:' || md5(p_idempotency_key), p_correlation_id
      );
      v_token := (v_reservation#>>'{data,reservationToken}')::uuid;
    end if;
    perform set_config('app.wave_reservation_token', v_token::text, true);
  else
    perform set_config('app.wave_reservation_token', '', true);
  end if;
  v_result := public.rooms_wave_request_asset_upload_v4(
    p_session_id, p_purpose, p_category_code, p_file_name, p_byte_size,
    p_claimed_mime_type, p_sha256, p_terms_version, p_terms_accepted_at,
    p_idempotency_key, p_correlation_id
  );
  return v_result;
end;
$$;

create or replace function public.rooms_wave_confirm_asset_upload_v5(
  p_actor_id uuid,
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if not exists (select 1 from public.wave_asset_uploads_v4 upload
    where upload.id = p_upload_id and upload.session_id = p_session_id
      and upload.asset_id = p_asset_id and upload.actor_id = p_actor_id) then
    raise exception using errcode = '42501', message = 'wave_upload_confirmation_forbidden';
  end if;
  perform set_config('app.wave_actor_id', p_actor_id::text, true);
  return public.rooms_wave_confirm_asset_upload_v4(
    p_session_id, p_upload_id, p_asset_id, p_byte_size, p_sha256,
    p_observed_byte_size, p_observed_mime_type, p_observed_etag,
    p_idempotency_key, p_correlation_id
  );
end;
$$;

create or replace function public.rooms_wave_guard_upload_window_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.wave_sessions_v3%rowtype;
begin
  select * into v_session from public.wave_sessions_v3 where id = new.session_id;
  if v_session.lifecycle_state not in ('LIVE_ACTIVE', 'INTERMISSION')
     or (v_session.lifecycle_state = 'INTERMISSION' and not v_session.submissions_during_intermission) then
    raise exception using errcode = '55000', message = 'wave_new_uploads_closed';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_upload_window_v5 on public.wave_asset_uploads_v4;
create trigger wave_upload_window_v5 before insert on public.wave_asset_uploads_v4
for each row execute function public.rooms_wave_guard_upload_window_v5();

create or replace function public.rooms_wave_set_lifecycle_v5(
  p_session_id uuid,
  p_state public.wave_lifecycle_state_v5,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_old public.wave_lifecycle_state_v5;
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  select lifecycle_state into v_old from public.wave_sessions_v3 where id = p_session_id for update;
  if not ((v_old, p_state) in (
    ('PREPARING','LIVE_ACTIVE'), ('PREPARING','CANCELLED'),
    ('LIVE_ACTIVE','INTERMISSION'), ('LIVE_ACTIVE','PAUSED'), ('LIVE_ACTIVE','CLOSURE_VOTE'), ('LIVE_ACTIVE','CANCELLED'),
    ('INTERMISSION','LIVE_ACTIVE'), ('INTERMISSION','PAUSED'), ('INTERMISSION','CLOSURE_VOTE'), ('INTERMISSION','CANCELLED'),
    ('PAUSED','LIVE_ACTIVE'), ('PAUSED','INTERMISSION'), ('PAUSED','CANCELLED'),
    ('CLOSURE_VOTE','LIVE_ACTIVE'), ('CLOSURE_VOTE','FINALIZING'),
    ('FINALIZING','CLOSED')
  ) or v_old = p_state) then
    raise exception using errcode = '55000', message = 'wave_lifecycle_transition_forbidden';
  end if;
  update public.wave_sessions_v3
  set lifecycle_state = p_state,
      status = case when p_state = 'CLOSED' then 'ENDED'::public.wave_session_status_v3
                    when p_state = 'CANCELLED' then 'CANCELLED'::public.wave_session_status_v3
                    when p_state = 'PAUSED' then 'PAUSED'::public.wave_session_status_v3
                    when p_state in ('LIVE_ACTIVE','INTERMISSION','CLOSURE_VOTE','FINALIZING') then 'LIVE'::public.wave_session_status_v3
                    else status end,
      updated_at = now()
  where id = p_session_id;
  perform public.rooms_wave_append_event_v3(p_session_id, 'wave.lifecycle_changed', v_actor, 'session', p_session_id,
    jsonb_build_object('from', v_old, 'to', p_state), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('waveId', p_session_id, 'state', p_state));
end;
$$;

create or replace function public.rooms_wave_set_bus_controls_v5(
  p_session_id uuid,
  p_public_gain_db numeric,
  p_emergency_muted boolean,
  p_reason text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  if p_public_gain_db not between -24 and 6 or (p_emergency_muted and length(btrim(coalesce(p_reason, ''))) < 3) then
    raise exception using errcode = '22023', message = 'wave_bus_control_invalid';
  end if;
  update public.wave_audio_buses_v5
  set public_gain_db = p_public_gain_db, emergency_muted = p_emergency_muted,
      emergency_mute_reason = case when p_emergency_muted then p_reason else null end,
      updated_at = now() where session_id = p_session_id;
  perform public.rooms_wave_append_event_v3(p_session_id, 'program_audio.safety_changed', v_actor,
    'audio_bus', p_session_id, jsonb_build_object('gainDb', p_public_gain_db,
      'emergencyMuted', p_emergency_muted, 'reason', p_reason), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('gainDb', p_public_gain_db, 'emergencyMuted', p_emergency_muted));
end;
$$;

create or replace function public.rooms_wave_request_private_mix_export_v5(
  p_session_id uuid,
  p_beat_revision_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_export_id uuid; v_rights jsonb;
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  if not exists (
    select 1 from public.wave_beat_revisions_v3 revision
    where revision.id = p_beat_revision_id and revision.session_id = p_session_id
  ) then raise exception using errcode = 'P0002', message = 'wave_beat_revision_not_found'; end if;
  if exists (
    select 1 from public.wave_beat_tracks_v3 track
    join public.wave_loop_versions_v3 version on version.id = track.loop_version_id
    join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
    where track.beat_revision_id = p_beat_revision_id and not track.is_host_base
      and coalesce((
        select consent.status from public.wave_rights_consents_v3 consent
        where consent.submission_id = submission.id and consent.contributor_id = submission.contributor_id
        order by consent.accepted_at desc, consent.id desc limit 1
      ), 'REVOKED') <> 'GRANTED'
  ) then raise exception using errcode = '55000', message = 'wave_export_rights_incomplete'; end if;
  select jsonb_build_object('verifiedAt', now(), 'beatRevisionId', p_beat_revision_id,
    'allTrackConsentsGranted', true) into v_rights;
  insert into public.wave_private_mix_exports_v5(session_id, beat_revision_id, requested_by, rights_snapshot)
  values (p_session_id, p_beat_revision_id, v_actor, v_rights) returning id into v_export_id;
  insert into public.wave_transactional_outbox_v5(session_id, fencing_epoch, topic, aggregate_type, aggregate_id, payload)
  select p_session_id, clock.fencing_epoch, 'wave.private_mix.render_requested', 'private_mix_export', v_export_id,
    jsonb_build_object('beatRevisionId', p_beat_revision_id, 'hostOnly', true)
  from public.wave_musical_clock_v5 clock where clock.session_id = p_session_id;
  perform public.rooms_wave_append_event_v3(p_session_id, 'private_mix.requested', v_actor,
    'private_mix_export', v_export_id, jsonb_build_object('beatRevisionId', p_beat_revision_id), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('exportId', v_export_id, 'status', 'REQUESTED'));
end;
$$;

create or replace function public.rooms_wave_get_production_reference_v5(
  p_session_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_master boolean; v_result jsonb;
begin
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_member_required';
  end if;
  v_master := public.rooms_wave_is_master_v5(p_session_id, v_actor);
  if not v_master and not exists (
    select 1 from public.wave_submission_allowances_v3 allowance
    where allowance.session_id = p_session_id and allowance.contributor_id = v_actor
      and allowance.revoked_at is null and (allowance.expires_at is null or allowance.expires_at > now())
  ) then
    raise exception using errcode = '42501', message = 'wave_production_reference_forbidden';
  end if;
  select jsonb_build_object(
    'id', reference.id, 'beatRevisionId', reference.beat_revision_id,
    'rulesRevisionId', reference.rules_revision_id,
    'assetId', case when v_master then coalesce(reference.studio_asset_id, reference.light_asset_id)
                    else reference.light_asset_id end,
    'assetRole', case when v_master and reference.studio_asset_id is not null then 'STUDIO' else 'LIGHT' end,
    'cycleBars', reference.cycle_bars, 'cycleDurationMs', reference.cycle_duration_ms,
    'contentHash', reference.content_hash
  ) into v_result
  from public.wave_sessions_v3 session
  join public.wave_production_references_v5 reference on reference.id = session.production_reference_id
  where session.id = p_session_id;
  return jsonb_build_object('correlationId', p_correlation_id, 'data', v_result);
end;
$$;

create or replace function public.rooms_wave_start_closing_vote_v5(
  p_session_id uuid,
  p_preview_asset_id uuid,
  p_listen_seconds integer,
  p_vote_seconds integer,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_session public.wave_sessions_v3%rowtype;
  v_defaults jsonb; v_vote_id uuid; v_eligible integer; v_quorum integer; v_threshold numeric;
  v_preview_duration_ms integer; v_listen_ms integer;
begin
  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  if v_session.host_id is distinct from v_actor then raise exception using errcode = '42501', message = 'wave_master_required'; end if;
  if v_session.lifecycle_state not in ('LIVE_ACTIVE', 'INTERMISSION')
     or (v_session.closure_cooldown_until is not null and v_session.closure_cooldown_until > now()) then
    raise exception using errcode = '55000', message = 'wave_closure_vote_not_available';
  end if;
  if p_listen_seconds not between 1 and 3600 or p_vote_seconds not between 5 and 3600
     or v_session.current_beat_revision_id is null then
    raise exception using errcode = '22023', message = 'wave_closure_vote_configuration_invalid';
  end if;
  select asset.duration_ms into v_preview_duration_ms
  from public.wave_audio_assets_v3 asset where asset.id = p_preview_asset_id
    and asset.session_id = p_session_id and asset.status = 'READY'
    and asset.duration_ms is not null and asset.duration_ms > 0
    and asset.kind::text in ('PREVIEW_DERIVATIVE','PREVIEW','RENDER');
  if v_preview_duration_ms is null then
    raise exception using errcode = '55000', message = 'wave_closure_preview_not_ready';
  end if;
  v_listen_ms := greatest(p_listen_seconds * 1000, v_preview_duration_ms);
  select closure into v_defaults from public.wave_vote_defaults_v5 where session_id = p_session_id;
  select count(distinct participant.user_id)::integer into v_eligible
  from public.room_participants_v2 participant
  where participant.room_id = v_session.room_id and participant.left_at is null
    and not exists (select 1 from public.room_bans_v2 ban
      where ban.room_id = participant.room_id and ban.user_id = participant.user_id);
  v_quorum := greatest(1, ceil(v_eligible * coalesce((v_defaults->>'quorumRatio')::numeric, .2))::integer);
  v_threshold := coalesce((v_defaults->>'approvalThreshold')::numeric, .6);
  insert into public.wave_closing_votes_v5(
    session_id, reference_beat_revision_id, preview_asset_id, opens_at, closes_at,
    eligible_voters, quorum, approval_threshold, created_by
  ) values (
    p_session_id, v_session.current_beat_revision_id, p_preview_asset_id,
    now() + make_interval(secs => v_listen_ms::double precision / 1000),
    now() + make_interval(secs => v_listen_ms::double precision / 1000 + p_vote_seconds),
    0, 1, v_threshold, v_actor
  ) returning id into v_vote_id;
  update public.wave_sessions_v3 set lifecycle_state = 'CLOSURE_VOTE', updated_at = now() where id = p_session_id;
  perform public.rooms_wave_append_event_v3(p_session_id, 'closure_vote.started', v_actor,
    'closing_vote', v_vote_id, jsonb_build_object('referenceBeatRevisionId', v_session.current_beat_revision_id,
      'previewDurationMs', v_preview_duration_ms), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('closingVoteId', v_vote_id, 'status', 'LISTENING'));
end;
$$;

create or replace function public.rooms_wave_record_closing_listen_receipt_v5(
  p_closing_vote_id uuid,
  p_voter_id uuid,
  p_heard_ms integer,
  p_receipt_token_hash text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_vote public.wave_closing_votes_v5%rowtype; v_duration_ms integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  select * into v_vote from public.wave_closing_votes_v5 where id = p_closing_vote_id;
  if not found or v_vote.status <> 'LISTENING' or now() >= v_vote.closes_at then
    raise exception using errcode = '55000', message = 'wave_closing_listening_window_closed';
  end if;
  select duration_ms into v_duration_ms from public.wave_audio_assets_v3
  where id = v_vote.preview_asset_id and status = 'READY';
  if v_duration_ms is null or p_heard_ms < v_duration_ms or length(p_receipt_token_hash) < 16 then
    raise exception using errcode = '55000', message = 'wave_closing_full_preview_required';
  end if;
  if not public.rooms_wave_is_member_v3(v_vote.session_id, p_voter_id) then
    raise exception using errcode = '42501', message = 'wave_closing_voter_ineligible';
  end if;
  insert into public.wave_closing_listen_receipts_v5(
    closing_vote_id, voter_id, heard_ms, receipt_token_hash
  ) values (p_closing_vote_id, p_voter_id, p_heard_ms, p_receipt_token_hash)
  on conflict (closing_vote_id, voter_id) do update
  set heard_ms = greatest(public.wave_closing_listen_receipts_v5.heard_ms, excluded.heard_ms),
      completed_at = now(), receipt_token_hash = excluded.receipt_token_hash;
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('closingVoteId', p_closing_vote_id, 'eligible', true));
end;
$$;

create or replace function public.rooms_wave_freeze_closing_vote_eligibility_v5(
  p_closing_vote_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_vote public.wave_closing_votes_v5%rowtype; v_session public.wave_sessions_v3%rowtype;
  v_count integer; v_quorum integer; v_ratio numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  select * into v_vote from public.wave_closing_votes_v5 where id = p_closing_vote_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_closing_vote_not_found'; end if;
  if v_vote.status = 'OPEN' then
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', jsonb_build_object('closingVoteId', p_closing_vote_id,
        'eligibleVoters', v_vote.eligible_voters, 'quorum', v_vote.quorum));
  end if;
  if v_vote.status <> 'LISTENING' or now() < v_vote.opens_at or now() >= v_vote.closes_at then
    raise exception using errcode = '55000', message = 'wave_closing_eligibility_freeze_window_invalid';
  end if;
  select * into v_session from public.wave_sessions_v3 where id = v_vote.session_id;
  insert into public.wave_closing_eligible_voters_v5(closing_vote_id, voter_id, receipt_completed_at)
  select receipt.closing_vote_id, receipt.voter_id, receipt.completed_at
  from public.wave_closing_listen_receipts_v5 receipt
  join public.room_participants_v2 participant
    on participant.room_id = v_session.room_id and participant.user_id = receipt.voter_id
   and participant.left_at is null
  where receipt.closing_vote_id = p_closing_vote_id
    and not exists (select 1 from public.room_bans_v2 ban
      where ban.room_id = v_session.room_id and ban.user_id = receipt.voter_id)
  on conflict do nothing;
  select count(*)::integer into v_count from public.wave_closing_eligible_voters_v5
  where closing_vote_id = p_closing_vote_id;
  select coalesce((closure->>'quorumRatio')::numeric, .2) into v_ratio
  from public.wave_vote_defaults_v5 where session_id = v_vote.session_id;
  v_quorum := greatest(1, ceil(v_count * coalesce(v_ratio, .2))::integer);
  update public.wave_closing_votes_v5
  set status = 'OPEN', eligible_voters = v_count, quorum = v_quorum
  where id = p_closing_vote_id;
  perform public.rooms_wave_append_event_v3(v_vote.session_id, 'closure_vote.opened', null,
    'closing_vote', p_closing_vote_id,
    jsonb_build_object('eligibleVoters', v_count, 'quorum', v_quorum), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('closingVoteId', p_closing_vote_id,
      'eligibleVoters', v_count, 'quorum', v_quorum));
end;
$$;

create or replace function public.rooms_wave_cast_closing_vote_v5(
  p_closing_vote_id uuid, p_choice public.wave_vote_choice_v3, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_vote public.wave_closing_votes_v5%rowtype; v_actor uuid := auth.uid();
begin
  select * into v_vote from public.wave_closing_votes_v5 where id = p_closing_vote_id;
  if not found or not public.rooms_wave_is_member_v3(v_vote.session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_closing_vote_forbidden';
  end if;
  if now() < v_vote.opens_at or now() >= v_vote.closes_at or v_vote.status <> 'OPEN' then
    raise exception using errcode = '55000', message = 'wave_closing_vote_window_closed';
  end if;
  if not exists (select 1 from public.wave_closing_eligible_voters_v5 eligible
    where eligible.closing_vote_id = p_closing_vote_id and eligible.voter_id = v_actor) then
    raise exception using errcode = '42501', message = 'wave_closing_listen_receipt_required';
  end if;
  insert into public.wave_closing_ballots_v5(closing_vote_id, voter_id, choice)
  values (p_closing_vote_id, v_actor, p_choice);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('closingVoteId', p_closing_vote_id, 'accepted', true));
end;
$$;

create or replace function public.rooms_wave_finalize_closing_vote_v5(
  p_closing_vote_id uuid, p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_vote public.wave_closing_votes_v5%rowtype; v_actor uuid := auth.uid();
  v_total integer; v_approve integer; v_approved boolean;
begin
  select * into v_vote from public.wave_closing_votes_v5 where id = p_closing_vote_id for update;
  if not found or not public.rooms_wave_is_master_v5(v_vote.session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  if now() < v_vote.closes_at or v_vote.status not in ('LISTENING','OPEN') then
    raise exception using errcode = '55000', message = 'wave_closing_vote_cannot_finalize';
  end if;
  select count(*)::integer, count(*) filter (where choice = 'APPROVE')::integer
  into v_total, v_approve from public.wave_closing_ballots_v5 where closing_vote_id = p_closing_vote_id;
  v_approved := v_total >= v_vote.quorum and v_total > 0
    and v_approve::numeric / v_total::numeric >= v_vote.approval_threshold;
  update public.wave_closing_votes_v5
  set status = 'FINALIZED', approved = v_approved,
      final_beat_revision_id = case when v_approved then reference_beat_revision_id else null end,
      finalized_at = now() where id = p_closing_vote_id;
  if v_approved then
    update public.wave_sessions_v3
    set lifecycle_state = 'FINALIZING', final_beat_revision_id = v_vote.reference_beat_revision_id,
        finalized_at = now(), updated_at = now()
    where id = v_vote.session_id;
  else
    update public.wave_sessions_v3
    set lifecycle_state = 'LIVE_ACTIVE', closure_cooldown_until = now() + interval '2 minutes', updated_at = now()
    where id = v_vote.session_id;
  end if;
  perform public.rooms_wave_append_event_v3(v_vote.session_id, 'closure_vote.result', v_actor,
    'closing_vote', p_closing_vote_id,
    jsonb_build_object('approved', v_approved, 'totalVotes', v_total, 'approveCount', v_approve), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('closingVoteId', p_closing_vote_id, 'approved', v_approved,
      'finalBeatRevisionId', case when v_approved then v_vote.reference_beat_revision_id else null end));
end;
$$;

-- Stable application-facing command names. They intentionally wrap the
-- authoritative primitives instead of duplicating artistic decisions.
create or replace function public.rooms_wave_raise_master_required_v5()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception using errcode = '42501', message = 'wave_master_required'; end; $$;

create or replace function public.rooms_launch_wave_production_v5(
  p_session_id uuid, p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session public.wave_sessions_v3%rowtype; v_result jsonb; v_hash text;
begin
  select * into v_session from public.wave_sessions_v3 where id = p_session_id for update;
  if not found or v_session.host_id is distinct from v_actor then raise exception using errcode = '42501', message = 'wave_master_required'; end if;
  if v_session.active_rules_revision_id is null or v_session.production_reference_id is null then
    raise exception using errcode = '55000', message = 'wave_production_reference_required';
  end if;
  if v_session.lifecycle_state not in ('PREPARING','PAUSED','INTERMISSION') then
    raise exception using errcode = '55000', message = 'wave_cannot_launch_from_state';
  end if;
  v_hash := md5(concat_ws(':', p_session_id, 'launch'));
  select result into v_result from public.wave_idempotency_v3
  where session_id = p_session_id and actor_id = v_actor and command_name = 'launch_wave_v5'
    and idempotency_key = p_idempotency_key and request_hash = v_hash;
  if found then return v_result; end if;
  update public.wave_sessions_v3 set lifecycle_state = 'LIVE_ACTIVE', status = 'LIVE', updated_at = now()
  where id = p_session_id;
  perform public.rooms_wave_append_event_v3(p_session_id, 'wave.launched', v_actor, 'session', p_session_id,
    jsonb_build_object('rulesRevisionId', v_session.active_rules_revision_id,
      'productionReferenceId', v_session.production_reference_id), p_correlation_id);
  v_result := jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('waveId', p_session_id, 'state', 'LIVE_ACTIVE'));
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_session_id, v_actor, 'launch_wave_v5', p_idempotency_key, v_hash, v_result);
  return v_result;
end; $$;

create or replace function public.rooms_set_wave_category_open_v5(
  p_session_id uuid, p_category_id uuid, p_open boolean,
  p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then raise exception using errcode = '42501', message = 'wave_master_required'; end if;
  update public.wave_categories_v3
  set accepting_submissions = p_open,
      need_state = case when p_open and need_state = 'CLOSED' then 'OPEN'::public.wave_category_need_v5
                        when not p_open then 'CLOSED'::public.wave_category_need_v5 else need_state end
  where id = p_category_id and session_id = p_session_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_category_not_found'; end if;
  perform public.rooms_wave_append_event_v3(p_session_id, 'category.availability_changed', v_actor,
    'category', p_category_id, jsonb_build_object('open', p_open), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('categoryId', p_category_id, 'open', p_open));
end; $$;

create or replace function public.rooms_review_wave_submission_v5(
  p_session_id uuid, p_submission_id uuid, p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if not public.rooms_wave_is_master_v5(p_session_id, v_actor) then raise exception using errcode = '42501', message = 'wave_master_required'; end if;
  update public.wave_loop_submissions_v3 set status = 'NEEDS_REVIEW', updated_at = now()
  where id = p_submission_id and session_id = p_session_id and status = 'RECEIVED';
  if not found then raise exception using errcode = '55000', message = 'wave_submission_not_reviewable'; end if;
  perform public.rooms_wave_append_event_v3(p_session_id, 'submission.review_started', v_actor,
    'submission', p_submission_id, '{}'::jsonb, p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('submissionId', p_submission_id, 'status', 'NEEDS_REVIEW'));
end; $$;

create or replace function public.rooms_reject_wave_submission_v5(
  p_session_id uuid, p_submission_id uuid, p_reason text,
  p_idempotency_key text, p_correlation_id text
)
returns jsonb language sql security definer set search_path = '' as $$
  select case when public.rooms_wave_is_master_v5(p_session_id, auth.uid()) then
    public.rooms_wave_decide_submission_v5(
      p_submission_id, 'REJECTED', p_reason, p_idempotency_key, p_correlation_id
    ) else public.rooms_wave_raise_master_required_v5() end;
$$;

create or replace function public.rooms_get_wave_session_for_room_v5(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_session public.wave_sessions_v3%rowtype;
begin
  select * into v_session from public.wave_sessions_v3 session
  where session.room_id = p_room_id
  order by (session.lifecycle_state in ('PREPARING','LIVE_ACTIVE','INTERMISSION','PAUSED','CLOSURE_VOTE','FINALIZING')) desc,
    session.updated_at desc limit 1;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if not public.rooms_wave_is_member_v3(v_session.id, auth.uid()) then
    raise exception using errcode = '42501', message = 'wave_session_lookup_forbidden';
  end if;
  return jsonb_build_object('sessionId', v_session.id, 'roomId', v_session.room_id,
    'lifecycleState', v_session.lifecycle_state, 'status', v_session.status);
end;
$$;

create or replace function public.rooms_wave_request_program_audio_switch_v5(
  p_wave_id uuid,
  p_source text,
  p_expected_sequence bigint,
  p_idempotency_key text,
  p_beat_revision_id uuid,
  p_musical_position_beats numeric,
  p_transition_ms integer,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_session public.wave_sessions_v3%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype; v_presence public.wave_host_presence_v5%rowtype;
  v_intent public.wave_program_switch_intents_v5%rowtype; v_epoch bigint;
begin
  if p_source not in ('SERVER_RENDER','HOST_DAW') or p_expected_sequence < 1
     or length(p_idempotency_key) not between 8 and 160
     or p_musical_position_beats < 0 or p_transition_ms not between 0 and 2000 then
    raise exception using errcode = '22023', message = 'wave_program_command_invalid';
  end if;
  select * into v_session from public.wave_sessions_v3 where id = p_wave_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if v_session.host_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'wave_master_required';
  end if;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_wave_id;
  if v_program.generation <> p_expected_sequence then
    raise exception using errcode = '40001', message = 'wave_program_sequence_conflict';
  end if;
  select fencing_epoch into v_epoch from public.wave_musical_clock_v5 where session_id = p_wave_id;
  if not exists (select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = p_wave_id and lease.fencing_epoch = v_epoch and lease.expires_at > now()) then
    raise exception using errcode = '55000', message = 'wave_active_coordinator_required';
  end if;
  if p_source = 'SERVER_RENDER' then
    if p_beat_revision_id is distinct from v_session.current_beat_revision_id or not exists (
      select 1 from public.wave_beat_runtime_v5 runtime
      where runtime.beat_revision_id = p_beat_revision_id
        and runtime.activation_status in ('READY_FOR_ACTIVATION','ACTIVE')
        and runtime.render_asset_id is not null
    ) then raise exception using errcode = '55000', message = 'wave_render_not_ready'; end if;
  else
    if p_beat_revision_id is not null then raise exception using errcode = '22023', message = 'wave_host_daw_revision_forbidden'; end if;
    select * into v_presence from public.wave_host_presence_v5 where session_id = p_wave_id;
    if not found or not v_presence.connected or not v_presence.daw_audio_available
       or not v_presence.daw_level_detected or v_presence.daw_rtc_publication_id is null then
      raise exception using errcode = '55000', message = 'wave_host_daw_track_and_level_required';
    end if;
  end if;
  select * into v_intent from public.wave_program_switch_intents_v5
  where session_id = p_wave_id and requested_by = v_actor and idempotency_key = p_idempotency_key;
  if not found then
    insert into public.wave_program_switch_intents_v5(
      session_id, requested_by, source, beat_revision_id, expected_program_generation,
      musical_position_beats, transition_ms, idempotency_key
    ) values (
      p_wave_id, v_actor, p_source, p_beat_revision_id, p_expected_sequence,
      p_musical_position_beats, p_transition_ms, p_idempotency_key
    ) returning * into v_intent;
    insert into public.wave_transactional_outbox_v5(
      session_id, fencing_epoch, topic, aggregate_type, aggregate_id, payload
    ) values (
      p_wave_id, v_epoch, 'wave.program.switch.requested', 'program_switch_intent', v_intent.id,
      jsonb_build_object('source', p_source, 'beatRevisionId', p_beat_revision_id,
        'expectedSequence', p_expected_sequence, 'quantization', 'MEASURE')
    );
  elsif v_intent.source <> p_source or v_intent.beat_revision_id is distinct from p_beat_revision_id
     or v_intent.expected_program_generation <> p_expected_sequence then
    raise exception using errcode = '23505', message = 'idempotency_key_reused';
  end if;
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', public.rooms_wave_program_audio_projection_v1(p_wave_id)
      || jsonb_build_object('pendingSource', p_source, 'switchIntentId', v_intent.id,
        'intentState', v_intent.state));
end;
$$;

create or replace function public.rooms_request_wave_submission_correction_v5(
  p_session_id uuid, p_submission_id uuid, p_reason text,
  p_idempotency_key text, p_correlation_id text
)
returns jsonb language sql security definer set search_path = '' as $$
  select case when public.rooms_wave_is_master_v5(p_session_id, auth.uid()) then
    public.rooms_wave_decide_submission_v5(
      p_submission_id, 'NEEDS_CORRECTION', p_reason, p_idempotency_key, p_correlation_id
    ) else public.rooms_wave_raise_master_required_v5() end;
$$;

create or replace function public.rooms_mark_wave_submission_ready_for_vote_v5(
  p_session_id uuid, p_submission_id uuid,
  p_idempotency_key text, p_correlation_id text
)
returns jsonb language sql security definer set search_path = '' as $$
  select case when public.rooms_wave_is_master_v5(p_session_id, auth.uid()) then
    public.rooms_wave_decide_submission_v5(
      p_submission_id, 'READY_FOR_VOTE', null, p_idempotency_key, p_correlation_id
    ) else public.rooms_wave_raise_master_required_v5() end;
$$;

create or replace function public.rooms_start_wave_closing_vote_v5(
  p_session_id uuid, p_preview_asset_id uuid, p_listen_seconds integer,
  p_vote_seconds integer, p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_hash text; v_result jsonb; v_stored_hash text;
begin
  v_hash := md5(concat_ws(':', p_session_id, p_preview_asset_id, p_listen_seconds, p_vote_seconds));
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_session_id, v_actor, 'start_closing_vote_v5', p_idempotency_key), 0
  ));
  select request_hash, result into v_stored_hash, v_result from public.wave_idempotency_v3
  where session_id = p_session_id and actor_id = v_actor
    and command_name = 'start_closing_vote_v5' and idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;
  v_result := public.rooms_wave_start_closing_vote_v5(
    p_session_id, p_preview_asset_id, p_listen_seconds, p_vote_seconds, p_correlation_id
  );
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (p_session_id, v_actor, 'start_closing_vote_v5', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_cast_wave_closing_vote_v5(
  p_closing_vote_id uuid, p_choice public.wave_vote_choice_v3,
  p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session_id uuid; v_hash text; v_result jsonb; v_stored_hash text;
begin
  select session_id into v_session_id from public.wave_closing_votes_v5 where id = p_closing_vote_id;
  if v_session_id is null then raise exception using errcode = 'P0002', message = 'wave_closing_vote_not_found'; end if;
  v_hash := md5(concat_ws(':', p_closing_vote_id, p_choice));
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', v_session_id, v_actor, 'cast_closing_vote_v5', p_idempotency_key), 0
  ));
  select request_hash, result into v_stored_hash, v_result from public.wave_idempotency_v3
  where session_id = v_session_id and actor_id = v_actor
    and command_name = 'cast_closing_vote_v5' and idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;
  v_result := public.rooms_wave_cast_closing_vote_v5(p_closing_vote_id, p_choice, p_correlation_id);
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_session_id, v_actor, 'cast_closing_vote_v5', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_finalize_wave_closing_vote_v5(
  p_closing_vote_id uuid, p_idempotency_key text, p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session_id uuid; v_hash text; v_result jsonb; v_stored_hash text;
begin
  select session_id into v_session_id from public.wave_closing_votes_v5 where id = p_closing_vote_id;
  if v_session_id is null then raise exception using errcode = 'P0002', message = 'wave_closing_vote_not_found'; end if;
  v_hash := md5(p_closing_vote_id::text);
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', v_session_id, v_actor, 'finalize_closing_vote_v5', p_idempotency_key), 0
  ));
  select request_hash, result into v_stored_hash, v_result from public.wave_idempotency_v3
  where session_id = v_session_id and actor_id = v_actor
    and command_name = 'finalize_closing_vote_v5' and idempotency_key = p_idempotency_key;
  if found then
    if v_stored_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return v_result;
  end if;
  v_result := public.rooms_wave_finalize_closing_vote_v5(p_closing_vote_id, p_correlation_id);
  insert into public.wave_idempotency_v3(session_id, actor_id, command_name, idempotency_key, request_hash, result)
  values (v_session_id, v_actor, 'finalize_closing_vote_v5', p_idempotency_key, v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.rooms_wave_guard_final_revision_v5()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.final_beat_revision_id is not null
     and new.final_beat_revision_id is distinct from old.final_beat_revision_id then
    raise exception using errcode = '55000', message = 'wave_final_beat_revision_is_immutable';
  end if;
  if old.final_beat_revision_id is null and new.final_beat_revision_id is not null
     and not exists (
       select 1 from public.wave_closing_votes_v5 vote
       where vote.session_id = new.id and vote.status = 'FINALIZED' and vote.approved
         and vote.final_beat_revision_id = new.final_beat_revision_id
     ) then
    raise exception using errcode = '55000', message = 'wave_final_beat_requires_public_closure_vote';
  end if;
  return new;
end;
$$;
drop trigger if exists wave_final_revision_immutable_v5 on public.wave_sessions_v3;
create trigger wave_final_revision_immutable_v5 before update on public.wave_sessions_v3
for each row execute function public.rooms_wave_guard_final_revision_v5();

-- Recovery must not reuse the control-plane snapshot for ordinary viewers.
-- Accepted credits remain public, but upload/submission identities, private
-- asset IDs and technical version IDs stay on the host/subject paths.
create or replace function public.rooms_get_wave_snapshot_v5(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_state jsonb;
  v_categories jsonb;
  v_tracks jsonb;
begin
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_snapshot_forbidden';
  end if;
  v_state := public.rooms_get_wave_snapshot_v3(p_session_id);
  if public.rooms_wave_is_master_v5(p_session_id, v_actor) then return v_state; end if;

  select coalesce(jsonb_agg(
    (category - 'slots') || jsonb_build_object('slots', coalesce((
      select jsonb_agg(slot - 'acceptedVersionId' order by (slot->>'index')::integer)
      from jsonb_array_elements(coalesce(category->'slots', '[]'::jsonb)) slot
    ), '[]'::jsonb)) order by (category->>'position')::integer
  ), '[]'::jsonb) into v_categories
  from jsonb_array_elements(coalesce(v_state->'categories', '[]'::jsonb)) category;

  select coalesce(jsonb_agg(
    track - 'loopVersionId' - 'contributorId' order by (track->>'position')::integer
  ), '[]'::jsonb) into v_tracks
  from jsonb_array_elements(coalesce(v_state#>'{beat,tracks}', '[]'::jsonb)) track;

  v_state := jsonb_set(v_state, '{categories}', v_categories, true);
  v_state := jsonb_set(v_state, '{submissions}', '[]'::jsonb, true);
  if jsonb_typeof(v_state->'beat') = 'object' then
    v_state := jsonb_set(v_state, '{beat,tracks}', v_tracks, true) #- '{beat,renderAssetId}';
  end if;
  if jsonb_typeof(v_state->'vote') = 'object' then
    v_state := v_state #- '{vote,candidateVersionId}' #- '{vote,replacesTrackId}' #- '{vote,previewAssetId}';
  end if;
  if jsonb_typeof(v_state->'programAudio') = 'object' then
    v_state := v_state #- '{programAudio,sourceAssetId}' #- '{programAudio,sourceRtcPublicationId}';
  end if;
  return v_state;
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
  v_actor uuid := auth.uid(); v_session public.wave_sessions_v3%rowtype;
  v_is_master boolean; v_events jsonb; v_cursor_event_id uuid;
begin
  if p_after_sequence < 0 or p_correlation_id is null or length(p_correlation_id) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'wave_recovery_cursor_invalid';
  end if;
  select * into v_session from public.wave_sessions_v3 where id = p_wave_id;
  if not found then raise exception using errcode = 'P0002', message = 'wave_session_not_found'; end if;
  if not public.rooms_wave_is_member_v3(p_wave_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_recovery_forbidden';
  end if;
  v_is_master := public.rooms_wave_is_master_v5(p_wave_id, v_actor);
  if p_after_event_id is not null and not exists (
    select 1 from public.wave_event_v1 event
    where event.wave_id = p_wave_id and event.sequence = p_after_sequence and event.id = p_after_event_id
      and (not event.sensitive or v_is_master or event.subject_user_id = v_actor)
      and (event.audience = 'ROOM' or (event.audience = 'HOST' and v_is_master)
        or (event.audience = 'SUBJECT' and (v_is_master or event.subject_user_id = v_actor)))
  ) then raise exception using errcode = '22023', message = 'wave_recovery_cursor_mismatch'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id, 'waveId', event.wave_id, 'sequence', event.sequence,
    'type', event.type, 'actorId', event.actor_id, 'correlationId', event.correlation_id,
    'occurredAt', event.occurred_at, 'payload', event.payload
  ) order by event.sequence), '[]'::jsonb) into v_events
  from public.wave_event_v1 event
  where event.wave_id = p_wave_id and event.sequence > p_after_sequence
    and event.sequence <= v_session.event_sequence
    and (not event.sensitive or v_is_master or event.subject_user_id = v_actor)
    and (event.audience = 'ROOM' or (event.audience = 'HOST' and v_is_master)
      or (event.audience = 'SUBJECT' and (v_is_master or event.subject_user_id = v_actor)));

  -- A cursor event ID is only valid for the exact global sequence. If the
  -- latest event is private to another subject, NULL represents the durable
  -- snapshot checkpoint; pairing an older visible ID with a newer sequence
  -- would make the next recovery cursor internally inconsistent.
  select event.id into v_cursor_event_id from public.wave_event_v1 event
  where event.wave_id = p_wave_id and event.sequence = v_session.event_sequence
    and (not event.sensitive or v_is_master or event.subject_user_id = v_actor)
    and (event.audience = 'ROOM' or (event.audience = 'HOST' and v_is_master)
      or (event.audience = 'SUBJECT' and (v_is_master or event.subject_user_id = v_actor)))
  order by event.sequence desc limit 1;
  return jsonb_build_object(
    'correlationId', p_correlation_id,
    'data', jsonb_build_object(
      'snapshot', jsonb_build_object(
        'schemaVersion', 1, 'waveId', p_wave_id, 'roomId', v_session.room_id,
        'sequence', v_session.event_sequence, 'generatedAt', now(),
        'programAudio', public.rooms_wave_program_audio_projection_v1(p_wave_id),
        'permissions', case when v_is_master then '["wave:read","wave:vote","wave:control"]'::jsonb
          else '["wave:read","wave:vote"]'::jsonb end,
        'state', public.rooms_get_wave_snapshot_v5(p_wave_id)
      ),
      'events', v_events,
      'cursor', jsonb_build_object('waveId', p_wave_id,
        'sequence', v_session.event_sequence, 'eventId', v_cursor_event_id)
    )
  );
end;
$$;

-- Forward declarations keep privilege assignment deterministic even though the
-- coordinator implementations are grouped after the RLS block below.
create or replace function public.rooms_wave_claim_coordinator_v5(uuid, text, text, integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'wave_coordinator_not_initialized'; end; $$;
create or replace function public.rooms_wave_heartbeat_coordinator_v5(uuid, uuid, bigint, integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'wave_coordinator_not_initialized'; end; $$;
create or replace function public.rooms_wave_register_beat_render_v5(uuid, uuid, uuid, bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'wave_coordinator_not_initialized'; end; $$;
create or replace function public.rooms_wave_activate_pending_v5(uuid, uuid, bigint, text, text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'wave_coordinator_not_initialized'; end; $$;

-- Private by default. Clients mutate through transaction RPCs; media workers
-- and the coordinator use service_role. No storage coordinates are exposed.
alter table public.wave_vote_policy_v5 enable row level security;
alter table public.wave_musical_clock_v5 enable row level security;
alter table public.wave_vote_previews_v5 enable row level security;
alter table public.wave_private_auditions_v5 enable row level security;
alter table public.wave_activation_queue_v5 enable row level security;
alter table public.wave_program_switch_queue_v5 enable row level security;
alter table public.wave_program_switch_intents_v5 enable row level security;
alter table public.wave_vote_listen_receipts_v5 enable row level security;
alter table public.wave_coordinator_leases_v5 enable row level security;
alter table public.wave_transactional_outbox_v5 enable row level security;
alter table public.wave_slot_reservations_v5 enable row level security;
alter table public.wave_credit_ledger_v5 enable row level security;
alter table public.wave_host_presence_v5 enable row level security;
alter table public.wave_closing_votes_v5 enable row level security;
alter table public.wave_closing_ballots_v5 enable row level security;
alter table public.wave_closing_listen_receipts_v5 enable row level security;
alter table public.wave_closing_eligible_voters_v5 enable row level security;
alter table public.wave_private_mix_exports_v5 enable row level security;
alter table public.wave_rules_revisions_v5 enable row level security;
alter table public.wave_production_references_v5 enable row level security;
alter table public.wave_vote_defaults_v5 enable row level security;
alter table public.wave_audio_buses_v5 enable row level security;
alter table public.wave_beat_runtime_v5 enable row level security;
alter table public.wave_loop_version_runtime_v5 enable row level security;
alter table public.wave_retention_policies_v5 enable row level security;
alter table public.wave_gc_runs_v5 enable row level security;

drop policy if exists wave_event_member_read_v1 on public.wave_event_v1;
drop policy if exists wave_event_scoped_read_v5 on public.wave_event_v1;
create policy wave_event_scoped_read_v5 on public.wave_event_v1
for select to authenticated
using (
  public.rooms_wave_is_member_v3(wave_id, auth.uid()) and (
    (not sensitive or public.rooms_wave_is_master_v5(wave_id, auth.uid()) or subject_user_id = auth.uid()) and (
    audience = 'ROOM'
    or (audience = 'HOST' and public.rooms_wave_is_master_v5(wave_id, auth.uid()))
    or (audience = 'SUBJECT' and (subject_user_id = auth.uid() or public.rooms_wave_is_master_v5(wave_id, auth.uid())))
    )
  )
);

revoke all on table
  public.wave_vote_policy_v5, public.wave_musical_clock_v5, public.wave_vote_previews_v5,
  public.wave_private_auditions_v5, public.wave_activation_queue_v5,
  public.wave_program_switch_queue_v5,
  public.wave_program_switch_intents_v5,
  public.wave_vote_listen_receipts_v5, public.wave_coordinator_leases_v5,
  public.wave_transactional_outbox_v5, public.wave_slot_reservations_v5,
  public.wave_credit_ledger_v5, public.wave_host_presence_v5,
  public.wave_closing_votes_v5, public.wave_closing_ballots_v5,
  public.wave_closing_listen_receipts_v5, public.wave_closing_eligible_voters_v5,
  public.wave_private_mix_exports_v5, public.wave_rules_revisions_v5,
  public.wave_production_references_v5, public.wave_vote_defaults_v5,
  public.wave_audio_buses_v5, public.wave_beat_runtime_v5,
  public.wave_loop_version_runtime_v5, public.wave_retention_policies_v5,
  public.wave_gc_runs_v5
from public, anon, authenticated;

grant all on table
  public.wave_vote_policy_v5, public.wave_musical_clock_v5, public.wave_vote_previews_v5,
  public.wave_private_auditions_v5, public.wave_activation_queue_v5,
  public.wave_program_switch_queue_v5,
  public.wave_program_switch_intents_v5,
  public.wave_vote_listen_receipts_v5, public.wave_coordinator_leases_v5,
  public.wave_transactional_outbox_v5, public.wave_slot_reservations_v5,
  public.wave_credit_ledger_v5, public.wave_host_presence_v5,
  public.wave_closing_votes_v5, public.wave_closing_ballots_v5,
  public.wave_closing_listen_receipts_v5, public.wave_closing_eligible_voters_v5,
  public.wave_private_mix_exports_v5, public.wave_rules_revisions_v5,
  public.wave_production_references_v5, public.wave_vote_defaults_v5,
  public.wave_audio_buses_v5, public.wave_beat_runtime_v5,
  public.wave_loop_version_runtime_v5, public.wave_retention_policies_v5,
  public.wave_gc_runs_v5
to service_role;

revoke execute on function public.rooms_change_wave_program_source_v3(uuid, public.wave_program_source_v3, uuid, uuid, text, public.wave_render_status_v3, text)
from authenticated;
grant execute on function public.rooms_change_wave_program_source_v3(uuid, public.wave_program_source_v3, uuid, uuid, text, public.wave_render_status_v3, text)
to service_role;
revoke execute on function public.rooms_get_wave_snapshot_v3(uuid) from authenticated;
grant execute on function public.rooms_get_wave_snapshot_v3(uuid) to service_role;
revoke all on function public.rooms_get_wave_snapshot_v5(uuid) from public, anon;
grant execute on function public.rooms_get_wave_snapshot_v5(uuid) to authenticated, service_role;

revoke all on function public.rooms_wave_is_master_v5(uuid, uuid) from public, anon;
grant execute on function public.rooms_wave_is_master_v5(uuid, uuid) to authenticated, service_role;
revoke all on function public.rooms_wave_decide_submission_v5(uuid, public.wave_loop_status_v3, text, text, text) from public, anon;
grant execute on function public.rooms_wave_decide_submission_v5(uuid, public.wave_loop_status_v3, text, text, text) to authenticated, service_role;
revoke all on function public.rooms_wave_start_private_audition_v5(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.rooms_wave_start_private_audition_v5(uuid, uuid, uuid, uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_stop_private_audition_v5(uuid, text) from public, anon;
grant execute on function public.rooms_wave_stop_private_audition_v5(uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_reserve_slot_v5(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.rooms_wave_reserve_slot_v5(uuid, uuid, uuid, integer, text, text) to authenticated, service_role;
revoke all on function public.rooms_wave_release_slot_v5(uuid, text) from public, anon;
grant execute on function public.rooms_wave_release_slot_v5(uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_expire_reservations_v5(uuid) from public, anon, authenticated;
grant execute on function public.rooms_wave_expire_reservations_v5(uuid) to service_role;
revoke all on function public.rooms_wave_heartbeat_slot_v5(uuid, integer, text) from public, anon;
grant execute on function public.rooms_wave_heartbeat_slot_v5(uuid, integer, text) to authenticated, service_role;
revoke execute on function public.rooms_wave_request_asset_upload_v4(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text)
from authenticated;
grant execute on function public.rooms_wave_request_asset_upload_v4(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text)
to service_role;
revoke all on function public.rooms_wave_request_asset_upload_v5(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text, uuid)
from public, anon;
grant execute on function public.rooms_wave_request_asset_upload_v5(uuid, text, text, text, bigint, text, text, text, timestamptz, text, text, uuid)
to authenticated, service_role;
revoke execute on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text)
from authenticated;
grant execute on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text)
to service_role;
revoke all on function public.rooms_wave_confirm_asset_upload_v5(uuid, uuid, uuid, uuid, bigint, text, bigint, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.rooms_wave_confirm_asset_upload_v5(uuid, uuid, uuid, uuid, bigint, text, bigint, text, text, text, text)
to service_role;
revoke all on function public.rooms_wave_set_lifecycle_v5(uuid, public.wave_lifecycle_state_v5, text) from public, anon;
grant execute on function public.rooms_wave_set_lifecycle_v5(uuid, public.wave_lifecycle_state_v5, text) to authenticated, service_role;
revoke all on function public.rooms_wave_set_bus_controls_v5(uuid, numeric, boolean, text, text) from public, anon;
grant execute on function public.rooms_wave_set_bus_controls_v5(uuid, numeric, boolean, text, text) to authenticated, service_role;
revoke all on function public.rooms_wave_request_private_mix_export_v5(uuid, uuid, text) from public, anon;
grant execute on function public.rooms_wave_request_private_mix_export_v5(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_get_production_reference_v5(uuid, text) from public, anon;
grant execute on function public.rooms_wave_get_production_reference_v5(uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_start_closing_vote_v5(uuid, uuid, integer, integer, text) from public, anon;
grant execute on function public.rooms_wave_start_closing_vote_v5(uuid, uuid, integer, integer, text) to authenticated, service_role;
revoke all on function public.rooms_wave_cast_closing_vote_v5(uuid, public.wave_vote_choice_v3, text) from public, anon;
grant execute on function public.rooms_wave_cast_closing_vote_v5(uuid, public.wave_vote_choice_v3, text) to authenticated, service_role;
revoke all on function public.rooms_wave_finalize_closing_vote_v5(uuid, text) from public, anon;
grant execute on function public.rooms_wave_finalize_closing_vote_v5(uuid, text) to authenticated, service_role;
revoke all on function public.rooms_wave_record_closing_listen_receipt_v5(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_freeze_closing_vote_eligibility_v5(uuid, text) from public, anon, authenticated;
grant execute on function public.rooms_wave_record_closing_listen_receipt_v5(uuid, uuid, integer, text, text) to service_role;
grant execute on function public.rooms_wave_freeze_closing_vote_eligibility_v5(uuid, text) to service_role;
revoke all on function public.rooms_launch_wave_production_v5(uuid, text, text) from public, anon;
grant execute on function public.rooms_launch_wave_production_v5(uuid, text, text) to authenticated, service_role;
revoke all on function public.rooms_get_wave_session_for_room_v5(uuid) from public, anon;
grant execute on function public.rooms_get_wave_session_for_room_v5(uuid) to authenticated, service_role;
revoke all on function public.rooms_wave_request_program_audio_switch_v5(uuid, text, bigint, text, uuid, numeric, integer, text)
from public, anon;
grant execute on function public.rooms_wave_request_program_audio_switch_v5(uuid, text, bigint, text, uuid, numeric, integer, text)
to authenticated, service_role;
revoke all on function public.rooms_set_wave_category_open_v5(uuid, uuid, boolean, text, text) from public, anon;
grant execute on function public.rooms_set_wave_category_open_v5(uuid, uuid, boolean, text, text) to authenticated, service_role;
revoke all on function public.rooms_review_wave_submission_v5(uuid, uuid, text, text) from public, anon;
grant execute on function public.rooms_review_wave_submission_v5(uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.rooms_reject_wave_submission_v5(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.rooms_reject_wave_submission_v5(uuid, uuid, text, text, text) to authenticated, service_role;
revoke all on function public.rooms_request_wave_submission_correction_v5(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.rooms_request_wave_submission_correction_v5(uuid, uuid, text, text, text) to authenticated, service_role;
revoke all on function public.rooms_mark_wave_submission_ready_for_vote_v5(uuid, uuid, text, text) from public, anon;
grant execute on function public.rooms_mark_wave_submission_ready_for_vote_v5(uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.rooms_start_wave_closing_vote_v5(uuid, uuid, integer, integer, text, text) from public, anon;
grant execute on function public.rooms_start_wave_closing_vote_v5(uuid, uuid, integer, integer, text, text) to authenticated, service_role;
revoke all on function public.rooms_cast_wave_closing_vote_v5(uuid, public.wave_vote_choice_v3, text, text) from public, anon;
grant execute on function public.rooms_cast_wave_closing_vote_v5(uuid, public.wave_vote_choice_v3, text, text) to authenticated, service_role;
revoke all on function public.rooms_finalize_wave_closing_vote_v5(uuid, text, text) from public, anon;
grant execute on function public.rooms_finalize_wave_closing_vote_v5(uuid, text, text) to authenticated, service_role;

revoke all on function public.rooms_wave_register_vote_preview_v5(uuid, uuid, uuid, uuid, text, integer, text, bigint) from public, anon, authenticated;
revoke all on function public.rooms_wave_record_vote_listen_receipt_v5(uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_freeze_vote_eligibility_v5(uuid, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_claim_coordinator_v5(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.rooms_wave_heartbeat_coordinator_v5(uuid, uuid, bigint, integer) from public, anon, authenticated;
revoke all on function public.rooms_wave_register_beat_render_v5(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.rooms_wave_activate_pending_v5(uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.rooms_wave_update_host_presence_v5(uuid, boolean, boolean, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.rooms_wave_register_vote_preview_v5(uuid, uuid, uuid, uuid, text, integer, text, bigint) to service_role;
grant execute on function public.rooms_wave_record_vote_listen_receipt_v5(uuid, uuid, integer, integer, text, text) to service_role;
grant execute on function public.rooms_wave_freeze_vote_eligibility_v5(uuid, text) to service_role;
grant execute on function public.rooms_wave_claim_coordinator_v5(uuid, text, text, integer) to service_role;
grant execute on function public.rooms_wave_heartbeat_coordinator_v5(uuid, uuid, bigint, integer) to service_role;
grant execute on function public.rooms_wave_register_beat_render_v5(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.rooms_wave_activate_pending_v5(uuid, uuid, bigint, text, text) to service_role;
grant execute on function public.rooms_wave_update_host_presence_v5(uuid, boolean, boolean, uuid, bigint, text) to service_role;

-- The stable switch name is an orchestration endpoint, never a host/browser
-- escape hatch around coordinator fencing and quantized activation.
revoke execute on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer)
from authenticated;
grant execute on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer)
to service_role;

grant usage on type public.wave_lifecycle_state_v5, public.wave_version_status_v5,
  public.wave_beat_activation_status_v5, public.wave_category_need_v5,
  public.wave_activation_state_v5, public.wave_quantization_v5, public.wave_audition_state_v5
to authenticated, service_role;

comment on table public.wave_transactional_outbox_v5 is
  'Coordinator-fenced transactional outbox. Rows describe transport-agnostic commands; PostgreSQL is not the audio engine.';
comment on table public.wave_private_auditions_v5 is
  'Host-only Private Cue bus: current immutable BeatRevision plus one candidate. It never changes public program audio.';
comment on table public.wave_vote_listen_receipts_v5 is
  'Server-issued proof that the immutable candidate/reference preview was heard completely before ballot eligibility.';
comment on table public.wave_production_references_v5 is
  'Immutable studio/light comparison reference pinned to one rules revision and one beat revision.';
drop trigger if exists wave_activation_prepare_v5 on public.wave_activation_queue_v5;
create trigger wave_activation_prepare_v5 before insert on public.wave_activation_queue_v5
for each row execute function public.rooms_wave_prepare_activation_v5();

create or replace function public.rooms_wave_enqueue_activation_render_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_epoch bigint;
begin
  select coalesce(fencing_epoch, 1) into v_epoch from public.wave_musical_clock_v5 where session_id = new.session_id;
  insert into public.wave_transactional_outbox_v5(
    session_id, fencing_epoch, topic, aggregate_type, aggregate_id, payload
  ) values (
    new.session_id, v_epoch, 'wave.render.requested', 'beat_revision', new.target_revision_id,
    jsonb_build_object(
      'activationId', new.id, 'beatRevisionId', new.target_revision_id,
      'targetClockEpoch', new.target_clock_epoch, 'targetBar', new.target_bar,
      'quantization', new.quantization
    )
  );
  return new;
end;
$$;
drop trigger if exists wave_activation_render_outbox_v5 on public.wave_activation_queue_v5;
create trigger wave_activation_render_outbox_v5 after insert on public.wave_activation_queue_v5
for each row execute function public.rooms_wave_enqueue_activation_render_v5();

create or replace function public.rooms_wave_claim_coordinator_v5(
  p_session_id uuid,
  p_region text,
  p_holder_id text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_lease public.wave_coordinator_leases_v5%rowtype; v_token uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  if p_ttl_seconds not between 5 and 120 then raise exception using errcode = '22023', message = 'wave_lease_ttl_invalid'; end if;
  select * into v_lease from public.wave_coordinator_leases_v5 where session_id = p_session_id for update;
  if found and v_lease.expires_at > now() and (v_lease.region <> p_region or v_lease.holder_id <> p_holder_id) then
    raise exception using errcode = '55000', message = 'wave_coordinator_already_leased';
  end if;
  insert into public.wave_coordinator_leases_v5(
    session_id, region, holder_id, lease_token, fencing_epoch, leased_at, heartbeat_at, expires_at
  ) values (
    p_session_id, p_region, p_holder_id, v_token, coalesce(v_lease.fencing_epoch, 0) + 1,
    now(), now(), now() + make_interval(secs => p_ttl_seconds)
  ) on conflict (session_id) do update
  set region = excluded.region, holder_id = excluded.holder_id, lease_token = excluded.lease_token,
      fencing_epoch = public.wave_coordinator_leases_v5.fencing_epoch + 1,
      leased_at = now(), heartbeat_at = now(), expires_at = excluded.expires_at
  returning * into v_lease;
  update public.wave_musical_clock_v5 set fencing_epoch = v_lease.fencing_epoch, updated_at = now()
  where session_id = p_session_id;
  return jsonb_build_object('leaseToken', v_lease.lease_token, 'fencingEpoch', v_lease.fencing_epoch,
    'region', v_lease.region, 'expiresAt', v_lease.expires_at);
end;
$$;

create or replace function public.rooms_wave_heartbeat_coordinator_v5(
  p_session_id uuid, p_lease_token uuid, p_fencing_epoch bigint, p_ttl_seconds integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  update public.wave_coordinator_leases_v5
  set heartbeat_at = now(), expires_at = now() + make_interval(secs => p_ttl_seconds)
  where session_id = p_session_id and lease_token = p_lease_token
    and fencing_epoch = p_fencing_epoch and expires_at > now()
  returning expires_at into v_expires;
  if v_expires is null then raise exception using errcode = '40001', message = 'wave_fencing_token_stale'; end if;
  return v_expires;
end;
$$;

create or replace function public.rooms_wave_register_beat_render_v5(
  p_beat_revision_id uuid,
  p_asset_id uuid,
  p_lease_token uuid,
  p_fencing_epoch bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_session_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  select session_id into v_session_id from public.wave_beat_revisions_v3 where id = p_beat_revision_id;
  if not exists (
    select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = v_session_id and lease.lease_token = p_lease_token
      and lease.fencing_epoch = p_fencing_epoch and lease.expires_at > now()
  ) then raise exception using errcode = '40001', message = 'wave_fencing_token_stale'; end if;
  if not exists (
    select 1 from public.wave_audio_assets_v3 asset
    where asset.id = p_asset_id and asset.session_id = v_session_id
      and asset.status = 'READY' and asset.kind::text in ('RENDER', 'PLAYBACK_DERIVATIVE', 'NORMALIZED_PREVIEW')
  ) then raise exception using errcode = '55000', message = 'wave_render_asset_not_ready'; end if;
  insert into public.wave_beat_runtime_v5(beat_revision_id, session_id, activation_status, render_asset_id)
  values (p_beat_revision_id, v_session_id, 'READY_FOR_ACTIVATION', p_asset_id)
  on conflict (beat_revision_id) do update
  set activation_status = 'READY_FOR_ACTIVATION', render_asset_id = excluded.render_asset_id,
      failure_code = null, updated_at = now();
end;
$$;

create or replace function public.rooms_wave_activate_pending_v5(
  p_activation_id uuid,
  p_lease_token uuid,
  p_fencing_epoch bigint,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activation public.wave_activation_queue_v5%rowtype;
  v_runtime public.wave_beat_runtime_v5%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_clock public.wave_musical_clock_v5%rowtype;
  v_step_bars integer;
  v_step_seconds numeric;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception using errcode = '42501', message = 'service_role_required'; end if;
  select * into v_activation from public.wave_activation_queue_v5 where id = p_activation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_activation_not_found'; end if;
  if not exists (
    select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = v_activation.session_id and lease.lease_token = p_lease_token
      and lease.fencing_epoch = p_fencing_epoch and lease.expires_at > now()
  ) or v_activation.target_clock_epoch <> p_fencing_epoch then
    raise exception using errcode = '40001', message = 'wave_fencing_token_stale';
  end if;
  if v_activation.state = 'ACTIVE' then
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', jsonb_build_object('activationId', p_activation_id, 'state', 'ACTIVE'));
  end if;
  if v_activation.state <> 'PENDING_ACTIVATION' or now() < v_activation.target_at then
    raise exception using errcode = '55000', message = 'wave_activation_boundary_not_reached';
  end if;
  -- Missing a boundary never causes a late mid-cycle switch. Move the pending
  -- activation to the next authoritative measure/cycle and keep the old mix.
  if now() > v_activation.target_at + interval '1 second' then
    select * into v_clock from public.wave_musical_clock_v5 where session_id = v_activation.session_id;
    v_step_bars := case when v_activation.quantization = 'MEASURE' then 1 else v_clock.cycle_bars end;
    v_step_seconds := v_step_bars * split_part(v_clock.time_signature, '/', 1)::integer * 60 / v_clock.bpm;
    while v_activation.target_at <= now() + interval '1 second' loop
      v_activation.target_at := v_activation.target_at + make_interval(secs => v_step_seconds::double precision);
      v_activation.target_bar := v_activation.target_bar + v_step_bars;
      v_activation.target_media_time_seconds := v_activation.target_media_time_seconds + v_step_seconds;
    end loop;
    update public.wave_activation_queue_v5
    set target_at = v_activation.target_at, target_bar = v_activation.target_bar,
        target_media_time_seconds = v_activation.target_media_time_seconds
    where id = p_activation_id;
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', jsonb_build_object('activationId', p_activation_id, 'state', 'PENDING_ACTIVATION',
        'nextTargetAt', v_activation.target_at, 'targetBar', v_activation.target_bar));
  end if;
  select * into v_runtime from public.wave_beat_runtime_v5
  where beat_revision_id = v_activation.target_revision_id for update;
  if not found or v_runtime.activation_status not in ('READY_FOR_ACTIVATION', 'ACTIVE') or v_runtime.render_asset_id is null then
    raise exception using errcode = '55000', message = 'wave_activation_render_not_ready';
  end if;

  update public.wave_activation_queue_v5 set state = 'SUPERSEDED'
  where session_id = v_activation.session_id and state = 'ACTIVE';
  update public.wave_beat_runtime_v5 set activation_status = 'ACTIVE', updated_at = now()
  where beat_revision_id = v_activation.target_revision_id;
  update public.wave_activation_queue_v5
  set state = 'ACTIVE', render_asset_id = v_runtime.render_asset_id, activated_at = now()
  where id = p_activation_id;
  update public.wave_sessions_v3
  set current_beat_revision_id = v_activation.target_revision_id, updated_at = now()
  where id = v_activation.session_id and current_beat_revision_id = v_activation.previous_revision_id;
  if not found then raise exception using errcode = '40001', message = 'wave_activation_reference_changed'; end if;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = v_activation.session_id for update;
  update public.wave_program_audio_state_v3
  set source = 'SERVER_RENDER', source_revision_id = v_activation.target_revision_id,
      source_asset_id = v_runtime.render_asset_id, source_rtc_publication_id = null,
      render_status = 'READY', generation = v_program.generation + 1,
      changed_by = null, changed_at = now()
  where session_id = v_activation.session_id;
  update public.wave_audio_buses_v5
  set music_program_kind = 'COLLECTIVE_BEAT', music_program_generation = music_program_generation + 1,
      updated_at = now() where session_id = v_activation.session_id;
  insert into public.wave_transactional_outbox_v5(
    session_id, fencing_epoch, topic, aggregate_type, aggregate_id, payload
  ) values (
    v_activation.session_id, p_fencing_epoch, 'wave.program.activate', 'activation', p_activation_id,
    jsonb_build_object('source', 'SERVER_RENDER', 'beatRevisionId', v_activation.target_revision_id,
      'assetId', v_runtime.render_asset_id, 'targetBar', v_activation.target_bar)
  );
  perform public.rooms_wave_append_event_v3(
    v_activation.session_id, 'beat.activated', null, 'beat_revision', v_activation.target_revision_id,
    jsonb_build_object('activationId', p_activation_id, 'targetBar', v_activation.target_bar), p_correlation_id
  );
  v_result := jsonb_build_object('correlationId', p_correlation_id,
    'data', jsonb_build_object('activationId', p_activation_id, 'state', 'ACTIVE',
      'beatRevisionId', v_activation.target_revision_id));
  return v_result;
end;
$$;

-- Compatibility name retained for the infrastructure adapter. The command is
-- coordinator/service-only and merely schedules the next measure boundary; it
-- never mutates the public program in the caller transaction.
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
  v_session public.wave_sessions_v3%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_clock public.wave_musical_clock_v5%rowtype;
  v_presence public.wave_host_presence_v5%rowtype;
  v_activation_id uuid;
  v_switch_id uuid;
  v_beats_per_bar integer;
  v_elapsed_beats numeric;
  v_effective_bar bigint;
  v_target_bar bigint;
  v_seconds numeric;
  v_data jsonb;
  v_lease_token uuid;
  v_fencing_epoch bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_source not in ('SERVER_RENDER','HOST_DAW') or p_expected_sequence < 1
     or length(p_idempotency_key) not between 8 and 160
     or p_musical_position_beats < 0 or p_transition_ms not between 0 and 2000 then
    raise exception using errcode = '22023', message = 'wave_program_command_invalid';
  end if;
  begin
    v_lease_token := nullif(current_setting('app.wave_lease_token', true), '')::uuid;
    v_fencing_epoch := nullif(current_setting('app.wave_fencing_epoch', true), '')::bigint;
  exception when invalid_text_representation then
    raise exception using errcode = '40001', message = 'wave_fencing_token_stale';
  end;
  select * into v_session from public.wave_sessions_v3 where id = p_wave_id;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_wave_id for update;
  select * into v_clock from public.wave_musical_clock_v5 where session_id = p_wave_id;
  if not found or v_fencing_epoch is distinct from v_clock.fencing_epoch
     or not exists (select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = p_wave_id and lease.lease_token = v_lease_token
      and lease.fencing_epoch = v_fencing_epoch
      and lease.expires_at > now()) then
    raise exception using errcode = '40001', message = 'wave_fencing_token_stale';
  end if;
  if v_program.generation <> p_expected_sequence then
    raise exception using errcode = '40001', message = 'wave_program_sequence_conflict';
  end if;

  if p_source = 'SERVER_RENDER' then
    if p_beat_revision_id is distinct from v_session.current_beat_revision_id or not exists (
      select 1 from public.wave_beat_runtime_v5 runtime
      where runtime.beat_revision_id = p_beat_revision_id
        and runtime.activation_status in ('READY_FOR_ACTIVATION','ACTIVE')
        and runtime.render_asset_id is not null
    ) then raise exception using errcode = '55000', message = 'wave_render_not_ready'; end if;
    select id into v_activation_id from public.wave_activation_queue_v5
    where session_id = p_wave_id and idempotency_key = p_idempotency_key;
    if v_activation_id is null then
      insert into public.wave_activation_queue_v5(
        session_id, previous_revision_id, target_revision_id, quantization,
        requested_by, idempotency_key
      ) values (
        p_wave_id, v_session.current_beat_revision_id, p_beat_revision_id,
        'MEASURE', null, p_idempotency_key
      ) returning id into v_activation_id;
    end if;
    v_data := public.rooms_wave_program_audio_projection_v1(p_wave_id)
      || jsonb_build_object('pendingSource', 'SERVER_RENDER', 'pendingActivationId', v_activation_id);
  else
    select * into v_presence from public.wave_host_presence_v5 where session_id = p_wave_id;
    if not found or not v_presence.connected or not v_presence.daw_audio_available
       or not v_presence.daw_level_detected or v_presence.daw_rtc_publication_id is null then
      raise exception using errcode = '55000', message = 'wave_host_daw_track_and_level_required';
    end if;
    select id into v_switch_id from public.wave_program_switch_queue_v5
    where session_id = p_wave_id and idempotency_key = p_idempotency_key;
    if v_switch_id is null then
      v_beats_per_bar := split_part(v_clock.time_signature, '/', 1)::integer;
      v_elapsed_beats := greatest(0, extract(epoch from (now() - v_clock.anchor_at))) * v_clock.bpm / 60;
      v_effective_bar := v_clock.current_bar
        + floor((v_clock.current_beat - 1 + v_elapsed_beats) / v_beats_per_bar)::bigint;
      v_target_bar := v_effective_bar + 1;
      v_seconds := greatest(0,
        ((v_target_bar - v_clock.current_bar) * v_beats_per_bar
          - (v_clock.current_beat - 1) - v_elapsed_beats) * 60 / v_clock.bpm);
      insert into public.wave_program_switch_queue_v5(
        session_id, source, rtc_publication_id, expected_program_generation,
        target_clock_epoch, target_bar, target_at, musical_position_beats,
        transition_ms, idempotency_key
      ) values (
        p_wave_id, 'HOST_DAW', v_presence.daw_rtc_publication_id, p_expected_sequence,
        v_clock.fencing_epoch, v_target_bar,
        now() + make_interval(secs => v_seconds::double precision),
        p_musical_position_beats, p_transition_ms, p_idempotency_key
      ) returning id into v_switch_id;
      insert into public.wave_transactional_outbox_v5(
        session_id, fencing_epoch, topic, aggregate_type, aggregate_id, payload
      ) values (p_wave_id, v_clock.fencing_epoch, 'wave.program.host_daw.requested',
        'program_switch', v_switch_id,
        jsonb_build_object('targetBar', v_target_bar, 'rtcPublicationId', v_presence.daw_rtc_publication_id));
    end if;
    v_data := public.rooms_wave_program_audio_projection_v1(p_wave_id)
      || jsonb_build_object('pendingSource', 'HOST_DAW', 'pendingProgramSwitchId', v_switch_id);
  end if;
  return jsonb_build_object('correlationId', p_idempotency_key, 'data', v_data);
end;
$$;

create or replace function public.rooms_wave_activate_program_switch_v5(
  p_switch_id uuid,
  p_lease_token uuid,
  p_fencing_epoch bigint,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_switch public.wave_program_switch_queue_v5%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_presence public.wave_host_presence_v5%rowtype;
  v_clock public.wave_musical_clock_v5%rowtype;
  v_step_seconds numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  select * into v_switch from public.wave_program_switch_queue_v5 where id = p_switch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'wave_program_switch_not_found'; end if;
  if not exists (select 1 from public.wave_coordinator_leases_v5 lease
    where lease.session_id = v_switch.session_id and lease.lease_token = p_lease_token
      and lease.fencing_epoch = p_fencing_epoch and lease.expires_at > now())
     or v_switch.target_clock_epoch <> p_fencing_epoch then
    raise exception using errcode = '40001', message = 'wave_fencing_token_stale';
  end if;
  if v_switch.state = 'ACTIVE' then
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', public.rooms_wave_program_audio_projection_v1(v_switch.session_id));
  end if;
  if v_switch.state <> 'PENDING' or now() < v_switch.target_at then
    raise exception using errcode = '55000', message = 'wave_program_boundary_not_reached';
  end if;
  if now() > v_switch.target_at + interval '1 second' then
    select * into v_clock from public.wave_musical_clock_v5 where session_id = v_switch.session_id;
    v_step_seconds := split_part(v_clock.time_signature, '/', 1)::integer * 60 / v_clock.bpm;
    while v_switch.target_at <= now() + interval '1 second' loop
      v_switch.target_at := v_switch.target_at + make_interval(secs => v_step_seconds::double precision);
      v_switch.target_bar := v_switch.target_bar + 1;
    end loop;
    update public.wave_program_switch_queue_v5
    set target_at = v_switch.target_at, target_bar = v_switch.target_bar where id = p_switch_id;
    return jsonb_build_object('correlationId', p_correlation_id,
      'data', jsonb_build_object('state', 'PENDING', 'nextTargetAt', v_switch.target_at,
        'targetBar', v_switch.target_bar));
  end if;
  select * into v_presence from public.wave_host_presence_v5 where session_id = v_switch.session_id;
  if not found or not v_presence.connected or not v_presence.daw_audio_available
     or not v_presence.daw_level_detected
     or v_presence.daw_rtc_publication_id is distinct from v_switch.rtc_publication_id then
    update public.wave_program_switch_queue_v5 set state = 'FAILED', failure_code = 'HOST_DAW_UNAVAILABLE'
    where id = p_switch_id;
    raise exception using errcode = '55000', message = 'wave_host_daw_track_and_level_required';
  end if;
  select * into v_program from public.wave_program_audio_state_v3
  where session_id = v_switch.session_id for update;
  if v_program.generation <> v_switch.expected_program_generation then
    raise exception using errcode = '40001', message = 'wave_program_sequence_conflict';
  end if;
  update public.wave_program_audio_state_v3
  set source = 'HOST_DAW', source_revision_id = null, source_asset_id = null,
      source_rtc_publication_id = v_switch.rtc_publication_id, render_status = 'IDLE',
      musical_position_beats = v_switch.musical_position_beats,
      transition_ms = v_switch.transition_ms, generation = generation + 1,
      changed_by = null, changed_at = now()
  where session_id = v_switch.session_id;
  update public.wave_audio_buses_v5
  set music_program_kind = 'HOST_DAW', music_program_generation = music_program_generation + 1,
      updated_at = now() where session_id = v_switch.session_id;
  update public.wave_program_switch_queue_v5
  set state = 'ACTIVE', activated_at = now() where id = p_switch_id;
  perform public.rooms_wave_append_event_v3(v_switch.session_id, 'program_audio.changed', null,
    'program_switch', p_switch_id,
    jsonb_build_object('source', 'HOST_DAW', 'targetBar', v_switch.target_bar), p_correlation_id);
  return jsonb_build_object('correlationId', p_correlation_id,
    'data', public.rooms_wave_program_audio_projection_v1(v_switch.session_id));
end;
$$;

create or replace function public.rooms_wave_switch_program_audio_v1(
  p_wave_id uuid,
  p_source text,
  p_expected_sequence bigint,
  p_idempotency_key text,
  p_beat_revision_id uuid,
  p_musical_position_beats numeric,
  p_transition_ms integer,
  p_lease_token uuid,
  p_fencing_epoch bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  perform set_config('app.wave_lease_token', p_lease_token::text, true);
  perform set_config('app.wave_fencing_epoch', p_fencing_epoch::text, true);
  return public.rooms_wave_switch_program_audio_v1(
    p_wave_id, p_source, p_expected_sequence, p_idempotency_key,
    p_beat_revision_id, p_musical_position_beats, p_transition_ms
  );
end;
$$;

revoke all on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer)
from public, anon, authenticated, service_role;
revoke all on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer, uuid, bigint)
from public, anon, authenticated;
grant execute on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer, uuid, bigint)
to service_role;
revoke all on function public.rooms_wave_activate_program_switch_v5(uuid, uuid, bigint, text)
from public, anon, authenticated;
grant execute on function public.rooms_wave_activate_program_switch_v5(uuid, uuid, bigint, text)
to service_role;
revoke all on function public.rooms_wave_attest_host_daw_v5(uuid, text, boolean, uuid, bigint, text)
from public, anon, authenticated;
grant execute on function public.rooms_wave_attest_host_daw_v5(uuid, text, boolean, uuid, bigint, text)
to service_role;
