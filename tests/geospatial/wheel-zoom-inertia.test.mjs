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

test("turns physical wheel deltas into symmetric logarithmic zoom impulses", async () => {
  const wheel = await importTypeScriptModule("src/features/globe/camera/criticalWheelZoom.ts");
  const zoomIn = wheel.getSigmoidWheelZoomDelta(100, 1 / 320);
  const zoomOut = wheel.getSigmoidWheelZoomDelta(-100, 1 / 320);

  assert.ok(zoomIn > 0.2 && zoomIn < 0.22);
  assert.ok(zoomOut < -0.2 && zoomOut > -0.22);
  assert.ok(Math.abs(zoomIn + zoomOut) < 1e-12);
  assert.equal(wheel.getSigmoidWheelZoomDelta(0, 1 / 320), 0);
  assert.ok(wheel.getSigmoidWheelZoomDelta(100_000, 1 / 320) <= 1);
  assert.equal(wheel.normalizePhysicalWheelDelta(20, 100), 100);
  assert.equal(wheel.normalizePhysicalWheelDelta(-20, 100), -100);
  assert.equal(wheel.normalizePhysicalWheelDelta(140, 100), 140);
  assert.equal(
    wheel.normalizePhysicalWheelDelta(20, 100)
      + wheel.normalizePhysicalWheelDelta(20, 100),
    200,
  );
  assert.equal(
    wheel.normalizePhysicalWheelDelta(20, 100)
      + wheel.normalizePhysicalWheelDelta(-20, 100),
    0,
  );
  assert.equal(wheel.clampWheelTargetLead(12, 4, 2.4), 6.4);
  assert.equal(wheel.clampWheelTargetLead(-8, 4, 2.4), 1.6);
});

test("physical wheel impulse produces a real frame-rate-independent coast", async () => {
  const wheel = await importTypeScriptModule("src/features/globe/camera/criticalWheelZoom.ts");
  const initialVelocity = wheel.getSigmoidWheelZoomDelta(100, 1 / 320) * 18;
  const positions = [];

  for (const fps of [60, 30, 20, 10, 6]) {
    let velocity = initialVelocity;
    let position = 0;
    let settledFrame = 0;

    for (let frame = 1; frame <= fps * 2; frame += 1) {
      const step = wheel.stepExponentialWheelCoast(velocity, 6.5, 1 / fps);
      position += step.displacement;
      velocity = step.velocity;
      if (wheel.isExponentialWheelCoastSettled(velocity, 0.05)) {
        settledFrame = frame;
        break;
      }
    }

    assert.ok(settledFrame > 0);
    assert.ok(settledFrame / fps >= 0.6);
    assert.ok(settledFrame / fps <= 0.85);
    assert.ok(position > 0.56 && position < 0.58);
    positions.push(position);
  }

  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.008);
});

test("wheel throw starts clearly then decelerates inside a strict render-tail budget", async () => {
  const wheel = await importTypeScriptModule("src/features/globe/camera/criticalWheelZoom.ts");
  const initialVelocity = wheel.getSigmoidWheelZoomDelta(100, 1 / 320) * 18;
  const totalCoast = initialVelocity / 6.5;
  let velocity = initialVelocity;
  let position = 0;

  for (let frame = 1; frame <= 15; frame += 1) {
    const step = wheel.stepExponentialWheelCoast(velocity, 6.5, 1 / 60);
    position += step.displacement;
    velocity = step.velocity;
    if (frame === 6) {
      assert.ok(position / totalCoast > 0.46);
      assert.ok(position / totalCoast < 0.5);
    }
  }
  assert.ok(position / totalCoast > 0.79);
  assert.ok(position / totalCoast < 0.82);

  for (const fps of [60, 30, 20, 10, 6]) {
    let maximumVelocity = 7.5;
    let settledFrame = 0;

    for (let frame = 1; frame <= fps; frame += 1) {
      const step = wheel.stepExponentialWheelCoast(maximumVelocity, 6.5, 1 / fps);
      maximumVelocity = step.velocity;
      if (wheel.isExponentialWheelCoastSettled(maximumVelocity, 0.05)) {
        settledFrame = frame;
        break;
      }
    }

    assert.ok(settledFrame > 0);
    assert.ok((settledFrame / fps) * 1000 <= 850);
  }
});

test("wheel inertia keeps MapLibre's globe anchor and native trackpad path", async () => {
  const [componentSource, packageJsonSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonSource);
  const inertiaStart = componentSource.indexOf("function installGoogleEarthWheelInertia");
  const wheelStart = componentSource.indexOf("function installGoogleEarthWheelZoom", inertiaStart);
  const middleStart = componentSource.indexOf("function installGoogleEarthMiddleLinearZoom", wheelStart);
  const inertiaSource = componentSource.slice(inertiaStart, wheelStart);
  const wheelSource = componentSource.slice(wheelStart, middleStart);

  assert.ok(inertiaStart >= 0 && wheelStart > inertiaStart && middleStart > wheelStart);
  assert.equal(packageJson.dependencies["maplibre-gl"], "5.24.0");
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_ZOOM_RATE\s*=\s*1\s*\/\s*320/);
  assert.match(componentSource, /GOOGLE_EARTH_PHYSICAL_WHEEL_MIN_IMPULSE\s*=\s*100/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_COAST_DRAG\s*=\s*6\.5/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_IMPULSE_VELOCITY_FACTOR\s*=\s*18/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_MAX_TARGET_LEAD\s*=\s*1\.6/);
  assert.match(componentSource, /GOOGLE_EARTH_WHEEL_END_DELAY_MS\s*=\s*60/);
  assert.match(inertiaSource, /typeof handler\._delta !== "number"/);
  assert.match(inertiaSource, /window\.clearTimeout\(this\._timeout\)[\s\S]{0,140}this\._delta = 0/);
  assert.match(inertiaSource, /this\._type = null[\s\S]{0,120}this\._lastWheelEventTime = 0/);
  assert.match(inertiaSource, /this\._type !== "wheel"[\s\S]{0,220}nativeRenderFrame\.call\(this\)/);
  assert.match(inertiaSource, /stepExponentialWheelCoast\(/);
  assert.match(inertiaSource, /coastVelocity \+ wheelZoomImpulse \* GOOGLE_EARTH_WHEEL_IMPULSE_VELOCITY_FACTOR/);
  assert.match(inertiaSource, /elapsedSinceLastFrameMs > GOOGLE_EARTH_WHEEL_STALL_CANCEL_MS[\s\S]{0,140}coastVelocity = 0/);
  assert.match(inertiaSource, /transform\.applyConstrain\(/);
  assert.match(inertiaSource, /reachedCameraBoundary[\s\S]{0,100}coastVelocity = reachedCameraBoundary \? 0/);
  assert.match(inertiaSource, /around: this\._aroundPoint/);
  assert.match(inertiaSource, /noInertia: true/);
  assert.match(inertiaSource, /needsRenderFrame: !finished/);
  assert.match(inertiaSource, /this\._triggerRenderFrame\(\)/);
  assert.doesNotMatch(inertiaSource, /stepCriticalSpring|targetDirectionAfterStep/);
  assert.match(wheelSource, /installGoogleEarthWheelInertia\(map/);
  assert.match(wheelSource, /predictionFrameWheelImpulse \+= eventZoomImpulse/);
  assert.match(wheelSource, /eventZoomImpulse[\s\S]{0,180}GOOGLE_EARTH_WHEEL_COAST_DRAG/);
  assert.match(wheelSource, /usePhysicalWheelPrediction[\s\S]{0,260}nativeAccumulatedDelta/);
  assert.match(wheelSource, /_meewavDefinitePhysicalWheel/);
  assert.match(wheelSource, /GOOGLE_EARTH_WHEEL_ACTIVATION_GUARD_MS/);
  assert.match(wheelSource, /interrupt:[\s\S]{0,180}finishWheelGesture\(\)/);
  assert.match(componentSource, /onZoomStart:[\s\S]{0,300}wheelZoomController\.interrupt\(\)/);
  assert.match(componentSource, /onDragStart:[\s\S]{0,180}wheelZoomController\.interrupt\(\)/);
  assert.doesNotMatch(inertiaSource, /\.easeTo\(|\.jumpTo\(/);
});
