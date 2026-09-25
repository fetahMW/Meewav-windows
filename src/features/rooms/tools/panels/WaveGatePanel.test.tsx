import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { WaveTransportProvider, useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import WaveGatePanel from "./WaveGatePanel";

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  vi.stubGlobal("AudioContext", vi.fn(function () {
    const samples = new Float32Array(800);
    return {
      state: "running",
      currentTime: 0,
      decodeAudioData: vi.fn(async () => ({ duration: 8, length: 800, sampleRate: 100, numberOfChannels: 1, getChannelData: () => samples })),
      close: vi.fn(async () => undefined),
    };
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function PlayerShortcutBridge({ play, pause, mode = "base" }: { play: () => Promise<void>; pause: () => void; mode?: "base" | "loop" | "mix" }) {
  const { engine, registerPlaybackControls } = useWaveTransport()!;
  const state = useWaveTransportState()!;
  useEffect(() => registerPlaybackControls({ play, pause }), [registerPlaybackControls, play, pause]);
  useEffect(() => { engine.setGrid({ bpm: 124, beatsPerBar: 4, origin: 0 }); engine.setMode(mode); }, [engine, mode]);
  return <output aria-label="État du transport de test">{state.mode}|{String(state.quickPreview)}|{state.candidate?.id}</output>;
}

describe("WaveGatePanel", () => {
  it("rétablit les actions par ligne et délègue Play au lecteur unique", async () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-shared-player").wave!;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const { container } = render(<MemoryRouter><WaveTransportProvider toolsVisible>
      <PlayerShortcutBridge play={play} pause={pause} />
      <WaveGatePanel wave={wave} role="host" roomId="wave-gate-shared-player" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} />
    </WaveTransportProvider></MemoryRouter>);
    const row = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    fireEvent.click(row);
    expect(play).not.toHaveBeenCalled();
    expect(within(row).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(within(row).getByRole("button", { name: "Écouter Eliott Waves" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByLabelText("État du transport de test")).toHaveTextContent("base|true|loop-1");
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(within(screen.getByRole("complementary", { name: "Actions pour Eliott Waves" })).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(within(row).getByRole("button", { name: "Écouter Eliott Waves" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("État du transport de test")).toHaveTextContent("base|false|loop-1");
  });

  it.each(["base", "loop", "mix"] as const)("préserve le mode %s pendant le tri solo et charge la candidate au clic sur sa carte", async (mode) => {
    const wave = createRoomToolsFixture("wave", "wave-gate-quick-mode").wave!;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    render(<MemoryRouter><WaveTransportProvider toolsVisible>
      <PlayerShortcutBridge play={play} pause={pause} mode={mode} />
      <WaveGatePanel wave={wave} role="host" roomId="wave-gate-quick-mode" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} />
    </WaveTransportProvider></MemoryRouter>);
    const row = screen.getByRole("article", { name: "Sélectionner Deep Movement de Koda Sweep" });
    const candidate = wave.submissions.find((submission) => submission.title === "Deep Movement")!;

    fireEvent.click(within(row).getByRole("button", { name: "Écouter Koda Sweep" }));
    expect(screen.getByLabelText("État du transport de test")).toHaveTextContent(`${mode}|true|${candidate.id}`);
    expect(row).toHaveAttribute("data-selected", "true");
    expect(row).toHaveClass("is-selected");
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    fireEvent.click(row);
    expect(screen.getByLabelText("État du transport de test")).toHaveTextContent(`${mode}|false|${candidate.id}`);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("complementary", { name: "Actions pour Koda Sweep" })).toHaveTextContent("Koda SweepBASSE");
  });

  it("arrête le tri solo avant un refus sans supprimer le fichier ni décider avant confirmation", async () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-quick-review").wave!;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><WaveTransportProvider toolsVisible>
      <PlayerShortcutBridge play={play} pause={pause} />
      <WaveGatePanel wave={wave} role="host" roomId="wave-gate-quick-review" source="demo" accountId="host" disabled={false} execute={execute} />
    </WaveTransportProvider></MemoryRouter>);
    const row = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    fireEvent.click(within(row).getByRole("button", { name: "Écouter Eliott Waves" }));
    fireEvent.click(within(row).getByRole("button", { name: "Refuser Subway Bass" }));
    const menu = screen.getByRole("menu", { name: "Motif du refus de Subway Bass" });
    expect(pause).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Catégorie déjà complète" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("État du transport de test")).toHaveTextContent("base|false|loop-1");
    expect(execute).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(execute).toHaveBeenCalledExactlyOnceWith({
      type: "wave.submission.status", submissionId: "loop-1", status: "rejected", reason: "duplicate", feedback: "Catégorie déjà complète",
    }));
  });

  it("organise les propositions entrantes dans une file unique sans badges de statut", () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-tabs").wave!;
    const incomingCount = wave.submissions.filter((submission) => !submission.vote?.open
      && !["accepted", "analysis", "rejected"].includes(submission.status)).length;
    const { container } = render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-tabs" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("Triez rapidement les propositions")).not.toBeInTheDocument();
    expect(screen.getByText(`${incomingCount} boucles`)).toBeInTheDocument();
    expect(screen.getByText("Règles")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(incomingCount);
    expect(screen.getByRole("region", { name: "Boucles reçues dans le Sas" })).toBeInTheDocument();
    expect(container.querySelector(".wave-sas__queue")).toBeInTheDocument();
    expect(container.querySelector(".wave-sas-rail")).not.toBeInTheDocument();
    expect(container.querySelector(".wave-sas__queue-head")).not.toBeInTheDocument();
    expect(screen.queryByText("File d’attente")).not.toBeInTheDocument();
    expect(screen.queryByText(/ordre d’arrivée · audition privée/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("BASSE").length).toBeGreaterThan(1);
    expect(screen.getAllByText("DRUMS").length).toBeGreaterThan(1);
    expect(screen.getAllByText("MÉLODIE").length).toBeGreaterThan(1);
    expect(screen.getAllByText("ACAPELLA").length).toBeGreaterThan(1);
    expect(screen.getAllByText("FX").length).toBeGreaterThan(0);

    const subwayCard = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    expect(subwayCard.querySelector(".wave-loop-card__index")).not.toBeInTheDocument();
    expect(subwayCard.querySelector(".wave-loop-card__name")).toHaveTextContent("Eliott Waves");
    expect(subwayCard.querySelector(".wave-sas-card__grade")).toHaveClass("mw-grade-badge--xl");
    expect(subwayCard.querySelector(".wave-loop-card__meta")).toHaveTextContent("BASSE8 mesures · 124 BPM");
    expect(within(subwayCard).getByRole("button", { name: "Écouter Eliott Waves" })).toBeInTheDocument();
    expect(within(subwayCard).getByRole("button", { name: "Valider Subway Bass" })).toBeInTheDocument();
    const rejectButton = within(subwayCard).getByRole("button", { name: "Refuser Subway Bass" });
    expect(rejectButton.textContent).toBe("Refuser");
    expect(rejectButton.querySelector("svg")).not.toBeInTheDocument();
    expect(within(subwayCard).getByRole("button", { name: "Mettre Subway Bass en quarantaine" })).toBeInTheDocument();
    expect(within(subwayCard).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("complementary", { name: "Actions pour Eliott Waves" })).toBeInTheDocument();
  });

  it("envoie une version vers la file de vote puis refuse avec un motif", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const wave = createRoomToolsFixture("wave", "wave-gate-actions").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-actions" source="demo" accountId="host" disabled={false} execute={execute} /></MemoryRouter>);

    fireEvent.click(within(screen.getByRole("complementary", { name: "Actions pour Eliott Waves" })).getByRole("button", { name: "Valider Subway Bass" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "wave.submission.status", submissionId: "loop-1", status: "analysis" }));

    fireEvent.click(screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Actions pour Eliott Waves" })).getByRole("button", { name: "Refuser Subway Bass" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Motif du refus de Subway Bass" })).getByRole("menuitem", { name: "Catégorie déjà complète" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "wave.submission.status",
      submissionId: "loop-1",
      status: "rejected",
      reason: "duplicate",
      feedback: "Catégorie déjà complète",
    }));
  });

  it("valide une boucle directement depuis son raccourci de carte", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const wave = createRoomToolsFixture("wave", "wave-gate-quick-actions").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-quick-actions" source="demo" accountId="host" disabled={false} execute={execute} /></MemoryRouter>);

    const subwayCard = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    fireEvent.click(within(subwayCard).getByRole("button", { name: "Valider Subway Bass" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "wave.submission.status", submissionId: "loop-1", status: "analysis" }));
  });

  it("concentre l’identité et les quatre décisions essentielles dans la capsule sans seconde régie audio", () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-rework").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-rework" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);

    const controller = screen.getByRole("complementary", { name: "Actions pour Eliott Waves" });
    expect(within(controller).getAllByRole("button")).toHaveLength(4);
    expect(controller.querySelector(".wave-bottom-bar__name")).toHaveTextContent("Eliott Waves");
    expect(controller.querySelector(".wave-bottom-bar__meta")).toHaveTextContent("BASSE");
    expect(within(controller).getByRole("button", { name: "Envoyer un message à Eliott Waves" })).toBeInTheDocument();
    expect(within(controller).getByRole("button", { name: "Télécharger Subway Bass" })).toBeInTheDocument();
    expect(within(controller).queryByRole("button", { name: /Écouter/ })).not.toBeInTheDocument();
    expect(within(controller).getByRole("button", { name: "Valider Subway Bass" })).toBeInTheDocument();
    const rejectButton = within(controller).getByRole("button", { name: "Refuser Subway Bass" });
    expect(rejectButton.textContent).toBe("Refuser");
    expect(rejectButton.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it("synchronise le portrait de la capsule avec la boucle sélectionnée", () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-portraits").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-portraits" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    const first = wave.submissions.find(submission => submission.id === "loop-1")!;
    const second = wave.submissions.find(submission => submission.title === "Kick District")!;
    let controller = screen.getByRole("complementary", { name: `Actions pour ${first.contributor.name}` });
    expect(controller.querySelector(".wave-bottom-bar__avatar img")).toHaveAttribute("src", first.contributor.avatarUrl);

    fireEvent.click(screen.getByRole("article", { name: `Sélectionner ${second.title} de ${second.contributor.name}` }));
    controller = screen.getByRole("complementary", { name: `Actions pour ${second.contributor.name}` });
    const portrait = controller.querySelector(".wave-bottom-bar__avatar img")!;
    expect(portrait).toHaveAttribute("src", second.contributor.avatarUrl);
    expect(within(controller).getAllByRole("button")).toHaveLength(4);
    fireEvent.error(portrait);
    expect(portrait).toHaveAttribute("hidden");
    expect(controller.querySelector(".wave-bottom-bar__avatar em")).toHaveTextContent(second.contributor.name.charAt(0));
  });

  it("réserve le fallback du Play des cartes à une écoute solo", async () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-listening-modes").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-listening-modes" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    const row = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    fireEvent.click(within(row).getByRole("button", { name: "Écouter Eliott Waves" }));
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    expect(within(row).getByRole("button", { name: "Mettre Eliott Waves en pause" })).toBeInTheDocument();
  });

  it("charge la source propre à chaque boucle avant de lancer son aperçu", async () => {
    const wave = createRoomToolsFixture("wave", "wave-gate-distinct-audio").wave!;
    const { container } = render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-distinct-audio" source="demo" accountId="host" disabled={false} execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);

    const subwayCard = screen.getByRole("article", { name: "Sélectionner Subway Bass de Eliott Waves" });
    fireEvent.click(within(subwayCard).getByRole("button", { name: "Écouter Eliott Waves" }));
    await waitFor(() => expect(container.querySelector<HTMLAudioElement>(".wave-sas audio")?.src).toContain("bass-808-reseau.mp3"));

    const deepMovementCard = screen.getByRole("article", { name: "Sélectionner Deep Movement de Koda Sweep" });
    fireEvent.click(within(deepMovementCard).getByRole("button", { name: "Écouter Koda Sweep" }));
    await waitFor(() => expect(container.querySelector<HTMLAudioElement>(".wave-sas audio")?.src).toContain("bass-deep-movement.mp3"));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("permet au host de fermer les soumissions et d’éditer les règles", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const wave = createRoomToolsFixture("wave", "wave-gate-rules").wave!;
    render(<MemoryRouter><WaveGatePanel wave={wave} role="host" roomId="wave-gate-rules" source="demo" accountId="host" disabled={false} execute={execute} /></MemoryRouter>);

    const intakeButton = screen.getByRole("button", { name: "Soumissions ouvertes" });
    expect(intakeButton).toHaveTextContent("Ouvert");
    fireEvent.click(intakeButton);
    fireEvent.click(screen.getByRole("switch", { name: "Recevoir des boucles" }));
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "wave.submissions.setOpen", open: false, acceptedCategories: ["bass", "drums", "melody", "chords", "pad", "acapella", "fx"],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Règles" }));
    fireEvent.change(screen.getByLabelText("BPM"), { target: { value: "128" } });
    fireEvent.change(screen.getByLabelText("Gamme"), { target: { value: "A mineur" } });
    fireEvent.change(screen.getByLabelText("Direction recherchée"), { target: { value: "House organique" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les règles" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "wave.rules.update",
      patch: { bpm: 128, bars: 8, key: "A mineur", kind: "House organique" },
    }));
  });
});
