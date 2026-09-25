import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);
const projectRoot = new URL("../../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

async function readProject(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("la route Tremplin reste isolée en prévisualisation sans ouvrir l’auth en production", async () => {
  const [app, localPreview, packageJson] = await Promise.all([
    readSource("App.tsx"),
    readSource("features/auth/localAuthPreview.ts"),
    readProject("package.json"),
  ]);

  assert.match(app, /const\s+TremplinPage\s*=\s*lazy\(\(\)\s*=>\s*import\(["']\.\/features\/tremplin\/TremplinPage["']\)\)/);
  assert.match(localPreview, /IS_TREMPLIN_WORKSPACE_PREVIEW_MODE\s*=\s*import\.meta\.env\.DEV[\s\S]*?import\.meta\.env\.MODE\s*===\s*["']tremplin["']/);
  assert.match(localPreview, /if\s*\(IS_TREMPLIN_WORKSPACE_PREVIEW_MODE\)\s*return\s+true/);
  assert.match(app, /function\s+PreviewAuthenticatedRoute\([\s\S]*?if\s*\(IS_TREMPLIN_WORKSPACE_PREVIEW_MODE\)\s*return\s+children[\s\S]*?return\s*<RequireAuth>\{children\}<\/RequireAuth>/);
  for (const route of ["Profile", "Messaging", "Market", "Tremplin"]) {
    assert.match(app, new RegExp(`function\\s+${route}Route\\(\\)[\\s\\S]*?<PreviewAuthenticatedRoute>[\\s\\S]*?<${route}Page\\s*/>`));
  }
  assert.match(app, /!IS_TREMPLIN_WORKSPACE_PREVIEW_MODE[\s\S]*?DOCUMENT_STARTED_ON_GLOBE/);
  assert.match(app, /<AuthProvider>[\s\S]*?path=["']\/tremplin\/\*["']\s+element=\{<TremplinRoute\s*\/>\}/);
  assert.match(packageJson, /"dev:tremplin"\s*:\s*"vite --mode tremplin --host 0\.0\.0\.0 --port 5174 --open \/tremplin"/);

  const scripts = JSON.parse(packageJson).scripts;
  assert.doesNotMatch(scripts.dev, /--mode tremplin/);
  assert.doesNotMatch(scripts.build, /--mode tremplin/);
  assert.doesNotMatch(scripts.preview, /--mode tremplin/);
});

test("le Tremplin conserve son pilier, ses bandeaux et la navigation Meewav", async () => {
  const [page, navigation, shell, pageStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/globe/components/MeewavPrimaryNav.tsx"),
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/tremplin/tremplin-page.css"),
  ]);

  assert.match(page, /<MeewavPrimaryNav[\s\S]*?activeDestination=["']tremplin["']/);
  assert.match(navigation, /id:\s*["']tremplin["'][\s\S]*?navigate\(["']\/tremplin["']\)/);
  assert.match(navigation, /id:\s*["']tremplin["'][\s\S]*?accent:\s*["']#39FF88["']/);
  assert.match(navigation, /id:\s*["']profile["'][\s\S]*?navigate\(["']\/profile["']\)/);
  assert.match(navigation, /id:\s*["']market["'][\s\S]*?navigate\(["']\/market["']\)/);
  assert.match(page, /onMessages=\{\(\)\s*=>\s*navigate\(["']\/messages["']\)\}/);
  assert.match(page, /onGlobe=\{\(\)\s*=>\s*navigate\(MON_GLOBE_ROUTE,\s*\{[\s\S]*?state:\s*MON_GLOBE_HOST_POSITION_NAVIGATION_STATE/);
  assert.match(shell, /--tremplin-chrome-start:\s*rgba\(72, 34, 130, 0\.94\)/);
  assert.match(shell, /--tremplin-chrome-end:\s*rgba\(35, 37, 119, 0\.42\)/);
  assert.match(shell, /--tremplin-discover-cta-start:\s*rgba\(139, 92, 246, 0\.82\)/);
  assert.match(shell, /--tremplin-discover-cta-end:\s*rgba\(92, 83, 187, 0\.82\)/);
  assert.match(shell, /\.tremplin-primary-rail\s*\{[\s\S]*?background:\s*linear-gradient\([\s\S]*?var\(--tremplin-discover-cta-start\)[\s\S]*?var\(--tremplin-discover-cta-end\)/s);
  assert.doesNotMatch(shell, /\.tremplin-primary-rail\s*\{[\s\S]*?rgba\(141, 78, 224/s);
  assert.match(shell, /\.tremplin-primary-rail\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\)\s+saturate\(0\.92\)/s);
  assert.match(shell, /\.tremplin-topbar\s*\{[\s\S]*?linear-gradient\(102deg/s);
  assert.match(shell, /\.tremplin-topbar\s*\{[\s\S]*?0 9px 28px rgba\(103, 63, 190, 0\.11\)/s);
  assert.match(shell, /\.tremplin-topbar\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\)\s+saturate\(0\.92\)/s);
  assert.match(
    pageStyles,
    /\.tremplin-page__background\s*\{[^}]*background:\s*#000 url\(["']\/images\/tremplin\/tremplin-acoustic-wall\.png["']\) center \/ cover no-repeat;/s,
  );
  assert.doesNotMatch(pageStyles, /\.tremplin-page__background::(?:before|after)/);
  assert.match(
    pageStyles,
    /\.tremplin-page \.tremplin-public-home__hero::before,[\s\S]*?\.tremplin-page \.tremplin-home-rail\.is-featured::before\s*\{[^}]*content:\s*none;/s,
  );
  assert.match(pageStyles, /\.tremplin-page \.ttw-creator-shell\s*\{[^}]*background:\s*transparent;/s);
});

test("le rail Tremplin reprend exactement le dégradé du CTA Découvrir", async () => {
  const [shell, homeStyles] = await Promise.all([
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/tremplin/tremplin-home-experience.css"),
  ]);
  const embeddedNavigation = shell.match(
    /\.tremplin-primary-rail\s*>\s*\.meewav-primary-nav\s*\{([\s\S]*?)\}/,
  )?.[1] ?? "";

  assert.match(shell, /\.tremplin-primary-rail\s*\{[\s\S]*?var\(--tremplin-discover-cta-start\)[\s\S]*?var\(--tremplin-discover-cta-end\)/s);
  assert.match(homeStyles, /\.tremplin-home-discovery__actions a\s*\{[\s\S]*?var\(--tremplin-discover-cta-start\)[\s\S]*?var\(--tremplin-discover-cta-end\)/s);
  assert.match(embeddedNavigation, /background:\s*transparent/);
  assert.match(embeddedNavigation, /-webkit-backdrop-filter:\s*none/);
  assert.match(embeddedNavigation, /(?<!-webkit-)backdrop-filter:\s*none/);
  assert.match(embeddedNavigation, /box-shadow:\s*none/);
});

test("l’accueil ouvre sur la découverte éditoriale sans placer de formulaire d’achat près du titre", async () => {
  const home = await readSource("features/tremplin/TremplinHomeExperience.tsx");
  const intro = home.match(/<section className="tremplin-home-discovery__hero"([\s\S]*?)<\/section>/)?.[1] ?? "";

  assert.match(intro, /className="tremplin-home-discovery__finder"/);
  assert.doesNotMatch(intro, /Repère le talent avant tout le monde\.|Sélection MeeWav|Découvre les talents musicaux qui émergent aujourd’hui/);
  assert.doesNotMatch(intro, /className="tremplin-home-discovery__(?:hero-copy|actions|trust)"/);
  assert.doesNotMatch(intro, /Un système conçu pour soutenir sur la durée|Comprendre les protections/);
  assert.doesNotMatch(intro, /className="tremplin-home-discovery__portraits"|profils référencés|métiers précis/);
  assert.doesNotMatch(intro, /Montant libre|Confirmer l’achat|BUY_PRESETS|type="number"|<form\b/);
});

test("l’accueil du Tremplin sépare les jetons de talent des espaces de découverte", async () => {
  const [page, publicHome, gatewayStyles, app] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home-gateway.css"),
    readSource("App.tsx"),
  ]);

  for (const [view, route] of [
    ["home", "/tremplin"],
    ["discover", "/tremplin/decouvrir"],
    ["understand", "/tremplin/comprendre"],
    ["myArtists", "/tremplin/mes-artistes"],
  ]) {
    assert.match(page, new RegExp(`${view}: "${route.replaceAll("/", "\\/")}"`));
  }
  assert.match(app, /path=["']\/tremplin\/\*["']/);
  assert.match(page, /activeView === "home"[\s\S]*?<TremplinPublicHome/);
  assert.match(page, /function\s+DiscoveryExperience[\s\S]*?<TremplinHomeExperience/);
  assert.match(page, /onDiscover=\{\(\)\s*=>\s*changeView\("discover"\)\}/);
  assert.match(page, /onOpenArtistSupport=\{\(artist\) => openArtist\(artist, "profile-support"\)\}/);
  assert.match(page, /onOpenRoute=\{\(route\) => navigate\(route\)\}/);

  assert.match(publicHome, /Le talent se construit\.[\s\S]*?<strong>Le Tremplin le rend visible\.<\/strong>/);
  assert.match(publicHome, /className="tremplin-gateway__editorial-visual"[\s\S]*?tremplin-collective-hero-v1\.webp/);
  assert.match(publicHome, /className="tremplin-gateway__search"[\s\S]*?role="search"/);
  assert.match(publicHome, /role="combobox"[\s\S]*?aria-autocomplete="list"/);
  assert.match(publicHome, /placeholder="Rechercher un artiste, un projet ou un jeton de talent"/);
  assert.match(publicHome, /Découvrir et suivre reste gratuit/);
  assert.match(publicHome, /Donner de la force est facultatif/);
  assert.doesNotMatch(publicHome, /Profil de démonstration/);
  assert.match(publicHome, /observation: "Objectif du futur soutien"/);
  assert.match(publicHome, /upcoming: "Ce que le soutien pourra accompagner"/);
  assert.match(publicHome, /active: "Ce que la part destinée à l’artiste accompagne"/);
  assert.match(publicHome, /stage === "active" \|\| stage === "suspended" \? "Jeton de talent" : "Symbole réservé"/);
  assert.match(publicHome, /onSearch\(query\.trim\(\)\)/);
  assert.match(publicHome, /const selectEntry = \(entry: HomeEntry\)[\s\S]*?setSelectedEntryId\(entry\.artist\.id\)/);
  assert.match(publicHome, /const openStatusOrSupport = \(entry: HomeEntry/);
  assert.doesNotMatch(publicHome, /Repère le talent|avant tout le monde/);
  assert.doesNotMatch(publicHome, /Top hausses|24 h|7 jours/);
  assert.match(publicHome, /import "\.\/tremplin-public-home-gateway\.css"/);
  assert.doesNotMatch(gatewayStyles, /min-height:\s*100vh|height:\s*100vh/);
});

test("l’accueil guide de l’artiste ciblé vers son projet, son grade puis son jeton de talent", async () => {
  const publicHome = await readSource("features/tremplin/TremplinPublicHome.tsx");
  const steps = publicHome.match(/const SUPPORT_STEPS = \[([\s\S]*?)\] as const/)?.[1] ?? "";

  assert.equal([...steps.matchAll(/number:/g)].length, 3);
  for (const title of ["Repère un artiste", "Consulte son parcours", "Donne-lui de la force si tu le souhaites"]) {
    assert.match(steps, new RegExp(title));
  }

  const sectionOrder = [
    'id="tremplin-entry"',
    'id="comment-ca-marche"',
    'id="a-la-une"',
    'id="niveaux"',
    'id="protections"',
  ].map((marker) => publicHome.indexOf(marker));
  assert.ok(sectionOrder.every((position) => position >= 0));
  assert.deepEqual([...sectionOrder].sort((left, right) => left - right), sectionOrder);
  assert.match(publicHome, /Des projets, pas un classement/);
  assert.match(publicHome, /Une sélection fondée sur le talent, les projets documentés et l’évolution des artistes dans MeeWav/);
  assert.match(publicHome, /La sélection est indépendante du prix et des achats de jetons/);
  assert.match(publicHome, /Six grades[\s\S]*?talent et l’évolution d’un artiste/);
  assert.match(publicHome, /Le grade ne fixe pas automatiquement le prix du jeton et ne garantit pas le succès futur/);
  assert.match(publicHome, /Comment un grade est-il attribué/);
  assert.match(publicHome, /Achat payant et facultatif/);
  assert.match(publicHome, /Valeur variable, aucun gain garanti/);
  assert.match(publicHome, /Découvre gratuitement\. Suis librement\. Donne de la force seulement si tu le souhaites/);
  assert.match(publicHome, /userState !== "visitor" && followedEntries\.length > 0/);
  assert.doesNotMatch(publicHome, /<button[^>]*>[\s\S]{0,60}Acheter/);
});

test("la progression en six niveaux est reconstruite en code avec les badges MeeWav", async () => {
  const [publicHome, publicHomeStyles, compactStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home.css"),
    readSource("features/tremplin/tremplin-public-home-compact.css"),
  ]);
  const levelsSection = publicHome.match(
    /<section[\s\S]*?id="niveaux"([\s\S]*?)<\/section>/,
  )?.[1] ?? "";
  const guidance = publicHome.match(
    /const LEVEL_GUIDANCE:[\s\S]*?=\s*\{([\s\S]*?)\}\s*as const;/,
  )?.[1] ?? "";

  assert.match(levelsSection, /<strong>Six grades<\/strong> pour situer/);
  assert.match(levelsSection, /le <strong>talent et l’évolution d’un artiste\.<\/strong>/);
  assert.match(levelsSection, /Le grade représente le niveau global atteint par l’artiste dans l’infrastructure MeeWav/);
  assert.match(levelsSection, /Le grade ne fixe pas automatiquement le prix du jeton et ne garantit pas le succès futur/);
  assert.match(levelsSection, /Comment un grade est-il attribué/);
  assert.match(levelsSection, /className="tremplin-public-home__level-rail"/);
  assert.match(publicHome, /useState<GradeLevel>\(1\)/);
  assert.match(levelsSection, /role="group" aria-label="Explorer les six niveaux MeeWav"/);
  assert.match(levelsSection, /<button[\s\S]*?type="button"[\s\S]*?aria-pressed=\{level === activeGradeLevel\}/);
  assert.match(levelsSection, /aria-controls="tremplin-level-note"/);
  assert.match(levelsSection, /onClick=\{\(\) => setActiveGradeLevel\(level\)\}/);
  assert.match(levelsSection, /onFocus=\{\(\) => setActiveGradeLevel\(level\)\}/);
  assert.match(levelsSection, /onMouseEnter=\{\(\) => setActiveGradeLevel\(level\)\}/);
  assert.match(levelsSection, /size=\{level === activeGradeLevel \? "hero" : "xl"\}/);
  assert.match(levelsSection, /className="tremplin-public-home__level-stage">Niveau \{level\}<\/span>/);
  assert.match(levelsSection, /id="tremplin-level-note"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/);
  assert.equal((guidance.match(/cardLabel:/g) ?? []).length, 6);
  for (const label of [
    "Parcours en construction",
    "Activité structurée",
    "Parcours confirmé",
    "Parcours professionnel",
    "Parcours de référence",
    "Reconnaissance durable",
  ]) {
    assert.match(guidance, new RegExp(label));
  }
  assert.doesNotMatch(levelsSection, /<img\b|\.png|\.webp|\.jpe?g/);

  assert.match(publicHomeStyles, /\/\* Grade artwork remains untouched; only its layout and proportional display change\. \*\/[\s\S]*?\.tremplin-public-home__levels\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?aspect-ratio:\s*auto;/s);
  assert.match(publicHomeStyles, /\.tremplin-public-home__level-track\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(compactStyles, /button:focus-visible,[\s\S]*?outline:\s*3px solid/s);
  assert.match(compactStyles, /\.tremplin-public-home__level-track \.tremplin-public-home__level-badge\s*\{[\s\S]*?98px/s);
  assert.match(compactStyles, /button\.is-active \.tremplin-public-home__level-badge\s*\{[\s\S]*?120px/s);
});

test("le passage du profil au jeton de talent reste compact et construit en code", async () => {
  const [publicHome, gatewayStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home-gateway.css"),
  ]);
  const journeySection = publicHome.match(
    /<section id="comment-ca-marche"([\s\S]*?)<\/section>/,
  )?.[1] ?? "";

  assert.match(journeySection, /tremplin-gateway__steps-grid/);
  assert.match(journeySection, /SUPPORT_STEPS\.map/);
  assert.match(journeySection, /Le parcours de l’artiste passe toujours avant son jeton de talent/);
  assert.doesNotMatch(journeySection, /<img\b|\.png|\.webp|\.jpe?g/);

  assert.match(gatewayStyles, /\.tremplin-gateway__steps-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(gatewayStyles, /\.tremplin-gateway__steps\s*\{[\s\S]*?min-height:\s*100vh/s);
});

test("la une du Tremplin présente des projets et les états MW sans classement", async () => {
  const [publicHome, gatewayStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home-gateway.css"),
  ]);
  const spotlightSection = publicHome.match(
    /<section id="a-la-une"([\s\S]*?)<\/section>/,
  )?.[1] ?? "";

  assert.match(publicHome, /const spotlightEntries = useMemo/);
  assert.match(spotlightSection, /Des projets, pas un classement/);
  assert.match(spotlightSection, /Une sélection fondée sur le talent, les projets documentés et l’évolution des artistes dans MeeWav/);
  assert.match(spotlightSection, /La sélection est indépendante du prix et des achats de jetons/);
  assert.match(spotlightSection, /data-token-stage=\{entry\.tokenStage\}/);
  assert.match(spotlightSection, /status\.showPrice \? <div><dt>Valeur actuelle<\/dt><dd>\{formatCurrency\(entry\.token\.currentValueEur\)\}/);
  assert.match(spotlightSection, /Ce que l’artiste construit/);
  assert.match(spotlightSection, /getTokenSymbolLabel\(entry\.tokenStage\)/);
  assert.ok(spotlightSection.indexOf("Ce que l’artiste construit") < spotlightSection.indexOf("<TokenStatus entry={entry}"));
  assert.ok(spotlightSection.indexOf("<TokenStatus entry={entry}") < spotlightSection.indexOf("Valeur actuelle"));
  assert.doesNotMatch(spotlightSection, /Top hausses|24 h|7 jours|courbe|variation/i);
  assert.match(gatewayStyles, /\.tremplin-gateway__spotlight-grid\s*\{/);
  assert.match(gatewayStyles, /@media \(max-width:\s*700px\)[\s\S]*?\.tremplin-gateway__spotlight-grid\s*\{[\s\S]*?grid-auto-flow:\s*column;/s);
});

test("l’accès MW est volontaire, lié à un projet et ne confirme rien depuis l’accueil", async () => {
  const [publicHome, gatewayStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home-gateway.css"),
  ]);

  assert.match(publicHome, /onOpenArtistSupport/);
  assert.match(publicHome, /TREMPLIN_HOME_TOKEN_STATUS_UI/);
  assert.match(publicHome, /status\.allowSupport \? onOpenSupport : onOpenArtist/);
  assert.match(publicHome, /Valeur variable · Revente potentiellement différée · Aucun gain garanti/);
  assert.match(publicHome, /son prix, les frais, la part destinée à l’artiste/);
  assert.doesNotMatch(publicHome, /Confirmer l’achat|Acheter environ|Simuler l’achat/);
  assert.match(gatewayStyles, /\.tremplin-gateway__feature-actions \.is-primary/);
});

test("le bandeau horizontal reste consacré à la navigation et le CTA artiste devient contextuel dans le contenu", async () => {
  const [page, shell, productModel, publicHome, publicHomeStyles] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/tremplin/tremplinProductModel.ts"),
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/tremplin-public-home-gateway.css"),
  ]);
  const viewsBlock = page.match(/const TREMPLIN_NAV_ITEMS:[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
  const topbar = page.match(/<header className="tremplin-topbar">([\s\S]*?)<\/header>/)?.[1] ?? "";

  for (const label of ["Accueil", "Découvrir", "Comment ça marche", "Mes artistes"]) {
    assert.match(viewsBlock, new RegExp(`label: "${label}"`));
  }
  assert.equal([...viewsBlock.matchAll(/\{\s*id:/g)].length, 4);
  assert.ok(viewsBlock.indexOf('label: "Accueil"') < viewsBlock.indexOf('label: "Découvrir"'));
  assert.doesNotMatch(viewsBlock, /Mon espace|Mon jeton|Tableau de bord/);
  assert.match(page, /import MeewavPillarBrand from ["']\.\.\/\.\.\/components\/navigation\/MeewavPillarBrand["']/);
  assert.match(page, /className="tremplin-brand__copy"[\s\S]*?<MeewavPillarBrand pillar="Tremplin"\s*\/>/);
  assert.match(publicHome, /className="tremplin-gateway__search"[\s\S]*?role="search"[\s\S]*?Rechercher/);
  assert.doesNotMatch(publicHome, /className="tremplin-public-home__search-launcher"/);
  assert.match(page, /aria-label="Voir les activités de Mes artistes"/);
  assert.match(page, /className="tremplin-account-button"/);
  assert.doesNotMatch(topbar, /tremplin-topbar__talent-cta|contextAction\.label|contextAction\.detail/);
  assert.match(publicHome, /className="tremplin-gateway__artist-entry"[\s\S]*?artistActionDetail[\s\S]*?artistActionLabel/);
  assert.doesNotMatch(topbar, /tremplin-background-cta/);
  assert.match(page, /getTremplinContextAction/);
  assert.match(page, /resolveTremplinViewer\(\{ user, authStatus, localPreviewEnabled \}\)/);
  assert.match(page, /:\s*viewer\.userState/);
  assert.doesNotMatch(page, /CURRENT_TREMPLIN_USER_STATE/);
  assert.doesNotMatch(page, /showTalentCta|className="tremplin-background-cta"/);
  assert.match(page, /contextAction\.label/);
  assert.match(page, /contextAction\.detail/);
  assert.match(publicHomeStyles, /\.tremplin-gateway__artist-entry\s*\{/s);
  assert.match(productModel, /label:\s*"Demander mon jeton de talent"[\s\S]*?detail:\s*"Dès le niveau 2 · Étude par MeeWav"/);
  assert.match(productModel, /label:\s*"Voir les conditions d’accès"/);
  assert.match(productModel, /label:\s*"Suivre ma demande"/);
  assert.match(productModel, /label:\s*"Je suis artiste"/);
  assert.doesNotMatch(productModel, /Créer mon jeton de talent/);
  assert.doesNotMatch(shell, /\.tremplin-context-cta\s*\{/);
  assert.doesNotMatch(page, /className="tremplin-search"/);
  assert.equal((page.match(/<header className="tremplin-topbar">/g) ?? []).length, 1);
  assert.doesNotMatch(page, /<header className=\{`tremplin-contextbar/);
  assert.match(shell, /--tremplin-secondary-band-height:\s*0px/);
  assert.match(shell, /\.tremplin-topbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(190px,\s*auto\)\s+minmax\(0,\s*1fr\)\s+auto/);
  const educationCall = page.match(/<TremplinTokenEducation[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(educationCall, /onDiscover=\{\(\) => changeView\("discover"\)\}/);
  assert.doesNotMatch(educationCall, /playingArtistId|onToggleArtistAudio/);
  assert.match(page, /playingArtistId=\{playingArtistId\}/);
  assert.match(page, /onToggleArtistAudio=\{toggleAudio\}/);
  assert.match(page, /followedArtistIds=\{favorites\}/);
  assert.match(page, /onOpenArtistSupport=\{\(artist\) => openArtist\(artist, "profile-support"\)\}/);
  assert.doesNotMatch(page, /<TremplinPublicHome[\s\S]*?onToggleFollow=\{toggleFavorite\}/);
  assert.match(page, /<TremplinTokenWorkspace\s+mode="application"/);
  assert.match(page, /<TremplinTokenWorkspace\s+mode="dashboard"/);
  assert.match(page, /<TremplinTokenFlow\s+artist=/);
  assert.match(page, /<MeewavPillarTabs[\s\S]*?items=\{TREMPLIN_NAV_ITEMS\}[\s\S]*?onSelect=\{changeView\}/);
});

test("la recherche des talents appartient au contenu de la page", async () => {
  const [page, home] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
  ]);

  assert.match(page, /focusHomeSearch[\s\S]*?tremplin-home-search/);
  assert.match(home, /className="tremplin-home-discovery__finder"/);
  assert.match(home, /<MeewavSearchFilterBar[\s\S]*?inputId="tremplin-home-search"/);
  assert.match(home, /placeholder="Rechercher un artiste, un projet ou un symbole de jeton"/);
  assert.match(home, /inputAriaLabel="Rechercher un artiste, un projet ou un symbole de jeton"/);
  assert.match(home, /TREMPLIN_TALENT_CATEGORIES\.map/);
  assert.doesNotMatch(home, /Explore les 28 métiers du Tremplin|tremplin-home-roles/);
  assert.match(home, /TREMPLIN_TALENT_CATEGORIES/);
  assert.match(home, /matchesTalentCategory/);
  assert.match(home, /const \[showAdvancedFilters, setShowAdvancedFilters\] = useState\(initialState\.showAdvancedFilters\)/);
  assert.match(home, /onStateChange\?\.\(\{ query, styleFilter, categoryFilter/);
  assert.match(home, /filterPanelId="tremplin-discovery-filter-drawer"/);
  assert.match(home, /<MeewavFilterPanel[\s\S]*?panelId="tremplin-discovery-filter-drawer"[\s\S]*?title="Filtres artistes"/);
  assert.match(home, /<MeewavFilterSection label="Grade MeeWav"/);
  assert.match(home, /<MeewavFilterSection label="Disponibilité du jeton"[\s\S]*?Tous les artistes[\s\S]*?Avec un jeton actif[\s\S]*?Sans jeton actif/);
  assert.match(home, /<MeewavFilterSection label="État du jeton de talent"/);
  assert.doesNotMatch(home, /tremplin-advanced-filters|Tous les filtres/);
  assert.match(home, /catalogIsFiltered \? \([\s\S]*?tremplin-home-discovery__filtered-results[\s\S]*?Les résultats réunissent les créations et profils liés à ta recherche/);
  const finderPosition = home.indexOf('className="tremplin-home-discovery__finder"');
  const railsPosition = home.indexOf('className="tremplin-home-discovery__rails"');
  assert.ok(finderPosition >= 0 && railsPosition > finderPosition, "la recherche doit précéder les rails");
  assert.doesNotMatch(home, /className="tremplin-home-discovery__trust"/);
  assert.doesNotMatch(home, /Un système conçu pour soutenir sur la durée|Comprendre les protections|TREMPLIN_TRUST_PROMISES/);
});

test("la fiche artiste sépare explicitement parcours artistique et valeur du jeton", async () => {
  const page = await readSource("features/tremplin/TremplinPage.tsx");

  assert.match(page, /function TokenValueChart\(\{ token \}: \{ token: TremplinArtistToken \}\)/);
  assert.doesNotMatch(page, /<TremplinArtistAnalytics artist=\{artist\}/);
  assert.match(page, /Des éléments compréhensibles, sans score opaque ni courbe d’audience\./);
  assert.match(page, /<details id="profile-support"/);
  assert.match(page, /Espace payant et facultatif[\s\S]*?Jeton de talent/);
  assert.match(page, /Ce que la part de l’artiste accompagne/);
  assert.match(page, /Elle peut évoluer indépendamment du parcours de l’artiste\./);
  assert.match(page, /PUBLIC_TOKEN_PERIODS\.map/);
  assert.doesNotMatch(page, /TREMPLIN_TOKEN_PERIODS\.map|"24h", "7d"/);
  assert.match(page, /Valeur d’un jeton en euros/);
});

test("les profils artistes, leurs ancres et les tunnels conservent une navigation retour fiable", async () => {
  const page = await readSource("features/tremplin/TremplinPage.tsx");

  assert.match(page, /const TREMPLIN_ARTIST_ROUTE_PREFIX = "\/tremplin\/artistes"/);
  assert.match(page, /function getArtistFromPath[\s\S]*?\/tremplin\\\/artistes/);
  assert.match(page, /function getFlowFromPath[\s\S]*?getTremplinTokenLifecycleStage\(artist\) !== "active"/);
  assert.match(page, /navigate\(`\$\{TREMPLIN_ARTIST_ROUTE_PREFIX\}\/\$\{encodeURIComponent\(artist\.id\)\}/);
  assert.match(page, /state: \{ tremplinReturnTo: currentTremplinLocation \}/);
  assert.match(page, /const routeArtist = getArtistFromPath\(location\.pathname\)[\s\S]*?setSelectedArtist\(routeArtist\)/);
  assert.match(page, /\}, \[location\.pathname\]\);/);
  assert.doesNotMatch(page, /\}, \[location\.hash, location\.pathname\]\);/);
  assert.match(page, /navigate\(`\$\{location\.pathname\}\$\{location\.search\}#\$\{sectionId\}`[\s\S]*?scrollIntoView/);
  assert.match(page, /else if \(returnTo\) navigate\(-1\)/);
  assert.match(page, /tremplinSessionSnapshot[\s\S]*?scrollPositions/);
  assert.match(page, /navigate\("\/rooms"/);
  assert.match(page, /Les opérations sur les jetons ne sont disponibles que pour un jeton actif/);
  assert.match(page, /id=\{`etape-\$\{update\.id\}`\}/);
  assert.match(page, /onOpen\(artist, activity\.anchorId\)/);
});

test("le flux achat-revente possède quatre étapes, des euros et un récapitulatif serveur", async () => {
  const flow = await readSource("features/tremplin/TremplinTokenFlow.tsx");

  assert.match(flow, /type FlowStep = 1 \| 2 \| 3 \| 4/);
  assert.match(flow, /const BUY_PRESETS = \[10, 25, 50, 100\] as const/);
  assert.match(flow, /const STEP_LABELS = TREMPLIN_TRANSACTION_COPY\.steps/);
  assert.match(flow, /quoteRepository\.createQuote\(\{/);
  assert.match(flow, /quoteId|expiresAt|quoteExpired/);
  assert.match(flow, /Montant de l’achat en euros/);
  assert.match(flow, /Quantité|Pourcentage|Tout revendre/);
  assert.match(flow, /Valeur estimée avant frais/);
  assert.match(flow, /Montant net estimé/);
  assert.match(flow, /quote\.feeLines\.map/);
  assert.match(flow, /fee\.label/);
  assert.match(flow, /Vérification d’identité/);
  assert.match(flow, /limite de 5 %/i);
  assert.match(flow, /recalculés? au moment de la confirmation/i);
  assert.match(flow, /Simuler l’achat de \$\{formatTokenQuantity\(finalQuantity\)\} \$\{token\.symbol\} pour \$\{formatCurrency\(finalAmount\)\}/);
  assert.match(flow, /Simuler la revente de \$\{formatTokenQuantity\(finalQuantity\)\} \$\{token\.symbol\}/);
  assert.doesNotMatch(flow, /Gérer ma sortie|Confirmer ma sortie|demande de sortie/);
  assert.match(flow, /className="tremplin-token-flow-page"/);
  assert.match(flow, /role="region"/);
  assert.doesNotMatch(flow, /role="dialog"|aria-modal="true"|tremplin-token-flow-overlay/);
});

test("Mes artistes adapte la priorité aux détentions, au suivi seul et au compte vide", async () => {
  const [page, fixtures] = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/tremplinMyArtistsFixtures.ts"),
  ]);

  assert.match(page, /Tes artistes[\s\S]*?et tes jetons de talent/);
  assert.match(page, /Aperçu[\s\S]*?Mes jetons[\s\S]*?Artistes suivis[\s\S]*?Rooms[\s\S]*?Activité/);
  assert.match(page, /Valeur estimée actuelle[\s\S]*?Évolution sur 24 h[\s\S]*?Écart estimé depuis les achats/);
  assert.match(page, /Tout marquer comme lu/);
  assert.match(page, /Non lus uniquement/);
  assert.match(page, /Dernières opérations/);
  assert.match(page, /Voir les reçus/);
  assert.match(page, /Acheter d’autres jetons/);
  assert.match(page, /Revendre mes jetons/);
  assert.doesNotMatch(page, /Gérer ma sortie|Talents soutenus|Les talents que tu suis et soutiens/);
  assert.match(page, /TREMPLIN_FLOW_ROUTE_PREFIX = "\/tremplin\/soutien-mw"/);
  assert.match(page, /getFlowFromPath/);
  assert.match(fixtures, /"populated" \| "followingOnly" \| "empty"/);
  assert.match(fixtures, /fallback: MyArtistsFixtureId = "populated"[\s\S]*?return MY_ARTISTS_FIXTURES\[fallback\]/);
});

test("les règles système excluent les signaux financiers de la découverte et des grades", async () => {
  const [model, grade] = await Promise.all([
    readSource("features/tremplin/tremplinProductModel.ts"),
    readSource("features/tremplin/TremplinGradeSystem.tsx"),
  ]);

  assert.match(model, /TREMPLIN_SYSTEM_POLICY/);
  assert.match(model, /financialSignalsExcluded[\s\S]*?token-price[\s\S]*?purchase-count[\s\S]*?reciprocal-purchase/);
  assert.match(model, /affectsGrade:\s*false[\s\S]*?affectsDiscovery:\s*false[\s\S]*?affectsShortsReach:\s*false/);
  assert.match(model, /priceAlertsEnabledByDefault:\s*false/);
  assert.match(model, /promotionalPriceEvents:\s*\[\]/);
  assert.match(grade, /Le grade représente le niveau global atteint par l’artiste dans l’infrastructure MeeWav/);
  assert.match(grade, /Talent et qualité des créations/);
  assert.match(grade, /Le grade ne fixe pas automatiquement le prix du jeton et ne garantit pas le succès futur/);
  assert.match(grade, /Les achats de jetons, leur valeur et les achats croisés entre artistes n’entrent jamais dans cette évaluation/);
});

test("la page Comment ça marche reste compréhensible sans exemple ni jargon", async () => {
  const [education, educationStyles, curveStyles, tremplinPage, shellStyles, explainerVideo, copy, productModel] = await Promise.all([
    readSource("features/tremplin/TremplinTokenEducation.tsx"),
    readSource("features/tremplin/tremplin-token-education.css"),
    readSource("features/tremplin/tremplin-curve-explainer.css"),
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/tremplin-shell.css"),
    readFile(new URL("public/media/tremplin/ecosysteme-meewav.mp4", projectRoot)),
    readSource("features/tremplin/tremplinCopy.ts"),
    readSource("features/tremplin/tremplinProductModel.ts"),
  ]);
  const page = education.match(/export default function TremplinTokenEducation[\s\S]*$/)?.[0] ?? "";

  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "la page ne doit exposer qu’un seul h1");
  assert.match(page, /Découvre les artistes\. Suis leur actualité gratuitement\.[\s\S]*?L’achat de jetons de talent reste toujours facultatif\./);
  assert.match(page, /Voici comment fonctionne le Tremplin, dans l’ordre\./);
  assert.match(page, /TREMPLIN_COPY\.freeAccess/);
  assert.match(copy, /freeAccess: "Aucun achat n’est nécessaire pour écouter, regarder ou suivre un artiste\./);
  assert.match(page, /Comprendre en 3 étapes/);

  const discoveryIndex = page.indexOf('id="tremplin-discovery"');
  const followIndex = page.indexOf('id="tremplin-follow"');
  const gradesIndex = page.indexOf('id="tremplin-grades"');
  const tokenIndex = page.indexOf('id="tremplin-token-mw"');
  assert.ok(discoveryIndex >= 0, "la découverte doit ouvrir le récit");
  assert.ok(followIndex > discoveryIndex, "le suivi gratuit doit venir après la découverte");
  assert.ok(gradesIndex > followIndex, "les grades doivent être expliqués après le suivi gratuit");
  assert.ok(tokenIndex > gradesIndex, "le jeton doit venir en dernier");
  assert.equal((page.match(/className="tremplin-how__section /g) ?? []).length, 4, "le parcours doit expliquer les grades avant le jeton");

  assert.match(page, /Où découvre-t-on les artistes&nbsp;\?/);
  assert.match(education, /title: "Les 6 Rooms"[\s\S]*?Six espaces en direct/);
  assert.match(education, /title: "La Scène"[\s\S]*?Un flux 100 % musique/);
  assert.match(education, /title: "Le Globe"[\s\S]*?Une carte pour trouver des artistes/);
  assert.match(page, /Suivre un artiste est gratuit\./);
  assert.match(page, /Nouvelles vidéos[\s\S]*?Prochaines Rooms[\s\S]*?Actualités/);

  assert.match(page, /id="tremplin-token-mw"[\s\S]*?aria-labelledby="tremplin-token-mw-title"[\s\S]*?tabIndex=\{-1\}/);
  assert.equal((page.match(/Le jeton de talent, simplement\./g) ?? []).length, 1, "la promesse du jeton ne doit être formulée qu’une fois");
  assert.match(copy, /tokenDefinition: "Un jeton de talent est un jeton numérique associé à un artiste vérifié par MeeWav\./);
  assert.match(copy, /tokenRights: "Le jeton ne donne aucun droit sur l’artiste, son image, ses chansons, ses œuvres ou ses droits d’auteur\./);
  assert.match(page, /LES JETONS DE TALENT, SIMPLEMENT/);
  assert.match(page, /Une façon payante et facultative de donner de la force à un projet\.[\s\S]*?découvres d’abord gratuitement l’artiste et son parcours/);
  assert.match(page, /<MeewavTokenIcon[\s\S]*?className="tremplin-how__mw-premium-coin"/);
  assert.match(page, /title="Jeton de talent MeeWav avec la signature MW officielle"/);
  assert.doesNotMatch(page, /mw-token-premium-reference-cropped-v2\.png/);
  assert.doesNotMatch(page, /EXEMPLE DE PROJET|Premier EP en production/, "aucun encart marketing ne doit masquer la pièce");
  assert.match(page, /Tu choisis ton montant[\s\S]*?Dans les limites affichées[\s\S]*?Tu vois le récapitulatif[\s\S]*?Tu confirmes ou tu annules[\s\S]*?Rien n’est acheté avant ta confirmation/);
  assert.match(page, /Facultatif[\s\S]*?Part de l’artiste visible[\s\S]*?Aucun gain garanti/);
  assert.match(page, /La valeur peut varier et la revente peut ne pas être immédiate/);
  assert.match(page, /Avant de confirmer, tu vois tout\./);
  assert.match(page, /Le montant, les jetons estimés, les frais, la part de l’artiste et les conditions de revente sont affichés avant l’achat\./);
  assert.match(page, /Montant[\s\S]*?Jetons estimés[\s\S]*?Frais[\s\S]*?Part artiste[\s\S]*?Revente/);
  assert.match(page, /Voir un exemple de récapitulatif/);
  assert.match(page, /Exemple pédagogique — aucune transaction n’est effectuée\./);
  assert.match(page, /Montant choisi[\s\S]*?Jetons estimés[\s\S]*?Frais[\s\S]*?Part destinée à l’artiste[\s\S]*?Total débité[\s\S]*?Revente/);
  assert.match(productModel, /TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE[\s\S]*?amountCents: 2_500[\s\S]*?estimatedTokenHundredths: 2_770[\s\S]*?feesCents: 73[\s\S]*?artistShareCents: 75[\s\S]*?totalDebitCents: 2_500/);
  assert.match(education, /const TOKEN_EDUCATION_DETAILS[\s\S]*?Ce que tu achètes réellement[\s\S]*?Comment la valeur évolue[\s\S]*?Comment fonctionne la revente[\s\S]*?Ce que le jeton ne donne pas/);
  assert.equal((education.match(/id: "(?:purchase|value|resale|rights)"/g) ?? []).length, 4, "les quatre sujets détaillés doivent rester regroupés dans un seul accordéon");
  assert.match(page, /aria-expanded=\{isOpen\}[\s\S]*?aria-controls=\{panelId\}[\s\S]*?role="region"/);
  assert.equal((page.match(/Consulter les règles détaillées/g) ?? []).length, 1, "un seul accès aux règles doit rester dans le parcours principal");
  assert.match(page, /className="tremplin-how__rules-dialog"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
  assert.doesNotMatch(page, /className="tremplin-how__mw-secondary"|className="tremplin-how__mw-rules-link"/);
  assert.match(page, /TU CONNAIS MAINTENANT L’ESSENTIEL[\s\S]*?La musique d’abord\. La force, seulement si tu le souhaites\.[\s\S]*?Si tu veux donner de la force à un projet, tu peux ensuite acheter ses jetons de talent\./);
  assert.match(page, /className="tremplin-how__mw-conclusion-actions"[\s\S]*?Découvrir les artistes[\s\S]*?Retour à l’accueil[\s\S]*?Consulter les règles détaillées/);
  assert.doesNotMatch(page, /Librement, sans montant imposé|Tu vois la répartition|Tu confirmes seulement si tu le souhaites/);
  assert.doesNotMatch(page, /Choisis un montant[\s\S]*?Regarde le récapitulatif[\s\S]*?Confirme ou annule/);
  assert.doesNotMatch(page, /graphique|courbe ascendante|Commencer à investir|Soutenir maintenant|Découvrir les jetons en hausse/i);
  assert.match(page, /MeewavGradeBadge/);
  assert.match(page, /MeewavGradeBadge level=\{level\} size="hero"/, "les badges pédagogiques doivent rester immédiatement visibles");
  assert.match(page, /getGradeBadgeMeta\(level\)/, "chaque carte pédagogique doit utiliser la palette de son propre grade");
  assert.match(page, /"--how-grade-main": gradeMeta\.mainColor/, "la couleur principale du badge doit piloter la bordure de sa carte");
  assert.match(page, /"--how-active-grade-main": activeGradeMeta\.mainColor/, "le panneau explicatif doit suivre la couleur du grade actif");
  assert.match(educationStyles, /article\.is-active\s*\{[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--how-grade-main\)/, "la bordure active doit reprendre la couleur du badge");
  assert.match(educationStyles, /\.tremplin-how__grade-definition\s*\{[\s\S]*?border:[^;]*var\(--how-active-grade-main\)/, "le panneau de définition doit reprendre la couleur du grade sélectionné");
  assert.match(educationStyles, /\.tremplin-how__grade-strip small[^}]*font-size:\s*14px/, "le numéro du niveau ne doit pas redevenir un microtexte");
  assert.match(page, /Reconnaissance du parcours antérieur/);
  assert.doesNotMatch(page, /Maya|Lina|maya-diallo|onToggleArtistAudio|playingArtistId|artist-audio/);
  assert.match(page, /className="tremplin-how__mw-conclusion-actions"[\s\S]*?trackTremplinEvent\("how_it_works_completed"\); onDiscover\(\); \}\}>Découvrir les artistes/);
  assert.doesNotMatch(page, /\bposition\b|part détenue|opérations|calcul final|showreels|Talent Curve|Prix de départ accessible/);
  assert.doesNotMatch(page, /<TremplinCurveExplainer|tremplin-topbar|MeewavPillarTabs|tremplin-how__index/);

  assert.match(education, /import "\.\/tremplin-curve-explainer\.css"/);
  assert.match(education, /const MEEWAV_ECOSYSTEM_VIDEO_SRC = "\/media\/tremplin\/ecosysteme-meewav\.mp4"/);
  assert.match(page, /data-tremplin-video-cta[\s\S]*?Voir la vidéo · 1 min 40/);
  assert.match(page, /videoOpen \? \([\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="tremplin-how-video-title"/);
  assert.match(page, /className="tremplin-how__video-backdrop" role="presentation">/);
  assert.doesNotMatch(page, /className="tremplin-how__video-backdrop"[^>]*onClick=/);
  assert.match(page, /className="tremplin-how__video-close"[\s\S]*?onClick=\{\(\) => setVideoOpen\(false\)\}/);
  assert.match(page, /MEEWAV EN VIDÉO[\s\S]*?Découvre l’écosystème MeeWav\./);
  assert.match(page, /data-tremplin-video-slot[\s\S]*?controls[\s\S]*?preload="metadata"[\s\S]*?playsInline[\s\S]*?aria-label="Vidéo de présentation de l’écosystème MeeWav"[\s\S]*?poster=\{featuredArtist\.artwork\}/);
  assert.match(page, /<source src=\{MEEWAV_ECOSYSTEM_VIDEO_SRC\} type="video\/mp4" \/>/);
  assert.doesNotMatch(page, /comment-ca-marche\.mp4|comment-ca-marche\.vtt/);
  assert.match(page, /Lire le résumé en texte[\s\S]*?six Rooms[\s\S]*?Une partie du montant[\s\S]*?prix peut baisser[\s\S]*?perdre de l’argent/);
  assert.equal(explainerVideo.subarray(4, 8).toString("ascii"), "ftyp");
  assert.ok(explainerVideo.length > 1_000_000 && explainerVideo.length < 25_000_000);
  assert.match(page, /const handleDialogKeys = \(event: KeyboardEvent\)[\s\S]*?event\.key === "Escape"[\s\S]*?window\.addEventListener\("keydown", handleDialogKeys\)[\s\S]*?window\.removeEventListener\("keydown", handleDialogKeys\)/);
  assert.match(page, /videoCloseRef\.current\?\.focus\(\)/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"[\s\S]*?document\.body\.style\.overflow = previousBodyOverflow/);
  assert.doesNotMatch(page, /autoPlay/);
  assert.match(education, /export function TremplinCurveExplainer/);

  const educationCall = tremplinPage.match(/<TremplinTokenEducation[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(educationCall, /onDiscover=\{\(\) => changeView\("discover"\)\}/);
  assert.match(educationCall, /onHome=\{\(\) => changeView\("home"\)\}/);
  assert.doesNotMatch(educationCall, /playingArtistId|onToggleArtistAudio/);
  assert.match(tremplinPage, /activeView === "understand" \? " is-understand" : ""/);
  assert.match(tremplinPage, /onUnderstandToken=\{\(\) => changeView\("understand", "tremplin-token-mw"\)\}/);
  assert.match(tremplinPage, /location\.hash\.slice\(1\)[\s\S]*?getElementById\(targetId\)[\s\S]*?scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(tremplinPage, /className="tremplin-brand tremplin-brand__home"[\s\S]*?<MeewavPillarBrand pillar="Tremplin" \/>/s);
  assert.doesNotMatch(shellStyles, /data-tremplin-view="understand"[\s\S]{0,240}display:\s*none/s);
  assert.match(shellStyles, /\.tremplin-scroll\s*\{[^}]*left:\s*var\(--tremplin-nav-space\);/s);
  assert.match(shellStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tremplin-shell\s*\{[^}]*bottom:\s*var\(--tremplin-mobile-rail-height\);/s);

  assert.match(educationStyles, /\.tremplin-how\s*\{[\s\S]*?width:\s*min\(calc\(100% - 32px\),\s*1120px\)/s);
  assert.match(educationStyles, /\.tremplin-how__hero > p:not\(\.tremplin-how__hero-note\)[\s\S]*?font-size:\s*16px;/s);
  assert.match(educationStyles, /\.tremplin-how__channels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(educationStyles, /\.tremplin-how__follow-card\s*\{[\s\S]*?grid-template-columns:/s);
  assert.match(educationStyles, /\.tremplin-how__section\.is-token\s*\{[\s\S]*?scroll-margin-top:\s*calc\(var\(--tremplin-header-height, 72px\) \+ 32px\)/s);
  assert.match(educationStyles, /\.tremplin-how__section\.is-token\s*\{[\s\S]*?background:\s*transparent/s, "les trois zones ne doivent plus être enfermées dans un conteneur géant");
  assert.match(educationStyles, /\.tremplin-how__mw-main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 0\.76fr\) minmax\(0, 1\.24fr\)/s);
  assert.match(educationStyles, /\.tremplin-how__mw-timeline li\s*\{[\s\S]*?min-height:\s*64px/s, "les trois étapes doivent rester compactes");
  assert.match(educationStyles, /\.tremplin-how__mw-assurances\s*\{[\s\S]*?display:\s*flex/s, "les trois garanties ne doivent pas redevenir des capsules concurrentes");
  assert.match(educationStyles, /\.tremplin-how__mw-premium-coin\s*\{[\s\S]*?width:\s*68%[\s\S]*?drop-shadow/s);
  assert.doesNotMatch(page, /PIÈCE MW · ÉDITION ARTISTE/, "le visuel ne doit plus accumuler les badges décoratifs");
  assert.doesNotMatch(educationStyles, /\.tremplin-how__mw-project\s*\{/);
  assert.match(educationStyles, /\.tremplin-how__mw-before > ul\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/s);
  assert.match(educationStyles, /\.tremplin-how__mw-conclusion\s*\{[\s\S]*?min-height:\s*230px/s);
  assert.match(educationStyles, /\.tremplin-how__rules-backdrop\s*\{[\s\S]*?position:\s*fixed/s);
  assert.doesNotMatch(educationStyles, /\.tremplin-how__mw-secondary\s*\{/);
  assert.match(educationStyles, /\.tremplin-how__mw-timeline li::after/);
  assert.match(educationStyles, /\.tremplin-how__mw-details h3 > button\s*\{[\s\S]*?min-height:\s*48px/s);
  assert.match(educationStyles, /\.tremplin-how__video-backdrop\s*\{[^}]*position:\s*fixed;[^}]*backdrop-filter:\s*blur\(16px\);/s);
  assert.match(educationStyles, /\.tremplin-how__video-dialog video\s*\{[^}]*aspect-ratio:\s*16 \/ 9;/s);
  assert.match(educationStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tremplin-how__channels,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  assert.match(educationStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(curveStyles, /\.tremplin-curve-explainer\s*\{[\s\S]*?grid-template-columns:/s);
});

test("la demande de jeton de talent tient en trois étapes puis un récapitulatif", async () => {
  const [workspace, workspaceStyles] = await Promise.all([
    readSource("features/tremplin/TremplinTokenWorkspace.tsx"),
    readSource("features/tremplin/tremplin-token-workspace.css"),
  ]);
  const stepsBlock = workspace.match(/const APPLICATION_STEPS:[\s\S]*?=\s*\[([\s\S]*?)\] as const;/)?.[1] ?? "";
  const creatorBlock = workspace.match(/function ApplicationWorkspace[\s\S]*?function TokenValueChart/)?.[0] ?? "";

  assert.equal([...stepsBlock.matchAll(/\{\s*id:\s*\d/g)].length, 4);
  for (const shortLabel of ["Profil", "Créations", "Accords", "Récap."]) {
    assert.match(stepsBlock, new RegExp(`shortLabel: "${shortLabel}"`));
  }
  assert.match(workspace, /Demande de jeton de talent en trois étapes puis un récapitulatif/);
  assert.match(creatorBlock, /Prépare puis relis ta demande\./);
  assert.match(creatorBlock, /Vérifie ton profil, choisis deux créations, confirme tes accords puis relis le dossier avant l’étude humaine\./);
  assert.match(creatorBlock, /Environ 3 min/);
  assert.match(workspace, /Repère en direct/);
  assert.match(creatorBlock, /Simuler l’envoi de la demande/);
  assert.match(creatorBlock, /Simulation terminée · aucune demande réelle envoyée/);
  assert.doesNotMatch(creatorBlock, /Fonctionnement MW|Étape 7|sur 7|Sept étapes/);
  assert.doesNotMatch(creatorBlock, /<table/);
  assert.match(workspace, /Rien n’est publié automatiquement/);
  assert.match(workspace, /Vue d’ensemble/);
  assert.match(workspace, /Achats & ventes/);
  assert.match(workspace, /Distributions/);
  assert.match(workspace, /Conformité/);
  assert.match(workspace, /Mécanisme de calcul de la valeur/);
  assert.match(workspace, /Vente à découvert[\s\S]*?Blocage attendu si les jetons ne sont pas détenus[\s\S]*?À connecter/);
  assert.match(workspace, /Les statuts réels restent à connecter\./);
  assert.match(workspace, /sans certifier un jeton, une opération ni un document/);
  assert.match(workspaceStyles, /\.tremplin-token-workspace\.is-application\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(workspaceStyles, /\.ttw-creator-steps\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(workspaceStyles, /\.ttw-creator-stage\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
});

test("le vocabulaire public évite les promesses spéculatives et affiche toujours le risque", async () => {
  const sources = await Promise.all([
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/tremplin/TremplinPublicHome.tsx"),
    readSource("features/tremplin/TremplinHomeExperience.tsx"),
    readSource("features/tremplin/TremplinTokenFlow.tsx"),
    readSource("features/tremplin/TremplinTokenEducation.tsx"),
    readSource("features/tremplin/TremplinTokenWorkspace.tsx"),
  ]);
  const source = sources.join("\n");

  assert.doesNotMatch(source, /Miser sur un artiste|Parier sur son talent|Prix du talent|Potentiel x100|Rentabilité garantie|To the moon|\bPump\b|Gains rapides|Opportunité sans risque|Investissez avant les autres/i);
  assert.doesNotMatch(source, /jeton (?:est|sera) cher|prix garanti|va monter|prendra de la valeur/i);
  assert.doesNotMatch(source, /500 points\s*=|solde Meeway|crédits Meeway|monnaie virtuelle/i);
  assert.match(source, /peuvent prendre ou perdre de la valeur|peut monter comme descendre|valeur peut monter ou baisser/i);
  assert.match(source, /aucun gain n’est garanti|Aucun résultat financier n’est garanti/i);
  assert.match(source, /jeton de talent/i);
  assert.match(source, /valeur variable/i);
  assert.match(source, /achats et des reventes|achats et les reventes/i);
  assert.match(source, /ne mesure ni la qualité artistique|ne mesure jamais le talent|ne mesure ni la qualité/i);
});
