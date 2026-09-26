import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_CHAT_SCRIPT } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { MEEWAV_EMOTICONS } from "../../emoticons/MeewavEmoticons";
import { CAGE_ROOM_PRESENTATION, CLASSE_ROOM_PRESENTATION, PLACE_ROOM_PRESENTATION, RoomPresentationProvider, type RoomPresentation } from "../roomPresentation";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

function renderHostChat(source: "live" | "demo" = "live", presentation: RoomPresentation = PLACE_ROOM_PRESENTATION, overrides: Partial<ComponentProps<typeof PlaceStudioPanel>> = {}) {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  const onSendMessage = vi.fn().mockResolvedValue(undefined);
  const room = createPlaceDemoState(roomHostId());
  room.source = source;
  room.messages.push({
    id: "server-host-message",
    author: room.host,
    content: "Je relance depuis le pré-refrain.",
    createdAt: new Date().toISOString(),
  });
  const props: ComponentProps<typeof PlaceStudioPanel> = {
    room,
    isHost: true,
    isGuest: false,
    canEngage: true,
    collapsed: false,
    onCollapsedChange: noop,
    surface: "chat",
    onSurface: noop,
    mixerView: "volumes",
    onMixerView: noop,
    onGain: noop,
    onMute: noop,
    onCamera: noop,
    onVocal: noop,
    onTune: noop,
    pitchProvider: "none",
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
    localAudioStatus: "idle",
    localAudioError: null,
    pluginInventory: [],
    pluginsRefreshing: false,
    nativePluginStatus: "idle",
    nativePluginAudioReady: false,
    nativePluginError: null,
    onPitchProvider: vi.fn().mockResolvedValue(true),
    onRefreshPlugins: asyncNoop,
    onRemoveNativePlugin: asyncNoop,
    onToggleMonitoring: noop,
    onTogglePlayback: noop,
    onSendMessage,
    onJoinQueue: asyncNoop,
    onLeaveQueue: asyncNoop,
    onAcceptInvitation: asyncNoop,
    onDeclineInvitation: asyncNoop,
    onMarkReady: asyncNoop,
    onLaunchPoll: asyncNoop,
    onStopPoll: asyncNoop,
    onPinHighlight: asyncNoop,
    onPinMessage: asyncNoop,
    onDeleteMessage: asyncNoop,
    onClearHighlight: asyncNoop,
    onMoveGuest: asyncNoop,
    onRemoveGuest: asyncNoop,
    onSetQueueOpen: asyncNoop,
    onOpenProfile: noop,
    onMessageProfile: noop,
    onCollaborateProfile: noop,
    ...overrides,
  };

  render(<RoomPresentationProvider presentation={presentation}><PlaceStudioPanel {...props} /></RoomPresentationProvider>);
  return { onSendMessage, props };
}

function roomHostId() {
  return createPlaceDemoState().host.id;
}

describe("Cage viewer participation beside Chat", () => {
  function viewerRoom() {
    const room = createPlaceDemoState();
    room.currentUserProfile = { ...room.host, id: "cage-viewer-test", displayName: "Viewer test" };
    room.queueOpen = true;
    return room;
  }

  it("shows one participation action from Chat and hides the mixer before admission", () => {
    const room = viewerRoom();
    const { props } = renderHostChat("demo", CAGE_ROOM_PRESENTATION, { room, isHost: false });
    expect(screen.getAllByRole("button", { name: "Participer au battle" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Écrire un message" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Mixeur" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Participer au battle" }));
    expect(props.onJoinQueue).toHaveBeenCalledTimes(1);
  });

  it("does not offer a candidature when the host closed the queue", () => {
    const room = viewerRoom();
    room.queueOpen = false;
    renderHostChat("demo", CAGE_ROOM_PRESENTATION, { room, isHost: false });
    expect(screen.queryByRole("button", { name: "Participer au battle" })).not.toBeInTheDocument();
  });

  it("mounts only one OBS MeeWav preparation panel and makes the personal mixer available after acceptance", () => {
    const room = viewerRoom();
    room.participants.push({ ...room.participants[0], id: "viewer-slot", profile: room.currentUserProfile!, status: "accepted" });
    renderHostChat("demo", CAGE_ROOM_PRESENTATION, { room, isHost: false });
    expect(screen.getAllByRole("region", { name: "Préparation privée OBS MeeWav", hidden: true })).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Mixeur" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Je suis prêt" })).toBeDisabled();
  });

  it("keeps the candidature available to retry after a connection error", async () => {
    const room = viewerRoom();
    const onJoinQueue = vi.fn().mockRejectedValue(new Error("offline"));
    renderHostChat("demo", CAGE_ROOM_PRESENTATION, { room, isHost: false, onJoinQueue });
    fireEvent.click(screen.getByRole("button", { name: "Participer au battle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La demande n’a pas abouti");
    expect(screen.getByRole("button", { name: "Participer au battle" })).toBeEnabled();
  });
});

describe("Place Studio Host chat", () => {
  it("place les sous-menus immédiatement sous l’onglet Chat", () => {
    renderHostChat("demo", CLASSE_ROOM_PRESENTATION);
    const tools = screen.getByRole("tablist", { name: "Actions du Chat" });
    expect(tools.parentElement).toHaveClass("place-chat-workspace");
    expect(tools.nextElementSibling).toHaveClass("place-chat-workspace__body");
    expect(within(tools).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Messages", "Sondages", "Épinglés", "Cadeaux"]);
    expect(screen.queryByRole("group", { name: "Outils du chat" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Écrire un message" })).toBeVisible();
  });

  it("garde le brouillon et laisse le partage d’écran dans la barre vidéo", () => {
    renderHostChat("demo", CLASSE_ROOM_PRESENTATION);
    const editor = screen.getByRole("textbox", { name: "Écrire un message" });
    fireEvent.input(editor, { target: { textContent: "Je vous montre le projet." } });
    expect(screen.queryByRole("button", { name: /Partage d’écran|Choisir une source/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Sondages" }));
    expect(screen.getByRole("tabpanel", { name: "Sondages" })).toBeVisible();
    expect(editor).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    expect(editor).toBeVisible();
    expect(editor).toHaveTextContent("Je vous montre le projet.");
  });

  it.each(["Sondages", "Épinglés", "Cadeaux"])("ouvre %s puis revient aux messages", (name) => {
    renderHostChat("demo", CLASSE_ROOM_PRESENTATION);
    const action = screen.getByRole("tab", { name });
    fireEvent.click(action);
    expect(action).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    expect(action).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Écrire un message" })).toBeVisible();
  });

  it("affiche les portraits sans sous-menu de gestion pour le viewer", () => {
    renderHostChat("demo", CLASSE_ROOM_PRESENTATION, { isHost: false });
    expect(screen.queryByRole("tab", { name: "Épinglés" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Actions du Chat" })).not.toBeInTheDocument();
    expect(document.querySelector(".place-chat__portrait img")).not.toBeNull();
    expect(document.querySelector(".place-chat__author strong")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Désépingler" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mettre en avant" })).not.toBeInTheDocument();
  });

  it("partage la finition du mur d’émoticônes entre les Chats", () => {
    renderHostChat("demo", CLASSE_ROOM_PRESENTATION);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une émoticône MeeWav" }));
    expect(screen.getByRole("dialog")).toHaveClass("mw-emoticon-wall--room-chat");
    cleanup();
    renderHostChat();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une émoticône MeeWav" }));
    expect(screen.getByRole("dialog")).toHaveClass("mw-emoticon-wall--room-chat");
  });

  it("utilise des émoticônes MeeWav existantes dans les messages initiaux et la simulation", () => {
    const content = [...createPlaceDemoState().messages, ...PLACE_DEMO_CHAT_SCRIPT].map((message) => message.content).join(" ");
    const tokens = [...content.matchAll(/\[\[mw:([a-z0-9-]+)\]\]/g)];
    const messages = PLACE_DEMO_CHAT_SCRIPT.map((beat) => beat.content);
    expect(messages.filter((text) => !text.includes("[[mw:")).length).toBeGreaterThan(messages.length / 2);
    expect(messages.filter((text) => /^(\[\[mw:[a-z0-9-]+\]\]\s*)+$/.test(text)).length).toBeGreaterThanOrEqual(3);
    expect(messages.filter((text) => /\S.+\[\[mw:[a-z0-9-]+\]\].+\S/.test(text)).length).toBeGreaterThanOrEqual(2);
    expect(new Set(tokens.map(([, name]) => name)).size).toBeGreaterThanOrEqual(8);
    expect(content).not.toMatch(/[🔥👌]/u);
    for (const [, name] of tokens) {
      const item = MEEWAV_EMOTICONS.find((candidate) => candidate.name === name);
      expect(item, name).toBeDefined();
      expect(existsSync(resolve(process.cwd(), "public", item!.assetPath.slice(1))), name).toBe(true);
    }
    renderHostChat("demo");
    expect(screen.getAllByRole("img", { name: "Micro en flamme" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Cœur avec casque" })).toHaveAttribute("src", "/meewav-emojis/webp/256/coeur-casque.webp");
    for (const article of screen.getAllByRole("article")) expect(article.textContent).not.toContain("[[mw:");
  });
  it("never scripts a message in the Host's name", () => {
    const room = createPlaceDemoState();
    expect(PLACE_DEMO_CHAT_SCRIPT.every((beat) => beat.author.id !== room.host.id)).toBe(true);
  });

  it("keeps the Host composer active and sends a public message", async () => {
    const { onSendMessage } = renderHostChat();
    const input = screen.getByRole("textbox", { name: "Écrire un message" });
    expect(input).toBeEnabled();

    fireEvent.input(input, { target: { textContent: "Je relance depuis le pré-refrain." } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith("Je relance depuis le pré-refrain."));
  });

  it("n’active l’envoi que pour un brouillon utile et le réinitialise après envoi", async () => {
    const { onSendMessage } = renderHostChat();
    const input = screen.getByRole("textbox", { name: "Écrire un message" });
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();
    fireEvent.input(input, { target: { textContent: "   " } });
    expect(send).toBeDisabled();
    fireEvent.input(input, { target: { textContent: "  On reprend le refrain.  " } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith("On reprend le refrain."));
    expect(input).toHaveTextContent("");
    expect(input).toHaveAttribute("data-empty", "true");
    expect(send).toBeDisabled();
  });

  it("envoie au clavier depuis le champ et conserve le focus", async () => {
    const { onSendMessage } = renderHostChat();
    const input = screen.getByRole("textbox", { name: "Écrire un message" });
    input.focus();
    fireEvent.input(input, { target: { textContent: "Prêts pour la prise ?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith("Prêts pour la prise ?"));
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });

  it("annonce l’ouverture des émoticônes et rend le focus à la touche après Échap", () => {
    renderHostChat();
    const trigger = screen.getByRole("button", { name: "Ajouter une émoticône MeeWav" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Mur d’émoticônes" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("envoie aussi une émoticône choisie depuis le mur", async () => {
    const { onSendMessage } = renderHostChat();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une émoticône MeeWav" }));
    fireEvent.click(screen.getByRole("listitem", { name: "Micro en flamme" }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith("[[mw:micro-flamme]]"));
  });

  it("garde le dernier message réel du Host au bord du direct en mode démo", () => {
    renderHostChat("demo");
    const articles = screen.getAllByRole("article");
    const lastArticle = articles[articles.length - 1];
    expect(lastArticle).toHaveAttribute("data-author-role", "host");
    expect(within(lastArticle).getByText("Je relance depuis le pré-refrain.")).toBeVisible();
  });

  it("marks only the server-derived Room owner as Host", () => {
    renderHostChat();

    const hostMessage = screen.getByRole("article", { name: "Message du Host Naya Oris" });
    expect(hostMessage).toHaveClass("is-host");
    expect(hostMessage).toHaveAttribute("data-author-role", "host");
    expect(within(hostMessage).getByLabelText("Host de la Room")).toHaveTextContent("HOST");

    const participantMessage = screen.getByText(/Le refrain reste en tête, garde cette prise/)
      .closest("article")!;
    expect(participantMessage).toHaveAttribute("data-author-role", "participant");
    expect(within(participantMessage).queryByText("HOST")).not.toBeInTheDocument();
  });
});
