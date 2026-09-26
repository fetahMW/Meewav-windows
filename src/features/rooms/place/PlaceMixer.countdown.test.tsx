import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceMixer from "./PlaceMixer";
import { createPlaceDemoState } from "./place.fixtures";
import type { PlaceMixerView } from "./place.types";
import { placeRoomTime } from "./placeRoomTime";
import { placeTwistAudio } from "./placeTwistAudio";

vi.mock("../tools/audio/previewWaveform", () => ({ decodeAudioWaveform: vi.fn(async () => []) }));
vi.mock("../../profile/profile.media.service", () => ({ profileMediaRepository: { listOwnerMedia: vi.fn(async () => []) } }));

function MixerHarness({ mode = "host" }: { mode?: "host" | "viewer" }) {
  const [room] = useState(createPlaceDemoState);
  const [view, setView] = useState<PlaceMixerView>("twists");
  return <PlaceMixer
    room={room} mode={mode} currentUserId={mode === "host" ? room.host.id : "viewer-test"} view={view} onView={setView}
    onGain={vi.fn()} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()}
    pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }}
    localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false}
    nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null}
    onPitchProvider={vi.fn().mockResolvedValue(true)} onRefreshPlugins={vi.fn()}
    onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()}
  />;
}

function importTrack(name = "Production.wav") {
  fireEvent.change(document.querySelector(".place-mixer-audio__file")!, {
    target: { files: [new File(["audio"], name, { type: "audio/wav" })] },
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(placeTwistAudio, "preloadHorn").mockImplementation(() => {});
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:production") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  placeRoomTime.setEnabled(false);
  vi.restoreAllMocks();
});

describe("Mixer countdown transport", () => {
  it("opens the complete shared mixer submenus for a viewer", () => {
    render(<MixerHarness mode="viewer" />);
    for (const name of ["Volumes", "FX voix", "Pads"]) {
      const button = screen.getByRole("button", { name: new RegExp(`^${name}$`) });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(button).toHaveClass("is-active");
    }
    expect(document.querySelector(".place-mixer-audio")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Time$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Volumes$/ }));
    expect(document.querySelectorAll(".place-volume-row")).toHaveLength(3);
    for (const label of ["Ma voix", "Musique", "Master"]) expect(screen.getByText(label)).toBeInTheDocument();
  });
  it("retains both Pad links across Time, Volumes and FX, with listeners still active", async () => {
    const pad = vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
    render(<MixerHarness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fin du chrono" }));
    for (const view of ["Time", "Volumes", "FX voix"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.queryByRole("region", { name: "Pads" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Pads" }));
      expect(screen.getByRole("checkbox", { name: "Début du chrono" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Fin du chrono" })).toBeChecked();
    }
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Afficher" }));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    expect(pad).toHaveBeenCalledWith("countdown", expect.any(Function), expect.any(Function), expect.any(Function));
    act(() => window.dispatchEvent(new CustomEvent("meewav:mixer-chrono-ended")));
    expect(pad).toHaveBeenCalledWith("dj_horn", expect.any(Function));
  });

  it.each([false, true])("holds the actual player until the one-second cue (Time enabled: %s)", async (enabled) => {
    let release: (() => void) | undefined;
    const pad = vi.spyOn(placeTwistAudio, "play").mockImplementation(async (_kind, _ended, nearEnd) => { release = nearEnd; });
    render(<MixerHarness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    importTrack();
    act(() => placeRoomTime.setEnabled(enabled));
    fireEvent.click(screen.getByRole("button", { name: "Volumes" }));
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(pad).toHaveBeenCalledTimes(1));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(placeRoomTime.getSnapshot().status).toBe("idle");
    // Navigating while the introduction is playing must not stop or reset it.
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    await act(async () => { release?.(); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(placeRoomTime.getSnapshot().status).toBe(enabled ? "running" : "idle");
    expect(pad).toHaveBeenCalledTimes(1); // no second intro from Time.start()
    await act(async () => { release?.(); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("plays immediately when the link is off", async () => {
    const pad = vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
    render(<MixerHarness />);
    importTrack();
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    expect(pad).not.toHaveBeenCalled();
  });

  it.each(["cancel", "track", "unmount", "disable"])("does not launch from an old cue after %s", async (action) => {
    let release: (() => void) | undefined;
    const pad = vi.spyOn(placeTwistAudio, "play").mockImplementation(async (_kind, _ended, nearEnd) => { release = nearEnd; });
    const view = render(<MixerHarness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    importTrack();
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(pad).toHaveBeenCalledTimes(1));
    if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "Annuler le compte à rebours" }));
    if (action === "track") importTrack("Autre production.wav");
    if (action === "unmount") view.unmount();
    if (action === "disable") fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    await act(async () => { release?.(); });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("fails closed if the countdown sound cannot play", async () => {
    vi.spyOn(placeTwistAudio, "play").mockRejectedValue(new Error("audio unavailable"));
    render(<MixerHarness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    importTrack();
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("n’a pas pu lire"));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Préécouter localement" })).toBeEnabled();
  });

  it("resumes a paused production without replaying the countdown", async () => {
    let release: (() => void) | undefined;
    const pad = vi.spyOn(placeTwistAudio, "play").mockImplementation(async (_kind, _ended, nearEnd) => { release = nearEnd; });
    render(<MixerHarness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Début du chrono" }));
    importTrack();
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(pad).toHaveBeenCalledTimes(1));
    await act(async () => { release?.(); });
    const audio = document.querySelector<HTMLAudioElement>(".place-mixer-audio audio")!;
    audio.currentTime = 12;
    fireEvent.click(screen.getByRole("button", { name: "Mettre en pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    expect(pad).toHaveBeenCalledTimes(1);
  });
});
