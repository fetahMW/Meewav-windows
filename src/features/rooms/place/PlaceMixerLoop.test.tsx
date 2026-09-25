import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceMixerAudioPlayer from "./PlaceMixerAudioPlayer";
import { createMixerLoop, mixerLoopPosition, moveMixerLoopEdge } from "./placeMixerLoop";
import { placeRoomTime } from "./placeRoomTime";

vi.mock("../tools/audio/previewWaveform", () => ({ decodeAudioWaveform: vi.fn(async () => []) }));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:loop-track") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  placeRoomTime.setEnabled(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function renderPlayer() {
  const callbacks = {
    onPreviewPrepare: vi.fn(async () => true), onPreviewMetadata: vi.fn(async () => true),
    onRouteChange: vi.fn(async () => true), onPlaybackStateChange: vi.fn(async () => true),
  };
  const view = render(<PlaceMixerAudioPlayer roomId="loop-room" ownerId={null} queueParticipants={[]}
    musicGain={1} masterGain={1} publicMusicMuted={false} {...callbacks} />);
  const input = document.querySelector<HTMLInputElement>(".place-mixer-audio__file")!;
  await act(async () => fireEvent.change(input, { target: { files: [new File(["sound"], "Production.wav", { type: "audio/wav" })] } }));
  const audio = document.querySelector<HTMLAudioElement>("audio")!;
  Object.defineProperty(audio, "duration", { configurable: true, value: 120 });
  await act(async () => fireEvent.loadedMetadata(audio));
  return { ...view, ...callbacks, audio, input };
}

function enableLoop(cueRatio = .25) {
  fireEvent.change(screen.getByRole("slider", { name: /Point de reprise de/ }), { target: { value: String(cueRatio) } });
  fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Activer la boucle A–B" }));
}

describe("loop range limits", () => {
  it("creates an eight-second region at the cue, including near the end of a short track", () => {
    expect(createMixerLoop(30, 120)).toEqual({ start: 30, end: 38 });
    expect(createMixerLoop(120, 120)).toEqual({ start: 112, end: 120 });
    expect(createMixerLoop(2, 3)).toEqual({ start: 0, end: 3 });
    expect(createMixerLoop(0, 0)).toBeNull();
    expect(createMixerLoop(0, NaN)).toBeNull();
  });
  it("prevents crossed handles, zero-length loops and out-of-file boundaries", () => {
    expect(moveMixerLoopEdge({ start: 30, end: 38 }, "start", 45, 120)).toEqual({ start: 37.75, end: 38 });
    expect(moveMixerLoopEdge({ start: 30, end: 38 }, "end", 1, 120)).toEqual({ start: 30, end: 30.25 });
    expect(moveMixerLoopEdge({ start: 30, end: 38 }, "end", 500, 120)).toEqual({ start: 30, end: 120 });
    expect(mixerLoopPosition(37.99, { start: 30, end: 38 })).toBe(37.99);
    expect(mixerLoopPosition(38, { start: 30, end: 38 })).toBe(30);
    expect(mixerLoopPosition(0, { start: 30, end: 38 })).toBe(30);
  });
});

describe("player A–B loop", () => {
  it("keeps the target's normal cue action and offers loop controls separately", async () => {
    const { audio } = await renderPlayer();
    fireEvent.change(screen.getByRole("slider", { name: /Point de reprise de/ }), { target: { value: ".25" } });
    fireEvent.click(screen.getByRole("button", { name: /Revenir au curseur/ }));
    expect(audio.currentTime).toBe(30);
    expect(screen.queryByRole("slider", { name: "Fin de la boucle B" })).not.toBeInTheDocument();
    enableLoop();
    expect(screen.getByRole("slider", { name: "Début de la boucle A" })).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByRole("slider", { name: "Fin de la boucle B" })).toHaveAttribute("aria-valuenow", "38");
    expect(screen.getByRole("group", { name: "Zone de boucle A–B" })).toBeVisible();
    expect(screen.queryByRole("slider", { name: /Point de reprise de/ })).not.toBeInTheDocument();
  });

  it("resizes both handles with the keyboard and returns the target to A", async () => {
    const { audio } = await renderPlayer();
    enableLoop();
    const a = screen.getByRole("slider", { name: "Début de la boucle A" });
    const b = screen.getByRole("slider", { name: "Fin de la boucle B" });
    fireEvent.keyDown(a, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(b, { key: "ArrowRight", shiftKey: true });
    expect(a).toHaveAttribute("aria-valuenow", "31");
    expect(b).toHaveAttribute("aria-valuenow", "39");
    fireEvent.click(screen.getByRole("button", { name: "Revenir au début de la boucle" }));
    expect(audio.currentTime).toBe(31);
    fireEvent.keyDown(a, { key: "End" });
    expect(a).toHaveAttribute("aria-valuenow", "38.75");
    fireEvent.keyDown(b, { key: "Home" });
    expect(b).toHaveAttribute("aria-valuenow", "39");
  });

  it("starts inside the selected region and repeats at B without restarting Time", async () => {
    const { audio, onPlaybackStateChange } = await renderPlayer();
    enableLoop();
    act(() => placeRoomTime.setEnabled(true));
    const startTime = vi.spyOn(placeRoomTime, "start");
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mettre en pause" })).toBeVisible());
    expect(audio.currentTime).toBe(30);
    vi.spyOn(audio, "paused", "get").mockReturnValue(false);
    audio.currentTime = 37.99;
    fireEvent.timeUpdate(audio);
    expect(audio.currentTime).toBe(37.99);
    audio.currentTime = 38;
    fireEvent.timeUpdate(audio);
    expect(audio.currentTime).toBe(30);
    audio.currentTime = 38.15;
    fireEvent.timeUpdate(audio);
    expect(audio.currentTime).toBe(30);
    expect(startTime).toHaveBeenCalledTimes(1);
    expect(onPlaybackStateChange).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("drags each handle independently to widen the selected region", async () => {
    await renderPlayer();
    enableLoop();
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    });
    const surface = screen.getByRole("group", { name: "Zone de boucle A–B" });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ width: 600 } as DOMRect);
    const a = screen.getByRole("slider", { name: "Début de la boucle A" });
    const b = screen.getByRole("slider", { name: "Fin de la boucle B" });
    Object.defineProperty(a, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(b, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(a, { pointerId: 1, clientX: 200, button: 0 });
    fireEvent.pointerMove(a, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(a, { pointerId: 1 });
    expect(a).toHaveAttribute("aria-valuenow", "20");
    fireEvent.pointerDown(b, { pointerId: 2, clientX: 300, button: 0 });
    fireEvent.pointerMove(b, { pointerId: 2, clientX: 350 });
    fireEvent.pointerUp(b, { pointerId: 2 });
    expect(b).toHaveAttribute("aria-valuenow", "48");
  });

  it("enforces the boundary between timeupdate events and cleans up on pause", async () => {
    const { audio } = await renderPlayer();
    enableLoop();
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mettre en pause" })).toBeVisible());
    vi.spyOn(audio, "paused", "get").mockReturnValue(false);
    audio.currentTime = 38;
    await waitFor(() => expect(audio.currentTime).toBe(30));
    fireEvent.click(screen.getByRole("button", { name: "Mettre en pause" }));
    expect(screen.getByRole("button", { name: "Préécouter localement" })).toBeVisible();
  });

  it("repeats the region even when B is the end of the file", async () => {
    const { audio } = await renderPlayer();
    enableLoop(.99);
    fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    audio.currentTime = 120;
    await act(async () => fireEvent.ended(audio));
    expect(audio.currentTime).toBe(112);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("turns off the loop without losing A as the regular cue", async () => {
    const { audio } = await renderPlayer();
    enableLoop();
    fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Désactiver la boucle A–B" }));
    expect(screen.queryByRole("group", { name: "Zone de boucle A–B" })).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Point de reprise de/ })).toHaveValue("0.25");
    audio.currentTime = 45;
    fireEvent.timeUpdate(audio);
    expect(audio.currentTime).toBe(45);
  });

  it("resets the region when another track is selected", async () => {
    const { input } = await renderPlayer();
    enableLoop();
    await act(async () => fireEvent.change(input, { target: { files: [new File(["other"], "Next.wav", { type: "audio/wav" })] } }));
    expect(screen.queryByRole("group", { name: "Zone de boucle A–B" })).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Point de reprise de Next/ })).toHaveValue("0");
  });

  it("closes the cue menu with Escape and restores focus", async () => {
    await renderPlayer();
    const toggle = screen.getByRole("button", { name: "Options de lecture" });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByRole("menuitemcheckbox", { name: "Activer la boucle A–B" }), { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });
});
