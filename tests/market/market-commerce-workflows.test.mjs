import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("le panier premium est intégré avec quantité, réception, état Phase A et total", async () => {
  const [page, cart, styles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/MarketCartPanel.tsx"),
    readSource("features/market/market-cart.css"),
  ]);

  assert.match(page, /import MarketCartPanel from ["']\.\/MarketCartPanel["']/);
  assert.match(page, /<MarketCartPanel[\s\S]*?onQuantityChange=\{handleCartQuantityChange\}/);
  assert.match(page, /if \(!product\.cart\.eligible\)/);
  assert.match(cart, /role=["']dialog["'][\s\S]*?aria-modal=["']true["']/);
  assert.match(cart, /market-cart-quantity[\s\S]*?Diminuer la quantité[\s\S]*?Augmenter la quantité/);
  assert.match(cart, /Livraison proposée[\s\S]*?Retrait proposé/);
  assert.match(cart, /Aucun paiement ni séquestre n’est lancé dans cette version/);
  assert.match(cart, /Sous-total[\s\S]*?Paiement[\s\S]*?Non activé[\s\S]*?Total/);
  assert.doesNotMatch(cart, /TVA incluse|Pièce unique réservée au panier|Vendeurs vérifiés/);
  assert.match(cart, /productsStatus === "error"[\s\S]*?Impossible de charger les annonces du panier/);
  assert.match(cart, /onRetryProducts/);
  assert.match(cart, /sibling\.inert = true/);
  assert.match(cart, /element\.inert = wasInert/);
  assert.match(cart, /FREE_SHIPPING_THRESHOLD/);
  assert.match(cart, /event\.key !== ["']Tab["']/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("le compositeur couvre les cinq modes et les quatre familles de services", async () => {
  const [page, composer] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/MarketListingComposer.tsx"),
  ]);

  assert.match(page, /import MarketListingComposer from ["']\.\/MarketListingComposer["']/);
  assert.match(page, /<MarketListingComposer[\s\S]*?onPublish=/);
  for (const pillar of ["new", "used", "rental", "services", "collective"]) {
    assert.match(composer, new RegExp(`${pillar}:\\s*\\{`), `parcours absent pour ${pillar}`);
  }
  for (const serviceKind of ["production", "coaching", "ticket", "room"]) {
    assert.match(composer, new RegExp(`${serviceKind}:\\s*\\{`), `service absent pour ${serviceKind}`);
  }
  assert.match(composer, /const STEPS:[\s\S]*?Type d’offre[\s\S]*?L’annonce[\s\S]*?Conditions[\s\S]*?Médias & remise[\s\S]*?Vérification/);
  assert.match(composer, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(composer, /onPublish\?\.\(draft\)/);
  assert.match(composer, /drag[\s\S]*drop|onDrop=/i);
  assert.match(composer, /Aperçu de l’annonce/);
  assert.match(composer, /draft\.media\.some\(\(media\) => media\.kind === ["']image["']\)/);
  assert.match(composer, /!media\.isCover && media\.kind === ["']image["']/);
  assert.match(page, /const coverMediaId = draft\.media\.find\(\(media\) => media\.kind === ["']image["'] && media\.isCover\)/);
  assert.match(page, /listingUploadCacheRef\.current\.get\(media\.id\)/);
  assert.match(page, /profileMediaRepository\.archiveOwnerMedia\(mediaId\)/);
  assert.match(page, /listingIdempotencyKeyRef\.current[\s\S]*?createMarketplaceIdempotencyKey\(editingOwnerDraft \? ["']draft-update["'] : ["']listing-draft["']\)/);
  assert.match(page, /marketplaceRepository\.updateListingDraft\(\{[\s\S]*?expectedVersion: editingOwnerDraft\.version[\s\S]*?idempotencyKey: listingIdempotencyKey/);
  assert.match(page, /marketplaceRepository\.createListingDraft\(listingInput, listingIdempotencyKey\)/);
  assert.match(page, /error instanceof MarketplaceServiceError && error\.code === ["']conflict["'][\s\S]*?setDraftCenterRevision/);
  assert.match(composer, /classifyMarketplaceMediaFile\(file\)/);
  assert.ok(
    composer.indexOf("classifyMarketplaceMediaFile(file)") < composer.indexOf("URL.createObjectURL(file)"),
    "la validation MIME/extension doit précéder la création de l’aperçu blob",
  );
  assert.match(composer, /accept=\{MARKETPLACE_MEDIA_ACCEPT\}/);
  assert.match(composer, /createMarketLocalMediaId\(\)/);
  assert.match(composer, /publishingRef\.current = true[\s\S]*?await onPublish\?\.\(draft\)[\s\S]*?publishingRef\.current = false/);
  assert.match(composer, /if \(publishingRef\.current\)[\s\S]*?Enregistrement en cours/);
  assert.match(page, /if \(listingPublishInFlightRef\.current\)[\s\S]*?listingCleanupAfterPublishRef\.current = true/);
  assert.match(page, /const uniqueMediaFileIds = new Set<string>\(\)/);
});

test("les overlays commerce respectent le clavier sans animation GPU permanente", async () => {
  const [cart, composer, cartStyles, composerStyles] = await Promise.all([
    readSource("features/market/MarketCartPanel.tsx"),
    readSource("features/market/MarketListingComposer.tsx"),
    readSource("features/market/market-cart.css"),
    readSource("features/market/market-listing-composer.css"),
  ]);

  for (const source of [cart, composer]) {
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.doesNotMatch(
      source,
      /requestAnimationFrame\s*\(\s*(?:function\s+)?([A-Za-z_$][\w$]*)[\s\S]*?requestAnimationFrame\s*\(\s*\1\s*\)/,
      "les requestAnimationFrame ponctuels de focus sont permis, pas une boucle d’animation permanente",
    );
    assert.match(source, /event\.key === ["']Escape["']/);
    assert.match(source, /querySelectorAll<HTMLElement>/);
  }
  assert.match(composer, /role=["']dialog["']/);
  assert.match(composer, /aria-modal=["']true["']/);
  assert.match(composerStyles, /@media \(max-width: 760px\)/);
  assert.match(composerStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cartStyles, /@media \(prefers-reduced-motion: reduce\)/);
});
