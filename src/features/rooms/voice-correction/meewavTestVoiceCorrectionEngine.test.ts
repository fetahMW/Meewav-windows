import { describe, expect, it, vi } from "vitest";
import type { PlacePitchCorrectionAdapter, PlacePitchCorrectionProcessor } from "../place/placeLocalAudioEngine";
import {
  createMeeWavTestVoiceCorrectionEngine,
  meewavTestPitchParameters,
} from "./meewavTestVoiceCorrectionEngine";

describe("MeeWav test voice correction engine", () => {
  it("maps every canonical control and keeps bypass fail-safe", () => {
    const settings = { enabled: true, key: 6 as const, scale: 5 as const, amount: 0.8, retune: 0.73, shift: 0, smooth: 0.41 };

    expect(meewavTestPitchParameters(settings, false)).toEqual({
      tuneEnabled: true,
      tuneKey: "F#",
      tuneScale: "Blues",
      tuneAmount: 0.8,
      tuneSpeed: 0.73,
      tuneHumanize: 0.41,
      tuneSmooth: 0.41,
      tuneShift: 0,
    });
    expect(meewavTestPitchParameters(settings, true).tuneEnabled).toBe(false);
  });

  it("creates a processed stream, switches bypass and releases only owned output resources", async () => {
    const inputTrack = {
      readyState: "live",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const outputTrack = {
      readyState: "live",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const inputStream = {
      getAudioTracks: () => [inputTrack],
      getTracks: () => [inputTrack],
    } as unknown as MediaStream;
    const outputStream = {
      getAudioTracks: () => [outputTrack],
      getTracks: () => [outputTrack],
    } as unknown as MediaStream;
    const audioParam = () => ({
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    });
    const audioNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const inputNode = audioNode() as unknown as MediaStreamAudioSourceNode;
    const inputAnalyser = {
      ...audioNode(),
      fftSize: 512,
      getFloatTimeDomainData: vi.fn(),
    } as unknown as AnalyserNode;
    const outputAnalyser = {
      ...audioNode(),
      fftSize: 512,
      getFloatTimeDomainData: vi.fn(),
    } as unknown as AnalyserNode;
    const monitorAnalyser = {
      ...audioNode(),
      fftSize: 512,
      getFloatTimeDomainData: vi.fn(),
    } as unknown as AnalyserNode;
    const dryGain = { ...audioNode(), gain: audioParam() } as unknown as GainNode;
    const wetGain = { ...audioNode(), gain: audioParam() } as unknown as GainNode;
    const outputBus = { ...audioNode(), gain: audioParam() } as unknown as GainNode;
    const monitorGain = { ...audioNode(), gain: audioParam() } as unknown as GainNode;
    const processorInput = {} as AudioNode;
    const processorOutput = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const update = vi.fn();
    const dispose = vi.fn();
    const processor = {
      input: processorInput,
      output: processorOutput,
      update,
      dispose,
    } satisfies PlacePitchCorrectionProcessor;
    const adapter = {
      id: "meewav.test",
      create: vi.fn(async () => processor),
    } satisfies PlacePitchCorrectionAdapter;
    const destinationNode = { stream: outputStream } as MediaStreamAudioDestinationNode;
    const gains = [dryGain, wetGain, outputBus, monitorGain];
    const analysers = [inputAnalyser, outputAnalyser, monitorAnalyser];
    const context = {
      state: "running",
      currentTime: 0,
      sampleRate: 48_000,
      baseLatency: 0.004,
      outputLatency: 0.008,
      audioWorklet: {},
      destination: {} as AudioDestinationNode,
      resume: vi.fn(async () => {
        (context as unknown as { state: AudioContextState }).state = "running";
      }),
      createMediaStreamSource: vi.fn(() => inputNode),
      createGain: vi.fn(() => gains.shift()!),
      createAnalyser: vi.fn(() => analysers.shift()!),
      createMediaStreamDestination: vi.fn(() => destinationNode),
    } as unknown as AudioContext;
    const engine = createMeeWavTestVoiceCorrectionEngine({
      adapter,
      playMonitoringProofTone: false,
    });

    await engine.initialize({ audioContext: context });
    await engine.updateSettings({ enabled: true, key: 9, scale: 7, amount: 1, retune: 0.9, shift: 0, smooth: 0.2 });
    await engine.setBypass(false);
    await engine.connectInput(inputStream);

    expect(adapter.create).toHaveBeenCalledWith(context);
    expect(inputNode.connect).toHaveBeenCalledWith(inputAnalyser);
    expect(inputAnalyser.connect).toHaveBeenCalledWith(processorInput);
    expect(processorOutput.connect).toHaveBeenCalledWith(wetGain);
    expect(outputBus.connect).toHaveBeenCalledWith(outputAnalyser);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      tuneEnabled: true,
      tuneKey: "A",
      tuneScale: "Mixolydienne",
      tuneSpeed: 0.9,
      tuneHumanize: 0.2,
    }));
    expect(engine.getProcessedStream()).toBe(outputStream);
    expect(engine.getDiagnostics()).toMatchObject({
      status: "processing",
      engineReady: true,
      workletReady: true,
      inputTrackState: "live",
      outputTrackState: "live",
      estimatedDspLatencyMs: 12,
    });

    (context as unknown as { state: AudioContextState }).state = "suspended";
    await engine.setMonitoring(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(monitorGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.012);
    await engine.setBypass(true);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ tuneEnabled: false }));
    await engine.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(outputTrack.stop).toHaveBeenCalledTimes(1);
    expect(inputTrack.stop).not.toHaveBeenCalled();
  });
});
