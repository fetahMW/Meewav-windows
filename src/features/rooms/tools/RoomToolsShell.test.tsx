import { cleanup, fireEvent, render as renderWithoutRouter, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceRoomState } from "../place/place.types";
import { createPlaceDemoState } from "../place/place.fixtures";
import { WaveTransportProvider, useWaveTransport } from "../wave-transport/WaveTransportProvider";
import RoomToolsShell from "./RoomToolsShell";
import { SPECIALIZED_ROOM_TOOL_CONFIGS } from "./roomTools.config";
import type { SpecializedRoomId } from "./roomTools.types";

function room(id: string): PlaceRoomState {
  return {
    ...createPlaceDemoState(),
    id,
    source: "demo",
    channels: [],
    currentUserProfile: { id: "host-profile", displayName: "Host Test", handle: "host", role: "Host", city: "Paris", avatarUrl: "", gradeLevel: 6 },
  };
}

function render(ui: Parameters<typeof renderWithoutRouter>[0]) {
  return renderWithoutRouter(ui, { wrapper: MemoryRouter });
}

let capturedWaveTransport: ReturnType<typeof useWaveTransport> = null;
function CaptureWaveTransport() {
  const transport = useWaveTransport();
  useEffect(() => { capturedWaveTransport = transport; }, [transport]);
  return null;
}

afterEach(() => { cleanup(); capturedWaveTransport = null; });

describe("RoomToolsShell", () => {
  it.each(Object.keys(SPECIALIZED_ROOM_TOOL_CONFIGS) as SpecializedRoomId[])("uses the compact canonical rail and no legacy cards for %s", async (roomType) => {
    const { container } = render(<RoomToolsShell roomType={roomType} room={room(`compact-${roomType}`)} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    const expectedLabel = {
      scene: "Outils de La Scène",
      classe: "Outils de La Classe",
      wave: "Outils de La Wave",
      cage: "Outils de La Cage",
      loge: "Outils de La Loge",
    }[roomType];
    const rail = await screen.findByRole("tablist", { name: expectedLabel });
    expect(rail).toHaveClass("place-tools-console__switch");
    expect(within(rail).getAllByRole("tab")).toHaveLength(SPECIALIZED_ROOM_TOOL_CONFIGS[roomType].length);
    expect(container.querySelector(`.room-tools-shell.is-${roomType}`)).toHaveClass("is-wave-tool-skin");
    expect(container.querySelector(".room-tools-shell__cards")).not.toBeInTheDocument();
    expect(container.querySelector(".room-tools-shell__top")).not.toBeInTheDocument();
  });

  it.each(Object.keys(SPECIALIZED_ROOM_TOOL_CONFIGS) as SpecializedRoomId[])("opens every configured panel for %s", async (roomType) => {
    render(<RoomToolsShell roomType={roomType} room={room(`shell-${roomType}`)} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(SPECIALIZED_ROOM_TOOL_CONFIGS[roomType].length));
    for (const tool of SPECIALIZED_ROOM_TOOL_CONFIGS[roomType]) {
      fireEvent.click(screen.getByRole("tab", { name: tool.label }));
      await waitFor(() => expect(screen.getByRole("tabpanel", { name: tool.label })).toBeInTheDocument());
      expect(screen.queryByText("Outils en cours de construction")).not.toBeInTheDocument();
    }
  });

  it.each(Object.keys(SPECIALIZED_ROOM_TOOL_CONFIGS) as SpecializedRoomId[])("leaves generic host tools in Chat for %s", async (roomType) => {
    const { container } = render(<RoomToolsShell roomType={roomType} room={room(`gift-${roomType}`)} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    const rail = await screen.findByRole("tablist", { name: /^Outils de La/ });
    expect(within(rail).queryByRole("tab", { name: /Partage|Sondage|Épingl|Cadeau|Récompense/i })).not.toBeInTheDocument();
    expect(container.querySelector(".place-gift-tool")).not.toBeInTheDocument();
  });

  it("exposes exactly the four Scene tools and no duplicated Place gift tool", async () => {
    const { container } = render(<RoomToolsShell roomType="scene" room={room("scene-four-tools")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(4));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("Programme"), expect.stringContaining("Prompteur"), expect.stringContaining("Évaluation"), expect.stringContaining("Cagnotte"),
    ]));
    expect(screen.queryByRole("tab", { name: /Cadeau|Mettre en avant/i })).not.toBeInTheDocument();
    expect(container.querySelector(".place-gift-tool")).not.toBeInTheDocument();
  });

  it("exposes the three production Wave tools", async () => {
    render(<RoomToolsShell roomType="wave" room={room("tools-wave")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    expect(screen.getByRole("tab", { name: /Sas des boucles/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Vote du public/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Beat collectif/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Cadeau/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Beat collectif/i }));
    expect(await screen.findByRole("tabpanel", { name: "Beat collectif" })).toBeInTheDocument();
  });

  it("revient automatiquement au Beat collectif quand son sélecteur d’écoute est masqué", async () => {
    render(<WaveTransportProvider toolsVisible>
      <CaptureWaveTransport />
      <RoomToolsShell roomType="wave" room={room("wave-beat-mode")} isHost isGuest={false} onOpenMixer={vi.fn()} />
    </WaveTransportProvider>);
    await waitFor(() => expect(capturedWaveTransport).not.toBeNull());
    capturedWaveTransport!.engine.setMode("loop");
    fireEvent.click(await screen.findByRole("tab", { name: /Beat collectif/i }));
    await waitFor(() => {
      expect(capturedWaveTransport?.context).toBe("wave-orchestra");
      expect(capturedWaveTransport?.engine.getSnapshot().mode).toBe("beat");
    });
  });

  it("renders compact Wave labels with full accessible names and matching panels", async () => {
    render(<RoomToolsShell roomType="wave" room={room("wave-compact-labels")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    const rail = await screen.findByRole("tablist", { name: "Outils de La Wave" });
    const tools = [
      { label: "Sas des boucles", shortLabel: "Boucle", id: "wave-gate" },
      { label: "Vote du public", shortLabel: "Vote", id: "wave-sequencer" },
      { label: "Beat collectif", shortLabel: "Beat", id: "wave-orchestra" },
    ];
    expect(within(rail).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(tools.map((tool) => tool.shortLabel));

    for (const tool of tools) {
      const tab = within(rail).getByRole("tab", { name: tool.label });
      expect(tab).toHaveTextContent(new RegExp(`^${tool.shortLabel}$`));
      expect(tab).toHaveAttribute("title", tool.label);
      expect(tab).toHaveAttribute("aria-controls", `room-tool-panel-${tool.id}`);
      fireEvent.click(tab);
      expect(tab).toHaveAttribute("aria-selected", "true");
      expect(tab).toHaveAttribute("tabindex", "0");
      expect(await screen.findByRole("tabpanel", { name: tool.label })).toHaveAttribute("id", `room-tool-panel-${tool.id}`);
    }
  });

  it("keeps keyboard navigation and roving focus intact in the compact Wave rail", async () => {
    render(<RoomToolsShell roomType="wave" room={room("wave-compact-keyboard")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    const rail = await screen.findByRole("tablist", { name: "Outils de La Wave" });
    const tabs = within(rail).getAllByRole("tab");
    const [loop, vote, beat] = tabs;

    expect(loop).toHaveAttribute("tabindex", "0");
    loop.focus();
    for (const [source, key, target] of [
      [loop, "ArrowRight", vote],
      [vote, "End", beat],
      [beat, "ArrowRight", loop],
      [loop, "ArrowLeft", beat],
      [beat, "Home", loop],
    ] as const) {
      fireEvent.keyDown(source, { key });
      expect(target).toHaveFocus();
      expect(target).toHaveAttribute("aria-selected", "true");
      expect(target).toHaveAttribute("tabindex", "0");
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([target]);
      const panel = await screen.findByRole("tabpanel", { name: target.getAttribute("aria-label")! });
      expect(panel).toHaveAttribute("id", target.getAttribute("aria-controls"));
    }
  });

  it("shows the 24 Class seats first, keeps access details hidden and moves commands into the bottom dock", async () => {
    const pinHighlight = vi.fn(async () => undefined);
    const clearHighlight = vi.fn(async () => undefined);
    const { container } = render(<RoomToolsShell roomType="classe" room={room("classe-main-tool")} isHost isGuest={false} onOpenMixer={vi.fn()} onPinHighlight={pinHighlight} onClearHighlight={clearHighlight} />);
    await waitFor(() => expect(container.querySelectorAll(".classroom-seat")).toHaveLength(24));
    expect(screen.getByRole("tab", { name: "La Classe" })).toHaveAttribute("aria-selected", "true");
    const classroomPanel = container.querySelector(".room-tool-panel.is-classroom")!;
    expect(classroomPanel.firstElementChild).toHaveClass("classroom-roster");
    expect(container.querySelectorAll(".classroom-seat")).toHaveLength(24);
    expect(container.querySelectorAll(".classroom-seat__person")).toHaveLength(24);
    expect(within(classroomPanel as HTMLElement).queryByText("Libre")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".classroom-seat.is-hand-raised")).toHaveLength(3);
    expect(container.querySelectorAll(".classroom-seat.is-speaking")).toHaveLength(1);
    expect(container.querySelectorAll(".classroom-seat.is-private")).toHaveLength(0);
    expect(container.querySelectorAll(".classroom-seat__signal")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Sofia N\., place 1/i }).querySelector(".classroom-seat__signal .lucide-audio-lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sam Bako, place 4/i }).querySelector(".classroom-seat__signal .classroom-raised-hand-glyph")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Maëlle R\., place 12/i }).querySelector(".classroom-seat__signal .lucide-mic-off")).toBeInTheDocument();
    expect(container.querySelector(".classroom-liveboard")).not.toBeInTheDocument();
    expect(container.querySelector(".classroom-access-badge")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Actions de La Classe" })).toBeVisible();
    const noeSeat = screen.getByRole("button", { name: /Noé Rivière, place 2/i });
    expect(noeSeat.querySelector(".classroom-seat__signal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Téo Mars, place 6/i }).querySelector(".classroom-seat__signal")).not.toBeInTheDocument();
    expect(container.querySelector(".classroom-seat__grade")).not.toBeInTheDocument();
    expect(container.querySelector(".classroom-status")).not.toBeInTheDocument();
    const classDock = screen.getByRole("complementary", { name: "Actions de La Classe" });
    const controls = classDock.querySelectorAll(".classroom-command-dock__controls > button");
    expect(controls).toHaveLength(6);
    expect(controls[0]).toHaveAccessibleName("Ouvrir les ressources du cours");
    expect(classDock.querySelector(".classroom-command-dock__identity")).not.toBeInTheDocument();
    expect(classDock.querySelector(".classroom-command-dock__avatar")).not.toBeInTheDocument();
    expect(classDock.querySelector(".classroom-command-dock__grade-slot")).not.toBeInTheDocument();

    const handsButton = screen.getByRole("button", { name: "Fermer les demandes de prise de parole" });
    expect(handsButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(handsButton);
    await waitFor(() => expect(handsButton).toHaveAttribute("aria-pressed", "false"));
    expect(container.querySelectorAll(".classroom-seat.is-hand-raised")).toHaveLength(0);
    expect(handsButton.querySelector("i")).not.toBeInTheDocument();

    const originalCreateObjectUrl = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:classe-resource-test") });
    const resourcesButton = screen.getByRole("button", { name: "Ouvrir les ressources du cours" });
    fireEvent.click(resourcesButton);
    expect(resourcesButton).toHaveAttribute("aria-expanded", "true");
    const resourceInput = container.querySelector(".classroom-resource-input") as HTMLInputElement;
    expect(resourceInput).toHaveAttribute("multiple");
    expect(resourceInput.accept).toContain("image/png");
    expect(resourceInput.accept).toContain("audio/mpeg");
    fireEvent.change(resourceInput, { target: { files: [new File(["pixels"], "cours.png", { type: "image/png" })] } });
    expect(await screen.findByText("cours.png")).toBeVisible();
    expect(resourcesButton.querySelector("i")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Fermer les ressources" }));
    expect(resourcesButton).toHaveAttribute("aria-expanded", "false");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });

    fireEvent.click(noeSeat);
    expect(noeSeat).toHaveAttribute("aria-pressed", "true");
    expect(noeSeat.closest(".classroom-seat")).toHaveClass("is-selected");
    const dock = screen.getByRole("complementary", { name: "Actions pour Noé Rivière" });
    expect(dock).toBeVisible();
    expect(dock.querySelector(".classroom-command-dock__identity")).not.toBeInTheDocument();
    expect(dock.querySelector(".classroom-command-dock__avatar")).not.toBeInTheDocument();
    expect(dock.querySelector(".classroom-command-dock__grade-slot")).not.toBeInTheDocument();
    expect(within(dock).queryByText("Noé Rivière")).not.toBeInTheDocument();
    await waitFor(() => expect(dock.contains(document.activeElement)).toBe(true));

    const privateButton = screen.getByRole("button", { name: "Écrire un message privé à Noé Rivière" });
    expect(privateButton).toBeEnabled();
    fireEvent.click(privateButton);
    const privateDialog = await screen.findByRole("dialog", { name: "Message privé à Noé Rivière" });
    expect(privateDialog).toBeVisible();
    const privateInput = within(privateDialog).getByRole("textbox", { name: /Message/i });
    fireEvent.change(privateInput, { target: { value: "Reprends doucement la mesure 12." } });
    fireEvent.click(within(privateDialog).getByRole("button", { name: "Envoyer" }));
    expect(await within(privateDialog).findByText(/Aperçu démo validé/i)).toBeVisible();
    expect(container.querySelector(".room-tools-shell__error")).not.toBeInTheDocument();
    fireEvent.click(within(privateDialog).getByRole("button", { name: "Fermer le message privé" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Message privé à Noé Rivière" })).toBeNull());
    await waitFor(() => expect(privateButton).toHaveFocus());

    const endFloorButton = screen.getByRole("button", { name: "Terminer la prise de parole et remettre toute la classe en écoute" });
    expect(endFloorButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(endFloorButton);
    await screen.findByRole("button", { name: "Donner la parole à Noé Rivière" });
    expect(container.querySelector(".room-tools-shell__error")).not.toBeInTheDocument();
    fireEvent.click(noeSeat);
    expect(noeSeat).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("tab", { name: "Questions de la classe" }));
    expect(await screen.findByRole("tab", { name: /Populaires/i })).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Afficher dans la classe" })[0]);
    await waitFor(() => expect(pinHighlight).toHaveBeenCalledWith(expect.stringMatching(/^Question de /), 30));
    fireEvent.click(screen.getAllByRole("button", { name: "Donner la parole" })[0]);
    expect(await screen.findByRole("tabpanel", { name: "La Classe" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: /Actions pour / })).toBeVisible();
  });

  it("selects the first specific panel when the Room changes", async () => {
    const { rerender } = render(<RoomToolsShell roomType="wave" room={room("room-switch-wave")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Beat collectif" }));
    expect(screen.getByRole("tab", { name: "Beat collectif" })).toHaveAttribute("aria-selected", "true");

    rerender(<RoomToolsShell roomType="classe" room={room("room-switch-classe")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    expect(await screen.findByRole("tabpanel", { name: "La Classe" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "La Classe" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: /Noé Rivière, place 2/i })).toBeVisible();
  });

  it("moves through the four Scene tools with the standard tab keyboard pattern", async () => {
    render(<RoomToolsShell roomType="scene" room={room("scene-keyboard-tabs")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    const programme = await screen.findByRole("tab", { name: /Programme/i });
    const prompter = screen.getByRole("tab", { name: /Prompteur/i });
    const fundraiser = screen.getByRole("tab", { name: /Cagnotte/i });

    expect(programme).toHaveAttribute("tabindex", "0");
    expect(prompter).toHaveAttribute("tabindex", "-1");
    programme.focus();
    fireEvent.keyDown(programme, { key: "ArrowRight" });
    expect(prompter).toHaveFocus();
    expect(prompter).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("tabpanel", { name: "Prompteur" })).toHaveAttribute("aria-labelledby", prompter.id);

    fireEvent.keyDown(prompter, { key: "End" });
    expect(fundraiser).toHaveFocus();
    expect(fundraiser).toHaveAttribute("aria-selected", "true");
  });

  it("shows a privacy boundary instead of Scene prompter text to a viewer", async () => {
    const viewerRoom = { ...room("scene-public"), currentUserProfile: { ...room("x").currentUserProfile!, id: "viewer", role: "Fan" } };
    render(<RoomToolsShell roomType="scene" room={viewerRoom} isHost={false} isGuest={false} onOpenMixer={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Prompteur/i }));
    await screen.findByText(/Le Prompteur est privé/i);
    expect(screen.queryByText(/La ville s'endort/i)).not.toBeInTheDocument();
  });

  it("opens the text linked to a programmed passage and delegates guest management", async () => {
    const onOpenGuests = vi.fn();
    render(<RoomToolsShell roomType="scene" room={room("scene-program-shortcuts")} isHost isGuest={false} onOpenMixer={vi.fn()} onOpenGuests={onOpenGuests} />);
    fireEvent.click(await screen.findByRole("button", { name: "Gérer les invités" }));
    expect(onOpenGuests).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Nuit acoustique.*À suivre/i }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le texte" }));
    expect(await screen.findByRole("tabpanel", { name: "Prompteur" })).toBeVisible();
    expect(await screen.findByRole("combobox", { name: "Texte à lire" })).toHaveValue("text-2");
  });

  it.skip("keeps the retired Avant-première toolbar integration covered by its dedicated panel suite", async () => {
    const previousCreateObjectUrl = URL.createObjectURL;
    const previousRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:loge-preview-test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Uint8Array.of(1, 2, 3).buffer }));
    vi.stubGlobal("AudioContext", class FakeAudioContext {
      async decodeAudioData() {
        const channels = [
          new Float32Array(512).fill(-.25),
          new Float32Array(512).fill(.75),
        ];
        return {
          duration: 2,
          numberOfChannels: channels.length,
          sampleRate: 48_000,
          getChannelData: (index: number) => channels[index],
        };
      }

      async close() {}
    });

    try {
      const { container } = render(<RoomToolsShell roomType="loge" room={room("preview-wave-loge")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
      fireEvent.click(screen.getByRole("tab", { name: /Avant-première/i }));

      const fileInput = container.querySelector<HTMLInputElement>('input[type="file"][accept="audio/*"]');
      expect(fileInput).not.toBeNull();
      fireEvent.change(fileInput!, { target: { files: [new File(["wave"], "loge-exclusive.wav", { type: "audio/wav" })] } });
      await screen.findByText("loge-exclusive.wav");

      const audio = container.querySelector("audio");
      expect(audio).not.toBeNull();
      Object.defineProperty(audio!, "duration", { configurable: true, value: 2 });
      Object.defineProperty(audio!, "currentTime", { configurable: true, writable: true, value: .5 });
      fireEvent.loadedMetadata(audio!);
      fireEvent.play(audio!);
      fireEvent.timeUpdate(audio!);

      await waitFor(() => expect(container.querySelectorAll(".room-loge-preview__wave line")).toHaveLength(128));
      const samples = Array.from(container.querySelectorAll<SVGLineElement>(".room-loge-preview__wave line"));
      expect(samples.filter((sample) => sample.classList.contains("is-played"))).toHaveLength(32);
      expect(samples.filter((sample) => sample.classList.contains("is-pending"))).toHaveLength(96);
      expect(Number(samples[0].getAttribute("y1"))).toBeCloseTo(10.75, 2);
      expect(Number(samples[0].getAttribute("y2"))).toBeCloseTo(33.75, 2);
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: previousCreateObjectUrl });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: previousRevokeObjectUrl });
    }
  });

  it.skip("keeps the retired Avant-première form integration covered by its dedicated panel suite", async () => {
    const { container } = render(<RoomToolsShell roomType="loge" room={room("preview-contract-loge")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    fireEvent.click(screen.getByRole("tab", { name: /Avant-première/i }));

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    Object.defineProperty(audio!, "duration", { configurable: true, value: 127 });
    fireEvent.loadedMetadata(audio!);
    expect(await screen.findByText("Avant-première prête")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remplacer le média" })).toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')).toHaveAttribute("accept", "audio/*");

    const options = screen.getByRole("button", { name: "Options de l’avant-première" });
    fireEvent.click(options);
    expect(screen.getByRole("group", { name: "Options de l’avant-première" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Options de l’avant-première" })).not.toBeInTheDocument());
    expect(options).toHaveFocus();

    const replay = screen.getByRole("switch", { name: "Inclure le replay après le direct" });
    const liveOnly = screen.getByRole("switch", { name: "Limiter la lecture au direct" });
    expect(replay).toBeChecked();
    expect(liveOnly).not.toBeChecked();
    fireEvent.click(liveOnly);
    expect(liveOnly).toBeChecked();
    expect(replay).not.toBeChecked();

    const titleInput = screen.getByRole("textbox", { name: /Titre/i });
    fireEvent.change(titleInput, { target: { value: "Écoute privée — Nouvelle version" } });
    fireEvent.play(audio!);
    await waitFor(() => expect(titleInput).toHaveValue("Écoute privée — Nouvelle version"));
    const save = screen.getByRole("button", { name: "Enregistrer les modifications" });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("button", { name: "Modifications enregistrées" })).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Supprimer le média" }));
    await screen.findByText("Aucun média importé");
    expect(screen.getByRole("button", { name: "Importer un média" })).toBeInTheDocument();
  });

  it("exposes VIP under its retained internal dedication id", async () => {
    const { container } = render(<RoomToolsShell roomType="loge" room={room("dedication-loge")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    expect(container.querySelector('.room-tools-shell.is-loge.is-wave-tool-skin[data-active-tool="loge-dedication"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^VIP$/i }));
    expect(await screen.findByRole("tabpanel", { name: "VIP" })).toBeInTheDocument();
  });

  it("keeps Loge questions and their VIP shortcut available", async () => {
    render(<RoomToolsShell roomType="loge" room={room("audience-choice-loge")} isHost isGuest={false} onOpenMixer={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Questions" }));
    expect(await screen.findByRole("tabpanel", { name: "Questions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "VIP" })).toBeInTheDocument();
  });
});
