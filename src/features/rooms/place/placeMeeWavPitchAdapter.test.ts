import { afterEach, describe, expect, it, vi } from "vitest";
import { meewavPitchCorrectionAdapter } from "./placeMeeWavPitchAdapter";
import { MEEWAV_PITCH_CORRECTION_PROFILE } from "./meewavPitchCorrectionProfile";

describe("MeeWav pitch AudioWorklet adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes the low-latency profile to the worklet and exposes honest DSP diagnostics", async () => {
    let receivedOptions: AudioWorkletNodeOptions | undefined;
    class FakeAudioWorkletNode {
      port = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null,
      };
      disconnect = vi.fn();

      constructor(_context: AudioContext, _name: string, options?: AudioWorkletNodeOptions) {
        receivedOptions = options;
      }
    }
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
    const addModule = vi.fn(async () => undefined);
    const context = {
      audioWorklet: { addModule },
      sampleRate: 48_000,
    } as unknown as AudioContext;

    const processor = await meewavPitchCorrectionAdapter.create(context);

    expect(addModule).toHaveBeenCalledWith("/audio/meewav-pitch-correction.worklet.js");
    expect(receivedOptions?.processorOptions).toEqual(MEEWAV_PITCH_CORRECTION_PROFILE);
    expect(processor.getHealth?.()).toMatchObject({
      available: true,
      active: true,
      estimatedDspLatencyMs: 12,
      maximumDspLatencyMs: 22.666666666666668,
      maximumPitchDecisionIntervalMs: 10.666666666666666,
    });
  });
});
