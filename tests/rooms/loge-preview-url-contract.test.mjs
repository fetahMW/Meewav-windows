import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/rooms-loge-preview-url/index.ts", import.meta.url),
  "utf8",
);
const config = readFileSync(
  new URL("../../supabase/config.toml", import.meta.url),
  "utf8",
);

test("Loge preview URL uses a service-only database decision", () => {
  assert.match(source, /authClient\.auth\.getUser\(\)/u);
  assert.match(source, /rooms_authorize_loge_preview_media_v1/u);
  assert.match(source, /p_user_id:\s*authData\.user\.id/u);
  assert.doesNotMatch(source, /\.from\("room_specialized_state_v1"\)/u);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/u);
});

test("Loge preview URL accepts roomId and no client-selected media capability", () => {
  assert.match(source, /Object\.keys\(body\)\.length !== 1/u);
  assert.match(source, /hasOwnProperty\.call\(body, "roomId"\)/u);
  assert.doesNotMatch(source, /body\.(?:mediaPath|media_path|bucket|ttl|expiresIn)/u);
  assert.match(source, /\.from\(LOGE_PREVIEW_BUCKET\)/u);
  assert.match(source, /createSignedUrl\(data\.media_path, ttl\)/u);
  assert.doesNotMatch(source, /getPublicUrl/u);
});

test("Loge preview URL is short-lived and clamped to Viewer access expiry", () => {
  assert.match(source, /VIEWER_TTL_SECONDS = 120/u);
  assert.match(source, /CONTROL_TTL_SECONDS = 10 \* 60/u);
  assert.match(source, /Math\.min\(ttl, previewExpirySeconds - nowSeconds\)/u);
  assert.match(source, /ttl <= EXPIRY_SKEW_SECONDS/u);
  assert.match(source, /preview_expires_at/u);
});

test("Loge preview response exposes no persistent path", () => {
  const success = source.slice(
    source.indexOf("return jsonResponse(200"),
    source.indexOf("} catch (error)"),
  );
  assert.match(success, /signedUrl:/u);
  assert.match(success, /expiresAt:/u);
  assert.doesNotMatch(success, /mediaPath:|media_path:|bucket:/u);
});

test("Loge preview endpoint keeps browser, cache and log boundaries closed", () => {
  assert.match(source, /allowedOrigins\(\)/u);
  assert.match(source, /authorization\.startsWith\("Bearer "\)/u);
  assert.match(source, /jsonResponse/u);
  assert.match(source, /console\.error\("rooms-loge-preview-url", "request_failed"\)/u);
  assert.doesNotMatch(source, /console\.(?:log|info|warn)\(/u);
  assert.doesNotMatch(source, /console\.error\([^\n]+error/u);
  assert.match(
    config,
    /\[functions\.rooms-loge-preview-url\][\s\S]*?verify_jwt = true/u,
  );
});
