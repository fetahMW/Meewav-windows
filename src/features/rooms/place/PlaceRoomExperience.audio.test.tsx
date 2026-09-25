import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import type { PlacePitchProvider, PlaceRoomState } from "./place.types";

type DeferredWebStart = {
  predicate: () => boolean;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type DeferredNativeStart = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type NativeRefreshSnapshot = {
  status: "idle" | "running";
  audioReady: boolean;
  pluginId: string | null;
  pid: number | null;
};

const mocks = vi.hoisted(() => ({
  room: null as PlaceRoomState | null,
  updateVocal: vi.fn(),
  showNotice: vi.fn(),
  stopLocalCapture: vi.fn(async () => undefined),
  enableLocalMonitoring: vi.fn(async () => undefined),
  disableLocalMonitoring: vi.fn(),
  startCaptureWithPitchAdapter: vi.fn(),
  startNativeVst3: vi.fn(),
  stopNativeVst3: vi.fn(async () => undefined),
  refreshNativeVst3: vi.fn(async (): Promise<NativeRefreshSnapshot> => ({
    status: "running",
    audioReady: true,
    pluginId: "sixthsample.spoton",
    pid: 1,
  })),
  nativeSnapshot: null as NativeRefreshSnapshot | null,
  webStarts: [] as DeferredWebStart[],
  nativeStarts: [] as DeferredNativeStart[],
  results: [] as Array<{ source: "web" | "native"; started: boolean }>,
  configuredPitchAdapterId: null as string | null,
}));

vi.mock("../audio-engine", () => ({
  useAudioEngine: () => ({
    status: "disconnected",
    transport: "web_audio",
    health: null,
    chain: null,
    monitoring: { enabled: false },
    fallbackReason: null,
    setMonitoring: vi.fn(async () => undefined),
    useWebAudioFallback: vi.fn(async () => undefined),
  }),
}));

vi.mock("../roomPresentation", async (importOriginal) => ({
  ...await importOriginal<typeof import("../roomPresentation")>(),
  useRoomPresentation: () => ({ id: "place", label: "La Place", uppercaseLabel: "LA PLACE", theme: "place" }),
}));

vi.mock("../voice-correction/voiceCorrection.flags", () => ({
  isVoiceCorrectionRoomEntryEnabled: () => false,
}));

vi.mock("./usePlaceRoom", () => ({
  usePlaceRoom: () => ({
    room: mocks.room,
    isLoading: false,
    isHost: true,
    isGuest: false,
    canEngage: true,
    activeUserId: mocks.room?.host.id ?? "host",
    surface: "mixer",
    updateVocal: mocks.updateVocal,
    showNotice: mocks.showNotice,
    endRoom: vi.fn(),
    setChannelGain: vi.fn(),
    toggleChannelMute: vi.fn(),
    setParticipantCameraEnabled: vi.fn(),
    setOwnCameraEnabled: vi.fn(),
    setTune: vi.fn(),
    toggleTrackPlayback: vi.fn(),
    sendMessage: vi.fn(),
    joinQueue: vi.fn(),
    leaveCurrentQueue: vi.fn(),
    acceptCurrentInvitation: vi.fn(),
    declineCurrentInvitation: vi.fn(),
    markCurrentInvitationReady: vi.fn(),
    launchPoll: vi.fn(),
    stopPoll: vi.fn(),
    pinHighlight: vi.fn(),
    pinMessage: vi.fn(),
    deleteMessage: vi.fn(),
    clearHighlight: vi.fn(),
    submitGift: vi.fn(),
    createGiftDraw: vi.fn(),
    scheduleGiftDraw: vi.fn(),
    startGiftDraw: vi.fn(),
    cancelGiftDraw: vi.fn(),
    moveGuest: vi.fn(),
    removeGuest: vi.fn(),
    setQueueOpen: vi.fn(),
    toggleLike: vi.fn(),
    giveGoldenLike: vi.fn(),
    votePoll: vi.fn(),
    goldenLikeUnavailable: false,
  }),
}));

vi.mock("./usePlaceLocalAudio", () => ({
  usePlaceLocalAudio: (_settings: unknown, options: { pitchAdapter?: { id: string } | null }) => {
    mocks.configuredPitchAdapterId = options.pitchAdapter?.id ?? null;
    return {
      status: "idle",
      error: null,
      outputTrack: null,
      outputStream: null,
      monitoring: false,
      pitchCorrection: { available: false, active: false, adapterId: null, reason: null },
      latency: {
        baseLatencyMs: null,
        outputLatencyMs: null,
        estimatedDspLatencyMs: null,
        estimatedMonitoringLatencyMs: null,
      },
      startCaptureWithPitchAdapter: mocks.startCaptureWithPitchAdapter,
      stopCapture: mocks.stopLocalCapture,
      enableHeadphoneMonitoring: mocks.enableLocalMonitoring,
      disableHeadphoneMonitoring: mocks.disableLocalMonitoring,
    };
  },
}));

vi.mock("./usePlaceNativeVst3Monitor", () => ({
  usePlaceNativeVst3Monitor: () => ({
    snapshot: mocks.nativeSnapshot,
    error: null,
    activePluginId: mocks.nativeSnapshot?.pluginId ?? null,
    refresh: mocks.refreshNativeVst3,
    start: mocks.startNativeVst3,
    update: vi.fn(async () => undefined),
    stop: mocks.stopNativeVst3,
  }),
}));

vi.mock("./usePlaceProgramLayout", () => ({
  usePlaceProgramLayout: () => ({ programLayout: null, updateProgramLayout: vi.fn(), canDirectProgram: true }),
}));

vi.mock("./usePlaceScreenShare", () => ({
  usePlaceScreenShare: () => ({
    previewStream: null,
    publishedStream: null,
    isPublished: false,
    isRequesting: false,
    hasAudio: false,
    sourceLabel: null,
    selectSource: vi.fn(),
    publish: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("./PlaceRoomShellHeader", () => ({ default: () => null }));
vi.mock("./PlaceStage", () => ({ default: () => null }));
vi.mock("./PlaceDonationHat", () => ({ default: () => null }));
vi.mock("../../shorts/ShortsCollaborationDialog", () => ({ default: () => null }));

vi.mock("./PlaceStudioPanel", () => ({
  default: (props: {
    pitchProvider: PlacePitchProvider;
    nativePluginAudioReady: boolean;
    onPitchProvider: (provider: PlacePitchProvider) => boolean | Promise<boolean>;
    onToggleMonitoring: () => void;
  }) => (
    <div data-testid="studio-probe" data-provider={props.pitchProvider} data-native-ready={String(props.nativePluginAudioReady)}>
      <button type="button" onClick={() => {
        void Promise.resolve(props.onPitchProvider("meewav_test"))
          .then((started) => mocks.results.push({ source: "web", started }));
      }}>
        Démarrer Web
      </button>
      <button type="button" onClick={() => {
        void Promise.resolve(props.onPitchProvider("sixthsample.spoton"))
          .then((started) => mocks.results.push({ source: "native", started }));
      }}>
        Démarrer natif
      </button>
      <button type="button" onClick={props.onToggleMonitoring}>Basculer le casque</button>
    </div>
  ),
}));

import PlaceRoomExperience, { canContactUseHlsPhoneCallHandoff } from "./PlaceRoomExperience";

function experience(requestedRoomId: string) {
  return (
    <PlaceRoomExperience
      requestedRoomId={requestedRoomId}
      currentUserId={mocks.room?.host.id}
      demoRole="host"
      onOpenProfile={vi.fn()}
      onMessageProfile={vi.fn()}
      onCollaborateProfile={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.stubEnv("MODE", "audio-lab");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.localStorage.clear();
  const room = createPlaceDemoState();
  room.personalVocal.monitoring = false;
  room.personalVocal.tuneEnabled = false;
  mocks.room = room;
  mocks.nativeSnapshot = null;
  mocks.webStarts.length = 0;
  mocks.nativeStarts.length = 0;
  mocks.results.length = 0;
  mocks.configuredPitchAdapterId = null;
  mocks.updateVocal.mockClear();
  mocks.showNotice.mockClear();
  mocks.stopLocalCapture.mockClear();
  mocks.enableLocalMonitoring.mockClear();
  mocks.disableLocalMonitoring.mockClear();
  mocks.stopNativeVst3.mockClear();
  mocks.refreshNativeVst3.mockClear();
  mocks.startCaptureWithPitchAdapter.mockReset();
  mocks.startCaptureWithPitchAdapter.mockImplementation((_adapter: unknown, predicate: () => boolean) => (
    new Promise((resolve, reject) => mocks.webStarts.push({ predicate, resolve, reject }))
  ));
  mocks.startNativeVst3.mockReset();
  mocks.startNativeVst3.mockImplementation(() => (
    new Promise((resolve, reject) => mocks.nativeStarts.push({ resolve, reject }))
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("PlaceRoomExperience provider activation boundaries", () => {
  it("interdit le handoff HLS dès l’acceptation d’un appel public encore en preview", () => {
    expect(canContactUseHlsPhoneCallHandoff([{ callMode: "public" }])).toBe(false);
    expect(canContactUseHlsPhoneCallHandoff([{ callMode: "private" }])).toBe(true);
    expect(canContactUseHlsPhoneCallHandoff([
      { callMode: "private" },
      { callMode: "public" },
    ])).toBe(false);
  });

  it("prefers MeeWav on first visit without enabling Autotune or starting capture", async () => {
    render(experience("room-a"));

    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "meewav_test");
    expect(mocks.room?.personalVocal.tuneEnabled).toBe(false);
    expect(mocks.configuredPitchAdapterId).toBeNull();
    expect(mocks.startCaptureWithPitchAdapter).not.toHaveBeenCalled();
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ tuneEnabled: true }));
    await waitFor(() => expect(window.localStorage.getItem("meewav.rooms.pitch-provider.v1")).toBe("meewav_test"));
  });

  it("migrates the legacy empty provider preference to idle MeeWav", async () => {
    window.localStorage.setItem("meewav.rooms.pitch-provider.v1", "none");

    render(experience("room-a"));

    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "meewav_test");
    expect(mocks.configuredPitchAdapterId).toBeNull();
    expect(mocks.startCaptureWithPitchAdapter).not.toHaveBeenCalled();
    await waitFor(() => expect(window.localStorage.getItem("meewav.rooms.pitch-provider.v1")).toBe("meewav_test"));
  });

  it("does not let a Web start from the previous Room mutate the current Room", async () => {
    const { rerender } = render(experience("room-a"));
    mocks.updateVocal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer Web" }));
    await waitFor(() => expect(mocks.webStarts).toHaveLength(1));
    expect(mocks.webStarts[0].predicate()).toBe(true);

    const nextRoom = createPlaceDemoState();
    nextRoom.id = `${mocks.room!.id}-next`;
    nextRoom.personalVocal.monitoring = false;
    nextRoom.personalVocal.tuneEnabled = false;
    mocks.room = nextRoom;
    rerender(experience(nextRoom.id));
    expect(mocks.webStarts[0].predicate()).toBe(false);
    mocks.webStarts[0].resolve({});

    await waitFor(() => expect(mocks.results).toContainEqual({ source: "web", started: false }));
    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "meewav_test");
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ tuneEnabled: true }));
  });

  it("serializes provider work and keeps the latest native choice", async () => {
    render(experience("room-a"));
    mocks.updateVocal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer Web" }));
    await waitFor(() => expect(mocks.webStarts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer natif" }));
    expect(mocks.nativeStarts).toHaveLength(0);

    mocks.webStarts[0].resolve({});
    await waitFor(() => expect(mocks.results).toContainEqual({ source: "web", started: false }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));

    mocks.nativeStarts[0].resolve({
      audioReady: true,
      pluginId: "sixthsample.spoton",
      stdoutTail: "",
    });
    await waitFor(() => expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "sixthsample.spoton"));

    expect(mocks.results).toContainEqual({ source: "native", started: true });
    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "sixthsample.spoton");
    const activatingCalls = mocks.updateVocal.mock.calls.filter(([patch]) => patch.tuneEnabled === true);
    expect(activatingCalls).toHaveLength(1);
    expect(activatingCalls[0][0]).toMatchObject({ enabled: true, monitoring: true });
  });

  it("stops an obsolete native start before applying the latest Web choice", async () => {
    render(experience("room-a"));
    mocks.updateVocal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer natif" }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer Web" }));
    expect(mocks.webStarts).toHaveLength(0);

    mocks.nativeStarts[0].resolve({
      audioReady: true,
      pluginId: "sixthsample.spoton",
      stdoutTail: "",
    });
    await waitFor(() => expect(mocks.results).toContainEqual({ source: "native", started: false }));
    await waitFor(() => expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.webStarts).toHaveLength(1));

    mocks.webStarts[0].resolve({});
    await waitFor(() => expect(mocks.results).toContainEqual({ source: "web", started: true }));
    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "meewav_test");
    const activatingCalls = mocks.updateVocal.mock.calls.filter(([patch]) => patch.tuneEnabled === true);
    expect(activatingCalls).toHaveLength(1);
  });

  it("stops a native process that resolves unusable", async () => {
    render(experience("room-a"));
    mocks.updateVocal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer natif" }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));

    mocks.nativeStarts[0].resolve({
      audioReady: false,
      pluginId: "sixthsample.spoton",
      stdoutTail: "",
    });

    await waitFor(() => expect(mocks.results).toContainEqual({ source: "native", started: false }));
    expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "none");
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ tuneEnabled: true }));
  });

  it("stops a native process whose startup rejects after ownership was acquired", async () => {
    render(experience("room-a"));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer natif" }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));

    mocks.nativeStarts[0].reject(new Error("native timeout"));

    await waitFor(() => expect(mocks.results).toContainEqual({ source: "native", started: false }));
    expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1);
    expect(mocks.showNotice).toHaveBeenCalledWith("native timeout");
  });

  it("stops a native start that completes after switching Rooms", async () => {
    const { rerender } = render(experience("room-a"));
    mocks.updateVocal.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer natif" }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));

    const nextRoom = createPlaceDemoState();
    nextRoom.id = `${mocks.room!.id}-next`;
    mocks.room = nextRoom;
    rerender(experience(nextRoom.id));
    mocks.nativeStarts[0].resolve({
      audioReady: true,
      pluginId: "sixthsample.spoton",
      stdoutTail: "",
    });

    await waitFor(() => expect(mocks.results).toContainEqual({ source: "native", started: false }));
    expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-provider", "meewav_test");
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ tuneEnabled: true }));
  });

  it("stops a native headphone restart that completes after switching Rooms", async () => {
    window.localStorage.setItem("meewav.rooms.pitch-provider.v1", "sixthsample.spoton");
    mocks.refreshNativeVst3.mockReset().mockResolvedValue({
      status: "idle",
      audioReady: false,
      pluginId: null,
      pid: null,
    });
    const { rerender } = render(experience("room-a"));
    await waitFor(() => expect(mocks.refreshNativeVst3).toHaveBeenCalled());
    mocks.updateVocal.mockClear();
    mocks.stopNativeVst3.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Basculer le casque" }));
    await waitFor(() => expect(mocks.nativeStarts).toHaveLength(1));

    const nextRoom = createPlaceDemoState();
    nextRoom.id = `${mocks.room!.id}-next`;
    mocks.room = nextRoom;
    rerender(experience(nextRoom.id));
    mocks.nativeStarts[0].resolve({
      audioReady: true,
      pluginId: "sixthsample.spoton",
      stdoutTail: "",
    });

    await waitFor(() => expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1));
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ monitoring: true }));
  });

  it("stops a stale native refresh before reconciling the next Room", async () => {
    window.localStorage.setItem("meewav.rooms.pitch-provider.v1", "sixthsample.spoton");
    let resolveFirstRefresh: ((snapshot: NativeRefreshSnapshot) => void) | undefined;
    mocks.refreshNativeVst3.mockReset()
      .mockImplementationOnce(() => new Promise<NativeRefreshSnapshot>((resolve) => {
        resolveFirstRefresh = resolve;
      }))
      .mockResolvedValue({ status: "idle", audioReady: false, pluginId: null, pid: null });
    const { rerender } = render(experience("room-a"));
    await waitFor(() => expect(mocks.refreshNativeVst3).toHaveBeenCalledTimes(1));

    const nextRoom = createPlaceDemoState();
    nextRoom.id = `${mocks.room!.id}-next`;
    mocks.room = nextRoom;
    rerender(experience(nextRoom.id));
    const staleSnapshot: NativeRefreshSnapshot = {
      status: "running",
      audioReady: true,
      pluginId: "sixthsample.spoton",
      pid: 99,
    };
    mocks.nativeSnapshot = staleSnapshot;
    rerender(experience(nextRoom.id));

    expect(screen.getByTestId("studio-probe")).toHaveAttribute("data-native-ready", "false");
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ monitoring: true }));
    resolveFirstRefresh?.(staleSnapshot);

    await waitFor(() => expect(mocks.stopNativeVst3).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refreshNativeVst3).toHaveBeenCalledTimes(2));
    expect(mocks.updateVocal).not.toHaveBeenCalledWith(expect.objectContaining({ monitoring: true }));
  });
});
