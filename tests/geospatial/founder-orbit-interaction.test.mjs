import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function assertClose(actual, expected, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("maps pointer movement to the orbit ellipse without discontinuity", async () => {
  const orbit = await importTypeScriptModule(
    "src/features/globe/components/founderOrbitMotion.ts",
  );

  assertClose(orbit.getEllipsePointerAngleDeg(200, 100, 100, 100, 100, 40), 0);
  assertClose(orbit.getEllipsePointerAngleDeg(100, 140, 100, 100, 100, 40), 90);
  assertClose(Math.abs(orbit.getEllipsePointerAngleDeg(0, 100, 100, 100, 100, 40)), 180);
  assert.equal(orbit.getShortestSignedAngleDeg(1, 359), 2);
  assert.equal(orbit.getShortestSignedAngleDeg(359, 1), -2);
});

test("uses the ellipse phase as perspective depth and damps released motion", async () => {
  const orbit = await importTypeScriptModule(
    "src/features/globe/components/founderOrbitMotion.ts",
  );

  assertClose(orbit.getOrbitDepth(90), 1);
  assertClose(orbit.getOrbitDepth(270), 0);
  assertClose(orbit.getOrbitPerspectiveScale(0), 0.84);
  assertClose(orbit.getOrbitPerspectiveScale(1), 1);
  assertClose(orbit.getOrbitPerspectiveOpacity(0), 0.58);
  assertClose(orbit.getOrbitPerspectiveOpacity(1), 1);
  assert.ok(Math.abs(orbit.dampOrbitVelocity(1, 16.67)) < 1);
});

test("keeps portraits attached to the draggable orbit and splits front/back stacking", async () => {
  const [componentSource, cssSource] = await Promise.all([
    readFile("src/features/globe/components/MeewavFounderOrbit.tsx", "utf8"),
    readFile("src/features/globe/styles/globe-v2.css", "utf8"),
  ]);

  assert.match(componentSource, /member\.angleDeg \+ rotationDeg/);
  assert.match(componentSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(componentSource, /startOrbitInertia\(drag\.velocityDegPerMs\)/);
  assert.match(componentSource, /node\.dataset\.orbitSide = isFront \? "front" : "back"/);
  assert.match(componentSource, /--meewav-founder-globe-mask-radius/);
  assert.match(componentSource, /meewav-founder-orbit__hit-target is-front/);
  assert.match(componentSource, /ORBIT_HIT_INNER_RADIUS_SCALE = 1\.08/);
  assert.match(componentSource, /ORBIT_HIT_OUTER_RADIUS_SCALE = 1\.62/);
  assert.match(componentSource, /buildOrbitAnnulusArcPath/);
  assert.match(componentSource, /buildOutsideCircleClipPath/);
  assert.match(componentSource, /meewav-founder-orbit-outside-globe-hit-clip/);
  assert.match(componentSource, /clipPath="url\(#meewav-founder-orbit-outside-globe-hit-clip\)"/);
  assert.doesNotMatch(componentSource, /hitStrokeWidth/);
  assert.doesNotMatch(componentSource, /fitEllipsePointToHorizontalViewport/);

  assert.match(cssSource, /meewav-founder-orbit__hit-target[\s\S]{0,100}pointer-events: fill/);
  assert.match(cssSource, /meewav-founder-orbit__nodes\s*\{\s*z-index: auto/);
  assert.match(cssSource, /meewav-founder-orbit__node\.is-front:hover/);
  assert.match(cssSource, /meewav-founder-orbit__node\.is-back[\s\S]{0,500}mask-image: radial-gradient/);
  assert.match(cssSource, /transparent calc\(var\(--meewav-founder-globe-mask-radius\) - 1px\)/);
  assert.match(cssSource, /0 0 7px rgba\(188, 116, 255, 0\.32\)/);
  assert.doesNotMatch(cssSource, /0 0 30px rgba\(96, 50, 255/);
});
