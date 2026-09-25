import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_LABEL_ROW_COUNT_BEHIND_HOST,
  getAvatarLabelDepthPolicy,
  getAvatarLabelOpacity,
} from "../../src/features/globe/labels/avatarLabelDepthPolicy.ts";

const VIEWPORT_HEIGHT = 705;

test("shows the full visible depth at the close 18.66 camera", () => {
  const policy = getAvatarLabelDepthPolicy({
    hostYRatio: null,
    viewportHeight: VIEWPORT_HEIGHT,
    zoom: 18.66,
  });

  assert.equal(AVATAR_LABEL_ROW_COUNT_BEHIND_HOST, 3);
  assert.equal(policy.cutoffYRatio, 0);
  for (const yRatio of [0, 0.06, 0.12, 0.18, 0.4, 0.7]) {
    assert.ok(getAvatarLabelOpacity(policy, yRatio) > 0);
  }
});

test("keeps the host line and three rows behind it at zoom 17.17", () => {
  const hostYRatio = 132 / VIEWPORT_HEIGHT;
  const policy = getAvatarLabelDepthPolicy({
    hostYRatio,
    viewportHeight: VIEWPORT_HEIGHT,
    zoom: 17.17,
  });

  assert.equal(policy.cutoffYRatio, 0);
  assert.ok(policy.threeRowsYRatio >= hostYRatio);
  for (const yRatio of [0, 0.06, 0.12, hostYRatio]) {
    assert.ok(getAvatarLabelOpacity(policy, yRatio) > 0);
  }
});

test("hides the back, fades the host line, and keeps the foreground opaque at zoom 15.09", () => {
  const hostYRatio = 354 / VIEWPORT_HEIGHT;
  const policy = getAvatarLabelDepthPolicy({
    hostYRatio,
    viewportHeight: VIEWPORT_HEIGHT,
    zoom: 15.09,
  });

  assert.ok(policy.cutoffYRatio > 0.44 && policy.cutoffYRatio < 0.46);
  assert.equal(getAvatarLabelOpacity(policy, policy.cutoffYRatio - 0.01), 0);

  const hostLineOpacity = getAvatarLabelOpacity(policy, hostYRatio);
  assert.ok(hostLineOpacity > 0.5 && hostLineOpacity < 0.6);
  assert.equal(getAvatarLabelOpacity(policy, policy.foregroundYRatio), 1);
  assert.equal(getAvatarLabelOpacity(policy, 0.8), 1);
});

test("changes depth continuously while zooming and keeps priority labels opaque", () => {
  const overview = getAvatarLabelDepthPolicy({ hostYRatio: 0.5, viewportHeight: VIEWPORT_HEIGHT, zoom: 15.09 });
  const transition = getAvatarLabelDepthPolicy({ hostYRatio: 0.5, viewportHeight: VIEWPORT_HEIGHT, zoom: 16.1 });
  const close = getAvatarLabelDepthPolicy({ hostYRatio: 0.5, viewportHeight: VIEWPORT_HEIGHT, zoom: 17.17 });

  assert.ok(close.cutoffYRatio < transition.cutoffYRatio);
  assert.ok(transition.cutoffYRatio < overview.cutoffYRatio);
  assert.equal(getAvatarLabelOpacity(overview, 0.1, true), 1);
});
