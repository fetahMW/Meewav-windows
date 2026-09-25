import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlaceLiveCallProgramMix } from "./usePlaceLiveCallProgramMix";

const OriginalAudioContext = globalThis.AudioContext;
const OriginalMediaStream = globalThis.MediaStream;

function inputTrack(id: string) {
  return {
    id,
    kind: "audio",
    readyState: "live",
  } as unknown as MediaStreamTrack;
}

describe("usePlaceLiveCallProgramMix", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: OriginalAudioContext });
    Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: OriginalMediaStream });
    vi.restoreAllMocks();
  });

  it("garde chaque entrée à zéro en préécoute et ne l’ouvre qu’après confirmation média", async () => {
    const outputTrack = { enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    const gainValue = {
      value: -1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(function setValueAtTime(this: { value: number }, value: number) {
        this.value = value;
      }),
    };
    const gain = {
      gain: gainValue,
      connect: vi.fn((destination: unknown) => destination),
      disconnect: vi.fn(),
    };
    const destination = {
      stream: { getAudioTracks: () => [outputTrack] },
      disconnect: vi.fn(),
    };
    const context = {
      state: "running",
      currentTime: 4,
      createMediaStreamDestination: vi.fn(() => destination),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(() => gain),
      })),
      createGain: vi.fn(() => gain),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: vi.fn(function FakeAudioContext() {
        return context;
      }),
    });
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: class FakeMediaStream {
        constructor(readonly tracks: MediaStreamTrack[]) {}
      },
    });

    const track = inputTrack("private-call-input");
    const { result, rerender, unmount } = renderHook(
      ({ onAir }) => usePlaceLiveCallProgramMix([{ invitationId: "call-1", track, onAir }]),
      { initialProps: { onAir: false } },
    );

    await waitFor(() => expect(result.current.outputTrack).toBe(outputTrack));
    expect(gainValue.value).toBe(0);
    expect(outputTrack.enabled).toBe(false);

    rerender({ onAir: true });
    await waitFor(() => expect(gainValue.setValueAtTime).toHaveBeenLastCalledWith(1, 4));

    rerender({ onAir: false });
    await waitFor(() => expect(gainValue.setValueAtTime).toHaveBeenLastCalledWith(0, 4));

    act(() => unmount());
    expect(outputTrack.stop).toHaveBeenCalledTimes(1);
  });
});
