/** A Windows audio endpoint routed into the existing Room music transport. */
export class DesktopMusicSource {
  private readonly context: AudioContext;
  private readonly input: MediaStreamAudioSourceNode;
  private readonly gain: GainNode;
  private readonly channel: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly delay: DelayNode;
  private readonly monitor: GainNode;
  private readonly meter: AnalyserNode;
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  readonly track: MediaStreamTrack;
  private disposed = false;

  constructor(readonly inputTrack: MediaStreamTrack) {
    if (inputTrack.kind !== 'audio' || inputTrack.readyState !== 'live') throw new Error('Entrée musicale indisponible.');
    this.context = new AudioContext({ latencyHint: 'interactive' });
    try {
      this.input = this.context.createMediaStreamSource(new MediaStream([inputTrack]));
      this.gain = this.context.createGain();
      this.channel = this.context.createGain();
      this.channel.channelCountMode = 'explicit';
      this.channel.channelCount = 2;
      this.pan = this.context.createStereoPanner();
      this.delay = this.context.createDelay(1);
      this.monitor = this.context.createGain();
      this.monitor.gain.value = 0;
      this.meter = this.context.createAnalyser();
      this.meter.fftSize = 512;
      this.destination = this.context.createMediaStreamDestination();
      this.input.connect(this.channel);
      this.channel.connect(this.pan);
      this.pan.connect(this.delay);
      this.delay.connect(this.gain);
      this.gain.connect(this.meter);
      this.meter.connect(this.destination);
      this.meter.connect(this.monitor);
      this.monitor.connect(this.context.destination);
      this.samples = new Float32Array(this.meter.fftSize);
      const track = this.destination.stream.getAudioTracks()[0];
      if (!track) throw new Error('Sortie musicale indisponible.');
      this.track = track;
    } catch (error) {
      void this.context.close().catch(() => undefined);
      throw error;
    }
  }

  async start() {
    if (this.disposed) throw new Error('Source musicale fermée.');
    await this.context.resume();
    if (this.disposed) throw new Error('Source musicale fermée.');
    this.track.enabled = true;
  }
  setGain(value: number) {
    if (this.disposed) return;
    this.gain.gain.setTargetAtTime(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0, this.context.currentTime, 0.01);
  }
  configure({ mono, pan, delayMs }: { mono: boolean; pan: number; delayMs: number }) {
    if (this.disposed) return;
    this.channel.channelCount = mono ? 1 : 2;
    // Counter the equal-power panner's centre attenuation for a mono input.
    this.channel.gain.setTargetAtTime(mono ? Math.SQRT2 : 1, this.context.currentTime, .01);
    this.pan.pan.setTargetAtTime(Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0, this.context.currentTime, .01);
    this.delay.delayTime.setTargetAtTime(Number.isFinite(delayMs) ? Math.max(0, Math.min(1000, delayMs)) / 1000 : 0, this.context.currentTime, .01);
  }
  setMonitoring(enabled: boolean) {
    if (!this.disposed) this.monitor.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, .01);
  }
  peak() {
    if (this.disposed || this.context.state !== 'running') return 0;
    this.meter.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return Math.min(1, peak);
  }
  // Transport gate only: a reconnect must preserve the artist's fader value.
  silence() { this.track.enabled = false; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.track.enabled = false;
    this.track.stop();
    this.input.disconnect();
    this.channel.disconnect();
    this.pan.disconnect();
    this.delay.disconnect();
    this.monitor.disconnect();
    this.gain.disconnect();
    this.meter.disconnect();
    void this.context.close().catch(() => undefined);
  }
}
