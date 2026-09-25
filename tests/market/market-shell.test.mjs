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

test("la route /market charge la marketplace en lazy loading", async () => {
  const app = await readSource("App.tsx");

  assert.match(
    app,
    /const\s+MarketPage\s*=\s*lazy\(\(\)\s*=>\s*import\(["']\.\/features\/market\/MarketPage["']\)\)/,
  );
  assert.match(app, /function\s+MarketRoute\([\s\S]*?<PreviewAuthenticatedRoute>[\s\S]*?<MarketPage\s*\/>/);
  assert.match(app, /<Route\s+path=["']\/market\/\*["']\s+element=\{<MarketRoute\s*\/>\}/);
});

test("le Market reste protégé hors de la prévisualisation Tremplin", async () => {
  const app = await readSource("App.tsx");

  assert.match(app, /function\s+PreviewAuthenticatedRoute\([\s\S]*?<RequireAuth>\{children\}<\/RequireAuth>/);
  assert.match(app, /function\s+MarketRoute\([\s\S]*?<PreviewAuthenticatedRoute>/);
  assert.match(app, /<AuthProvider>[\s\S]*?<BrowserRouter>[\s\S]*?path=["']\/market\/\*["']/);
  assert.doesNotMatch(app, /ISOLATED_MARKET_MODE|VITE_ISOLATED_FEATURE/);
});

test("la marketplace réutilise la navbar Meewav avec Market comme destination active", async () => {
  const [navigation, page] = await Promise.all([
    readSource("features/globe/components/MeewavPrimaryNav.tsx"),
    readSource("features/market/MarketPage.tsx"),
  ]);

  assert.match(navigation, /PrimaryDestinationId[\s\S]*?["']market["']/);
  assert.match(navigation, /id:\s*["']market["'][\s\S]*?navigate\(["']\/market["']\)/);
  assert.match(page, /import\s+MeewavPrimaryNav\s+from/);
  assert.match(page, /className=["']market-primary-rail["'][\s\S]*?<MeewavPrimaryNav/);
  assert.match(page, /<MeewavPrimaryNav[\s\S]*?activeDestination=["']market["']/);
});

test("contacter un vendeur ouvre la Messagerie canonique avec le contexte Market", async () => {
  const [page, route] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/messaging/messaging.route.ts"),
  ]);

  assert.match(page, /const openSellerConversation = \(product: MarketProductView\) =>/);
  assert.match(page, /buildMessagingRoute\(\{[\s\S]*?space: "messages"[\s\S]*?intent: "message"[\s\S]*?source: "marketplace"/);
  assert.match(page, /marketListingId: product\.id[\s\S]*?marketListingTitle: product\.title[\s\S]*?returnTo: buildMarketplaceListingReturnPath\(product\.id\)/);
  assert.match(page, /aria-label="Contacter le vendeur"[\s\S]{0,180}?openSellerConversation\(selectedProduct\)/);
  assert.doesNotMatch(page, /Conversation ouverte avec \$\{selectedProduct\.seller\.name\}/);
  assert.match(route, /"marketplace"/);
});

test("le Market conserve sa barre principale et intègre sa navigation locale au bandeau", async () => {
  const [page, styles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-double-band.css"),
  ]);
  const topbar = page.match(/<header className="market-topbar">([\s\S]*?)<\/header>/)?.[1] ?? "";
  const contentbar = page.match(/<div className="market-contentbar">([\s\S]*?)<\/div>\s*\{marketLive/s)?.[1] ?? "";

  assert.match(page, /import\s+["']\.\/market-double-band\.css["']/);
  assert.match(page, /<header className=["']market-topbar["']/);
  assert.doesNotMatch(page, /<header className=["']market-contextbar["']/);
  assert.doesNotMatch(page, /market-contextbar__identity|market-contextbar__mark|MARKET MUSICAL/i);
  assert.doesNotMatch(styles, /\.market-contextbar__identity|\.market-contextbar__mark/);
  assert.match(topbar, /className=["']market-contextbar__toolbar["'][\s\S]*?<MeewavPillarTabs/);
  assert.match(topbar, /className="market-pillar-tabs"/);
  assert.match(page, /\{\s*id:\s*"home",\s*label:\s*"Accueil"/);
  assert.match(page, /className=["']market-search__filter["'][\s\S]{0,420}?aria-expanded=\{filtersOpen\}[\s\S]{0,240}?<SlidersHorizontal/);
  assert.doesNotMatch(page, /className=["']market-contextbar__option["'][\s\S]{0,240}?>\s*<SlidersHorizontal/);
  assert.doesNotMatch(page, /<span>Filtres<\/span>/);
  assert.match(contentbar, /className=["']market-search["'][\s\S]*?La boutique où la musique[\s\S]*?className=["']market-contextbar__create["']/);
  assert.match(contentbar, /<Plus[\s\S]{0,120}?>\s*<span>Déposer une annonce<\/span>/);
  assert.match(styles, /--market-secondary-band-height:\s*0px/);
  assert.match(styles, /\.market-shell\s*\{[^}]*grid-template-rows:\s*var\(--market-primary-band-height\)\s+minmax\(0,\s*1fr\);/s);
  assert.match(styles, /\.market-topbar\s*\{[^}]*grid-template-columns:\s*minmax\(150px,\s*1fr\)\s+minmax\(520px,\s*700px\)\s+minmax\(150px,\s*1fr\);[^}]*grid-template-areas:\s*"brand navigation actions";/s);
  assert.match(styles, /\.market-topbar \.market-contextbar__toolbar\s*\{[^}]*grid-area:\s*navigation;/s);
  assert.match(styles, /\.market-topbar \.market-topbar__actions\s*\{[^}]*grid-area:\s*actions;[^}]*justify-self:\s*end;[^}]*margin-left:\s*auto;/s);
  assert.match(styles, /\.market-contentbar\s*\{[^}]*grid-template-columns:\s*minmax\(230px,\s*300px\)\s+minmax\(300px,\s*1fr\)\s+auto;/s);
  assert.match(styles, /\.market-contentbar \.market-search\s*\{[^}]*width:\s*min\(100%,\s*300px\);/s);
  assert.doesNotMatch(styles, /^\.market-rail\s*\{/m, "le rail de navigation ne doit pas entrer en collision avec les rails produits");
});

test("le rail vertical s'arrête sous le bandeau et borne les cartes sur son arête", async () => {
  const [chromeStyles, homeStyles] = await Promise.all([
    readSource("features/market/market-double-band.css"),
    readSource("features/market/market-home.css"),
  ]);

  assert.match(chromeStyles, /\.market-primary-rail\s*\{[^}]*top:\s*var\(--market-primary-band-height\);/s);
  assert.match(chromeStyles, /\.market-shell\s*\{[^}]*left:\s*0;/s);
  assert.match(chromeStyles, /\.market-scroll\s*\{[^}]*left:\s*var\(--market-nav-space\);/s);
  assert.match(homeStyles, /\.market-page\[data-market-navigation=["']home["']\] \.market-scroll\s*\{[^}]*padding-left:\s*0;/s);
  assert.match(homeStyles, /\.market-rail__viewport\s*\{[^}]*padding:\s*20px 16px 30px;/s);
  assert.match(homeStyles, /\.market-rail__edge-button--previous\s*\{[^}]*left:\s*0;/s);
});

test("le contenu commence sous le bandeau unique sans masque de fondu", async () => {
  const chromeStyles = await readSource("features/market/market-double-band.css");
  assert.match(chromeStyles, /--market-secondary-band-height:\s*0px/);
  assert.match(chromeStyles, /\.market-scroll\s*\{[^}]*top:\s*var\(--market-primary-band-height\);/s);
});

test("le verrou de marque Market utilise l’identité globale réutilisable", async () => {
  const [page, pageStyles, chromeStyles, brandStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-page.css"),
    readSource("features/market/market-double-band.css"),
    readSource("components/navigation/meewav-pillar-brand.css"),
  ]);

  assert.match(page, /<div className=["']market-brand["']>/);
  assert.match(page, /import MeewavPillarBrand from ["']\.\.\/\.\.\/components\/navigation\/MeewavPillarBrand["']/);
  assert.match(page, /className="market-brand__copy"[\s\S]*?<MeewavPillarBrand pillar="Market"\s*\/>/);
  assert.doesNotMatch(page, /market-brand__mark|aria-label=["']Accueil Market["']/);
  assert.doesNotMatch(pageStyles, /\.market-brand__mark/);
  assert.match(chromeStyles, /--market-pillar-title-inset:\s*clamp\(18px,\s*1\.5vw,\s*28px\)/);
  assert.match(chromeStyles, /\.market-topbar\s*\{[^}]*padding:\s*8px var\(--market-pillar-title-inset\);/s);
  assert.match(chromeStyles, /\.market-topbar \.market-brand\s*\{[^}]*margin-left:\s*0;/s);
  assert.match(brandStyles, /\.meewav-pillar-brand__app\s*\{[^}]*color:\s*#a98fff;[^}]*letter-spacing:\s*0\.18em;/s);
  assert.match(brandStyles, /\.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*18px;/s);
  const brandMarkup = page.slice(page.indexOf('<div className="market-brand">'), page.indexOf('<div className="market-contextbar__toolbar">'));
  const actionsMarkup = page.slice(page.indexOf('<div className="market-topbar__actions">'), page.indexOf("</header>", page.indexOf('<div className="market-topbar__actions">')));
  assert.doesNotMatch(brandMarkup, /market-brand__portrait/);
  assert.match(actionsMarkup, /market-brand__portrait/);
  assert.match(pageStyles, /\.market-popover--account\s*\{[^}]*right:\s*28px;[^}]*left:\s*auto;/s);
});

test("la recherche s'arrête après son libellé et ne contient plus de faux QR code", async () => {
  const [page, pageStyles, chromeStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-page.css"),
    readSource("features/market/market-double-band.css"),
  ]);

  assert.doesNotMatch(page, /market-search__hint|⌘\s*K/);
  assert.doesNotMatch(pageStyles, /\.market-search__hint/);
  assert.match(chromeStyles, /\.market-contentbar \.market-search\s*\{[^}]*width:\s*min\(100%,\s*300px\);/s);
});

test("le bouton Filtres utilise un verre flouté discret face au CTA violet", async () => {
  const chromeStyles = await readSource("features/market/market-double-band.css");
  assert.match(chromeStyles, /\.market-contextbar__option\s*\{[^}]*background:\s*rgba\(14, 11, 29, 0\.42\);/s);
  assert.match(chromeStyles, /\.market-contextbar__option\s*\{[^}]*backdrop-filter:\s*blur\(16px\) saturate\(1\.08\);/s);
  assert.match(chromeStyles, /\.market-contextbar__option svg\s*\{[^}]*rgba\(191, 166, 255, 0\.82\)/s);
  assert.match(chromeStyles, /\.market-contextbar__create\s*\{[^}]*rgba\(132, 75, 238, 0\.92\)/s);
});

test("les actions panier utilisent un caddie et non une icône de sac", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /ShoppingCart/);
  assert.doesNotMatch(page, /ShoppingBag/);
  assert.match(page, /aria-label=["']Ouvrir le panier["'][\s\S]{0,240}?<ShoppingCart/);
  assert.match(page, /<ShoppingCart\s*\/>[\s\S]{0,180}?\{selectedActionPending \? ["']Envoi…["'] : actionLabel\}/);
});

test("le Market Center utilise le portrait dynamique du compte dans la marque connectée", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /const currentUserAvatar = authMetadataText\([\s\S]*?["']avatar_url["'][\s\S]*?["']picture["'][\s\S]*?\?\? ["']\/images\/preprofile\/portraits\/profile-21\.webp["']/);
  assert.match(page, /className=["']market-brand__portrait["'][\s\S]{0,520}?<img\s+src=\{currentUserAvatar\}[\s\S]{0,180}?market-brand__presence/);
  assert.doesNotMatch(page, /className=["']market-avatar-button["']/);
  assert.doesNotMatch(page, />\s*NM\s*<\/button>/);
});

test("le Market Center ouvre les demandes réelles selon le rôle et reste explicite en démo", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /import MarketIntentCenter from ["']\.\/MarketIntentCenter["']/);
  assert.doesNotMatch(page, /label: ["']Mes commandes["']/);
  assert.match(page, /label: ["']Mes demandes["'][\s\S]*?intentRole: ["']buyer["']/);
  assert.match(page, /label: ["']Demandes reçues["'][\s\S]*?intentRole: ["']seller["']/);
  assert.match(page, /if \(marketLive\.active\)[\s\S]*?setIntentCenterRole\(intentRole\)/);
  assert.match(page, /Simulation non connectée/);
  assert.match(page, /intentCenterRole && marketLive\.active[\s\S]*?<MarketIntentCenter[\s\S]*?initialRole=\{intentCenterRole\}/);
  assert.match(page, /\.market-cart-panel, \.market-listing-composer, \.market-intents/);
  assert.match(page, /marketCenterTriggerRef\.current\?\.focus\(\)/);
});

test("le catalogue expose Neuf, Occasion, Location, Services et Achat groupé", async () => {
  const [data, page] = await Promise.all([
    readSource("features/market/marketDemoData.ts"),
    readSource("features/market/MarketPage.tsx"),
  ]);
  const start = data.indexOf("export const MARKET_PILLARS");
  const end = data.indexOf("satisfies readonly MarketPillar[]", start);

  assert.ok(start >= 0 && end > start, "MARKET_PILLARS doit être localisable");
  const pillars = data.slice(start, end);
  const labels = [...pillars.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
  const ids = [...pillars.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labels, ["Neuf", "Occasion", "Location", "Services", "Achat groupé"]);
  assert.deepEqual(ids, ["new", "used", "rental", "services", "collective"]);
  assert.doesNotMatch(pillars, /\bBangers?\b/i);
  assert.match(page, /MARKET_PILLARS/);
  assert.match(page, /MARKET_PILLARS\.map|marketDemoData\.pillars\.map/);
});

test("les données premium sont normalisées et forment un catalogue dense par univers", async () => {
  const data = await readSource("features/market/marketDemoData.ts");

  for (const field of [
    "price: MarketMoney",
    "sellerId: string",
    "locationId: string",
    "rating: MarketRating",
    "favorite: boolean",
    "cart: MarketCartState",
    "rental: MarketRentalTerms | null",
    "collective: MarketCollectiveProgress | null",
  ]) {
    assert.match(data, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const asset of [
    "moog-subsequent-37.jpg",
    "apollo-twin-x.jpg",
    "shure-sm7b.jpg",
    "beyerdynamic-dt770.jpg",
    "fender-strat.jpg",
    "roland-td17kvx.jpg",
    "arturia-minifreak.jpg",
    "technics-sl1200.jpg",
  ]) {
    assert.match(data, new RegExp(`/images/market/${asset.replace(".", "\\.")}`));
  }

  const productsSection = data.slice(0, data.indexOf("export interface MarketHomeRail"));
  const productIds = [...productsSection.matchAll(/\bid:\s*"((?:new|used|rental|service|collective)-[^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(productIds.length >= 125, "le catalogue doit proposer au moins vingt-cinq offres par univers");
  assert.equal(new Set(productIds).size, productIds.length, "chaque offre doit conserver un identifiant unique");
  for (const pillarId of ["new", "used", "rental", "collective"]) {
    assert.ok(
      productIds.filter((id) => id.startsWith(`${pillarId}-`)).length >= 25,
      `${pillarId} doit contenir au moins vingt-cinq offres`,
    );
  }
  assert.ok(
    productIds.filter((id) => id.startsWith("service-")).length >= 25,
    "Services doit contenir au moins vingt-cinq prestations, coachings, billets et Rooms",
  );

  assert.match(data, /joined:\s*\d+[\s\S]*?target:\s*\d+[\s\S]*?progressPercent:\s*\d+/);
  assert.match(data, /dailyPrice:\s*\d+[\s\S]*?weekendPrice:\s*\d+[\s\S]*?weeklyPrice:\s*\d+/);
});

test("l'accueil Market expose cinq rails magnétiques et une sélection éditoriale équilibrée entre les cinq univers", async () => {
  const [data, page, homeStyles] = await Promise.all([
    readSource("features/market/marketDemoData.ts"),
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-home.css"),
  ]);

  const railsStart = data.indexOf("export const MARKET_HOME_RAILS");
  const railsEnd = data.indexOf("export const featuredMarketProductIds", railsStart);
  assert.ok(railsStart >= 0 && railsEnd > railsStart, "MARKET_HOME_RAILS doit être localisable");
  const rails = data.slice(railsStart, railsEnd);

  assert.equal([...rails.matchAll(/\n\s+pillarId:\s*"(new|used|rental|services|collective)"/g)].length, 5);
  const productLists = [...rails.matchAll(/productIds:\s*\[([\s\S]*?)\]/g)].map((match) => match[1]);
  assert.equal(productLists.length, 5);
  for (const productList of productLists) {
    assert.equal([...productList.matchAll(/"(?:new|used|rental|service|collective)-[^"]+"/g)].length, 10);
  }
  assert.match(page, /\.slice\(0, 30\)/);
  assert.match(page, /const FEATURED_PRODUCTS_PER_PILLAR = 8/);
  assert.match(page, /MARKET_PILLARS\.map\(\(pillar\) => featuredProductsByPillar\[pillar\.id\]\[productIndex\]\)/);
  assert.match(page, /<span className=["']market-rail-card__badge["']>\s*\{marketPillarLabels\[product\.pillarId\]\}/);
  assert.doesNotMatch(page, /market-rail-card__badge[\s\S]{0,160}product\.badge/);
  assert.match(page, /title=["']Le meilleur de chaque univers["']/);
  assert.match(page, /description=["']Neuf, occasion, location, services et achats groupés sélectionnés pour toi\.["']/);
  assert.match(page, /marketHomeRails\.map/);
  assert.match(page, /variant=["']featured["']/);
  assert.match(page, /import\s+["']\.\/market-home\.css["']/);
  assert.match(page, />\s*Voir plus\s*</);
  assert.match(page, /handlePillarChange\(rail\.pillarId\)/);
  assert.match(page, /const resetMarketScroll = \(\) => \{[\s\S]*?marketScrollRef\.current\.scrollTop = 0;/);
  assert.match(page, /<div ref=\{marketScrollRef\} className=["']market-scroll["']>/);
  assert.match(homeStyles, /\.market-rail__viewport\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?scroll-snap-type:\s*x mandatory;/);
  assert.match(homeStyles, /scroll-snap-align:\s*start;/);
});

test("les rails Market se naviguent par pages avec des chevrons Netflix accessibles", async () => {
  const [page, homeStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-home.css"),
  ]);

  assert.match(page, /const scrollByPage = \(direction: -1 \| 1\)/);
  assert.match(page, /const cardsPerPage = Math\.max\(minimumPageSize, Math\.floor\(usableWidth \/ stride\)\)/);
  assert.match(page, /viewport\.scrollBy\(\{ left: direction \* cardsPerPage \* stride, behavior: "smooth" \}\)/);
  assert.match(page, /className="market-rail__edge-button market-rail__edge-button--previous"[\s\S]*?disabled=\{products\.length <= 1\}/);
  assert.match(page, /className="market-rail__edge-button market-rail__edge-button--next"[\s\S]*?disabled=\{products\.length <= 1\}/);
  assert.match(page, /aria-controls=\{`\$\{id\}-viewport`\}/);
  assert.match(page, /aria-label=\{`Afficher les offres précédentes de \$\{title\}`\}/);
  assert.match(homeStyles, /\.market-rail__edge-navigation\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*none;/);
  assert.match(homeStyles, /\.market-rail:hover \.market-rail__edge-button:not\(:disabled\),[\s\S]*?\.market-rail:focus-within \.market-rail__edge-button:not\(:disabled\)/);
  assert.match(homeStyles, /\.market-rail__edge-button:disabled\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test("les rails bouclent à l'infini sans animation GPU permanente", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /const loopCloneCount = Math\.min\(8, products\.length\)/);
  assert.match(page, /products\.slice\(-loopCloneCount\)/);
  assert.match(page, /products\.slice\(0, loopCloneCount\)/);
  assert.match(page, /data-market-looping="true"/);
  assert.match(page, /data-market-loop-clone=\{loopCopy === "original" \? undefined : loopCopy\}/);
  assert.match(page, /const isLoopClone = loopCopy !== "original"/);
  assert.match(page, /aria-hidden=\{isLoopClone \|\| undefined\}/);
  assert.match(page, /inert=\{isLoopClone \|\| undefined\}/);
  assert.match(page, /tabIndex=\{isLoopClone \? -1 : undefined\}/);
  assert.match(page, /rawIndex < loopCloneCount/);
  assert.match(page, /rawIndex >= loopCloneCount \+ products\.length/);
  assert.match(page, /viewport\.style\.scrollBehavior = "auto";[\s\S]*?viewport\.scrollLeft = target\.offsetLeft - viewportPadding;/);
  assert.match(page, /window\.setTimeout\(\(\) => \{[\s\S]*?recenteredIndex[\s\S]*?\}, 96\)/);
  assert.doesNotMatch(page, /setInterval|requestAnimationFrame\([^)]*scrollBy|animationFrame[^\n]*scrollLeft/);
});

test("tous les rails utilisent des cartes uniformes sans coverflow", async () => {
  const [page, homeStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-home.css"),
  ]);

  assert.match(page, /const initialIndex = loopCloneCount;/);
  assert.doesNotMatch(page, /className=\{`market-feature-card/);
  assert.match(page, /className="market-rail-card"[\s\S]{0,180}?data-market-rail-card/);
  assert.match(homeStyles, /\.market-rail-card\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/);
  assert.doesNotMatch(homeStyles, /\.market-feature-card(?:\.|\s|,|\{)/);
  assert.doesNotMatch(homeStyles, /\.market-rail--featured\s*\{[^}]*--rail-card-width:/);
});

test("la top bar garde Accueil blanc et réserve une couleur à chaque univers commercial", async () => {
  const [page, sharedStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("components/navigation/meewav-pillar-tabs.css"),
  ]);
  const expectedAccents = {
    home: "#f7f5ff",
    new: "#5B7CFF",
    used: "#E9A23B",
    rental: "#27C2D1",
    services: "#C65BFF",
    collective: "#39C889",
  };

  for (const [state, accent] of Object.entries(expectedAccents)) {
    assert.match(
      page,
      new RegExp(`(?:id:\\s*"${state}"[\\s\\S]{0,180}?accent:\\s*"${accent}"|${state}:\\s*"${accent}")`),
      `${state} doit utiliser exactement ${accent}`,
    );
  }

  assert.match(sharedStyles, /\.meewav-pillar-tabs__indicator\s*\{[\s\S]*?var\(--meewav-pillar-tab-accent\)/);
  assert.match(sharedStyles, /\.meewav-pillar-tabs > button:focus-visible\s*\{[\s\S]*?outline:/);
});

test("les rails et le catalogue exposent le contexte commercial de chaque offre", async () => {
  const page = await readSource("features/market/MarketPage.tsx");
  const railCardTag = /<article[\s\S]{0,600}?className=["']market-rail-card["'][\s\S]{0,600}?>/;
  const catalogCardTag = /<article[\s\S]{0,600}?className=["']market-product-card["'][\s\S]{0,600}?>/;
  const railCard = page.match(railCardTag)?.[0] ?? "";
  const catalogCard = page.match(catalogCardTag)?.[0] ?? "";

  assert.ok(railCard, "la carte d'un rail doit être localisable");
  assert.match(railCard, /data-market-pillar=\{product\.pillarId\}/);
  assert.match(railCard, /data-market-service-kind=\{product\.service\?\.kind(?:\s*\?\?\s*undefined)?\}/);

  assert.ok(catalogCard, "la carte du catalogue doit être localisable");
  assert.match(catalogCard, /data-market-pillar=\{product\.pillarId\}/);
  assert.match(catalogCard, /data-market-service-kind=\{product\.service\?\.kind(?:\s*\?\?\s*undefined)?\}/);
});

test("les cartes appliquent les couleurs exactes et réservent le corail à la billetterie et aux Rooms", async () => {
  const [pageStyles, homeStyles] = await Promise.all([
    readSource("features/market/market-page.css"),
    readSource("features/market/market-home.css"),
  ]);
  const cardStyles = `${pageStyles}\n${homeStyles}`;
  const expectedOfferAccents = {
    new: { rgb: [91, 124, 255], hex: "#5B7CFF" },
    used: { rgb: [233, 162, 59], hex: "#E9A23B" },
    rental: { rgb: [39, 194, 209], hex: "#27C2D1" },
    services: { rgb: [198, 91, 255], hex: "#C65BFF" },
    collective: { rgb: [57, 200, 137], hex: "#39C889" },
  };

  for (const [pillar, { rgb, hex }] of Object.entries(expectedOfferAccents)) {
    const [red, green, blue] = rgb;
    assert.match(
      cardStyles,
      new RegExp(
        `\\[data-market-pillar=["']${pillar}["']\\][^{]*\\{[^}]*--market-offer-accent:\\s*${red}\\s*,\\s*${green}\\s*,\\s*${blue}\\s*;`,
        "s",
      ),
      `les offres ${pillar} doivent exposer exactement ${hex}`,
    );
  }

  for (const serviceKind of ["ticket", "room"]) {
    assert.match(
      cardStyles,
      new RegExp(
        `\\[data-market-pillar=["']services["']\\]\\[data-market-service-kind=["']${serviceKind}["']\\][^{]*\\{[^}]*--market-offer-accent:\\s*255\\s*,\\s*100\\s*,\\s*124\\s*;`,
        "s",
      ),
      `${serviceKind} doit surcharger Services avec le corail #FF647C`,
    );
  }

  assert.match(cardStyles, /\.market-rail-card__badge\s*\{[^}]*var\(--market-offer-accent\)/s);
  assert.match(cardStyles, /\.market-badge\s*\{[^}]*var\(--market-offer-accent\)/s);
});

test("les progressions d'achat groupé utilisent le vert communautaire exact", async () => {
  const [pageStyles, homeStyles] = await Promise.all([
    readSource("features/market/market-page.css"),
    readSource("features/market/market-home.css"),
  ]);
  const collectiveGreen = String.raw`(?:var\(--market-offer-accent\)|#39c889|rgba?\(\s*57\s*[, ]\s*200\s*[, ]\s*137)`;

  assert.match(
    homeStyles,
    new RegExp(`\\.market-rail-card__progress i span\\s*\\{[^}]*background[^;}]*${collectiveGreen}`, "is"),
  );
  assert.match(
    pageStyles,
    new RegExp(`\\.market-progress\\s*>\\s*span\\s*\\{[^}]*background[^;}]*${collectiveGreen}`, "is"),
  );
});

test("le chrome Market reprend le rail et le bandeau sombre du Tremplin sans colorer les offres", async () => {
  const [bandStyles, homeStyles] = await Promise.all([
    readSource("features/market/market-double-band.css"),
    readSource("features/market/market-home.css"),
  ]);

  assert.match(bandStyles, /\.market-page\s*\{[^}]*--market-rail-start:\s*rgba\(139,\s*92,\s*246,\s*0\.82\);/s);
  assert.match(bandStyles, /\.market-page\s*\{[^}]*--market-rail-end:\s*rgba\(92,\s*83,\s*187,\s*0\.82\);/s);
  assert.match(bandStyles, /\.market-primary-rail\s*\{[^}]*top:\s*var\(--market-primary-band-height\);[^}]*bottom:\s*0;[^}]*background:\s*linear-gradient\(\s*135deg,\s*var\(--market-rail-start\),\s*var\(--market-rail-end\)\s*\);/s);
  assert.match(bandStyles, /\.market-primary-rail\s*>\s*\.meewav-primary-nav\s*\{[^}]*background:\s*transparent;[^}]*-webkit-backdrop-filter:\s*none;[^}]*backdrop-filter:\s*none;/s);
  assert.match(bandStyles, /\.market-topbar\s*\{[^}]*border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.055\);[^}]*radial-gradient\(circle at 72% -140%,\s*rgba\(139,\s*92,\s*246,\s*0\.13\),\s*transparent 44%\)[^}]*linear-gradient\(102deg,\s*rgba\(7,\s*7,\s*14,\s*0\.96\),\s*rgba\(10,\s*10,\s*19,\s*0\.86\) 54%,\s*rgba\(7,\s*7,\s*14,\s*0\.76\)\);/s);
  assert.match(bandStyles, /\.market-topbar\s*\{[^}]*box-shadow:[^}]*rgba\(103,\s*63,\s*190,\s*0\.11\)[^}]*backdrop-filter:\s*blur\(18px\) saturate\(0\.92\);/s);
  const mobileChrome = bandStyles.slice(
    bandStyles.indexOf("@media (max-width: 760px)"),
    bandStyles.indexOf("@media (prefers-reduced-motion: reduce)"),
  );
  const desktopChrome = bandStyles.slice(
    bandStyles.indexOf("@media (min-width: 761px)"),
    bandStyles.indexOf("@media (max-width: 1320px)"),
  );
  assert.match(mobileChrome, /--market-primary-band-height:\s*58px;/);
  assert.match(mobileChrome, /\.market-primary-rail\s*\{[^}]*top:\s*auto;[^}]*background:\s*linear-gradient\(\s*135deg,\s*var\(--market-rail-start\),\s*var\(--market-rail-end\)\s*\);/s);
  assert.match(
    desktopChrome,
    /\.market-contextbar\s*\{[^}]*border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.055\);[^}]*background:[^}]*radial-gradient[^}]*linear-gradient[^}]*box-shadow:[^}]*backdrop-filter:\s*blur\(18px\) saturate\(0\.92\);/s,
  );
  assert.match(
    bandStyles,
    /\.market-topbar \.market-pillar-tabs\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*700px;[^}]*height:\s*100%;/s,
  );
  assert.doesNotMatch(
    bandStyles.match(/\.market-topbar\s*\{[^}]*\}/s)?.[0] ?? "",
    /market-(?:offer|universe)-accent/,
  );
  assert.doesNotMatch(
    bandStyles.match(/\.market-primary-rail\s*\{[^}]*\}/s)?.[0] ?? "",
    /market-(?:offer|universe)-accent/,
  );
  assert.match(homeStyles, /\.market-rail-card__favorite\.is-active\s*\{[^}]*color:\s*#[0-9a-f]{6}/is);
});

test("le fond acoustique du Market est propre à cette expérience", async () => {
  const [page, marketStyles, messagingStyles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-page.css"),
    readSource("features/messaging/messaging-page.css"),
  ]);

  assert.match(page, /import\s+["']\.\/market-page\.css["']/);
  assert.doesNotMatch(page, /messaging-page\.css|message-workspace\.css/);
  assert.match(
    marketStyles,
    /\.market-page__background\s*\{[^}]*background:\s*#000 url\(["']\/images\/market\/market-acoustic-wall\.png["']\) center \/ cover no-repeat;/s,
  );
  assert.doesNotMatch(marketStyles, /\.market-page__background::(?:before|after)/);
  assert.doesNotMatch(messagingStyles, /market-acoustic-wall\.png/);
});

test("recherche, filtres, favoris et actions commerciales sont identifiables", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /type=["']search["'][\s\S]{0,500}?onChange=/);
  assert.match(page, /aria-pressed=\{[^}]+\}[\s\S]{0,500}?onClick=/);
  assert.match(page, /toggleFavorite|handleFavorite|setFavorites/);
  assert.match(page, /addToCart|handleAddToCart|setCart/);
  assert.match(page, /bookRental|requestRental|handleRental|Réserver/);
  assert.match(page, /joinCollective|handleCollective|Rejoindre l[’']achat groupé/);
  assert.match(page, /handleServiceBooking|Réserver la prestation|Prendre ma place/);
  assert.match(page, /onClick=/);
});

test("la vue Favoris live hydrate les références exactes sans disparition silencieuse", async () => {
  const [page, hook] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/useMarketLive.ts"),
  ]);

  assert.match(hook, /favoriteProducts[\s\S]*?favoriteProductsStatus/);
  assert.match(page, /const navigationProducts = showFavoritesOnly && marketLive\.active\s*\?\s*marketLive\.favoriteProducts\s*:\s*marketProducts/);
  assert.match(page, /marketLive\.favoriteProductsStatus !== "ready"/);
  assert.match(page, /Certains favoris ne sont plus accessibles/);
  assert.match(page, /Impossible de charger tous tes favoris/);
  assert.match(page, /Tes favoris restent enregistrés/);
  assert.match(page, /marketLive\.favoriteProductsStatus === "error"[\s\S]*?marketLive\.refresh/);
  assert.match(page, /marketLive\.status === "ready" && \(!showFavoritesOnly \|\| marketLive\.favoriteProductsStatus === "ready"\)/);
  assert.match(
    page,
    /showFavoritesOnly && marketLive\.active[\s\S]*?marketLive\.favoriteProducts[\s\S]*?navigationProducts\.find\(\(product\) => product\.id === nextId\)/,
    "les chevrons d’une fiche Favoris doivent résoudre l’annonce dans la collection hydratée affichée",
  );
});

test("un retour Messagerie rouvre l’annonce exacte, même hors de la page catalogue courante", async () => {
  const [page, route] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/messaging/messaging.route.ts"),
  ]);

  assert.match(page, /getMarketplaceListingId\(marketSearchParams\)/);
  assert.match(page, /productCollections[\s\S]*?marketLive\.favoriteProducts[\s\S]*?marketLive\.cartProducts/);
  assert.match(page, /marketplaceRepository\.listCatalog\(\{[\s\S]*?listingIds: \[requestedListingId\][\s\S]*?limit: 1/);
  assert.match(page, /mapMarketplaceCatalogRows\(rows\)[\s\S]*?applyMarketplaceViewerState[\s\S]*?openProduct\(hydratedProduct, \[hydratedProduct\]\)/);
  assert.match(page, /navigate\(buildMarketplaceListingReturnPath\(nextProduct\.id\), \{ replace: true \}\)/);
  assert.match(route, /buildMarketplaceListingReturnPath[\s\S]*?`\/market\?\$\{params\.toString\(\)\}`/);
});

test("le détail d'une offre est une grande carte modale navigable, jamais un drawer", async () => {
  const [page, styles] = await Promise.all([
    readSource("features/market/MarketPage.tsx"),
    readSource("features/market/market-page.css"),
  ]);

  const modalStart = page.indexOf('className="market-product-modal"');
  const cartStart = page.indexOf('drawer === "cart"', modalStart);
  assert.ok(modalStart >= 0, "la grande carte annonce doit utiliser market-product-modal");
  assert.ok(cartStart > modalStart, "le panier doit rester rendu après la carte annonce");
  const productModal = page.slice(modalStart, cartStart);

  assert.match(productModal, /role=["']dialog["']/);
  assert.match(productModal, /aria-modal=["']true["']/);
  assert.doesNotMatch(productModal, /market-drawer/, "la fiche produit ne doit plus sortir de la droite");
  assert.match(productModal, /aria-label=["']Fermer l[’']annonce["'][\s\S]*?<X\b/);
  assert.match(productModal, /market-product-modal__nav--previous[\s\S]*?aria-label=["']Annonce précédente["']/);
  assert.match(productModal, /market-product-modal__nav--next[\s\S]*?aria-label=["']Annonce suivante["']/);
  assert.match(productModal, /onClick=\{\(\) => navigateProduct\(-1\)\}/);
  assert.match(productModal, /onClick=\{\(\) => navigateProduct\(1\)\}/);

  const modalRule = styles.match(/\.market-product-modal\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.ok(modalRule, "la grande carte annonce doit avoir ses propres styles");
  assert.match(modalRule, /position:\s*fixed/);
  const centeredWithTransform = /top:\s*50%/.test(modalRule)
    && /left:\s*50%/.test(modalRule)
    && /translate\(\s*-50%\s*,\s*-50%\s*\)/.test(modalRule);
  const centeredWithInset = /inset:\s*[^;]+/.test(modalRule) && /margin:\s*auto/.test(modalRule);
  assert.ok(centeredWithTransform || centeredWithInset, "la grande carte doit être centrée dans le viewport");

  assert.match(
    page,
    /drawer === ["']cart["'][\s\S]*?<MarketCartPanel[\s\S]*?cart=\{cart\}/,
    "seul le panier conserve un panneau latéral dédié",
  );
  assert.match(page, /import MarketCartPanel from ["']\.\/MarketCartPanel["']/);
});

test("la carte annonce conserve le rail source, boucle avec les chevrons et adapte son récit au type d'offre", async () => {
  const page = await readSource("features/market/MarketPage.tsx");

  assert.match(page, /const openProduct = useCallback\(\([\s\S]*?requestedSourceProducts\?:\s*readonly MarketProductView\[\]/);
  assert.match(page, /onOpen\(product, products\)/, "une carte de rail doit transmettre son rail source");
  assert.match(page, /openProduct\(product, wallProducts\)/, "une carte du mur vertical doit transmettre la séquence visible sans doublons rapprochés");
  assert.match(page, /setDetailProductIds\([\s\S]*?sourceProducts[\s\S]*?\.map\(\(candidate\) => candidate\.id\)/);
  assert.match(page, /const navigateProduct = \(direction: -1 \| 1\)/);
  assert.match(page, /\(currentIndex \+ direction \+ sourceIds\.length\) % sourceIds\.length/);

  assert.match(page, /function getListingNarrative\(product: MarketProductView\)/);
  for (const pillar of ["new", "used", "rental", "services", "collective"]) {
    assert.match(
      page,
      new RegExp(`product\\.pillarId === ["']${pillar}["']`),
      `le récit de l'annonce doit traiter explicitement le mode ${pillar}`,
    );
  }
  assert.match(page, /getListingNarrative\(selectedProduct\)/);
  assert.match(page, /if \(event\.key !== ["']Escape["']\) return;[\s\S]*?setSelectedProduct\(null\)/);
});
