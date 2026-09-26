import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "../../place/place.fixtures";
import PlaceMixerAudioPlayer from "../../place/PlaceMixerAudioPlayer";
import CageProductionCard from "../audience/CageProductionCard";
import CageProductionProvider from "./CageProductionProvider";
import { confirmCageProductionReady, getCageProduction, loadCageProduction } from "./cageProduction.service";
import { decodeAudioWaveform } from "./previewWaveform";

vi.mock("./cageProduction.service", async importOriginal => ({ ...await importOriginal<typeof import("./cageProduction.service")>(),
  getCageProduction: vi.fn(), loadCageProduction: vi.fn(), confirmCageProductionReady: vi.fn() }));
vi.mock("./previewWaveform", async importOriginal => ({ ...await importOriginal<typeof import("./previewWaveform")>(), decodeAudioWaveform: vi.fn() }));
const production = { reference: "host/room/audio.wav", title: "Prod commune", bpm: 96, revision: 1 };
const analysis = { durationSeconds: 24, sampleRate: 48000, channels: 1, peaks: Array.from({ length: 100 }, () => ({ min: -.4, max: .5 })) };
const noop = vi.fn(async () => true);
const createUrl = vi.fn();
const revokeUrl = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCageProduction).mockResolvedValue(production);
  vi.mocked(loadCageProduction).mockResolvedValue(new Blob(["audio"], { type: "audio/wav" }));
  vi.mocked(confirmCageProductionReady).mockResolvedValue(undefined);
  vi.mocked(decodeAudioWaveform).mockResolvedValue(analysis);
  Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value: vi.fn(async () => new ArrayBuffer(8)) });
  createUrl.mockImplementation(() => `blob:prod-${createUrl.mock.calls.length}`);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("play")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("pause")); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Mixer() {
  return <div data-testid="mixer"><PlaceMixerAudioPlayer roomId="room" ownerId={null} queueParticipants={[]} musicGain={.75} masterGain={1} publicMusicMuted={false}
    onPreviewPrepare={noop} onPreviewMetadata={noop} onRouteChange={noop} onPlaybackStateChange={noop} /></div>;
}

describe("Cage production in audience and artist mixer", () => {
  it("plays, repeats and downloads real decoded media, and stops when leaving the panel", async () => {
    const room = createPlaceDemoState();
    const view = render(<CageProductionProvider room={room}><CageProductionCard /></CageProductionProvider>);
    const play = await screen.findByRole("button", { name: "Écouter la prod du battle" });
    await waitFor(() => expect(play).toBeEnabled());
    expect(screen.getByText("96 BPM")).toBeVisible();
    expect(screen.getByRole("link", { name: "Télécharger la prod du battle" })).toHaveAttribute("download", "Prod commune.wav");
    fireEvent.click(play);
    await screen.findByRole("button", { name: "Mettre la prod en pause" });
    fireEvent.click(screen.getByRole("button", { name: "Lecture en boucle de la prod" }));
    expect(view.container.querySelector("audio")?.loop).toBe(true);
    expect(view.container.querySelectorAll("svg line")).toHaveLength(100);
    view.rerender(<CageProductionProvider room={room}><CageProductionCard active={false} /></CageProductionProvider>);
    expect(screen.getByRole("button", { name: "Écouter la prod du battle" })).toBeDisabled();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(confirmCageProductionReady).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:prod-1");
  });
  it("prepares the shared production in the invited artist's real deck before confirming readiness", async () => {
    const room = createPlaceDemoState();
    const artist = room.participants.find(person => person.profile.id !== room.host.id)!;
    artist.status = "backstage";
    room.currentUserProfile = artist.profile;
    render(<CageProductionProvider room={room}><CageProductionCard onOpenMixer={vi.fn()} /><Mixer /></CageProductionProvider>);
    await waitFor(() => expect(within(screen.getByTestId("mixer")).getAllByText("Prod commune").length).toBeGreaterThan(0));
    await waitFor(() => expect(confirmCageProductionReady).toHaveBeenCalledWith(expect.objectContaining({ id: room.id }), production.reference));
    expect(screen.getByRole("button", { name: "Ouvrir mon mixeur" })).toBeEnabled();
    expect(noop).toHaveBeenCalledWith(expect.objectContaining({ title: "Prod commune", artist: "Prod du battle", ready: true }));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("locks the card preview on stage while preserving download", async () => {
    const room = createPlaceDemoState();
    const artist = room.participants.find(person => person.profile.id !== room.host.id)!;
    artist.status = "onstage"; room.currentUserProfile = artist.profile;
    render(<CageProductionProvider room={room}><CageProductionCard /></CageProductionProvider>);
    await screen.findByRole("link", { name: "Télécharger la prod du battle" });
    expect(screen.getByRole("button", { name: "Écouter la prod du battle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lecture en boucle de la prod" })).toBeDisabled();
  });
  it("preserves the artist's current file on stage and adopts a replacement once backstage", async () => {
    const room = createPlaceDemoState();
    const artist = room.participants.find(person => person.profile.id !== room.host.id)!;
    artist.status = "backstage"; room.currentUserProfile = artist.profile;
    const content = () => <CageProductionProvider room={{ ...room }}><CageProductionCard /><Mixer /></CageProductionProvider>;
    const view = render(content());
    await waitFor(() => expect(confirmCageProductionReady).toHaveBeenCalled());
    const next = { ...production, reference: "host/room/next.wav", title: "Passage suivant", revision: 2 };
    vi.mocked(getCageProduction).mockResolvedValue(next);
    artist.status = "onstage";
    view.rerender(content());
    await waitFor(() => expect(getCageProduction).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Passage suivant")).not.toBeInTheDocument();
    expect(revokeUrl).not.toHaveBeenCalled();
    artist.status = "backstage";
    view.rerender(content());
    await waitFor(() => expect(within(screen.getByTestId("mixer")).getAllByText("Passage suivant").length).toBeGreaterThan(0));
    expect(revokeUrl).toHaveBeenCalledWith("blob:prod-1");
    await waitFor(() => expect(confirmCageProductionReady).toHaveBeenLastCalledWith(expect.anything(), next.reference));
  });
  it("retries a media failure and never advertises a ready artist before loading", async () => {
    vi.mocked(loadCageProduction).mockRejectedValueOnce(new Error("Chargement impossible"));
    render(<CageProductionProvider room={createPlaceDemoState()}><CageProductionCard /></CageProductionProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chargement impossible");
    expect(screen.queryByRole("link", { name: "Télécharger la prod du battle" })).not.toBeInTheDocument();
    expect(confirmCageProductionReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("link", { name: "Télécharger la prod du battle" });
  });
  it("discards a late decode after the room unmounts", async () => {
    let finish!: (value: typeof analysis) => void;
    vi.mocked(decodeAudioWaveform).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<CageProductionProvider room={createPlaceDemoState()}><CageProductionCard /></CageProductionProvider>);
    await waitFor(() => expect(decodeAudioWaveform).toHaveBeenCalled());
    view.unmount();
    await act(async () => finish(analysis));
    expect(createUrl).not.toHaveBeenCalled();
    expect(confirmCageProductionReady).not.toHaveBeenCalled();
  });
});
