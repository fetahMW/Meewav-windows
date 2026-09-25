import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/rooms-live-call-token/index.ts", import.meta.url),
  "utf8",
);

test("live-call token uses a service-only database authorization decision", () => {
  assert.match(source, /authClient\.auth\.getUser\(\)/u);
  assert.match(source, /rooms_authorize_live_call_media_v1/u);
  assert.match(source, /p_user_id:\s*authData\.user\.id/u);
  assert.doesNotMatch(source, /\.from\("room_live_call_invitations_v1"\)/u);
});

test("live-call token is short-lived and microphone-only", () => {
  assert.match(source, /TOKEN_TTL_SECONDS = 30/u);
  assert.match(source, /canPublishSources:\s*\["microphone"\]/u);
  assert.match(source, /canPublishData:\s*false/u);
  assert.doesNotMatch(source, /"camera"|"screen_share"|"screen_share_audio"/u);
});

test("live-call token exposes only TLS LiveKit transport outside loopback", () => {
  assert.match(source, /parsed\.protocol === "ws:" && !isLoopbackHostname/u);
  assert.match(source, /requires WSS outside an explicit loopback/u);
  assert.match(source, /normalized === "localhost"/u);
  assert.match(source, /normalized === "127\.0\.0\.1"/u);
  assert.match(source, /normalized === "\[::1\]"/u);
});

test("live-call response exposes only the private-call connection contract", () => {
  for (const field of [
    "serverUrl",
    "invitationId",
    "callId",
    "roomId",
    "publicRoomId",
    "roomName",
    "callMode",
    "participantIdentity",
    "peerIdentity",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`, "u"));
  }
  assert.match(source, /PRIVATE_ROOM_PATTERN/u);
  assert.match(source, /role:\s*data\.role/u);
  assert.match(source, /callMode:\s*data\.call_mode/u);
  assert.match(source, /callMode:\s*authority\.call_mode/u);
  assert.match(source, /row\.call_mode === "private" \|\| row\.call_mode === "public"/u);
});

test("live-call endpoint keeps browser and credential boundaries closed", () => {
  assert.match(source, /allowedOrigins\(\)/u);
  assert.match(source, /authorization\.startsWith\("Bearer "\)/u);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(source, /requiredEnvironment\("LIVEKIT_API_SECRET"\)/u);
  assert.match(source, /live_call_not_authorized/u);
});

test("live-call endpoint exposes the database mint throttle as HTTP 429", () => {
  assert.match(source, /live_call_token_rate_limit/u);
  assert.match(source, /jsonResponse\(429/u);
  assert.match(source, /live_call_token_rate_limited/u);
  assert.match(source, /retryAfterSeconds:\s*60/u);
  assert.match(source, /"retry-after":\s*"60"/u);
});
