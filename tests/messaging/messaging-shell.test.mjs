import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);
const projectRoot = new URL("../../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("l’envoi joue le son nettoyé uniquement après confirmation", async () => {
  const [sounds, workspace, projects, groups, live, soundAsset] = await Promise.all([
    readSource("features/messaging/messagingSounds.ts"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/ProjectsWorkspace.tsx"),
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/useMessagingLive.ts"),
    stat(new URL("public/audio/messaging/message-sent-pro.mp3", projectRoot)),
  ]);

  assert.ok(soundAsset.size > 8_000 && soundAsset.size < 16_000, "le son doit rester court et correctement encodé");
  assert.match(sounds, /MESSAGE_SENT_SOUND_URL\s*=\s*["']\/audio\/messaging\/message-sent-pro\.mp3["']/);
  assert.match(sounds, /audio\.preload\s*=\s*["']auto["']/);
  assert.match(sounds, /audio\.volume\s*=\s*MESSAGE_SENT_VOLUME/);
  assert.match(workspace, /useEffect\(\(\) => \{[\s\S]*?preloadMessageSounds\(\)/);
  assert.match(workspace, /Promise\.resolve\(liveController\.sendText\(body\)\)\.then\(\(result\) => \{[\s\S]*?if \(result && soundsEnabled && !muted\)[\s\S]*?playMessageSound\(["']send["']\)/);
  assert.match(live, /const delivered = await deliverMessage\(clientMessageId\);[\s\S]*?return delivered \? clientMessageId : null/);
  assert.ok((workspace.match(/playMessageSound\(["']send["']\)/g) ?? []).length >= 4, "tous les formats sortants doivent partager le même son");
  assert.match(projects, /await live\.sendText\(body\);[\s\S]*?playMessageSound\(["']send["']\)/);
  assert.match(groups, /if \(result === null \|\| result === false\)[\s\S]*?return;[\s\S]*?playMessageSound\(["']send["']\)/);
  assert.match(groups, /attachments\.clearSent\?\.\(\);[\s\S]*?playMessageSound\(["']send["']\)/);
});

test("la route /messages précharge son module et conserve un écran d’attente autonome", async () => {
  const [app, loadingStyles] = await Promise.all([
    readSource("App.tsx"),
    readSource("styles/route-loading.css"),
  ]);
  assert.match(app, /function\s+loadMessagingPage\(\)[\s\S]*?import\(["']\.\/features\/messaging\/MessagingPage["']\)/);
  assert.match(app, /const\s+MessagingPage\s*=\s*lazy\(loadMessagingPage\)/);
  assert.match(app, /if\s*\(typeof window !== ["']undefined["']\)\s*\{[\s\S]*?void loadMessagingPage\(\)\.catch/);
  assert.match(app, /import ["']\.\/styles\/route-loading\.css["']/);
  assert.match(app, /className=["']app-route-loading["'][\s\S]*?className=["']app-route-loading__orb["']/);
  assert.match(loadingStyles, /\.app-route-loading\s*\{[\s\S]*?position:\s*fixed[\s\S]*?background:[\s\S]*?#070511/);
  assert.match(app, /function MessagingRoute\(\)[\s\S]*?<MessagingPage\s*\/>/);
  assert.match(app, /<Route\s+[\s\S]*?path=["']\/messages["'][\s\S]*?element=\{<MessagingRoute\s*\/>\}/);
});

test("le globe ouvre la messagerie et la messagerie réutilise la navbar verticale Meewav", async () => {
  const [navigation, page] = await Promise.all([
    readSource("features/globe/components/MeewavPrimaryNav.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
  ]);
  assert.match(navigation, /id:\s*["']messages["'][\s\S]*?navigate\(["']\/messages["']\)/);
  assert.match(navigation, /id:\s*["']profile["'][\s\S]*?navigate\(["']\/profile["']\)/);
  assert.match(page, /import MeewavPrimaryNav/);
  assert.match(page, /<MeewavPrimaryNav[\s\S]*?activeDestination="messages"/);
  assert.doesNotMatch(page, /MEEWAV CONNECTIONS|12 artistes en ligne|ConversationInspector/);
  assert.match(page, /navigate\(MON_GLOBE_ROUTE,\s*\{[\s\S]*?state:\s*MON_GLOBE_HOST_POSITION_NAVIGATION_STATE/);
});

test("le chrome Messagerie reprend le rail et le bandeau supérieur du Tremplin", async () => {
  const [styles, workspaceStyles] = await Promise.all([
    readSource("features/messaging/messaging-page.css"),
    readSource("features/messaging/message-workspace.css"),
  ]);

  assert.match(styles, /--messaging-rail-start:\s*rgba\(139,\s*92,\s*246,\s*0\.82\)/);
  assert.match(styles, /--messaging-rail-end:\s*rgba\(92,\s*83,\s*187,\s*0\.82\)/);
  assert.match(styles, /--messaging-topbar-height:\s*clamp\(54px,\s*5\.4vh,\s*58px\)/);
  assert.match(styles, /\.messaging-rail\s*\{[\s\S]*?top:\s*var\(--messaging-topbar-height\)[\s\S]*?linear-gradient\(\s*135deg,\s*var\(--messaging-rail-start\),\s*var\(--messaging-rail-end\)/);
  assert.match(styles, /\.messaging-rail > \.meewav-primary-nav\s*\{[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/);
  assert.match(styles, /\.messaging-page::before\s*\{[\s\S]*?height:\s*var\(--messaging-topbar-height\)[\s\S]*?radial-gradient\([\s\S]*?linear-gradient\(102deg/);
  assert.match(styles, /\.messaging-page \.mw-workspace\s*\{[\s\S]*?grid-template-areas:\s*"topbar topbar"\s*"rail chat"/);
  assert.match(styles, /\.messaging-page \.mw-chat-header__brand\s*\{[\s\S]*?border-right:\s*0[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/);
  assert.match(workspaceStyles, /\.messaging-page \.mw-chat-header__brand small\s*\{[\s\S]*?color:\s*rgba\(169,\s*155,\s*255,\s*0\.72\)/);
  assert.match(workspaceStyles, /\.messaging-page \.mw-chat-header__brand strong\s*\{[\s\S]*?color:\s*#f1f3f8/);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?\.messaging-rail\s*\{[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*0[\s\S]*?linear-gradient\(\s*135deg,\s*var\(--messaging-rail-start\),\s*var\(--messaging-rail-end\)/);
});

test("le séparateur pilote la largeur visible de la liste des conversations", async () => {
  const styles = await readSource("features/messaging/messaging-page.css");
  const desktopShell = styles.slice(styles.indexOf("/* Navigation maître MeeWav"));

  assert.match(
    desktopShell,
    /\.messaging-page \.mw-workspace\s*\{[\s\S]*?grid-template-columns:\s*var\(\s*--mw-contact-rail-width,\s*calc\(var\(--messaging-nav-space\) \+ var\(--messaging-contact-width\)\)\s*\)\s*minmax\(0,\s*1fr\)/,
  );
});

test("les quatre espaces Flutter sont présents dans l'ordre exact", async () => {
  const page = await readSource("features/messaging/MessageWorkspace.tsx");
  const positions = ["messages", "collabs", "projects", "groups"].map((id) => page.indexOf(`id: "${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  for (const label of ["Messages", "Collabs", "Projets", "Groupes"]) assert.match(page, new RegExp(`label: "${label}"`));
});

test("les cinq chips pilotent une liste persistante et seul le panneau droit change", async () => {
  const [page, workspace, styles] = await Promise.all([
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/messaging-page.css"),
  ]);
  const fixedHeaderStyles = styles.slice(styles.indexOf("/* Navigation maître MeeWav"));

  assert.equal((page.match(/<MessageWorkspace\b/g) ?? []).length, 1, "la page doit conserver un seul shell de messagerie");
  assert.doesNotMatch(page, /activeTab\s*===\s*["'](?:messages|collabs|projects|groups)["']/);
  assert.match(page, /type MessagingSpace/);
  assert.match(page, /if \(activeSpace === "messages"\) return messageRailItems/);
  assert.match(page, /if \(activeSpace === "collabs"\) return collabRailItems/);
  assert.match(page, /if \(activeSpace === "projects"\) return projectRailItems/);
  assert.match(page, /if \(activeSpace === "groups"\) return groupRailItems/);
  assert.match(page, /return \[\.\.\.messageRailItems, \.\.\.collabRailItems, \.\.\.projectRailItems, \.\.\.groupRailItems\]/);
  assert.match(page, /contentSpace=\{contentSpace\}/);
  assert.match(page, /rightPane=\{rightPane\}/);
  assert.match(page, /onConversationsChange=\{liveEnabled \? undefined : setMessageItems\}/);
  assert.match(page, /displayedMessageItems\.map\(conversationSidebarItem\)/);
  assert.match(page, /liveController=\{liveController\}/);
  assert.match(page, /useMessagingLive\(\{/);
  assert.match(workspace, /liveController\?: MessagingWorkspaceLiveController \| null/);
  assert.match(page, /selectionRequestFromConversation\(conversation, token\)/);
  assert.doesNotMatch(page, /demoConversations\.find\(\(candidate\) => candidate\.id === item\.id\)/);

  for (const id of ["all", "messages", "collabs", "projects", "groups"]) {
    assert.match(workspace, new RegExp(`id: "${id}"`));
  }
  assert.match(workspace, /<MeewavPillarTabs[\s\S]*?items=\{messagingSpaces\}[\s\S]*?activeId=\{activeSpace\}/);
  assert.match(workspace, /onSelect=\{\(space\) => onSpaceChange\?\.\(space\)\}/);
  assert.match(fixedHeaderStyles, /\.messaging-page \.mw-chat-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(190px, 1fr\) minmax\(0, 840px\) minmax\(190px, 1fr\)/);
  assert.match(fixedHeaderStyles, /\.messaging-page \.mw-chat-header__brand\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?justify-self:\s*start/);
  assert.match(fixedHeaderStyles, /\.messaging-page \.mw-chat-header > \.messaging-pillar-tabs\s*\{[\s\S]*?max-width:\s*840px;[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*center;[\s\S]*?margin:\s*0 auto/);
  assert.match(fixedHeaderStyles, /\.messaging-page \.mw-chat-header > nav:not\(\.messaging-pillar-tabs\)\s*\{[\s\S]*?grid-column:\s*3/);
  assert.match(fixedHeaderStyles, /\.messaging-page \.mw-chat-header > \.mw-chat-header__utility\s*\{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?justify-self:\s*stretch/);
  assert.doesNotMatch(fixedHeaderStyles, /grid-template-columns:\s*minmax\(190px, auto\) minmax\(0, 1fr\) minmax\(175px, auto\)/);
  assert.match(workspace, /<aside className="mw-conversation-rail">[\s\S]*?<section className="mw-context-pane"/);
  assert.match(workspace, /visibleRailItems\.map/);
  assert.match(workspace, /onConversationsChangeRef\.current\?\.\(conversations\)/);
});

test("les conversations et messages reprennent le working tree Flutter actif", async () => {
  const data = await readSource("features/messaging/messagingDemoData.ts");
  for (const name of ["Echo Flow", "Neon Pulse", "Projet Album 2025", "Lisa Music", "The Producer", "Cover Design"]) {
    assert.match(data, new RegExp(name));
  }
  for (const exactMessage of [
    "Salut ! Tu as avancé sur le projet ?",
    "Écoute à 1:32, le drop est incroyable",
    "Woow les pistes séparées c'est parfait !",
    "Au studio de Nova, tu connais ?",
  ]) assert.match(data, new RegExp(exactMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const track of ["kick.wav", "synth_lead.wav", "vocals.wav", "drums.wav", "bass.wav", "melody.wav", "pads.wav"]) assert.match(data, new RegExp(track.replace(".", "\\.")));
  assert.match(data, /trackDurations: \["2:45", "2:45", "2:30"\]/);
  assert.match(data, /trackDurations: \["3:28", "3:28", "3:28", "3:15"\]/);
  const echoFlow = data.slice(data.indexOf('id: "echo-flow"'), data.indexOf('id: "neon-pulse"'));
  assert.equal((echoFlow.match(/\{ id: "msg_/g) ?? []).length, 66);
  assert.equal((echoFlow.match(/kind: "text"/g) ?? []).length, 55);
  assert.equal((echoFlow.match(/kind: "audio"/g) ?? []).length, 5);
  assert.equal((echoFlow.match(/kind: "audio-file"/g) ?? []).length, 4);
  assert.equal((echoFlow.match(/kind: "track-pack"/g) ?? []).length, 2);
  for (const historicalMessage of [
    "Yo ! T'es dispo pour bosser sur un projet ?",
    "J'ai avancé sur le squelette de la prod, je t'envoie ça",
    "Entre 140 et 150, il aime bien quand ça tape",
    "beat_draft_v1.wav",
    "voice_feedback.m4a",
    "beat_v2_bass_boost.wav",
  ]) assert.match(echoFlow, new RegExp(historicalMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("la nouvelle conversation utilise exclusivement les six mockUsers Flutter", async () => {
  const [data, messages] = await Promise.all([
    readSource("features/messaging/messagingDemoData.ts"),
    readSource("features/messaging/MessageWorkspace.tsx"),
  ]);
  const contactsStart = data.indexOf("export const demoContacts");
  const contactsEnd = data.indexOf("\n];", contactsStart);
  assert.ok(contactsStart >= 0 && contactsEnd > contactsStart, "le tableau demoContacts doit être localisable");
  const contacts = data.slice(contactsStart, contactsEnd + 3);
  for (const name of ["Echo Flow", "Neon Pulse", "Stellar Vibe", "Lisa Music", "The Producer", "Vocal Queen"]) assert.match(contacts, new RegExp(name));
  assert.equal((contacts.match(/id: "user_\d"/g) ?? []).length, 6);
  assert.doesNotMatch(contacts, /Projet Album 2025|Cover Design/);
  assert.match(messages, /demoContacts\.filter/);
});

test("les six fils visibles ont un historique riche et un statut pilier distinct", async () => {
  const { demoConversations } = await import(new URL("../../src/features/messaging/messagingDemoData.ts", import.meta.url));
  const expectedThreads = new Map([
    ["echo-flow", "En ligne sur le Globe"],
    ["album-2025", "Session active dans Projets"],
    ["neon-pulse", "En ligne sur le Short"],
    ["the-producer", "En live dans les Rooms"],
    ["cover-design", "En ligne sur le Marketplace"],
    ["mix-master-club", "Équipe active dans Groupes"],
  ]);

  const statuses = [];
  for (const [id, expectedStatus] of expectedThreads) {
    const conversation = demoConversations.find((candidate) => candidate.id === id);
    assert.ok(conversation, `le fil ${id} doit exister`);
    assert.equal(conversation.status, expectedStatus);
    assert.ok(conversation.messages.length >= 8, `${id} doit proposer un historique suffisamment long`);
    assert.ok(new Set(conversation.messages.map((message) => message.kind)).size >= 3, `${id} doit mélanger au moins trois formats`);

    const messageIds = new Set(conversation.messages.map((message) => message.id));
    assert.equal(messageIds.size, conversation.messages.length, `${id} ne doit pas contenir d'identifiant dupliqué`);
    for (const message of conversation.messages) {
      if (message.replyToId) assert.ok(messageIds.has(message.replyToId), `${id}: réponse orpheline ${message.replyToId}`);
    }
    statuses.push(conversation.status);
  }

  assert.equal(new Set(statuses).size, expectedThreads.size, "chaque pilier doit avoir son propre statut");
});

test("les 13 collaborations Flutter et leurs trois états sont conservés", async () => {
  const data = await readSource("features/messaging/messagingDemoData.ts");
  const collabs = data.slice(data.indexOf("export const demoCollabs"));
  for (const name of ["Ghost Synth", "Ruby Resonance", "Kinetic Flow", "SkyVox", "MixMaster Pro", "PixelArt Studio", "Neon Dreams", "VibeSetter", "StudioX", "Bass Monster"]) {
    assert.match(data, new RegExp(name));
  }
  assert.equal((collabs.match(/status: "pending"/g) ?? []).length, 5);
  assert.equal((collabs.match(/status: "sent"/g) ?? []).length, 4);
  assert.equal((collabs.match(/status: "accepted"/g) ?? []).length, 4);
});

test("Groupes reste l'outil de création et gestion des collectifs d'artistes", async () => {
  const [groups, workspace, page, groupStyles] = await Promise.all([
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/artist-groups-workspace.css"),
  ]);
  for (const name of ["Midnight Echo", "Neon Pulse", "Silent Room", "The Cypher", "Roots & Strings"]) assert.match(groups, new RegExp(name));
  for (const step of ["Identité", "Membres", "Récap"]) assert.match(groups, new RegExp(step));
  for (const space of ["Chat", "Planning", "Décisions", "Projets liés", "Paramètres"]) assert.match(groups, new RegExp(space));
  assert.match(groups, /Groupe privé \(par défaut\)/);
  assert.match(groups, /Prêt à collaborer/);
  assert.match(groups, /const firstGroup = \(liveController\?\.groups \?\? artistGroupSessionItems \?\? initialGroups\)\[0\]/);
  assert.match(groups, /return firstGroup \? \{ groupId: firstGroup\.id, view: "chat" \} : null/);
  assert.match(groups, /setPanel\(\(current\) => \(\{[\s\S]*?groupId: openGroupRequest\.groupId,[\s\S]*?view: current\?\.view \?\? "chat"/);
  assert.doesNotMatch(groups, /className="agw-panel-create"[\s\S]*?Créer un groupe/);
  assert.match(groups, /createGroupSignal\?: number/);
  assert.match(groups, /lastCreateGroupSignal\.current === createGroupSignal[\s\S]*?setCreateOpen\(true\)/);
  assert.match(groups, /agw-panel__bar\$\{toolbar \? " has-toolbar is-workspace-subbar" : ""\}/);
  assert.match(groupStyles, /\.agw-panel__bar\.is-workspace-subbar\s*\{[\s\S]*?min-height:\s*74px[\s\S]*?rgba\(5, 7, 16, 0\.94\)/);
  assert.match(workspace, /contentSpace === "groups" && onCreateGroup[\s\S]*?className="mw-chat-header__primary-action"[\s\S]*?Créer un groupe/);
  assert.match(page, /const \[createGroupSignal, setCreateGroupSignal\] = useState\(0\)/);
  assert.match(page, /<ArtistGroupsWorkspace[\s\S]*?createGroupSignal=\{createGroupSignal\}/);
  assert.match(page, /onCreateGroup=\{\(\) => setCreateGroupSignal\(\(signal\) => signal \+ 1\)\}/);
  assert.match(groups, /renderActivePanel\(\)\}[\s\S]*?createOpen && renderCreateFlow\(\)/);
  assert.doesNotMatch(groups, /className="agw__header"/);
  assert.doesNotMatch(groups, /className="agw__filters"/);
  assert.doesNotMatch(groups, /className="agw-manifesto"/);
  assert.match(page, /if \(space === "groups"\)[\s\S]*?groupRailItems\[0\][\s\S]*?setOpenGroupRequest/);
  assert.doesNotMatch(groups, /Crée le groupe\. Organise le son\./);
});

test("la vue Planning reproduit la référence et conserve ses actions réelles", async () => {
  const [groups, groupStyles] = await Promise.all([
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/artist-groups-workspace.css"),
  ]);
  const planningView = groups.slice(groups.indexOf("const renderPlanning"), groups.indexOf("const renderMembers"));
  const midnightFixture = groups.slice(groups.indexOf('name: "Midnight Echo"'), groups.indexOf('name: "Neon Pulse"'));
  const planningStyles = groupStyles.slice(groupStyles.indexOf("/* Planning reference screen */"), groupStyles.indexOf("/* Members reference screen"));

  assert.match(planningView, /className="agw-panel--planning"/);
  assert.match(planningView, /className="agw-subview agw-planning-subview"/);
  assert.match(planningView, /aria-expanded=\{sessionFormOpen\} aria-controls="agw-planning-session-form"/);
  assert.match(planningView, /agw-next-session__primary/);
  assert.match(planningView, /<h3>Prochaine session<\/h3>/);
  assert.match(planningView, /agw-session-status[\s\S]*?À venir/);
  assert.match(planningView, /agw-next-session__context[\s\S]*?<GroupWaveMark \/>/);
  assert.match(planningView, /agw-participant-stack[\s\S]*?group\.members\.slice\(0, 3\)[\s\S]*?<UserRound/);
  assert.match(planningView, /confirmés[\s\S]*?en attente/);
  assert.ok(planningView.indexOf("agw-next-session__context") < planningView.indexOf("detailsOpen &&"));
  assert.match(planningView, /Math\.min\(current\.members\.length,[\s\S]*?Math\.max\(0,/);
  assert.match(planningView, /aria-expanded=\{detailsOpen\} aria-controls="agw-planning-session-details"/);
  assert.match(planningView, /id="agw-planning-session-details"/);
  assert.match(planningView, /agw-session-tile__icon[\s\S]*?CheckCircle2/);
  assert.match(planningView, /agw-session-tile__icon[\s\S]*?Clock3/);
  assert.match(midnightFixture, /nextSessionTitle: "Répétition Studio A"/);

  assert.match(planningStyles, /\.agw-panel--planning \.agw-panel__bar\.is-workspace-subbar\s*\{[\s\S]*?115px[\s\S]*?56\.57%[\s\S]*?831px/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-planning-subview\s*\{[\s\S]*?width:\s*80\.42%/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-next-session\s*\{[\s\S]*?234px[\s\S]*?grid-template-columns:\s*40% 60%[\s\S]*?linear-gradient\(145deg,\s*#14102b,\s*#0d1021 58%,\s*#101128\)/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-next-session__primary\s*\{[\s\S]*?border-right:\s*1px solid/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-list-tile\s*\{[\s\S]*?87px[\s\S]*?linear-gradient\(145deg,\s*#0f1222,\s*#0b0e1a\)/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-list-tile::before\s*\{[\s\S]*?linear-gradient\(#a04dff,\s*#7028d8\)/);
  assert.match(planningStyles, /\.agw-panel--planning \.agw-panel__side-rail\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:/);
  assert.match(planningStyles, /@media \(max-width:\s*900px\)[\s\S]*?\.agw-panel--planning \.agw-next-session\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("la vue Membres reproduit le panneau de référence sans transparence ni colonne parasite", async () => {
  const [groups, groupStyles] = await Promise.all([
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/artist-groups-workspace.css"),
  ]);
  const membersView = groups.slice(groups.indexOf("const renderMembers"), groups.indexOf("const renderDecisions"));
  const midnightFixture = groups.slice(groups.indexOf('name: "Midnight Echo"'), groups.indexOf('name: "Neon Pulse"'));
  const memberStyles = groupStyles.slice(groupStyles.indexOf("/* Members reference screen"));

  assert.match(membersView, /className="agw-panel--members"/);
  assert.match(membersView, /identityIcon=\{<GroupWaveMark \/>}/);
  assert.match(membersView, /eyebrow="Membres du groupe"/);
  assert.match(membersView, /agw-members-subview/);
  assert.match(membersView, /agw-member-role/);
  assert.match(membersView, /agw-member-access/);
  assert.match(membersView, /Accès complet/);
  assert.match(membersView, /UserPlus size=\{19\} \/> Inviter/);
  assert.ok(membersView.indexOf("agw-subview__heading") < membersView.indexOf("agw-search"));
  assert.ok(membersView.indexOf("agw-search") < membersView.indexOf("agw-members-list"));
  for (const identity of ["Alex", "Sarah", "Marc", "Julien", "Beatmaker", "Chanteuse", "Producteur", "Ingé son"]) {
    assert.match(midnightFixture, new RegExp(identity));
  }
  assert.match(midnightFixture, /name: "Julien", role: "Ingé son", online: true/);

  assert.match(memberStyles, /\.agw-panel--members \.agw-panel__bar\.is-workspace-subbar\s*\{[\s\S]*?min-height:\s*110px;[\s\S]*?minmax\(520px,\s*846px\)/);
  assert.match(memberStyles, /\.agw-panel__identity-mark\s*\{[\s\S]*?width:\s*64px;[\s\S]*?height:\s*64px/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-members-subview\s*\{[\s\S]*?width:\s*calc\(100% - 24px\);[\s\S]*?padding:\s*43px 60px 112px 12px;[\s\S]*?linear-gradient\(145deg,\s*#0b0d19,\s*#080b14 60%,\s*#070a12\)/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-search\s*\{[\s\S]*?min-height:\s*68px;[\s\S]*?background:\s*#0b0d17/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-members-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-members-list article\s*\{[\s\S]*?min-height:\s*132px;[\s\S]*?linear-gradient\(145deg,\s*#111420,\s*#0c0f19\)/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-avatar\.is-large\s*\{[\s\S]*?width:\s*92px;[\s\S]*?height:\s*92px/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-panel__side-rail\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*49px;[\s\S]*?bottom:\s*35px;[\s\S]*?width:\s*155px/);
  assert.match(memberStyles, /\.agw-panel--members \.agw-panel__side-rail \.agw-panel-option\s*\{[\s\S]*?min-height:\s*55px;[\s\S]*?background:\s*#0d1019/);
});

test("chaque groupe ouvre directement son propre chat et conserve ses messages", async () => {
  const [groups, page, groupStyles] = await Promise.all([
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/artist-groups-workspace.css"),
  ]);
  const initialGroupFixtures = groups.slice(groups.indexOf("const initialGroups"), groups.indexOf("const GROUPS_SESSION_EVENT"));
  assert.equal((initialGroupFixtures.match(/\n\s+messages: \[/g) ?? []).length, 5);
  assert.match(groups, /type GroupPanel = "chat" \|/);
  assert.match(groups, /messages: GroupChatMessage\[\]/);
  assert.match(groups, /messages: group\.messages\.map\(\(message\) => \(\{ \.\.\.message \}\)\)/);
  assert.match(groups, /function GroupChatPanel[\s\S]*?group\.messages\.map/);
  assert.match(groups, /onGroupChange\(\{[\s\S]*?messages: \[[\s\S]*?\.\.\.group\.messages/);
  assert.match(groups, /activeView === "chat"[\s\S]*?openPanel\(group\.id, "chat"\)/);
  assert.match(groups, /panel\.view === "chat"[\s\S]*?renderChat\(activeGroup\)/);
  assert.doesNotMatch(groups, /view: "hub"|renderHub|openGroupChat/);
  assert.doesNotMatch(page, /const openGroupChat|onOpenChat=/);
  assert.match(groupStyles, /\.agw-panel__bar\.has-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(groupStyles, /\.agw-panel__toolbar\s*\{[\s\S]*?justify-self:\s*center/);
  assert.match(groupStyles, /\.agw-panel__controls\s*\{[\s\S]*?justify-self:\s*end/);
});

test("les actions secondaires des groupes modifient vraiment l'état ou ouvrent leur destination", async () => {
  const [groups, projects, page] = await Promise.all([
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/ProjectsWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
  ]);
  for (const role of ["Accordéoniste", "Bassiste", "Beatmaker", "Réalisateur Vidéo", "Ingénieur du Son", "Chanteuse"]) {
    assert.match(groups, new RegExp(role));
  }
  assert.match(groups, /members:\s*\[\.\.\.current\.members/);
  assert.match(groups, /setDecisionOptionsByGroup/);
  assert.match(groups, /setRecordedVotes/);
  assert.match(groups, /setDangerConfirmation/);
  assert.match(groups, /confirmDangerAction/);
  assert.match(groups, /onOpenMemberChat\?\.\(member\)/);
  assert.match(groups, /onOpenProject\?\.\(id\)/);
  assert.match(groups, /onCreateProject\(activeGroup\.id, projectTitle\.trim\(\)\)/);
  assert.match(groups, /linkProjectToArtistGroup/);
  assert.match(groups, /artistGroupSessionItems/);
  assert.match(projects, /projectSessionItems/);
  assert.match(page, /onProjectCreated=\{liveEnabled \? undefined : \(project\) => linkProjectToArtistGroup\(project\.groupId, project\.id\)\}/);
  assert.match(groups, /liveMode && panel\.view === "planning"[\s\S]*?renderUnavailablePanel/);
  assert.match(groups, /liveMode && panel\.view === "decisions"[\s\S]*?renderUnavailablePanel/);
  assert.doesNotMatch(groups, /member\.role === "Admin" \? "Artiste" : "Admin"/);
});

test("les 12 projets, le wizard et les onglets de détail suivent Flutter", async () => {
  const projects = await readSource("features/messaging/ProjectsWorkspace.tsx");
  assert.equal((projects.match(/id: "project_\d+"/g) ?? []).length, 12);
  assert.match(projects, /\["Infos", "Membres", "Permissions", "Confirmer"\]/);
  assert.match(projects, /\["chat", "Chat"[\s\S]*?\["stems", "Stems"[\s\S]*?\["tasks", "Tâches"[\s\S]*?\["info", "Infos"/);
  assert.match(projects, /const \[activeProjectTab, setActiveProjectTab\] = useState<ProjectDetailTab>\("chat"\)/);
  assert.match(projects, /key=\{selectedProject\.id\}[\s\S]*?tab=\{activeProjectTab\}[\s\S]*?onTabChange=\{setActiveProjectTab\}/);
  assert.doesNotMatch(projects, /progress:\s*\d|style:\s*["']|alert:\s*["']/);
});

test("chaque projet isole son chat, ses stems, ses tâches et ses informations", async () => {
  const projects = await readSource("features/messaging/ProjectsWorkspace.tsx");
  const fixtures = projects.slice(
    projects.indexOf("const projectFixtureBlueprints"),
    projects.indexOf("function generatedProjectMessages"),
  );

  assert.equal((fixtures.match(/^\s{2}project_\d+:\s*\{/gm) ?? []).length, 12);
  for (const field of ["genre", "bpm", "musicalKey", "objective", "delivery", "milestone", "completion", "notes", "chatLead", "chatReply", "stems", "tasks"]) {
    assert.equal((fixtures.match(new RegExp(`\\b${field}:`, "g")) ?? []).length, 12, `${field} doit exister pour les 12 projets`);
  }

  const chatPanel = projects.slice(projects.indexOf("function ProjectChatPanel"), projects.indexOf("function ProjectTasksPanel"));
  assert.match(chatPanel, /project:\s*ProjectWorkspaceItem/);
  assert.match(chatPanel, /const messages = project\.messages \?\? \[\]/);
  assert.match(chatPanel, /onProjectChange\(\{[\s\S]*?\.\.\.project,[\s\S]*?messages:\s*\[[\s\S]*?\.\.\.messages/);
  assert.doesNotMatch(chatPanel, /useState<ProjectChatMessage\[\]>/);

  assert.match(projects, /<ProjectChatPanel project=\{project\} onProjectChange=\{onProjectChange\}/);
  assert.match(projects, /<ProjectStemsPanel project=\{project\} onProjectChange=\{onProjectChange\}/);
  assert.match(projects, /<ProjectTasksPanel project=\{project\} onProjectChange=\{onProjectChange\}/);
  assert.match(projects, /<ProjectInfoPanel project=\{project\} onProjectChange=\{onProjectChange\}/);
  assert.match(projects, /messages:\s*project\.messages\?\.map\(\(message\) => \(\{ \.\.\.message \}\)\)/);
  assert.match(projects, /workspaceInfo:\s*project\.workspaceInfo \? \{ \.\.\.project\.workspaceInfo \} : undefined/);
  assert.match(projects, /const flutterProjects: ProjectWorkspaceItem\[\] = flutterProjectSeeds\.map\(hydrateProjectFixture\)/);
  assert.match(projects, /messages:\s*\[[\s\S]*?message_new_system_[\s\S]*?message_new_welcome_/);
  assert.match(projects, /workspaceInfo:\s*\{[\s\S]*?genre:\s*draft\.genre[\s\S]*?bpm,/);
});

test("Track Pack et Brief conservent les actions Flutter sans fonctions inventées", async () => {
  const [messages, messageStyles, catalog, data] = await Promise.all([
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/message-workspace.css"),
    readSource("features/messaging/trackPackInstrumentCatalog.ts"),
    readSource("features/messaging/messagingDemoData.ts"),
  ]);
  for (const label of ["Télécharger tout", "Ajouter une piste", "Trap", "Drill", "R&B", "Pop", "Afro", "Lo-Fi"]) assert.match(messages, new RegExp(label));
  assert.match(messages, /\[80, 100, 120, 140, 160, 180\]/);
  assert.match(messages, /useState<string \| null>\(null\)/);
  assert.match(messages, /useState<number \| null>\(null\)/);
  assert.match(messages, /useState<Track\[\]>\(\[\]\)/);
  assert.match(messages, /accept="audio\/\*" multiple/);
  assert.match(messages, /trackDurations: composerTracks\.map/);
  assert.match(messages, /trackMediaUrls: composerTracks\.map/);
  assert.doesNotMatch(messages, /V04|Valider cette version|Mix complet|Focus basse|Voix seule|24 BIT|MEEWAV READY/);
  assert.match(messageStyles, /@media \(min-width: 921px\)[\s\S]*?\.mw-track-studio__hero > p\s*\{[\s\S]*?display:\s*none/);
  assert.match(data, /Neon Pulse — Drum Kit V2[\s\S]*?tracks:\s*\["kick\.wav", "snare\.wav", "hats\.wav", "perc\.wav", "808\.wav"\]/);
  for (const label of ["Kick", "Snare", "Hi-hat", "Percussion", "Basse 808"]) assert.match(catalog, new RegExp(`name: "${label}"`));
  assert.match(catalog, /export function getTrackPackStemPresentation/);
  const trackBuilder = messages.slice(messages.indexOf("function tracksFromMessage"), messages.indexOf("function viewerTracksFromMessage"));
  assert.match(trackBuilder, /getTrackPackStemPresentation\(label, index\)/);
  assert.match(trackBuilder, /displayName:\s*presentation\.name/);
  assert.match(trackBuilder, /description:\s*presentation\.description/);
  assert.doesNotMatch(trackBuilder, /displayName:\s*TRACK_PACK_INSTRUMENTS/);
});

test("audio, téléchargements et note vocale reposent sur des médias réels", async () => {
  const messages = await readSource("features/messaging/MessageWorkspace.tsx");
  for (const marker of ["createSilentWavBlob", 'writeAscii(0, "RIFF")', 'writeAscii(8, "WAVE")', 'type: "audio/wav"', 'new Audio(', '"timeupdate"', "navigator.mediaDevices.getUserMedia", "new MediaRecorder", 'recordingStatus === "error"']) {
    assert.match(messages, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(messages, /downloadBlob\(`\$\{track\.label\}\.txt/);
  assert.doesNotMatch(messages, /Note vocale prête/);
  assert.doesNotMatch(messages, /duration: "0:08"/);
});

test("la démonstration Messages reste strictement locale", async () => {
  const localDemo = [
    await readSource("features/messaging/MessageWorkspace.tsx"),
    await readSource("features/messaging/messagingDemoData.ts"),
  ].join("\n");
  assert.doesNotMatch(localDemo, /\bfetch\s*\(|axios|XMLHttpRequest|WebSocket|EventSource|supabase|localStorage|sessionStorage/);
  assert.match(localDemo, /URL\.createObjectURL/);
});

test("aucun bouton secondaire visible n'est laissé sans action", async () => {
  const files = [
    "features/globe/components/MeewavPrimaryNav.tsx",
    "features/messaging/MessagingPage.tsx",
    "features/messaging/MessageWorkspace.tsx",
    "features/messaging/CollabsWorkspace.tsx",
    "features/messaging/ProjectsWorkspace.tsx",
    "features/messaging/ArtistGroupsWorkspace.tsx",
  ];
  for (const file of files) {
    const source = await readSource(file);
    for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
      const openingTag = match[0];
      const actionable = /onClick\s*=/.test(openingTag) || /type="submit"/.test(openingTag) || /\{\.\.\./.test(openingTag);
      assert.ok(actionable, `${file} contient un bouton sans action : ${openingTag.replace(/\s+/g, " ")}`);
    }
  }
});

test("la page évite les boucles continues et les effets GPU coûteux", async () => {
  const files = [
    "features/messaging/MessagingPage.tsx",
    "features/messaging/MessageWorkspace.tsx",
    "features/messaging/CollabsWorkspace.tsx",
    "features/messaging/ProjectsWorkspace.tsx",
    "features/messaging/ArtistGroupsWorkspace.tsx",
    "features/messaging/messaging-page.css",
    "features/messaging/message-workspace.css",
    "features/messaging/message-grammar.css",
    "features/messaging/messaging-hubs.css",
    "features/messaging/artist-groups-workspace.css",
  ];
  const runtimeSurface = (await Promise.all(files.map(readSource))).join("\n");
  assert.doesNotMatch(runtimeSurface, /\bsetInterval\s*\(/);
  assert.doesNotMatch(runtimeSurface, /\brequestAnimationFrame\s*\(/);
  assert.doesNotMatch(runtimeSurface, /@keyframes/);
  assert.doesNotMatch(runtimeSurface, /backdrop-filter/);
});

test("un message très long reste vertical et ne peut jamais élargir la conversation", async () => {
  const grammar = await readSource("features/messaging/message-grammar.css");
  assert.match(grammar, /max-inline-size:\s*min\(620px,\s*70%\)\s*!important/);
  assert.match(grammar, /overflow-wrap:\s*anywhere/);
  assert.match(grammar, /word-break:\s*break-word/);
  assert.match(grammar, /white-space:\s*pre-wrap/);
  assert.match(grammar, /overflow-x:\s*clip/);
});

test("le fond de messagerie reste sans rails néon et conserve l’indicateur du pilier actif", async () => {
  const [pageStyles, workspaceStyles, grammar] = await Promise.all([
    readSource("features/messaging/messaging-page.css"),
    readSource("features/messaging/message-workspace.css"),
    readSource("features/messaging/message-grammar.css"),
  ]);
  assert.doesNotMatch(pageStyles, /meewav-messaging-studio-4k-v1\.webp/);
  assert.doesNotMatch(workspaceStyles, /meewav-messaging-studio-4k-v1\.webp/);
  assert.doesNotMatch(pageStyles, /is-messages\.is-active::after[\s\S]*?display:\s*none\s*!important/);
  assert.match(grammar, /border-left-width:\s*1px\s*!important/);
  assert.match(grammar, /rgba\(75,\s*79,\s*190,\s*0\.72\)/);
});

test("les bulles reçues sont opaques sans modifier le dégradé violet bleu envoyé", async () => {
  const grammar = await readSource("features/messaging/message-grammar.css");
  const receivedBubbles = grammar.slice(
    grammar.indexOf(".messaging-page .mw-message.is-theirs .mw-bubble--text"),
    grammar.indexOf(".messaging-page .mw-message.is-mine .mw-bubble--text"),
  );
  const replyPreview = grammar.slice(
    grammar.indexOf(".messaging-page .mw-message__reply-preview,"),
    grammar.indexOf(".messaging-page .mw-message__reply-preview small"),
  );

  assert.match(receivedBubbles, /background-color:\s*#17152d/);
  assert.match(receivedBubbles, /background:\s*linear-gradient\(138deg,\s*#21183b 0%,\s*#17152d 56%,\s*#121326 100%\)/);
  assert.doesNotMatch(receivedBubbles, /background:[^;]*rgba\(/);
  assert.match(replyPreview, /background-color:\s*#17142e/);
  assert.match(replyPreview, /background:\s*linear-gradient\(135deg,\s*#1d1738 0%,\s*#17142e 58%,\s*#121126 100%\)/);
  assert.doesNotMatch(replyPreview, /background:[^;]*rgba\(/);
  assert.match(grammar, /linear-gradient\(135deg,\s*rgba\(75,\s*79,\s*190,\s*0\.72\),\s*rgba\(65,\s*43,\s*143,\s*0\.64\)\)/);
});

test("les miniatures Track Pack et les groupes gardent leurs marges et le fond global", async () => {
  const [grammar, groupStyles, groups, pageStyles] = await Promise.all([
    readSource("features/messaging/message-grammar.css"),
    readSource("features/messaging/artist-groups-workspace.css"),
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/messaging-page.css"),
  ]);
  assert.match(grammar, /\.messaging-page \.mw-track-capsule\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*160px/);
  assert.match(grammar, /\.messaging-page \.mw-track-capsule__stems\s*\{[\s\S]*?padding:\s*6px 14px 10px/);
  assert.match(grammar, /\.messaging-page \.mw-chat-timeline\s*\{[\s\S]*?width:\s*100%;[\s\S]*?scrollbar-gutter:\s*stable/);
  assert.match(groupStyles, /\.agw-panel\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(groups, /className=\{`agw\$\{panel \|\| createOpen \? " has-panel" : ""\}`\}/);
  assert.match(pageStyles, /--messaging-rail-start:\s*rgba\(139, 92, 246, 0\.82\)/);
});

test("Projet conserve ses commandes dans une capsule flottante sans second bandeau", async () => {
  const [projects, groups, workspace, page, groupStyles, hubStyles] = await Promise.all([
    readSource("features/messaging/ProjectsWorkspace.tsx"),
    readSource("features/messaging/ArtistGroupsWorkspace.tsx"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/artist-groups-workspace.css"),
    readSource("features/messaging/messaging-hubs.css"),
  ]);
  assert.match(projects, /<div className="mwp-project-floating-controls">/);
  assert.doesNotMatch(projects, /mwp-project-panel__bar|agw-panel__bar has-toolbar/);
  assert.match(projects, /data-project-tab=\{tab\}/);
  assert.match(projects, /agw-panel__identity/);
  assert.match(projects, /agw-panel__toolbar/);
  assert.match(projects, /agw-panel__controls/);
  assert.match(projects, /const firstProject = \(projectSessionItems \?\? initialProjects\)\[0\]/);
  const projectControlsStart = projects.indexOf('<div className="mwp-project-floating-controls">');
  const projectControlsEnd = projects.indexOf('<div className="mw-project-detail__body">', projectControlsStart);
  const projectControls = projects.slice(projectControlsStart, projectControlsEnd);
  const globalHeaderStart = workspace.indexOf('<header className="mw-chat-header">');
  const globalHeaderEnd = workspace.indexOf("</header>", globalHeaderStart);
  const globalHeader = workspace.slice(globalHeaderStart, globalHeaderEnd);
  const projectControlsStyleStart = hubStyles.indexOf(".mwp-project-detail .mwp-project-floating-controls {");
  const projectControlsStyleEnd = hubStyles.indexOf("\n}", projectControlsStyleStart);
  const projectControlsStyles = hubStyles.slice(projectControlsStyleStart, projectControlsStyleEnd);
  assert.equal((workspace.match(/<header className="mw-chat-header">/g) ?? []).length, 1);
  assert.match(globalHeader, /MeewavPillarBrand pillar="Messagerie"/);
  assert.match(globalHeader, /<MeewavPillarTabs/);
  assert.doesNotMatch(projectControls, /mw-chat-header|MeewavPillarBrand|MeewavPillarTabs/);
  assert.doesNotMatch(projectControlsStyles, /background:|border-bottom:|box-shadow:/);
  assert.match(projectControlsStyles, /position:\s*absolute;[\s\S]*?grid-template-columns:\s*minmax\(210px, 1fr\) minmax\(430px, 520px\) auto;[\s\S]*?pointer-events:\s*none/);
  assert.ok(projectControls.indexOf("agw-panel__identity") < projectControls.indexOf("agw-panel__toolbar"));
  assert.ok(projectControls.indexOf("agw-panel__toolbar") < projectControls.indexOf("agw-panel__controls"));
  assert.match(projectControls, /className="agw-panel-create"[\s\S]*?Nouveau projet/);
  assert.doesNotMatch(projectControls, /Options du projet/);
  assert.match(projects.slice(projectControlsEnd), /className="mwp-project-side-rail"[\s\S]*?Options du projet/);
  assert.match(hubStyles, /\.mwp-project-detail \.mw-project-detail__body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 132px/);
  assert.match(hubStyles, /\.mwp-project-detail \.mw-project-detail__body\s*\{[\s\S]*?padding-top:\s*70px/);
  assert.match(hubStyles, /\.mwp-project-side-rail\s*\{[\s\S]*?align-items:\s*flex-end/);
  assert.match(hubStyles, /\.mwp-project-detail\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);[\s\S]*?background:\s*transparent/);
  assert.match(hubStyles, /\.mwp-project-detail \.mwp-project-floating-controls \.agw-group-toolbar\.is-project \.agw-group-toolbar__indicator::after\s*\{[\s\S]*?height:\s*2px;[\s\S]*?background:\s*#a66cff/);
  assert.match(hubStyles, /\.mwp-project-detail\[data-project-tab="stems"\] \.mw-project-detail__body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(hubStyles, /\.mwp-project-detail\[data-project-tab="stems"\] \.mwp-project-side-rail\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*28px;[\s\S]*?bottom:\s*28px/);
  assert.match(projects, /<ProjectDetail[\s\S]*?wizardOpen && \(/);
  assert.doesNotMatch(projects, /Retour aux projets|onBack=\{\(\) => setSelectedProjectId\(null\)\}/);
  assert.doesNotMatch(projects, /className="mw-hub mw-hub--projects"|className="mw-hub__header"|className="mw-projects-grid"|Filtrer les projets/);
  assert.match(page, /if \(space === "projects"\)[\s\S]*?projectRailItems\[0\][\s\S]*?setOpenProjectRequest/);
  assert.doesNotMatch(projects, /createPortal|mw-project-header-slot/);
  assert.doesNotMatch(workspace, /mw-project-header-slot/);
  assert.doesNotMatch(hubStyles, /mwp-project-liquid-tabs|mw-context-header-slot/);
  assert.match(groups, /agw-group-toolbar__indicator/);
  const groupSideAction = groups.slice(groups.indexOf("const renderGroupSideAction"), groups.indexOf("const renderChat"));
  assert.doesNotMatch(groups, /const renderGroupPrimaryAction/);
  assert.doesNotMatch(groups, /className="agw-panel-create"[\s\S]*?Créer un groupe/);
  assert.match(globalHeader, /contentSpace === "groups" && onCreateGroup[\s\S]*?className="mw-chat-header__primary-action"[\s\S]*?Créer un groupe/);
  assert.match(groupSideAction, /Options/);
  assert.match(groups, /sideActions=\{renderGroupSideAction\(group, "chat"\)\}/);
  assert.match(groups, /agw-panel__bar\$\{toolbar \? " has-toolbar is-workspace-subbar" : ""\}/);
  assert.match(groupStyles, /\.agw-panel__layout\.has-side-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 132px/);
  assert.match(groupStyles, /\.agw-panel__side-rail\s*\{[\s\S]*?align-items:\s*flex-end/);
  assert.match(groupStyles, /\.agw-panel__bar\.is-workspace-subbar\s*\{[\s\S]*?min-height:\s*74px;[\s\S]*?grid-template-columns:\s*minmax\(190px, 1fr\) minmax\(500px, 700px\);[\s\S]*?rgba\(5, 7, 16, 0\.94\)/);
  assert.match(groupStyles, /\.agw-panel__bar\.is-workspace-subbar \.agw-group-toolbar__indicator::after\s*\{[\s\S]*?height:\s*2px;[\s\S]*?background:\s*#a66cff/);
  assert.match(projects, /agw-group-toolbar__indicator/);
  assert.match(groupStyles, /\.agw-group-toolbar__indicator\s*\{[\s\S]*?transition:\s*transform 340ms/);
  assert.match(groupStyles, /\.agw-group-toolbar\.is-project\.is-info \.agw-group-toolbar__indicator[\s\S]*?translateX\(calc\(300% \+ 9px\)\)/);
  assert.match(hubStyles, /@media \(max-width:\s*820px\)[\s\S]*?\.mwp-project-detail \.mwp-project-floating-controls\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"toolbar toolbar"[\s\S]*?padding-top:\s*118px/);
});

test("le chat Projet réutilise sans recoloration la grammaire du vrai chat", async () => {
  const [projects, hubStyles, grammar, pageStyles] = await Promise.all([
    readSource("features/messaging/ProjectsWorkspace.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
    readSource("features/messaging/message-grammar.css"),
    readSource("features/messaging/messaging-page.css"),
  ]);
  const projectChat = projects.slice(projects.indexOf("function ProjectChatPanel"), projects.indexOf("function ProjectTasksPanel"));
  const projectChatStyles = hubStyles.slice(hubStyles.indexOf("/* Exact project chat */"), hubStyles.indexOf("/* Tasks */"));
  assert.match(projectChat, /mw-message is-family-conversation has-tail/);
  assert.match(projectChat, /mw-bubble mw-bubble--text/);
  assert.match(projectChat, /mw-chat-timeline mwp-project-chat__timeline/);
  assert.match(projectChat, /mw-chat-timeline__inner mwp-project-chat__messages/);
  assert.match(projectChat, /mw-composer-zone mwp-project-chat__composer-zone/);
  assert.match(projectChat, /mw-composer-row/);
  assert.match(projectChat, /mw-composer mwp-project-chat__composer/);
  assert.match(projectChat, /<Paperclip \/>/);
  assert.match(projectChat, /<Music2 \/>/);
  assert.match(projectChat, /<Mic \/>/);
  assert.match(projectChat, /mw-composer-send/);
  assert.doesNotMatch(projectChat, /disabled=\{!draft\.trim\(\)\}/);
  assert.match(projectChatStyles, /\.messaging-page \.mwp-project-chat \.mwp-project-chat__composer\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\) 44px 44px 50px/);
  assert.doesNotMatch(projectChatStyles, /#8849ec|#5515b9|\.mwp-project-chat > form button/i);
  assert.match(grammar, /rgba\(75,\s*79,\s*190,\s*0\.72\)/);
  assert.match(grammar, /rgba\(65,\s*43,\s*143,\s*0\.64\)/);
  assert.match(
    pageStyles,
    /\.messaging-page \.mw-context-pane > \.mwp-project-workspace,\s*\.messaging-page \.mw-context-pane > \.mwp-project-workspace > \.mwp-project-detail\s*\{[\s\S]*?background:\s*transparent/,
  );
  assert.match(
    pageStyles,
    /\.messaging-page \.mw-context-pane > \.mwp-project-workspace > \.mwp-project-detail \.mw-project-detail__body\s*\{[\s\S]*?radial-gradient/,
  );
  assert.match(
    grammar,
    /One final chat geometry[\s\S]*?\.messaging-page \.mw-chat-timeline__inner\s*\{[\s\S]*?width:\s*min\(1040px,\s*calc\(100% - 56px\)\)[\s\S]*?padding-bottom:\s*12px/,
  );
  assert.match(
    grammar,
    /One final chat geometry[\s\S]*?\.messaging-page \.mw-composer-zone\s*\{[\s\S]*?width:\s*min\(1080px,\s*calc\(100% - 32px\)\)[\s\S]*?padding:\s*0 0 max\(24px,\s*env\(safe-area-inset-bottom\)\)/,
  );
});

test("les Stems Projet emploient les mêmes primitives et contrôles que le Track Pack ouvert", async () => {
  const [projects, messages, primitives, hubStyles] = await Promise.all([
    readSource("features/messaging/ProjectsWorkspace.tsx"),
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/TrackPackStudioPrimitives.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
  ]);
  const projectStems = projects.slice(projects.indexOf("function ProjectStemsPanel"), projects.indexOf("function ProjectInfoPanel"));
  assert.match(projectStems, /mw-track-master mwp-project-track-master/);
  assert.match(projectStems, /mw-stem-console mwp-project-stem-console/);
  assert.match(projectStems, /mw-stem-row/);
  assert.match(projectStems, /<Waveform/);
  assert.match(projectStems, /<InstrumentArtwork/);
  assert.match(projectStems, />SOLO<\/button>/);
  assert.match(projectStems, />MUTE<\/button>/);
  assert.doesNotMatch(projectStems, /Array\.from\(\{ length: 28|mwp-stem-wave|mwp-stem-list/);
  assert.match(messages, /from "\.\/TrackPackStudioPrimitives"/);
  assert.match(primitives, /export function Waveform/);
  assert.match(primitives, /export function InstrumentArtwork/);

  const headerStart = projectStems.indexOf('<header className="mwp-stems-console mwp-stems-console--unified">');
  const headerEnd = projectStems.indexOf("</header>", headerStart);
  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  const consolidatedHeader = projectStems.slice(headerStart, headerEnd);
  const mixPosition = consolidatedHeader.indexOf("mwp-stems-console__mix");
  const masterPosition = consolidatedHeader.indexOf("mw-track-master mwp-project-track-master");
  assert.ok(mixPosition >= 0 && masterPosition > mixPosition);
  assert.doesNotMatch(consolidatedHeader, /mwp-stems-console__actions|mwp-add-stem/);

  const sidebarStart = projectStems.indexOf('<aside className="mwp-stems-console__actions mwp-stems-sidebar"');
  const sidebarEnd = projectStems.indexOf("</aside>", sidebarStart);
  assert.ok(sidebarStart > headerEnd && sidebarEnd > sidebarStart);
  const sidebar = projectStems.slice(sidebarStart, sidebarEnd);
  assert.match(sidebar, /mwp-save-take/);
  assert.match(sidebar, /mwp-take-history/);
  assert.match(sidebar, /className="mwp-add-stem"/);

  const trackScrollStart = projectStems.indexOf('<div className="mwp-project-stems__track-scroll">');
  const stemConsoleStart = projectStems.indexOf('<div className="mw-stem-console mwp-project-stem-console">');
  assert.ok(trackScrollStart > sidebarEnd && stemConsoleStart > trackScrollStart);
  assert.equal((projectStems.match(/mw-track-master mwp-project-track-master/g) ?? []).length, 1);
  assert.equal((projectStems.match(/className="mwp-add-stem"/g) ?? []).length, 1);
  assert.match(hubStyles, /\.mwp-project-stems \.mwp-stems-console \.mw-track-master\.mwp-project-track-master\s*\{[\s\S]*?margin:\s*0/);
  assert.match(hubStyles, /\.mwp-add-stem\s*\{[\s\S]*?position:\s*static/);
  assert.match(hubStyles, /\.mwp-project-stems__layout\s*\{[\s\S]*?"console sidebar"[\s\S]*?"tracks sidebar"/);
  assert.match(hubStyles, /\.mwp-project-stems__track-scroll\s*\{[\s\S]*?grid-area:\s*tracks[\s\S]*?overflow-y:\s*auto/);
  assert.match(hubStyles, /\.mwp-stems-console__actions\s*\{[\s\S]*?grid-area:\s*sidebar/);
  assert.match(hubStyles, /@media \(max-width:\s*900px\)[\s\S]*?\.mwp-project-stems__layout\s*\{[\s\S]*?"console"[\s\S]*?"sidebar"[\s\S]*?"tracks"/);
  assert.doesNotMatch(hubStyles, /@media \(max-width:\s*1400px\)[\s\S]*?\.mwp-project-stems__layout/);
  assert.match(projectStems, /Sauvegarder/);
  assert.match(projectStems, /<small>Tempo<\/small>/);
  assert.match(projectStems, /<small>Tonalité<\/small>/);
});

test("Tâches Projet garde des filtres et des cartes opaques dans chaque état", async () => {
  const styles = await readSource("features/messaging/messaging-hubs.css");
  assert.match(styles, /\.mwp-project-tasks > header nav button\s*\{[\s\S]*?background:\s*#15121f/);
  assert.match(styles, /\.mwp-project-tasks > header nav button\.is-active\s*\{[\s\S]*?linear-gradient\(135deg,\s*#302047,\s*#21172f\)/);
  assert.match(styles, /\.mwp-task-list > article\s*\{[\s\S]*?linear-gradient\(135deg,\s*#151320,\s*#100e19\)/);
  assert.match(styles, /\.mwp-task-list > article\.is-inProgress\s*\{[\s\S]*?linear-gradient\(135deg,\s*#111a21,\s*#0f101a\)/);
  assert.match(styles, /\.mwp-task-list > article\.is-done\s*\{[\s\S]*?linear-gradient\(135deg,\s*#16121f,\s*#100d18\);[\s\S]*?opacity:\s*1/);
  assert.match(styles, /\.mwp-task-status\s*\{[\s\S]*?background:\s*#211b2c/);
});

test("Infos Projet utilise un grand conteneur noir dégradé violet", async () => {
  const projects = await readSource("features/messaging/ProjectsWorkspace.tsx");
  const styles = await readSource("features/messaging/messaging-hubs.css");
  assert.doesNotMatch(projects, /className="mwp-info-card/);
  assert.match(projects, /className="mwp-info-stage"/);
  assert.match(projects, /mwp-info-stage__pulse[\s\S]*?Membres[\s\S]*?Stems[\s\S]*?Takes[\s\S]*?Tâches/);
  assert.match(projects, /mwp-info-zone mwp-info-zone--members[\s\S]*?mwp-info-zone mwp-info-zone--mixes[\s\S]*?mwp-info-stage__rail/);
  assert.match(styles, /\.mwp-info-stage\s*\{[\s\S]*?rgba\(173, 116, 255, 0\.24\)[\s\S]*?linear-gradient\(145deg,\s*#09090e 0%,\s*#0d0b13 52%,\s*#1a1028 100%\)/);
  assert.match(styles, /\.mwp-info-stage__body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 260px/);
  assert.match(styles, /\.mwp-info-members\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.mwp-info-stage__rail \.mwp-action-list > button:hover/);
});

test("la liste des contacts forme une surface continue avec une sélection discrète", async () => {
  const styles = await readSource("features/messaging/message-workspace.css");
  const finalSelection = styles.slice(styles.indexOf("/* Continuous conversation rail: one quiet surface instead of stacked cards. */"));

  assert.match(finalSelection, /\.messaging-page \.mw-conversation-rail\s*\{[\s\S]*?background:\s*#0b0914/);
  assert.match(finalSelection, /\.messaging-page \.mw-conversation-list\s*\{[\s\S]*?gap:\s*0/);
  assert.match(finalSelection, /article:not\(\.is-active\)\s*\{[\s\S]*?height:\s*88px[\s\S]*?border-bottom:\s*1px solid rgba\(255, 255, 255, 0\.05\)[\s\S]*?background:\s*transparent/);
  assert.match(finalSelection, /article\.is-active\s*\{[\s\S]*?border:\s*1px solid rgba\(169, 116, 255, 0\.22\)[\s\S]*?rgba\(112, 67, 210, 0\.22\)[\s\S]*?inset 0 1px 0 rgba\(255, 255, 255, 0\.035\)/);
  assert.match(finalSelection, /article\.is-active::before\s*\{[\s\S]*?display:\s*none !important[\s\S]*?width:\s*0 !important/);
  assert.doesNotMatch(finalSelection, /border:\s*1\.5px|background:[^;]*border-box|linear-gradient\([^)]*190, 147, 255/);
  assert.match(finalSelection, /\.mw-conversation-row \.mw-avatar\s*\{[\s\S]*?width:\s*56px[\s\S]*?border:\s*1px solid rgba\(255, 255, 255, 0\.1\)/);
  assert.match(finalSelection, /\.mw-conversation-row > b\s*\{[\s\S]*?width:\s*24px[\s\S]*?background:\s*#6d3fe8[\s\S]*?0 0 10px rgba\(109, 63, 232, 0\.22\)/);
  assert.match(finalSelection, /\.mw-conversation-row strong\s*\{[\s\S]*?font-size:\s*16px[\s\S]*?font-weight:\s*600/);
  assert.match(finalSelection, /\.mw-conversation-row em\s*\{[\s\S]*?font-size:\s*13\.5px[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
});

test("le contact rejoint le coin droit du bandeau et la recherche ouvre le rail Messages", async () => {
  const [workspace, page, collabs, data, styles, pageStyles] = await Promise.all([
    readSource("features/messaging/MessageWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/messagingDemoData.ts"),
    readSource("features/messaging/message-workspace.css"),
    readSource("features/messaging/messaging-page.css"),
  ]);
  const headerStart = workspace.indexOf('<header className="mw-chat-header">');
  const headerEnd = workspace.indexOf("</header>", headerStart);
  const header = workspace.slice(headerStart, headerEnd);
  const railStart = workspace.indexOf('<aside className="mw-conversation-rail">');
  const listStart = workspace.indexOf('<div className="mw-conversation-list">', railStart);
  const railControls = workspace.slice(railStart, listStart);

  assert.match(workspace, /import \{ MeewavGradeBadge \} from "\.\.\/grades\/MeewavGradeBadge"/);
  assert.match(workspace, /function ConversationAvatar\([\s\S]*?showPresence = true[\s\S]*?showPresence && conversation\.online && <i \/>/);
  assert.match(workspace, /function SidebarItemAvatar\([\s\S]*?showPresence = true[\s\S]*?showPresence && item\.online && <i \/>/);
  const contactStart = header.indexOf('<span className="mw-chat-header__contact">');
  const contactEnd = header.indexOf("</span>", contactStart);
  const contact = header.slice(contactStart, contactEnd);
  assert.match(contact, /ConversationAvatar conversation=\{selectedConversation\} showPresence=\{false\}/);
  assert.doesNotMatch(contact, /selectedConversation\.(?:name|status|role|gradeLevel)|MeewavGradeBadge|mw-chat-header__contact-copy/);
  assert.ok(header.indexOf('className="mw-chat-header__actions"') < header.indexOf('className="mw-chat-header__contact"'));
  assert.match(workspace, /const showsContextIdentity = !isMessageContent && contentSpace !== "collabs"/);
  assert.match(workspace, /const isRailSearchFirst = isMessageContent \|\| contentSpace === "collabs"/);
  assert.match(railControls, /mw-rail-controls\$\{isRailSearchFirst \? " is-search-first" : ""\}/);
  assert.doesNotMatch(railControls, /ConversationAvatar conversation=\{selectedConversation\}/);
  assert.match(railControls, /\{showsContextIdentity && contextHeaderItem && \(/);
  assert.match(workspace, /SidebarItemAvatar item=\{contextHeaderItem\} showPresence=\{false\}/);
  assert.match(workspace, /mw-chat-header__name-line[\s\S]*?contextHeaderItem\.name[\s\S]*?MeewavGradeBadge[\s\S]*?contextHeaderItem\.gradeLevel/);
  assert.match(workspace, /<ConversationAvatar conversation=\{conversation\} \/>/);
  assert.match(workspace, /<SidebarItemAvatar item=\{item\} \/>/);
  assert.match(page, /gradeLevel:\s*conversation\.gradeLevel/);
  assert.match(page, /gradeLevel:\s*collab\.gradeLevel \?\? collab\.rank/);
  assert.match(collabs, /gradeLevel:\s*getCollabGradeLevel\(collab\)/);
  assert.match(data, /export type DemoConversation = \{[\s\S]*?gradeLevel\?: number/);
  assert.match(data, /export type MessagingSidebarItem = \{[\s\S]*?gradeLevel\?: number/);
  assert.match(styles, /\.messaging-page \.mw-chat-header__name-line\s*\{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*center/);
  assert.match(pageStyles, /\.messaging-page \.mw-chat-header__contact\s*\{[\s\S]*?justify-content:\s*flex-end/);
  assert.doesNotMatch(pageStyles, /mw-chat-header__contact-copy/);
  assert.match(pageStyles, /\.messaging-page \.mw-rail-controls\.is-search-first\s*\{[\s\S]*?height:\s*auto;[\s\S]*?grid-template-rows:\s*minmax\(48px, 59px\)/);
});
