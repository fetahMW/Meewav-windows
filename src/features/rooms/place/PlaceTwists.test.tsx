import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_ROOM_PRESENTATIONS, RoomPresentationProvider, type RoomPresentation } from "../roomPresentation";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixer from "./PlaceMixer";
import PlaceTwists from "./PlaceTwists";
import { placeRoomTime } from "./placeRoomTime";
import { DEFAULT_PLACE_TWIST_VOLUME, PLACE_TWIST_ASSETS, placeTwistAudio } from "./placeTwistAudio";

afterEach(() => {
  cleanup();
  placeRoomTime.setEnabled(false);
  vi.restoreAllMocks();
});

describe("PlaceTwists infrastructure pads", () => {
  it("starts every Pad at the safe 20% default volume", () => {
    const setVolume = vi.spyOn(placeTwistAudio, "setVolume");

    render(<PlaceTwists />);

    expect(DEFAULT_PLACE_TWIST_VOLUME).toBe(0.2);
    expect(screen.getByRole("slider", { name: /Volume des Pads/ })).toHaveValue("0.2");
    expect(screen.getByText("20 %")).toBeVisible();
    expect(screen.getByRole("region", { name: "Pads" })).toBeVisible();
    expect(screen.queryByText("RÉGIE INSTANTANÉE")).not.toBeInTheDocument();
    expect(setVolume).toHaveBeenCalledWith(0.2);
  });

  it("keeps the crowd boo sound in the permanent pad catalog", () => {
    const play = vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
    render(<PlaceTwists />);

    const crowdBoo = screen.getByRole("button", { name: "Jouer Huées du public" });
    expect(crowdBoo).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remplacer Huées du public" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer Huées du public" })).not.toBeInTheDocument();
    expect(PLACE_TWIST_ASSETS.crowd_boo).toBe("/audio/rooms/twists/huees-du-public.mp3");

    fireEvent.click(crowdBoo);
    expect(play).toHaveBeenCalledWith("crowd_boo", expect.any(Function));
  });

  it("keeps the drum roll and countdown in the infrastructure catalog", () => {
    const play = vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
    render(<PlaceTwists />);

    const drumRoll = screen.getByRole("button", { name: "Jouer Roulement de tambour" });
    const countdown = screen.getByRole("button", { name: "Jouer Compte à rebours" });
    expect(drumRoll).toBeVisible();
    expect(countdown).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remplacer Roulement de tambour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer Compte à rebours" })).not.toBeInTheDocument();
    expect(PLACE_TWIST_ASSETS.drum_roll).toBe("/audio/rooms/twists/mixkit-drum-roll-566.wav");
    expect(PLACE_TWIST_ASSETS.countdown).toBe("/audio/rooms/twists/countdown-10-seconds.wav");

    fireEvent.click(drumRoll);
    fireEvent.click(countdown);
    expect(play).toHaveBeenNthCalledWith(1, "drum_roll", expect.any(Function));
    expect(play).toHaveBeenNthCalledWith(2, "countdown", expect.any(Function));
  });

  it("starts the countdown Pad before the chrono and releases it one second before the sound ends", () => {
    let releaseChrono: (() => void) | undefined;
    const play = vi.spyOn(placeTwistAudio, "play").mockImplementation(async (_kind, _onEnded, onOneSecondBeforeEnd) => {
      releaseChrono = onOneSecondBeforeEnd;
    });
    render(<PlaceTwists />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    placeRoomTime.setEnabled(true);
    placeRoomTime.start();

    expect(play).toHaveBeenCalledWith("countdown", expect.any(Function), expect.any(Function), expect.any(Function));
    expect(placeRoomTime.getSnapshot().status).toBe("idle");
    releaseChrono?.();
    expect(placeRoomTime.getSnapshot().status).toBe("running");
  });

  it("uses the compact Applause label on one line", () => {
    render(<PlaceTwists />);

    expect(screen.getByRole("button", { name: "Jouer Applause" })).toBeVisible();
    expect(screen.queryByText("Applaudissements")).not.toBeInTheDocument();
  });

  it("provides fifteen slots with a fifth row of neutral empty Pads", () => {
    render(<PlaceTwists />);

    const emptyPads = [...document.querySelectorAll<HTMLElement>(".place-twists__pad.is-empty")];
    expect(document.querySelectorAll(".place-twists__pad")).toHaveLength(15);
    expect(screen.getAllByRole("button", { name: /Ajouter un Pad à l’emplacement/ })).toHaveLength(9);
    expect(emptyPads).toHaveLength(9);
    expect(emptyPads.every((pad) => pad.style.getPropertyValue("--twist-accent") === "#77727f")).toBe(true);
  });

  it.each(Object.values(LIVE_ROOM_PRESENTATIONS))(
    "exposes the same fifteen common Mixer Pads in $label",
    (presentation: RoomPresentation) => {
      const room = { ...createPlaceDemoState(), id: `common-pads-${presentation.id}` };
      render(
        <RoomPresentationProvider presentation={presentation}>
          <PlaceMixer
            room={room}
            mode="host"
            currentUserId={room.host.id}
            view="twists"
            onView={vi.fn()}
            onGain={vi.fn()}
            onMute={vi.fn()}
            onCamera={vi.fn()}
            onVocal={vi.fn()}
            onTune={vi.fn()}
            pitchProvider="none"
            pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }}
            localAudioStatus="idle"
            localAudioError={null}
            pluginInventory={[]}
            pluginsRefreshing={false}
            nativePluginStatus="idle"
            nativePluginAudioReady={false}
            nativePluginError={null}
            onPitchProvider={vi.fn().mockResolvedValue(true)}
            onRefreshPlugins={vi.fn()}
            onRemoveNativePlugin={vi.fn()}
            onToggleMonitoring={vi.fn()}
          />
        </RoomPresentationProvider>,
      );

      const mixer = screen.getByLabelText(`Régie audio de ${presentation.label}`);
      const pads = within(mixer).getByRole("region", { name: "Pads" });
      expect(pads.querySelectorAll(".place-twists__pad")).toHaveLength(15);
      expect(within(pads).getAllByRole("button", { name: /Ajouter un Pad à l’emplacement/ })).toHaveLength(9);
      expect(within(pads).getByRole("button", { name: "Jouer Applause" })).toBeVisible();
    },
  );
});
