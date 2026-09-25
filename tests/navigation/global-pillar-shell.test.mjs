import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);
const projectRoot = new URL("../../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("l’identité globale MEEWAV / Pilier est partagée par les six piliers", async () => {
  const [brand, brandStyles, messaging, profile, market, rooms, tremplin, shorts] = await Promise.all([
    readSource("components/navigation/MeewavPillarBrand.tsx"),
    readSource("components/navigation/meewav-pillar-brand.css"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/profile/ProfilePage.tsx"),
    readSource("features/market/MarketPage.tsx"),
    readSource("features/rooms/RoomsPage.tsx"),
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/shorts/ShortsPage.tsx"),
  ]);

  assert.match(brand, /MEEWAV/);
  assert.match(brand, /meewav-pillar-brand__separator/);
  assert.doesNotMatch(brand, /meewav-pillar-brand__mark|>MW</);
  assert.match(brandStyles, /font-family:\s*Inter,\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*sans-serif/);
  assert.match(brandStyles, /\.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*680;/s);
  for (const [source, pillar] of [
    [messaging, "Messagerie"],
    [profile, "Profil"],
    [market, "Market"],
    [rooms, "Rooms"],
    [tremplin, "Tremplin"],
  ]) {
    assert.match(source, new RegExp(`<MeewavPillarBrand pillar="${pillar}"\\s*\\/>`));
  }
  assert.match(shorts, /<MeewavPillarBrand pillar=\{SCENE_NAME\}\s*\/>/);
  assert.match(shorts, /aria-label=\{SCENE_NAME\}/);

  assert.match(messaging, /selectedConversation\.name/);
});

test("la navigation Profil sert de mécanique commune aux six piliers", async () => {
  const [tabs, tabStyles, messaging, profile, market, rooms, tremplin, shorts, profileData] = await Promise.all([
    readSource("components/navigation/MeewavPillarTabs.tsx"),
    readSource("components/navigation/meewav-pillar-tabs.css"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/profile/ProfilePage.tsx"),
    readSource("features/market/MarketPage.tsx"),
    readSource("features/rooms/RoomsPage.tsx"),
    readSource("features/tremplin/TremplinPage.tsx"),
    readSource("features/shorts/ShortsPage.tsx"),
    readSource("features/profile/profile.data.ts"),
  ]);

  for (const source of [messaging, profile, market, rooms, tremplin, shorts]) {
    assert.match(source, /<MeewavPillarTabs/);
  }

  for (const label of ["Accueil", "Statistique", "Médias", "Espace privé"]) {
    assert.match(profileData, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(profileData, /Vue d’ensemble|Performance|eyebrow/);
  assert.match(profile, /home:\s*"#f7f5ff"/);
  assert.match(profile, /stats:\s*"#45dfa8"/);
  assert.match(profile, /media:\s*"#c56cff"/);
  assert.match(profile, /space:\s*"#6590ff"/);
  assert.match(tremplin, /id:\s*"discover",\s*label:\s*"Découvrir",\s*icon:\s*Sparkles,\s*accent:\s*"#b79cff"/);
  assert.match(tremplin, /id:\s*"myArtists",\s*label:\s*"Mes artistes",\s*icon:\s*Heart,\s*accent:\s*"#b79cff"/);
  assert.match(messaging, /id:\s*"all",\s*label:\s*"Tous",\s*icon:\s*Sparkles,\s*accent:\s*"#f7f5ff"/);
  assert.match(messaging, /id:\s*"messages",\s*label:\s*"Messages",\s*icon:\s*MessageCircle,\s*accent:\s*"#5b7cff"/);
  assert.match(messaging, /id:\s*"collabs",\s*label:\s*"Collabs",\s*icon:\s*UserPlus,\s*accent:\s*"#a77cff"/);
  assert.match(messaging, /id:\s*"projects",\s*label:\s*"Projets",\s*icon:\s*FolderArchive,\s*accent:\s*"#e9a23b"/);
  assert.match(messaging, /id:\s*"groups",\s*label:\s*"Groupes",\s*icon:\s*Users,\s*accent:\s*"#45dfa8"/);
  assert.match(rooms, /id:\s*"home",\s*label:\s*"Accueil",\s*icon:\s*Home,\s*accent:\s*"#f7f5ff"/);
  assert.match(rooms, /id:\s*"loge",\s*label:\s*"La Loge",\s*icon:\s*DoorOpen,\s*accent:\s*"#e9b949"/);
  assert.match(rooms, /id:\s*"place",\s*label:\s*"La Place",\s*icon:\s*UsersRound,\s*accent:\s*"#45dfa8"/);
  assert.match(rooms, /id:\s*"wave",\s*label:\s*"La Wave",\s*icon:\s*AudioLines,\s*accent:\s*"#27c2d1"/);
  assert.match(rooms, /id:\s*"cage",\s*label:\s*"La Cage",\s*icon:\s*Radio,\s*accent:\s*"#ff5b73"/);
  assert.match(rooms, /id:\s*"classe",\s*label:\s*"La Classe",\s*icon:\s*GraduationCap,\s*accent:\s*"#5b7cff"/);
  assert.match(rooms, /id:\s*"scene",\s*label:\s*"Le Studio",\s*icon:\s*Mic2,\s*accent:\s*"#c56cff"/);

  assert.match(tabs, /meewav-pillar-tabs__icon/);
  assert.match(tabs, /meewav-pillar-tabs__indicator/);
  assert.match(tabs, /home:\s*"#f7f5ff"/);
  assert.match(tabs, /statistics:\s*"#45dfa8"/);
  assert.match(tabs, /media:\s*"#c56cff"/);
  assert.match(tabs, /item\.id === "home" \|\| normalizedLabel === "accueil"/);
  assert.match(tabs, /width:\s*`calc\(\(100% - 8px\) \//);
  assert.match(tabStyles, /font-family:\s*Inter/);
  assert.match(tabStyles, /\.meewav-pillar-tabs\s*\{[^}]*max-width:\s*700px;/s);
  assert.match(tabStyles, /\.meewav-pillar-tabs > button\s*\{[^}]*height:\s*100%;[^}]*padding:\s*0 11px;/s);
  assert.match(tabStyles, /\.meewav-pillar-tabs__icon\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;/s);
  assert.match(tabStyles, /\.meewav-pillar-tabs > button strong\s*\{[^}]*font-size:\s*11\.5px;[^}]*font-weight:\s*720;/s);
  assert.match(tabStyles, /\.meewav-pillar-tabs__indicator\s*\{[^}]*bottom:\s*0;[^}]*left:\s*4px;[^}]*height:\s*2px;/s);
  assert.match(tabStyles, /\.meewav-pillar-tabs > button\.is-active \.meewav-pillar-tabs__icon\s*\{[^}]*color:\s*color-mix\(in srgb,\s*var\(--meewav-pillar-tab-accent\) 76%,\s*white\)/s);
  assert.match(tabStyles, /@media \(max-width:\s*760px\)[\s\S]*?\.meewav-pillar-tabs\s*\{[^}]*padding-inline:\s*3px;/s);
  assert.match(tabStyles, /@media \(max-width:\s*760px\)[\s\S]*?\.meewav-pillar-tabs > button\.is-active\s*\{[^}]*height:\s*calc\(100% - 6px\);/s);
});

test("le trait actif reste aligné au bas du bandeau dans chaque pilier", async () => {
  const [shared, profile, market, messaging, rooms, shorts, tremplin] = await Promise.all([
    readSource("components/navigation/meewav-pillar-tabs.css"),
    readSource("features/profile/profile.css"),
    readSource("features/market/market-double-band.css"),
    readSource("features/messaging/messaging-page.css"),
    readSource("features/rooms/rooms-page.css"),
    readSource("features/shorts/shorts-page.css"),
    readSource("features/tremplin/tremplin-shell.css"),
  ]);

  assert.match(shared, /\.meewav-pillar-tabs__indicator\s*\{[^}]*bottom:\s*0;[^}]*height:\s*2px;/s);
  assert.match(profile, /\.profile-command-bar \.profile-top-tabs\s*\{[^}]*height:\s*100%;[^}]*align-self:\s*stretch;/s);
  assert.match(market, /\.market-topbar \.market-contextbar__toolbar\s*\{[^}]*height:\s*calc\(var\(--market-primary-band-height\) - 16px\);[^}]*align-self:\s*center;/s);
  assert.match(market, /@media \(min-width:\s*1081px\)[\s\S]*?\.market-topbar \.market-pillar-tabs > button\s*\{[^}]*gap:\s*6px;[^}]*padding-inline:\s*7px;/s);
  assert.match(messaging, /\.messaging-page \.mw-chat-header > \.messaging-pillar-tabs\s*\{[^}]*display:\s*grid;[^}]*height:\s*calc\(var\(--messaging-topbar-height\) - 16px\);[^}]*align-self:\s*center;/s);
  assert.match(messaging, /grid-template-columns:\s*minmax\(190px,\s*1fr\)\s+minmax\(0,\s*700px\)\s+minmax\(190px,\s*1fr\);/);
  assert.match(messaging, /\.messaging-page::before\s*\{[^}]*display:\s*none;/s);
  assert.match(messaging, /\.messaging-page \.mw-chat-header\s*\{[^}]*border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.055\);/s);
  assert.match(messaging, /\.messaging-page \.mw-chat-header\s*\{[^}]*box-shadow:[^}]*0 9px 28px rgba\(103,\s*63,\s*190,\s*0\.11\),/s);
  assert.match(messaging, /@media \(max-width:\s*760px\)[\s\S]*?\.messaging-page \.mw-chat-header\s*\{[^}]*height:\s*58px;[^}]*gap:\s*7px;[^}]*padding:\s*5px 10px;/s);
  assert.match(rooms, /\.rooms-topbar > \.rooms-pillar-tabs\s*\{[^}]*height:\s*calc\(var\(--rooms-topbar-height\) - 16px\);[^}]*align-self:\s*center;/s);
  assert.match(rooms, /\.rooms-topbar > \.rooms-pillar-tabs \.meewav-pillar-tabs__icon\s*\{[^}]*display:\s*none;/s);
  assert.match(rooms, /\.rooms-topbar > \.rooms-pillar-tabs > button strong\s*\{[^}]*display:\s*block;[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/s);
  assert.match(shorts, /\.shorts-topbar > \.shorts-pillar-tabs\s*\{[^}]*height:\s*calc\(var\(--shorts-topbar-height\) - 16px\);[^}]*align-self:\s*center;/s);
  assert.match(tremplin, /\.tremplin-topbar \.tremplin-contextbar__toolbar\s*\{[^}]*height:\s*calc\(var\(--tremplin-primary-band-height\) - 16px\);[^}]*align-self:\s*center;/s);
  assert.match(tremplin, /@media \(min-width:\s*1081px\)[\s\S]*?\.tremplin-topbar \.tremplin-contextbar__toolbar\s*\{[^}]*transform:\s*translateX\(-13\.53px\);/s);
  assert.match(rooms, /\.rooms-page,[\s\S]*?box-sizing:\s*border-box;/s);
  for (const styles of [profile, market, rooms, shorts, tremplin]) {
    assert.match(styles, /max-width:\s*700px/);
  }
  assert.match(messaging, /\.messaging-page \.mw-chat-header > \.messaging-pillar-tabs\s*\{[^}]*max-width:\s*840px;/s);
  assert.match(messaging, /\.messaging-stage\s*\{[^}]*left:\s*0;/s);
  assert.match(messaging, /\.messaging-page \.mw-chat-header__brand\s*\{[^}]*width:\s*auto;[^}]*transform:\s*none;/s);
  assert.match(tremplin, /\.tremplin-topbar \.tremplin-brand__copy \.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*22px;[^}]*font-weight:\s*780;/s);
});

test("le dock conserve un état actif accessible piloté par toutes les sous-routes", async () => {
  const [navigation, navigationStyles] = await Promise.all([
    readSource("features/globe/components/MeewavPrimaryNav.tsx"),
    readSource("features/globe/components/MeewavPrimaryNav.css"),
  ]);

  for (const segment of ["messages", "messagerie", "profile", "profil", "market", "tremplin", "scene", "shorts", "rooms", "room"]) {
    assert.match(navigation, new RegExp(`firstSegment === "${segment}"`));
  }
  assert.match(navigation, /routeDestination \?\? activeDestination/);
  assert.match(navigation, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(navigationStyles, /\.meewav-primary-nav__item\.is-active:not\(\.is-map\)::after/);
  assert.match(navigationStyles, /\.meewav-primary-nav__item:focus-visible\s*\{[^}]*outline:/s);
});

test("Profil reste séparé des six piliers et ancré au bord du rail", async () => {
  const [
    navigation,
    navigationStyles,
    messagingStyles,
    profileStyles,
    marketStyles,
    roomsStyles,
    shortsStyles,
    tremplinStyles,
  ] = await Promise.all([
    readSource("features/globe/components/MeewavPrimaryNav.tsx"),
    readSource("features/globe/components/MeewavPrimaryNav.css"),
    readSource("features/messaging/messaging-page.css"),
    readSource("features/profile/profile.css"),
    readSource("features/market/market-double-band.css"),
    readSource("features/rooms/rooms-page.css"),
    readSource("features/shorts/shorts-page.css"),
    readSource("features/tremplin/tremplin-shell.css"),
  ]);

  assert.match(navigation, /const pillarDestinations:\s*PrimaryDestination\[\]/);
  assert.match(navigation, /const profileDestination:\s*PrimaryDestination/);
  assert.match(navigation, /className="meewav-primary-nav__pillars"[\s\S]*?aria-label="Piliers MeeWav"/);
  assert.match(navigation, /className="meewav-primary-nav__account"[\s\S]*?aria-label="Compte MeeWav"/);
  assert.match(
    navigation,
    /meewav-primary-nav__pillars[\s\S]*?pillarDestinations\.map\(renderDestination\)[\s\S]*?meewav-primary-nav__account[\s\S]*?renderDestination\(profileDestination\)/,
  );

  assert.match(navigationStyles, /\.meewav-primary-nav\s*\{[^}]*top:\s*132px;[^}]*bottom:\s*24px;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__pillars\s*\{[^}]*flex:\s*1 1 auto;[^}]*justify-content:\s*center;[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__account\s*\{[^}]*margin-top:\s*auto;[^}]*padding-top:\s*19px;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__account::before\s*\{[^}]*linear-gradient/s);
  assert.match(
    navigationStyles,
    /@media \(max-width:\s*760px\)[\s\S]*?\.meewav-primary-nav__pillars\s*\{[^}]*flex-direction:\s*row;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s,
  );
  assert.match(
    navigationStyles,
    /@media \(max-width:\s*760px\)[\s\S]*?\.meewav-primary-nav__account\s*\{[^}]*flex:\s*0 0 auto;[^}]*padding-left:\s*8px;/s,
  );

  for (const [styles, selector] of [
    [messagingStyles, "messaging-rail"],
    [profileStyles, "profile-primary-rail"],
    [marketStyles, "market-primary-rail"],
    [roomsStyles, "rooms-primary-rail"],
    [shortsStyles, "shorts-primary-rail"],
    [tremplinStyles, "tremplin-primary-rail"],
  ]) {
    assert.match(
      styles,
      new RegExp(`\\.${selector}\\s*>\\s*\\.meewav-primary-nav\\s*\\{[^}]*height:\\s*100%;`, "s"),
    );
  }
});

test("les titres MEEWAV suivent le bord visuel du Globe dans le rail", async () => {
  const [messaging, profile, market, rooms, shorts, tremplin, navigationStyles] = await Promise.all([
    readSource("features/messaging/messaging-page.css"),
    readSource("features/profile/profile.css"),
    readSource("features/market/market-double-band.css"),
    readSource("features/rooms/rooms-page.css"),
    readSource("features/shorts/shorts-page.css"),
    readSource("features/tremplin/tremplin-shell.css"),
    readSource("features/globe/components/MeewavPrimaryNav.css"),
  ]);

  assert.match(navigationStyles, /\.meewav-primary-nav__globe\s*\{[^}]*width:\s*38px;/s);
  for (const [styles, titleToken, railToken] of [
    [messaging, "messaging-pillar-title-inset", "messaging-nav-space"],
    [profile, "profile-pillar-title-inset", "profile-primary-rail-width"],
    [market, "market-pillar-title-inset", "market-nav-space"],
    [rooms, "rooms-title-inset", "rooms-nav-space"],
    [shorts, "shorts-title-inset", "shorts-nav-space"],
    [tremplin, "tremplin-pillar-title-inset", "tremplin-nav-space"],
  ]) {
    assert.match(
      styles,
      new RegExp(`--${titleToken}:\\s*calc\\(\\(var\\(--${railToken}\\) - 38px\\) \\/ 2\\);`),
    );
  }

  assert.match(
    profile,
    /@media \(min-width:\s*761px\) and \(max-width:\s*1080px\)[\s\S]*?\.profile-command-bar\s*\{[^}]*padding-left:\s*var\(--profile-pillar-title-inset\);/s,
  );
});

test("Rooms expose le support visuel fourni sans simuler le produit final", async () => {
  const [app, page, styles] = await Promise.all([
    readSource("App.tsx"),
    readSource("features/rooms/RoomsPage.tsx"),
    readSource("features/rooms/rooms-page.css"),
  ]);

  assert.match(app, /path="\/rooms\/\*" element=\{<RoomsRoute\s*\/>\}/);
  assert.match(page, /<MeewavPrimaryNav[\s\S]*?activeDestination="rooms"/);
  assert.match(page, /<MeewavPillarBrand pillar="Rooms"\s*\/>/);
  assert.match(page, /className="rooms-pillar-tabs"/);
  assert.match(page, /<MeewavPillarTabs/);
  for (const roomName of ["Accueil", "La Loge", "La Place", "La Wave", "La Cage", "La Classe", "Le Studio"]) {
    assert.match(page, new RegExp(`label: "${roomName}"`));
  }
  assert.match(page, /className="rooms-page__future-surface"/);
  assert.doesNotMatch(page, /<video|<article|<form/i);
  assert.match(styles, /rooms-acoustic-wall-web\.webp/);
  assert.match(styles, /rooms-acoustic-wall-8k\.webp/);
  assert.match(styles, /\.rooms-topbar \.meewav-pillar-brand__pillar\s*\{[^}]*font-size:\s*22px;[^}]*font-weight:\s*780;/s);
});

test.skip("ancien contrat statique Shorts remplacé par le contrat produit La Scène", async () => {
  const [app, page, player, collaboration, creator, wallData, styles, navigationStyles] = await Promise.all([
    readSource("App.tsx"),
    readSource("features/shorts/ShortsPage.tsx"),
    readSource("features/shorts/ShortsVideoPlayer.tsx"),
    readSource("features/shorts/ShortsCollaborationDialog.tsx"),
    readSource("features/shorts/ShortsCreatorDrawer.tsx"),
    readSource("features/shorts/shorts-wall-data.ts"),
    readSource("features/shorts/shorts-page.css"),
    readSource("features/globe/components/MeewavPrimaryNav.css"),
  ]);

  assert.match(app, /path=\{`\$\{SCENE_ROUTE\}\/\*`\} element=\{<ShortsRoute\s*\/>\}/);
  assert.match(app, /path=\{`\$\{LEGACY_SHORTS_ROUTE\}\/\*`\} element=\{<RedirectToScene\s*\/>\}/);
  assert.match(page, /<MeewavPrimaryNav[\s\S]*?activeDestination="shorts"/);
  assert.match(page, /className="shorts-home"/);
  assert.match(page, /className="shorts-contentbar"/);
  assert.match(page, /className=\{`shorts-search[\s\S]*?Le talent se montre\.[\s\S]*?Les projets commencent ici\.[\s\S]*?className="shorts-create-button"/);
  assert.match(page, /className=\{`shorts-search__filter/);
  assert.match(page, /<DailyHeadlineRail/);
  assert.match(page, /<ShortsWall/);
  assert.match(page, /SHORTS_HOME_ORDER\.filter/);
  assert.match(wallData, /title:\s*"À la une"/);
  assert.match(wallData, /dernières 24 heures/);
  assert.match(wallData, /title:\s*"Pour toi"/);
  assert.match(wallData, /title:\s*"Shorts verticaux"/);
  assert.match(wallData, /title:\s*"Talents ouverts aux collaborations"/);
  assert.match(wallData, /title:\s*"Meewav TV"/);
  assert.match(wallData, /title:\s*"Replays des Rooms"/);
  assert.match(wallData, /title:\s*"Showreels et démos"/);
  assert.match(page, /Pour toi/);
  assert.doesNotMatch(page, /id:\s*"live"|LIVE_SESSIONS|Sessions en direct/);
  assert.match(page, /Trouver le bon talent/);
  assert.doesNotMatch(page, /shorts-filterbar|shorts-filter-trigger/);
  assert.doesNotMatch(page, /Découverte personnalisée|Trouvez le talent adapté à votre prochain projet/);
  assert.doesNotMatch(page, /className="shorts-scenes/);
  assert.match(creator, /Créer aussi un showreel 16:9/);
  assert.match(creator, /Caméra arrière/);
  assert.match(creator, /Lier le Short et le showreel desktop/);
  assert.match(page, /<ShortsVideoPlayer/);
  assert.match(player, /Demande de collab/);
  assert.match(collaboration, /Proposer un projet/);
  assert.match(page, /<ShortsCollaborationDialog/);
  assert.match(player, /Voir le profil/);
  assert.match(player, /<video[\s\S]*?autoPlay[\s\S]*?playsInline[\s\S]*?preload="auto"/);
  assert.doesNotMatch(player, /<video[\s\S]*?\scontrols(?:\s|>)/);
  assert.match(player, /requestFullscreen/);
  assert.match(player, /requestPictureInPicture/);
  assert.match(player, /navigator\.mediaSession/);
  assert.match(player, /is-miniplayer/);
  assert.match(player, /PLAYBACK_RATES/);
  assert.match(player, /key === "k"/);
  assert.match(player, /key === "f"/);
  assert.match(player, /key === "i"/);
  assert.match(wallData, /landscape-dj\.mp4/);
  assert.match(wallData, /portrait-studio-rap\.mp4/);
  assert.match(wallData, /export const SHORTS_WALL_MINIMUM = 30/);
  assert.match(player, /role=\{isMiniplayer \? "region" : "dialog"\}[\s\S]*?aria-modal=\{isMiniplayer \? undefined : true\}/);
  assert.doesNotMatch(page, /fetch\(|supabase|uploadShort|publishShort/);
  assert.doesNotMatch(page, /thumb2\.jpg/);
  assert.match(styles, /font-family:\s*Inter,\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*sans-serif/);
  assert.match(styles, /url\("\/images\/shorts\/shorts-acoustic-wall\.webp"\)/);
  assert.match(styles, /\.shorts-topbar\s*\{[^}]*height:\s*var\(--shorts-topbar-height\);[^}]*padding:\s*8px var\(--shorts-title-inset\);[^}]*linear-gradient\(102deg,\s*rgba\(7,\s*7,\s*14,\s*0\.96\),\s*rgba\(10,\s*10,\s*19,\s*0\.86\) 54%,\s*rgba\(7,\s*7,\s*14,\s*0\.76\)\);/s);
  assert.match(styles, /\.shorts-primary-rail\s*\{[^}]*top:\s*var\(--shorts-topbar-height\);/s);
  assert.match(styles, /\.shorts-primary-rail\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*rgba\(139,\s*92,\s*246,\s*0\.82\),\s*rgba\(92,\s*83,\s*187,\s*0\.82\)\);[^}]*backdrop-filter:\s*blur\(18px\) saturate\(0\.92\);/s);
  assert.doesNotMatch(styles, /linear-gradient\(180deg,\s*rgba\(8,\s*11,\s*18,\s*\.98\),\s*rgba\(3,\s*6,\s*11,\s*\.98\)\)/);
  assert.match(styles, /\.shorts-primary-rail\s*>\s*\.meewav-primary-nav\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*-webkit-backdrop-filter:\s*none;[^}]*backdrop-filter:\s*none;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__item\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__item svg\s*\{[^}]*width:\s*27px;[^}]*height:\s*27px;/s);
  assert.match(navigationStyles, /\.meewav-primary-nav__globe\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s);
  assert.doesNotMatch(styles, /\.shorts-primary-rail\s*>\s*\.meewav-primary-nav \.meewav-primary-nav__item\s*\{/);
  assert.match(styles, /\.shorts-daily__rail\s*\{/);
  assert.match(styles, /\.shorts-wall__grid\s*\{[^}]*columns:\s*5 220px;[^}]*overflow-x:\s*visible;/s);
  assert.match(styles, /\.shorts-video-card\.is-portrait \.shorts-landscape-card__media\s*\{[^}]*aspect-ratio:\s*9 \/ 16;/s);
  assert.match(styles, /\.shorts-shelf__grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s);
  assert.match(styles, /\.shorts-video-card__availability\s*\{/);
  assert.match(styles, /\.shorts-search__filter\s*\{/);
  assert.match(styles, /\.shorts-filter-panel\s*\{/);
  assert.match(styles, /\.shorts-create-drawer\s*\{/);
  assert.match(styles, /\.shorts-player-frame:fullscreen\s*\{/);
  assert.match(styles, /\.shorts-player-layer\.is-miniplayer\s*\{/);
  assert.match(styles, /\.shorts-player-layer\.is-theater\s*\{/);
  assert.match(styles, /@media \(max-width:\s*760px\)/);

  const lensBlock = page.match(/const MUSIC_LENSES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.equal([...lensBlock.matchAll(/^\s*"[^"]+",?$/gm)].length, 28, "les vingt-huit scènes doivent rester adressables");
});

test("La Scène conserve le chrome global et respecte son contrat média", async () => {
  const [app, page, player, contract, discovery, wallData, tv, styles] = await Promise.all([
    readSource("App.tsx"),
    readSource("features/shorts/ShortsPage.tsx"),
    readSource("features/shorts/ShortsVideoPlayer.tsx"),
    readSource("features/shorts/sceneContract.ts"),
    readSource("features/scene/sceneDiscoveryModel.ts"),
    readSource("features/shorts/shorts-wall-data.ts"),
    readSource("features/scene/tv/SceneTvSchedule.tsx"),
    readSource("features/shorts/shorts-product-polish.css"),
  ]);

  assert.match(app, /path=\{`\$\{SCENE_ROUTE\}\/\*`\} element=\{<ShortsRoute\s*\/>\}/);
  assert.match(app, /path=\{`\$\{LEGACY_SHORTS_ROUTE\}\/\*`\} element=\{<RedirectToScene\s*\/>\}/);
  assert.match(contract, /SCENE_NAME = "La Scène"/);
  assert.match(contract, /Là où le talent règne sur l’algorithme\./);
  assert.match(contract, /Un flux 100 % musique conçu pour faire émerger les créations, les performances et les artistes\./);
  assert.match(page, /<MeewavPillarBrand pillar=\{SCENE_NAME\}\s*\/>/);
  assert.match(page, /label: "Accueil"/);
  assert.match(page, /label: "Suivis"/);
  assert.match(page, /label: "TV"/);
  assert.match(page, /label: "Explorer"/);
  assert.match(page, /<MeewavSearchFilterBar/);
  assert.match(page, /Rechercher une vidéo, un artiste, un morceau ou un style/);
  assert.match(page, /<SceneTvSchedule/);
  assert.match(page, /Continue à regarder/);
  assert.match(page, /sceneWatchHistoryRepository/);
  assert.match(page, /<ShortsVideoPlayer/);
  assert.match(player, /preload="metadata"/);
  assert.match(player, /requestFullscreen/);
  assert.match(player, /requestPictureInPicture/);
  assert.match(player, /navigator\.mediaSession/);
  assert.match(player, /is-miniplayer/);
  assert.match(discovery, /id: "room-replay", label: "Replay de Room"/);
  assert.match(discovery, /publicationState/);
  assert.match(wallData, /Shorts/);
  assert.match(wallData, /Le direct reste dans Rooms/);
  assert.match(tv, /Premières, clips, sessions et formats éditoriaux sélectionnés dans La Scène/);
  assert.doesNotMatch(page, /Rooms qui buzzent|Top Rooms|Sessions en direct/);
  assert.doesNotMatch(page, /prix du jeton|variation du jeton|volume financier/i);
  assert.match(styles, /\.scene-page \.scene-video-card__media\.shorts-landscape-card__media\s*\{/);
  assert.match(styles, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});
