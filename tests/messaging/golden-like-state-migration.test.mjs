import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260731121000_golden_like_given_artist_state.sql",
  import.meta.url,
);

test("l’état Golden Like expose additivement le bénéficiaire quotidien canonique", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.get_golden_like_state/);
  assert.match(migration, /'givenArtistId', v_existing\.recipient_id/);
  assert.match(migration, /'givenToThisArtistToday'/);
  assert.match(migration, /'goldenLikesCount'/);
});

test("la migration conserve le contrat de sécurité et le grant authentifié", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(
    migration,
    /revoke all on function public\.get_golden_like_state\(uuid\)\s+from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_golden_like_state\(uuid\) to authenticated;/,
  );
});
