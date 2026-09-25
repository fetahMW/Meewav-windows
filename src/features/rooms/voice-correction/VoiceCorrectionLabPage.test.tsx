import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceCorrectionEngine, VoiceCorrectionEngineDiagnostics } from "./VoiceCorrectionEngine";
import { VoiceCorrectionLabPage } from "./VoiceCorrectionLabPage";

const diagnostics: VoiceCorrectionEngineDiagnostics = {
  status: "idle",
  engineReady: false,
  workletReady: false,
  crossOriginIsolated: false,
  sampleRate: null,
  baseLatencyMs: null,
  outputLatencyMs: null,
  estimatedDspLatencyMs: null,
  cpuLoadPercent: null,
  inputTrackState: null,
  outputTrackState: null,
  bypass: true,
  monitoring: false,
  fallbackActive: false,
  fallbackReason: null,
  error: null,
  resources: [],
};

const nativeIdleSnapshot = {
  status: "idle",
  audioReady: false,
  pluginId: null,
  pid: null,
  startedAt: null,
  stoppedAt: null,
  exitCode: null,
  signal: null,
  forcedStop: false,
  message: null,
  stdoutTail: "",
  stderrTail: "",
};

function createEngineStub(): VoiceCorrectionEngine {
  return {
    initialize: vi.fn(async () => undefined),
    connectInput: vi.fn(async () => undefined),
    updateSettings: vi.fn(async () => undefined),
    setBypass: vi.fn(async () => undefined),
    setMonitoring: vi.fn(async () => undefined),
    getDryStream: vi.fn(() => null),
    getProcessedStream: vi.fn(() => null),
    getMeterSnapshot: vi.fn(() => ({ input: 0, output: 0 })),
    getDiagnostics: vi.fn(() => diagnostics),
    subscribeDiagnostics: vi.fn(() => () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="meewav-audio-lab-native-token"]')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VoiceCorrectionLabPage", () => {
  it("uses the public Autotune name and exposes only the four useful musical controls", () => {
    render(<VoiceCorrectionLabPage engineFactory={createEngineStub} />);

    expect(screen.getByRole("heading", { name: "Autotune" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Choix du moteur Autotune" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir Autotune openDAW" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Choisir Autotune Spoton" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir Autotune Graillon 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Activer le microphone/u })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tonalité" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Gamme" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Retune speed" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Humanisation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Naturel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sec" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Corrigé" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Intensité de correction" })).toBeInTheDocument();
    expect(screen.queryByText("Transposition")).not.toBeInTheDocument();
    expect(screen.getByText("Preuve WebRTC locale")).toBeInTheDocument();
    expect(screen.queryByText(/Auto-Tune|Voloco/u)).not.toBeInTheDocument();
  });

  it("shows native Spoton and Graillon without pretending to activate a Web engine", async () => {
    const openDawFactory = vi.fn(createEngineStub);
    const meewavFactory = vi.fn(createEngineStub);
    render(<VoiceCorrectionLabPage engineFactories={{ opendaw: openDawFactory, meewav_test: meewavFactory }} />);

    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune Spoton" }));

    expect(screen.getByRole("button", { name: "Choisir Autotune Spoton" })).toHaveAttribute("aria-pressed", "true");
    const nativeRegion = screen.getByRole("region", { name: "Autotune Spoton · test natif" });
    expect(nativeRegion).toBeVisible();
    expect(screen.getByText(/retour réel via le micro et la sortie audio Windows/iu)).toBeVisible();
    expect(await within(nativeRegion).findByText(/Le lanceur natif est indisponible/iu)).toBeVisible();
    expect(screen.getByText(/sixthsample\.spoton/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choisir Autotune openDAW" })).toHaveAttribute("aria-pressed", "false");
    expect(openDawFactory).not.toHaveBeenCalled();
    expect(meewavFactory).not.toHaveBeenCalled();
  });

  it("starts the real native headphone return only after explicit wired-headphone confirmation", async () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      const payload = url.endsWith("/start")
        ? {
          ...nativeIdleSnapshot,
          status: "running",
          audioReady: true,
          pluginId: "sixthsample.spoton",
          pid: 4242,
          startedAt: "2026-08-11T10:00:00.000Z",
          stdoutTail: "MEEWAV_AUDIO_CONTROL_READY",
        }
        : url.endsWith("/stop")
          ? { ...nativeIdleSnapshot, status: "stopped", pluginId: "sixthsample.spoton" }
          : nativeIdleSnapshot;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const openDawFactory = vi.fn(createEngineStub);
    render(<VoiceCorrectionLabPage engineFactory={openDawFactory} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune Spoton" }));
    const confirmation = await screen.findByRole("checkbox", { name: /Casque filaire branché/u });
    const startButton = screen.getByRole("button", { name: /Activer le retour Spoton/u });
    expect(startButton).toBeDisabled();

    fireEvent.click(confirmation);
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    await waitFor(() => expect(screen.getByRole("button", { name: /Couper le retour Spoton/u })).toBeVisible());
    const startRequest = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/start"));
    expect(startRequest?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "x-meewav-audio-lab-token": "lab-token" }),
    });
    expect(JSON.parse(String(startRequest?.[1]?.body))).toEqual({
      pluginId: "sixthsample.spoton",
      headphonesConfirmed: true,
      controls: {
        bypassed: false,
        inputGain: 1,
        key: 0,
        scale: 0,
        amount: 1,
        retune: 0.5,
        humanize: 0.6,
        reverbEnabled: false,
        reverbMix: 0,
        reverbType: "room",
        reverbDuration: 1.2,
        reverbPreDelayMs: 0,
      },
    });
    expect(openDawFactory).not.toHaveBeenCalled();
  });

  it("lets the artist choose the real engine before requesting the microphone", () => {
    const openDawFactory = vi.fn(createEngineStub);
    const meewavFactory = vi.fn(createEngineStub);
    render(<VoiceCorrectionLabPage engineFactories={{ opendaw: openDawFactory, meewav_test: meewavFactory }} />);

    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" }));

    expect(screen.getByRole("button", { name: "Choisir Autotune openDAW" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" })).toHaveAttribute("aria-pressed", "true");
    expect(openDawFactory).not.toHaveBeenCalled();
    expect(meewavFactory).not.toHaveBeenCalled();
  });

  it("applies the internal comparison profiles without exposing extra sliders", () => {
    render(<VoiceCorrectionLabPage engineFactory={createEngineStub} />);

    fireEvent.click(screen.getByRole("button", { name: "Précis" }));

    expect(screen.getByRole("slider", { name: "Intensité de correction" })).toHaveValue("88");
    expect(screen.getByRole("slider", { name: "Retune speed" })).toHaveValue("72");
    expect(screen.getByRole("slider", { name: "Humanisation" })).toHaveValue("45");
    expect(screen.queryByText("Intensité")).not.toBeInTheDocument();
    expect(screen.queryByText("Transposition")).not.toBeInTheDocument();
  });

  it("can start microphone activation under React StrictMode", async () => {
    const endedTrack = {
      kind: "audio",
      readyState: "ended",
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const dryStream = {
      getAudioTracks: () => [endedTrack],
      getTracks: () => [endedTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => dryStream);
    const enumerateDevices = vi.fn(async () => [] as MediaDeviceInfo[]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });
    class FakeAudioContext {
      state: AudioContextState = "running";
      sampleRate = 48_000;
      baseLatency = 0;
      outputLatency = 0;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => { this.state = "closed"; });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engineFactory = vi.fn(createEngineStub);

    const view = render(<StrictMode><VoiceCorrectionLabPage engineFactory={engineFactory} /></StrictMode>);
    fireEvent.click(view.getByRole("button", { name: /Activer le microphone/u }));

    await waitFor(() => expect(engineFactory).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("instantiates only the engine selected by the artist", async () => {
    const endedTrack = {
      kind: "audio",
      readyState: "ended",
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const dryStream = {
      getAudioTracks: () => [endedTrack],
      getTracks: () => [endedTrack],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => dryStream),
        enumerateDevices: vi.fn(async () => [] as MediaDeviceInfo[]),
      },
    });
    class FakeAudioContext {
      state: AudioContextState = "running";
      sampleRate = 48_000;
      baseLatency = 0;
      outputLatency = 0;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => { this.state = "closed"; });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const openDawFactory = vi.fn(createEngineStub);
    const meewavFactory = vi.fn(createEngineStub);
    render(<VoiceCorrectionLabPage engineFactories={{ opendaw: openDawFactory, meewav_test: meewavFactory }} />);

    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" }));
    fireEvent.click(screen.getByRole("button", { name: /Activer le microphone/u }));

    await waitFor(() => expect(meewavFactory).toHaveBeenCalledTimes(1));
    expect(openDawFactory).not.toHaveBeenCalled();
  });

  it("uses the engine headphone bus for both corrected and dry monitoring", async () => {
    const dryTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const processedTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const dryStream = {
      getAudioTracks: () => [dryTrack],
      getTracks: () => [dryTrack],
    } as unknown as MediaStream;
    const processedStream = {
      getAudioTracks: () => [processedTrack],
      getTracks: () => [processedTrack],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => dryStream),
        enumerateDevices: vi.fn(async () => [] as MediaDeviceInfo[]),
      },
    });

    const connectedStreams: MediaStream[] = [];
    const sourceNodes: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    const gainNodes: Array<{
      gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const analyser = () => ({
      fftSize: 1024,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0)),
    });
    const destination = {} as AudioDestinationNode;
    class FakeAudioContext {
      state: AudioContextState = "running";
      sampleRate = 48_000;
      baseLatency = 0;
      outputLatency = 0;
      destination = destination;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => { this.state = "closed"; });
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      createMediaStreamSource = vi.fn((stream: MediaStream) => {
        connectedStreams.push(stream);
        const node = { connect: vi.fn(), disconnect: vi.fn() };
        sourceNodes.push(node);
        return node;
      });
      createAnalyser = vi.fn(analyser);
      createGain = vi.fn(() => {
        const node = {
          gain: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        gainNodes.push(node);
        return node;
      });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const readyDiagnostics: VoiceCorrectionEngineDiagnostics = {
      ...diagnostics,
      status: "processing",
      engineReady: true,
      workletReady: true,
      crossOriginIsolated: true,
      sampleRate: 48_000,
      inputTrackState: "live",
      outputTrackState: "live",
      bypass: false,
    };
    const engine: VoiceCorrectionEngine = {
      ...createEngineStub(),
      setBypass: vi.fn(async (nextBypass: boolean) => {
        readyDiagnostics.bypass = nextBypass;
        readyDiagnostics.status = nextBypass ? "bypassed" : "processing";
      }),
      setMonitoring: vi.fn(async (enabled: boolean) => {
        readyDiagnostics.monitoring = enabled;
        readyDiagnostics.monitoringState = enabled ? "active" : "off";
      }),
      getProcessedStream: vi.fn(() => processedStream),
      getDiagnostics: vi.fn(() => readyDiagnostics),
    };
    render(<VoiceCorrectionLabPage engineFactory={() => engine} />);

    fireEvent.click(screen.getByRole("button", { name: /Activer et écouter la voix corrigée/u }));
    await waitFor(() => expect(screen.getByText("Traitement actif")).toBeVisible());

    await waitFor(() => expect(screen.getByRole("button", { name: /Couper le retour/u })).toBeVisible());
    expect(engine.setBypass).toHaveBeenLastCalledWith(false);
    expect(engine.setMonitoring).toHaveBeenLastCalledWith(true);
    expect(gainNodes).toHaveLength(0);
    expect(connectedStreams).toContain(dryStream);
    expect(connectedStreams).toContain(processedStream);

    fireEvent.click(screen.getByRole("button", { name: "Sec" }));

    await waitFor(() => expect(engine.setBypass).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(engine.setMonitoring).toHaveBeenLastCalledWith(true));
    expect(gainNodes).toHaveLength(0);
    expect(screen.getByText(/Écoute sélectionnée : signal sec/u)).toBeVisible();
  });

  it("keeps dry monitoring inside the engine bus when replacing the provider", async () => {
    const dryTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const firstProcessedTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const nextProcessedTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = (track: MediaStreamTrack) => ({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream);
    const dryStream = stream(dryTrack);
    const firstProcessedStream = stream(firstProcessedTrack);
    const nextProcessedStream = stream(nextProcessedTrack);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => dryStream),
        enumerateDevices: vi.fn(async () => [] as MediaDeviceInfo[]),
      },
    });

    const gainNodes: object[] = [];
    const directlyMonitoredStreams: MediaStream[] = [];
    const analyser = () => ({
      fftSize: 1024,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0)),
    });
    class FakeAudioContext {
      state: AudioContextState = "running";
      sampleRate = 48_000;
      baseLatency = 0;
      outputLatency = 0;
      currentTime = 0;
      destination = {} as AudioDestinationNode;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => { this.state = "closed"; });
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      createMediaStreamSource = vi.fn((sourceStream: MediaStream) => ({
        connect: vi.fn((target: object) => {
          if (gainNodes.includes(target)) directlyMonitoredStreams.push(sourceStream);
        }),
        disconnect: vi.fn(),
      }));
      createAnalyser = vi.fn(analyser);
      createGain = vi.fn(() => {
        const node = {
          gain: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        gainNodes.push(node);
        return node;
      });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const readyDiagnostics: VoiceCorrectionEngineDiagnostics = {
      ...diagnostics,
      status: "bypassed",
      engineReady: true,
      workletReady: true,
      crossOriginIsolated: true,
      sampleRate: 48_000,
      inputTrackState: "live",
      outputTrackState: "live",
      bypass: true,
    };
    const liveEngine = (processedStream: MediaStream): VoiceCorrectionEngine => ({
      ...createEngineStub(),
      getProcessedStream: vi.fn(() => processedStream),
      getDiagnostics: vi.fn(() => readyDiagnostics),
    });
    const openDawEngine = liveEngine(firstProcessedStream);
    const meewavEngine = liveEngine(nextProcessedStream);
    render(<VoiceCorrectionLabPage engineFactories={{
      opendaw: () => openDawEngine,
      meewav_test: () => meewavEngine,
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /Activer le microphone/u }));
    await waitFor(() => expect(screen.getByText("Traitement actif")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Sec" }));
    await waitFor(() => expect(openDawEngine.setBypass).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: /Écouter la voix sèche/u }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Couper le retour/u })).toBeVisible());
    expect(openDawEngine.setMonitoring).toHaveBeenLastCalledWith(true);
    expect(directlyMonitoredStreams).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" }));

    await waitFor(() => expect(openDawEngine.dispose).toHaveBeenCalledTimes(1));
    expect(meewavEngine.setBypass).toHaveBeenLastCalledWith(true);
    expect(meewavEngine.setMonitoring).toHaveBeenLastCalledWith(true);
    expect(directlyMonitoredStreams).toEqual([]);
    expect(screen.getByText(/Écoute sélectionnée : signal sec/u)).toBeVisible();
  });

  it("really replaces the active engine instead of changing only the selected label", async () => {
    const inputTrack = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const dryStream = {
      getAudioTracks: () => [inputTrack],
      getTracks: () => [inputTrack],
    } as unknown as MediaStream;
    const processedStream = () => {
      const track = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
      return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    };
    const readyDiagnostics: VoiceCorrectionEngineDiagnostics = {
      ...diagnostics,
      status: "processing",
      engineReady: true,
      workletReady: true,
      crossOriginIsolated: true,
      sampleRate: 48_000,
      inputTrackState: "live",
      outputTrackState: "live",
      bypass: false,
    };
    const liveEngine = (stream: MediaStream): VoiceCorrectionEngine => ({
      ...createEngineStub(),
      getProcessedStream: vi.fn(() => stream),
      getDiagnostics: vi.fn(() => readyDiagnostics),
    });
    const openDawEngine = liveEngine(processedStream());
    const meewavEngine = liveEngine(processedStream());
    const openDawFactory = vi.fn(() => openDawEngine);
    const meewavFactory = vi.fn(() => meewavEngine);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => dryStream),
        enumerateDevices: vi.fn(async () => [] as MediaDeviceInfo[]),
      },
    });
    const analyser = () => ({
      fftSize: 1024,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0)),
    });
    class FakeAudioContext {
      state: AudioContextState = "running";
      sampleRate = 48_000;
      baseLatency = 0;
      outputLatency = 0;
      currentTime = 0;
      destination = {} as AudioDestinationNode;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => { this.state = "closed"; });
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
      createAnalyser = vi.fn(analyser);
      createGain = vi.fn(() => ({
        gain: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<VoiceCorrectionLabPage engineFactories={{ opendaw: openDawFactory, meewav_test: meewavFactory }} />);

    fireEvent.click(screen.getByRole("button", { name: /Activer le microphone/u }));
    await waitFor(() => expect(openDawFactory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Traitement actif")).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" }));

    await waitFor(() => expect(meewavFactory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(openDawEngine.dispose).toHaveBeenCalledTimes(1));
    expect(meewavEngine.connectInput).toHaveBeenCalledWith(dryStream);
    expect(screen.getByRole("button", { name: "Choisir Autotune MeeWav test" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Autotune MeeWav test", { selector: ".voice-correction-lab__diagnostics strong" })).toBeVisible();
  });
});
