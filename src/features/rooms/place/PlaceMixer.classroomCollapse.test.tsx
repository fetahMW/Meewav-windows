import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSE_ROOM_PRESENTATION, RoomPresentationProvider } from "../roomPresentation";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixer from "./PlaceMixer";

function Mixer({ classroom }: { classroom: boolean }) {
  const room = createPlaceDemoState();
  const mixer = (
    <PlaceMixer
      room={room}
      mode="host"
      currentUserId={room.host.id}
      view="volumes"
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
      onPitchProvider={vi.fn()}
      onRefreshPlugins={vi.fn()}
      onRemoveNativePlugin={vi.fn()}
      onToggleMonitoring={vi.fn()}
    />
  );

  return classroom ? (
    <RoomPresentationProvider presentation={CLASSE_ROOM_PRESENTATION}>
      {mixer}
    </RoomPresentationProvider>
  ) : mixer;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlaceMixer — lecteur repliable de La Classe", () => {
  it("replie uniquement la façade et conserve le lecteur audio monté et actif", () => {
    const { container } = render(<Mixer classroom />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    const audio = container.querySelector("audio")!;
    audio.currentTime = 12;

    const collapse = within(player).getByRole("button", { name: "Replier le lecteur audio · La Classe" });
    const controlledId = collapse.getAttribute("aria-controls")!;
    const controlledSurface = document.getElementById(controlledId)!;
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(controlledSurface).not.toHaveAttribute("aria-hidden");
    expect(controlledSurface).not.toHaveAttribute("inert");

    fireEvent.click(within(player).getByRole("button", { name: "Importer un son" }));
    expect(within(player).getByRole("menu", { name: "Choisir la source" })).toBeVisible();
    fireEvent.click(collapse);

    const expand = within(player).getByRole("button", { name: "Déplier le lecteur audio · La Classe" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveAttribute("aria-controls", controlledId);
    expect(player).toHaveClass("is-classroom-collapsed");
    expect(container.querySelector(".place-mixer")).toHaveClass("is-classroom-player-collapsed");
    expect(controlledSurface).toHaveAttribute("aria-hidden", "true");
    expect(controlledSurface).toHaveAttribute("inert");
    expect(within(player).queryByRole("menu", { name: "Choisir la source" })).not.toBeInTheDocument();
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio.currentTime).toBe(12);

    window.dispatchEvent(new CustomEvent("meewav:mixer-playlist-open"));
    expect(screen.queryByRole("dialog", { name: "Playlist du Mixeur" })).not.toBeInTheDocument();

    fireEvent.click(expand);
    const collapseAgain = within(player).getByRole("button", { name: "Replier le lecteur audio · La Classe" });
    expect(collapseAgain).toHaveAttribute("aria-expanded", "true");
    expect(player).not.toHaveClass("is-classroom-collapsed");
    expect(container.querySelector(".place-mixer")).not.toHaveClass("is-classroom-player-collapsed");
    expect(within(player).queryByRole("menu", { name: "Choisir la source" })).not.toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: "Options de lecture" }));
    expect(screen.getByRole("menu", { name: "Mode de lecture" })).toBeVisible();
    fireEvent.click(collapseAgain);
    expect(screen.queryByRole("menu", { name: "Mode de lecture" })).not.toBeInTheDocument();
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio.currentTime).toBe(12);
  });

  it("laisse le lecteur de La Place strictement inchangé", () => {
    render(<Mixer classroom={false} />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    expect(within(player).queryByRole("button", { name: /lecteur audio · La Classe/i })).not.toBeInTheDocument();
    expect(player).not.toHaveClass("is-classroom-collapsible");
  });
});
