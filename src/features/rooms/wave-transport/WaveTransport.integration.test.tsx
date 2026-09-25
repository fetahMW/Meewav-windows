import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState, type ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceMixer from "../place/PlaceMixer";
import { StudioToolsLayoutProvider } from "../place/StudioToolsLayoutProvider";
import { createPlaceDemoState } from "../place/place.fixtures";
import RoomToolsShell from "../tools/RoomToolsShell";
import WaveSimulationPicker from "../tools/WaveSimulationPicker";
import WaveRoomTransportController from "../tools/WaveRoomTransportController";
import { WaveTransportProvider, useWaveTransport, useWaveTransportState } from "./WaveTransportProvider";
import { WaveAudioTransport } from "./WaveAudioTransport";

vi.mock("../tools/audio/previewWaveform", () => ({ decodeAudioWaveform: vi.fn(async () => []) }));
vi.mock("../../profile/profile.media.service", () => ({ profileMediaRepository: { listOwnerMedia: vi.fn(async () => []) } }));
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(WaveAudioTransport.prototype, "setReference").mockResolvedValue();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Fixture sans réseau")));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Driver() {
  const transport = useWaveTransport()!; const state = useWaveTransportState()!;
  useEffect(() => { transport.engine.setGrid({ bpm: 124, beatsPerBar: 4, origin: 0 }); }, [transport.engine]);
  return <><output data-testid="candidate">{state.candidate?.id ?? "none"}</output>
    <button onClick={() => transport.engine.setRegion(0, 8)}>Zone test huit mesures</button>
    <output data-testid="region">{JSON.stringify(state.region)}</output></>;
}
function Harness() {
  const [visible, setVisible] = useState(false);
  const [room] = useState(() => ({ ...createPlaceDemoState(), id: `wave-test-${crypto.randomUUID()}` }));
  const noop = vi.fn(); const ok = vi.fn(async () => true);
  const mixer: ComponentProps<typeof PlaceMixer> = {
    room, mode: "host", currentUserId: room.host.id, view: "volumes", onView: noop, onGain: noop, onMute: noop,
    onCamera: noop, onVocal: noop, onTune: noop, pitchProvider: "none",
    pitchCorrection: { available: false, active: false, adapterId: null, reason: null }, localAudioStatus: "idle", localAudioError: null,
    pluginInventory: [], pluginsRefreshing: false, nativePluginStatus: "idle", nativePluginAudioReady: false, nativePluginError: null,
    onPitchProvider: ok, onRefreshPlugins: noop, onRemoveNativePlugin: noop, onToggleMonitoring: noop,
    onAudioPreview: ok, onAudioPreviewMetadata: ok, onAudioRoute: ok, onAudioPlaybackState: ok,
  };
  return <MemoryRouter><StudioToolsLayoutProvider toolsVisible={visible}><WaveTransportProvider toolsVisible={visible}>
    <button onClick={() => setVisible(!visible)}>Changer de surface</button><Driver />
    <WaveSimulationPicker roomId={room.id} />
    <WaveRoomTransportController room={room} />
    <PlaceMixer {...mixer} />
    <div hidden><RoomToolsShell roomType="wave" room={room} isHost isGuest={false} onOpenMixer={noop} /></div>
  </WaveTransportProvider></StudioToolsLayoutProvider></MemoryRouter>;
}
describe("Wave · une seule instance persistante", () => {
  it("change de production depuis Simulation et remplace la référence du lecteur", async () => {
    render(<Harness />);
    await waitFor(() => expect(WaveAudioTransport.prototype.setReference).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("Afro_Melody_A") })));
    fireEvent.click(screen.getByRole("button", { name: "Simulation" }));
    fireEvent.click(await screen.findByRole("button", { name: "House 124 BPM · Am" }));
    await waitFor(() => expect(WaveAudioTransport.prototype.setReference).toHaveBeenCalledWith(expect.objectContaining({ bpm: 124, url: expect.stringContaining("House_Melody_A") })));
    fireEvent.click(screen.getByRole("button", { name: "Changer de surface" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Sas des boucles" }));
    expect(await screen.findByRole("article", { name: "Sélectionner House · Basse A de Eliott Waves" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Sélectionner Afro · Basse A de Eliott Waves" })).not.toBeInTheDocument();
  });
  it("garde le lecteur, la sélection et A/B entre Mixeur, Boucle, Vote et Beat", async () => {
    const { container } = render(<Harness />);
    const player = container.querySelector(".place-mixer-audio");
    const media = player?.querySelector("audio");
    fireEvent.click(screen.getByRole("button", { name: "Changer de surface" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Sas des boucles" }));
    const row = await screen.findByRole("article", { name: "Sélectionner Afro · Mélodie B de Koda Sweep" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("candidate")).toHaveTextContent("test-Afro-Melody_B"));
    fireEvent.click(screen.getByRole("button", { name: "Zone test huit mesures" }));
    const region = screen.getByTestId("region").textContent;
    expect(within(row).getByRole("button", { name: "Écouter Koda Sweep" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Valider Afro · Mélodie B" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Refuser Afro · Mélodie B" })).toBeInTheDocument();
    expect(within(row).getAllByRole("button")).toHaveLength(3);
    expect(container.querySelectorAll(".wave-tools-body audio")).toHaveLength(0);
    for (const label of ["Vote du public", "Beat collectif", "Sas des boucles"]) {
      fireEvent.click(screen.getByRole("tab", { name: label }));
      expect(container.querySelectorAll(".place-mixer-audio")).toHaveLength(1);
      expect(container.querySelector(".place-mixer-audio")).toBe(player);
      expect(player?.querySelector("audio")).toBe(media);
      expect(screen.getByTestId("region").textContent).toBe(region);
    }
    fireEvent.click(screen.getByRole("button", { name: "Changer de surface" }));
    expect(screen.getByTestId("candidate")).toHaveTextContent("test-Afro-Melody_B");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("ne valide qu’au vote, avance et conserve le Beat de référence", async () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Changer de surface" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Sas des boucles" }));
    await screen.findByRole("article", { name: "Sélectionner Afro · Basse A de Eliott Waves" });
    const player = container.querySelector(".place-mixer-audio");
    const dock = screen.getByRole("complementary", { name: "Actions pour Eliott Waves" });
    expect(within(dock).getAllByRole("button")).toHaveLength(4);
    await act(async () => fireEvent.click(within(dock).getByRole("button", { name: "Valider Afro · Basse A" })));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Sélectionner Afro · Basse A de Eliott Waves" })).not.toBeInTheDocument());
    expect(screen.getByTestId("candidate").textContent).not.toBe("test-Afro-Bass_A");
    expect(container.querySelector(".place-mixer-audio")).toBe(player);
    fireEvent.click(screen.getByRole("tab", { name: "Vote du public" }));
    const voteQueue = await screen.findByRole("region", { name: "Boucles validées pour le vote" });
    await waitFor(() => expect(within(voteQueue).getByRole("article", { name: "Sélectionner Eliott Waves" })).toBeInTheDocument());
  });
});
