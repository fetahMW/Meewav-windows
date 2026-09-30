import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCadence } from '../../vendor/globe-vinyle/shared/src/render-cadence.mjs';

test('budgets automatic rotation at 30fps and interaction at 60fps on high refresh displays', () => {
  for (const [ambient, expected] of [[true, 30], [false, 60]]) {
    const cadence = createRenderCadence(true);
    let accepted = 0;
    for (let frame = 0; frame < 144; frame++) if (cadence.frame(frame * 1000 / 144, ambient)) accepted++;
    assert.ok(accepted >= expected - 1 && accepted <= expected + 1);
  }
});

test('elapsed time is preserved for the automatic record instead of slowing its rotation', () => {
  const cadence = createRenderCadence(true);
  let previous = null, elapsed = 0;
  for (let frame = 0; frame <= 720; frame++) {
    const now = frame * 1000 / 144;
    if (!cadence.frame(now, true)) continue;
    if (previous !== null) elapsed += (now - previous) / 1000;
    previous = now;
  }
  assert.ok(Math.abs(elapsed - 5) < 0.04);
});

test('input, new content and visibility restoration render without waiting for ambient deadline', () => {
  const cadence = createRenderCadence(true);
  assert.equal(cadence.frame(0, true), true);
  assert.equal(cadence.frame(5, true), false);
  assert.equal(cadence.frame(6, false), true);
  assert.equal(cadence.frame(7, false), false);
  assert.equal(cadence.frame(8, false, true), true);
  cadence.reset();
  assert.equal(cadence.frame(9, true), true);
});

test('the web renderer retains its existing cadence', () => {
  const cadence = createRenderCadence();
  for (let frame = 0; frame < 240; frame++) assert.equal(cadence.frame(frame, true), true);
});
