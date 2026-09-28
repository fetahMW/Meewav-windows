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
    destination = {};
    createStereoPanner = () => ({ ...node(), pan: { setTargetAtTime: vi.fn() } });
    createDelay = () => ({ ...node(), delayTime: { setTargetAtTime: vi.fn() } });
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

it('keeps gain and mute choices across reconnects and routes monitoring separately', async () => {
  const gains: Array<{ gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; channelCount?: number }> = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const pan = { ...node(), pan: { setTargetAtTime: vi.fn() } };
  const delay = { ...node(), delayTime: { setTargetAtTime: vi.fn() } };
  const outputTrack = { kind: 'audio', readyState: 'live', enabled: true, stop: vi.fn() };
  const inputTrack = { ...outputTrack, stop: vi.fn() };
  const speakers = node();
  vi.stubGlobal('MediaStream', class {});
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 12; destination = speakers;
    resume = vi.fn().mockResolvedValue(undefined); close = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSource = node;
    createGain = () => { const gain = { ...node(), gain: { value: 1, setTargetAtTime: vi.fn() } }; gains.push(gain); return gain; };
    createStereoPanner = () => pan; createDelay = () => delay;
    createAnalyser = () => ({ ...node(), fftSize: 512, getFloatTimeDomainData: vi.fn() });
    createMediaStreamDestination = () => ({ ...node(), stream: { getAudioTracks: () => [outputTrack] } });
  });
  const source = new DesktopMusicSource(inputTrack as unknown as MediaStreamTrack);
  expect(gains[2].gain.value).toBe(0); // Never play through speakers on connection.
  expect(gains[2].connect).toHaveBeenCalledWith(speakers);
  source.setGain(.4);
  source.silence(); await source.start();
  expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledExactlyOnceWith(.4, 12, .01);
  source.setGain(0); source.silence(); await source.start();
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, .01);
  source.configure({ mono: true, pan: -1, delayMs: 250 });
  expect(gains[1].channelCount).toBe(1);
  expect(pan.pan.setTargetAtTime).toHaveBeenLastCalledWith(-1, 12, .01);
  expect(delay.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(.25, 12, .01);
  source.setMonitoring(true);
  expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 12, .01);
  expect(outputTrack.enabled).toBe(true);
  source.configure({ mono: false, pan: Number.NaN, delayMs: Number.POSITIVE_INFINITY });
  expect(pan.pan.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, .01);
  expect(delay.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, .01);
  source.dispose();
  expect(inputTrack.stop).not.toHaveBeenCalled(); // Caller owns the device capture.
  expect(outputTrack.stop).toHaveBeenCalledOnce();
});
