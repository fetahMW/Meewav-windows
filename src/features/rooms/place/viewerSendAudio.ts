export const VIEWER_INPUTS = ["voice", "music", "system"] as const;
export type ViewerInput = (typeof VIEWER_INPUTS)[number];
export type ViewerFader = ViewerInput | "master";
export type ViewerLevels = Record<
  ViewerFader,
  { gain: number; muted: boolean }
>;
export const DEFAULT_VIEWER_LEVELS: ViewerLevels = {
  voice: { gain: 0.75, muted: false },
  music: { gain: 0.75, muted: false },
  system: { gain: 0.75, muted: false },
  master: { gain: 1, muted: false },
};
export function normalizeViewerLevels(value: unknown): ViewerLevels {
  const result = structuredClone(DEFAULT_VIEWER_LEVELS);
  if (!value || typeof value !== "object") return result;
  for (const id of [...VIEWER_INPUTS, "master"] as const) {
    const row = (value as Partial<ViewerLevels>)[id];
    if (!row) continue;
    result[id] = {
      gain: Number.isFinite(row.gain)
        ? Math.max(0, Math.min(1, row.gain))
        : result[id].gain,
      muted: row.muted === true,
    };
  }
  return result;
}
type InputGraph = {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  meter: AnalyserNode;
  track: MediaStreamTrack;
  cleanup: () => void;
};

/** Only personal inputs are accepted. No receive/monitor node is connected to this bus. */
export class ViewerSendAudio {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private master: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private inputs = new Map<ViewerInput, InputGraph>();
  private levels = normalizeViewerLevels(null);
  private musicEnabled = false;
  onChange: () => void = () => undefined;
  get track() {
    return this.destination?.stream.getAudioTracks()[0] ?? null;
  }
  get status() {
    return this.context?.state ?? "closed";
  }
  async prepare() {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.context = context;
      this.master = context.createGain();
      this.meter = context.createAnalyser();
      this.meter.fftSize = 256;
      this.limiter = context.createDynamicsCompressor();
      // Same safety ceiling as the existing personal voice engine.
      this.limiter.threshold.value = -2;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.08;
      this.destination = context.createMediaStreamDestination();
      this.master
        .connect(this.meter)
        .connect(this.limiter)
        .connect(this.destination);
      context.onstatechange = () => this.onChange();
      this.update(this.levels);
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.onChange();
    return this.track;
  }
  setInput(id: ViewerInput, track: MediaStreamTrack | null) {
    if (this.inputs.get(id)?.track === track) return;
    this.remove(id);
    if (
      !track ||
      track.readyState !== "live" ||
      track.kind !== "audio" ||
      !this.context ||
      !this.master
    )
      return;
    const source = this.context.createMediaStreamSource(
      new MediaStream([track]),
    );
    const gain = this.context.createGain(),
      meter = this.context.createAnalyser();
    meter.fftSize = 256;
    source.connect(gain).connect(meter).connect(this.master);
    const ended = () => {
      this.remove(id);
      this.onChange();
    };
    const changed = () => this.onChange();
    track.addEventListener("ended", ended);
    track.addEventListener("mute", changed);
    track.addEventListener("unmute", changed);
    this.inputs.set(id, {
      source,
      gain,
      meter,
      track,
      cleanup: () => {
        track.removeEventListener("ended", ended);
        track.removeEventListener("mute", changed);
        track.removeEventListener("unmute", changed);
      },
    });
    this.update(this.levels);
    this.onChange();
  }
  private remove(id: ViewerInput) {
    const row = this.inputs.get(id);
    if (!row) return;
    row.cleanup();
    row.source.disconnect();
    row.gain.disconnect();
    row.meter.disconnect();
    this.inputs.delete(id); // Upstream capture owns the source track, never stop it here.
  }
  enableMusic(enabled: boolean) {
    this.musicEnabled = enabled;
    this.update(this.levels);
  }
  update(levels: ViewerLevels) {
    this.levels = normalizeViewerLevels(levels);
    if (!this.context || !this.master) return;
    const set = (node: GainNode, value: number) => {
      node.gain.cancelScheduledValues(this.context!.currentTime);
      node.gain.setTargetAtTime(value, this.context!.currentTime, 0.008);
    };
    const master = this.levels.master;
    set(this.master, master.muted ? 0 : master.gain);
    this.inputs.forEach((row, id) =>
      set(
        row.gain,
        this.levels[id].muted || (id === "music" && !this.musicEnabled)
          ? 0
          : this.levels[id].gain,
      ),
    );
  }
  sample() {
    const peak = (meter: AnalyserNode | null) => {
      if (!meter || this.context?.state !== "running") return 0;
      const values = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(values);
      return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    };
    return {
      voice: peak(this.inputs.get("voice")?.meter ?? null),
      music: peak(this.inputs.get("music")?.meter ?? null),
      system: peak(this.inputs.get("system")?.meter ?? null),
      master: peak(this.meter),
    };
  }
  inputState(id: ViewerInput) {
    const row = this.inputs.get(id);
    return !row || row.track.readyState !== "live"
      ? "unavailable"
      : row.track.muted
        ? "disconnected"
        : this.context?.state !== "running"
          ? "reconnecting"
          : "active";
  }
  dispose() {
    VIEWER_INPUTS.forEach((id) => this.remove(id));
    this.track?.stop();
    this.master?.disconnect();
    this.meter?.disconnect();
    this.limiter?.disconnect();
    this.destination?.disconnect();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.destination = null;
    this.master = null;
    this.meter = null;
    this.limiter = null;
  }
}
