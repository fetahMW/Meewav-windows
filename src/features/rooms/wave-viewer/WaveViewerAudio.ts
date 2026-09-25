/** Private output only. No MediaStreamDestination, capture or publication API. */
export class WaveViewerAudio {
  private context: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private generation = 0;
  private buffers: AudioBuffer[] = [];
  private volumes: number[] = [];
  private outputVolume = 1;
  private loop = false;
  private startedAt = 0;
  private offset = 0;
  onEnded: () => void = () => undefined;

  constructor(private readonly createContext = () => new AudioContext()) {}
  private ctx() { return this.context ??= this.createContext(); }
  async decode(data: ArrayBuffer) { return this.ctx().decodeAudioData(data.slice(0)); }
  async load(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("La référence audio est indisponible.");
    return this.decode(await response.arrayBuffer());
  }
  async play(buffers: AudioBuffer[], volumes: number[], loop: boolean, restart = true) {
    this.pause();
    const generation = ++this.generation;
    const ctx = this.ctx();
    await ctx.resume();
    if (generation !== this.generation) return false;
    if (ctx.state !== "running") throw new Error("Activer le son pour démarrer l’écoute.");
    if (restart) this.offset = 0;
    this.buffers = buffers; this.volumes = volumes; this.loop = loop;
    const when = ctx.currentTime + 0.04;
    this.startedAt = when;
    this.sources = buffers.map((buffer, index) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = loop;
      gain.gain.value = Math.max(0, Math.min(1, volumes[index] ?? 1)) * this.outputVolume;
      source.connect(gain); gain.connect(ctx.destination);
      this.gains.push(gain);
      if (!loop && index === 0) source.onended = () => {
        if (generation !== this.generation) return;
        this.stop(); this.onEnded();
      };
      // All sources use the same hardware clock, including when resuming.
      source.start(when, this.offset % buffer.duration);
      return source;
    });
    return true;
  }
  setVolume(index: number, value: number) {
    this.volumes[index] = value;
    const gain = this.gains[index];
    if (gain && this.context) gain.gain.setTargetAtTime(value * this.outputVolume, this.context.currentTime, .015);
  }
  setOutputVolume(value: number) {
    this.outputVolume = Math.max(0, Math.min(1, value));
    this.gains.forEach((_, index) => this.setVolume(index, this.volumes[index] ?? 1));
  }
  pause() {
    ++this.generation;
    if (this.sources.length && this.context) this.offset += Math.max(0, this.context.currentTime - this.startedAt);
    this.sources.forEach(source => { source.onended = null; source.stop(); source.disconnect(); });
    this.gains.forEach(gain => gain.disconnect());
    this.sources = []; this.gains = [];
  }
  resume(restart = false) { return this.play(this.buffers, this.volumes, this.loop, restart); }
  stop() { this.pause(); this.offset = 0; }
  dispose() { this.stop(); this.buffers = []; void this.context?.close(); this.context = null; }
}
