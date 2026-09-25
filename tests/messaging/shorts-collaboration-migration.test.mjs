import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260731120000_shorts_client_collaboration_source.sql",
  import.meta.url,
);

test("la migration autorise uniquement Globe et Shorts aux clients authentifiés", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /if not v_is_service and v_source not in \('globe', 'shorts'\) then/,
  );
  assert.match(
    migration,
    /v_source not in \('globe', 'profile', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin'\)/,
  );
  assert.match(migration, /collaboration_client_source_not_allowed/);

  for (const source of ["profile", "messaging", "rooms", "marketplace", "tremplin"]) {
    assert.match(migration, new RegExp(`'${source}'`));
  }
});

test("la migration préserve la sécurité definer et le grant RPC étroit", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(
    migration,
    /grant execute on function public\.request_profile_collaboration\(uuid, text, text, text\)\s+to authenticated, service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /if not v_is_service and v_source <> 'globe'/,
  );
});
