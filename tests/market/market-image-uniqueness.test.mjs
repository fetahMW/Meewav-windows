import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = path.join(projectRoot, "src/features/market");
const publicDirectory = path.join(projectRoot, "public");

test("les murs reprennent leur séquence seulement après 50 visuels différents", async () => {
  const [page, sequence] = await Promise.all([
    readFile(path.join(sourceDirectory, "MarketPage.tsx"), "utf8"),
    readFile(path.join(sourceDirectory, "marketWallSequence.ts"), "utf8"),
  ]);

  assert.match(sequence, /MARKET_WALL_UNIQUE_CYCLE_SIZE\s*=\s*50/);
  assert.match(sequence, /remaining\.findIndex\(\(product\) => !recentImages\.includes\(product\.imageUrl\)\)/);
  assert.match(sequence, /remaining\.splice\(selectedIndex, 1\)/);
  assert.doesNotMatch(sequence, /uniqueCycle\[index\s*%\s*uniqueCycle\.length\]/);
  assert.match(page, /buildMarketWallSequence\(visibleProducts\)/);
  assert.match(page, /wallProducts\.map\(\(product,\s*productIndex\)/);
  assert.match(page, /key=\{`\$\{product\.id\}-\$\{productIndex\}`\}/);
});

test("les neuf visuels de complément existent et sont raccordés aux annonces", async () => {
  const overrides = await readFile(
    path.join(sourceDirectory, "marketWallImageOverrides.ts"),
    "utf8",
  );
  const entries = [...overrides.matchAll(/"([^"]+)":\s*"(\/images\/market\/unique\/[^"]+)"/g)];

  assert.equal(entries.length, 9);
  assert.equal(entries.filter(([, id]) => id.startsWith("new-")).length, 1);
  assert.equal(entries.filter(([, id]) => id.startsWith("rental-")).length, 4);
  assert.equal(entries.filter(([, id]) => id.startsWith("service-")).length, 4);

  for (const [, productId, imageUrl] of entries) {
    assert.ok(productId.length > 0);
    await access(path.join(publicDirectory, imageUrl.replace(/^\/+/, "")));
  }
});

test("une séquence de 90 cartes ne répète aucune image avant la 51e", () => {
  const uniqueCycle = Array.from({ length: 50 }, (_, index) => `visual-${index + 1}`);
  const wall = Array.from({ length: 90 }, (_, index) => uniqueCycle[index % uniqueCycle.length]);

  assert.equal(new Set(wall.slice(0, 50)).size, 50);
  assert.equal(wall[50], wall[0]);
  for (let index = 1; index < wall.length; index += 1) {
    assert.notEqual(wall[index], wall[index - 1]);
  }
});
