import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = "src/components/auth/HolographicOrbCTA.tsx";
const stylesPath = "src/components/auth/HolographicOrbCTA.css";

test("signup CTA is a transparent Meewav globe without a Saturn ring", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /GLOBE_PRESENTATION_COLORS\.land/u);
  assert.match(component, /GLOBE_PRESENTATION_COLORS\.water/u);
  assert.match(component, /convertLinearToSRGB/u);
  assert.match(component, /premultipliedAlpha:\s*false/u);
  assert.match(component, /setClearColor\(0x000000, 0\)/u);
  assert.doesNotMatch(component, /ringGeometry|MeewavMiniatureOrbit/u);
  assert.match(styles, /background:\s*transparent !important/u);
  assert.match(styles, /filter:\s*none/u);
  assert.doesNotMatch(styles, /drop-shadow/u);
});
