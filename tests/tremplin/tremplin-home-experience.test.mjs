import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { tremplinArtists } from "../../src/features/tremplin/tremplinArtistData.ts";
import {
  artistMatchesTremplinRole,
  findTremplinRoleProfile,
  getTremplinProfessionLabel,
  getTremplinRoleProfile,
  TREMPLIN_PRIMARY_FAMILY_MINIMUM,
  TREMPLIN_ROLE_FAMILIES,
  TREMPLIN_ROLE_PROFILES,
} from "../../src/features/tremplin/tremplinRoleData.ts";

const sourceRoot = new URL("../../src/", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlock(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `bloc introuvable : ${startPattern}`);
  const remainder = source.slice(start);
  const end = remainder.search(endPattern);
  assert.notEqual(end, -1, `fin de bloc introuvable : ${endPattern}`);
  return remainder.slice(0, end);
}

function extractCssRule(css, selector) {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `règle CSS introuvable : ${selector}`);
  return match[1];
}

function extractCssRules(css, selector) {
  const matches = [...css.matchAll(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "g"))];
  assert.ok(matches.length > 0, `règle CSS introuvable : ${selector}`);
  return matches.map((match) => match[1]).join("\n");
}

function mediaBlocks(css) {
  const matches = [...css.matchAll(/@media\s*\((?:max-width|width\s*<\s*)[^)]*\)\s*\{/g)];
  return matches.map((match, index) => css.slice(match.index, matches[index + 1]?.index ?? css.length));
}

test("la page branche une seule expérience Accueil Tremplin isolée", async () => {
  const [page, home] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
  ]);

  assert.match(page, /import\s+TremplinHomeExperience(?:\s*,\s*\{[\s\S]*?\})?\s+from\s+["']\.\/TremplinHomeExperience["']/);
  assert.equal((page.match(/<TremplinHomeExperience\b/g) ?? []).length, 1);
  assert.match(home, /export\s+default\s+function\s+TremplinHomeExperience\b/);
  assert.match(home, /import\s+["']\.\/tremplin-home-experience\.css["']/);
});

test("Découvrir ouvre sur des projets et leur état réel sans classement financier", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const rails = extractBlock(home, /function\s+buildRails\b/, /function\s+HeroProjectCard\b/);
  const titles = [...rails.matchAll(/title:\s*["']([^"']+)["']/g)].map((match) => match[1]);

  assert.deepEqual(titles, [
    "Projets et jetons de talent à découvrir",
    "À découvrir aussi",
    "Premiers projets sur MeeWav",
    "Profils à explorer",
    "Projets en mouvement",
    "Prochaines Rooms",
    "Explorer les scènes locales",
    "Univers à explorer",
  ]);
  assert.match(home, /visibleRails\.map\(\(rail\)\s*=>\s*\(\s*<TalentRail/);
  assert.match(home, /className="tremplin-home-discovery__hero"/);
  assert.match(home, /className="tremplin-home-discovery__finder"/);
  assert.doesNotMatch(home, /Repère le talent avant tout le monde\.|Découvre les talents musicaux qui émergent aujourd’hui/);
  assert.doesNotMatch(home, /className="tremplin-home-discovery__(?:hero-copy|actions|trust)"/);
  assert.doesNotMatch(home, /Un système conçu pour soutenir sur la durée|Comprendre les protections|TREMPLIN_TRUST_PROMISES/);
  assert.match(home, /rail\.id === "weekly" \? " is-featured"/);
  assert.match(rails, /eyebrow:\s*"Sélection MeeWav",\s*title:\s*"Projets et jetons de talent à découvrir",\s*description:\s*"Consulte les projets mis en avant, leur grade et l’état réel de leur jeton de talent\."/);
  assert.match(home, /const rails = useMemo\(\(\) => buildRails\(catalog\), \[catalog\]\)/);
  assert.doesNotMatch(rails, /jeton progresse|currentValueEur|trend7d|holderCount|resaleVolume|purchaseVolume/);
  assert.doesNotMatch(home, /buildTremplinRanking|TremplinRankingPeriod/);
  assert.match(home, /isPublicTremplinTalent/);
  assert.doesNotMatch(rails, /Danse & performance|id:\s*"performance"/);
  assert.doesNotMatch(home, /tremplin-home-discovery__portraits|tremplin-home-discovery__proofs/);
  assert.doesNotMatch(home, /Explore les 28 métiers du Tremplin|tremplin-home-roles/);
  assert.match(rails, /const\s+usedArtistIds\s*=\s*new Set<string>\(\)/);
  assert.equal((rails.match(/entries:\s*takeUnseen\(/g) ?? []).length, 8, "les huit rails doivent partager le même registre anti-doublon");
  assert.doesNotMatch(home, /tremplin-leaderboard|tremplin-list-detail|Classements Tremplin/);
});

test("la sélection principale est une grille de quatre fiches et les autres rails restent navigables", async () => {
  const [home, css] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/tremplin-home-experience.css"),
  ]);
  const rail = extractBlock(home, /function\s+TalentRail\b/, /export\s+default\s+function/);

  assert.match(rail, /className="tremplin-home-rail__more"[\s\S]*?Voir tous les projets/);
  assert.match(rail, /rail\.id === "weekly"\s*\?\s*<div className="tremplin-project-grid"/);
  assert.match(rail, /rail\.entries\.slice\(0,\s*4\)\.map/);
  assert.match(rail, /aria-label="Projets sélectionnés par MeeWav"/);
  assert.match(rail, /className="tremplin-home-rail__header-nav"[\s\S]*?ChevronLeft[\s\S]*?ChevronRight/);
  assert.doesNotMatch(rail, /className="tremplin-home-rail__nav"/);
  assert.match(rail, /data-tremplin-magnetic-rail/);
  assert.match(home, /useLayoutEffect/);
  assert.match(rail, /const\s+loopedEntries\s*=\s*useMemo/);
  assert.match(rail, /loopedEntries\.map\(/);
  assert.match(rail, /data-tremplin-looping="true"/);
  assert.match(rail, /data-tremplin-loop-clone=/);
  assert.match(rail, /onScroll=\{updateActiveCard\}/);
  assert.match(rail, /aria-hidden=\{isLoopClone \|\| undefined\}/);
  assert.match(rail, /inert=\{isLoopClone \|\| undefined\}/);
  assert.match(rail, /key=\{renderKey\}/);
  assert.match(rail, /viewport\.scrollBy\(\{\s*left:\s*direction\s*\*\s*Math\.max\(220,\s*viewport\.clientWidth\s*\*\s*0\.82\),\s*behavior:\s*["']smooth["']/s);
  assert.match(rail, /data-tremplin-entry-index=\{entryIndex\}/);
  assert.match(rail, /data-tremplin-loop-copy=\{loopCopy\}/);
  assert.match(rail, /nearest\.dataset\.tremplinLoopCopy\s*===\s*["']original["']/);
  assert.match(rail, /instanceId=\{renderKey\}/);
  assert.match(rail, /controlsTabIndex=\{isLoopClone\s*\?\s*-1/);

  const viewport = extractCssRule(css, ".tremplin-home-rail__viewport");
  assert.match(viewport, /overflow-x:\s*auto/);
  assert.match(viewport, /scroll-snap-type:\s*x\s+(?:mandatory|proximity)/);
  const snapWrapper = extractCssRule(css, ".tremplin-home-rail__track > div");
  assert.match(snapWrapper, /scroll-snap-align:\s*start/);
  assert.match(snapWrapper, /scroll-snap-stop:\s*normal/);
  assert.match(css, /\.tremplin-project-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test("les cartes placent le projet avant le statut et rendent les destinations explicites", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const card = extractBlock(home, /function\s+HeroProjectCard\b/, /function\s+TalentRail\b/);
  const badge = extractBlock(home, /function\s+getTalentCardBadge\b/, /function\s+getTalentLatestProgression\b/);
  const visual = extractBlock(card, /className="tremplin-home-card__visual"/, /<div className="tremplin-home-card__body"/);
  const body = extractBlock(card, /<div className="tremplin-home-card__body"/, /<footer\s+className="tremplin-home-card__actions"/);

  assert.match(home, /import\s*\{[\s\S]*?getTremplinTokenLifecycleStage[\s\S]*?\}\s*from\s*["']\.\/tremplinProductModel["']/);
  assert.match(card, /<img\s+[\s\S]*?src=\{entry\.artist\.artwork\}/);
  assert.match(body, /className="tremplin-home-card__name"[\s\S]*?<strong\s+id=\{headingId\}>\{entry\.artist\.name\}<\/strong>/);
  assert.match(card, /const metadata = \[cleanedProfessionLabel, entry\.artist\.styles\[0\], entry\.artist\.city\]/);
  assert.match(card, /const artisticMetadata = metadata\.slice\(0, -1\)/);
  assert.match(card, /const locationMetadata = metadata\[metadata\.length - 1\]/);
  assert.match(card, /project\.nextMilestone \? `Prochaine étape : \$\{project\.nextMilestone\}` : null/);
  assert.match(body, /tremplin-home-card__identity-meta[\s\S]*?artisticMetadata\.join\(" · "\)[\s\S]*?locationMetadata/);
  assert.match(body, /tremplin-home-card__project[\s\S]*?Projet actuel[\s\S]*?\{project\.headline\}[\s\S]*?projectDescription \? <p>\{projectDescription\}<\/p> : null/);
  assert.match(body, /tremplin-home-card__grade[\s\S]*?Niveau \{entry\.artist\.gradeLevel\}/);
  assert.match(card, /tremplin-home-card__token-summary/);
  assert.match(card, /TREMPLIN_DISCOVERY_TOKEN_UI\[tokenStage\]/);
  assert.match(card, /tokenUi\.showPrice\s*&&\s*entry\.token/);
  assert.match(card, /formatTremplinTokenPrice\(entry\.token\.currentValueEur\)/);
  assert.match(card, /TremplinTokenChange24h\s+value=\{token24h\.changePercent\}/);
  assert.equal((card.match(/className="tremplin-home-card__rank"/g) ?? []).length, 1, "une carte ne doit rendre qu’un seul badge");
  assert.match(badge, /if \(railId === "weekly"\) return null/);
  for (const usefulBadge of ["Nouveau parcours", "Parcours documenté", "En mouvement", "Room bientôt"]) {
    assert.match(badge, new RegExp(usefulBadge));
  }
  assert.doesNotMatch(badge, /Sélection MeeWav|Performance à découvrir|Talent de la semaine|Choix MeeWav|Nouveau projet|À écouter/);
  assert.doesNotMatch(visual, /weekly-rank|TOP 10|Numéro \$\{entry\.rank\}/);
  assert.match(card, /className="tremplin-home-card__media-open"[\s\S]*?onClick=\{onOpen\}/);
  assert.match(card, /className="tremplin-home-card__profile"[\s\S]*?Voir le profil/);
  assert.match(card, /className="tremplin-home-card__audio-overlay"[\s\S]*?aria-pressed=\{playing\}/);
  assert.match(card, /className=\{`tremplin-home-card__follow\$\{followed \? " is-followed" : ""\}`\}[\s\S]*?aria-label=\{followed \? `Ne plus suivre[\s\S]*?aria-pressed=\{followed\}/);
  assert.equal((card.match(/aria-pressed=\{playing\}/g) ?? []).length, 1, "un seul contrôle audio doit être focusable");
  assert.doesNotMatch(card, /tremplin-home-card__audio-orb|tremplin-home-card__play/);
  assert.match(card, /className="tremplin-home-card__stats"[\s\S]*?aria-label=\{`Voir les statistiques[\s\S]*?<ChartNoAxesCombined[\s\S]*?Statistiques<\/button>/);
  assert.match(card, /className="tremplin-home-card__primary"[\s\S]*?tokenStage === "active" \? <MeewavTokenIcon \/> : null[\s\S]*?tokenUi\.primaryAction/);
  assert.match(card, /playing\s*\?\s*<Pause[\s\S]*?:\s*<Play/);
  assert.doesNotMatch(card, /tremplin-home-card__(?:open|signature|moment|audience|cta|progression|token-state|token-quote)/);
  assert.doesNotMatch(card, /personnes suivent|Parcours vérifié|formatSignedPercent|placesDelta/);
});

test("les fiches Tremplin sont horizontales, compactes et leurs actions restent lisibles", async () => {
  const [home, css] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/tremplin-home-experience.css"),
  ]);
  const card = extractBlock(home, /function\s+HeroProjectCard\b/, /function\s+TalentRail\b/);
  const cardSizingRules = [...css.matchAll(/[^{}]*\.tremplin-home-card[^{}]*\{[^}]*\}/g)]
    .map((match) => match[0])
    .join("\n");

  assert.match(css, /--tremplin-rail-card-width:\s*clamp\(560px,\s*45vw,\s*680px\)/);
  assert.doesNotMatch(css, /--tremplin-rail-featured-width|is-weekly-lead|is-weekly-feature|tremplin-home-card__audio-orb|tremplin-home-card__play/);
  assert.doesNotMatch(home, /is-weekly-lead|is-weekly-feature/);
  assert.match(css, /\.tremplin-home-card__follow\s*\{/);
  assert.match(css, /\.tremplin-home-card__audio-overlay\s*\{/);
  assert.match(card, /formatTremplinTokenPrice|currentValueEur/);
  assert.match(css, /\.tremplin-home-card,[\s\S]*?grid-template-columns:\s*clamp\(210px,\s*30%,\s*260px\)\s+minmax\(0,\s*1fr\)[\s\S]*?min-height:\s*270px;[\s\S]*?height:\s*auto;/);
  assert.match(css, /\.tremplin-home-card__visual,[\s\S]*?grid-row:\s*1\s*\/\s*-1/);
  assert.match(css, /\.tremplin-home-card__actions,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s+minmax\(140px,\s*0\.75fr\)/);
  assert.match(css, /\.tremplin-home-card__actions button\s*\{[^}]*width:\s*100%[^}]*min-height:\s*48px[^}]*text-overflow:\s*clip[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.tremplin-home-card__stats\s*\{[^}]*min-width:\s*140px/s);
  assert.match(css, /\.tremplin-home-card__stats svg\s*\{[^}]*color:\s*#68d6aa/s);
  assert.match(css, /\.tremplin-home-card:not\(\[data-token-stage="active"\]\)[\s\S]*?min-height:\s*250px/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.tremplin-home-card,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*?\.tremplin-home-card__visual,[\s\S]*?aspect-ratio:\s*16\s*\/\s*10[\s\S]*?\.tremplin-home-card__actions,[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /border-radius:\s*22px/);
  assert.doesNotMatch(cardSizingRules, /\bheight:\s*(?:486|500)px/);
  assert.match(css, /\.tremplin-home-card__primary,[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.tremplin-home-card__actions button\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.doesNotMatch(home, /tremplin-home-card__spark-line|tremplin-home-card__spark-area/);
});

test("les rails artistiques restent indépendants et la sélection utilise des faits de parcours", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const score = extractBlock(home, /function\s+getArtisticMomentumScore\b/, /function\s+buildRails\b/);
  const rails = extractBlock(home, /function\s+buildRails\b/, /function\s+HeroProjectCard\b/);

  assert.match(score, /artist\.metrics\.length/);
  assert.match(score, /artist\.updates\.length/);
  assert.match(score, /project\?\.proofPoints\.length/);
  assert.match(score, /stableHash\(artist\.id\)/);
  assert.match(score, /function\s+getArtisticMomentumScore\(artist:\s*TremplinArtist\)/);
  assert.doesNotMatch(score, /artist\.community|artist\.gradeLevel|\btoken\b|currentValueEur|holderCount|purchase|resale|financial/i);
  assert.match(rails, /getArtisticMomentumScore/);
  const weeklyRanking = rails.match(/const weeklyRanking\s*=\s*[^;]+;/)?.[0] ?? "";
  assert.match(weeklyRanking, /editorialSelection/);
  assert.match(weeklyRanking, /stableHash/);
  assert.doesNotMatch(weeklyRanking, /getArtisticMomentumScore|community|gradeLevel|token|currentValueEur/i);
  assert.match(rails, /entries:\s*takeUnseen\(weeklyRanking, 10\)/);
  assert.doesNotMatch(rails, /\.token\.valueHistory|currentValueEur|placesDelta/);
  assert.doesNotMatch(home, /buildTremplinRanking|holderCount|trend7d/);
});

test("la fiche artiste réserve le prix, le graphe et tous les CTA de transaction aux jetons actifs", async () => {
  const page = await readSource("features/tremplin/TremplinPage.tsx");
  const artistDetail = extractBlock(page, /function\s+ArtistDetail\b/, /function\s+MyArtistsView\b/);
  const disclosureStart = artistDetail.search(/<details\s+id="profile-support"/);
  const activeStart = artistDetail.search(/\{isTokenActive\s*\?\s*<div\s+className="tremplin-token-artist__support-content"/);
  const inactiveStart = artistDetail.search(/:\s*<section\s+className="tremplin-token-artist__token-section"\s+data-token-stage=\{tokenLifecycleStage\}/);

  assert.notEqual(disclosureStart, -1, "l’espace du jeton de talent doit être volontaire et replié");
  assert.notEqual(activeStart, -1, "la branche du jeton actif doit exister");
  assert.notEqual(inactiveStart, -1, "la branche du jeton non actif doit exister");

  const activeBranch = artistDetail.slice(activeStart, inactiveStart);
  const inactiveBranch = artistDetail.slice(inactiveStart);

  assert.match(artistDetail, /const\s+tokenLifecycleStage\s*=\s*getTremplinTokenLifecycleStage\(artist\)/);
  assert.match(artistDetail, /const\s+isTokenActive\s*=\s*tokenLifecycleStage\s*===\s*["']active["']/);
  assert.match(activeBranch, /<TokenValueChart\s+token=\{token\}\s*\/>/);
  assert.match(activeBranch, /tremplin-token-artist__value-history/);
  assert.match(activeBranch, /formatCurrency\(token\.currentValueEur\)/);
  assert.equal(
    (activeBranch.match(/onTrade\(["'](?:buy|sell)["']\)/g) ?? []).length,
    4,
    "les deux paires de CTA achat/revente doivent rester dans la branche active",
  );

  assert.match(inactiveBranch, /data-token-stage=\{tokenLifecycleStage\}/);
  assert.match(inactiveBranch, /Aucun prix ni achat n’est affiché avant l’activation officielle du jeton/);
  assert.doesNotMatch(
    inactiveBranch,
    /TokenValueChart|currentValueEur|formatCurrency\(|onTrade\(["'](?:buy|sell)["']\)|Valeur actuelle|Soutenir ce talent|Gérer ma sortie/,
  );
});

test("le profil expose le résumé du jeton dans son premier écran sans bouton La Scène", async () => {
  const page = await readSource("features/tremplin/TremplinPage.tsx");
  const artistDetail = extractBlock(page, /function\s+ArtistDetail\b/, /function\s+MyArtistsView\b/);
  const hero = extractBlock(artistDetail, /<section id="profile-overview"/, /<nav className="tremplin-token-artist__section-nav"/);

  assert.match(hero, /tremplin-token-artist__hero-token/);
  assert.match(hero, /tokenDiscoveryUi\.label/);
  assert.match(hero, /isTokenActive[\s\S]*?Valeur actuelle[\s\S]*?TremplinTokenChange24h/);
  assert.match(hero, /Voir le jeton[\s\S]*?Statistiques/);
  assert.match(hero, /Aucun prix n’est affiché avant l’activation/);
  assert.match(hero, /Suivre gratuitement[\s\S]*?Voir son projet/);
  assert.doesNotMatch(artistDetail, /Ouvrir La Scène/);
  assert.match(artistDetail, /id="profile-token-statistics"[\s\S]*?Consulter les statistiques du jeton/);
});

test("le premier rail expose une sélection éditoriale sans classement financier", async () => {
  const [home, css] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/tremplin-home-experience.css"),
  ]);

  assert.doesNotMatch(home, /podiumRank|is-podium is-rank/);
  assert.match(home, /Projets et jetons de talent à découvrir/);
  assert.match(home, /Consulte les projets mis en avant, leur grade et l’état réel de leur jeton de talent\./);
  assert.doesNotMatch(home, /const weeklyCatalog|buildRails\(catalog, weeklyCatalog\)|jeton progresse le plus/);
  assert.match(home, /buildRails\(catalog\)/);
  assert.doesNotMatch(home, /Talent de la semaine|Choix MeeWav|is-weekly-lead|is-weekly-feature/);
  assert.doesNotMatch(home, /getTalentCardSignature|tremplin-home-card__signature/);
  assert.doesNotMatch(home, /Indice Momentum|entry\.momentumScore\.toFixed/);
  assert.doesNotMatch(home, /Top 10|weekly-rank|trend7d|holderCount/);
  assert.doesNotMatch(css, /is-weekly-lead|is-weekly-feature|featured-width/);
});

test("Tout voir ouvre dans l’URL la collection choisie et un mur filtrable", async () => {
  const [home, css, page, shellCss, publicHome] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/tremplin-home-experience.css"),
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/tremplin/TremplinPublicHome.tsx"),
  ]);
  const wall = extractBlock(home, /<section\s+className="tremplin-home-wall"/, /\{selectedEntry\s*\?/);

  assert.match(home, /wallRailId:\s*TremplinDiscoveryRailId\s*\|\s*null/);
  assert.match(home, /onWallRailIdChange:\s*\(railId:\s*TremplinDiscoveryRailId\s*\|\s*null\)/);
  assert.match(home, /onSeeAll=\{\(\)\s*=>\s*\{[\s\S]*?onWallRailIdChange\(rail\.id\)/);
  assert.match(page, /function getDiscoveryRailFromSearch\(search:\s*string\)[\s\S]*?new URLSearchParams\(search\)\.get\("collection"\)/);
  assert.match(page, /const railId = getDiscoveryRailFromSearch\(location\.search\)[\s\S]*?setHomeWallRailId\(railId\)/);
  assert.match(page, /\?collection=\$\{encodeURIComponent\(railId\)\}/);
  assert.doesNotMatch(wall, /Retour aux sélections/);
  assert.match(page, /tremplin-topbar__actions[\s\S]*?Retour aux sélections/);
  assert.doesNotMatch(page, /Créer mon jeton de talent/);
  assert.doesNotMatch(page, /className="tremplin-topbar__talent-cta"/);
  assert.match(publicHome, /className="tremplin-gateway__artist-entry"/);
  assert.match(publicHome, /onOpenRoute\("\/tremplin\/decouvrir\?collection=watchlist"\)/);
  assert.doesNotMatch(page, /className="tremplin-background-cta"/);
  assert.doesNotMatch(wall, /activeWallRail\?\.(?:title|description)|offres disponibles|>\s*un artiste\s*</i);
  assert.match(wall, /<MeewavSearchFilterBar[\s\S]*?placeholder="Rechercher artiste, projet ou jeton"/);
  assert.match(wall, /<MeewavFilterPanel[\s\S]*?title="Filtres des projets"/);
  assert.match(wall, /<MeewavFilterSection label="Localisation"[\s\S]*?>Région<\/span>[\s\S]*?wallFilterDraft\.region/);
  assert.match(wall, />Ville<\/span>[\s\S]*?wallFilterDraft\.city/);
  assert.match(wall, /<MeewavFilterSection label="Profil artistique"[\s\S]*?>Métier ou catégorie<\/span>[\s\S]*?>Style musical<\/span>/);
  assert.match(wall, /<MeewavFilterSection label="Grade MeeWav"/);
  assert.match(wall, /<MeewavFilterSection label="État du jeton de talent"/);
  assert.match(wall, /<MeewavFilterSection label="Tri"[\s\S]*?Pertinence[\s\S]*?Activité récente[\s\S]*?Grade croissant/);
  assert.doesNotMatch(wall, />Période<\/span>|value=\{period\}/);
  assert.match(home, /wallRailId === "watchlist"[\s\S]*?buildProjectWallCollection\(catalog\)/);
  assert.doesNotMatch(home, /const wallSource = rails\.find/);
  assert.match(home, /if \(sort === "relevance"\) return filtered/);
  assert.match(home, /if \(sort === "relevance"\) return filtered[\s\S]*?gradeAscending[\s\S]*?gradeDescending/);
  assert.doesNotMatch(home, /RankingPeriod|RANKING_PERIODS|buildTremplinRanking/);
  assert.match(home, /TREMPLIN_TALENT_CATEGORIES/);
  assert.match(home, /matchesTalentCategory/);
  assert.match(wall, /wallEntries\.slice\(0,\s*visibleCount\)\.map/);
  assert.match(wall, /ref=\{wallSentinelRef\}/);
  assert.match(wall, /Charger la suite/);
  assert.match(home, /new IntersectionObserver/);
  assert.match(home, /rootMargin:\s*"900px 0px"/);
  assert.match(home, /const\s+INITIAL_WALL_COUNT\s*=\s*24/);
  assert.match(home, /const\s+WALL_PAGE_SIZE\s*=\s*24/);
  assert.match(home, /const sequence:[^=]+=\s*\["voice", "voice", "instrument", "voice", "voice", "dj", "voice", "voice"\]/);
  assert.match(wall, /className="tremplin-home-wall__toolbar"[\s\S]*?<MeewavActiveFilterChips/);
  assert.match(wall, /className="tremplin-home-wall__toolbar"[\s\S]*?className="tremplin-home-wall__heading"[\s\S]*?>Mur des projets<[\s\S]*?<h1>/);
  assert.doesNotMatch(wall, /className="tremplin-home-wall__filters"/);
  assert.match(wall, /className="tremplin-home-wall__results"[\s\S]*?className="tremplin-home-wall__grid"/);
  assert.match(home, /catalogIsFiltered \? \([\s\S]*?tremplin-home-discovery__filtered-results[\s\S]*?Les résultats réunissent les créations et profils liés à ta recherche, sans classement financier/);
  assert.doesNotMatch(extractCssRule(css, ".tremplin-home-wall__toolbar"), /background|box-shadow|backdrop-filter/);
  assert.match(extractCssRule(css, ".tremplin-home-wall__results"), /overflow-y:\s*auto/);
  assert.match(extractCssRule(css, ".tremplin-home-wall__results"), /scrollbar-color:\s*#9d6cff/);
  assert.match(css, /\.tremplin-home-wall__results::\-webkit-scrollbar-thumb[\s\S]*?linear-gradient\(180deg,\s*#c28cff/);
  assert.match(extractCssRule(shellCss, ".tremplin-scroll.is-home-wall"), /overflow-y:\s*hidden/);
});

test("le répertoire expose exactement les 28 avatars métiers et chacun a un profil", async () => {
  assert.equal(TREMPLIN_ROLE_PROFILES.length, 28);
  assert.equal(new Set(TREMPLIN_ROLE_PROFILES.map(({ id }) => id)).size, 28);
  assert.equal(new Set(TREMPLIN_ROLE_PROFILES.map(({ avatarSrc }) => avatarSrc)).size, 28);

  for (const role of TREMPLIN_ROLE_PROFILES) {
    assert.ok(
      tremplinArtists.some((artist) => getTremplinRoleProfile(artist).id === role.id),
      `aucun profil principal pour ${role.label}`,
    );
    const avatar = await readFile(new URL(`../../public${role.avatarSrc}`, import.meta.url));
    assert.ok(avatar.byteLength > 1_000, `avatar manquant ou vide : ${role.avatarSrc}`);
  }

  assert.equal(
    getTremplinRoleProfile(tremplinArtists.find(({ id }) => id === "aina-sol")).id,
    "dj",
    "un style comme Amapiano ne doit pas transformer une DJ en pianiste",
  );
  assert.equal(
    getTremplinRoleProfile(tremplinArtists.find(({ id }) => id === "jo-varenne")).id,
    "guitariste-electrique",
    "le premier métier déclaré doit rester le métier principal",
  );
  assert.equal(
    artistMatchesTremplinRole(tremplinArtists.find(({ id }) => id === "aina-sol"), "pianiste"),
    false,
    "le filtre Pianiste ne doit jamais confondre Amapiano avec le métier de pianiste",
  );
  assert.equal(
    artistMatchesTremplinRole(tremplinArtists.find(({ id }) => id === "kenza-loba"), "pianiste"),
    false,
    "un roleId DJ doit rester prioritaire sur les mots présents dans les styles",
  );
});

test("chaque grande famille possède au moins vingt portraits uniques sans perdre le métier exact", async () => {
  const counts = new Map(TREMPLIN_ROLE_FAMILIES.map(({ id }) => [id, 0]));
  for (const artist of tremplinArtists) {
    const familyId = getTremplinRoleProfile(artist).familyId;
    counts.set(familyId, (counts.get(familyId) ?? 0) + 1);
    assert.ok(getTremplinProfessionLabel(artist).trim(), `métier exact absent pour ${artist.id}`);
  }

  for (const family of TREMPLIN_ROLE_FAMILIES) {
    assert.ok(
      (counts.get(family.id) ?? 0) >= TREMPLIN_PRIMARY_FAMILY_MINIMUM,
      `${family.label} doit proposer au moins ${TREMPLIN_PRIMARY_FAMILY_MINIMUM} profils`,
    );
  }

  const rosterPortraits = tremplinArtists
    .map(({ artwork }) => artwork)
    .filter((artwork) => artwork.includes("/images/tremplin/roster/"));
  assert.equal(rosterPortraits.length, 50, "les quatre campagnes doivent fournir 50 profils complémentaires");
  assert.equal(new Set(rosterPortraits).size, rosterPortraits.length, "aucun chemin portrait ne doit être réutilisé");

  const portraitHashes = await Promise.all(rosterPortraits.map(async (publicPath) => {
    assert.match(publicPath, /\.webp$/, "les nouveaux portraits doivent être optimisés en WebP");
    const bytes = await readFile(new URL(`../../public${publicPath}`, import.meta.url));
    assert.ok(bytes.byteLength > 20_000, `portrait anormalement léger : ${publicPath}`);
    return createHash("sha256").update(bytes).digest("hex");
  }));
  assert.equal(new Set(portraitHashes).size, portraitHashes.length, "aucune image binaire ne doit être dupliquée");
});

test("le nouveau mur apporte quarante-cinq portraits uniques avec une dominante vocale", async () => {
  const wallArtists = tremplinArtists.filter(({ artwork }) => artwork.includes("/images/tremplin/artists/wall-2026/"));
  const counts = wallArtists.reduce((result, artist) => {
    const role = getTremplinRoleProfile(artist);
    const bucket = role.familyId === "voix" ? "voice" : role.id === "dj" ? "dj" : role.familyId === "instruments" ? "instrument" : "other";
    result.set(bucket, (result.get(bucket) ?? 0) + 1);
    return result;
  }, new Map());

  assert.equal(wallArtists.length, 45);
  assert.equal(counts.get("voice"), 31);
  assert.equal(counts.get("instrument"), 8);
  assert.equal(counts.get("dj"), 6);
  assert.equal(counts.get("other") ?? 0, 0);

  const hashes = await Promise.all(wallArtists.map(async ({ artwork }) => {
    assert.match(artwork, /\.webp$/);
    const bytes = await readFile(new URL(`../../public${artwork}`, import.meta.url));
    assert.ok(bytes.byteLength > 20_000, `portrait du mur anormalement léger : ${artwork}`);
    return createHash("sha256").update(bytes).digest("hex");
  }));
  assert.equal(new Set(hashes).size, wallArtists.length, "chaque projet doit avoir un portrait réellement distinct");
});

test("le filtre Pianiste conserve les onze amateurs et accepte les nouveaux profils professionnels", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const pianistArtists = tremplinArtists.filter((artist) => artistMatchesTremplinRole(artist, "pianiste"));
  const amateurPianists = pianistArtists.filter(({ artwork }) => artwork.includes("/roster/pianistes/"));

  assert.match(home, /const rails = useMemo\(\(\) => buildRails\(catalog\), \[catalog\]\)/);
  assert.equal(amateurPianists.length, 11, "la sélection doit contenir onze nouveaux pianistes amateurs");
  assert.ok(pianistArtists.length >= 14, "la catégorie Pianiste doit conserver les profils existants et accueillir la nouvelle série");
  assert.ok(pianistArtists.every(({ roleId }) => roleId === "pianiste"), "aucun autre métier ne doit passer dans ce filtre");
  assert.ok(amateurPianists.every(({ exactProfession }) => exactProfession?.startsWith("Pianiste amateur · ")), "les cartes de la campagne amateur doivent garder leur libellé exact");

  const hashes = await Promise.all(amateurPianists.map(async (artist) => {
    assert.match(artist.exactProfession, /^Pianiste amateur · /);
    assert.equal(artist.disciplines[0], "Pianiste");
    const bytes = await readFile(new URL(`../../public${artist.artwork}`, import.meta.url));
    assert.ok(bytes.byteLength > 50_000, `photo pianiste anormalement légère : ${artist.artwork}`);
    return createHash("sha256").update(bytes).digest("hex");
  }));

  assert.equal(new Set(hashes).size, hashes.length, "chaque pianiste doit disposer d'une photo unique");
});

test("le Globe, Découvrir et le mur Tremplin utilisent les mêmes primitives de recherche et de filtres", async () => {
  const [home, globe, shared, sharedCss] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/globe/components/GlobeMapV2.tsx"),
    readSource("components/shared/search-filter/MeewavSearchFilter.tsx"),
    readSource("components/shared/search-filter/meewav-search-filter.css"),
  ]);

  for (const source of [home, globe]) {
    assert.match(source, /MeewavSearchFilterBar/);
    assert.match(source, /MeewavFilterPanel/);
  }
  assert.equal((home.match(/<MeewavSearchFilterBar\b/g) ?? []).length, 2, "Découvrir et le mur doivent chacun utiliser la barre partagée du Globe");
  assert.equal((home.match(/<MeewavFilterPanel\b/g) ?? []).length, 2, "Découvrir et le mur doivent chacun utiliser le drawer partagé du Globe");
  assert.equal((home.match(/boundarySelector="\.tremplin-scroll"/g) ?? []).length, 2, "les drawers Tremplin doivent respecter le header et la navigation du shell");
  assert.match(home, /className="tremplin-home-discovery__globe-search"[\s\S]*?filterPanelId="tremplin-discovery-filter-drawer"/);
  assert.match(home, /panelId="tremplin-discovery-filter-drawer"[\s\S]*?title="Filtres artistes"/);
  assert.doesNotMatch(home, /tremplin-home-discovery__(?:search|style|all-filters|filters|mobile-category)/);
  assert.match(shared, /className=\{`search-bar meewav-search-filter-bar/);
  assert.match(shared, /className=\{`side-panel artist-filter-panel meewav-filter-panel/);
  assert.match(shared, /className="artist-filter-panel__headingIcon"[\s\S]*?<SlidersHorizontal/);
  assert.match(shared, /className="artist-filter-panel__actions"/);
  assert.match(shared, /createPortal\(panelLayer, document\.body\)/);
  assert.match(shared, /boundary\.getBoundingClientRect\(\)[\s\S]*?top:\s*Math\.max\(0, boundaryRect\.top\)/);
  assert.doesNotMatch(shared, /Math\.max\(boundaryRect\.top, triggerRect\.top\)/, "le drawer doit commencer sous le bandeau, pas à la hauteur du champ de recherche");
  assert.match(shared, /event\.key === "Escape"/);
  assert.match(shared, /event\.key !== "Tab"/);
  assert.match(shared, /triggerRef\?\.current\?\.focus/);
  assert.match(sharedCss, /\.meewav-search-filter-bar\.is-flow\s*\{[^}]*width:\s*min\(100%,\s*390px\)/s);
  assert.match(sharedCss, /\.meewav-filter-panel__backdrop\s*\{[^}]*z-index:\s*10020/s);
  assert.match(sharedCss, /\.meewav-filter-panel\.side-panel\s*\{[^}]*z-index:\s*10021[^}]*background-color:\s*#0d081d/s);
  assert.match(sharedCss, /\.meewav-filter-panel\.side-panel\s*\{[^}]*transform\s+260ms[^}]*visibility\s+0s\s+linear\s+260ms/s);
  assert.match(sharedCss, /\.meewav-filter-field select\s*\{[^}]*appearance:\s*none[^}]*min-height:\s*52px[^}]*border-radius:\s*15px/s);
  assert.match(sharedCss, /\.meewav-filter-field select option,[\s\S]*?background:\s*#130c29/);
  assert.match(sharedCss, /\.meewav-filter-panel\.side-panel\.is-bounded\s*\{[^}]*top:\s*var\(--meewav-filter-panel-top\)[^}]*left:\s*var\(--meewav-filter-panel-left\)/s);
  assert.doesNotMatch(home, /TremplinDemoBanner/);
  assert.match(home, /readWallFiltersFromUrl[\s\S]*?new URLSearchParams\(window\.location\.search\)/);
  assert.match(home, /writeWallFiltersToUrl[\s\S]*?window\.history\[mode === "push" \? "pushState" : "replaceState"\]/);
  assert.match(home, /window\.addEventListener\("popstate"/);
});

test("le rail des premiers projets reste horizontal sans étirement ni flèches superposées", async () => {
  const [home, css] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/tremplin-home-experience.css"),
  ]);
  assert.match(home, /rail\.id === "emerging" \? " is-first-projects"/);
  assert.match(home, /className="tremplin-home-card__token-context"/);
  assert.match(home, /Dernière étape[\s\S]*?Prochaine étape[\s\S]*?Dernière mise à jour/);
  assert.match(extractCssRules(css, ".tremplin-home-rail.is-first-projects"), /clamp\(620px,\s*47vw,\s*760px\)/);
  assert.match(extractCssRules(css, ".tremplin-home-rail__track"), /align-items:\s*flex-start/);
  assert.match(extractCssRules(css, ".tremplin-home-rail .tremplin-home-card"), /grid-template-rows:\s*auto auto/);
  assert.doesNotMatch(home, /className="tremplin-home-rail__nav"/);
});

test("Mes artistes charge une démonstration peuplée et conserve les trois états adaptatifs", async () => {
  const [page, fixtures, css] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/tremplinMyArtistsFixtures.ts"),
    readSource("features/tremplin/tremplin-token-page.css"),
  ]);
  const dashboard = extractBlock(page, /function\s+MyArtistsView\b/, /export\s+default\s+function\s+TremplinPage/);

  assert.match(fixtures, /type MyArtistsFixtureId = "populated" \| "followingOnly" \| "empty"/);
  assert.match(fixtures, /fallback: MyArtistsFixtureId = "populated"[\s\S]*?return MY_ARTISTS_FIXTURES\[fallback\]/);
  assert.match(fixtures, /estimatedCurrentValue:\s*"186\.06"/);
  assert.equal((fixtures.match(/artistId:\s*"(?:lunae|maya-chen|maia-kuroda)"[^\n]+estimatedValue:/g) ?? []).length, 3);
  assert.match(fixtures, /tremplinFixture/);
  assert.match(dashboard, /className="is-stats"[\s\S]*?<ChartNoAxesCombined[^>]*>[\s\S]*?Statistiques<\/button>/);
  assert.match(dashboard, /className="is-primary"[\s\S]*?<MeewavTokenIcon \/> Voir le jeton/);
  assert.match(css, /\.tremplin-my-token-card > footer > button\.is-stats svg\s*\{[^}]*color:\s*#68d6aa/s);
  assert.match(dashboard, /Tes artistes[\s\S]*?et tes jetons de talent/);
  assert.match(css, /\.tremplin-my-dashboard__header h1 > span[\s\S]*?linear-gradient/);
  assert.match(dashboard, /Tes jetons aujourd’hui/);
  assert.match(dashboard, /Écart estimé depuis les achats/);
  assert.match(dashboard, /Ce qui a changé chez tes artistes/);
  assert.match(dashboard, /Rooms à venir/);
  assert.match(dashboard, /Non lus uniquement/);
  assert.match(dashboard, /fixture\.id === "empty"[\s\S]*?Commence à construire ton espace/);
  assert.match(dashboard, /fixture\.id === "populated"[\s\S]*?tremplin-my-artists-summary/);
  assert.doesNotMatch(dashboard, /<TremplinDemoBanner/);
  assert.doesNotMatch(page, /function\s+LegacyMyArtistsView\b/);
  assert.match(css, /\.tremplin-my-token-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
  assert.match(css, /\.tremplin-my-token-card > footer > button,[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.tremplin-my-artists__change\.is-up b,[\s\S]*?color:\s*#67d9ad/);
  assert.match(css, /\.tremplin-my-artists__change\.is-down b,[\s\S]*?color:\s*#ee8fa2/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tremplin-my-token-grid/);
});

test("les portraits ambigus gardent un métier explicite et cohérent avec la scène photographiée", () => {
  const expectedRoles = new Map([
    ["cassandre-bleu", "violoniste"],
    ["anis-valeur", "videaste-clipper"],
    ["noa-prism", "sound-designer"],
    ["nola-mbaye", "chanteuse-rappeuse"],
    ["elise-kemba", "ingenieur-son"],
    ["ewen-tran", "violoniste"],
    ["lucien-aoki", "ingenieur-son"],
    ["adrien-kora", "violoniste"],
    ["cleo-vent", "coach-vocal"],
    ["ana-vela", "accordeoniste"],
    ["kelya-v", "danseuse"],
    ["soren-l", "guitariste-electrique"],
    ["hugo-quartz", "guitariste-electrique"],
    ["elior-saint", "instrumentiste-vent"],
    ["idriss-noor", "violoniste"],
  ]);

  for (const [artistId, expectedRoleId] of expectedRoles) {
    const artist = tremplinArtists.find(({ id }) => id === artistId);
    assert.ok(artist, `profil absent : ${artistId}`);
    assert.equal(artist.roleId, expectedRoleId, `métier explicite manquant pour ${artistId}`);
    assert.equal(getTremplinRoleProfile(artist).id, expectedRoleId, `photo et métier incohérents pour ${artistId}`);
  }

  const stringRole = TREMPLIN_ROLE_PROFILES.find(({ id }) => id === "violoniste");
  assert.equal(stringRole?.label, "Cordes, harpe & luths", "les harpistes, oudistes et joueurs de kora ne doivent pas être présentés comme violonistes");
  assert.equal(
    getTremplinProfessionLabel(tremplinArtists.find(({ id }) => id === "cassandre-bleu")),
    "Harpiste",
  );
  assert.equal(
    getTremplinProfessionLabel(tremplinArtists.find(({ id }) => id === "anis-valeur")),
    "Réalisateur de clips",
  );
  assert.equal(
    getTremplinProfessionLabel(tremplinArtists.find(({ id }) => id === "lucien-aoki")),
    "Ingénieur mastering",
  );
  assert.equal(
    tremplinArtists.filter((artist) => !findTremplinRoleProfile(artist)).length,
    0,
    "aucun métier ne doit être deviné depuis la biographie ou recevoir un libellé par défaut",
  );
});

test("le clic carte ouvre une fiche immersive complète sans achat direct", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const detail = extractBlock(home, /\{selectedEntry\s*\?\s*\(/, /\)\s*:\s*null\}\s*<\/section>/);

  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /className="tremplin-home-detail__visual"[\s\S]*?<img\s+src=\{selectedEntry\.artist\.artwork\}/);
  assert.match(detail, /className="tremplin-home-detail__name"[\s\S]*?selectedEntry\.artist\.name[\s\S]*?<MeewavGradeBadge/);
  assert.match(detail, /className="tremplin-home-detail__audio"/);
  assert.match(detail, /className="tremplin-home-detail__stats"/);
  assert.match(detail, /Grade actuel[\s\S]*?Étapes publiées[\s\S]*?Abonnés[\s\S]*?>Room</);
  assert.match(detail, /className="tremplin-home-detail__project"/);
  assert.match(detail, /Son parcours en ce moment[\s\S]*?Prochaine étape/);
  assert.match(detail, /Profil de démonstration/);
  assert.doesNotMatch(detail, /className="tremplin-home-detail__chart"/);
  assert.doesNotMatch(detail, /Valeur du jeton|Accéder au jeton/);
  assert.match(home, /const\s+PROFILE_PALETTES[\s\S]*?#8b5cff[\s\S]*?#6b7cff[\s\S]*?#c7adff/);
  assert.match(detail, /selectedPalette\.accent/);
  assert.match(detail, /className="tremplin-home-detail__community"/);
  assert.match(detail, /className="tremplin-home-detail__updates"/);
  for (const action of ["Écouter", "Suivre gratuitement", "Voir le profil"]) {
    assert.match(detail, new RegExp(escapeRegExp(action)));
  }
  assert.doesNotMatch(detail, /Voir sa progression|progression ce mois|% d’auditeurs/);
  assert.doesNotMatch(detail, />\s*Acheter(?:\s+le jeton)?\s*</i);
});

test("le badge de grade remplace toute certification dans la fiche immersive", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const identity = extractBlock(home, /className="tremplin-home-detail__identity"/, /className="tremplin-home-detail__audio"/);
  const visual = extractBlock(home, /className="tremplin-home-detail__visual"/, /className="tremplin-home-detail__content"/);

  assert.match(identity, /<h2[^>]*>\{selectedEntry\.artist\.name\}<\/h2>[\s\S]*?<MeewavGradeBadge\s+level=\{selectedEntry\.artist\.gradeLevel\}\s+size="sm"/);
  assert.doesNotMatch(identity, /certif|verified|checkcircle/i);
  assert.doesNotMatch(visual, /MeewavGradeBadge|certif|verified/i);
});

test("la fiche se ferme de deux façons et permet de parcourir les artistes", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");

  assert.match(home, /className="tremplin-home-detail__backdrop"[\s\S]*?onClick=\{closeDetail\}/);
  assert.match(home, /className="tremplin-home-detail__close"[\s\S]*?onClick=\{closeDetail\}/);
  assert.match(home, /event\.key\s*===\s*["']Escape["'][\s\S]*?setSelectedEntry\(null\)/);
  assert.match(home, /navigateDetail\(-1\)[\s\S]{0,120}aria-label="Artiste précédent"/);
  assert.match(home, /navigateDetail\(1\)[\s\S]{0,120}aria-label="Artiste suivant"/);
  assert.match(home, /currentIndex\s*\+\s*direction\s*\+\s*detailSourceIds\.length[\s\S]*?%\s*detailSourceIds\.length/);
});

test("la fiche immersive garde la valeur hors du premier niveau de lecture", async () => {
  const [home, page] = await Promise.all([
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/TremplinPage.tsx"),
  ]);
  const detail = extractBlock(home, /\{selectedEntry\s*\?\s*\(/, /\)\s*:\s*null\}\s*<\/section>/);

  for (const color of ["#8b5cff", "#6b7cff", "#c7adff"]) {
    assert.match(home.toLocaleLowerCase("fr-FR"), new RegExp(escapeRegExp(color)));
  }
  assert.doesNotMatch(detail, /Évolution de la valeur|Valeur du jeton|Accéder au jeton/);
  assert.match(detail, /aria-label="Ce que l’artiste construit"[\s\S]*?Son parcours en ce moment/);
  assert.match(page, /tremplin-token-value-chart__canvas/);
  assert.match(page, /Espace payant et facultatif[\s\S]*?Jeton de talent/);
  assert.match(page, /<details id="profile-support"/);
});

test("les rails, le mur et la fiche possèdent une adaptation mobile explicite", async () => {
  const css = await readSource("features/tremplin/tremplin-home-experience.css");
  const responsive = mediaBlocks(css).join("\n");

  assert.match(responsive, /\.tremplin-home-rail\s*\{[^}]*--tremplin-rail-card-width:/);
  assert.match(responsive, /\.tremplin-home-discovery__hero\s*\{/);
  assert.match(responsive, /\.tremplin-home-discovery__finder\s*\{/);
  assert.match(responsive, /\.tremplin-home-rail\.is-featured\s*\{/);
  assert.match(responsive, /\.tremplin-home-rail__viewport\s*\{/);
  assert.match(responsive, /\.tremplin-wall-filter-fields\s*\{/);
  assert.match(responsive, /\.tremplin-home-wall__grid\s*\{/);
  assert.match(responsive, /\.tremplin-home-detail__dialog,[\s\S]{0,80}\.tremplin-home-detail\s*\{/);
  assert.match(responsive, /\.tremplin-home-detail__visual\s*\{/);
  assert.match(responsive, /\.tremplin-home-detail__actions\s*\{/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
