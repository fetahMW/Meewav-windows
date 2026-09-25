import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { RoomToolsCommand } from "../roomTools.types";
import WaveOrchestraPanel from "./WaveOrchestraPanel";

function waveFixture() {
  const wave = createRoomToolsFixture("wave").wave;
  if (!wave) throw new Error("fixture_wave_missing");
  return structuredClone(wave);
}

function renderPanel(execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined)) {
  const view = render(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={execute} />);
  return { execute, ...view };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WaveOrchestraPanel — Beat collectif", () => {
  it("uses simple Vote-style tracks and replaces the upper master with one bottom controller", () => {
    const { container } = renderPanel();

    expect(screen.getByText("Pistes validées")).toBeInTheDocument();
    expect(screen.getByText("6 / 12 pistes")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Master du Beat collectif" })).not.toBeInTheDocument();
    const controller = screen.getByRole("complementary", { name: "Lecteur du Beat collectif" });
    expect(within(controller).getByRole("button", { name: "Lire toutes les pistes actives" })).toBeInTheDocument();
    expect(within(controller).getByRole("slider", { name: "Volume musique du Beat collectif" })).toHaveValue("72");
    expect(within(controller).getByRole("slider", { name: "Progression du Beat collectif" })).toHaveValue("0");
    expect(container.querySelector(".wave-collective__waveform")).not.toBeInTheDocument();
    expect(container.querySelector(".wave-collective__waveform-empty")).not.toBeInTheDocument();

    const baseTrack = screen.getByRole("article", { name: "BeatKing" });
    const guitarTrack = screen.getByRole("article", { name: "Koda Sweep" });
    expect(within(guitarTrack).getByText("Koda Sweep")).toBeInTheDocument();
    expect(within(guitarTrack).getByText("GUITARE")).toBeInTheDocument();
    expect(within(baseTrack).getByRole("button", { name: "Muet Metro Base 08" })).toBeInTheDocument();
    expect(within(baseTrack).getByRole("button", { name: "Solo Metro Base 08" })).toBeInTheDocument();
    expect(within(baseTrack).getByRole("button", { name: "Duel de remplacement pour Metro Base 08" })).toBeDisabled();
    expect(within(baseTrack).getByRole("slider", { name: "Volume Metro Base 08" })).toBeInTheDocument();
    expect(within(baseTrack).getAllByRole("button")).toHaveLength(3);
  });

  it("exposes global play/pause semantics and per-layer commands", () => {
    const { execute, rerender } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Lire toutes les pistes actives" }));
    expect(execute).toHaveBeenCalledWith({ type: "wave.sequence.transport", playing: true });

    const playingWave = waveFixture();
    playingWave.playing = true;
    rerender(<WaveOrchestraPanel wave={playingWave} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={execute} />);
    expect(screen.getByRole("button", { name: "Mettre toutes les pistes en pause" })).toBeInTheDocument();

    const guitarTrack = screen.getByRole("article", { name: "Koda Sweep" });
    fireEvent.click(within(guitarTrack).getByRole("button", { name: "Solo Blue Guitar" }));
    expect(execute).toHaveBeenCalledWith({ type: "wave.sequence.layer", layerId: "layer-5", patch: { solo: true } });
    fireEvent.click(within(guitarTrack).getByRole("button", { name: "Muet Blue Guitar" }));
    expect(execute).toHaveBeenCalledWith({ type: "wave.sequence.layer", layerId: "layer-5", patch: { muted: true } });
  });

  it("keeps one volume per track plus progress and master volume in the bottom player", () => {
    renderPanel();
    expect(screen.getAllByRole("slider")).toHaveLength(waveFixture().layers.length + 2);
    const guitar = screen.getByRole("slider", { name: "Volume Blue Guitar" });
    fireEvent.change(guitar, { target: { value: "67" } });
    expect(guitar).toHaveValue("67");
  });

  it("starts every audible demo layer immediately from the global Play gesture", () => {
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    render(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Lire toutes les pistes actives" }));

    expect(screen.getByRole("button", { name: "Mettre toutes les pistes en pause" })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(waveFixture().layers.length);
  });

  it("does not stop collective audio when the playing panel rerenders", () => {
    const wave = waveFixture();
    wave.playing = true;
    const { rerender } = render(<StrictMode><WaveOrchestraPanel wave={wave} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} /></StrictMode>);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();

    rerender(<StrictMode><WaveOrchestraPanel wave={structuredClone(wave)} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} /></StrictMode>);
    expect(pause).not.toHaveBeenCalled();
  });

  it("identifies the base loop with the actual Room host", () => {
    render(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} host={{ id: "naya", displayName: "Naya Oris", avatarUrl: "/naya.webp" }} />);
    const baseTrack = screen.getByRole("article", { name: "Naya Oris" });
    expect(within(baseTrack).getByText("BASE")).toBeInTheDocument();
  });

  it("shares its music volume with the Room mixer music channel", () => {
    const onMixerMusicGain = vi.fn();
    const { rerender } = render(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} mixerMusicGain={0.61} onMixerMusicGain={onMixerMusicGain} />);
    const music = screen.getByRole("slider", { name: "Volume musique du Beat collectif" });
    expect(music).toHaveValue("61");

    fireEvent.change(music, { target: { value: "84" } });
    expect(onMixerMusicGain).toHaveBeenCalledWith(0.84);

    rerender(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} mixerMusicGain={0.35} onMixerMusicGain={onMixerMusicGain} />);
    expect(screen.getByRole("slider", { name: "Volume musique du Beat collectif" })).toHaveValue("35");
  });

  it("provides a global music mute even when some tracks are outside the viewport", () => {
    const onMixerMusicGain = vi.fn();
    render(<WaveOrchestraPanel wave={waveFixture()} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={vi.fn()} mixerMusicGain={0.72} onMixerMusicGain={onMixerMusicGain} />);

    fireEvent.click(screen.getByRole("button", { name: "Couper tout le Beat collectif" }));
    expect(onMixerMusicGain).toHaveBeenCalledWith(0);
    expect(screen.getByRole("slider", { name: "Volume musique du Beat collectif" })).toHaveValue("0");

    fireEvent.click(screen.getByRole("button", { name: "Rétablir le Beat collectif" }));
    expect(onMixerMusicGain).toHaveBeenLastCalledWith(0.72);
  });

  it("uses the stroke as an audible-state indicator without selectable tracks", () => {
    const { rerender, execute } = renderPanel();
    const baseTrack = screen.getByRole("article", { name: "BeatKing" });
    const guitarTrack = screen.getByRole("article", { name: "Koda Sweep" });
    expect(baseTrack).toHaveClass("is-enabled");
    expect(guitarTrack).toHaveClass("is-enabled");
    expect(guitarTrack).not.toHaveAttribute("tabindex");
    fireEvent.click(guitarTrack);
    expect(execute).not.toHaveBeenCalled();

    const mutedWave = waveFixture();
    const guitarLayer = mutedWave.layers.find((layer) => layer.id === "layer-5");
    if (!guitarLayer) throw new Error("guitar_layer_missing");
    guitarLayer.muted = true;
    rerender(<WaveOrchestraPanel wave={mutedWave} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={execute} />);
    expect(screen.getByRole("article", { name: "Koda Sweep" })).toHaveClass("is-muted");
  });

  it("offers upload/replace and download in the global final-production player", () => {
    renderPanel();
    const controller = screen.getByRole("complementary", { name: "Lecteur du Beat collectif" });
    expect(within(controller).getByRole("button", { name: "Importer" })).toBeInTheDocument();
    expect(within(controller).getByRole("button", { name: "Télécharger" })).toBeEnabled();
  });

  it("ouvre un duel de remplacement et soumet la candidate au vote", () => {
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    const wave = waveFixture();
    const candidate = wave.submissions.find((submission) => submission.status === "analysis" && !wave.layers.some((layer) => layer.submissionId === submission.id));
    if (!candidate) throw new Error("replacement_candidate_missing");
    render(<WaveOrchestraPanel wave={wave} role="host" roomId="demo-wave" source="demo" accountId="host" disabled={false} execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Duel de remplacement pour Blue Guitar" }));
    expect(screen.getByRole("dialog", { name: "Duel de remplacement" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Boucle candidate au remplacement" }), { target: { value: candidate.id } });
    fireEvent.click(screen.getByRole("button", { name: "Soumettre au vote" }));

    expect(execute).toHaveBeenCalledWith({ type: "wave.replacement.open", layerId: "layer-5", submissionId: candidate.id, durationSeconds: 30, listeningMode: "beat" });
  });

  it("keeps transport and mix controls fail-closed until the live server program is ready", () => {
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    const wave = waveFixture();
    wave.playing = true;
    const { container, rerender } = render(<WaveOrchestraPanel wave={wave} role="host" roomId="room-live" source="live" accountId="host" disabled={false} execute={execute} />);

    expect(screen.getByText(/Le moteur serveur prépare le rendu officiel/)).toBeInTheDocument();
    expect(container.querySelector(".wave-collective__waveform")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lire toutes les pistes actives" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Solo Blue Guitar" }).every((button) => button.hasAttribute("disabled"))).toBe(true);

    rerender(<WaveOrchestraPanel wave={wave} role="host" roomId="room-live" source="live" accountId="host" disabled={false} execute={execute} programAudioStatus="ready" />);
    expect(screen.queryByText(/Le moteur serveur prépare le rendu officiel/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mettre toutes les pistes en pause" })).toBeEnabled();
  });
});
