import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WaveState, WaveSubmission } from "../roomTools.types";
import WaveEmptyPanel from "./WaveEmptyPanel";

const transportMocks = vi.hoisted(() => ({
  select: vi.fn(), play: vi.fn(), pause: vi.fn(), setMode: vi.fn(), setLayerGain: vi.fn(),
  audio: { playing: false, mode: "beat", quickPreview: false, candidate: null as { id: string } | null,
    referenceId: "base-reference", referenceLoading: false },
}));
vi.mock("../../wave-transport/WaveTransportProvider", () => ({
  useWaveTransport: () => ({
    select: transportMocks.select, play: transportMocks.play, pause: transportMocks.pause,
    engine: { setMode: transportMocks.setMode, setLayerGain: transportMocks.setLayerGain, getSnapshot: () => transportMocks.audio },
  }),
  useWaveTransportState: () => transportMocks.audio,
}));

const accepted: WaveSubmission = {
  id: "accepted-loop", title: "Night Drive", instrument: "Basse", category: "bass", bpm: 124, bars: 8,
  key: "Fm", durationSeconds: 15.48, mediaUrl: "/accepted.wav", status: "accepted", lifecycleStatus: "ACCEPTED",
  rightsConfirmed: true, version: 1, privateNotes: "", creditPublic: true, versions: [],
  contributor: { id: "artist", name: "Luca Maris", role: "Beatmaker", avatarUrl: "", microphone: "ready", camera: "ready" },
};
const wave: WaveState = {
  title: "Wave", baseLoop: { title: "Beat original", bars: 8, bpm: 124, key: "Fm", kind: "Beat", mediaUrl: "/base.wav" },
  submissionsOpen: true, submissions: [accepted], activeSubmissionId: null,
  layers: [
    { id: "base", title: "Beat original", author: "Host", active: true, solo: false, muted: false },
    { id: "layer-accepted", submissionId: accepted.id, title: accepted.title, author: accepted.contributor.name, active: true, solo: false, muted: false },
  ],
  playing: false, looping: true, history: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  transportMocks.audio.mode = "beat";
  transportMocks.audio.quickPreview = false;
  transportMocks.audio.candidate = null;
});
afterEach(cleanup);

describe("WaveEmptyPanel · sélection d’écoute du Beat", () => {
  it("présente Puff comme Host de la maquette et l’arpège comme boucle de base", () => {
    render(<WaveEmptyPanel label="Beat" wave={wave} hostName="Puff" avatarUrl="/assets/orbit/founder-puff.png" />);
    const base = screen.getByRole("article", { name: "Sélectionner Puff" });
    expect(within(base).getByText("Puff")).toBeVisible();
    expect(within(base).getByText("BASE · ARPÈGE")).toBeVisible();
    expect(base.querySelector("img")).toHaveAttribute("src", "/assets/orbit/founder-puff.png");
  });

  it("arme une couche acceptée comme candidate du lecteur persistant", () => {
    render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" />);
    fireEvent.click(screen.getByRole("article", { name: "Sélectionner Luca Maris" }));
    expect(transportMocks.select).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(screen.getByRole("article", { name: "Sélectionner Luca Maris" })).toHaveAttribute("data-selected", "true");
    expect(transportMocks.setMode).not.toHaveBeenCalled();
  });

  it("la ligne de base reste la référence seule et ne devient jamais sa propre candidate", async () => {
    render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" />);
    fireEvent.click(screen.getByRole("article", { name: "Sélectionner Luca Maris" }));
    fireEvent.click(screen.getByRole("article", { name: "Sélectionner Beat original" }));
    expect(transportMocks.select).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(transportMocks.setMode).toHaveBeenLastCalledWith("beat"));
    expect(screen.getByRole("article", { name: "Sélectionner Beat original" })).toHaveAttribute("data-selected", "true");
  });

  it("réserve la lecture au lecteur global et ne met aucun Play dans les cartes", () => {
    render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" />);
    const card = screen.getByRole("article", { name: "Sélectionner Luca Maris" });
    expect(within(card).queryByRole("button", { name: "Écouter Luca Maris" })).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(transportMocks.select).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(transportMocks.setMode).not.toHaveBeenCalled();
    expect(transportMocks.play).not.toHaveBeenCalled();
  });

  it("place Mute, Solo et volume directement dans chaque carte, sans indicateur ACTIF/HORS", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" execute={execute} />);
    const card = screen.getByRole("article", { name: "Sélectionner Luca Maris" });
    expect(within(card).queryByText("ACTIF")).not.toBeInTheDocument();
    expect(within(card).queryByText("HORS")).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Couper Luca Maris" }));
    expect(execute).toHaveBeenCalledWith({
      type: "wave.sequence.layer", layerId: "layer-accepted", patch: { muted: true },
    });

    fireEvent.click(within(card).getByRole("button", { name: "Écouter Luca Maris en solo" }));
    expect(execute).toHaveBeenCalledWith({
      type: "wave.sequence.layer", layerId: "layer-accepted", patch: { solo: true, muted: false },
    });

    const slider = within(card).getByRole("slider", { name: "Volume de Luca Maris" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: ".61" } });
    fireEvent.pointerUp(slider);
    expect(transportMocks.setLayerGain).toHaveBeenLastCalledWith(accepted.id, .61);
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "wave.sequence.layer", layerId: "layer-accepted", patch: { gain: .61 },
    }));

    fireEvent.click(card);
    const navbar = screen.getByRole("complementary", { name: "Actions Beat" });
    expect(within(navbar).getByText("Luca Maris")).toBeVisible();
    expect(within(navbar).queryByRole("button")).not.toBeInTheDocument();
  });

  it("affiche un solo strict : la piste solo reste active et la base passe hors écoute", () => {
    const soloWave = structuredClone(wave);
    soloWave.layers[1].solo = true;
    render(<WaveEmptyPanel label="Beat" wave={soloWave} avatarUrl="/host.webp" execute={vi.fn()} />);

    const baseCard = screen.getByRole("article", { name: "Sélectionner Beat original" });
    const soloCard = screen.getByRole("article", { name: "Sélectionner Luca Maris" });
    expect(baseCard).toHaveClass("is-out-of-mix");
    expect(soloCard).toHaveClass("is-solo", "is-in-mix");
  });

  it("reflète BOUCLE fidèlement : seule la candidate isolée est marquée dans l’écoute", () => {
    transportMocks.audio.mode = "loop";
    transportMocks.audio.candidate = { id: accepted.id };
    render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" execute={vi.fn()} />);

    const baseCard = screen.getByRole("article", { name: "Sélectionner Beat original" });
    const candidateCard = screen.getByRole("article", { name: "Sélectionner Luca Maris" });
    expect(baseCard).toHaveClass("is-out-of-mix");
    expect(candidateCard).toHaveClass("is-in-mix");
  });

  it("suit tout le drag dans le moteur et ne persiste que sa valeur finale, sans race de rerender", async () => {
    const releases: Array<() => void> = [];
    const execute = vi.fn(() => new Promise<void>((resolve) => { releases.push(resolve); }));
    const view = render(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" execute={execute} />);
    const slider = screen.getByRole("slider", { name: "Volume de Luca Maris" });

    fireEvent.pointerDown(slider);
    for (const value of [".24", ".43", ".61", ".74"]) fireEvent.change(slider, { target: { value } });
    expect(slider).toHaveValue("0.74");
    expect(transportMocks.setLayerGain.mock.calls).toEqual([
      [accepted.id, .24], [accepted.id, .43], [accepted.id, .61], [accepted.id, .74],
    ]);
    expect(execute).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    await waitFor(() => expect(execute).toHaveBeenCalledExactlyOnceWith({
      type: "wave.sequence.layer", layerId: "layer-accepted", patch: { gain: .74 },
    }));

    // A busy rerender still displays the local final value instead of snapping
    // back to the older server projection while persistence is in flight.
    view.rerender(<WaveEmptyPanel label="Beat" wave={wave} avatarUrl="/host.webp" execute={execute} disabled volumeDisabled={false} />);
    const busySlider = screen.getByRole("slider", { name: "Volume de Luca Maris" });
    expect(busySlider).toHaveValue("0.74");
    expect(busySlider).not.toBeDisabled();

    // Even while the first persistence promise is unresolved, a second drag
    // stays continuous. Its final commit waits behind the first one.
    fireEvent.pointerDown(busySlider);
    for (const value of [".68", ".57", ".49"]) fireEvent.change(busySlider, { target: { value } });
    fireEvent.pointerUp(busySlider);
    expect(busySlider).toHaveValue("0.49");
    expect(transportMocks.setLayerGain.mock.calls.slice(-3)).toEqual([
      [accepted.id, .68], [accepted.id, .57], [accepted.id, .49],
    ]);
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => { releases[0](); await Promise.resolve(); });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenLastCalledWith({
      type: "wave.sequence.layer", layerId: "layer-accepted", patch: { gain: .49 },
    });

    const projected = structuredClone(wave);
    projected.layers[1].gain = .49;
    view.rerender(<WaveEmptyPanel label="Beat" wave={projected} avatarUrl="/host.webp" execute={execute} />);
    await act(async () => { releases[1](); await Promise.resolve(); });
    expect(screen.getByRole("slider", { name: "Volume de Luca Maris" })).toHaveValue("0.49");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
