import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useViewerSendMixer } from "./ViewerMixerContext";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("retains levels through stage transitions and refresh without starting capture or publication", async () => {
  const initial = renderHook(
    ({ enabled }) => useViewerSendMixer("member-a", enabled),
    { initialProps: { enabled: true } },
  );
  act(() => {
    initial.result.current.setGain("voice", 0.4);
    initial.result.current.setGain("master", 0.6);
    initial.result.current.toggleMute("system");
  });
  initial.rerender({ enabled: false });
  initial.rerender({ enabled: true });
  expect(initial.result.current.levels.voice.gain).toBe(0.4);
  expect(initial.result.current.outputTrack).toBeNull();
  initial.unmount();
  const restored = renderHook(() => useViewerSendMixer("member-a", true));
  expect(restored.result.current.levels.master.gain).toBe(0.6);
  expect(restored.result.current.levels.system.muted).toBe(true);
  expect(restored.result.current.outputTrack).toBeNull();
  expect(restored.result.current.systemState).toBe("unavailable");
  expect(restored.result.current.musicTransport.musicAudible).toBe(false);
});

it("loads each account's own levels when authentication resolves", async () => {
  localStorage.setItem(
    "meewav:viewer-send:v1:member-b",
    JSON.stringify({ master: { gain: 0.2, muted: true } }),
  );
  const { result, rerender } = renderHook(
    ({ account }) => useViewerSendMixer(account, true),
    { initialProps: { account: "anonymous" } },
  );
  act(() => result.current.setGain("master", 0.9));
  rerender({ account: "member-b" });
  await waitFor(() =>
    expect(result.current.levels.master).toEqual({ gain: 0.2, muted: true }),
  );
  expect(result.current.outputTrack).toBeNull();
});
