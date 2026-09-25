import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../tools/roomTools.fixtures";
import { WaveTransportProvider, useWaveTransport } from "../wave-transport/WaveTransportProvider";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixer from "./PlaceMixer";
import type { PlaceRoomState } from "./place.types";

vi.mock("../tools/audio/previewWaveform", async (importOriginal) => ({
  ...await importOriginal<typeof import("../tools/audio/previewWaveform")>(),
  decodeAudioWaveform: vi.fn(async () => ({ peaks: [] })),
}));
vi.mock("../../profile/profile.media.service", () => ({
  profileMediaRepository: { listOwnerMedia: vi.fn(async () => []) },
}));

const silentSamples = new Float32Array(800);
class AuditAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  decodeAudioData = vi.fn(async () => ({
    duration: 8,
    length: silentSamples.length,
    sampleRate: 100,
    numberOfChannels: 1,
    getChannelData: () => silentSamples,
  } as unknown as AudioBuffer));
  close = vi.fn(async () => undefined);
}

let transport: NonNullable<ReturnType<typeof useWaveTransport>>;
function CaptureTransport() {
  const current = useWaveTransport()!;
  useEffect(() => { transport = current; }, [current]);
  return null;
}

function StatefulWaveMixer() {
  const [room, setRoom] = useState<PlaceRoomState>(() => createPlaceDemoState());
  const onGain = (channelId: string, gain: number) => setRoom((current) => ({
    ...current,
    channels: current.channels.map((channel) => channel.id === channelId ? { ...channel, gain } : channel),
  }));
  return <WaveTransportProvider toolsVisible={false}>
    <CaptureTransport />
    <PlaceMixer
      room={room} mode="host" currentUserId={room.host.id} view="volumes" onView={vi.fn()}
      onGain={onGain} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()}
      pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }}
      localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false}
      nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null}
      onPitchProvider={vi.fn()} onRefreshPlugins={vi.fn()} onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()}
    />
  </WaveTransportProvider>;
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", AuditAudioContext);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Wave · sélecteur d’écoute et faders Musique/Master", () => {
  it("conserve le mode choisi et applique le produit des deux faders au lecteur", async () => {
    const { container } = render(<StatefulWaveMixer />);
    const candidate = createRoomToolsFixture("wave", "wave-faders-audit").wave!.submissions[0];
    await act(async () => {
      transport.select(candidate);
      await waitFor(() => expect(transport.engine.getSnapshot().candidate?.id).toBe(candidate.id));
    });
    fireEvent.click(screen.getByRole("radio", { name: "MIX" }));
    expect(transport.engine.getSnapshot().mode).toBe("mix");

    const musicRow = screen.getByText("Musique", { selector: ".place-volume-row__identity strong" }).closest<HTMLElement>(".place-volume-row")!;
    const masterRow = screen.getByText("Master", { selector: ".place-volume-row__identity strong" }).closest<HTMLElement>(".place-volume-row")!;
    const music = within(musicRow).getByRole("slider", { name: "Volume de Musique" });
    const master = within(masterRow).getByRole("slider", { name: "Volume de Master" });
    const player = container.querySelector<HTMLAudioElement>(".place-mixer-audio > audio")!;

    fireEvent.change(music, { target: { value: ".5" } });
    fireEvent.change(master, { target: { value: ".4" } });

    await waitFor(() => expect(player.volume).toBeCloseTo(.2));
    expect(music).toHaveValue("0.5");
    expect(master).toHaveValue("0.4");
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "mix", quickPreview: false, candidate: { id: candidate.id } });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
