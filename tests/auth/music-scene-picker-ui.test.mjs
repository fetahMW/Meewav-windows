import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authPagePromise = readFile(
  new URL("../../src/pages/AuthPage.tsx", import.meta.url),
  "utf8",
);
const authStylesPromise = readFile(
  new URL("../../src/styles/auth.css", import.meta.url),
  "utf8",
);

test("the whole music-scene fields toggle their menus without moving the text caret", async () => {
  const [source, styles] = await Promise.all([authPagePromise, authStylesPromise]);

  assert.match(source, /onMouseDown=\{handlePickerChromeMouseDown\}/u);
  assert.match(source, /onClick=\{handleCityPickerFieldClick\}/u);
  assert.match(source, /onClick=\{handleScenePickerFieldClick\}/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /querySelector\("input"\)\?\.blur\(\)/u);
  assert.match(source, /setIsCityPickerOpen\(\(isOpen\) => !isOpen\)/u);
  assert.match(source, /setIsScenePickerOpen\(\(isOpen\) => !isOpen\)/u);
  assert.match(styles, /\.scene-picker-chevron\s*\{[\s\S]*?pointer-events:\s*auto/u);
});

test("music-scene option rows expose names without geographic source codes", async () => {
  const source = await authPagePromise;

  assert.doesNotMatch(source, /city-picker-option-codes/u);
  assert.doesNotMatch(source, /INSEE \{city\.communeCode\}/u);
  assert.doesNotMatch(source, /Quartier IRIS/u);
  assert.match(source, /<strong>\{scene\.label\}<\/strong>/u);
});
