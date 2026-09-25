import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../supabase/functions/livekit-token/index.ts", import.meta.url), "utf8");

test("livekit-token preserves the legacy iOS envelope without trusting its grants", () => {
  assert.match(source, /typeof body\.roomName === "string"/);
  assert.match(source, /if \(!isWebContract\) return jsonResponse\(200, \{ token \}/);
  assert.doesNotMatch(source, /identity:\s*body\.identity/);
  assert.doesNotMatch(source, /canPublish:\s*body\.canPublish/);
  assert.match(source, /identity:\s*userId/);
});

test("livekit-token derives Room membership and fail-closed publication rights", () => {
  assert.match(source, /\.eq\("status", "live"\)/);
  assert.match(source, /\.eq\("type", "place"\)/);
  assert.match(source, /invitation\?\.status === "onstage"/);
  assert.match(source, /participantIsActive/);
  assert.match(source, /if \(banResult\.data \|\| \(kickResult\.data && !participantIsActive\)\)/);
  assert.match(source, /participant\?\.role === "guest"/);
  assert.match(source, /const derivedCanPublish = role === "host" \|\| guestCanPublish/);
  assert.match(source, /room_livekit_publication_grants_v1/);
  assert.match(source, /const canPublish = derivedCanPublish[\s\S]*publicationGeneration !== null/);
  assert.match(source, /role === "host"[\s\S]*\["camera", "microphone", "screen_share", "screen_share_audio"\]/);
  assert.match(source, /:\s*\["camera", "microphone"\]/);
  assert.match(source, /isWebContract && canPublish/);
});

test("livekit-token authenticates every caller and accepts native requests without Origin", () => {
  assert.match(source, /authorization\.startsWith\("Bearer "\)/);
  assert.match(source, /authClient\.auth\.getUser\(\)/);
  assert.match(source, /if \(!origin\) return \{ origin, allowed: true/);
  assert.match(source, /if \(!cors\.allowed\) return jsonResponse\(403, \{ error: "origin_refused" \}/);
});

test("livekit-token exposes the extended Web response and keeps signing secrets server-side", () => {
  for (const field of [
    "token",
    "serverUrl",
    "expiresAt",
    "role",
    "roomName",
    "canPublish",
    "participantIdentity",
    "programAudioPublisherIdentity",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.match(source, /participantIdentity:\s*userId/);
  assert.match(source, /programAudioPublisherIdentity:\s*room\.host_id/);
  assert.match(source, /requiredEnvironment\("LIVEKIT_API_KEY"\)/);
  assert.match(source, /requiredEnvironment\("LIVEKIT_API_SECRET"\)/);
  assert.match(source, /hmacSignature\(unsignedToken, apiSecret\)/);
  assert.match(source, /publicationGeneration/);
});
