import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";
import { profileGiftDateAfter } from "../../profile/gifts/profileGiftCatalog";
import type { RoomGiftDelivery, RoomGiftDeliveryInput } from "./place.types";

const { listConversations } = vi.hoisted(() => ({ listConversations: vi.fn() }));

vi.mock("../../messaging/messaging.service", () => ({
  messagingRepository: { listConversations },
}));

beforeEach(() => {
  listConversations.mockReset();
});

afterEach(cleanup);

function giftRoomFixture() {
  const room = createPlaceDemoState();
  const recipient = room.participants.find(participant => participant.profile.id === PLACE_DEMO_PROFILES.guestA.id);
  if (!recipient) throw new Error("gift_recipient_missing");
  recipient.status = "onstage";
  return room;
}

function renderToolsPanel(
  room = giftRoomFixture(),
  overrides: Partial<ComponentProps<typeof PlaceStudioPanel>> = {},
) {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
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
    onSubmitGift: vi.fn(async (input: RoomGiftDeliveryInput): Promise<RoomGiftDelivery> => ({
      id: "delivery-demo",
      roomId: room.id,
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      action: input.action,
      status: input.action === "send_now" ? "sent" : input.action === "schedule" ? "scheduled" : "ready",
      roundLabel: input.roundLabel,
      recipientProfileId: input.recipientProfileId,
      recipientDisplayName: input.recipientDisplayName,
      recipientAvatarUrl: input.recipientAvatarUrl,
      recipientSource: input.recipientSource,
      scheduledAt: input.scheduledAt,
      sentAt: input.action === "send_now" ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    })),
    onMoveGuest: asyncNoop,
    onRemoveGuest: asyncNoop,
    onSetQueueOpen: asyncNoop,
    onOpenProfile: noop,
    onMessageProfile: noop,
    onCollaborateProfile: noop,
    ...overrides,
  };
  render(<PlaceStudioPanel {...props} />);
  return room;
}

describe("PlaceStudioPanel gift integration", () => {
  it("separates stage, backstage, queue and explicit local-demo messaging recipients", async () => {
    const room = renderToolsPanel();

    fireEvent.click(screen.getByRole("tab", { name: "Cadeaux" }));
    const tool = screen.getByRole("region", { name: "Envoyer un cadeau" });
    expect(tool).not.toHaveTextContent("€");

    fireEvent.click(within(tool).getByRole("button", { name: /Distinction Live/i }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir le destinataire" }));

    const stage = within(tool).getByRole("group", { name: "Sur scène" });
    const backstage = within(tool).getByRole("group", { name: "Coulisses" });
    const queue = within(tool).getByRole("group", { name: "File d’attente" });
    const messaging = within(tool).getByRole("group", { name: "Messagerie" });

    const stageGuests = room.participants.filter((participant) => participant.status === "onstage");
    const backstageGuests = room.participants.filter((participant) => participant.status === "backstage");
    expect(within(stage).getAllByRole("button")).toHaveLength(stageGuests.length);
    expect(within(backstage).getAllByRole("button")).toHaveLength(backstageGuests.length);
    expect(within(queue).getAllByRole("button")).toHaveLength(room.queue.length);
    stageGuests.forEach((participant) => expect(within(stage).getByRole("button", { name: participant.profile.displayName })).toBeVisible());
    backstageGuests.forEach((participant) => expect(within(backstage).getByRole("button", { name: participant.profile.displayName })).toBeVisible());
    expect(within(queue).getByRole("button", { name: room.queue[0].profile.displayName })).toBeVisible();
    expect(within(tool).queryByRole("button", { name: room.host.displayName })).not.toBeInTheDocument();
    expect(tool).not.toHaveTextContent("Membres de ma wave");
    expect(within(tool).queryByRole("button", { name: "Ilyes" })).not.toBeInTheDocument();

    await waitFor(() => expect(messaging).toHaveTextContent("Contacts locaux de démonstration"));
    expect(listConversations).not.toHaveBeenCalled();

    fireEvent.click(within(stage).getByRole("button", { name: "Lior Benali" }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir l’envoi" }));
    expect(within(tool).getByRole("button", { name: "Envoyer" })).toBeEnabled();
    expect(within(tool).getByRole("button", { name: /Offrir.*À une personne/i })).toBeVisible();
  });

  it.each([
    ["Envoyer maintenant", "Envoyer", "send_now", null, null],
    ["Programmer", "Programmer", "schedule", "scheduled", null],
    ["Ajouter à une ronde", "Ajouter", "round", null, "Fans récents"],
  ] as const)("maps the Profile action %s to the direct Room delivery callback", async (
    profileAction,
    submitLabel,
    expectedAction,
    scheduleMode,
    expectedRound,
  ) => {
    const onSubmitGift = vi.fn(async (input: RoomGiftDeliveryInput) => ({
      id: `delivery-${expectedAction}`,
      roomId: "room-demo",
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      action: input.action,
      status: input.action === "send_now" ? "sent" as const : input.action === "schedule" ? "scheduled" as const : "ready" as const,
      roundLabel: input.roundLabel,
      recipientProfileId: input.recipientProfileId,
      recipientDisplayName: input.recipientDisplayName,
      recipientAvatarUrl: input.recipientAvatarUrl,
      recipientSource: input.recipientSource,
      scheduledAt: input.scheduledAt,
      sentAt: input.action === "send_now" ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    }));
    renderToolsPanel(giftRoomFixture(), { onSubmitGift });

    fireEvent.click(screen.getByRole("tab", { name: "Cadeaux" }));
    const tool = screen.getByRole("region", { name: "Envoyer un cadeau" });
    fireEvent.click(within(tool).getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir le destinataire" }));
    fireEvent.click(within(tool).getByRole("button", { name: "Lior Benali" }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir l’envoi" }));
    if (profileAction !== "Envoyer maintenant") {
      fireEvent.click(within(within(tool).getByRole("group", { name: "Moment d’envoi" }))
        .getByRole("button", { name: profileAction }));
    }
    if (scheduleMode) {
      fireEvent.change(within(tool).getByLabelText("Date"), { target: { value: profileGiftDateAfter(1) } });
      fireEvent.change(within(tool).getByLabelText("Heure"), { target: { value: "19:15" } });
    }
    if (expectedRound) {
      fireEvent.click(within(tool).getByRole("combobox", { name: "Ronde" }));
      fireEvent.click(screen.getByRole("option", { name: expectedRound }));
    }
    fireEvent.click(within(tool.querySelector(".place-gift-tool__footer")!)
      .getByRole("button", { name: submitLabel }));

    await waitFor(() => expect(onSubmitGift).toHaveBeenCalledOnce());
    expect(onSubmitGift).toHaveBeenCalledWith(expect.objectContaining({
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      recipientProfileId: expect.any(String),
      recipientDisplayName: "Lior Benali",
      recipientSource: "stage",
      action: expectedAction,
      scheduledAt: expectedAction === "schedule" ? expect.any(String) : null,
      roundLabel: expectedRound,
      idempotencyKey: expect.stringMatching(/^room-gift:/),
    }));
  });

  it("uses only direct-conversation counterparts in live Rooms and never falls back to demo names", async () => {
    listConversations.mockResolvedValueOnce([
      {
        kind: "direct",
        counterpart_profile_id: "71000000-0000-4000-8000-000000000001",
        counterpart_username: "contact.live",
        counterpart_display_name: "Contact Live",
        counterpart_avatar_url: "/avatars/contact-live.webp",
        counterpart_primary_role_key: "music_producer",
      },
      {
        kind: "direct",
        counterpart_profile_id: "71000000-0000-4000-8000-000000000001",
        counterpart_username: "duplicate",
        counterpart_display_name: "Doublon Live",
      },
    ]);
    const room = createPlaceDemoState();
    room.source = "live";
    renderToolsPanel(room);

    fireEvent.click(screen.getByRole("tab", { name: "Cadeaux" }));
    const tool = screen.getByRole("region", { name: "Envoyer un cadeau" });
    fireEvent.click(within(tool).getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir le destinataire" }));

    await waitFor(() => expect(within(tool).getByRole("button", { name: "Contact Live" })).toBeVisible());
    expect(listConversations).toHaveBeenCalledWith({ kinds: ["direct"], limit: 50 });
    expect(within(tool).queryByRole("button", { name: "Doublon Live" })).not.toBeInTheDocument();
    expect(tool).not.toHaveTextContent("Contacts locaux de démonstration");
    expect(tool).not.toHaveTextContent("Echo Flow");
    expect(tool).not.toHaveTextContent("Membres de ma wave");
  });

  it("shows the actual identifiable demo pool instead of the decorative audience total", () => {
    const room = renderToolsPanel();
    const expectedEligible = new Set([
      ...room.participants
        .filter((participant) => participant.profile.id !== room.host.id)
        .map((participant) => participant.profile.id),
      ...room.queue
        .filter((participant) => participant.profile.id !== room.host.id)
        .map((participant) => participant.profile.id),
    ]).size;

    fireEvent.click(screen.getByRole("tab", { name: "Cadeaux" }));
    const tool = screen.getByRole("region", { name: "Envoyer un cadeau" });
    fireEvent.click(within(tool).getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    fireEvent.click(within(tool).getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(within(tool).getByRole("button", { name: "Choisir les participants" }));

    const wholeRoom = within(within(tool).getByRole("group", { name: "Source des participants" }))
      .getByRole("button", { name: /Toute la Room/i });
    expect(wholeRoom).toHaveTextContent(String(expectedEligible));
    expect(wholeRoom).not.toHaveTextContent(room.participantsCount.toLocaleString("fr-FR"));
    fireEvent.click(wholeRoom);
    expect(within(tool).getByText(`${expectedEligible.toLocaleString("fr-FR")} comptes réellement éligibles dans cette démo.`)).toBeVisible();
  });
});
