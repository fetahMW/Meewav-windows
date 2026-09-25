# La Wave — private asset pipeline v4

This pipeline implements the production boundary consumed by
`src/features/rooms/wave-infra/supabaseWaveInfra.ts`. It is additive to the
normalized Wave v3 aggregate; it does not create a parallel loop model.

## Data flow

1. `rooms-wave-asset-upload-ticket` authenticates the caller and calls
   `rooms_wave_request_asset_upload_v4`.
2. The RPC serializes the contributor/session scope, validates the Wave state,
   category, open slot, MIME rules, per-user quota, Room capacity, rate limit,
   consent and idempotency key.
3. It reserves a `wave_loop_submissions_v3`, a private
   `wave_audio_assets_v3`, and an opaque `wave_asset_uploads_v4` intent.
   The upload and immutable version retain the exact Beat revision, integer
   rules version, and—when the v5 registry is installed—the immutable rules
   revision UUID. Contributor uploads require an active allowance.
4. The Edge Function creates a single-object signed upload URL in the private
   `room-wave-private` bucket. The browser uploads directly to Storage; the
   application server never proxies the audio bytes.
5. `rooms-wave-asset-upload-confirm` resolves and inspects that exact private
   object through the service Storage API. It does not trust the client ETag or
   byte count.
6. `rooms_wave_confirm_asset_upload_v4` atomically changes the submission and
   asset to `PROCESSING` and inserts a durable
   `wave_asset_processing_outbox_v4` job.
7. An isolated worker leases work with
   `rooms_wave_claim_asset_processing_v4`. Only service-role workers can call
   `rooms_wave_complete_asset_processing_v4`.
8. The worker persists the explicit private lineage
   `ORIGINAL -> PLAYBACK_DERIVATIVE (48 kHz stereo) -> PREVIEW_DERIVATIVE + WAVEFORM`
   in `wave_asset_derivatives_v4`. It never asks browsers to derive or mix
   production audio.
9. Only a successful worker completion with matching SHA-256, byte size and a
   positive safety result creates the immutable `wave_loop_versions_v3` and
   `wave_loop_analysis_v3` records. Automated compatibility remains advisory;
   non-compatible analysis goes to `NEEDS_REVIEW`, never automatic rejection.

The database upload ticket expires after the configured v4 TTL (ten minutes by
default). Supabase signed upload tokens currently have a provider-defined
two-hour validity. A late object can therefore physically arrive in Storage,
but it cannot be confirmed or promoted after the authoritative database ticket
expires and must be removed by the storage cleanup job.

## Required Edge secrets

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Configure the following deployment secrets:

- `MEEWAV_ALLOWED_WEB_ORIGINS`: comma-separated exact web origins.
- `WAVE_DEPLOYMENT_ID`: release/deployment identifier reported by health.
- `WAVE_AUDIO_PROCESSING_WORKER_URL`: identity/base URL of the isolated worker,
  or `WAVE_AUDIO_PROCESSING_DISPATCH_URL` when a push dispatcher wakes it.
- `WAVE_AUDIO_PROCESSING_DISPATCH_TOKEN`: optional bearer for the best-effort
  dispatcher wake-up. The durable outbox remains authoritative.
- `WAVE_REALTIME_HEALTH_URL`: authenticated Realtime recovery health endpoint.
- `WAVE_AUDIO_PROCESSING_HEALTH_URL`: audio worker health endpoint.
- `WAVE_AUDIO_ENGINE_HEALTH_URL`: authoritative render/router health endpoint.
- `WAVE_AUDIO_ENGINE_RENDER_URL` (or `WAVE_AUDIO_ENGINE_URL`): server render
  service used for a candidate + reference Beat private audition.
- `WAVE_MEDIA_SFU_HEALTH_URL`: SFU/media distribution health endpoint.
- `WAVE_HEALTH_PROBE_TOKEN`: optional shared bearer used only for the four
  server-to-server health probes.

Health URLs must use HTTPS outside localhost. Missing or failing probes are
reported as `not_configured`/`unavailable`; the endpoint never advertises
`productionReady: true` merely because the UI or database is running.

## External components deliberately not faked

This repository now contains the authority, queues, leases, private Storage
contracts and Edge gateways. It does **not** embed these deployable services:

- the isolated FFmpeg/decoder/malware worker that creates canonical playback,
  previews, waveform and technical analysis;
- the server audio renderer that produces WITH_BEAT auditions, vote previews
  and ProductionReference derivatives;
- the scheduler/worker that polls processing, audition and GC outboxes;
- the authenticated signed-read gateway for v5 ProductionReference assets;
- Realtime recovery infrastructure, media SFU/TURN and authoritative program
  audio distribution;
- a TUS/S3 multipart upload gateway and chunk-aware resumable browser client;
- cloud Storage lifecycle/orphan sweeps and production CORS configuration.

Until those services are deployed and their HTTPS health endpoints configured,
health remains false/not configured. Upload ticket/confirmation or audition
entry points fail or remain `NOT_CONFIGURED`/`PREPARING`; they never substitute
browser-generated audio or claim analysis/render success.

## Worker contract

The worker uses the service role on a private network/service boundary:

1. Lease up to 20 jobs with `rooms_wave_claim_asset_processing_v4(workerId,
   limit)`. A five-minute stale lease can be reclaimed.
2. Download the object with a short-lived service-side signed URL or the
   Storage API. Never expose this URL to viewers.
3. In a sandbox with CPU, time, memory and decoded-size limits, verify MIME by
   content, byte size, SHA-256, decodability and malware/safety policy; then
   compute duration, BPM/key/bars estimates, waveform and technical metadata.
4. Store a canonical 48 kHz stereo playback asset, then preview and waveform
   derivatives as separate private `wave_audio_assets_v3` rows. Persist each
   relation and role in `wave_asset_derivatives_v4`; the preview/waveform source
   is the canonical playback asset, not the unverified browser upload. Register
   every artifact in `wave_asset_retention_v4`; promotion refuses derivatives
   without a live retention row.
5. Complete with the exact lease token and the three derivative asset IDs.
   Failures retry with bounded exponential
   backoff and become `PROCESSING_FAILED` after five failed attempts.

The success payload must include at least:

```json
{
  "sha256": "64 lowercase hex characters",
  "byteSize": 123456,
  "safe": true,
  "compatibility": "COMPATIBLE",
  "durationMs": 8000,
  "sampleRate": 48000,
  "bitDepth": 24,
  "channels": 2
}
```

`READY` is a worker-only promotion. Edge confirmation returns only
`PROCESSING` (or fails); it never claims analysis success.

The current Supabase signed-upload primitive is a direct single-object PUT, not
a resumable TUS/multipart session. The ticket therefore returns
`resumable: false`. Production must not flip that flag until both a resumable
gateway and chunk-aware client uploader are deployed; claiming resumability on
top of a one-shot PUT would be a false capability.

## ProductionReference and comparable previews

The authoritative ProductionReference is the v5 pair
`wave_production_references_v5.studio_asset_id/light_asset_id`, never a URL in a
browser payload:

- **Studio reference**: temporally exact WAV/FLAC, registered with artifact
  role `PRODUCTION_REFERENCE_STUDIO`. A gateway may sign it only after checking
  host control or an active contributor allowance.
- **Light reference**: the same musical interval encoded as MP3/AAC/Opus
  (`audio/mpeg`, `audio/aac`, `audio/mp4`, `audio/ogg` or `audio/webm`) and
  registered as `PRODUCTION_REFERENCE_LIGHT`. It is an audition derivative,
  never the studio source of truth.

Both remain private. `wave_asset_derivatives_v4` rejects a studio/light role
with the wrong format family and records `access_scope` and `temporal_exact`.
Every submission and loop version keeps `basedOnBeatRevisionId` and its rules
revision, so a rules/Beat change never silently reinterprets an old upload.

A vote preview uses artifact role `VOTE_PREVIEW`. Its registry row requires a
48 kHz/stereo derivative, exact comparison duration, a context hash binding the
candidate and reference, integrated loudness evidence (`ITU-R BS.1770` or
`EBU R128`) and true peak. The worker loudness-matches comparable previews
without modifying the original. Every voter hears one server-produced asset;
there is no per-browser reconstruction.

## Retention, legal hold, and garbage collection

Every v4 artifact has a `wave_asset_retention_v4` policy snapshot and one of
`ACTIVE`, `ELIGIBLE`, `QUEUED`, `DELETING`, `DELETED`, or `LEGAL_HOLD`.
A service worker schedules with `rooms_wave_schedule_asset_gc_v4`, leases with
`rooms_wave_claim_asset_gc_v4`, deletes the exact private Storage object, and
only then confirms through `rooms_wave_complete_asset_gc_v4`. Database audit
and credit rows remain; the v3 asset is marked `DELETED`.

Originals are rights-governed. Scheduling one requires the explicit disposition
`EXPIRED`, `REVOKED`, `DELETE_AFTER_SESSION`, or `ADMIN_ERASURE`; legal holds
are never leasable. Deletion retries are bounded and dead-lettered. The v5
per-Wave retention policy supplies expiry windows, while v4 freezes the policy
used for each concrete object.

## Deployment

Apply migrations through `20260822224500_wave_asset_pipeline_v4.sql`, then
deploy these functions together:

- `rooms-wave-infra-health`
- `rooms-wave-asset-upload-ticket`
- `rooms-wave-asset-upload-confirm`
- `rooms-wave-asset-processing-status`
- `rooms-wave-private-audition`

The asset tables and outbox have RLS enabled and no authenticated table
privileges. Private paths are absent from Wave snapshots. Signed upload URLs
are scoped to one opaque object key and are not reusable for another path.

## Host private audition

`rooms-wave-private-audition` binds an immutable `candidateVersionId` to the
current `referenceBeatRevisionId` and is control-role only. A SOLO request may
sign an already READY `PREVIEW_DERIVATIVE`. A WITH_BEAT request creates a
durable `wave_private_audition_outbox_v4` render job only when a server audio
engine is configured. Until that worker produces the one authoritative preview
asset, the response is `PREPARING`; without a render service it is
`NOT_CONFIGURED`. There is deliberately no browser multi-stem or Edge mix
fallback.

The renderer leases jobs with `rooms_wave_claim_private_auditions_v4` and
completes with `rooms_wave_complete_private_audition_v4`. READY is rejected
unless the private 48 kHz preview derivative metadata binds the exact request,
candidate version, and reference Beat revision. A revision change during
rendering invalidates the request instead of serving a stale mix.
