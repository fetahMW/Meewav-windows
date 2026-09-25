import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260815181000_rooms_live_call_revocation_scheduler_v1.sql", import.meta.url),
  "utf8",
);

test("live-call scheduler reads only named Vault values", () => {
  assert.match(sql, /meewav_live_call_revocation_worker_url/u);
  assert.match(sql, /meewav_live_call_revocation_worker_secret/u);
  assert.doesNotMatch(sql, /https:\/\/[a-z0-9-]+\.supabase\.co/u);
  assert.doesNotMatch(sql, /x-meewav-worker-secret'\s*,\s*'[^']{32}/u);
});

test("live-call scheduler installs a bounded 15-second tick or records degraded health", () => {
  assert.match(sql, /'15 seconds'/u);
  assert.match(sql, /rooms-live-call-revocation-worker-v1/u);
  assert.match(sql, /external_scheduler_required/u);
  assert.match(sql, /rooms_install_live_call_revocation_scheduler_v1/u);
  assert.match(sql, /raise warning 'rooms_live_call_revocation_scheduler_degraded/u);
  assert.match(sql, /scheduled_unconfirmed/u);
  assert.match(sql, /enqueue does not prove a worker 2xx response/u);
  assert.doesNotMatch(sql, /set scheduler_status = 'healthy'/u);
});

test("live-call scheduler sends its shared secret only over HTTPS or explicit loopback", () => {
  assert.match(sql, /\^https:\/\//u);
  assert.match(sql, /localhost\|127\[\.\]0\[\.\]0\[\.\]1/u);
  assert.match(sql, /\\\[::1\\\]/u);
  assert.match(sql, /HTTP is accepted only for an explicit loopback/u);
  assert.doesNotMatch(sql, /\^https\?:\/\//u);
});

test("live-call scheduler remains service-only", () => {
  assert.match(sql, /auth\.role\(\), ''\) <> 'service_role'/u);
  assert.match(sql, /from public, anon, authenticated/u);
  assert.doesNotMatch(sql, /grant execute[\s\S]{0,200}to authenticated/iu);
  assert.match(sql, /rooms_live_call_revocation_delivery_health_v1/u);
});
