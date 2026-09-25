import { describe, expect, it, vi } from "vitest";
import { WaveViewerAudio } from "./WaveViewerAudio";

function audioFixture() {
  const sources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null; loop: boolean }> = [];
  const gains: Array<{ gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const context = {
    state: "running", currentTime: 10, destination: { id: "headphones" },
    resume: vi.fn<() => Promise<void>>(async () => undefined), close: vi.fn(async () => undefined),
    createBufferSource: () => { const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, loop: false }; sources.push(source); return source; },
    createGain: () => { const gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; },
  };
  return { context, sources, gains, engine: new WaveViewerAudio(() => context as unknown as AudioContext) };
}
const loop = (duration = 8) => ({ duration } as AudioBuffer);
describe("Wave Viewer private audio routing", () => {
  it("applies personal output volume without changing the balance, including after resume", async () => {
    const { engine, gains } = audioFixture();
    engine.setOutputVolume(.5);
    await engine.play([loop(), loop()], [.4, .8], true);
    expect(gains.map(gain => gain.gain.value)).toEqual([.2, .4]);
    engine.setOutputVolume(.25);
    expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.1, 10, .015);
    engine.pause(); await engine.resume();
    expect(gains.slice(2).map(gain => gain.gain.value)).toEqual([.1, .2]);
  });
  it("schedules both files at one hardware origin and connects only to local output", async () => {
    const { engine, sources, gains, context } = audioFixture();
    expect(await engine.play([loop(4), loop(8)], [.3, .6], true)).toBe(true);
    expect(sources.map(source => source.start.mock.calls[0])).toEqual([[10.04, 0], [10.04, 0]]);
    expect(gains.map(gain => gain.connect.mock.calls[0][0])).toEqual([context.destination, context.destination]);
    expect(sources.every(source => source.loop)).toBe(true);
    engine.stop(); expect(sources.every(source => source.stop.mock.calls.length === 1)).toBe(true);
  });
  it("solo never allocates a reference source; replacing an audition stops the previous one", async () => {
    const { engine, sources } = audioFixture();
    await engine.play([loop()], [.5], false);
    expect(sources).toHaveLength(1);
    await engine.play([loop()], [1], false);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[1].stop).not.toHaveBeenCalled();
  });
  it("cancels a pending device resume before any private sound can start", async () => {
    const { engine, context, sources } = audioFixture();
    let finish!: () => void;
    context.resume.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const start = engine.play([loop()], [1], false); engine.stop(); finish();
    expect(await start).toBe(false); expect(sources).toHaveLength(0);
  });
  it("preserves pause position and resets both elements on restart", async () => {
    const { engine, context, sources } = audioFixture();
    await engine.play([loop(4), loop(8)], [.4, .6], true);
    context.currentTime = 12.04; engine.pause();
    await engine.resume();
    expect(sources[2].start.mock.calls[0][1]).toBeCloseTo(2);
    expect(sources[3].start.mock.calls[0][1]).toBeCloseTo(2);
    await engine.resume(true);
    expect(sources[4].start.mock.calls[0][1]).toBe(0);
    expect(sources[5].start.mock.calls[0][1]).toBe(0);
  });
  it("reports refused playback and releases every node on disposal", async () => {
    const { engine, context, sources, gains } = audioFixture();
    context.state = "suspended";
    await expect(engine.play([loop()], [1], false)).rejects.toThrow("Activer le son");
    expect(sources).toHaveLength(0);
    context.state = "running"; await engine.play([loop()], [.7], false);
    engine.dispose(); expect(gains[0].disconnect).toHaveBeenCalledOnce(); expect(context.close).toHaveBeenCalledOnce();
  });
});
