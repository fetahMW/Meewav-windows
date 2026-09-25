import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_ROOM_PRESENTATIONS, RoomPresentationProvider, SCENE_ROOM_PRESENTATION } from "../roomPresentation";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import PlaceStudioPanel from "./PlaceStudioPanel";

afterEach(cleanup);

function props(overrides: Partial<ComponentProps<typeof PlaceStudioPanel>> = {}): ComponentProps<typeof PlaceStudioPanel> {
  const noop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);
  return {
    room: createPlaceDemoState(), isHost: false, isGuest: false, canEngage: true, collapsed: false, onCollapsedChange: noop,
    surface: "tools", onSurface: noop, mixerView: "volumes", onMixerView: noop, onGain: noop, onMute: noop,
    onCamera: noop, onVocal: noop, onTune: noop, pitchProvider: "none",
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null }, localAudioStatus: "idle", localAudioError: null,
    pluginInventory: [], pluginsRefreshing: false, nativePluginStatus: "idle", nativePluginAudioReady: false, nativePluginError: null,
    onPitchProvider: vi.fn().mockResolvedValue(true), onRefreshPlugins: asyncNoop, onRemoveNativePlugin: asyncNoop,
    onToggleMonitoring: noop, onTogglePlayback: noop, onSendMessage: asyncNoop, onJoinQueue: asyncNoop, onLeaveQueue: asyncNoop,
    onAcceptInvitation: asyncNoop, onDeclineInvitation: asyncNoop, onMarkReady: asyncNoop, onLaunchPoll: asyncNoop, onStopPoll: asyncNoop,
    onPinHighlight: asyncNoop, onPinMessage: asyncNoop, onDeleteMessage: asyncNoop, onClearHighlight: asyncNoop,
    onMoveGuest: asyncNoop, onRemoveGuest: asyncNoop, onSetQueueOpen: asyncNoop, onOpenProfile: noop,
    onMessageProfile: noop, onCollaborateProfile: noop, ...overrides,
  };
}

describe("PlaceStudioPanel specialized tools routing", () => {
  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))("keeps the shared player and room icon in $id", async (presentation) => {
    const panelProps = props({ isHost: true });
    const { container } = render(<MemoryRouter><RoomPresentationProvider presentation={presentation}><PlaceStudioPanel {...panelProps} /></RoomPresentationProvider></MemoryRouter>);
    const entryLabel = presentation.label.replace(/^La /, "");
    const toolsEntry = within(screen.getByRole("tablist", { name: "Surfaces du Studio" })).getByRole("tab", { name: entryLabel });
    expect(toolsEntry).toHaveAttribute("aria-selected", "true");
    expect(toolsEntry).toHaveAttribute("title", `Afficher ${entryLabel.toLowerCase()}`);
    const icon = { place: "users-round", loge: "door-open", wave: "audio-lines", cage: "radio", classe: "graduation-cap", scene: "mic-vocal" }[presentation.id];
    expect(toolsEntry.querySelector(`.lucide-${icon}`)).toBeInTheDocument();
    expect(toolsEntry.querySelector(".lucide-wrench")).not.toBeInTheDocument();
    fireEvent.click(toolsEntry);
    expect(panelProps.onSurface).toHaveBeenCalledWith("tools");
    expect(panelProps.onCollapsedChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Lecteur audio du Mixeur")).toBeInTheDocument();
    if (presentation.id === "place") {
      const rail = await screen.findByRole("tablist", { name: "Outils de La Place" });
      expect(within(rail).getAllByRole("tab")).toHaveLength(3);
      expect(within(rail).getByRole("tab", { name: "Tour de parole" })).toBeVisible();
      expect(within(rail).getByRole("tab", { name: "Clash" })).toBeVisible();
      expect(within(rail).getByRole("tab", { name: "Défis" })).toBeVisible();
    } else {
      const rail = await screen.findByRole("tablist", { name: `Outils de ${presentation.label}` });
      expect(container.querySelector(".wave-tools-nav")).toContainElement(rail);
      expect(within(rail).getAllByRole("tab")).toHaveLength({ scene: 4, classe: 2, cage: 3, loge: 2, wave: 3 }[presentation.id]);
      expect(within(rail).queryByRole("tab", { name: /Partage|Sondage|Cadeau|Récompense/ })).not.toBeInTheDocument();
    }
    expect(container.querySelector(".wave-tools-body")).not.toBeEmptyDOMElement();
  }, 10_000);

  it("gives a Viewer contextual interactions without exposing Host production tools", async () => {
    render(<RoomPresentationProvider presentation={SCENE_ROOM_PRESENTATION}><PlaceStudioPanel {...props()} /></RoomPresentationProvider>);
    expect(await screen.findByRole("tab", { name: "Scène" })).toBeInTheDocument();
    expect(await screen.findByText("Performance en cours")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Prompteur/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("room-tools-shell")).not.toBeInTheDocument();
  });

  it("adds the same contextual interaction entry point to La Place", () => {
    render(<PlaceStudioPanel {...props()} />);
    expect(screen.getByRole("tab", { name: "Place" })).toBeInTheDocument();
    expect(screen.queryByTestId("room-tools-shell")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Prompteur/i })).not.toBeInTheDocument();
  });
});

it("respects the Place host queue gate in every conversation tab", async () => {
 const room=createPlaceDemoState(PLACE_DEMO_PROFILES.viewerA.id);
 room.queue=[];room.participants=room.participants.filter(p=>p.profile.id!==room.currentUserProfile?.id);room.queueOpen=false;
 const join=vi.fn().mockResolvedValue(undefined);
 const view=render(<MemoryRouter><PlaceStudioPanel {...props({room,onJoinQueue:join})}/></MemoryRouter>);
 for(const name of ["Tour de parole","File de parole","Clash","Défis"]){
  fireEvent.click(await screen.findByRole("tab",{name,exact:true}));
  expect(screen.getByRole("button",{name:"Rejoindre la file d’attente"})).toBeDisabled();
 }
 expect(join).not.toHaveBeenCalled();
 view.rerender(<MemoryRouter><PlaceStudioPanel {...props({room:{...room,queueOpen:true},onJoinQueue:join})}/></MemoryRouter>);
 fireEvent.click(screen.getByRole("button",{name:"Rejoindre la file d’attente"}));
 await waitFor(()=>expect(join).toHaveBeenCalledOnce());
});
