import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { tremplinArtists } from "../../src/features/tremplin/tremplinArtistData.ts";
import {
  TREMPLIN_PLATFORM_CONFIG,
  TREMPLIN_TOKEN_PERIODS,
  TREMPLIN_TRANSACTION_STATUS_LABELS,
  getTremplinArtistToken,
  simulateBondingCurvePurchase,
  simulateBondingCurveResale,
  tremplinArtistTokens,
  tremplinMockTransactions,
} from "../../src/features/tremplin/tremplinTokenData.ts";

const almostEqual = (actual, expected, precision = 0.01, message = "") => {
  assert.ok(
    Math.abs(actual - expected) <= precision,
    message || `${actual} doit être proche de ${expected}`,
  );
};

test("le catalogue massif aligne chaque artiste avec un jeton réaliste", async () => {
  assert.ok(tremplinArtists.length >= 100, "le Tremplin doit conserver son catalogue de démonstration réellement abondant");
  assert.equal(tremplinArtistTokens.length, tremplinArtists.length);

  const artistIds = new Set(tremplinArtists.map((artist) => artist.id));
  const tokenIds = new Set(tremplinArtistTokens.map((token) => token.artistId));
  const symbols = tremplinArtistTokens.map((token) => token.symbol);
  const generatedImages = tremplinArtists
    .map((artist) => artist.artwork)
    .filter((artwork) => artwork.includes("/generated/"));
  const professionImages = tremplinArtists
    .map((artist) => artist.artwork)
    .filter((artwork) => artwork.includes("/professions/"));

  assert.equal(artistIds.size, tremplinArtists.length, "chaque artiste doit avoir un identifiant unique");
  assert.deepEqual(tokenIds, artistIds);
  assert.equal(new Set(symbols).size, symbols.length, "chaque symbole doit être unique");
  assert.equal(
    new Set(generatedImages).size,
    generatedImages.length,
    "chaque profil généré doit conserver son propre portrait",
  );
  const generatedImageHashes = await Promise.all(generatedImages.map(async (publicPath) => {
    assert.match(publicPath, /\.webp$/, "les portraits générés doivent être livrés dans un format web optimisé");
    const bytes = await readFile(new URL(`../../public${publicPath}`, import.meta.url));
    return createHash("sha256").update(bytes).digest("hex");
  }));
  assert.equal(
    new Set(generatedImageHashes).size,
    generatedImageHashes.length,
    "aucun portrait généré ne doit être une copie binaire d'un autre",
  );
  assert.equal(professionImages.length, 14, "la campagne métiers doit conserver ses 14 portraits originaux");
  const professionImageHashes = await Promise.all(professionImages.map(async (publicPath) => {
    assert.match(publicPath, /\.webp$/, "la campagne métiers doit rester optimisée en WebP");
    const bytes = await readFile(new URL(`../../public${publicPath}`, import.meta.url));
    assert.ok(bytes.byteLength > 40_000, `portrait métier anormalement léger : ${publicPath}`);
    return createHash("sha256").update(bytes).digest("hex");
  }));
  assert.equal(
    new Set(professionImageHashes).size,
    professionImageHashes.length,
    "chaque métier de la campagne doit conserver une photographie distincte",
  );
  assert.equal(
    tremplinArtists.filter((artist) => artist.project).length,
    14,
    "les 14 nouveaux profils doivent publier leur feuille de route vérifiable",
  );
  assert.ok(
    tremplinArtists.filter((artist) => artist.isAiArtist).length >= 10,
    "la sélection doit contenir plusieurs Artistes IA clairement identifiés",
  );

  for (const artist of tremplinArtists) {
    assert.ok(artist.artwork.startsWith("/"));
    assert.ok(artist.community.memberCount > 0);
    assert.ok(artist.community.newMembers30Days >= 0);
    assert.ok(artist.metrics.some((metric) => metric.family === "communaute"));
    assert.ok(artist.metrics.every((metric) => metric.family !== "soutien"));
    if (artist.project) {
      assert.ok(artist.project.progressPercent >= 0 && artist.project.progressPercent <= 100);
      assert.ok(artist.project.nextMilestone.length > 0);
      assert.ok(artist.project.supportNeed.length > 0);
      assert.ok(artist.project.proofPoints.length >= 3);
    }
    assert.equal("support" in artist, false);
    assert.equal("rewards" in artist, false);
  }

  for (const token of tremplinArtistTokens) {
    assert.equal(getTremplinArtistToken(token.artistId), token);
    assert.equal(token.currency, "EUR");
    assert.ok(token.tokenName.startsWith("Jeton "));
    assert.match(token.symbol, /^[A-Z0-9]{3,8}$/);
    assert.ok(token.currentValueEur > 0);
    assert.ok(token.holderCount > 0);
    assert.ok(token.circulatingSupply > 0);
    assert.ok(token.activity.purchases7d >= 0);
    assert.ok(token.activity.resales7d >= 0);
    assert.ok(token.activity.purchaseVolume7dEur >= 0);
    assert.ok(token.activity.resaleVolume7dEur >= 0);
    assert.ok(Number.isFinite(Date.parse(token.admittedAt)));
    assert.ok(Date.parse(token.admittedAt) <= Date.UTC(2026, 6, 20));
    assert.match(token.nextRoom.startsAt, /^2026-/);
    assert.ok(Date.parse(token.nextRoom.startsAt) > Date.UTC(2026, 6, 26), `${token.symbol} doit annoncer une Room réellement à venir`);
    assert.ok(token.nextRoom.title.length > 0);

    const position = token.userPosition;
    almostEqual(position.estimatedValueEur, position.quantity * token.currentValueEur, 0.011);
    almostEqual(
      position.ownershipSharePercent,
      (position.quantity / token.circulatingSupply) * 100,
      0.0001,
    );
    assert.ok(position.initialAmountEur >= 0);
    assert.ok(position.ownershipSharePercent <= 5);
    if (position.acquiredAt) assert.ok(Number.isFinite(Date.parse(position.acquiredAt)));
  }
});

test("chaque jeton expose les six périodes et une tendance textuelle accessible", () => {
  assert.deepEqual(TREMPLIN_TOKEN_PERIODS, ["24h", "7d", "30d", "3m", "1y", "all"]);

  const allowedTrendTexts = new Set([
    "Valeur en hausse sur 7 jours",
    "Valeur en baisse sur 7 jours",
    "Stable sur 7 jours",
  ]);

  for (const token of tremplinArtistTokens) {
    assert.ok(allowedTrendTexts.has(token.trend7d.text));
    assert.ok(["up", "down", "stable"].includes(token.trend7d.direction));
    const sevenDayHistory = token.valueHistory["7d"];
    const sevenDayChange = ((sevenDayHistory.at(-1).valueEur - sevenDayHistory[0].valueEur) / sevenDayHistory[0].valueEur) * 100;
    const expectedDirection = sevenDayChange > 0.35 ? "up" : sevenDayChange < -0.35 ? "down" : "stable";
    assert.equal(token.trend7d.direction, expectedDirection, `${token.symbol} doit raconter la même tendance dans ses données et son libellé`);
    almostEqual(sevenDayChange, token.trend7d.changePercent, 0.08, `${token.symbol} doit conserver un pourcentage 7 jours exact`);

    for (const period of TREMPLIN_TOKEN_PERIODS) {
      const history = token.valueHistory[period];
      assert.ok(history.length >= 10, `${token.symbol}/${period} doit avoir une courbe exploitable`);
      assert.equal(history.at(-1).valueEur, token.currentValueEur);
      assert.equal(new Set(history.map((point) => point.label)).size, history.length, `${token.symbol}/${period} ne doit pas répéter des libellés temporels ambigus`);
      for (const point of history) {
        assert.ok(Number.isFinite(point.valueEur) && point.valueEur > 0);
        assert.doesNotThrow(() => new Date(point.timestamp).toISOString());
        if (point.event) {
          assert.ok(["purchase", "resale"].includes(point.event.type));
          assert.ok(point.event.amountEur > 0);
        }
      }
    }
  }
});

test("la configuration financière est centralisée, versionnée et autoritaire côté serveur", () => {
  const config = TREMPLIN_PLATFORM_CONFIG;
  assert.equal(config.currency, "EUR");
  assert.equal(config.serverAuthoritative, true);
  assert.equal(config.kycRequired, true);
  assert.equal(config.maximumOwnershipBps, 500);
  assert.ok(config.version.length > 0);
  assert.ok(config.rapidExitWindowHours > 0);

  for (const value of Object.values(config.feesBps)) {
    assert.ok(Number.isFinite(value) && value >= 0);
  }
  assert.equal(config.distributionsBps.artistOnPurchase, 2_000, "20 % du montant d’achat reviennent directement à l’artiste");
  assert.ok(config.distributionsBps.reserveOnPurchase >= 0);
});

test("la simulation d’achat calcule en euros quantité, frais, répartitions et nouvelle part", () => {
  const token = getTremplinArtistToken("lunae");
  assert.ok(token);

  const quote = simulateBondingCurvePurchase({ token, amountEur: 50 });
  assert.equal(quote.operation, "purchase");
  assert.equal(quote.currency, "EUR");
  assert.equal(quote.amountPaidEur, 50);
  assert.equal(quote.eligible, true);
  assert.equal(quote.quoteOnly, true);
  assert.equal(quote.requiresServerConfirmation, true);
  assert.ok(quote.estimatedTokenQuantity > 0);
  assert.ok(quote.priceAfterEur > quote.priceBeforeEur);
  assert.ok(quote.supplyAfter > quote.supplyBefore);
  assert.ok(quote.userQuantityAfter > quote.userQuantityBefore);
  assert.ok(quote.ownershipShareAfterPercent > quote.ownershipShareBeforePercent);
  assert.ok(quote.ownershipShareAfterPercent <= quote.maximumOwnershipPercent);

  const feeTotal = quote.feeLines.reduce((total, line) => total + line.amountEur, 0);
  const distributionTotal = quote.distributionLines.reduce(
    (total, line) => total + line.amountEur,
    0,
  );
  almostEqual(quote.totalFeesEur, feeTotal, 0.01);
  almostEqual(quote.amountPaidEur, quote.totalFeesEur + distributionTotal, 0.01);
  assert.deepEqual(quote.feeLines.map((line) => line.label), ["Commission Meeway", "Frais techniques"]);
  assert.ok(quote.artistAmountEur > 0);
  almostEqual(quote.artistAmountEur, 10, 0.01);
  assert.ok(quote.reserveAmountEur > 0);
  assert.match(quote.warnings.join(" "), /monter ou descendre|recalculée par le serveur/i);
});

test("l’achat est bloqué sans KYC ou lorsqu’il dépasserait la limite de 5 %", () => {
  const token = getTremplinArtistToken("lunae");
  assert.ok(token);

  const withoutKyc = simulateBondingCurvePurchase({
    token,
    amountEur: 25,
    kycStatus: "missing",
  });
  assert.equal(withoutKyc.eligible, false);
  assert.match(withoutKyc.blockedReasons.join(" "), /vérification d'identité/i);

  const atLimit = simulateBondingCurvePurchase({
    token,
    amountEur: 10,
    currentUserQuantity: token.circulatingSupply * 0.05,
  });
  assert.equal(atLimit.eligible, false);
  assert.ok(atLimit.ownershipShareAfterPercent > 5);
  assert.match(atLimit.blockedReasons.join(" "), /limite de 5 %/i);
});

test("les simulations rejettent les nombres non finis et les configurations incohérentes", () => {
  const token = getTremplinArtistToken("lunae");
  assert.ok(token);

  for (const amountEur of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const quote = simulateBondingCurvePurchase({ token, amountEur });
    assert.equal(quote.eligible, false);
    assert.ok(Number.isFinite(quote.amountPaidEur));
    assert.ok(Number.isFinite(quote.estimatedTokenQuantity));
    assert.match(quote.blockedReasons.join(" "), /nombre fini/i);
  }

  for (const quantity of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const quote = simulateBondingCurveResale({ token, quantity });
    assert.equal(quote.eligible, false);
    assert.ok(Number.isFinite(quote.quantityResold));
    assert.ok(Number.isFinite(quote.netAmountEur));
    assert.match(quote.blockedReasons.join(" "), /nombre fini/i);
  }

  const invalidConfig = {
    ...TREMPLIN_PLATFORM_CONFIG,
    version: "invalid-test",
    feesBps: {
      ...TREMPLIN_PLATFORM_CONFIG.feesBps,
      purchase: 9_800,
      technical: 500,
    },
  };
  const invalidQuote = simulateBondingCurvePurchase({ token, amountEur: 50, config: invalidConfig });
  assert.equal(invalidQuote.eligible, false);
  assert.match(invalidQuote.blockedReasons.join(" "), /configuration financière/i);
});

test("la simulation de revente baisse la courbe, calcule le net et interdit la vente à découvert", () => {
  const token = getTremplinArtistToken("lunae");
  assert.ok(token && token.userPosition.quantity >= 10);

  const quote = simulateBondingCurveResale({ token, quantity: 10 });
  assert.equal(quote.operation, "resale");
  assert.equal(quote.eligible, true);
  assert.equal(quote.quantityResold, 10);
  assert.ok(quote.priceAfterEur < quote.priceBeforeEur);
  assert.ok(quote.supplyAfter < quote.supplyBefore);
  assert.ok(quote.userQuantityAfter < quote.userQuantityBefore);
  assert.ok(quote.feeLines.some((line) => line.label === "Frais de revente Meeway"));
  almostEqual(
    quote.netAmountEur,
    quote.estimatedValueBeforeFeesEur - quote.totalFeesEur,
    0.01,
  );

  const rapidExit = simulateBondingCurveResale({ token, quantity: 5, rapidExit: true });
  assert.equal(rapidExit.eligible, true);
  assert.ok(rapidExit.feeLines.some((line) => line.id === "rapid-exit"));
  assert.match(rapidExit.warnings.join(" "), /frais importants/i);

  const shortSale = simulateBondingCurveResale({
    token,
    quantity: token.userPosition.quantity + 1,
  });
  assert.equal(shortSale.eligible, false);
  assert.match(shortSale.blockedReasons.join(" "), /plus de jetons que tu n’en détiens/i);

  const withoutKyc = simulateBondingCurveResale({ token, quantity: 1, kycStatus: "pending" });
  assert.equal(withoutKyc.eligible, false);
  assert.match(withoutKyc.blockedReasons.join(" "), /vérification d'identité/i);
});

test("l’historique couvre tous les états et toutes les données de traçabilité", () => {
  const expectedStatuses = new Set([
    "pending",
    "confirmed",
    "failed",
    "cancelled",
    "refunded",
    "blocked-for-verification",
  ]);
  assert.deepEqual(new Set(Object.keys(TREMPLIN_TRANSACTION_STATUS_LABELS)), expectedStatuses);
  assert.deepEqual(new Set(tremplinMockTransactions.map((item) => item.status)), expectedStatuses);

  for (const item of tremplinMockTransactions) {
    assert.ok(getTremplinArtistToken(item.artistId));
    assert.ok(["purchase", "resale"].includes(item.operation));
    assert.ok(item.transactionReference.startsWith("MW-TRE-"));
    assert.equal(item.statusLabel, TREMPLIN_TRANSACTION_STATUS_LABELS[item.status]);
    assert.ok(item.amountEur > 0);
    assert.ok(item.tokenQuantity > 0);
    assert.ok(item.averagePriceEur > 0);
    assert.ok(item.feesEur >= 0);
    assert.ok(item.netAmountEur >= 0);
    if (item.receiptReference) assert.ok(item.receiptReference.startsWith("RC-TRE-"));
  }
});
