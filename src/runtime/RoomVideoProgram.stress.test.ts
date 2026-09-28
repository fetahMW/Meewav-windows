import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoomVideoProgram } from './RoomVideoProgram';
import { selectSceneSource } from './videoScene';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() }) as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getTracks: () => [{ stop: vi.fn() }] }) });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function capture() {
  const track = { readyState: 'live', muted: false, stop: vi.fn() };
  return { track, stream: { getVideoTracks: () => [track] } as unknown as MediaStream };
}
it('refuses disconnected and muted sources while preserving the current output', async () => {
  const engine = new RoomVideoProgram(); const a = capture(), b = capture();
  await engine.add('a', a.stream); await engine.add('b', b.stream);
  engine.take({ layout: 'full', sourceIds: ['a'] });
  b.track.readyState = 'ended';
  expect(() => engine.take({ layout: 'full', sourceIds: ['b'] })).toThrow('signal');
  b.track.readyState = 'live'; b.track.muted = true;
  expect(() => engine.take({ layout: 'split', sourceIds: ['a', 'b'] })).toThrow('signal');
  expect(engine.program.sourceIds).toEqual(['a']);
  engine.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it('survives 500 rapid transitions and cleans up every timer over 20 studio reopenings', async () => {
  const source = capture();
  for (let session = 0; session < 20; session++) {
    const engine = new RoomVideoProgram(); const output = engine.stream;
    await engine.add('a', source.stream); await engine.add('b', source.stream);
    for (let index = 0; index < 25; index++) {
      engine.take({ layout: index % 2 ? 'split' : 'full', sourceIds: ['a', 'b'] }, index % 3 ? 500 : 0);
      vi.advanceTimersByTime(40);
      expect(engine.stream).toBe(output);
    }
    engine.dispose(); engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
  }
  expect(source.track.stop).not.toHaveBeenCalled();
});
it('rejects a delayed video opening after disposal', async () => {
  let resolve!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  const engine = new RoomVideoProgram(); const pending = engine.add('a', capture().stream);
  engine.dispose(); resolve();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
});
it('reuses empty zones through 1000 selection cycles instead of accumulating invisible slots', () => {
  let ids = ['a', 'b'];
  for (let i = 0; i < 1000; i++) {
    ids = selectSceneSource(ids, 'a', false); ids = selectSceneSource(ids, 'a', true);
    expect(ids).toEqual(['a', 'b']);
  }
  expect(selectSceneSource(Array.from({ length: 9 }, (_, i) => String(i)), 'overflow', true)).toHaveLength(9);
});
