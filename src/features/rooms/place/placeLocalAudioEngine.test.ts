import { describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import {
  PlaceLocalAudioEngine,
  type PlacePitchCorrectionAdapter,
  type PlacePitchCorrectionProcessor,
} from "./placeLocalAudioEngine";

class FakeAudioNode {
  connections: FakeAudioNode[] = [];

  connect = vi.fn((destination: FakeAudioNode) => {
    this.connections.push(destination);
    return destination;
  });

  disconnect = vi.fn(() => {
    this.connections = [];
  });
}

function asAudioNode(node: FakeAudioNode) {
  return node as unknown as AudioNode;
}

function installRunningGraph(
  engine: PlaceLocalAudioEngine,
  previousAdapter: PlacePitchCorrectionAdapter,
  previousProcessor: PlacePitchCorrectionProcessor,
) {
  const presence = new FakeAudioNode();
  const compDry = new FakeAudioNode();
  const compressor = new FakeAudioNode();
  Reflect.set(engine, "context", { state: "running" } as AudioContext);
  Reflect.set(engine, "nodes", {
    presence: asAudioNode(presence),
    compDry: asAudioNode(compDry),
    compressor: asAudioNode(compressor),
  });
  Reflect.set(engine, "pitchAdapter", previousAdapter);
  Reflect.set(engine, "pitchProcessor", previousProcessor);
  Reflect.set(engine, "pitchProcessorAdapterId", previousAdapter.id);
  Reflect.set(engine, "applySettings", vi.fn());
  Reflect.set(engine, "emit", vi.fn());
  return { presence, compDry, compressor };
}

function processor(input = new FakeAudioNode(), output = new FakeAudioNode(), dispose = vi.fn()) {
  return {
    input: asAudioNode(input),
    output: asAudioNode(output),
    update: vi.fn(),
    dispose,
  } satisfies PlacePitchCorrectionProcessor;
}

describe("PlaceLocalAudioEngine pitch adapter switching", () => {
  it("keeps a dry route while a previous processor disposes slowly", async () => {
    let releaseDispose: () => void = () => undefined;
    const previousOutput = new FakeAudioNode();
    const previousProcessor = processor(
      new FakeAudioNode(),
      previousOutput,
      vi.fn(() => new Promise<void>((resolve) => { releaseDispose = resolve; })),
    );
    const previousAdapter = { id: "previous", create: vi.fn() } as unknown as PlacePitchCorrectionAdapter;
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const graph = installRunningGraph(engine, previousAdapter, previousProcessor);
    const nextProcessor = processor();
    const nextAdapter: PlacePitchCorrectionAdapter = {
      id: "next",
      create: vi.fn(async () => nextProcessor),
    };

    const switching = engine.setPitchAdapter(nextAdapter);
    await vi.waitFor(() => expect(previousProcessor.dispose).toHaveBeenCalledTimes(1));

    expect(graph.presence.connections).toEqual([graph.compDry, graph.compressor]);
    expect(previousOutput.disconnect).toHaveBeenCalledTimes(1);

    releaseDispose();
    await switching;
    expect(graph.presence.connections).toEqual([nextProcessor.input]);
  });

  it("restores and then replaces the dry route even when old dispose rejects", async () => {
    const previousProcessor = processor(
      new FakeAudioNode(),
      new FakeAudioNode(),
      vi.fn(async () => { throw new Error("plugin teardown failed"); }),
    );
    const previousAdapter = { id: "previous", create: vi.fn() } as unknown as PlacePitchCorrectionAdapter;
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const graph = installRunningGraph(engine, previousAdapter, previousProcessor);
    const nextProcessor = processor();
    const nextAdapter: PlacePitchCorrectionAdapter = {
      id: "next",
      create: vi.fn(async () => nextProcessor),
    };

    await expect(engine.setPitchAdapter(nextAdapter)).resolves.toBeUndefined();

    expect(graph.presence.connections).toEqual([nextProcessor.input]);
    expect((nextProcessor.output as unknown as FakeAudioNode).connections).toEqual([
      graph.compDry,
      graph.compressor,
    ]);
  });

  it("starts capture with the requested adapter before reporting it operational", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const pitchProcessor = processor();
    const adapter: PlacePitchCorrectionAdapter = {
      id: "meewav-test",
      create: vi.fn(),
    };
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    const startCapture = vi.spyOn(engine, "startCapture").mockImplementation(async () => {
      Reflect.set(engine, "pitchProcessor", pitchProcessor);
      Reflect.set(engine, "pitchProcessorAdapterId", adapter.id);
      return stream;
    });

    const snapshot = await engine.startCaptureWithPitchAdapter(adapter);

    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(snapshot.pitchCorrection).toMatchObject({
      available: true,
      adapterId: adapter.id,
    });
  });

  it("rejects a provider start and removes its adapter when no processor became usable", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const adapter: PlacePitchCorrectionAdapter = {
      id: "unavailable-test",
      create: vi.fn(),
    };
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    vi.spyOn(engine, "startCapture").mockResolvedValue(stream);
    const stop = vi.spyOn(engine, "stop");
    Reflect.set(engine, "pitchFailureReason", "DSP indisponible");

    await expect(engine.startCaptureWithPitchAdapter(adapter)).rejects.toThrow("DSP indisponible");

    expect(engine.getSnapshot().pitchCorrection).toMatchObject({
      available: false,
      adapterId: null,
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("keeps a pre-existing capture alive when a replacement adapter is unavailable", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const adapter: PlacePitchCorrectionAdapter = { id: "unavailable-test", create: vi.fn() };
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    Reflect.set(engine, "context", { state: "running" } as AudioContext);
    Reflect.set(engine, "nodes", { output: { stream } });
    vi.spyOn(engine, "setPitchAdapter").mockImplementation(async (nextAdapter) => {
      Reflect.set(engine, "pitchAdapter", nextAdapter);
      Reflect.set(engine, "pitchProcessor", null);
      Reflect.set(engine, "pitchProcessorAdapterId", null);
      Reflect.set(engine, "pitchFailureReason", "DSP indisponible");
    });
    vi.spyOn(engine, "startCapture").mockResolvedValue(stream);
    const stop = vi.spyOn(engine, "stop");

    await expect(engine.startCaptureWithPitchAdapter(adapter)).rejects.toThrow("DSP indisponible");

    expect(stop).not.toHaveBeenCalled();
  });

  it("never clears the adapter owned by a newer provider request", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const firstAdapter: PlacePitchCorrectionAdapter = { id: "first", create: vi.fn() };
    const secondAdapter: PlacePitchCorrectionAdapter = { id: "second", create: vi.fn() };
    const secondProcessor = processor();
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    vi.spyOn(engine, "startCapture").mockImplementation(async () => {
      Reflect.set(engine, "pitchAdapter", secondAdapter);
      Reflect.set(engine, "pitchProcessor", secondProcessor);
      Reflect.set(engine, "pitchProcessorAdapterId", secondAdapter.id);
      return stream;
    });
    const stop = vi.spyOn(engine, "stop");

    await expect(engine.startCaptureWithPitchAdapter(firstAdapter, () => false)).rejects.toThrow("cancelled");

    expect(engine.getSnapshot().pitchCorrection).toMatchObject({
      available: true,
      adapterId: secondAdapter.id,
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it("never clears a newer request that reuses the same adapter id", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const adapter: PlacePitchCorrectionAdapter = { id: "same-provider", create: vi.fn() };
    const pitchProcessor = processor();
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    let releaseFirstCapture: () => void = () => undefined;
    const firstCapture = new Promise<void>((resolve) => { releaseFirstCapture = resolve; });
    const startCapture = vi.spyOn(engine, "startCapture")
      .mockImplementationOnce(async () => {
        await firstCapture;
        return stream;
      })
      .mockImplementationOnce(async () => {
        Reflect.set(engine, "pitchProcessor", pitchProcessor);
        Reflect.set(engine, "pitchProcessorAdapterId", adapter.id);
        return stream;
      });
    const stop = vi.spyOn(engine, "stop");

    const staleStart = engine.startCaptureWithPitchAdapter(adapter, () => false);
    await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    const currentStart = engine.startCaptureWithPitchAdapter(adapter);

    await expect(currentStart).resolves.toMatchObject({
      pitchCorrection: { available: true, adapterId: adapter.id },
    });
    releaseFirstCapture();
    await expect(staleStart).rejects.toThrow("cancelled");

    expect(engine.getSnapshot().pitchCorrection).toMatchObject({
      available: true,
      adapterId: adapter.id,
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not stop a microphone capture that was already requesting permission", async () => {
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    const adapter: PlacePitchCorrectionAdapter = { id: "unavailable-test", create: vi.fn() };
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    Reflect.set(engine, "startPromise", Promise.resolve(stream));
    vi.spyOn(engine, "startCapture").mockResolvedValue(stream);
    const stop = vi.spyOn(engine, "stop");

    await expect(engine.startCaptureWithPitchAdapter(adapter)).rejects.toThrow(/moteur|correction vocale/i);

    expect(stop).not.toHaveBeenCalled();
  });
});

describe("PlaceLocalAudioEngine microphone gain", () => {
  it("applies the fader before every Web Audio branch and remembers it while muted", () => {
    const gain = {
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    };
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    Reflect.set(engine, "context", { currentTime: 4 } as AudioContext);
    Reflect.set(engine, "nodes", { inputGain: { gain } });

    engine.setInputGain(0.37);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0.37, 4, 0.01);

    engine.setInputEnabled(false);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4, 0.01);

    engine.setInputGain(0.81);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4, 0.01);

    engine.setInputEnabled(true);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0.81, 4, 0.01);
  });

  it("reports browser and DSP estimates without presenting them as physical latency", () => {
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    const engine = new PlaceLocalAudioEngine(createPlaceDemoState().personalVocal);
    Reflect.set(engine, "context", {
      baseLatency: 0.004,
      outputLatency: 0.008,
    } as AudioContext);
    Reflect.set(engine, "nodes", { output: { stream } });
    Reflect.set(engine, "pitchProcessor", {
      getHealth: () => ({
        available: true,
        active: true,
        reason: null,
        estimatedDspLatencyMs: 12,
      }),
    });

    expect(engine.getSnapshot().latency).toEqual({
      baseLatencyMs: 4,
      outputLatencyMs: 8,
      estimatedDspLatencyMs: 12,
      estimatedMonitoringLatencyMs: 24,
    });
  });
});
