import type { CaptureSource, DesktopBridge } from './RuntimeProvider';

/** Browser media APIs expose the OS devices, including USB/virtual inputs when installed. */
export class DesktopMediaDevices {
  constructor(private readonly media: MediaDevices = navigator.mediaDevices, private readonly bridge?: DesktopBridge) {}

  enumerate() { return this.media.enumerateDevices(); }
  watch(listener: () => void) {
    this.media.addEventListener('devicechange', listener);
    return () => this.media.removeEventListener('devicechange', listener);
  }
  captureCamera(deviceId: string) {
    return this.media.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
  }
  captureMicrophone(deviceId: string) {
    return this.media.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
  }
  captureMusic(deviceId: string) {
    return this.media.getUserMedia({ audio: { deviceId: { exact: deviceId },
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 },
    }, video: false });
  }
  async requestDeviceLabels(kind: 'audio' | 'video' = 'audio') {
    const stream = await this.media.getUserMedia(kind === 'audio' ? { audio: true } : { video: true });
    try { return await this.enumerate(); }
    finally { stream.getTracks().forEach((track) => track.stop()); }
  }
  async screenSources(): Promise<CaptureSource[]> {
    if (!this.bridge) throw new Error('Capture desktop indisponible.');
    return this.bridge.listCaptureSources();
  }
  async captureScreen(id: string, systemAudio = false) {
    if (!this.bridge) throw new Error('Capture desktop indisponible.');
    await this.bridge.selectCaptureSource(id, systemAudio);
    return this.media.getDisplayMedia({ video: true, audio: systemAudio });
  }
}
