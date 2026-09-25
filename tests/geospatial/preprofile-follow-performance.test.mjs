import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("selected preprofile follows camera movement without a permanent render-frame loop", async () => {
  const source = await readFile(
    "src/features/globe/components/HoverPreProfileBubble.tsx",
    "utf8",
  );

  const followStart = source.indexOf("const followSelectedAvatar = () =>");
  const followEnd = source.indexOf("const refreshBaseLayout = () =>", followStart);
  const followSource = source.slice(followStart, followEnd);

  assert.ok(followStart >= 0 && followEnd > followStart);
  assert.match(source, /map\.on\("move", followSelectedAvatar\)/u);
  assert.match(source, /map\.off\("move", followSelectedAvatar\)/u);
  assert.doesNotMatch(source, /map\.on\("render", followSelectedAvatar\)/u);
  assert.match(followSource, /map\.project\(anchorLngLat\)/u);
  assert.match(followSource, /if \(nextLeft !== lastLeft\)/u);
  assert.match(followSource, /if \(nextTop !== lastTop\)/u);
  assert.doesNotMatch(followSource, /getBoundingClientRect|computeBubbleLayout/u);
});
