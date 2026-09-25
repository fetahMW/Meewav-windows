import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/features/tremplin/", import.meta.url);
const read = (name) => readFile(new URL(name, sourceRoot), "utf8");

test("les cartes résument le jeton actif et gardent le graphe détaillé dans le profil", async () => {
  const [home, analytics, page, tokenPageCss, workspace, education, flow] = await Promise.all([
    read("TremplinHomeExperience.tsx"),
    read("TremplinArtistAnalytics.tsx"),
    read("TremplinPage.tsx"),
    read("tremplin-token-page.css"),
    read("TremplinTokenWorkspace.tsx"),
    read("TremplinTokenEducation.tsx"),
    read("TremplinTokenFlow.tsx"),
  ]);

  const card = home.slice(
    home.search(/function\s+TalentCard\b/),
    home.search(/function\s+TalentRail\b/),
  );

  assert.match(card, /tremplin-home-card__visual/);
  assert.match(card, /tremplin-home-card__project/);
  assert.match(card, /tremplin-home-card__actions/);
  assert.match(card, /tremplin-home-card__body/);
  assert.match(card, /tremplin-home-card__name/);
  assert.match(card, /const projectDescription = \[[\s\S]*?recentProof,[\s\S]*?project\.nextMilestone[\s\S]*?\.find\(\(candidate\) => candidate && normalize\(candidate\) !== normalize\(project\.headline\)\) \?\? null/);
  assert.match(card, /projectDescription \? <p>\{projectDescription\}<\/p> : null/);
  assert.match(card, /tremplin-home-card__token-summary/);
  assert.match(card, /tokenUi\.showPrice\s*&&\s*entry\.token/);
  assert.match(card, /TremplinTokenChange24h/);
  assert.match(card, /aria-label=\{followed \? `Ne plus suivre/);
  assert.match(card, /formatTremplinTokenPrice|currentValueEur|onOpenStatistics/);
  assert.match(card, /Voir le profil/);
  assert.doesNotMatch(card, /Évolution du jeton sur 7 jours|trend7d/);
  assert.doesNotMatch(card, /tremplin-home-card__(?:signature|moment|audience|support|progression|token-state|token-quote)/);
  assert.doesNotMatch(card, /formatSignedPercent|token24HourChange|placesDelta/);
  assert.doesNotMatch(card, /tremplin-home-card__(?:reason|proof|signals)/);
  assert.doesNotMatch(home, /tremplin-home-card__spark-area|tremplin-home-card__spark-line/);
  assert.doesNotMatch(home, /tremplin-home-detail__chart-baseline|tremplin-home-detail__chart-current/);
  assert.match(home, /Son parcours en ce moment/);

  assert.match(analytics, /tremplin-artist-analytics__chart-baseline/);
  assert.match(analytics, /tremplin-artist-analytics__chart-current/);
  assert.match(analytics, /cohérence de période contrôlée/);

  assert.match(page, /tremplin-token-value-chart__grid/);
  assert.match(page, /tremplin-token-value-chart__baseline/);
  assert.match(page, /tremplin-token-value-chart__halo/);
  assert.match(page, /Lecture neutre/);
  assert.match(page, /<table className="tremplin-visually-hidden"/);
  assert.match(page, /onPointerMove=/);
  assert.match(page, /pinnedPointIndices/);
  assert.match(page, /tremplin-token-value-chart__crosshair/);
  assert.match(page, /aria-pressed=\{pinnedPointIndices\.includes\(pointIndex\)\}/);
  assert.match(page, /Survolez pour consulter une date/);
  assert.match(page, /PUBLIC_TOKEN_PERIODS[\s\S]*?"30d"[\s\S]*?"3m"[\s\S]*?"1y"[\s\S]*?"all"/);
  assert.doesNotMatch(page, /TREMPLIN_TOKEN_PERIODS\.map/);
  assert.match(tokenPageCss, /\.tremplin-token-value-chart__crosshair/);
  assert.match(tokenPageCss, /\.tremplin-token-value-chart__point/);
  assert.match(tokenPageCss, /\.tremplin-token-value-chart__active-point\.is-pinned/);

  assert.match(workspace, /ttw-chart-baseline/);
  assert.match(workspace, /ttw-chart-halo/);
  assert.match(workspace, /Lecture de la période/);

  assert.match(education, /tremplin-curve-explainer__grid/);
  assert.match(education, /curve-line/);
  assert.match(education, /Achat : la valeur peut augmenter/);
  assert.match(education, /Revente : la valeur peut diminuer/);

  assert.doesNotMatch(flow, /tremplin-token-flow__curve-grid|tremplin-token-flow__curve-area|className="is-before"|className="is-after"/);
  assert.match(flow, /Détails du mécanisme de calcul de la valeur/);
  assert.match(flow, /cette estimation neutre varie selon l’ensemble des achats et des reventes/);
});

test("le jeton utilise partout la signature officielle MW", async () => {
  const [icon, signature, publicHome, home, page, workspace, education, flow] = await Promise.all([
    read("MeewavTokenIcon.tsx"),
    read("../../assets/signature-mw.svg"),
    read("TremplinPublicHome.tsx"),
    read("TremplinHomeExperience.tsx"),
    read("TremplinPage.tsx"),
    read("TremplinTokenWorkspace.tsx"),
    read("TremplinTokenEducation.tsx"),
    read("TremplinTokenFlow.tsx"),
  ]);
  const tokenSurfaces = [publicHome, home, page, workspace, education, flow].join("\n");
  const tokenIconUsages = tokenSurfaces.match(/<MeewavTokenIcon/g) ?? [];

  assert.match(icon, /signature-mw\.svg/);
  assert.match(icon, /href=\{signatureMarkSrc\}/);
  assert.match(icon, /double biseau violet et d'une face obsidienne/);
  assert.match(icon, /radialGradient/);
  assert.match(icon, /outer-rim/);
  assert.match(icon, /inner-rim/);
  assert.match(icon, /feDropShadow/);
  assert.match(signature, /viewBox="0 0 31 19"/);
  assert.match(signature, /<path/);
  assert.match(education, /<MeewavTokenIcon[\s\S]*?className="tremplin-how__mw-premium-coin"/);
  assert.doesNotMatch(education, /mw-token-premium-reference/);
  assert.ok(tokenIconUsages.length >= 20, `attendu au moins 20 usages du jeton officiel, reçu ${tokenIconUsages.length}`);
  assert.doesNotMatch(publicHome, /WalletCards/);
  assert.doesNotMatch(tokenSurfaces, /CircleDollarSign/);
  assert.doesNotMatch(tokenSurfaces, /<Coins/);
});
