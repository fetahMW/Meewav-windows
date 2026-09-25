import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the authentication CTA reuses the Mon Globe palette and orbit without changing its action", async () => {
  const [orbSource, authSource] = await Promise.all([
    readFile("src/components/auth/HolographicOrbCTA.tsx", "utf8"),
    readFile("src/pages/AuthPage.tsx", "utf8"),
  ]);

  assert.match(orbSource, /GLOBE_PRESENTATION_COLORS/);
  assert.match(orbSource, /MEEWAV_GLOBE_LAND_COLOR/);
  assert.match(orbSource, /MEEWAV_GLOBE_WATER_COLOR/);
  assert.match(orbSource, /function MeewavMiniatureOrbit/);
  assert.match(orbSource, /ringGeometry/);
  assert.match(authSource, /<HolographicOrbCTA[\s\S]{0,240}onClick=\{handleGlobeClick\}/);
});
