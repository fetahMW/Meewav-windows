import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaveSubmission } from "../tools/roomTools.types";
import type { WaveListeningMode } from "./WaveAudioTransport";
import { useWaveTransport, WaveTransportProvider } from "./WaveTransportProvider";

// The real transport is exercised through the Provider, but all Web Audio and
// network objects are inert mocks. These tests never play sound on the device.
class Param {
  value = 1;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}
class AudioNodeMock {
  gain = new Param(); playbackRate = new Param();
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
const flush = async () => { for (let turn = 0; turn < 16; turn++) await Promise.resolve(); };
const submission = (id: string): WaveSubmission => ({
  id, title: id, instrument: "Basse", bpm: 120, bars: 4, key: "Am", durationSeconds: 8,
  status: "to-review", rightsConfirmed: true, version: 1, privateNotes: "", creditPublic: true, versions: [],
  mediaUrl: `/${id}.wav`, contributor: { id: `artist-${id}`, name: `Artiste ${id}`, avatarUrl: "", role: "Musicien", microphone: "ready", camera: "ready" },
});
async function harness() {
  vi.useFakeTimers();
  const sources: AudioNodeMock[] = [];
  const audioBuffer = { duration: 8, length: 800, sampleRate: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(800) };
  const audioContext = {
    currentTime: 0, destination: new AudioNodeMock(),
    createGain: () => new AudioNodeMock(),
    createBufferSource: () => { const source = new AudioNodeMock(); sources.push(source); return source; },
    decodeAudioData: vi.fn().mockResolvedValue(audioBuffer),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal("AudioContext", function () { return audioContext; });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  let transport!: NonNullable<ReturnType<typeof useWaveTransport>>;
  function Probe() { transport = useWaveTransport()!; return null; }
  render(<WaveTransportProvider toolsVisible><Probe /></WaveTransportProvider>);
  transport.engine.setGrid({ bpm: 120, beatsPerBar: 4, origin: 0 });
  await transport.engine.setReference({ id: "ref", title: "Beat", url: "/ref.wav", bpm: 120, bars: 4 });
  const play = vi.fn(() => transport.engine.play());
  const pause = vi.fn(() => transport.engine.pause());
  transport.registerPlaybackControls({ play, pause });
  return { transport, audioContext, sources, play, pause };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("raccourcis d’écoute du Provider Wave", () => {
  it.each(["beat", "base", "loop", "mix"] as WaveListeningMode[])("Play carte est un solo temporaire sans modifier le choix %s", async mode => {
    const { transport, play, pause } = await harness();
    transport.engine.setMode(mode);
    await act(async () => { transport.quickPreview(submission("a")); await flush(); });
    expect(play).toHaveBeenCalledOnce();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode, quickPreview: true, playing: true, candidate: { id: "a" } });
    act(() => transport.quickPreview(submission("a")));
    expect(pause).toHaveBeenCalledOnce();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode, quickPreview: false, playing: false });
  });

  it("enchaîner les Play des cartes remplace la candidate sans créer un second lecteur", async () => {
    const { transport, play, sources, audioContext } = await harness();
    await act(async () => { transport.quickPreview(submission("a")); await flush(); });
    audioContext.currentTime = 1;
    await act(async () => { transport.quickPreview(submission("b")); await flush(); });
    audioContext.currentTime = 1.01;
    await act(async () => { transport.quickPreview(submission("c")); await flush(); });
    expect(play).toHaveBeenCalledOnce();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", quickPreview: true, playing: true, candidate: { id: "c" } });
    expect(sources.filter(source => !source.stop.mock.calls.length)).toEqual([sources[0], sources[sources.length - 1]]);
    expect(sources).toHaveLength(4);
  });

  it("cliquer une carte charge normalement et quitte le solo, en conservant le mode choisi", async () => {
    const { transport, play, pause } = await harness();
    transport.engine.setMode("mix");
    await act(async () => { transport.quickPreview(submission("a")); await flush(); });
    await act(async () => { transport.select(submission("b")); await flush(); });
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "mix", quickPreview: false, playing: true, candidate: { id: "b" } });
    expect(play).toHaveBeenCalledOnce(); expect(pause).not.toHaveBeenCalled();
  });

  it("charge la nouvelle carte sur le transport BASE déjà en lecture sans imposer Pause puis Play", async () => {
    const { transport, play, pause, sources, audioContext } = await harness();
    transport.engine.setMode("base");
    await act(async () => { await transport.select(submission("a")); await flush(); });
    act(() => transport.play());
    await act(async () => { await flush(); });
    audioContext.currentTime = 1;

    await act(async () => { await transport.select(submission("b")); await flush(); });

    expect(play).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: true, quickPreview: false, candidate: { id: "b" } });
    expect(sources).toHaveLength(3);
    expect(sources[2].start).toHaveBeenCalledOnce();
  });

  it("une décision ne stoppe que l’audition rapide et laisse un transport normal tranquille", async () => {
    const { transport, pause } = await harness();
    await transport.engine.play();
    act(() => transport.stopQuickPreview());
    expect(pause).not.toHaveBeenCalled(); expect(transport.engine.getSnapshot().playing).toBe(true);
    await act(async () => { transport.quickPreview(submission("a")); await flush(); });
    act(() => transport.stopQuickPreview());
    expect(pause).toHaveBeenCalledOnce();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: false, quickPreview: false });
  });

  it("un second clic annule le Play encore en attente du périphérique audio", async () => {
    const { transport, audioContext, sources, pause } = await harness();
    let resume!: () => void;
    audioContext.resume.mockReturnValue(new Promise<void>(resolve => { resume = resolve; }));
    act(() => transport.quickPreview(submission("a")));
    act(() => transport.quickPreview(submission("a")));
    await act(async () => { resume(); await flush(); });
    expect(pause).toHaveBeenCalledOnce(); expect(sources).toHaveLength(0);
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: false, quickPreview: false });
  });

  it("l’arrêt reste sûr pendant le chargement d’une nouvelle candidate", async () => {
    const { transport, audioContext, sources } = await harness();
    let decode!: (value: object) => void;
    audioContext.decodeAudioData.mockReturnValueOnce(new Promise(resolve => { decode = resolve; }));
    await act(async () => { transport.quickPreview(submission("slow")); await flush(); });
    act(() => transport.stopQuickPreview());
    await act(async () => {
      decode({ duration: 8, length: 800, sampleRate: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(800) });
      await flush();
    });
    // Canceling before decode completes must not instantiate an audio source.
    expect(sources).toHaveLength(0);
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: false, quickPreview: false, loading: false });
  });
});
