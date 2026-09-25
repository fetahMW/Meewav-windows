import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNativeVst3LabMonitorStatus,
  getNativeVst3LabPlugins,
  startNativeVst3LabMonitor,
} from "./nativeVst3LabMonitor";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const runningSnapshot = {
  status: "running",
  audioReady: true,
  pluginId: "sixthsample.spoton",
  pid: 42,
  startedAt: "2026-08-11T10:00:00.000Z",
  stoppedAt: null,
  exitCode: null,
  signal: null,
  forcedStop: false,
  message: null,
  stdoutTail: "ready",
  stderrTail: "",
};

afterEach(() => {
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("native VST3 laboratory monitor client", () => {
  it("sends the injected token and exact canonical plugin ID", async () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    const fetchMock = vi.fn(async () => response(runningSnapshot));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startNativeVst3LabMonitor("sixthsample.spoton")).resolves.toMatchObject({
      status: "running",
      audioReady: true,
      pluginId: "sixthsample.spoton",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/__meewav_audio_lab/native-monitor/start");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-meewav-audio-lab-token": "lab-token",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      pluginId: "sixthsample.spoton",
      headphonesConfirmed: true,
      controls: {
        bypassed: false,
        inputGain: 1,
        key: 0,
        scale: 0,
        amount: 1,
        retune: 0.5,
        humanize: 0,
        reverbEnabled: false,
        reverbMix: 0,
        reverbType: "room",
        reverbDuration: 1.2,
        reverbPreDelayMs: 0,
      },
    });
  });

  it("fails closed when the audio-lab token is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNativeVst3LabMonitorStatus()).rejects.toThrow(/npm run dev:place-audio/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads only the bounded Spoton and Graillon inventory", async () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    const fetchMock = vi.fn(async () => response([
      {
        id: "sixthsample.spoton",
        name: "Spoton",
        vendor: "Sixth Sample",
        version: "1.1.2",
        format: "vst3",
        status: "ready",
        licensed: true,
        hasEditor: false,
        latencySamples: 0,
        capabilities: ["pitch_correction", "local_monitoring", "laboratory_only"],
      },
      {
        id: "auburnsounds.graillon3",
        name: "Graillon 3",
        vendor: "Auburn Sounds",
        version: "3.2.0",
        format: "vst3",
        status: "missing",
        licensed: false,
        hasEditor: false,
        latencySamples: 1_074,
        capabilities: ["pitch_correction", "local_monitoring", "laboratory_only"],
      },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNativeVst3LabPlugins()).resolves.toMatchObject([
      { id: "sixthsample.spoton", status: "ready" },
      { id: "auburnsounds.graillon3", status: "missing" },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/__meewav_audio_lab/native-monitor/plugins");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ "x-meewav-audio-lab-token": "lab-token" });
  });

  it("rejects a plugin inventory containing an arbitrary identifier", async () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    vi.stubGlobal("fetch", vi.fn(async () => response([{
      id: "../arbitrary.vst3",
      name: "Unknown",
      vendor: "Unknown",
      version: "1",
      format: "vst3",
      status: "ready",
      licensed: true,
      hasEditor: false,
      latencySamples: 0,
      capabilities: [],
    }])));

    await expect(getNativeVst3LabPlugins()).rejects.toThrow(/non autorisé/u);
  });

  it("rejects an unexpected provider before contacting localhost", async () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => startNativeVst3LabMonitor("malicious.path" as never)).toThrow(/non autorisé/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid post-VST3 reverb controls before contacting localhost", () => {
    document.head.innerHTML = '<meta name="meewav-audio-lab-native-token" content="lab-token">';
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => startNativeVst3LabMonitor("sixthsample.spoton", {
      bypassed: false,
      inputGain: 1,
      key: 0,
      scale: 0,
      amount: 1,
      retune: 0.5,
      humanize: 0,
      reverbEnabled: true,
      reverbMix: 0.4,
      reverbType: "cathedral" as never,
      reverbDuration: 1.8,
      reverbPreDelayMs: 24,
    })).toThrow(/invalides/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
