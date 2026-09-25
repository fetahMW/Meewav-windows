import { describe, expect, it, vi } from 'vitest';
import { DesktopMediaDevices } from './DesktopMediaDevices';

describe('Desktop device ownership', () => {
  it('releases permission capture even when enumeration fails', async () => {
    const stop = vi.fn();
    const media = {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
      enumerateDevices: vi.fn().mockRejectedValue(new Error('device disconnected')),
    } as unknown as MediaDevices;
    await expect(new DesktopMediaDevices(media).requestDeviceLabels()).rejects.toThrow('device disconnected');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('never falls back to a different microphone or camera', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('missing device'));
    const devices = new DesktopMediaDevices({ getUserMedia } as unknown as MediaDevices);
    await expect(devices.captureCamera('camera-selected')).rejects.toThrow();
    await expect(devices.captureMicrophone('mic-selected')).rejects.toThrow();
    expect(getUserMedia.mock.calls).toEqual([
      [{ video: { deviceId: { exact: 'camera-selected' } }, audio: false }],
      [{ audio: { deviceId: { exact: 'mic-selected' } }, video: false }],
    ]);
  });

  it('does not request display capture when desktop selection is rejected', async () => {
    const getDisplayMedia = vi.fn();
    const devices = new DesktopMediaDevices({ getDisplayMedia } as unknown as MediaDevices, {
      version: 1,
      getCapabilities: vi.fn(), listCaptureSources: vi.fn(),
      selectCaptureSource: vi.fn().mockRejectedValue(new Error('source gone')),
    });
    await expect(devices.captureScreen('window:1')).rejects.toThrow('source gone');
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });
});
