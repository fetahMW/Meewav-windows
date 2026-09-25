import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("les grandes cartes Occasion et Services respectent l’identité publique du vendeur", async () => {
  const [page, identity, styles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/marketSellerIdentity.ts"),
    readSource("features/market/market-page.css"),
  ]);

  assert.match(page, /import \{ MeewavGradeBadge \} from "\.\.\/grades\/MeewavGradeBadge"/);
  assert.match(page, /selectedProduct\?\.pillarId === "used"[\s\S]*?selectedProduct\?\.pillarId === "services"/);
  assert.match(page, /market-product-modal__seller-identity[\s\S]*?selectedSellerPortrait/);
  assert.match(page, /<strong>\{selectedProduct\.seller\.name\}<\/strong>/);
  assert.match(page, /selectedSellerGradeLevel !== null[\s\S]*?<MeewavGradeBadge[\s\S]*?level=\{selectedSellerGradeLevel\}/);
  assert.match(page, /marketLive\.active[\s\S]*?selectedProduct\?\.seller\.avatarUrl \?\? null/);
  assert.match(page, /marketLive\.active[\s\S]*?selectedProduct\?\.seller\.gradeLevel \?\? null/);
  assert.match(page, /market-product-modal__seller-monogram/);

  const plaqueStart = page.indexOf('className="market-product-modal__seller-identity"');
  const plaqueEnd = page.indexOf('className="market-product-modal__media-copy"', plaqueStart);
  const plaque = page.slice(plaqueStart, plaqueEnd);
  assert.doesNotMatch(plaque, /verified|certif|online|is-online/i);

  assert.match(identity, /\/images\/preprofile\/portraits\/profile-/);
  assert.match(identity, /const gradeLevel = \(\(hash % 6\) \+ 1\) as GradeLevel/);
  assert.match(styles, /\.market-product-modal__seller-identity\s*\{[\s\S]*?top:\s*22px;[\s\S]*?right:\s*22px;/);
  assert.match(styles, /\.market-product-modal__seller-identity > img\s*\{[\s\S]*?border-radius:\s*50%/);
  assert.match(styles, /\.market-product-modal__seller-identity\.is-grade-hidden/);
  assert.match(styles, /\.market-product-modal__seller-monogram/);
  assert.match(styles, /\.market-product-modal__seller-identity\s*\{[\s\S]*?rgba\(8,\s*7,\s*18,\s*0\.22\)[\s\S]*?backdrop-filter:\s*blur\(22px\)/);
  assert.match(styles, /\.market-product-modal\[data-market-pillar="used"\] \.market-product-modal__seller-identity\s*\{[\s\S]*?rgba\(8,\s*7,\s*18,\s*0\.18\)[\s\S]*?backdrop-filter:\s*blur\(24px\)/);
});
