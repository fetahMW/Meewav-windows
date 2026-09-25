import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixer from "./PlaceMixer";
import { PLACE_MIXER_FALLBACK_COVERS } from "./placeMixerCoverCatalog";
import type { PlaceMixerView } from "./place.types";

const createObjectURL = vi.fn((file: File) => `blob:meewav-test/${file.name}`);
const revokeObjectURL = vi.fn();
const waveformChannels = [
  Float32Array.from({ length: 120 }, (_, index) => -(index + 1) / 240),
  Float32Array.from({ length: 120 }, (_, index) => (120 - index) / 120),
];

class WaveformAudioContextMock {
  async decodeAudioData() {
    return {
      duration: 3,
      numberOfChannels: waveformChannels.length,
      sampleRate: 48_000,
      getChannelData: (index: number) => waveformChannels[index],
    };
  }

  async close() {}
}

function PersistentMixer({ onCamera = vi.fn() }: { onCamera?: (participantId: string, enabled: boolean) => void } = {}) {
  const room = createPlaceDemoState();
  const [view, setView] = useState<PlaceMixerView>("volumes");

  return (
    <PlaceMixer
      room={room}
      mode="host"
      currentUserId={room.host.id}
      view={view}
      onView={setView}
      onGain={vi.fn()}
      onMute={vi.fn()}
      onCamera={onCamera}
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
      onTogglePlayback={vi.fn()}
    />
  );
}

function SixFaderMixer() {
  const fixture = createPlaceDemoState();
  const extraGuest = fixture.participants.find((participant) => participant.id === "guest-d")!;
  const room = {
    ...fixture,
    participants: fixture.participants.map((participant) => (
      participant.id === extraGuest.id ? { ...participant, status: "onstage" as const } : participant
    )),
    channels: [
      ...fixture.channels,
      {
        id: "guest-extra-stage",
        participantId: extraGuest.id,
        label: extraGuest.profile.displayName,
        detail: "Invité",
        kind: "guest" as const,
        gain: 0.7,
        level: 0.32,
        isMuted: false,
        isSolo: false,
        signalState: "active" as const,
        accent: "#a578ff",
      },
    ],
  };

  return (
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
      onTogglePlayback={vi.fn()}
    />
  );
}

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.stubGlobal("AudioContext", WaveformAudioContextMock);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => Uint8Array.of(1, 2, 3).buffer,
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlaceMixer audio dock", () => {
  it("rend réellement le lecteur silencieux lorsque le Master est à zéro", async () => {
    const room = createPlaceDemoState();
    room.channels = room.channels.map((channel) => channel.kind === "master" ? { ...channel, gain: 0 } : channel);
    const { container } = render(
      <PlaceMixer room={room} mode="host" currentUserId={room.host.id} view="volumes" onView={vi.fn()} onGain={vi.fn()} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()} pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }} localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false} nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null} onPitchProvider={vi.fn()} onRefreshPlugins={vi.fn()} onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()} />,
    );
    const audio = container.querySelector("audio") as HTMLAudioElement;
    await waitFor(() => expect(audio.volume).toBe(0));
  });

  it("garde les mutes Musique et Master pilotables dans une Room live", () => {
    const room = createPlaceDemoState();
    room.source = "live";
    const onMute = vi.fn();
    const { container } = render(
      <PlaceMixer
        room={room}
        mode="host"
        currentUserId={room.host.id}
        view="volumes"
        onView={vi.fn()}
        onGain={vi.fn()}
        onMute={onMute}
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
        onTogglePlayback={vi.fn()}
      />,
    );
    const music = screen.getByText("Musique", { selector: ".place-volume-row__identity strong" }).closest(".place-volume-row")!;
    const master = screen.getByText("Master", { selector: ".place-volume-row__identity strong" }).closest(".place-volume-row")!;
    const musicMute = within(music as HTMLElement).getByRole("button", { name: "Couper le son" });
    const masterMute = within(master as HTMLElement).getByRole("button", { name: "Couper le son" });
    expect(musicMute).toBeEnabled();
    expect(masterMute).toBeEnabled();
    fireEvent.click(musicMute);
    fireEvent.click(masterMute);
    expect(onMute).toHaveBeenCalledWith(room.channels.find((channel) => channel.kind === "audio")?.id);
    expect(onMute).toHaveBeenCalledWith(room.channels.find((channel) => channel.kind === "master")?.id);
    expect(container.querySelector(".place-volume-list")).toBeInTheDocument();
  });

  it("affiche le micro coupé plutôt qu’un cadenas pour un invité coupé par le Host", () => {
    const room = createPlaceDemoState();
    room.channels = room.channels.map((channel) => channel.id === "guest-lior"
      ? { ...channel, isHostForcedMuted: true }
      : channel);
    render(
      <PlaceMixer room={room} mode="host" currentUserId={room.host.id} view="volumes" onView={vi.fn()} onGain={vi.fn()} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()} pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }} localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false} nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null} onPitchProvider={vi.fn()} onRefreshPlugins={vi.fn()} onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()} />,
    );

    const mute = screen.getByRole("button", { name: "Autoriser le micro à l’antenne" });
    expect(mute.querySelector(".lucide-mic-off")).toBeInTheDocument();
    expect(mute.querySelector(".lucide-lock")).not.toBeInTheDocument();
  });

  it("distingue l’auto-mute d’une invitée du mute piloté par le Host", () => {
    const room = createPlaceDemoState();
    room.channels = room.channels.map((channel) => channel.id === "guest-solis"
      ? { ...channel, level: 0, isMuted: true, isSelfMuted: true, signalState: "muted" as const }
      : channel);
    render(
      <PlaceMixer room={room} mode="host" currentUserId={room.host.id} view="volumes" onView={vi.fn()} onGain={vi.fn()} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()} pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }} localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false} nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null} onPitchProvider={vi.fn()} onRefreshPlugins={vi.fn()} onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()} />,
    );

    const solis = screen.getByText("Solis", { selector: ".place-volume-row__identity strong" }).closest(".place-volume-row");
    expect(solis).not.toBeNull();
    const mute = within(solis as HTMLElement).getByRole("button", { name: "Couper le micro à l’antenne" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    expect(mute.querySelector(".lucide-mic")).toBeInTheDocument();
    expect(mute.querySelector(".lucide-mic-off")).not.toBeInTheDocument();
  });

  it("éteint tous les vumètres quand le Master est coupé sans déplacer les faders", () => {
    const room = createPlaceDemoState();
    room.channels = room.channels.map((channel) => channel.kind === "master"
      ? { ...channel, isMuted: true, signalState: "muted" as const }
      : channel);
    render(
      <PlaceMixer room={room} mode="host" currentUserId={room.host.id} view="volumes" onView={vi.fn()} onGain={vi.fn()} onMute={vi.fn()} onCamera={vi.fn()} onVocal={vi.fn()} onTune={vi.fn()} pitchProvider="none" pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }} localAudioStatus="idle" localAudioError={null} pluginInventory={[]} pluginsRefreshing={false} nativePluginStatus="idle" nativePluginAudioReady={false} nativePluginError={null} onPitchProvider={vi.fn()} onRefreshPlugins={vi.fn()} onRemoveNativePlugin={vi.fn()} onToggleMonitoring={vi.fn()} />,
    );

    const voice = screen.getByText("Ma voix", { selector: ".place-volume-row__identity strong" }).closest<HTMLElement>(".place-volume-row")!;
    expect(voice.style.getPropertyValue("--meter-level")).toBe("0%");
    expect(within(voice).getByRole("slider", { name: "Volume de Ma voix" })).toHaveValue(String(room.channels.find((channel) => channel.id === "host-mic")!.gain));
  });

  it("place une commande caméra à côté du mute pour chaque voix", () => {
    const onCamera = vi.fn();
    const fixture = createPlaceDemoState();
    render(<PersistentMixer onCamera={onCamera} />);

    const ownCamera = screen.getByRole("button", { name: "Couper ma caméra" });
    const liorCamera = screen.getByRole("button", { name: "Couper la caméra de Lior" });
    expect(screen.getByRole("button", { name: "Couper la caméra de Malik" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Couper la caméra de Solis" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Ouvrir les effets de Ma voix/ })).not.toBeInTheDocument();

    fireEvent.click(ownCamera);
    fireEvent.click(liorCamera);

    expect(onCamera).toHaveBeenNthCalledWith(1, fixture.host.id, false);
    expect(onCamera).toHaveBeenNthCalledWith(2, fixture.participants.find((participant) => participant.id === "guest-a")?.profile.id, false);
  });

  it("keeps six source faders, the compact player and the Master fader in the no-scroll contract", () => {
    const { container } = render(<SixFaderMixer />);
    const sourceList = container.querySelector(".place-volume-list")!;
    const masterDock = container.querySelector(".place-master-dock")!;

    expect(sourceList.querySelectorAll('.place-volume-row input[type="range"]')).toHaveLength(6);
    expect(masterDock.querySelectorAll('.place-volume-row input[type="range"]')).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Lecteur audio du Mixeur" })).toBeInTheDocument();
  });

  it("keeps the compact coverless player visible while preserving the cover chooser", async () => {
    render(<PersistentMixer />);

    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    expect(within(player).getByText("Aucun son chargé")).toBeVisible();
    expect(within(player).getByRole("button", { name: "Lecture indisponible" })).toBeDisabled();
    const upload = within(player).getByRole("button", { name: "Importer un son" });
    expect(upload).toBeVisible();
    expect(within(player).getByRole("slider", { name: "Progression indisponible" })).toBeDisabled();
    expect(player.querySelector(".place-mixer-audio__art")).not.toBeInTheDocument();
    expect(player.querySelectorAll(".place-mixer-audio__waveform-bars > i")).toHaveLength(0);
    expect(within(player).getByText("Forme d’onde en attente")).toBeVisible();
    expect(within(player).queryByText("Lecture")).not.toBeInTheDocument();
    expect(within(player).queryByText("Point de retour")).not.toBeInTheDocument();
    expect(within(player).queryByText("--:--.---")).not.toBeInTheDocument();

    fireEvent.click(upload);
    const sources = within(player).getByRole("menu", { name: "Choisir la source" });
    expect(within(sources).getByRole("menuitem", { name: "Depuis mon appareil" })).toBeVisible();
    expect(within(sources).getByRole("menuitem", { name: "Depuis ma médiathèque" })).toBeVisible();
    expect(within(sources).getByRole("menuitem", { name: "Depuis mes setlists" })).toBeVisible();
    fireEvent.click(within(sources).getByRole("menuitem", { name: "Choisir une cover" }));

    const coverWall = within(player).getByRole("listbox", { name: "Collection de douze covers" });
    expect(within(coverWall).getAllByRole("option")).toHaveLength(12);
    fireEvent.click(within(coverWall).getByRole("option", { name: "Cover 7" }));

    const reopenedSources = within(player).getByRole("menu", { name: "Choisir la source" });
    expect(reopenedSources).toBeVisible();
    expect(reopenedSources.querySelector<HTMLImageElement>(".place-mixer-audio__cover-picker img")?.src).toContain(PLACE_MIXER_FALLBACK_COVERS[6]);
    const fileInput = player.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, {
      target: { files: [new File(["cover"], "Son avec cover.wav", { type: "audio/wav" })] },
    });
    expect(within(player).getByText("Son avec cover")).toBeVisible();
    await waitFor(() => expect(player.querySelectorAll(".place-mixer-audio__waveform-bars > i")).toHaveLength(120));
    const waveformBars = Array.from(player.querySelectorAll<HTMLElement>(".place-mixer-audio__waveform-bars > i"));
    const waveformHeights = waveformBars.map((bar) => bar.style.getPropertyValue("--waveform-height"));
    expect(waveformBars).toHaveLength(120);
    expect(new Set(waveformHeights).size).toBeGreaterThan(40);
    expect(waveformHeights[0]).toBe("100%");
    expect(waveformHeights[waveformHeights.length - 1]).toBe("50%");
    expect(waveformBars.filter((bar) => bar.classList.contains("is-played"))).toHaveLength(0);
    expect(player.querySelector(".place-mixer-audio__art")).not.toBeInTheDocument();
  });

  it("keeps the waveform neutral ahead of the real playhead", async () => {
    render(<PersistentMixer />);

    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    fireEvent.click(within(player).getByRole("button", { name: "Importer un son" }));
    fireEvent.click(within(player).getByRole("menuitem", { name: "Depuis ma médiathèque" }));
    fireEvent.click(screen.getByRole("button", { name: /Hazy After Hours — version de répétition/ }));

    await waitFor(() => expect(player.querySelectorAll(".place-mixer-audio__waveform-bars > i")).toHaveLength(120));
    const bars = Array.from(player.querySelectorAll<HTMLElement>(".place-mixer-audio__waveform-bars > i"));
    expect(bars.filter((bar) => bar.classList.contains("is-played"))).toHaveLength(0);

    fireEvent.change(within(player).getByRole("slider", { name: "Progression de Hazy After Hours" }), {
      target: { value: "0.25" },
    });

    expect(bars.filter((bar) => bar.classList.contains("is-played"))).toHaveLength(30);
    expect(bars[29]).toHaveClass("is-played");
    expect(bars[30]).not.toHaveClass("is-played");
  });

  it("ignore une analyse URL tardive quand une autre piste est déjà active", async () => {
    type AudioResponse = { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> };
    let resolveHazy!: (response: AudioResponse) => void;
    let resolveTech!: (response: AudioResponse) => void;
    const hazyResponse = new Promise<AudioResponse>((resolve) => { resolveHazy = resolve; });
    const techResponse = new Promise<AudioResponse>((resolve) => { resolveTech = resolve; });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const source = String(input);
      if (source.includes("hazy-after-hours")) return hazyResponse;
      if (source.includes("tech-house-vibes")) return techResponse;
      return Promise.resolve({ ok: true, arrayBuffer: async () => Uint8Array.of(1).buffer });
    });
    const decodeMock = vi.fn(async (data: ArrayBuffer) => {
      const amplitude = (new Uint8Array(data)[0] ?? 0) / 10;
      const channels = [
        new Float32Array(120).fill(-amplitude),
        new Float32Array(120).fill(amplitude),
      ];
      return {
        duration: 3,
        numberOfChannels: channels.length,
        sampleRate: 48_000,
        getChannelData: (index: number) => channels[index],
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", class {
      decodeAudioData = decodeMock;
      async close() {}
    });

    render(<PersistentMixer />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    fireEvent.click(within(player).getByRole("button", { name: "Importer un son" }));
    fireEvent.click(within(player).getByRole("menuitem", { name: "Depuis ma médiathèque" }));
    fireEvent.click(screen.getByRole("button", { name: /Hazy After Hours — version de répétition/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("hazy-after-hours")));

    fireEvent.click(within(player).getByRole("button", { name: "Importer un son" }));
    fireEvent.click(within(player).getByRole("menuitem", { name: "Depuis ma médiathèque" }));
    fireEvent.click(screen.getByRole("button", { name: /Tech House Vibes — master de scène/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("tech-house-vibes")));

    resolveTech({ ok: true, arrayBuffer: async () => Uint8Array.of(8).buffer });
    await waitFor(() => expect(
      player.querySelector<HTMLElement>(".place-mixer-audio__waveform-bars > i")?.style.getPropertyValue("--waveform-height"),
    ).toBe("80%"));

    resolveHazy({ ok: true, arrayBuffer: async () => Uint8Array.of(2).buffer });
    await waitFor(() => expect(decodeMock).toHaveBeenCalledTimes(2));
    expect(player.querySelector<HTMLElement>(".place-mixer-audio__waveform-bars > i")?.style.getPropertyValue("--waveform-height")).toBe("80%");
  });

  it("keeps one persistent local playlist while switching every Mixer sub-view", () => {
    const { container, unmount } = render(<PersistentMixer />);
    const initialAudio = container.querySelector("audio");
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(initialAudio).not.toBeNull();
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveAttribute("multiple");
    expect(screen.getByRole("button", { name: "Lecture indisponible" })).toBeDisabled();

    fireEvent.change(fileInput!, {
      target: {
        files: [
          new File(["one"], "Session principale.wav", { type: "audio/wav" }),
          new File(["two"], "Rappel scène.mp3", { type: "audio/mpeg" }),
        ],
      },
    });

    expect(screen.getByText("Session principale")).toBeVisible();
    const previous = screen.getByRole("button", { name: "Piste précédente" });
    const next = screen.getByRole("button", { name: "Piste suivante" });
    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(screen.getByText("Rappel scène")).toBeVisible();
    fireEvent.click(next);
    expect(screen.getByText("Session principale")).toBeVisible();
    fireEvent.click(previous);
    expect(screen.getByText("Rappel scène")).toBeVisible();
    expect(container.querySelectorAll("audio")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "FX voix" }));
    expect(screen.getByText("Rappel scène")).toBeVisible();
    expect(container.querySelector("audio")).toBe(initialAudio);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Pads" }));
    expect(screen.getByText("Rappel scène")).toBeVisible();
    expect(container.querySelector("audio")).toBe(initialAudio);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("réserve précédent et suivant à la navigation entre plusieurs sons", () => {
    const { container } = render(<PersistentMixer />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["one"], "Session unique.wav", { type: "audio/wav" })],
      },
    });

    const previous = screen.getByRole("button", { name: "Piste précédente" });
    const next = screen.getByRole("button", { name: "Piste suivante" });
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "Playlist du Mixeur" })).not.toBeInTheDocument();
  });

  it("seeks on the waveform and keeps only the reference controls", () => {
    const { container } = render(<PersistentMixer />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    const fileInput = player.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["one"], "Titre complet de la répétition finale.wav", { type: "audio/wav" })],
      },
    });

    expect(within(player).getByText("Titre complet de la répétition finale")).toBeVisible();
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: 180 });
    fireEvent.loadedMetadata(audio);

    const progression = within(player).getByRole("slider", { name: "Progression de Titre complet de la répétition finale" });
    const cue = within(player).getByRole("slider", { name: "Point de reprise de Titre complet de la répétition finale" });
    expect(within(player).getAllByRole("slider")).toHaveLength(2);
    expect(within(player).getByText("Lecture")).toBeVisible();
    expect(within(player).queryByText("Point de retour")).not.toBeInTheDocument();
    fireEvent.change(progression, { target: { value: "0.5" } });
    expect(audio.currentTime).toBe(90);
    expect(progression).toHaveAttribute("aria-valuetext", "1:30 sur 3:00");
    fireEvent.change(cue, { target: { value: "0.25" } });
    expect(audio.currentTime).toBe(90);
    expect((player.querySelector(".place-mixer-audio__waveform") as HTMLElement).style.getPropertyValue("--cue-progress")).toBe("25%");
    fireEvent.click(within(player).getByRole("button", { name: "Revenir au curseur à 0:45" }));
    expect(audio.currentTime).toBe(45);
    expect(progression).toHaveValue("0.25");
    fireEvent.change(progression, { target: { value: "0.1" } });
    expect(audio.currentTime).toBe(18);
    fireEvent.click(within(player).getByRole("button", { name: "Revenir au curseur à 0:45" }));
    expect(audio.currentTime).toBe(45);
    expect(within(player).queryByRole("checkbox", { name: "Activer le chronomètre" })).not.toBeInTheDocument();

    fireEvent.click(within(player).getByRole("button", { name: "Options de lecture" }));
    const modeMenu = within(player).getByRole("menu", { name: "Mode de lecture" });
    expect(within(modeMenu).getByRole("menuitemradio", { name: "Lecture dans l’ordre" })).toHaveAttribute("aria-checked", "true");
    expect(within(modeMenu).getByRole("menuitemradio", { name: "Lecture aléatoire" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(within(modeMenu).getByRole("menuitemradio", { name: "Lecture en boucle" }));
    expect(audio).toHaveAttribute("loop");
    expect(within(player).queryByRole("menu", { name: "Mode de lecture" })).not.toBeInTheDocument();
    fireEvent.click(within(player).getByRole("button", { name: "Options de lecture" }));
    expect(within(player).getByRole("menuitemradio", { name: "Lecture en boucle" })).toHaveAttribute("aria-checked", "true");
    expect(within(player).queryByRole("button", { name: "Ouvrir la file de lecture" })).not.toBeInTheDocument();
  });

  it("applique l’ordre et l’aléatoire à la fin d’un son sans rejouer le son courant", () => {
    const { container } = render(<PersistentMixer />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    const fileInput = player.querySelector<HTMLInputElement>('input[type="file"]')!;
    const audio = container.querySelector("audio")!;

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["one"], "Premier.wav", { type: "audio/wav" }),
          new File(["two"], "Deuxième.wav", { type: "audio/wav" }),
          new File(["three"], "Troisième.wav", { type: "audio/wav" }),
        ],
      },
    });

    fireEvent.ended(audio);
    expect(within(player).getByText("Deuxième")).toBeVisible();

    fireEvent.click(within(player).getByRole("button", { name: "Options de lecture" }));
    fireEvent.click(within(player).getByRole("menuitemradio", { name: "Lecture aléatoire" }));
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    fireEvent.ended(audio);
    expect(within(player).getByText("Premier")).toBeVisible();
    random.mockRestore();
  });

  it("ouvre la playlist depuis Musique et permet de réordonner puis supprimer les imports", () => {
    render(<PersistentMixer />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    const fileInput = player.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["one"], "Session principale.wav", { type: "audio/wav" }),
          new File(["two"], "Rappel scène.mp3", { type: "audio/mpeg" }),
        ],
      },
    });

    const musicRow = screen.getByText("Musique", { selector: ".place-volume-row__identity strong" }).closest(".place-volume-row")!;
    fireEvent.click(within(musicRow as HTMLElement).getByRole("button", { name: "Gérer la playlist" }));

    const playlist = screen.getByRole("dialog", { name: "Playlist du Mixeur" });
    expect(within(playlist).getByRole("button", { name: "Lire Session principale" })).toBeVisible();
    expect(within(playlist).getByRole("button", { name: "Lire Rappel scène" })).toBeVisible();

    fireEvent.click(within(playlist).getByRole("button", { name: "Descendre Session principale" }));
    expect(Array.from(playlist.querySelectorAll(".place-mixer-audio-queue-row strong"), (node) => node.textContent)).toEqual([
      "Rappel scène",
      "Session principale",
    ]);

    fireEvent.click(within(playlist).getByRole("button", { name: "Supprimer Session principale" }));
    expect(within(playlist).queryByRole("button", { name: "Lire Session principale" })).not.toBeInTheDocument();
    expect(within(playlist).getByRole("button", { name: "Ajouter des sons" })).toBeVisible();
  });

  it("affiche uniquement le titre dynamique de la piste dans le lecteur", async () => {
    render(<PersistentMixer />);
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });

    fireEvent.click(within(player).getByRole("button", { name: "Importer un son" }));
    fireEvent.click(within(player).getByRole("menuitem", { name: "Depuis ma médiathèque" }));
    fireEvent.click(await screen.findByText("Tech House Vibes — master de scène", { exact: true }));

    expect(within(player).getByText("Tech House Vibes", { exact: true })).toBeVisible();
    expect(within(player).queryByText("Maya Nox", { exact: true })).not.toBeInTheDocument();
    expect(within(player).queryByText("Master de scène", { exact: true })).not.toBeInTheDocument();
    expect(player.querySelector(".place-mixer-audio__meta small")).toBeNull();
    expect(player.querySelector(".place-mixer-audio__label")).toBeNull();
    expect(player.querySelector(".place-mixer-audio__header")).toBeNull();
    expect(player.querySelector(".place-mixer-audio__actions")).toBeNull();
    expect(player.querySelector(".place-mixer-audio__art")).toBeNull();
    expect(within(player).getByRole("slider", { name: "Progression de Tech House Vibes" })).toBeVisible();
    expect(within(player).queryByRole("slider", { name: "Progression de Tech House Vibes — master de scène" })).not.toBeInTheDocument();
    expect(within(player).getByRole("button", { name: "Importer un son" })).toBeVisible();
    expect(within(player).queryByText("Lecteur", { exact: true })).not.toBeInTheDocument();
    expect(within(player).queryByText("Chronomètre", { exact: true })).not.toBeInTheDocument();
  });
});
