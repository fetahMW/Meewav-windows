import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";
import PlaceChatSocialActions from "./PlaceChatSocialActions";

import { LIVE_ROOM_PRESENTATIONS, RoomPresentationProvider } from "../roomPresentation";
import { AuthContext, type AuthContextValue } from "../../auth/AuthContext";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

const anonymousAuth: AuthContextValue = {
  session: null, user: null, status: "anonymous", needsOnboarding: false,
  onboardingStatus: "complete", error: null,
  refreshSession: async () => null, signOut: async () => {}, markOnboardingComplete: () => {},
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function chatProps(overrides: Partial<ComponentProps<typeof PlaceStudioPanel>> = {}) {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  const room = createPlaceDemoState();
  return {
    room,
    isHost: true,
    isGuest: false,
    canEngage: true,
    collapsed: false,
    onCollapsedChange: noop,
    surface: "chat" as const,
    onSurface: noop,
    mixerView: "volumes" as const,
    onMixerView: noop,
    onGain: noop,
    onMute: noop,
    onCamera: noop,
    onVocal: noop,
    onTune: noop,
    pitchProvider: "none" as const,
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
    localAudioStatus: "idle" as const,
    localAudioError: null,
    pluginInventory: [],
    pluginsRefreshing: false,
    nativePluginStatus: "idle" as const,
    nativePluginAudioReady: false,
    nativePluginError: null,
    onPitchProvider: vi.fn().mockResolvedValue(true),
    onRefreshPlugins: asyncNoop,
    onRemoveNativePlugin: asyncNoop,
    onToggleMonitoring: noop,
    onTogglePlayback: noop,
    onSendMessage: asyncNoop,
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
  } satisfies ComponentProps<typeof PlaceStudioPanel>;
}

describe("Shared Room Chat actions", () => {
  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("provides the same functional Chat rail in $label", async (presentation) => {
    const props = chatProps();
    props.room.highlightText = "Message mis en avant pour le test";
    render(<MemoryRouter><AuthContext.Provider value={anonymousAuth}><RoomPresentationProvider presentation={presentation}><PlaceStudioPanel {...props} /></RoomPresentationProvider></AuthContext.Provider></MemoryRouter>);
    const tools = screen.getByRole("tablist", { name: "Actions du Chat" });
    expect(tools.parentElement).toHaveClass("place-chat-workspace");
    expect(within(tools).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Messages", "Sondages", "Épinglés", "Cadeaux"]);
    expect(screen.queryByRole("button", { name: /Choisir une source|Démarrer le partage/ })).not.toBeInTheDocument();
    fireEvent.click(within(tools).getByRole("tab", { name: "Sondages" }));
    expect(await screen.findByRole("tabpanel", { name: "Sondages" })).toBeVisible();
    fireEvent.click(within(tools).getByRole("tab", { name: "Épinglés" }));
    expect(screen.getByRole("tabpanel", { name: "Épinglés" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retirer de l’écran" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Retirer de l’écran" }));
    await waitFor(() => expect(props.onClearHighlight).toHaveBeenCalledOnce());
  });

  it("épingle un message directement dans le Chat", async () => {
    const room = createPlaceDemoState();
    room.pinnedMessageId = null;
    room.highlightText = null;
    const props = chatProps({ room, onPinMessage: vi.fn().mockResolvedValue(undefined), onPinHighlight: vi.fn().mockResolvedValue(undefined) });
    render(<PlaceStudioPanel {...props} />);
    const message = room.messages.find((item) => !item.isSystem && item.author)!;
    fireEvent.click(screen.getByRole("tab", { name: "Épinglés" }));
    const pinPanel = screen.getByRole("tabpanel", { name: "Épinglés" });
    fireEvent.click(within(pinPanel).getByRole("button", { name: "Choisir dans le chat" }));
    const article = screen.getByText(message.content.split("[[")[0].trim(), { exact: false }).closest("article")!;
    fireEvent.click(within(article).getByRole("button", { name: /Épingler le message de/ }));
    await waitFor(() => expect(props.onPinMessage).toHaveBeenCalledWith(message.id));
    expect(props.onPinHighlight).not.toHaveBeenCalled();

    expect(screen.queryByRole("tab", { name: "Mettre en avant" })).not.toBeInTheDocument();
  });

  it("keeps a drafted message when visiting a Chat action", () => {
    render(<PlaceStudioPanel {...chatProps()} />);
    const composer = screen.getByRole("textbox", { name: "Écrire un message" });
    fireEvent.input(composer, { target: { textContent: "Mon brouillon" } });
    fireEvent.click(screen.getByRole("tab", { name: "Sondages" }));
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    expect(screen.getByRole("textbox", { name: "Écrire un message" })).toHaveTextContent("Mon brouillon");
  });

  it("lets viewers vote without exposing Host editorial controls or raffles", () => {
    const props = chatProps({ isHost: false, onVotePoll: vi.fn() });
    props.room.poll = { id: "chat-poll", question: "On continue ?", options: [{ label: "Oui", votes: 0 }, { label: "Non", votes: 0 }], durationSeconds: 30, endsAt: null, resultsVisible: false, isActive: true, currentUserVoteIndex: null };
    render(<PlaceStudioPanel {...props} />);
    expect(screen.queryByRole("tablist", { name: "Actions du Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Outils du chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Désépingler" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mettre en avant" })).not.toBeInTheDocument();
    const pollPanel = screen.getByText("On continue ?").closest<HTMLElement>(".rooms-chat-poll-slot")!;
    fireEvent.click(within(pollPanel).getAllByRole("button")[0]);
    expect(props.onVotePoll).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: /Tirage/ })).not.toBeInTheDocument();
  });

  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("garde les interactions viewer fonctionnelles dans le Chat de $label", async (presentation) => {
    const room = createPlaceDemoState();
    room.currentUserHasLiked = false;
    room.currentUserHasGoldenLiked = false;
    const onLike = vi.fn();
    const onGoldenLike = vi.fn(async () => true);
    const onOpenDonation = vi.fn();
    const props = chatProps({
      room,
      isHost: false,
      chatSocialActions: <PlaceChatSocialActions room={room} canEngage goldenUnavailable={false}
        onLike={onLike} onGoldenLike={onGoldenLike} onOpenDonation={onOpenDonation} />,
    });
    render(<RoomPresentationProvider presentation={presentation}><PlaceStudioPanel {...props} /></RoomPresentationProvider>);
    const social = screen.getByRole("complementary", { name: `Soutenir ${room.host.displayName}, host du live` });
    expect(social.closest(".place-chat-workspace__body")).not.toBeNull();
    const engagement = social.parentElement!;
    expect(engagement).toHaveClass("place-chat-workspace__engagement");
    const heading = within(engagement).getByRole("heading", { name: /Soutenir le host/ });
    expect(heading.children).toHaveLength(2);
    expect(heading.children[0]).toHaveTextContent("Soutenir le host");
    expect(heading.children[1]).toHaveTextContent("Likes · Golden Likes · dons");
    expect(engagement.nextElementSibling).toHaveAttribute("aria-label", "Messages du chat");
    fireEvent.click(within(social).getByRole("button", { name: /Aimer la vidéo/ }));
    expect(onLike).toHaveBeenCalledOnce();
    fireEvent.click(within(social).getByRole("button", { name: /Ouvrir la bourse/ }));
    expect(onOpenDonation).toHaveBeenCalledOnce();
    expect(within(social).getByRole("button", { name: /Offrir un Golden Like/ })).toBeEnabled();
    fireEvent.click(within(social).getByRole("button", { name: /Offrir un Golden Like/ }));
    const confirmation = screen.getByRole("dialog", { name: `Offrir ton Golden Like à ${room.host.displayName} ?` });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Offrir mon Golden Like" }));
    await waitFor(() => expect(onGoldenLike).toHaveBeenCalledOnce());
  });
});
