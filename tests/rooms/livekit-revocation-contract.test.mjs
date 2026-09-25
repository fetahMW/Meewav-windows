import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260815150000_rooms_livekit_revocation_outbox_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const worker = readFileSync(
  new URL(
    "../../supabase/functions/livekit-revocation-worker/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const token = readFileSync(
  new URL("../../supabase/functions/livekit-token/index.ts", import.meta.url),
  "utf8",
);
const config = readFileSync(
  new URL("../../supabase/config.toml", import.meta.url),
  "utf8",
);

test("revocation schema is additive, private, durable and idempotent", () => {
  assert.match(migration, /create table if not exists public\.room_livekit_publication_grants_v1/u);
  assert.match(migration, /create table if not exists public\.room_livekit_revocation_outbox_v1/u);
  assert.doesNotMatch(migration, /\bdrop\s+(?:table|column|function)\b/iu);
  assert.doesNotMatch(migration, /\btruncate\b/iu);
  assert.doesNotMatch(migration, /\brename\s+(?:table|column)\b/iu);
  assert.match(migration, /nulls not distinct[\s\S]*state in \('pending', 'processing', 'retry'\)/u);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_lock_key, 0\)\)/u);
  assert.match(migration, /enable row level security/u);
  assert.match(migration, /revoke all on table public\.room_livekit_revocation_outbox_v1 from anon, authenticated/u);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/u);
});

test("every publication-loss transition enqueues a server revocation", () => {
  for (const table of [
    "room_invitations_v2",
    "room_participants_v2",
    "room_bans_v2",
    "room_kicks_v2",
    "rooms_v2",
  ]) {
    assert.match(
      migration,
      new RegExp(`create trigger rooms_livekit_[\\s\\S]*? on public\\.${table}`, "u"),
      `${table} must be guarded by an additive trigger`,
    );
  }
  assert.match(migration, /invitation\.status = 'onstage'/u);
  assert.match(migration, /participant\.role = 'guest'/u);
  assert.match(migration, /participant\.left_at is null/u);
  assert.doesNotMatch(
    migration,
    /rooms_reconcile_livekit_guest_publication_v1[\s\S]*?not exists \([\s\S]*?from public\.room_kicks_v2 kick[\s\S]*?\) into v_authorized/u,
    "a historic one-shot kick must not block a later canonical re-entry",
  );
  assert.match(migration, /'remove_participant'/u);
  assert.match(migration, /'end_room'/u);
  assert.match(migration, /new\.status = 'ended'/u);
  assert.match(migration, /if not v_had_grant[\s\S]*'participant_left'[\s\S]*then\s+return/u);
  assert.match(migration, /old\.left_at is null[\s\S]*new\.left_at is not null[\s\S]*'participant_left'/u);
});

test("claim and resolve RPCs use leases, skip locked rows, retries and private health", () => {
  assert.match(migration, /function public\.rooms_claim_livekit_revocations_v1/u);
  assert.match(migration, /for update skip locked/u);
  assert.match(migration, /locked_at < now\(\) - interval '2 minutes'/u);
  assert.match(migration, /lease_token = gen_random_uuid\(\)/u);
  assert.match(migration, /function public\.rooms_resolve_livekit_revocation_v1/u);
  assert.match(migration, /outbox\.lease_token = p_lease_token/u);
  assert.match(migration, /state in \('pending', 'processing', 'retry', 'succeeded', 'dead'\)/u);
  assert.match(migration, /function public\.rooms_livekit_revocation_health_v1\(\)/u);
  assert.match(migration, /then 'blocked'[\s\S]*then 'degraded'[\s\S]*else 'healthy'/u);
  assert.match(migration, /grant execute on function public\.rooms_livekit_revocation_health_v1\(\)[\s\S]*to service_role/u);
});

test("publication generations prevent stale outbox events from removing a new session", () => {
  assert.match(migration, /generation uuid not null default gen_random_uuid\(\)/u);
  assert.match(migration, /when public\.room_livekit_publication_grants_v1\.is_authorized[\s\S]*else gen_random_uuid\(\)/u);
  assert.match(migration, /superseded_by_reauthorization/u);
  assert.match(token, /publicationGeneration/u);
  assert.match(token, /publicationRevision/u);
  assert.match(worker, /remoteGeneration !== event\.publication_generation/u);
  assert.match(worker, /superseded_remote_generation/u);
  assert.equal(
    [...worker.matchAll(/loadCurrentGuard\(event\)/gu)].length >= 2,
    true,
    "worker must re-read current authorization immediately before removal",
  );
  assert.match(worker, /superseded_during_delivery/u);
  assert.match(worker, /sourceStateAuthorizesPublication/u);
  assert.match(worker, /participant\?\.role === "guest"/u);
  assert.match(worker, /invitation\?\.status === "onstage"/u);
  assert.match(worker, /roomNameWasReused/u);
  assert.match(worker, /data\.id !== event\.room_id && data\.status === "live"/u);
  assert.match(worker, /superseded_room_name_reused/u);
});

test("worker keeps all credentials server-side and uses LiveKit Admin APIs", () => {
  assert.match(worker, /RoomServiceClient/u);
  assert.match(worker, /roomService\.removeParticipant/u);
  assert.match(worker, /roomService\.updateParticipant/u);
  assert.match(worker, /canSubscribe: true[\s\S]*canPublish: false/u);
  assert.match(worker, /finalGuard\.participantActive[\s\S]*&& !finalGuard\.banned/u);
  assert.doesNotMatch(worker, /&& !finalGuard\.kicked/u);
  assert.match(worker, /\.from\("room_kicks_v2"\)/u);
  assert.match(worker, /roomService\.deleteRoom/u);
  assert.match(worker, /revokeTokenTs/u);
  assert.match(worker, /LIVEKIT_REVOCATION_WORKER_SECRET/u);
  assert.match(worker, /constantTimeEqual/u);
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(worker, /LIVEKIT_API_SECRET/u);
  assert.doesNotMatch(worker, /VITE_/u);
  assert.match(config, /\[functions\.livekit-revocation-worker\][\s\S]*verify_jwt = false/u);
  assert.match(worker, /MAX_ATTEMPTS = 8/u);
  assert.match(worker, /initial_revocation_delivered_safety_sweep_scheduled/u);
});

test("legacy iOS token envelope remains unchanged while server grants are authoritative", () => {
  assert.match(token, /if \(!isWebContract\) return jsonResponse\(200, \{ token \}/u);
  assert.doesNotMatch(token, /identity:\s*body\.identity/u);
  assert.doesNotMatch(token, /canPublish:\s*body\.canPublish/u);
  assert.match(token, /publicationGrant\?\.is_authorized/u);
  assert.match(token, /derivedCanPublish[\s\S]*publicationGeneration !== null/u);
});
