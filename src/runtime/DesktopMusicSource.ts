/** A Windows audio endpoint routed into the existing Room music transport. */
export class DesktopMusicSource {
  private readonly context: AudioContext;
  private readonly input: MediaStreamAudioSourceNode;
  private readonly gain: GainNode;
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
      this.meter = this.context.createAnalyser();
      this.meter.fftSize = 512;
      this.destination = this.context.createMediaStreamDestination();
      this.input.connect(this.gain);
      this.gain.connect(this.meter);
      this.meter.connect(this.destination);
      this.samples = new Float32Array(this.meter.fftSize);
      const track = this.destination.stream.getAudioTracks()[0];
      if (!track) throw new Error('Sortie musicale indisponible.');
      this.track = track;
    } catch (error) {
      void this.context.close().catch(() => undefined);
      throw error;
    }
  }

  async start() { await this.context.resume(); }
  setGain(value: number) {
    if (this.disposed) return;
    this.gain.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), this.context.currentTime, 0.01);
  }
  peak() {
    if (this.disposed || this.context.state !== 'running') return 0;
    this.meter.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return Math.min(1, peak);
  }
  silence() { this.setGain(0); this.track.enabled = false; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.track.enabled = false;
    this.track.stop();
    this.input.disconnect();
    this.gain.disconnect();
    this.meter.disconnect();
    void this.context.close().catch(() => undefined);
  }
}
