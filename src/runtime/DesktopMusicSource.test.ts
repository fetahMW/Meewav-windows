import { afterEach, expect, it, vi } from 'vitest';
import { DesktopMusicSource } from './DesktopMusicSource';
import { DesktopMediaDevices } from './DesktopMediaDevices';
afterEach(() => vi.unstubAllGlobals());
it('restores audio after reconnect and cannot restart a disposed music source', async () => {
  const track = { kind: 'audio', readyState: 'live', enabled: true, stop: vi.fn() };
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('MediaStream', class {});
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; resume = vi.fn().mockResolvedValue(undefined); close = close;
    createMediaStreamSource = node;
    createGain = () => ({ ...node(), gain: { setTargetAtTime: vi.fn() } });
    createAnalyser = () => ({ ...node(), fftSize: 512, getFloatTimeDomainData: vi.fn() });
    createMediaStreamDestination = () => ({ ...node(), stream: { getAudioTracks: () => [track] } });
  });
  const source = new DesktopMusicSource(track as unknown as MediaStreamTrack);
  for (let i = 0; i < 30; i++) {
    source.silence(); expect(track.enabled).toBe(false);
    await source.start(); expect(track.enabled).toBe(true);
  }
  source.dispose(); source.dispose();
  await expect(source.start()).rejects.toThrow('fermée');
  expect(track.stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('preserves musical dynamics and stereo without speech processing', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({});
  await new DesktopMediaDevices({ getUserMedia } as unknown as MediaDevices).captureMusic('loopback');
  expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'loopback' }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }, video: false });
});
