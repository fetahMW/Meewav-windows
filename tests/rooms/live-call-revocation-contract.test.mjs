import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/rooms-live-call-revocation-worker/index.ts", import.meta.url),
  "utf8",
);

test("live-call revocation worker is shared-secret and service-role only", () => {
  assert.match(source, /LIVE_CALL_REVOCATION_WORKER_SECRET/u);
  assert.match(source, /timingSafeEqual\(workerSecret, suppliedSecret\)/u);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(source, /auth\.getUser/u);
});

test("live-call worker expires first, leases work and rechecks authority", () => {
  assert.match(source, /rooms_expire_live_call_invitations_v1/u);
  assert.match(source, /rooms_claim_live_call_revocations_v1/u);
  assert.match(source, /rooms_live_call_revocation_should_execute_v1/u);
  assert.match(source, /rooms_complete_live_call_revocation_v1/u);
});

test("live-call worker destroys only the derived private room", () => {
  assert.match(source, /event\.action === "end_private_call"/u);
  assert.match(source, /event\.action === "cleanup_private_call"/u);
  assert.match(source, /roomService\.deleteRoom\(event\.private_room_name\)/u);
  assert.doesNotMatch(source, /removeParticipant|updateParticipant/u);
  assert.match(source, /isNotFoundError/u);
});

test("live-call worker requires TLS for LiveKit outside explicit loopback", () => {
  assert.match(source, /parsed\.protocol === "ws:" \|\| parsed\.protocol === "http:"/u);
  assert.match(source, /!isLoopbackHostname\(parsed\.hostname\)/u);
  assert.match(source, /requires TLS outside an explicit loopback/u);
  assert.match(source, /normalized === "localhost"/u);
  assert.match(source, /normalized === "127\.0\.0\.1"/u);
  assert.match(source, /normalized === "\[::1\]"/u);
});

test("live-call worker retries durable failures", () => {
  assert.match(source, /p_succeeded:\s*false/u);
  assert.match(source, /p_result:\s*message\.slice\(0, 1000\)/u);
  assert.match(source, /retried \+= 1/u);
});
