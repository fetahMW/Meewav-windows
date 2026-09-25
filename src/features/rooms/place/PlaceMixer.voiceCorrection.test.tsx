import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixer from "./PlaceMixer";
import type { PlacePitchProvider } from "./place.types";
import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";

const runtimeMode = vi.hoisted(() => ({ desktop: false }));
vi.mock("../../../runtime/RuntimeProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../runtime/RuntimeProvider")>();
  return { ...actual, useRuntime: () => ({ ...actual.WEB_CAPABILITIES, isDesktop: runtimeMode.desktop }) };
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  runtimeMode.desktop = false;
});

beforeEach(() => {
  vi.stubEnv("MODE", "audio-lab");
});

it("Desktop exposes Android's two compact FX cards and keeps the existing controls wired", () => {
  runtimeMode.desktop = true;
  const onVocal = vi.fn();
  const { onTune, room } = renderMixer("meewav_test", vi.fn(), onVocal, [], (state) => {
    state.personalVocal.reverbEnabled = true;
  });
  expect(screen.getByRole("region", { name: "Autotune simple" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Réverbération simple" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Plugins du PC" })).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "Clé" }));
  fireEvent.click(screen.getByRole("option", { name: "D#" }));
  expect(onTune).toHaveBeenCalledWith("D#", room.personalVocal.tuneScale);
  fireEvent.change(screen.getByRole("slider", { name: "Mix réverb" }), { target: { value: "0.4" } });
  expect(onVocal).toHaveBeenCalledWith({ reverbAmount: .4, reverbEnabled: true, enabled: true });
  fireEvent.click(screen.getByRole("button", { name: "Pro", exact: true }));
  expect(screen.getByRole("button", { name: "Plugins du PC" })).toBeVisible();
});

function renderMixer(
  pitchProvider: PlacePitchProvider,
  onPitchProvider = vi.fn(),
  onVocal = vi.fn(),
  pluginInventory: AudioEnginePlugin[] = [],
  configureRoom?: (room: ReturnType<typeof createPlaceDemoState>) => void,
  runtime: Partial<Pick<Parameters<typeof PlaceMixer>[0], "pitchCorrection" | "nativePluginStatus" | "nativePluginAudioReady">> = {},
) {
  const room = createPlaceDemoState();
  const onTune = vi.fn();
  const onRefreshPlugins = vi.fn();
  configureRoom?.(room);
  return {
    room,
    onPitchProvider,
    onTune,
    onRefreshPlugins,
    ...render(
      <PlaceMixer
        room={room}
        mode="host"
        currentUserId={room.host.id}
        view="voice_fx"
        onView={vi.fn()}
        onGain={vi.fn()}
        onMute={vi.fn()}
        onCamera={vi.fn()}
        onVocal={onVocal}
        onTune={onTune}
        pitchProvider={pitchProvider}
        pitchCorrection={runtime.pitchCorrection ?? { available: false, active: false, adapterId: null, reason: null }}
        localAudioStatus="idle"
        localAudioError={null}
        pluginInventory={pluginInventory}
        pluginsRefreshing={false}
        nativePluginStatus={runtime.nativePluginStatus ?? "idle"}
        nativePluginAudioReady={runtime.nativePluginAudioReady ?? false}
        nativePluginError={null}
        onPitchProvider={onPitchProvider}
        onRefreshPlugins={onRefreshPlugins}
        onRemoveNativePlugin={vi.fn()}
        onToggleMonitoring={vi.fn()}
        onTogglePlayback={vi.fn()}
      />,
    ),
  };
}

function readyPlugin(id: AudioEnginePlugin["id"], name: string, vendor: string): AudioEnginePlugin {
  return {
    id,
    name,
    vendor,
    version: "test",
    format: "vst3",
    status: "ready",
    licensed: true,
    hasEditor: true,
    latencySamples: 0,
    capabilities: ["pitch_correction"],
  };
}

function SwitchingMixer() {
  const room = createPlaceDemoState();
  const [provider, setProvider] = useState<PlacePitchProvider>("opendaw");
  return (
    <PlaceMixer
      room={room}
      mode="host"
      currentUserId={room.host.id}
      view="voice_fx"
      onView={vi.fn()}
      onGain={vi.fn()}
      onMute={vi.fn()}
      onCamera={vi.fn()}
      onVocal={vi.fn()}
      onTune={vi.fn()}
      pitchProvider={provider}
      pitchCorrection={{ available: provider === "opendaw" || provider === "meewav_test", active: true, adapterId: provider, reason: null }}
      localAudioStatus="monitoring"
      localAudioError={null}
      pluginInventory={[
        readyPlugin("antares.autotune", "Auto-Tune Pro", "Antares"),
        readyPlugin("sixthsample.spoton", "Spoton", "Sixth Sample"),
        readyPlugin("auburnsounds.graillon3", "Graillon 3", "Auburn Sounds"),
      ]}
      pluginsRefreshing={false}
      nativePluginStatus={provider === "antares.autotune" || provider === "sixthsample.spoton" || provider === "auburnsounds.graillon3" ? "running" : "idle"}
      nativePluginAudioReady={provider === "antares.autotune" || provider === "sixthsample.spoton" || provider === "auburnsounds.graillon3"}
      nativePluginError={null}
      onPitchProvider={(nextProvider) => {
        setProvider(nextProvider);
        return true;
      }}
      onRefreshPlugins={vi.fn()}
      onRemoveNativePlugin={vi.fn()}
      onToggleMonitoring={vi.fn()}
      onTogglePlayback={vi.fn()}
    />
  );
}

function ErrorRecoveryMixer() {
  const room = createPlaceDemoState();
  const [provider, setProvider] = useState<PlacePitchProvider>("none");
  return (
    <>
      <button type="button" onClick={() => setProvider("opendaw")}>Changer le moteur</button>
      <PlaceMixer
        room={room}
        mode="host"
        currentUserId={room.host.id}
        view="voice_fx"
        onView={vi.fn()}
        onGain={vi.fn()}
        onMute={vi.fn()}
        onCamera={vi.fn()}
        onVocal={vi.fn()}
        onTune={vi.fn()}
        pitchProvider={provider}
        pitchCorrection={{ available: false, active: false, adapterId: null, reason: null }}
        localAudioStatus="idle"
        localAudioError={null}
        pluginInventory={[]}
        pluginsRefreshing={false}
        nativePluginStatus="idle"
        nativePluginAudioReady={false}
        nativePluginError={null}
        onPitchProvider={async () => false}
        onRefreshPlugins={vi.fn()}
        onRemoveNativePlugin={vi.fn()}
        onToggleMonitoring={vi.fn()}
        onTogglePlayback={vi.fn()}
      />
    </>
  );
}

function PendingRecoveryMixer({
  onPitchProvider,
  onVocal,
}: {
  onPitchProvider: Parameters<typeof PlaceMixer>[0]["onPitchProvider"];
  onVocal: Parameters<typeof PlaceMixer>[0]["onVocal"];
}) {
  const room = createPlaceDemoState();
  const [provider, setProvider] = useState<PlacePitchProvider>("none");
  return (
    <>
      <button type="button" onClick={() => setProvider("opendaw")}>Basculer pendant le démarrage</button>
      <PlaceMixer
        room={room}
        mode="host"
        currentUserId={room.host.id}
        view="voice_fx"
        onView={vi.fn()}
        onGain={vi.fn()}
        onMute={vi.fn()}
        onCamera={vi.fn()}
        onVocal={onVocal}
        onTune={vi.fn()}
        pitchProvider={provider}
        pitchCorrection={{ available: provider === "opendaw", active: provider === "opendaw", adapterId: provider === "opendaw" ? provider : null, reason: null }}
        localAudioStatus="idle"
        localAudioError={null}
        pluginInventory={[]}
        pluginsRefreshing={false}
        nativePluginStatus="idle"
        nativePluginAudioReady={false}
        nativePluginError={null}
        onPitchProvider={onPitchProvider}
        onRefreshPlugins={vi.fn()}
        onRemoveNativePlugin={vi.fn()}
        onToggleMonitoring={vi.fn()}
        onTogglePlayback={vi.fn()}
      />
    </>
  );
}

function ControlledKeyboardMixer({ onVocal }: { onVocal: Parameters<typeof PlaceMixer>[0]["onVocal"] }) {
  const [room, setRoom] = useState(() => createPlaceDemoState());
  const applyVocal = (patch: Partial<typeof room.personalVocal>) => {
    onVocal(patch);
    setRoom((current) => ({
      ...current,
      personalVocal: { ...current.personalVocal, ...patch },
    }));
  };
  return (
    <PlaceMixer
      room={room}
      mode="host"
      currentUserId={room.host.id}
      view="voice_fx"
      onView={vi.fn()}
      onGain={vi.fn()}
      onMute={vi.fn()}
      onCamera={vi.fn()}
      onVocal={applyVocal}
      onTune={vi.fn()}
      pitchProvider="opendaw"
      pitchCorrection={{ available: true, active: true, adapterId: "opendaw", reason: null }}
      localAudioStatus="monitoring"
      localAudioError={null}
      pluginInventory={[]}
      pluginsRefreshing={false}
      nativePluginStatus="idle"
      nativePluginAudioReady={false}
      nativePluginError={null}
      onPitchProvider={async () => true}
      onRefreshPlugins={vi.fn()}
      onRemoveNativePlugin={vi.fn()}
      onToggleMonitoring={vi.fn()}
      onTogglePlayback={vi.fn()}
    />
  );
}

function FreshRoomActivationMixer({
  onStart,
  onVocal,
}: {
  onStart: (provider: PlacePitchProvider) => Promise<boolean>;
  onVocal: Parameters<typeof PlaceMixer>[0]["onVocal"];
}) {
  const [room, setRoom] = useState(() => createPlaceDemoState());
  const [provider, setProvider] = useState<PlacePitchProvider>("none");
  const [adapterAvailable, setAdapterAvailable] = useState(false);
  const applyVocal = (patch: Partial<typeof room.personalVocal>) => {
    onVocal(patch);
    setRoom((current) => ({
      ...current,
      personalVocal: { ...current.personalVocal, ...patch },
    }));
  };
  return (
    <PlaceMixer
      room={room}
      mode="host"
      currentUserId={room.host.id}
      view="voice_fx"
      onView={vi.fn()}
      onGain={vi.fn()}
      onMute={vi.fn()}
      onCamera={vi.fn()}
      onVocal={applyVocal}
      onTune={vi.fn()}
      pitchProvider={provider}
      pitchCorrection={{
        available: adapterAvailable,
        active: adapterAvailable,
        adapterId: adapterAvailable ? "meewav.pitch-correction.experimental.v1" : null,
        reason: null,
      }}
      localAudioStatus={adapterAvailable ? "ready" : "idle"}
      localAudioError={null}
      pluginInventory={[]}
      pluginsRefreshing={false}
      nativePluginStatus="idle"
      nativePluginAudioReady={false}
      nativePluginError={null}
      onPitchProvider={async (nextProvider) => {
        const started = await onStart(nextProvider);
        if (started) {
          setProvider(nextProvider);
          setAdapterAvailable(true);
        }
        return started;
      }}
      onRefreshPlugins={vi.fn()}
      onRemoveNativePlugin={vi.fn()}
      onToggleMonitoring={vi.fn()}
      onTogglePlayback={vi.fn()}
    />
  );
}

function PendingRoomChangeMixer({
  onPitchProvider,
  onVocal,
}: {
  onPitchProvider: Parameters<typeof PlaceMixer>[0]["onPitchProvider"];
  onVocal: Parameters<typeof PlaceMixer>[0]["onVocal"];
}) {
  const [room, setRoom] = useState(() => createPlaceDemoState());
  return (
    <>
      <button type="button" onClick={() => setRoom((current) => ({ ...current, id: `${current.id}-next` }))}>
        Changer de Room
      </button>
      <PlaceMixer
        room={room}
        mode="host"
        currentUserId={room.host.id}
        view="voice_fx"
        onView={vi.fn()}
        onGain={vi.fn()}
        onMute={vi.fn()}
        onCamera={vi.fn()}
        onVocal={onVocal}
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
        onPitchProvider={onPitchProvider}
        onRefreshPlugins={vi.fn()}
        onRemoveNativePlugin={vi.fn()}
        onToggleMonitoring={vi.fn()}
        onTogglePlayback={vi.fn()}
      />
    </>
  );
}

describe("PlaceMixer Autotune", () => {
  const openEngines = () => {
    const autotune = screen.getByRole("button", { name: "Autotune" });
    if (autotune.getAttribute("aria-expanded") !== "true") fireEvent.click(autotune);
    fireEvent.click(screen.getByRole("combobox", { name: "Moteur Autotune" }));
  };
  const openPlugins = () => fireEvent.click(screen.getByRole("button", { name: "Plugins du PC" }));
  const openAutotune = () => fireEvent.click(screen.getByRole("button", { name: "Autotune" }));

  it("uses the shared premium tooltip for headphone effects", () => {
    renderMixer("none");

    const trigger = screen.getByRole("button", { name: "Activer les effets dans mon casque" });
    expect(trigger).not.toHaveAttribute("title");

    fireEvent.focus(trigger);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Ta voix reste audible : ce bouton ajoute uniquement les effets.");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("keeps the openDAW experiment hidden while its Room flag is disabled", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "false");

    renderMixer("none");
    openEngines();

    expect(screen.queryByRole("option", { name: /Autotune openDAW/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Autotune MeeWav/i })).toBeVisible();
  });

  it("offers openDAW behind the flag and emits the canonical provider", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    const onPitchProvider = vi.fn();
    renderMixer("none", onPitchProvider);
    openEngines();

    fireEvent.click(screen.getByRole("option", { name: /Autotune openDAW/i }));

    expect(onPitchProvider).toHaveBeenCalledWith("opendaw");
  });

  it("lists the available engines inside Autotune without a separate accordion", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    const onPitchProvider = vi.fn();
    const { room } = renderMixer("meewav_test", onPitchProvider, vi.fn(), [
      readyPlugin("auburnsounds.graillon3", "Graillon 3", "Auburn Sounds"),
      readyPlugin("antares.autotune", "Auto-Tune Pro", "Antares"),
      readyPlugin("sixthsample.spoton", "Spoton", "Sixth Sample"),
    ]);
    expect(screen.queryByRole("button", { name: "Moteur Autotune" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-section="engines"]')).toBeNull();
    openEngines();
    const trigger = screen.getByRole("combobox", { name: "Moteur Autotune" });
    expect(trigger).toHaveTextContent("Autotune MeeWav");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Autotune MeeWav", "Autotune openDAW", "Auto-Tune Pro", "Spoton", "Graillon 3",
    ]);
    expect(screen.getByRole("option", { name: "Autotune MeeWav" })).toHaveAttribute("aria-selected", "true");
    expect(room.personalVocal.tuneEnabled).toBe(false);
    expect(onPitchProvider).not.toHaveBeenCalled();
  });


  it("keeps the engine dropdown operable from the keyboard", async () => {
    const user = userEvent.setup();
    const onPitchProvider = vi.fn();
    renderMixer("none", onPitchProvider);
    openAutotune();
    const trigger = screen.getByRole("combobox", { name: "Moteur Autotune" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Enter}");
    expect(onPitchProvider).toHaveBeenCalledWith("meewav_test");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });


  it("limits Autotune to key, scale, retune speed and humanisation", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    renderMixer("opendaw");
    openAutotune();

    expect(screen.getByRole("slider", { name: "Vitesse de correction" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Humanisation" })).toBeVisible();
    expect(screen.queryByText("Intensité")).not.toBeInTheDocument();
    expect(screen.queryByText("Transposition")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Naturel" })).not.toBeInTheDocument();

    const scaleSelect = screen.getByRole("combobox", { name: "Gamme" });
    fireEvent.click(scaleSelect);
    const scaleOptions = within(screen.getByRole("listbox", { name: "Options Gamme" })).getAllByRole("option");
    expect(scaleOptions.map((option) => option.textContent)).toEqual([
      "Chromatique",
      "Majeure",
      "Mineure",
      "Pentatonique majeure",
      "Pentatonique mineure",
      "Blues",
      "Dorienne",
      "Mixolydienne",
    ]);
    const selectedScale = screen.getByRole("option", { name: "Mineure" });
    expect(selectedScale).toHaveAttribute("aria-selected", "true");
    expect(selectedScale.querySelector("svg")).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Majeure" }));
    expect(scaleSelect.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Majeure" }).id);
  });

  it("maps humanisation to both canonical humanize and openDAW smooth", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    const onVocal = vi.fn();
    renderMixer("opendaw", vi.fn(), onVocal);
    openAutotune();
    fireEvent.change(screen.getByRole("slider", { name: "Humanisation" }), { target: { value: "65" } });

    const patch = onVocal.mock.lastCall?.[0];
    expect(patch).toMatchObject({ tuneEnabled: true, enabled: true });
    expect(patch?.tuneHumanize).toBeCloseTo(0.63, 2);
    expect(patch?.tuneSmooth).toBeCloseTo(0.63, 2);
  });

  it("keeps the same canonical controls mounted while switching all engines", async () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    render(<SwitchingMixer />);
    openAutotune();
    const key = screen.getByRole("combobox", { name: "Tonalité" });
    const speed = screen.getByRole("slider", { name: "Vitesse de correction" });
    for (const [label, provider] of [
      ["Autotune MeeWav", "meewav_test"], ["Spoton", "sixthsample.spoton"],
      ["Graillon 3", "auburnsounds.graillon3"], ["Auto-Tune Pro", "antares.autotune"],
    ]) {
      openEngines();
      fireEvent.click(screen.getByRole("option", { name: label }));
      await waitFor(() => expect(document.querySelector(".place-autotune-controls")).toHaveAttribute("data-provider", provider));
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Moteur Autotune" })).toBeEnabled());
      expect(screen.getByRole("combobox", { name: "Tonalité" })).toBe(key);
      expect(screen.getByRole("slider", { name: "Vitesse de correction" })).toBe(speed);
      expect(screen.getByRole("button", { name: "Autotune" })).toHaveAttribute("aria-expanded", "true");
    }
    expect(screen.getByRole("slider", { name: "Humanisation" })).toBeEnabled();
  });


  it("keeps Humanisation visible but honest for native plugins without a compatible parameter", () => {
    renderMixer("sixthsample.spoton");
    openAutotune();

    expect(screen.getByRole("slider", { name: "Humanisation" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Humanisation" })).toBeDisabled();
    expect(screen.getByText(/ne publie pas de paramètre compatible/i)).toBeVisible();
  });

  it("provides one real dry comparison that removes every browser effect", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    const onVocal = vi.fn();
    renderMixer("opendaw", vi.fn(), onVocal);
    openAutotune();
    fireEvent.click(screen.getByRole("button", { name: "Son sec" }));

    expect(onVocal).toHaveBeenCalledWith({
      enabled: false,
      tuneEnabled: false,
      reverbEnabled: false,
      delayEnabled: false,
      eqEnabled: false,
      compEnabled: false,
    });
  });

  it("offers the integrated MeeWav engine from the real empty provider state", async () => {
    const onPitchProvider = vi.fn().mockResolvedValue(true);
    const onVocal = vi.fn();
    renderMixer("none", onPitchProvider, onVocal);
    openAutotune();

    expect(within(screen.getByRole("button", { name: "Autotune" })).getByText("Prêt à tester")).toBeVisible();
    expect(screen.queryByText(/Choisis un moteur/i)).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveTextContent("OFF");

    fireEvent.click(toggle);

    await waitFor(() => expect(onPitchProvider).toHaveBeenCalledWith("meewav_test"));
    expect(onVocal).toHaveBeenCalledWith(expect.objectContaining({ tuneEnabled: true, enabled: true }));
  });

  it("rerenders a fresh Room from OFF to ON only after the Web adapter is operational", async () => {
    const onStart = vi.fn().mockResolvedValue(true);
    const onVocal = vi.fn();
    render(<FreshRoomActivationMixer onStart={onStart} onVocal={onVocal} />);
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    expect(toggle).toHaveTextContent("OFF");

    fireEvent.click(toggle);

    await waitFor(() => expect(onStart).toHaveBeenCalledWith("meewav_test"));
    await waitFor(() => expect(toggle).toHaveTextContent("ON"));
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveClass("is-active");
    expect(onVocal).toHaveBeenCalledWith({ tuneEnabled: true, enabled: true });
  });

  it("keeps the Autotune action node stable while its accordion opens", () => {
    renderMixer("none");
    const toggle = document.querySelector<HTMLButtonElement>(".place-autotune-toggle")!;
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("hidden");
    expect(toggle).toBeDisabled();

    openAutotune();

    expect(document.querySelector(".place-autotune-toggle")).toBe(toggle);
    expect(toggle).not.toHaveAttribute("hidden");
    expect(toggle).toBeEnabled();
  });

  it("keeps Autotune OFF and announces the error when the integrated engine cannot start", async () => {
    const onPitchProvider = vi.fn().mockResolvedValue(false);
    const onVocal = vi.fn();
    renderMixer("none", onPitchProvider, onVocal);
    openAutotune();

    const trigger = screen.getByRole("button", { name: "Autotune" });
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    const status = document.getElementById("place-fx-accordion-autotune-status")!;
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(trigger).toHaveAttribute("aria-describedby", status.id);
    expect(toggle).toHaveAttribute("aria-describedby", status.id);
    expect(trigger).toHaveAccessibleDescription("Prêt à tester");
    expect(toggle).toHaveAccessibleDescription("Prêt à tester");

    fireEvent.click(toggle);

    await waitFor(() => expect(status).toHaveTextContent("Moteur indisponible"));
    expect(trigger).toHaveAccessibleDescription("Moteur indisponible");
    expect(toggle).toHaveAccessibleDescription("Moteur indisponible");
    expect(toggle).toHaveTextContent("OFF");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toBeEnabled();
    expect(onVocal).not.toHaveBeenCalled();
  });

  it("serializes engine startup and ignores a rapid second activation", async () => {
    let finishStart: ((started: boolean) => void) | undefined;
    const onPitchProvider = vi.fn(() => new Promise<boolean>((resolve) => {
      finishStart = resolve;
      document.querySelector<HTMLButtonElement>(".place-autotune-toggle")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }));
    renderMixer("none", onPitchProvider);
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });

    fireEvent.click(toggle);

    expect(onPitchProvider).toHaveBeenCalledTimes(1);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Ouverture…");

    finishStart?.(false);
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-busy", "false");
  });

  it("serializes rapid engine choices and disables the dropdown while pending", async () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    let finishSelection: ((started: boolean) => void) | undefined;
    const onPitchProvider = vi.fn(() => new Promise<boolean>((resolve) => {
      finishSelection = resolve;
      screen.getByRole("option", { name: "Autotune openDAW" })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }));
    renderMixer("none", onPitchProvider);
    openEngines();
    fireEvent.click(screen.getByRole("option", { name: "Autotune MeeWav" }));
    expect(onPitchProvider).toHaveBeenCalledTimes(1);
    expect(onPitchProvider).toHaveBeenCalledWith("meewav_test");
    const dropdown = screen.getByRole("combobox", { name: "Moteur Autotune" });
    expect(dropdown).toBeDisabled();
    expect(dropdown).toHaveAttribute("aria-expanded", "false");
    finishSelection?.(false);
    await waitFor(() => expect(dropdown).toBeEnabled());
  });


  it("restarts a selected Web engine when its correction adapter is unavailable", async () => {
    const onPitchProvider = vi.fn().mockResolvedValue(true);
    const onVocal = vi.fn();
    renderMixer("opendaw", onPitchProvider, onVocal, [], (room) => {
      room.personalVocal.tuneEnabled = true;
    });
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    expect(toggle).toHaveTextContent("OFF");

    fireEvent.click(toggle);

    await waitFor(() => expect(onPitchProvider).toHaveBeenCalledWith("opendaw"));
    expect(onVocal).toHaveBeenCalledWith({ tuneEnabled: true, enabled: true });
  });

  it("does not reactivate a selected Web engine when its restart fails", async () => {
    const onPitchProvider = vi.fn().mockResolvedValue(false);
    const onVocal = vi.fn();
    renderMixer("opendaw", onPitchProvider, onVocal, [], (room) => {
      room.personalVocal.tuneEnabled = true;
    });
    openAutotune();

    fireEvent.click(screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" }));

    await waitFor(() => expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Moteur indisponible"));
    expect(onPitchProvider).toHaveBeenCalledWith("opendaw");
    expect(onVocal).not.toHaveBeenCalled();
  });

  it("keeps a requested-but-inactive Web engine OFF and restarts it honestly", async () => {
    const onPitchProvider = vi.fn().mockResolvedValue(true);
    const onVocal = vi.fn();
    renderMixer("meewav_test", onPitchProvider, onVocal, [], (room) => {
      room.personalVocal.tuneEnabled = true;
    }, {
      pitchCorrection: {
        available: true,
        active: false,
        adapterId: "meewav.pitch-correction.experimental.v1",
        reason: "Traitement bypassé",
      },
    });
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    expect(toggle).toHaveTextContent("OFF");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    await waitFor(() => expect(onPitchProvider).toHaveBeenCalledWith("meewav_test"));
    expect(onVocal).toHaveBeenCalledWith({ tuneEnabled: true, enabled: true });
  });

  it("handles a rejected engine start without enabling Autotune", async () => {
    const onPitchProvider = vi.fn().mockRejectedValue(new Error("échec moteur"));
    const onVocal = vi.fn();
    renderMixer("none", onPitchProvider, onVocal);
    openAutotune();

    fireEvent.click(screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" }));

    await waitFor(() => expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Moteur indisponible"));
    expect(onVocal).not.toHaveBeenCalled();
  });

  it.each(["idle", "error"] as const)("restarts a selected native engine when its audio host is %s", async (nativePluginStatus) => {
    const onPitchProvider = vi.fn().mockResolvedValue(true);
    const onVocal = vi.fn();
    renderMixer("sixthsample.spoton", onPitchProvider, onVocal, [], (room) => {
      room.personalVocal.tuneEnabled = true;
    }, { nativePluginStatus, nativePluginAudioReady: false });
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    expect(toggle).toHaveTextContent("OFF");

    fireEvent.click(toggle);

    await waitFor(() => expect(onPitchProvider).toHaveBeenCalledWith("sixthsample.spoton"));
    expect(onVocal).toHaveBeenCalledWith({ tuneEnabled: true, enabled: true });
  });

  it("maps keyboard Home and Arrow keys through the visual pivots after each controlled rerender", async () => {
    const onVocal = vi.fn();
    render(<ControlledKeyboardMixer onVocal={onVocal} />);
    openAutotune();
    const speed = screen.getByRole("slider", { name: "Vitesse de correction" });
    const humanisation = screen.getByRole("slider", { name: "Humanisation" });
    expect(speed).toHaveAttribute("step", "1");
    expect(humanisation).toHaveAttribute("step", "1");

    fireEvent.keyDown(speed, { key: "Home" });
    await waitFor(() => expect(speed).toHaveAttribute("aria-valuenow", "0"));
    expect(onVocal.mock.lastCall?.[0].tuneSpeed).toBe(0);

    onVocal.mockClear();
    fireEvent.keyDown(speed, { key: "ArrowRight" });
    await waitFor(() => expect(speed).toHaveAttribute("aria-valuenow", "1"));
    expect(onVocal.mock.lastCall?.[0].tuneSpeed).toBeCloseTo(0.010456, 6);

    onVocal.mockClear();
    fireEvent.keyDown(speed, { key: "End" });
    await waitFor(() => expect(speed).toHaveAttribute("aria-valuenow", "100"));
    expect(onVocal.mock.lastCall?.[0].tuneSpeed).toBe(1);
  });

  it("commits Tonalité and Gamme from the custom listboxes", () => {
    const { onTune } = renderMixer("none");
    openAutotune();

    fireEvent.click(screen.getByRole("combobox", { name: "Tonalité" }));
    fireEvent.click(screen.getByRole("option", { name: "G" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Gamme" }));
    fireEvent.click(screen.getByRole("option", { name: "Majeure" }));

    expect(onTune).toHaveBeenNthCalledWith(1, "G", "Mineure");
    expect(onTune).toHaveBeenNthCalledWith(2, "F#", "Majeure");
  });

  it("keeps custom listboxes exclusive and dismisses them on outside click", () => {
    renderMixer("none");
    openAutotune();
    const keySelect = screen.getByRole("combobox", { name: "Tonalité" });
    const scaleSelect = screen.getByRole("combobox", { name: "Gamme" });

    fireEvent.click(keySelect);
    expect(keySelect).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);

    fireEvent.click(scaleSelect);
    expect(keySelect).toHaveAttribute("aria-expanded", "false");
    expect(scaleSelect).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);

    fireEvent.pointerDown(document.body);
    expect(scaleSelect).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports the full keyboard contract for custom Autotune listboxes", async () => {
    const user = userEvent.setup();
    const { onTune } = renderMixer("none");
    openAutotune();
    const keySelect = screen.getByRole("combobox", { name: "Tonalité" });
    const scaleSelect = screen.getByRole("combobox", { name: "Gamme" });

    keySelect.focus();
    await user.keyboard("{Enter}{ArrowDown}");
    expect(keySelect).toHaveAttribute("aria-expanded", "true");
    expect(keySelect.getAttribute("aria-activedescendant")).toMatch(/option-7$/);
    await user.keyboard("{Enter}");
    expect(onTune).toHaveBeenLastCalledWith("G", "Mineure");

    await user.keyboard(" ");
    await user.keyboard("{Home}{ArrowRight}{ArrowLeft}{ArrowUp}{Enter}");
    expect(onTune).toHaveBeenLastCalledWith("C", "Mineure");

    await user.keyboard(" ");
    await user.keyboard("{End}{Enter}");
    expect(onTune).toHaveBeenLastCalledWith("B", "Mineure");

    const callCount = onTune.mock.calls.length;
    await user.keyboard("{Enter}{Escape}");
    expect(keySelect).toHaveAttribute("aria-expanded", "false");
    expect(onTune).toHaveBeenCalledTimes(callCount);
    expect(keySelect).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.tab();
    expect(keySelect).toHaveAttribute("aria-expanded", "false");
    expect(scaleSelect).toHaveFocus();
  });

  it("clears a startup error when the selected provider changes externally", async () => {
    render(<ErrorRecoveryMixer />);
    openAutotune();
    fireEvent.click(screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" }));
    await waitFor(() => expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Moteur indisponible"));

    fireEvent.click(screen.getByRole("button", { name: "Changer le moteur" }));

    await waitFor(() => expect(screen.queryByText("Moteur indisponible")).not.toBeInTheDocument());
    expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Prêt à tester");
  });

  it("ignores a stale startup failure after an external provider switch", async () => {
    let finishStart: ((started: boolean) => void) | undefined;
    const onPitchProvider = vi.fn(() => new Promise<boolean>((resolve) => {
      finishStart = resolve;
    }));
    const onVocal = vi.fn();
    render(<PendingRecoveryMixer onPitchProvider={onPitchProvider} onVocal={onVocal} />);
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-busy", "true");

    fireEvent.click(screen.getByRole("button", { name: "Basculer pendant le démarrage" }));
    finishStart?.(false);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-busy", "false"));
    expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Prêt à tester");
    expect(screen.queryByText("Moteur indisponible")).not.toBeInTheDocument();
    expect(onVocal).not.toHaveBeenCalled();
  });

  it("invalidates an in-flight startup when the user enters another Room", async () => {
    let finishStart: ((started: boolean) => void) | undefined;
    const onPitchProvider = vi.fn(() => new Promise<boolean>((resolve) => {
      finishStart = resolve;
    }));
    const onVocal = vi.fn();
    render(<PendingRoomChangeMixer onPitchProvider={onPitchProvider} onVocal={onVocal} />);
    openAutotune();
    const toggle = screen.getByRole("button", { name: "Activer ou bypasser l’Autotune" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-busy", "true");

    fireEvent.click(screen.getByRole("button", { name: "Changer de Room" }));
    finishStart?.(true);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-busy", "false"));
    expect(toggle).toHaveTextContent("OFF");
    expect(document.getElementById("place-fx-accordion-autotune-status")).toHaveTextContent("Prêt à tester");
    expect(onVocal).not.toHaveBeenCalled();
  });

  it("keeps the reverb accessible and reactivatable even without an Autotune engine", () => {
    const onVocal = vi.fn();
    const { room } = renderMixer("none", vi.fn(), onVocal);

    fireEvent.click(screen.getByRole("button", { name: "Effets voix" }));

    expect(screen.getAllByText("Réverb").length).toBeGreaterThan(0);
    expect(screen.getByRole("slider", { name: "Mix réverb" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: room.personalVocal.reverbEnabled ? "Désactiver Réverb" : "Activer Réverb" }));

    expect(onVocal).toHaveBeenCalledWith(expect.objectContaining({
      reverbEnabled: !room.personalVocal.reverbEnabled,
    }));
  });

  it("maps the reference thumb positions back to the live vocal settings", () => {
    const onVocal = vi.fn();
    renderMixer("none", vi.fn(), onVocal);
    fireEvent.click(screen.getByRole("button", { name: "Effets voix" }));

    fireEvent.change(screen.getByRole("slider", { name: "Mix réverb" }), { target: { value: "0.5" } });
    fireEvent.change(screen.getByRole("slider", { name: "Intensité Compression" }), { target: { value: "0.8" } });
    fireEvent.change(screen.getByRole("slider", { name: "Intensité EQ" }), { target: { value: "0.7" } });

    expect(onVocal.mock.calls[0][0].reverbAmount).toBeCloseTo(0.4533, 3);
    expect(onVocal.mock.calls[1][0].compAmount).toBeCloseTo(0.8245, 3);
    expect(onVocal.mock.calls[2][0].preset).toBe("Radio");
    expect(screen.getByRole("slider", { name: "Durée du délai" })).toBeDisabled();
  });

  it("keeps the vocal pipeline active when Delay is disabled beside Autotune", () => {
    const onVocal = vi.fn();
    renderMixer("none", vi.fn(), onVocal, [], (room) => {
      Object.assign(room.personalVocal, {
        tuneEnabled: true,
        reverbEnabled: false,
        delayEnabled: true,
        compEnabled: false,
        eqEnabled: false,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Effets voix" }));
    fireEvent.click(screen.getByRole("button", { name: "Désactiver Délai" }));

    expect(onVocal).toHaveBeenCalledWith({ delayEnabled: false, enabled: true });
  });

  it("offers detected native plugins directly in La Place", () => {
    vi.stubEnv("VITE_OPENDAW_VOICE_CORRECTION_LAB", "true");
    const onPitchProvider = vi.fn();
    renderMixer("none", onPitchProvider, vi.fn(), [{
      id: "sixthsample.spoton",
      name: "Spoton",
      vendor: "Sixth Sample",
      version: "1.1.2",
      format: "vst3",
      status: "ready",
      licensed: true,
      hasEditor: true,
      latencySamples: 0,
      capabilities: ["pitch_correction"],
    }]);

    openPlugins();
    expect(screen.getByText("Plugins locaux")).toBeVisible();
    expect(screen.getByText("Spoton")).toBeVisible();
    expect(screen.queryByText("Graillon 3")).not.toBeInTheDocument();
    const useSpoton = screen.getAllByRole("button", { name: "Vérifier et utiliser" }).find((button) => !button.hasAttribute("disabled"));
    expect(useSpoton).toBeDefined();
    fireEvent.click(useSpoton!);

    expect(onPitchProvider).toHaveBeenCalledWith("sixthsample.spoton");
  });

  it("keeps only one main FX accordion open at a time", () => {
    renderMixer("none");

    expect(screen.getByRole("button", { name: "Autotune" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Effets voix" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Effets voix" }));
    expect(screen.getByRole("button", { name: "Autotune" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Effets voix" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("slider", { name: "Mix réverb" })).toHaveAttribute("aria-valuetext", "18 %");
    expect(screen.getByRole("slider", { name: "Durée du délai" })).toHaveAttribute("aria-valuetext", "120 ms");
    expect(screen.getByRole("slider", { name: "Intensité Compression" })).toHaveAttribute("aria-valuetext", "62 %");
    expect(screen.getByRole("slider", { name: "Intensité EQ" })).toHaveAttribute("aria-valuetext", "+3 dB");
    expect(screen.getByRole("button", { name: "Désactiver Réverb" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Activer Délai" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Désactiver Compression" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Désactiver EQ" })).toHaveAttribute("aria-pressed", "true");
  });
});
