import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import CollabsWorkspace from "./CollabsWorkspace";
import type { ConversationRequest } from "./MessageWorkspace";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MessageWorkspace, { type MessagingWorkspaceLiveController } from "./MessageWorkspace";
import { demoConversations, type DemoConversation, type DemoMessage } from "./messagingDemoData";

function conversation(id: string, name: string, messages: DemoMessage[] = []): DemoConversation {
  return {
    id,
    name,
    handle: `@${name.toLowerCase()}`,
    role: "Artiste",
    avatar: "/avatars/utilisateur.png",
    status: "En ligne",
    online: true,
    unread: 0,
    preview: messages[messages.length - 1]?.body ?? "",
    time: "Maintenant",
    messages,
  };
}

function liveController() {
  const messages: DemoMessage[] = [
    { id: "message-received", author: "them", kind: "text", body: "Le refrain fonctionne très bien.", time: "12:10", reactions: ["🔥 1"] },
    { id: "message-sent", author: "me", kind: "text", body: "Je garde cette version.", time: "12:11" },
  ];
  const selected = conversation("conversation-main", "Nadir", messages);
  const target = conversation("conversation-target", "Alya");
  const sendText = vi.fn(async () => true);
  const setReaction = vi.fn(async () => true);
  const pinMessage = vi.fn(async () => true);
  const deleteMessage = vi.fn(async () => true);
  const forwardMessage = vi.fn(async () => true);
  const value: MessagingWorkspaceLiveController = {
    conversations: [selected, target],
    selectedConversationId: selected.id,
    selectedConversation: selected,
    messages,
    inboxStatus: "ready",
    messagesStatus: "ready",
    selectConversation: vi.fn(),
    retryInbox: vi.fn(),
    retryMessages: vi.fn(),
    sendText,
    retryMessage: vi.fn(),
    setReaction,
    pinMessage,
    deleteMessage,
    forwardMessage,
    togglePinned: vi.fn(),
    toggleMuted: vi.fn(),
    archiveConversation: vi.fn(),
  };
  return { value, sendText, setReaction, pinMessage, deleteMessage, forwardMessage };
}

function messageElement(body: string) {
  const element = screen.getAllByText(body)
    .map((candidate) => candidate.closest<HTMLElement>(".mw-message"))
    .find((candidate): candidate is HTMLElement => Boolean(candidate));
  if (!element) throw new Error(`Message introuvable: ${body}`);
  return element;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MessageWorkspace message actions", () => {
  it("referme le panneau de recherche au clic extérieur, avec Échap et avec la loupe", async () => {
    const live = liveController();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    const trigger = screen.getByRole("button", { name: "Rechercher dans la conversation" });
    await user.click(trigger);
    const drawer = screen.getByRole("complementary", { name: "Options de la conversation" });
    await user.click(within(drawer).getByPlaceholderText("Rechercher dans la conversation"));
    expect(drawer).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("complementary", { name: "Options de la conversation" })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("complementary", { name: "Options de la conversation" })).not.toBeInTheDocument();
  });

  it("opens a portal menu from the bubble and exposes only authorized actions", async () => {
    const live = liveController();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(messageElement("Le refrain fonctionne très bien."));
    const receivedMenu = await screen.findByRole("menu", { name: "Actions du message de Nadir" });
    expect(receivedMenu.parentElement).toBe(document.body);
    expect(within(receivedMenu).getByRole("menuitem", { name: "Répondre" })).toBeVisible();
    expect(within(receivedMenu).getByRole("menuitem", { name: "Copier" })).toBeVisible();
    expect(within(receivedMenu).getByRole("menuitem", { name: "Transférer" })).toBeVisible();
    expect(within(receivedMenu).getByRole("menuitem", { name: "Épingler" })).toBeVisible();
    expect(within(receivedMenu).queryByRole("menuitem", { name: "Supprimer" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(messageElement("Je garde cette version."));
    expect(await screen.findByRole("menuitem", { name: "Supprimer" })).toBeVisible();
  });

  it("does not open the contextual menu from an interactive child", async () => {
    const live = liveController();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(screen.getByRole("button", { name: "Retirer la réaction 🔥 1" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(live.setReaction).toHaveBeenCalledWith("message-received", "🔥", true);
  });

  it("replies with the source message id and exposes an explicit composer banner", async () => {
    const live = liveController();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("menuitem", { name: "Répondre" }));
    expect(screen.getByText("Répondre à Nadir")).toBeVisible();
    expect(screen.getByText("Le refrain fonctionne très bien.", { selector: ".mw-composer-reply strong" })).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Écrire un message" }), "Je retravaille le second couplet.");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(live.sendText).toHaveBeenCalledWith(
      "Je retravaille le second couplet.",
      "message-received",
    ));
    expect(screen.queryByText("Répondre à Nadir")).not.toBeInTheDocument();
  });

  it("copies, reacts, pins, forwards and confirms deletion through real callbacks", async () => {
    const live = liveController();
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("menuitem", { name: "Copier" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Le refrain fonctionne très bien."));

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("button", { name: "Réagir avec 🔥" }));
    await waitFor(() => expect(live.setReaction).toHaveBeenCalledWith("message-received", "🔥", true));

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("menuitem", { name: "Épingler" }));
    await waitFor(() => expect(live.pinMessage).toHaveBeenCalledWith("message-received", true));

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("menuitem", { name: "Transférer" }));
    const dialog = await screen.findByRole("dialog", { name: "Transférer le message" });
    await user.click(within(dialog).getByRole("listitem", { name: "Transférer à Alya" }));
    await waitFor(() => expect(live.forwardMessage).toHaveBeenCalledWith("message-received", "conversation-target"));

    await user.click(messageElement("Je garde cette version."));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Confirmer la suppression du message" });
    await user.click(within(confirmation).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(live.deleteMessage).toHaveBeenCalledWith("message-sent"));
  });

  it("does not fake unsupported live actions", async () => {
    const live = liveController();
    delete live.value.pinMessage;
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);

    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(await screen.findByRole("menuitem", { name: "Épingler" }));
    expect(await screen.findByRole("status")).toHaveTextContent("n’est pas disponible dans cette session");
    expect(live.pinMessage).not.toHaveBeenCalled();
  });

  it("soft-deletes an owned demo message instead of only showing a success toast", async () => {
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} />);

    await user.click(messageElement("Ça roule."));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Confirmer la suppression du message" });
    await user.click(within(confirmation).getByRole("button", { name: "Supprimer" }));

    const deleted = document.querySelector<HTMLElement>('[data-message-id="msg_today_10"]');
    expect(deleted).toHaveTextContent("Message supprimé");
    expect(deleted).toHaveClass("is-deleted");
  });

  it("pins and forwards a demo message into the selected target conversation", async () => {
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} />);
    const source = messageElement("Ça roule.");

    await user.click(source);
    await user.click(await screen.findByRole("menuitem", { name: "Épingler" }));
    expect(within(source).getByText("Épinglé")).toBeVisible();

    await user.click(source);
    await user.click(await screen.findByRole("menuitem", { name: "Transférer" }));
    const target = demoConversations[1];
    const dialog = await screen.findByRole("dialog", { name: "Transférer le message" });
    await user.click(within(dialog).getByRole("listitem", { name: `Transférer à ${target.name}` }));
    expect(await screen.findByRole("status")).toHaveTextContent(`Message transféré à ${target.name}`);

    const targetRow = Array.from(document.querySelectorAll<HTMLButtonElement>(".mw-conversation-row"))
      .find((button) => button.textContent?.includes(target.name));
    expect(targetRow).toBeDefined();
    await user.click(targetRow!);
    const forwarded = messageElement("Ça roule.");
    expect(within(forwarded).getByText("Transféré")).toBeVisible();
  });
});


describe("Collaboration and reaction wiring", () => {
  it("keeps an accepted collaborator visible in contacts and sends into that conversation", async () => {
    function Harness() {
      const [request, setRequest] = useState<ConversationRequest | null>(null);
      const [space, setSpace] = useState<"messages" | "collabs">("collabs");
      return <MemoryRouter><MessageWorkspace newConversationSignal={0} activeSpace={space} contentSpace={space}
        openRequest={request} onRequestConsumed={() => setRequest(null)}
        rightPane={<CollabsWorkspace collabs={[{ id: "regression-collab", userId: "new-artist", name: "Nouvel artiste", role: "Beatmaker", avatar: "/avatars/utilisateur.png", verified: false, message: "Une session ensemble ?", meta: "Maintenant", rank: 1, status: "pending", isReceived: true, requestStatus: "pending", attachments: [] }]}
          onAcceptedCollab={(conversation) => { setRequest({ token: 1, ...conversation, conversation }); setSpace("messages"); }} />}
      /></MemoryRouter>;
    }
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Accepter" }));
    const list = view.container.querySelector(".mw-conversation-list") as HTMLElement;
    await waitFor(() => expect(within(list).getByRole("button", { name: /Nouvel artiste.*Collab acceptée/ })).toBeVisible());
    await user.type(screen.getByRole("textbox", { name: "Écrire un message" }), "Merci, on commence demain.");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getAllByText("Merci, on commence demain.").some((el) => el.closest(".mw-message"))).toBe(true);
    expect(within(list).getByRole("button", { name: /Nouvel artiste.*Merci, on commence demain/ })).toBeVisible();
  });

  it("opens the shared emoticon wall without dismissing the menu and sends its token", async () => {
    const live = liveController();
    const user = userEvent.setup();
    render(<MessageWorkspace newConversationSignal={0} liveController={live.value} />);
    await user.click(messageElement("Le refrain fonctionne très bien."));
    await user.click(screen.getByRole("button", { name: "Ouvrir le mur d’émoticônes" }));
    const wall = screen.getByRole("dialog", { name: "Mur d’émoticônes" });
    await user.click(within(wall).getAllByRole("listitem")[0]);
    expect(live.setReaction).toHaveBeenCalledWith("message-received", expect.stringMatching(/^\[\[mw:/), true);
    expect(screen.queryByRole("dialog", { name: "Mur d’émoticônes" })).not.toBeInTheDocument();
  });
});


describe("Collab conversation isolation", () => {
  it("keeps each request history in Collab and excludes it from the friends chat", async () => {
    const user = userEvent.setup();
    const first = { ...conversation("request-chat-a", "Demandeur A", [{ id: "request-a", author: "them" as const, kind: "text" as const, body: "Une demande pour A", time: "12:00" }]), collaborationRequestId: "request-a" };
    const second = { ...conversation("request-chat-b", "Demandeur B", [{ id: "request-b", author: "them" as const, kind: "text" as const, body: "Une demande pour B", time: "12:00" }]), collaborationRequestId: "request-b" };
    const renderChat = (space: "messages" | "collabs", request: ConversationRequest | null) => <MemoryRouter><MessageWorkspace
      newConversationSignal={0} activeSpace={space} contentSpace={space}
      conversationScope={space === "collabs" ? "collabs" : "friends"}
      showCollabConversation={space === "collabs"} openRequest={request}
    /></MemoryRouter>;
    const view = render(renderChat("collabs", { token: 1, ...first, conversation: first }));
    await screen.findByText("Une demande pour A");
    await user.type(screen.getByRole("textbox", { name: "Écrire un message" }), "Réponse réservée à A");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText("Réponse réservée à A");
    view.rerender(renderChat("messages", null));
    expect(screen.queryByText("Une demande pour A")).not.toBeInTheDocument();
    expect(screen.queryByText("Réponse réservée à A")).not.toBeInTheDocument();
    expect(view.container.querySelector(".mw-conversation-list")?.textContent).not.toContain("Demandeur A");
    view.rerender(renderChat("collabs", { token: 2, ...second, conversation: second }));
    await screen.findByText("Une demande pour B");
    expect(screen.queryByText("Réponse réservée à A")).not.toBeInTheDocument();
    view.rerender(renderChat("collabs", { token: 3, id: first.id, name: first.name, role: first.role, status: first.status }));
    await screen.findByText("Réponse réservée à A");
    expect(screen.queryByText("Une demande pour B")).not.toBeInTheDocument();
  });
});
