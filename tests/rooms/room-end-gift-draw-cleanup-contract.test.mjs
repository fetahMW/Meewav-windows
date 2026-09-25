import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260815133000_rooms_end_gift_draw_cleanup_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("ending a Room cancels every unrevealed gift draw immediately", () => {
  assert.match(
    migration,
    /after update of status on public\.rooms_v2[\s\S]*old\.status is distinct from new\.status[\s\S]*new\.status = 'ended'/u,
  );
  assert.match(
    migration,
    /update public\.room_gift_draws_v1 draw[\s\S]*draw\.room_id = new\.id[\s\S]*draw\.status in \('ready', 'scheduled', 'spinning'\)/u,
  );
  assert.match(migration, /status = 'cancelled'/u);
  assert.match(migration, /cancelled_at = coalesce\(draw\.cancelled_at, v_cancelled_at\)/u);
  assert.match(migration, /updated_at = v_cancelled_at/u);
});

test("the cleanup is additive, private and leaves durable gift deliveries intact", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/u);
  assert.match(
    migration,
    /revoke all on function public\.rooms_cancel_gift_draws_after_end_v1\(\)[\s\S]*from public, anon, authenticated, service_role/u,
  );
  assert.doesNotMatch(migration, /room_gift_deliveries_v1/u);
  assert.doesNotMatch(migration, /create or replace function public\.rooms_end_place_v3/u);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/iu);
  assert.doesNotMatch(migration, /\bdrop\s+(?:table|column|function)\b/iu);
  assert.doesNotMatch(migration, /\brename\s+(?:table|column)\b/iu);
});
