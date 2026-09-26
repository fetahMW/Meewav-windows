import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import PlaceMixer from "./PlaceMixer";
import { createPlaceDemoState } from "./place.fixtures";
import { WaveViewerListeningProvider } from "../wave-viewer/WaveViewerListening";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it("keeps Cage listener audio and live-return controls local without voice or host routing", () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const mutateRoom = vi.fn();
  const props: ComponentProps<typeof PlaceMixer> = {
    room: createPlaceDemoState(), mode: "viewer", listenerOnly: true, view: "voice_fx", onView: vi.fn(),
    onGain: mutateRoom, onMute: mutateRoom, onCamera: mutateRoom, onVocal: mutateRoom, onTune: mutateRoom,
    pitchProvider: "none", pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
    localAudioStatus: "idle", localAudioError: null, pluginInventory: [], pluginsRefreshing: false,
    nativePluginStatus: "idle", nativePluginAudioReady: false, nativePluginError: null,
    onPitchProvider: vi.fn(), onRefreshPlugins: vi.fn(), onRemoveNativePlugin: vi.fn(), onToggleMonitoring: mutateRoom,
  };
  const { container } = render(<WaveViewerListeningProvider><PlaceMixer {...props} /></WaveViewerListeningProvider>);
  expect(screen.getByRole("button", { name: "FX voix" })).toBeDisabled();
  expect(screen.queryByRole("slider", { name: "Volume de Ma voix" })).not.toBeInTheDocument();
  expect(screen.queryByText("ENVOI VERS LE HOST")).not.toBeInTheDocument();
  const audio = container.querySelector("audio")!;
  const gain = screen.getByRole("slider", { name: "Volume de Audio" });
  fireEvent.change(gain, { target: { value: "0.3" } });
  expect(audio.volume).toBeCloseTo(.3);
  fireEvent.click(within(gain.closest("article")!).getByRole("button", { name: "Couper le son" }));
  expect(audio.volume).toBe(0);
  fireEvent.change(screen.getByRole("slider", { name: "Volume de Direct" }), { target: { value: ".4" } });
  expect(mutateRoom).not.toHaveBeenCalled();
});
