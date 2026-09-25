import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260815154500_rooms_livekit_revocation_scheduler_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const readme = readFileSync(
  new URL(
    "../../supabase/functions/livekit-revocation-worker/README.md",
    import.meta.url,
  ),
  "utf8",
);

test("revocation scheduler migration stays additive and server-only", () => {
  assert.match(
    migration,
    /create table if not exists public\.room_livekit_revocation_scheduler_health_v1/u,
  );
  assert.doesNotMatch(migration, /\bdrop\s+(?:table|column|function)\b/iu);
  assert.doesNotMatch(migration, /\btruncate\b/iu);
  assert.doesNotMatch(migration, /\brename\s+(?:table|column)\b/iu);
  assert.match(
    migration,
    /alter table public\.room_livekit_revocation_scheduler_health_v1 enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.room_livekit_revocation_scheduler_health_v1[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.rooms_tick_livekit_revocation_worker_v1\(integer\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.rooms_tick_livekit_revocation_worker_v1\(integer\)[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,180}\bto (?:anon|authenticated)\b/iu);
});

test("pg_cron installs one idempotent 15-second pg_net worker tick", () => {
  assert.match(migration, /function public\.rooms_tick_livekit_revocation_worker_v1/u);
  assert.match(migration, /function public\.rooms_install_livekit_revocation_scheduler_v1/u);
  assert.match(
    migration,
    /to_regprocedure\('cron\.schedule\(text,text,text\)'\)/u,
  );
  assert.match(
    migration,
    /to_regprocedure\('net\.http_post\(text,jsonb,jsonb,jsonb,integer\)'\)/u,
  );
  assert.match(migration, /select cron\.schedule\(\$1, \$2, \$3\)/u);
  assert.match(migration, /'rooms-livekit-revocation-worker-v1',[\s\S]*'15 seconds'/u);
  assert.match(
    migration,
    /select public\.rooms_tick_livekit_revocation_worker_v1\(20\);/u,
  );
  assert.match(migration, /select net\.http_post\(/u);
  assert.match(migration, /timeout_milliseconds := 8000/u);
  assert.match(
    migration,
    /do \$install\$[\s\S]*rooms_install_livekit_revocation_scheduler_v1\(\)/u,
  );
});

test("worker endpoint and authentication are read only from named Vault values", () => {
  assert.match(migration, /to_regclass\('vault\.decrypted_secrets'\)/u);
  assert.match(migration, /from vault\.decrypted_secrets secret/u);
  assert.match(migration, /meewav_livekit_revocation_worker_url/u);
  assert.match(migration, /meewav_livekit_revocation_worker_secret/u);
  assert.match(migration, /x-meewav-worker-secret/u);
  assert.match(migration, /char_length\(v_worker_secret\) < 32/u);
  assert.doesNotMatch(migration, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(migration, /authorization['"]?\s*,/iu);
  assert.doesNotMatch(migration, /VITE_/u);
});

test("missing dependencies are explicit and health remains machine-readable", () => {
  for (const reasonCode of [
    "missing_pg_cron",
    "missing_pg_net",
    "missing_vault",
    "missing_worker_url_secret",
    "missing_worker_shared_secret",
    "pg_cron_schedule_failed",
    "pg_net_request_failed",
  ]) {
    assert.match(migration, new RegExp(reasonCode, "u"));
  }
  assert.match(migration, /scheduler_status in \('pending', 'healthy', 'degraded'\)/u);
  assert.match(migration, /external_scheduler_required/u);
  assert.match(
    migration,
    /function public\.rooms_livekit_revocation_delivery_health_v1\(\)/u,
  );
  assert.match(migration, /perform public\.rooms_livekit_require_service_role_v1\(\)/u);
  assert.match(
    migration,
    /grant execute on function public\.rooms_livekit_revocation_delivery_health_v1\(\)[\s\S]*to service_role/u,
  );
  assert.match(migration, /'scheduler'[\s\S]*'queue'/u);
});

test("operations README documents automatic installation and private recovery", () => {
  assert.match(readme, /20260815154500_rooms_livekit_revocation_scheduler_v1\.sql/u);
  assert.match(readme, /meewav_livekit_revocation_worker_url/u);
  assert.match(readme, /meewav_livekit_revocation_worker_secret/u);
  assert.match(readme, /rooms_install_livekit_revocation_scheduler_v1/u);
  assert.match(readme, /rooms_livekit_revocation_delivery_health_v1/u);
  assert.match(readme, /15 seconds/u);
  assert.match(readme, /degraded/iu);
});
