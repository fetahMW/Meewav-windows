import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/", import.meta.url);
const publicRoot = new URL("../../public/", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8");
}

test("les collaborations conservent le modèle multi-pièces-jointes Flutter", async () => {
  const data = await readSource("features/messaging/messagingDemoData.ts");
  assert.match(data, /attachments:\s*DemoCollabAttachment\[\]/);
  assert.doesNotMatch(data, /attachment\?:\s*\{/);

  const ruby = data.slice(data.indexOf('id: "collab_2"'), data.indexOf('id: "collab_3"'));
  assert.match(ruby, /Vocal_Demo_Luna\.mp3/);
  assert.match(ruby, /Portfolio_Luna_Voice\.pdf/);
  assert.match(ruby, /https:\/\/example\.com\/vocal_demo\.mp3/);
  assert.match(ruby, /https:\/\/example\.com\/portfolio\.pdf/);

  const pixelArt = data.slice(data.indexOf('id: "collab_4"'), data.indexOf('id: "collab_8"'));
  assert.match(pixelArt, /Reference_Visuelle\.jpg/);
  assert.match(pixelArt, /Single_Preview\.mp3/);
  assert.match(pixelArt, /https:\/\/i\.pravatar\.cc\/300\?img=21/);
});

test("les états détaillés envoyés et acceptés sont ceux de Flutter", async () => {
  const data = await readSource("features/messaging/messagingDemoData.ts");
  const collabs = data.slice(data.indexOf("export const demoCollabs"));
  for (const state of ["read", "unread", "rejected", "accepted"]) {
    assert.match(collabs, new RegExp(`sentState: "${state}"`));
  }
  assert.equal((collabs.match(/acceptedState: "inProgress"/g) ?? []).length, 2);
  assert.equal((collabs.match(/acceptedState: "completed"/g) ?? []).length, 1);
  assert.equal((collabs.match(/acceptedState: "cancelled"/g) ?? []).length, 1);
});

test("les aperçus utilisent de vrais lecteurs et visionneuses", async () => {
  const workspace = await readSource("features/messaging/CollabsWorkspace.tsx");
  assert.match(workspace, /<audio[\s\S]*?controls/);
  assert.match(workspace, /<video[\s\S]*?controls/);
  assert.match(workspace, /<iframe[\s\S]*?title=/);
  assert.match(workspace, /createSilentWavBlob/);
  assert.match(workspace, /createPdfPreviewBlob/);
  assert.match(workspace, /URL\.createObjectURL/);
  assert.match(workspace, /localCollabAvatar/);
  assert.doesNotMatch(workspace, /previewProgress|openedImageId|togglePlay/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(|window\.open|href=\{source\}|src=\{source\}/);

  for (const asset of [
    "assets/shortfictive/shortf2.mp4",
    "assets/shortfictive/shortf3.mp4",
    "assets/shortfictive/thumb2.jpg",
    "assets/shortfictive/thumb3.jpg",
  ]) {
    assert.ok((await stat(new URL(asset, publicRoot))).size > 0, `${asset} doit être publié`);
  }
});

test("l’accueil Collabs affiche trois aperçus compacts et le grade canonique Meewav", async () => {
  const [workspace, styles, data] = await Promise.all([
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
    readSource("features/messaging/messagingDemoData.ts"),
  ]);

  assert.match(
    styles,
    /\.mw-hub--collabs:not\(\.has-detail\)\s*>\s*\.mw-collabs-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    workspace,
    /import\s*\{\s*MeewavGradeBadge\s*\}\s*from\s*["']\.\.\/grades\/MeewavGradeBadge["']/,
  );
  assert.match(workspace, /getCollabGradeLevel[\s\S]{0,240}collab\.gradeLevel\s*\?\?\s*collab\.rank/);
  assert.match(workspace, /<MeewavGradeBadge[\s\S]{0,260}level=\{getCollabGradeLevel\(collab\)\}/);
  assert.ok((workspace.match(/<MeewavGradeBadge\b/g) ?? []).length >= 2, "le badge canonique doit être présent sur l’aperçu et le détail");
  assert.match(workspace, /mw-collab-preview__heading[\s\S]*?<strong>\{collab\.name\}<MeewavGradeBadge/);
  assert.doesNotMatch(workspace, /ShieldCheck|Profil vérifié|Vérifié par l’équipe/);
  assert.doesNotMatch(workspace, /<Star\b/);
  assert.match(data, /export type DemoCollab\s*=\s*\{[\s\S]*?gradeLevel\?:\s*number/);
});

test("les filtres Collabs sont trois chips compacts sans grand bandeau", async () => {
  const [workspace, styles] = await Promise.all([
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
  ]);
  const overviewControls = workspace.slice(
    workspace.indexOf('<div className="mw-collab-overview-controls">'),
    workspace.indexOf('<div className="mw-collabs-grid">'),
  );

  assert.match(workspace, /\["received", "Reçus"\],[\s\S]*?\["sent", "Envoyées"\],[\s\S]*?\["accepted", "Acceptées"\]/);
  assert.match(overviewControls, /<nav className="mw-collab-filter-chips"[\s\S]*?\{filterButtons\}<\/nav>/);
  assert.doesNotMatch(overviewControls, /mw-collab-toolbar|<strong>Collaborations<\/strong>/);
  assert.match(styles, /\.mw-collab-filter-chips button\s*\{[\s\S]*?min-height:\s*30px;[\s\S]*?border-radius:\s*999px/);
  assert.match(styles, /\.mw-collab-filter-chips small\s*\{[\s\S]*?height:\s*16px;[\s\S]*?border-radius:\s*999px/);
  assert.doesNotMatch(styles, /\.mw-collab-toolbar(?:\s|\{|__)/);
});

test("les aperçus Collab restent compacts et réservent le séparateur au détail", async () => {
  const [workspace, styles] = await Promise.all([
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
  ]);
  const card = workspace.slice(
    workspace.indexOf('<article key={collab.id} className={`mw-collab-preview'),
    workspace.indexOf('</article>', workspace.indexOf('<article key={collab.id} className={`mw-collab-preview')),
  );
  const avatarPosition = card.indexOf('className="mw-collab-preview__avatar"');
  const bodyPosition = card.indexOf('className="mw-collab-preview__body"');
  const footerPosition = card.indexOf('className="mw-collab-preview__footer"');
  assert.ok(avatarPosition >= 0 && bodyPosition > avatarPosition && footerPosition > bodyPosition);
  assert.doesNotMatch(card, /AttachmentList|mw-collab-card__separator|rejectCollab|acceptCollab/);
  const compactCards = styles.slice(styles.indexOf("/* Collaboration overview — compact previews only."));
  assert.match(compactCards, /\.mw-collab-preview\s*\{[\s\S]*?min-height:\s*196px/);
  assert.match(compactCards, /\.mw-collab-preview__open\s*\{[\s\S]*?grid-template-columns:\s*58px minmax\(0,\s*1fr\) 18px/);
  assert.match(compactCards, /\.mw-collab-preview__avatar\s*\{[\s\S]*?width:\s*58px;[\s\S]*?height:\s*58px/);
});

test("le détail Collab garde la grande proposition sans bandeau violet", async () => {
  const [workspace, page, styles] = await Promise.all([
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/messaging-hubs.css"),
  ]);
  const detail = workspace.slice(
    workspace.indexOf('<section className="mw-collab-detail-workspace"'),
    workspace.indexOf('<div className="mw-collab-overview-controls">'),
  );
  assert.doesNotMatch(detail, /agw-panel__bar|mw-collab-panel__bar/);
  assert.match(detail, /mw-collab-detail-tools[\s\S]*?mw-collab-detail-back[\s\S]*?Toutes les demandes/);
  assert.match(detail, /mw-collab-request__profile[\s\S]*?mw-collab-request__separator[\s\S]*?mw-collab-request__content/);
  assert.match(detail, /<h2>Proposition de collaboration<\/h2>/);
  assert.doesNotMatch(detail, /mw-layer|role="dialog"|aria-modal/);
  assert.match(workspace, /onActiveCollabChange\?:\s*\(collabId:\s*string\s*\|\s*null\)/);
  assert.match(workspace, /onActiveCollabChangeRef\.current\?\.\(collab\.id\)/);
  assert.match(workspace, /onActiveCollabChangeRef\.current\?\.\(null\)/);
  assert.match(page, /onActiveCollabChange=\{\(collabId\) => setSelectedRailKey\(collabId \? `collabs:\$\{collabId\}` : null\)\}/);
  assert.match(styles, /\.mw-collab-detail-workspace\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.mw-collab-detail-back\s*\{[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*rgba\(17,\s*14,\s*30,\s*0\.92\)/);
});

test("le grade du Hover traverse le bridge Globe jusqu'à DemoCollab", async () => {
  const [hover, bridge] = await Promise.all([
    readSource("features/globe/components/preProfile/HoverPreProfileContent.tsx"),
    readSource("features/messaging/collaborationRequestBridge.ts"),
  ]);

  const draftType = bridge.slice(
    bridge.indexOf("export type GlobeCollaborationDraft"),
    bridge.indexOf("type StoredGlobeRequest"),
  );
  const storedType = bridge.slice(
    bridge.indexOf("type StoredGlobeRequest"),
    bridge.indexOf("function fallbackUrl"),
  );
  const submitRequest = bridge.slice(
    bridge.indexOf("export function submitGlobeCollaborationRequest"),
    bridge.indexOf("export function getGlobeCollaborationRequests"),
  );
  const mappedRequests = bridge.slice(
    bridge.indexOf("export function getGlobeCollaborationRequests"),
    bridge.indexOf("export function removeGlobeCollaborationRequest"),
  );

  assert.match(hover, /recipientGradeLevel:\s*artistGradeLevel(?:\s*\?\?\s*null)?/);
  assert.match(draftType, /recipientGradeLevel\?:\s*number/);
  assert.match(storedType, /recipientGradeLevel\?:\s*number/);
  assert.match(submitRequest, /recipientGradeLevel:\s*draft\.recipientGradeLevel/);
  assert.match(mappedRequests, /gradeLevel:\s*request\.recipientGradeLevel\s*\?\?\s*1/);
});

test("les actions complètes restent dans le détail, jamais dans l’accueil compact", async () => {
  const workspace = await readSource("features/messaging/CollabsWorkspace.tsx");
  const attachmentList = workspace.slice(
    workspace.indexOf("function DetailAttachmentList"),
    workspace.indexOf("function CollabState"),
  );
  const overview = workspace.slice(
    workspace.indexOf('<div className="mw-collabs-grid">'),
    workspace.indexOf("{visibleCollabs.length === 0"),
  );
  const detail = workspace.slice(
    workspace.indexOf('<section className="mw-collab-detail-workspace"'),
    workspace.indexOf('<div className="mw-collab-overview-controls">'),
  );

  assert.match(attachmentList, /className="mw-collab-request__attachment-play"[\s\S]*?onClick=\{\(\) => onPreview\(attachment\)\}/);
  assert.match(attachmentList, />Aperçu<\/button>/);
  assert.match(attachmentList, /downloadLocalAttachment\(attachment, resolveAttachmentUrl\)/);
  assert.doesNotMatch(overview, /AttachmentList|DetailAttachmentList|rejectCollab\(collab\)|acceptCollab\(collab\)/);
  assert.match(overview, /mw-collab-preview__heading[\s\S]*?Clock3/);
  assert.match(overview, /mw-collab-preview__footer[\s\S]*?Paperclip/);
  assert.match(detail, /<DetailAttachmentList attachments=\{detailCollab\.attachments\}/);
  assert.match(detail, /disabled=\{detailIsMutating \|\| Boolean\(detailLiveServer\?\.relationshipBlocked\)\}[\s\S]{0,140}?rejectCollab\(detailCollab\)/);
  assert.match(detail, /disabled=\{detailIsMutating \|\| Boolean\(detailLiveServer\?\.relationshipBlocked\)\}[\s\S]{0,140}?acceptCollab\(detailCollab\)/);
  assert.match(detail, /mw-collab-card__meta[\s\S]*?Clock3[\s\S]*?Paperclip[\s\S]*?fichier/);
});

test("le détail Collab restaure la hiérarchie et le lecteur premium de référence", async () => {
  const styles = await readSource("features/messaging/messaging-hubs.css");
  const premiumDetail = styles.slice(styles.indexOf("/* Selected collaboration — premium request card."));
  assert.match(premiumDetail, /\.mw-collab-detail-inline \.mw-collab-request\s*\{[\s\S]*?grid-template-columns:\s*216px 1px minmax\(0,\s*1fr\)[\s\S]*?border-radius:\s*28px/);
  assert.match(premiumDetail, /\.mw-collab-detail-inline \.mw-collab-request__avatar\s*\{[\s\S]*?width:\s*176px;[\s\S]*?height:\s*176px/);
  assert.match(premiumDetail, /\.mw-collab-detail-inline \.mw-collab-request__content h2\s*\{[\s\S]*?font-size:\s*clamp\(29px,\s*2\.25vw,\s*35px\)/);
  assert.match(premiumDetail, /\.mw-collab-request__attachment\s*\{[\s\S]*?min-height:\s*154px;[\s\S]*?grid-template-areas:/);
  assert.match(premiumDetail, /\.mw-collab-request__attachment-wave \.mw-waveform__played\s*\{[\s\S]*?stroke-width:\s*1\.55/);
  assert.match(premiumDetail, /\.mw-collab-detail-inline \.mw-collab-request__footer\s*\{[\s\S]*?min-height:\s*90px;[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(premiumDetail, /\.mw-collab-detail-inline \.mw-collab-request__actions \.mw-button--primary\s*\{[\s\S]*?min-width:\s*192px/);
});

test("accepter crée la conversation Flutter et reste dans Acceptées", async () => {
  const [workspace, page] = await Promise.all([
    readSource("features/messaging/CollabsWorkspace.tsx"),
    readSource("features/messaging/MessagingPage.tsx"),
  ]);
  assert.match(workspace, /setFilter\("accepted"\)/);
  assert.match(workspace, /🎵 Collab acceptée ! Commencez à discuter\./);
  assert.match(workspace, /onAcceptedCollab\(buildAcceptedConversation\(accepted\), accepted\)/);

  const callback = page.slice(page.indexOf("const openAcceptedCollab"), page.indexOf("const openMemberChat"));
  assert.match(callback, /setOpenRequest/);
  assert.doesNotMatch(callback, /setActiveTab\("messages"\)/);
});

test("refus et annulations mutent réellement les collaborations", async () => {
  const workspace = await readSource("features/messaging/CollabsWorkspace.tsx");
  assert.match(workspace, /const rejectCollab[\s\S]*?filter\(\(item\) => item\.id !== collab\.id\)/);
  assert.match(workspace, /const cancelCollab[\s\S]*?acceptedState: "cancelled"/);
  assert.match(workspace, /Annuler la demande/);
  assert.match(workspace, /Annuler la collab/);
});

test("le contrôleur live garde Supabase comme source de vérité et verrouille les mutations", async () => {
  const workspace = await readSource("features/messaging/CollabsWorkspace.tsx");
  const controller = workspace.slice(
    workspace.indexOf("export type CollabsWorkspaceLiveController"),
    workspace.indexOf("export type CollabsWorkspaceProps"),
  );
  const component = workspace.slice(workspace.indexOf("export function CollabsWorkspace"));

  assert.match(controller, /markViewed:/);
  assert.match(controller, /acceptRequest:/);
  assert.match(controller, /declineRequest:/);
  assert.match(controller, /cancelRequest:/);
  assert.match(controller, /isMutating:/);
  assert.match(controller, /status\?: CollabsWorkspaceLiveStatus/);
  assert.match(controller, /retry\?:/);
  assert.match(component, /controlledCollabs \?\? \(isLive \? \[\] : demoCollabs\)/);
  assert.match(component, /if \(isLive\) return;[\s\S]*?collabSessionItems = demoItems/);
  assert.match(component, /await liveController\.acceptRequest\(collab\.id\)/);
  assert.match(component, /await liveController\.declineRequest\(collab\.id\)/);
  assert.match(component, /collab\.status !== "sent" \|\| collab\.isReceived/);
  assert.match(component, /!isLive && detailCollab\.status === "accepted"/);
  assert.match(component, /disabled=\{detailIsMutating \|\| Boolean\(detailLiveServer\?\.relationshipBlocked\)\}/);
  assert.match(component, /detailLiveServer\?\.canAccept/);
  assert.match(component, /detailLiveServer\?\.canDecline/);
  assert.match(component, /detailLiveServer\?\.canCancel/);
  assert.match(component, /role="alert"/);
  assert.match(component, /isEmptyLiveLoading[\s\S]*?Chargement des collaborations/);
  assert.match(component, /isEmptyLiveError[\s\S]*?Réessayer/);
});

test("une demande du Globe rejoint Collabs avec les garde-fous produit", async () => {
  const [composer, hover, bridge, page, workspace] = await Promise.all([
    readSource("features/globe/components/preProfile/CollaborationComposer.tsx"),
    readSource("features/globe/components/preProfile/HoverPreProfileContent.tsx"),
    readSource("features/messaging/collaborationRequestBridge.ts"),
    readSource("features/messaging/MessagingPage.tsx"),
    readSource("features/messaging/CollabsWorkspace.tsx"),
  ]);

  assert.match(composer, /MESSAGE_MAX_LENGTH = 500/);
  assert.match(composer, /ATTACHMENT_MAX_COUNT = 3/);
  assert.match(composer, /accept="image\/jpeg,image\/png,image\/webp,audio\/\*,video\/\*,application\/pdf"/);
  assert.match(composer, /getAttachmentKind[\s\S]*?application\/pdf/);
  assert.match(hover, /submitGlobeCollaborationRequest\(/);

  assert.match(bridge, /message\.length > MESSAGE_MAX_LENGTH/);
  assert.match(bridge, /draft\.attachments\.length > ATTACHMENT_MAX_COUNT/);
  assert.match(bridge, /file\.type\.startsWith\("audio\/"\)/);
  assert.match(bridge, /file\.type\.startsWith\("video\/"\)/);
  assert.match(bridge, /origin: "globe"/);
  assert.match(bridge, /senderProfileId/);
  assert.match(bridge, /recipientProfileId/);
  assert.match(bridge, /createdAt/);

  assert.match(page, /subscribeToGlobeCollaborationRequests/);
  assert.match(page, /<CollabsWorkspace[\s\S]*?collabs=\{allCollabs\}/);
  assert.match(workspace, /collab\.origin === "globe"/);
  assert.match(workspace, /Via le Globe/);
});
