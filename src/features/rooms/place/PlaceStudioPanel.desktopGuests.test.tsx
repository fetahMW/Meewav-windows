import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";
import PlaceStage from "./PlaceStage";
import { PLACE_ROOM_PRESENTATION, RoomPresentationProvider } from "../roomPresentation";
import { readPlaceGuestDrag, writePlaceGuestDrag } from "./placeGuestDrag";

vi.mock("../../../runtime/RuntimeProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../runtime/RuntimeProvider")>();
  return { ...actual, useRuntime: () => ({ ...actual.WEB_CAPABILITIES, isDesktop: true }) };
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function dragTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const types: string[] = [];
  return {
    get types() { return types; },
    effectAllowed: "move",
    dropEffect: "move",
    setData(type: string, value: string) { data.set(type, value); if (!types.includes(type)) types.push(type); },
    getData(type: string) { return data.get(type) ?? ""; },
  } as unknown as DataTransfer;
}

function renderDesktopGuests({ readyGuest = false }: { readyGuest?: boolean } = {}) {
  const room = createPlaceDemoState();
  room.participants = room.participants.map((participant) => participant.id === "guest-b"
    ? { ...participant, status: "onstage" as const }
    : readyGuest && participant.id === "guest-d" ? { ...participant, status: "ready" as const } : participant);
  const onMoveGuest = vi.fn().mockResolvedValue(undefined);
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  const props: ComponentProps<typeof PlaceStudioPanel> = {
    room, isHost: true, isGuest: false, canEngage: true, collapsed: false,
    onCollapsedChange: noop, surface: "guests", onSurface: noop,
    mixerView: "volumes", onMixerView: noop, onGain: noop, onMute: noop,
    onCamera: noop, onVocal: noop, onTune: noop, pitchProvider: "none",
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
    localAudioStatus: "idle", localAudioError: null, pluginInventory: [],
    pluginsRefreshing: false, nativePluginStatus: "idle", nativePluginAudioReady: false,
    nativePluginError: null, onPitchProvider: asyncNoop, onRefreshPlugins: asyncNoop,
    onRemoveNativePlugin: asyncNoop, onToggleMonitoring: noop, onSendMessage: asyncNoop,
    onJoinQueue: asyncNoop, onLeaveQueue: asyncNoop, onAcceptInvitation: asyncNoop,
    onDeclineInvitation: asyncNoop, onMarkReady: asyncNoop, onLaunchPoll: asyncNoop,
    onStopPoll: asyncNoop, onPinHighlight: asyncNoop, onPinMessage: asyncNoop,
    onDeleteMessage: asyncNoop, onClearHighlight: asyncNoop, onMoveGuest,
    onRemoveGuest: asyncNoop, onSetQueueOpen: asyncNoop, onOpenProfile: noop,
    onMessageProfile: noop, onCollaborateProfile: noop,
  };
  render(<PlaceStudioPanel {...props} />);
  return { room, onMoveGuest };
}

describe("Desktop guest gestures", () => {
  it("keeps cards free of inline actions and moves the selected guest through the Room command", async () => {
    const { onMoveGuest } = renderDesktopGuests();
    const backstage = document.querySelector<HTMLElement>("#place-guests-backstage")!;
    const card = within(backstage).getByRole("button", { name: /Sélectionner Louna Saphir/ });
    expect(card.closest(".place-guest-row")?.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    const dock = screen.getByRole("toolbar", { name: "Actions des invités sélectionnés" });
    expect(within(dock).getAllByRole("button", { name: "Message" })).toHaveLength(1);
    expect(within(dock).getAllByRole("button", { name: /Voir la caméra/ })).toHaveLength(1);
    expect(dock.querySelector(":scope > .place-guest-media-controls")).toBeNull();
    expect(within(dock).getByRole("button", { name: "Retirer" }).querySelector(".lucide-trash-2")).toBeNull();
    fireEvent.click(screen.getByRole("toolbar", { name: "Actions des invités sélectionnés" }).querySelector<HTMLButtonElement>('button[aria-label="Scène"]')!);
    await waitFor(() => expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-d" }), "onstage"));
  });

  it("selects one guest by click and several with Ctrl-click", () => {
    renderDesktopGuests();
    const backstage = document.querySelector<HTMLElement>("#place-guests-backstage")!;
    const first = within(backstage).getByRole("button", { name: /Sélectionner Louna Saphir/ });
    const second = within(backstage).getByRole("button", { name: /Sélectionner Solis Miro/ });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(first, { ctrlKey: true });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps bulk selection editable card by card without shifting the portrait rail", () => {
    renderDesktopGuests();
    const backstage = document.querySelector<HTMLElement>("#place-guests-backstage")!;
    fireEvent.click(within(backstage).getByRole("button", { name: "Tout sélectionner" }));
    const backstageCards = within(backstage).getAllByRole("button", { name: /Sélectionné :/ });
    expect(backstageCards.length).toBeGreaterThan(1);
    expect(backstageCards[0].querySelector(".lucide-square-check")).not.toBeNull();
    fireEvent.click(backstageCards[0]);
    expect(backstageCards[0]).toHaveAttribute("aria-pressed", "false");
    expect(backstageCards[0].querySelector(".lucide-square")).not.toBeNull();
    expect(backstageCards[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(backstageCards[0]);
    expect(backstageCards[0]).toHaveAttribute("aria-pressed", "true");
    expect(backstageCards[1]).toHaveAttribute("aria-pressed", "true");
    expect(backstage.querySelector(".place-guests__bulk-bar")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /File d’attente,/ }));
    const queue = document.querySelector<HTMLElement>("#place-guests-queue")!;
    fireEvent.click(within(queue).getByRole("button", { name: "Tout sélectionner" }));
    const queueCards = within(queue).getAllByRole("button", { name: /Sélectionné :/ });
    expect(queueCards.length).toBeGreaterThan(1);
    fireEvent.click(queueCards[0]);
    expect(queueCards[0]).toHaveAttribute("aria-pressed", "false");
    expect(queueCards[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(queueCards[0]);
    expect(queueCards[0]).toHaveAttribute("aria-pressed", "true");
    expect(queueCards[1]).toHaveAttribute("aria-pressed", "true");
    expect(queue.querySelector(".place-guests__bulk-bar")).toBeNull();
    expect(within(screen.getByRole("toolbar", { name: "Actions des invités sélectionnés" })).getByRole("button", { name: "Inviter" })).toBeInTheDocument();
  });

  it("offers the 4, 8 and 16 first guest shortcuts in backstage", () => {
    renderDesktopGuests();
    const backstage = document.querySelector<HTMLElement>("#place-guests-backstage")!;
    const shortcuts = within(backstage).getByRole("group", { name: "Sélection rapide en coulisses" });
    expect(within(shortcuts).getByRole("button", { name: "Les 16 premiers" })).toBeInTheDocument();
    expect(within(shortcuts).getByRole("button", { name: "Les 8 premiers" })).toBeInTheDocument();
    const firstFour = within(shortcuts).getByRole("button", { name: "Les 4 premiers" });
    expect(firstFour).toBeEnabled();
    fireEvent.click(firstFour);
    expect(firstFour).toHaveAttribute("aria-pressed", "true");
    const cards = within(backstage).getAllByRole("button", { name: /Sélectionné :/ });
    expect(cards).toHaveLength(4);
    fireEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
    expect(cards[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the Host drag a stage guest back to the Room's backstage, but rejects another Room", async () => {
    const { room, onMoveGuest } = renderDesktopGuests();
    fireEvent.click(screen.getByRole("tab", { name: /Sur scène,/ }));
    const stage = document.querySelector<HTMLElement>("#place-guests-stage")!;
    const card = within(stage).getByRole("button", { name: /Sélectionner/ });
    const transfer = dragTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    expect(readPlaceGuestDrag(transfer)).toEqual({ roomId: room.id, participantId: "guest-b", origin: "onstage" });
    const panel = document.querySelector<HTMLElement>(".place-guests")!;
    fireEvent.drop(panel, { dataTransfer: transfer });
    await waitFor(() => expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-b" }), "backstage"));
    onMoveGuest.mockClear();
    const otherRoom = dragTransfer();
    writePlaceGuestDrag(otherRoom, { roomId: "another-room", participantId: "guest-b", origin: "onstage" });
    fireEvent.drop(panel, { dataTransfer: otherRoom });
    expect(onMoveGuest).not.toHaveBeenCalled();
  });

  it("keeps a Green House guest off stage until the backstage transition completes", async () => {
    const { onMoveGuest } = renderDesktopGuests({ readyGuest: true });
    const backstage = document.querySelector<HTMLElement>("#place-guests-backstage")!;
    const card = within(backstage).getByRole("button", { name: /Sélectionner Louna Saphir/ });
    expect(card).toHaveAttribute("draggable", "false");
    fireEvent.click(card);
    const dock = screen.getByRole("toolbar", { name: "Actions des invités sélectionnés" });
    expect(within(dock).getByRole("button", { name: "Scène" })).toBeDisabled();
    fireEvent.click(within(dock).getByRole("button", { name: "Coulisses" }));
    await waitFor(() => expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-d" }), "accepted"));
  });

  it("accepts a backstage card on video only for its current Room", async () => {
    const room = createPlaceDemoState();
    const onMoveGuest = vi.fn().mockResolvedValue(undefined);
    const noop = vi.fn();
    render(<RoomPresentationProvider presentation={PLACE_ROOM_PRESENTATION}><PlaceStage
      room={room} isHost isGuest={false} canEngage currentUserId={room.host.id}
      hostCameraEnabled hostMicrophoneEnabled hostMonitoringEnabled={false}
      onToggleHostMicrophone={noop} onToggleHostCamera={noop} onToggleHostMonitoring={noop}
      onVotePoll={noop} onNotice={noop} screenShareStream={null}
      screenSharePublished={false} screenShareRequesting={false}
      onStartScreenShare={noop} onStopScreenShare={noop} onOpenProfile={noop}
      onMoveGuest={onMoveGuest} panelCollapsed={false} onPanelCollapsedChange={noop}
    /></RoomPresentationProvider>);
    const video = screen.getByRole("region", { name: "Scène en direct" });
    const transfer = dragTransfer();
    writePlaceGuestDrag(transfer, { roomId: room.id, participantId: "guest-a", origin: "backstage" });
    fireEvent.drop(video, { dataTransfer: transfer });
    await waitFor(() => expect(onMoveGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-a" }), "onstage"));
    onMoveGuest.mockClear();
    const otherRoom = dragTransfer();
    writePlaceGuestDrag(otherRoom, { roomId: "another-room", participantId: "guest-a", origin: "backstage" });
    fireEvent.drop(video, { dataTransfer: otherRoom });
    expect(onMoveGuest).not.toHaveBeenCalled();
  });
});
