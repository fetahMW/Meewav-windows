import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const marketDirectory = new URL("../../src/features/market/", import.meta.url);

async function readMarketSource(filename) {
  return readFile(new URL(filename, marketDirectory), "utf8");
}

function collectOfferIds(sources) {
  const ids = new Set();

  for (const source of sources) {
    for (const match of source.matchAll(/\bid:\s*"([^"]+)"/g)) {
      if (pillarForOfferId(match[1])) ids.add(match[1]);
    }
  }

  return ids;
}

function pillarForOfferId(id) {
  const match = id.match(
    /^(?:(?:exp|expansion|editorial|wave2)-)?(new|used|rental|service|services|collective)-/,
  );
  if (!match) return null;
  return match[1] === "service" ? "services" : match[1];
}

function collectRailSizes(marketDemoDataSource) {
  const railsStart = marketDemoDataSource.indexOf("export const MARKET_HOME_RAILS");
  const railsEnd = marketDemoDataSource.indexOf("export const featuredMarketProductIds", railsStart);

  assert.ok(railsStart >= 0 && railsEnd > railsStart, "la section MARKET_HOME_RAILS doit rester localisable");

  const railSection = marketDemoDataSource.slice(railsStart, railsEnd);
  const sizes = new Map();

  for (const match of railSection.matchAll(
    /pillarId:\s*"(new|used|rental|services|collective)"[\s\S]*?productIds:\s*\[([\s\S]*?)\]/g,
  )) {
    const productIds = [...match[2].matchAll(/"(?:new|used|rental|service|collective)-[^"]+"/g)];
    sizes.set(match[1], productIds.length);
  }

  return sizes;
}

test("chaque mur Market dépasse son rail et conserve une densité investisseur", async () => {
  const filenames = await readdir(marketDirectory);
  const expansionFilenames = filenames
    .filter((filename) => /^marketExpansion.+\.ts$/.test(filename))
    .sort();

  assert.ok(expansionFilenames.length >= 3, "les expansions des cinq univers doivent être présentes");

  const marketDemoDataSource = await readMarketSource("marketDemoData.ts");
  const expansionSources = await Promise.all(expansionFilenames.map(readMarketSource));

  for (let index = 0; index < expansionFilenames.length; index += 1) {
    const filename = expansionFilenames[index];
    const source = expansionSources[index];
    const moduleName = filename.replace(/\.ts$/, "");
    const productExports = [
      ...source.matchAll(/export const\s+([A-Za-z0-9_]*(?:Products|_PRODUCTS))\s*:/g),
    ].map((match) => match[1]);

    assert.ok(productExports.length > 0, `${filename} doit exporter au moins un tableau de produits`);
    assert.match(
      marketDemoDataSource,
      new RegExp(`from\\s+["']\\./${moduleName}["']`),
      `${filename} doit être importé par marketDemoData.ts`,
    );
    assert.ok(
      productExports.some((exportName) => marketDemoDataSource.includes(`...${exportName}`)),
      `un tableau de ${filename} doit alimenter marketProducts`,
    );
  }

  const offerIds = collectOfferIds([marketDemoDataSource, ...expansionSources]);
  assert.ok(
    offerIds.size >= 450,
    `le catalogue de démonstration doit conserver au moins 450 offres uniques (reçu : ${offerIds.size})`,
  );
  const railSizes = collectRailSizes(marketDemoDataSource);
  const wallCounts = new Map([
    ["new", 0],
    ["used", 0],
    ["rental", 0],
    ["services", 0],
    ["collective", 0],
  ]);

  for (const id of offerIds) {
    const pillarId = pillarForOfferId(id);
    wallCounts.set(pillarId, (wallCounts.get(pillarId) ?? 0) + 1);
  }

  for (const [pillarId, wallCount] of wallCounts) {
    const railSize = railSizes.get(pillarId);
    assert.ok(Number.isInteger(railSize), `le rail ${pillarId} doit être défini`);
    assert.ok(
      wallCount > railSize,
      `le mur ${pillarId} (${wallCount}) doit être strictement plus dense que son rail (${railSize})`,
    );
    assert.ok(wallCount >= 85, `le mur ${pillarId} doit contenir au moins 85 offres (reçu : ${wallCount})`);
  }
});
