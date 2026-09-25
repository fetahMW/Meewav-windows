import { computeWaveformPeaks, type WaveformPeak } from "../tools/audio/previewWaveform";
import { musicalRegion, nextBoundary, validGrid, wrap, type WaveBars, type WaveGrid, type WaveRegion } from "./waveMusicalGrid";

export type WaveAudioAsset = { id: string; url?: string; path?: string; title: string; bpm?: number; bars?: number; version?: number };
/** `beat` is the internal collective transport used by the Beat module.
 * The host-facing audition selector exposes `loop`, `base` and `mix`. */
export type WaveListeningMode = "beat" | "loop" | "base" | "mix";
type Voice = { source: AudioBufferSourceNode; gain: GainNode; starts: number; ends?: number; stopped?: boolean };
export type WaveVoteEligibility = { asset: WaveAudioAsset; open: boolean; ready: boolean; rightsConfirmed: boolean; lockedVersion: number; mode: "solo" | "beat"; preMixed: boolean };
type Layer = { asset: WaveAudioAsset; gain: number; audible: boolean };
export type WaveTransportSnapshot = {
  referencePeaks: readonly WaveformPeak[]; referencePeriod: number; referenceId: string | null; referenceLoading: boolean;
  playing: boolean; position: number; duration: number; grid: WaveGrid; bars: WaveBars; region: WaveRegion | null; regionMode: "musical" | "free";
  candidate: WaveAudioAsset | null; audibleCandidateId: string | null; armedAt: number | null;
  voteEligible: boolean; voteBroadcast: boolean;
  loading: boolean; mode: WaveListeningMode; quickPreview: boolean; gain: number; offset: number; error: string; notice: string;
};

/** Room-owned clock. All sound starts/loops/fades are scheduled by Web Audio,
 * never by React renders or elapsed setInterval time. The UI ticker only reports position. */
export class WaveAudioTransport {
  private context?: AudioContext;
  private output?: GainNode;
  private layerOutput?: GainNode;
  private beatPreview?: GainNode;
  private layerPreview?: GainNode;
  private privatePreview?: AudioNode;
  private privateBus?: GainNode;
  private beatProgram?: GainNode;
  private layerProgram?: GainNode;
  private program?: GainNode;
  private voteVoice?: Voice;
  private voteEligibility: WaveVoteEligibility | null = null;
  private voteGeneration = 0;
  private reference: { asset: WaveAudioAsset; buffer: AudioBuffer; originalBuffer: AudioBuffer; rate: number; period: number; voice?: Voice } | null = null;
  private candidateBuffer?: AudioBuffer;
  private voices: Voice[] = [];
  private liveVoices = new Set<Voice>();
  private layerVoices = new Map<string, Voice>();
  private layerAssets: Layer[] = [];
  private layerGains = new Map<string, number>();
  private referenceGain = 1;
  private referenceAudible = true;
  private referenceMuted = false;
  private referenceRepeat = true;
  private referenceEndedListeners = new Set<() => void>();
  private cacheBytes = new Map<string, number>();
  private requests = new Map<string, AbortController>();
  private cache = new Map<string, Promise<AudioBuffer>>();
  private generation = 0;
  private referenceGeneration = 0;
  private playbackGeneration = 0;
  private anchorTime = 0;
  private anchorPosition = 0;
  private ticker?: ReturnType<typeof setInterval>;
  private listeners = new Set<() => void>();
  private state: WaveTransportSnapshot = { referencePeaks: [], referencePeriod: 0, referenceId: null, referenceLoading: false, playing: false, position: 0, duration: 0,
    grid: { bpm: 0, beatsPerBar: 4, origin: 0 }, bars: 4, region: null, regionMode: "musical",
    candidate: null, audibleCandidateId: null, voteEligible: false, voteBroadcast: false, armedAt: null, loading: false, mode: "beat", quickPreview: false, gain: .75, offset: 0, error: "", notice: "" };
  constructor(private resolveUrl: (asset: WaveAudioAsset) => Promise<string>, private makeContext = () => new AudioContext({ latencyHint: "interactive" })) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(patch: Partial<WaveTransportSnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }
  getContext() { return this.context ??= this.makeContext(); }
  /** Reference/base input. Approved collective layers use a separate bus. */
  getProgramInput() { return this.output ??= this.getContext().createGain(); }
  /** Approved layers have their own preview bus so BASE can exclude them
   * without ever changing the public/programme routing. */
  private getLayerInput() { return this.layerOutput ??= this.getContext().createGain(); }
  connect(preview: GainNode, program: GainNode) {
    const output = this.getProgramInput();
    const layers = this.getLayerInput();
    output.disconnect();
    layers.disconnect();
    this.beatPreview = this.getContext().createGain();
    output.connect(this.beatPreview); this.beatPreview.connect(preview);
    this.layerPreview = this.getContext().createGain();
    layers.connect(this.layerPreview); this.layerPreview.connect(preview);
    this.privatePreview = preview;
    if (this.privateBus) {
      this.privateBus.disconnect();
      this.privateBus.connect(preview);
    }
    this.program = program;
    this.beatProgram = this.getContext().createGain(); output.connect(this.beatProgram); this.beatProgram.connect(program);
    this.layerProgram = this.getContext().createGain(); layers.connect(this.layerProgram); this.layerProgram.connect(program);
    this.updateMode();
  }
  private getPrivateBus() {
    if (!this.privateBus) {
      this.privateBus = this.getContext().createGain();
      this.privateBus.gain.value = this.state.quickPreview || this.state.mode !== "beat" ? this.state.gain : 0;
      // The candidate shares the Mixer's musical preview fader with the
      // reference/layers, but deliberately has no edge to the programme.
      this.privateBus.connect(this.privatePreview ?? this.getContext().destination);
    }
    return this.privateBus;
  }
  private async decode(asset: WaveAudioAsset) {
    const key = `${asset.id}|${asset.version ?? 0}|${asset.url ?? asset.path}`;
    const known = this.cache.get(key);
    if (known) { this.cache.delete(key); this.cache.set(key, known); return known; }
    const controller = new AbortController();
    this.requests.set(key, controller);
    const pending = (async () => {
      const url = await this.resolveUrl(asset);
      if (!url) throw new Error("Fichier audio absent.");
      const timer = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try { response = await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error("Téléchargement audio indisponible.");
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) throw new Error("Chargement remplacé.");
      if (bytes.byteLength > 64 * 1024 * 1024) throw new Error("Fichier trop volumineux pour cette audition (64 Mo maximum).");
      const buffer = await this.getContext().decodeAudioData(bytes);
      if (controller.signal.aborted) throw new Error("Chargement remplacé.");
      if (!buffer.length || !Number.isFinite(buffer.duration)) throw new Error("Fichier audio illisible.");
      const size = buffer.length * buffer.numberOfChannels * 4;
      if (size > 128 * 1024 * 1024) throw new Error("Audio décodé trop volumineux pour le cache d’audition.");
      this.cacheBytes.set(key, size);
      while ([...this.cacheBytes.values()].reduce((sum, value) => sum + value, 0) > 192 * 1024 * 1024) this.evict(this.cache.keys().next().value!);
      return buffer;
    })();
    this.cache.set(key, pending);
    // Current voices keep their buffer; the LRU retains only the next few decodes.
    while (this.cache.size > 6) this.evict(this.cache.keys().next().value!);
    try { return await pending; } catch (error) { this.evict(key); throw error; } finally { this.requests.delete(key); }
  }
  private evict(key: string) { this.requests.get(key)?.abort(); this.requests.delete(key); this.cache.delete(key); this.cacheBytes.delete(key); }
  preload(asset?: WaveAudioAsset) { if (asset) void this.decode(asset).catch(() => undefined); }
  setGrid(grid: WaveGrid) {
    if (JSON.stringify(grid) === JSON.stringify(this.state.grid)) return;
    if (!validGrid(grid)) { this.patch({ error: "BPM manquant : renseignez une grille musicale valide dans Régie." }); return; }
    const previous = this.state.grid;
    const playing = this.state.playing; const position = this.position();
    if (playing) this.pauseTransport(false);
    this.patch({ grid, error: "" });
    const reference = this.reference;
    if (reference?.asset.bpm && reference.asset.bars) {
      try {
        const { buffer, rate } = this.musicalBuffer(reference.originalBuffer, reference.asset);
        reference.buffer = buffer; reference.rate = rate;
        reference.period = 60 / reference.asset.bpm * grid.beatsPerBar * reference.asset.bars;
        this.patch({ referencePeriod: reference.period / rate,
          referencePeaks: computeWaveformPeaks(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), 512) });
      } catch {
        this.patch({ grid: previous, error: "Cette signature ne correspond pas à la longueur de la référence." });
        if (playing) void this.play().catch(() => undefined);
        return;
      }
    }
    if (this.state.region) {
      if (this.state.regionMode === "free") this.setFreeRegion(this.state.region.start, this.state.region.end);
      else this.setRegion(this.state.region.start, this.state.bars);
    }
    else this.patch({ duration: reference ? reference.period / reference.rate : this.state.duration, position });
    if (playing) void this.play().catch(() => this.patch({ error: "Reprise audio indisponible." }));
  }
  async setReference(asset: WaveAudioAsset) {
    const key = `${asset.id}|${asset.url ?? asset.path}`;
    if (this.reference && `${this.reference.asset.id}|${this.reference.asset.url ?? this.reference.asset.path}` === key) return;
    const generation = ++this.referenceGeneration;
    this.patch({ referenceLoading: true, error: "" });
    try {
      const decoded = await this.decode(asset);
      const { buffer, rate } = asset.bars && asset.bpm ? this.musicalBuffer(decoded, asset) : { buffer: decoded, rate: 1 };
      if (generation !== this.referenceGeneration) return;
      if (this.reference?.voice) this.stopVoice(this.reference.voice);
      const period = asset.bpm && asset.bars ? 60 / asset.bpm * this.state.grid.beatsPerBar * asset.bars : buffer.duration;
      this.reference = { asset, buffer, originalBuffer: decoded, rate, period };
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      this.patch({ referenceId: asset.id, referenceLoading: false, referencePeaks: computeWaveformPeaks(channels, 512), referencePeriod: period / rate, duration: Math.max(period / rate, this.state.region?.end ?? 0), error: "" });
      if (this.state.playing) this.startReference(this.getContext().currentTime + .02, this.position());
    } catch (error) { if (generation === this.referenceGeneration) this.patch({ referenceLoading: false, error: error instanceof Error ? error.message : "Référence indisponible." }); }
  }
  position() {
    if (!this.state.playing) return this.state.position;
    const position = this.anchorPosition + Math.max(0, this.getContext().currentTime - this.anchorTime);
    const region = this.playbackRegion();
    const duration = this.reference ? this.reference.period / this.reference.rate : this.state.duration;
    return region ? region.start + wrap(position - region.start, region.end - region.start)
      : this.shouldRepeatReference() ? wrap(position, Math.max(.001, duration)) : Math.min(position, duration);
  }
  subscribeReferenceEnded = (listener: () => void) => {
    this.referenceEndedListeners.add(listener);
    return () => { this.referenceEndedListeners.delete(listener); };
  };
  setReferenceRepeat(repeat: boolean) {
    this.referenceRepeat = repeat;
    this.updateReferenceLoop();
  }
  // Playlist options govern the full Beat. Audition and quick solo keep their
  // musical repetition, independently of the playlist's order/shuffle choice.
  private shouldRepeatReference() {
    if (this.referenceRepeat || this.state.quickPreview) return true;
    // A declared musical base is intrinsically a loop. A long imported
    // production keeps the playlist's order/shuffle ending semantics in BASE.
    if (this.state.mode === "beat") return false;
    if (this.state.mode === "base") {
      return Boolean(this.reference?.asset.bpm && this.reference.asset.bars);
    }
    return true;
  }
  private playbackRegion() {
    // BASE follows the complete production timeline while the candidate loops
    // beside it. BOUCLE/MIX remain tied to the host's musical A/B zone.
    return this.state.quickPreview || this.state.mode === "beat" || this.state.mode === "base" ? null : this.state.region;
  }
  private voice(buffer: AudioBuffer, destination: AudioNode, when: number, offset: number, length = buffer.duration, rate = 1) {
    const context = this.getContext();
    const source = context.createBufferSource(); const gain = context.createGain();
    source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = length;
    source.playbackRate.value = rate; source.connect(gain); gain.connect(destination);
    gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(1, when + .008);
    source.start(when, wrap(offset, length));
    const voice: Voice = { source, gain, starts: when };
    this.liveVoices.add(voice);
    source.onended = () => { this.liveVoices.delete(voice); source.disconnect(); gain.disconnect(); };
    return voice;
  }
  private stopVoice(voice: Voice, when = this.getContext().currentTime) {
    if (voice.stopped) return;
    voice.stopped = true;
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, when);
    voice.gain.gain.linearRampToValueAtTime(0, when + .008);
    try { voice.source.stop(when + .009); } catch { /* already ended */ }
    voice.ends = when;
  }
  private startReference(when: number, position: number) {
    if (!this.reference) return;
    if (this.reference.voice) this.stopVoice(this.reference.voice);
    const { buffer, rate, period } = this.reference;
    const region = this.playbackRegion();
    const voice = this.voice(buffer, this.getProgramInput(), when, position * rate, period, rate);
    voice.source.loop = this.shouldRepeatReference();
    const cleanup = voice.source.onended;
    voice.source.onended = (event) => {
      cleanup?.call(voice.source, event);
      // A stopped/replaced source must never advance the playlist.
      if (voice.stopped || this.reference?.voice !== voice || !this.state.playing || this.shouldRepeatReference()) return;
      this.pauseTransport(true);
      this.patch({ position: period / rate });
      this.referenceEndedListeners.forEach(listener => listener());
    };
    // A long reference uses native A/B looping. A short base repeats across the larger musical zone.
    if (region && region.end * rate <= period + .001) {
      voice.source.loopStart = region.start * rate; voice.source.loopEnd = region.end * rate;
    }
    voice.gain.gain.cancelScheduledValues(when); voice.gain.gain.setValueAtTime(this.referenceGain, when);
    this.reference.voice = voice;
  }
  async play() {
    if (!this.reference) throw new Error("Chargez le Beat de référence avant la lecture.");
    if (this.state.playing) return;
    const generation = this.playbackGeneration;
    const context = this.getContext();
    await context.resume();
    // A concurrent Play must not create a second reference. Pause/disposal
    // also invalidates a resume that is still waiting on the audio device.
    if (generation !== this.playbackGeneration || context !== this.context || this.state.playing) return;
    const now = context.currentTime + .025;
    this.anchorTime = now;
    const region = this.playbackRegion();
    const referenceDuration = this.reference.period / this.reference.rate;
    this.anchorPosition = region ? region.start + wrap(this.state.position - region.start, region.end - region.start)
      : !this.shouldRepeatReference() && this.state.position >= referenceDuration ? 0 : this.state.position;
    this.patch({ playing: true, position: this.anchorPosition });
    this.startReference(now, this.anchorPosition);
    if (this.candidateBuffer) this.armCandidate(now);
    void this.syncLayers(this.layerAssets);
    if (this.state.voteBroadcast) void this.scheduleVote(now);
    this.ticker = setInterval(() => {
      const time = this.getContext().currentTime;
      const arrived = this.state.armedAt !== null && time >= this.state.armedAt;
      this.voices = this.voices.filter((voice) => { if (voice.ends !== undefined && time > voice.ends + .02) { this.stopVoice(voice); return false; } return true; });
      this.patch({ position: this.position(), ...(arrived ? { armedAt: null, audibleCandidateId: this.state.candidate?.id ?? null } : {}) });
    }, 50);
  }
  pause() { this.pauseTransport(true); }
  private pauseTransport(resetQuickPreview: boolean) {
    this.playbackGeneration++;
    this.voteGeneration++;
    const position = this.position();
    // Includes fading/armed sources even when their logical slot was replaced.
    this.liveVoices.forEach((voice) => this.stopVoice(voice));
    if (this.reference) this.reference.voice = undefined;
    this.voices = [];
    this.voteVoice = undefined;
    this.layerVoices.clear();
    clearInterval(this.ticker);
    this.patch({ playing: false, position, armedAt: null, audibleCandidateId: null, ...(resetQuickPreview ? { quickPreview: false } : {}) });
    this.updateMode();
  }
  seek(position: number) {
    const playing = this.state.playing;
    this.pauseTransport(false); this.patch({ position: Math.max(0, position) });
    if (playing) void this.play().catch(() => this.patch({ error: "Reprise audio indisponible." }));
  }
  setRegion(start: number, bars: WaveBars, enabled = true) {
    if (!validGrid(this.state.grid)) { this.patch({ error: "Renseignez un BPM valide avant d’activer A/B." }); return; }
    if (this.state.candidate?.bars && bars < this.state.candidate.bars) { this.patch({ notice: `Cette proposition nécessite ${this.state.candidate.bars} mesures.` }); return; }
    const referenceDuration = this.reference ? this.reference.period / this.reference.rate : this.state.duration;
    const region = enabled ? musicalRegion(start, bars, this.state.grid, referenceDuration) : null;
    this.applyRegion(region, bars, "musical");
  }
  setFreeRegion(start: number, end: number, enabled = true) {
    if (!enabled) { this.applyRegion(null, this.state.bars, "free"); return; }
    const duration = this.reference ? this.reference.period / this.reference.rate : this.state.duration;
    const minimum = this.state.candidate?.bars && validGrid(this.state.grid)
      ? this.state.candidate.bars * 60 / this.state.grid.bpm * this.state.grid.beatsPerBar : .25;
    if (!Number.isFinite(start) || !Number.isFinite(end) || duration < minimum) return;
    const clampedStart = Math.max(0, Math.min(start, duration - minimum));
    const clampedEnd = Math.max(clampedStart + minimum, Math.min(end, duration));
    this.applyRegion({ start: clampedStart, end: clampedEnd }, this.state.bars, "free");
  }
  private applyRegion(region: WaveRegion | null, bars: WaveBars, regionMode: "musical" | "free") {
    const position = this.position();
    this.patch({ bars, region, regionMode, duration: Math.max((this.reference ? this.reference.period / this.reference.rate : 0), region?.end ?? 0) });
    if (!this.playbackRegion()) {
      // The A/B selection remains available for audition, but never traps the
      // main BEAT cursor or a quick solo inside that selection.
      if (this.state.playing) { this.anchorPosition = position; this.anchorTime = this.getContext().currentTime; }
      this.updateReferenceLoop();
      this.patch({ position });
      return;
    }
    if (this.state.playing && (!region || (position >= region.start && position < region.end))) {
      this.anchorPosition = position; this.anchorTime = this.getContext().currentTime;
      const reference = this.reference;
      if (reference?.voice) {
        reference.voice.source.loopStart = region && region.end * reference.rate <= reference.period ? region.start * reference.rate : 0;
        reference.voice.source.loopEnd = region && region.end * reference.rate <= reference.period ? region.end * reference.rate : reference.period;
      }
      this.patch({ position });
    } else this.seek(region ? Math.max(region.start, Math.min(position, region.end - .001)) : position);
  }
  async select(asset: WaveAudioAsset | null) {
    const sameCandidate = asset && JSON.stringify(asset) === JSON.stringify(this.state.candidate);
    if (sameCandidate && this.candidateBuffer) return;
    if (sameCandidate && this.state.loading) {
      // Selection and Play can be two consecutive clicks while the same WAV is
      // still decoding. Let the second command await that decode instead of
      // reporting a false ready state and silently dropping Play.
      await new Promise<void>((resolve) => {
        const unsubscribe = this.subscribe(() => {
          const snapshot = this.getSnapshot();
          if (JSON.stringify(snapshot.candidate) !== JSON.stringify(asset) || !snapshot.loading) {
            unsubscribe();
            resolve();
          }
        });
      });
      return;
    }
    if (this.state.candidate?.id !== asset?.id) this.setVoteBroadcast(false);
    const generation = ++this.generation;
    if (this.state.quickPreview) this.clearCandidateVoices();
    else this.cancelArmed();
    this.patch({ voteEligible: this.voteEligibility?.asset.id === asset?.id && Boolean(this.voteEligibility?.ready), candidate: asset, loading: Boolean(asset), error: "", notice: "", offset: 0 });
    this.candidateBuffer = undefined;
    this.updateMode();
    if (!asset) { this.voices.forEach((voice) => this.stopVoice(voice)); this.voices = []; this.patch({ audibleCandidateId: null }); this.updateMode(); return; }
    try {
      if (!validGrid(this.state.grid) || !asset.bpm || ![4, 8, 16].includes(asset.bars ?? 0)) throw new Error("BPM ou longueur musicale manquante : audition non armée.");
      const buffer = await this.decode(asset);
      if (generation !== this.generation) return;
      this.candidateBuffer = buffer;
      if (this.state.regionMode === "free" && this.state.region) {
        const before = this.state.region;
        this.setFreeRegion(before.start, before.end);
        if (this.state.region && this.state.region.end > before.end) {
          this.patch({ notice: `Zone A–B étendue pour écouter les ${asset.bars} mesures de la proposition.` });
        }
      } else if (asset.bars! > this.state.bars) {
        this.setRegion(this.state.region?.start ?? this.state.position, asset.bars as WaveBars);
        this.patch({ notice: `Zone étendue à ${asset.bars} mesures pour écouter la proposition entière.` });
      }
      this.patch({ loading: false });
      if (this.state.playing) this.armCandidate(this.nextCandidateStart());
      this.updateMode();
    } catch (error) {
      if (generation !== this.generation) return;
      this.voices.forEach((voice) => this.stopVoice(voice)); this.voices = [];
      this.patch({ loading: false, audibleCandidateId: null, error: error instanceof Error ? error.message : "Audition indisponible." });
      this.updateMode();
    }
  }
  private cancelArmed() {
    if (!this.context) return;
    const now = this.context.currentTime;
    // The UI ticker can be delayed in a background tab. Never revive a voice
    // whose handover has already passed: retain only the latest active source.
    const current = this.voices.filter((voice) => !voice.stopped && voice.starts <= now && (voice.ends === undefined || voice.ends > now))
      .sort((a, b) => b.starts - a.starts)[0];
    this.voices.forEach((voice) => { if (voice !== current) this.stopVoice(voice); });
    if (current) {
      current.gain.gain.cancelScheduledValues(now);
      // Hold the actual current level. Restoring 1 here created a short burst
      // when a muted or low-fader candidate was replaced.
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.ends = undefined;
    }
    this.voices = current ? [current] : [];
    this.patch({ armedAt: null });
  }
  private clearCandidateVoices() {
    this.voices.forEach((voice) => this.stopVoice(voice));
    this.voices = [];
    this.patch({ armedAt: null, audibleCandidateId: null });
  }
  private nextCandidateStart() {
    // BOUCLE is an isolated audition: selecting another card must replace the
    // audible loop immediately, just like a pad, without waiting for the end
    // of a 4/8/16-bar A/B region. BASE and MIX stay quantized to their shared
    // musical boundary because other sources remain audible beside it.
    const immediate = this.state.quickPreview || this.state.mode === "loop";
    return this.getContext().currentTime + (immediate ? .025 : nextBoundary(this.position(), this.state.grid, this.playbackRegion()));
  }
  private musicalBuffer(buffer: AudioBuffer, asset: WaveAudioAsset) {
    if (!asset.bpm || ![4, 8, 16].includes(asset.bars ?? 0) || !validGrid(this.state.grid)) throw new Error("BPM ou longueur musicale manquante.");
    const period = 60 / asset.bpm * this.state.grid.beatsPerBar * asset.bars!;
    if (buffer.duration > period + .1) throw new Error("Le fichier dépasse sa longueur déclarée. Corrigez ses mesures avant l’audition.");
    if (Math.abs(buffer.duration - period) > .001) {
      const padded = this.getContext().createBuffer(buffer.numberOfChannels, Math.ceil(period * buffer.sampleRate), buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) padded.copyToChannel(buffer.getChannelData(channel).subarray(0, padded.length), channel);
      if (buffer.duration < period - .1 && !this.state.notice.includes("Fichier plus court")) this.patch({ notice: `${this.state.notice} Fichier plus court que ses mesures déclarées : fin complétée par du silence. Vérifiez le calage.`.trim() });
      buffer = padded;
    }
    return { buffer, rate: this.state.grid.bpm / asset.bpm };
  }
  private candidateCollectiveLayer() {
    const candidateId = this.state.candidate?.id;
    return candidateId ? this.layerAssets.find((layer) => layer.asset.id === candidateId) : undefined;
  }
  private candidateUsesCollectiveBeat() {
    // MIX must not add a second copy of an already-approved layer. BOUCLE,
    // BASE and quick preview use its private voice, but that voice still obeys
    // the layer's fader, mute and solo-derived audibility.
    return !this.state.quickPreview
      && (this.state.mode === "beat" || this.state.mode === "mix")
      && Boolean(this.candidateCollectiveLayer());
  }
  private candidateVoiceGain() {
    const layer = this.candidateCollectiveLayer();
    return layer ? layer.audible ? layer.gain : 0 : 1;
  }
  private updateCandidateVoiceGain() {
    if (!this.context) return;
    const gain = this.candidateVoiceGain();
    this.voices.forEach((voice) => {
      if (voice.stopped) return;
      voice.gain.gain.setTargetAtTime(gain, this.context!.currentTime, .008);
    });
  }
  private armCandidate(when: number) {
    if (!this.candidateBuffer || !this.state.candidate) return;
    if (this.candidateUsesCollectiveBeat()) {
      this.clearCandidateVoices();
      return;
    }
    this.cancelArmed();
    const asset = this.state.candidate;
    let buffer: AudioBuffer; let rate: number;
    try { ({ buffer, rate } = this.musicalBuffer(this.candidateBuffer, asset)); }
    catch (error) {
      this.voices.forEach(voice => this.stopVoice(voice)); this.voices = [];
      this.patch({ audibleCandidateId: null, error: error instanceof Error ? error.message : "Longueur musicale invalide.", loading: false });
      this.updateMode(); return;
    }
    const voice = this.voice(buffer, this.getPrivateBus(), when, this.state.offset * rate, 60 / asset.bpm! * this.state.grid.beatsPerBar * asset.bars!, rate);
    const candidateGain = this.candidateVoiceGain();
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(0, when);
    voice.gain.gain.linearRampToValueAtTime(candidateGain, when + .008);
    // Gain automation is cancellable until the boundary; rapid selections cannot kill the current audition early.
    this.voices.forEach((old) => {
      old.gain.gain.cancelScheduledValues(when);
      old.gain.gain.setValueAtTime(old.gain.gain.value, when);
      old.gain.gain.linearRampToValueAtTime(0, when + .008);
      old.ends = when;
    });
    this.voices.push(voice); this.patch({ armedAt: when, error: "" });
  }
  setVoteEligibility(eligibility: WaveVoteEligibility | null) {
    const valid = eligibility && eligibility.open && eligibility.ready && eligibility.rightsConfirmed
      && eligibility.asset.version === eligibility.lockedVersion;
    const next = valid ? eligibility : null;
    if (JSON.stringify(next) === JSON.stringify(this.voteEligibility)) return;
    this.setVoteBroadcast(false);
    this.voteEligibility = next;
    this.patch({ voteEligible: Boolean(next && next.asset.id === this.state.candidate?.id) });
  }
  setVoteBroadcast(enabled: boolean) {
    this.voteGeneration++;
    if (this.voteVoice) { this.stopVoice(this.voteVoice); this.voteVoice = undefined; }
    const allowed = enabled && this.state.voteEligible && Boolean(this.voteEligibility);
    this.patch({ voteBroadcast: allowed });
    if (this.beatProgram) this.beatProgram.gain.setTargetAtTime(1, this.getContext().currentTime, .008);
    if (this.layerProgram) this.layerProgram.gain.setTargetAtTime(1, this.getContext().currentTime, .008);
    if (allowed && this.state.playing) void this.scheduleVote(this.getContext().currentTime + nextBoundary(this.position(), this.state.grid, this.state.region));
  }
  private async scheduleVote(when: number) {
    const eligibility = this.voteEligibility; const generation = this.voteGeneration;
    if (!eligibility || !this.program || !this.state.voteBroadcast) return;
    try {
      const decoded = await this.decode(eligibility.asset);
      if (generation !== this.voteGeneration || !this.state.playing || !this.state.voteBroadcast) return;
      const { buffer, rate } = this.musicalBuffer(decoded, eligibility.asset);
      const now = this.getContext().currentTime;
      const start = when >= now + .01 ? when : now + nextBoundary(this.position(), this.state.grid, this.state.region);
      this.voteVoice = this.voice(buffer, this.program, start, 0, 60 / eligibility.asset.bpm! * this.state.grid.beatsPerBar * eligibility.asset.bars!, rate);
      const collectiveGain = eligibility.preMixed || eligibility.mode === "solo" ? 0 : 1;
      this.beatProgram?.gain.setValueAtTime(collectiveGain, start);
      this.layerProgram?.gain.setValueAtTime(collectiveGain, start);
    } catch { this.setVoteBroadcast(false); this.patch({ error: "Aperçu officiel indisponible : candidate non diffusée. Le Beat continue." }); }
  }
  setMode(mode: WaveListeningMode) {
    const position = this.position();
    const previousMode = this.state.mode;
    const wasQuickPreview = this.state.quickPreview;
    this.patch({ mode, quickPreview: false });
    this.updateMode();
    if (wasQuickPreview || previousMode !== mode
      && (previousMode === "beat" || previousMode === "base" || mode === "beat" || mode === "base")) this.applyListeningRegion(position);
    else if (previousMode !== mode) this.restartCandidateForListeningMode();
  }
  setQuickPreview(enabled: boolean) {
    if (enabled === this.state.quickPreview) return;
    const position = this.position();
    this.patch({ quickPreview: enabled });
    this.updateMode();
    this.applyListeningRegion(position);
  }
  private updateReferenceLoop() {
    const reference = this.reference;
    if (!reference?.voice) return;
    const region = this.playbackRegion();
    const insideReference = region && region.end * reference.rate <= reference.period + .001;
    reference.voice.source.loop = this.shouldRepeatReference();
    reference.voice.source.loopStart = insideReference ? region.start * reference.rate : 0;
    reference.voice.source.loopEnd = insideReference ? region.end * reference.rate : reference.period;
  }
  private applyListeningRegion(position: number) {
    const region = this.playbackRegion();
    if (region && (position < region.start || position >= region.end)) {
      // Entering BOUCLE/MIX uses the selected zone. Leaving it keeps the cursor
      // where it was and restores native full-reference playback instead.
      this.seek(region.start);
      return;
    }
    if (this.state.playing) { this.anchorPosition = position; this.anchorTime = this.getContext().currentTime; }
    this.updateReferenceLoop();
    this.patch({ position });
    this.restartCandidateForListeningMode();
  }
  private restartCandidateForListeningMode() {
    // A quick solo is immediate and intentionally unquantized. Returning to
    // normal listening rejoins the existing musical boundary, not its solo phase.
    this.clearCandidateVoices();
    if (this.state.playing && this.candidateBuffer) this.armCandidate(this.nextCandidateStart());
  }
  private updateMode() {
    // Only private gains change. Approved collective layers remain in the Beat;
    // neither the main selector nor a quick solo ever reroutes the public bus.
    const solo = this.state.quickPreview || this.state.mode === "loop";
    if (this.beatPreview) this.beatPreview.gain.setTargetAtTime(solo ? 0 : 1, this.getContext().currentTime, .008);
    if (this.layerPreview) this.layerPreview.gain.setTargetAtTime(solo || this.state.mode === "base" ? 0 : 1, this.getContext().currentTime, .008);
    if (this.privateBus) this.privateBus.gain.setTargetAtTime(this.state.quickPreview || this.state.mode !== "beat" ? this.state.gain : 0, this.getContext().currentTime, .008);
    this.updateReferenceGain();
  }
  setGain(gain: number) { this.patch({ gain: Math.max(0, Math.min(1, gain)) }); this.updateMode(); }
  setOffset(offset: number) { this.patch({ offset }); if (this.state.playing) this.armCandidate(this.nextCandidateStart()); }
  private updateReferenceGain() {
    // BASE is an explicit comparison against the reference. It ignores a Solo
    // placed on another collective layer, but still respects a real mute of the
    // base itself. MIX/BEAT continue to follow the collective Solo matrix.
    const audible = this.state.mode === "base" ? !this.referenceMuted : this.referenceAudible;
    this.referenceGain = audible ? this.layerGains.get("base") ?? 1 : 0;
    if (this.reference?.voice) this.reference.voice.gain.gain.setTargetAtTime(this.referenceGain, this.getContext().currentTime, .008);
  }
  setReferenceMix(audible: boolean, explicitlyMuted = !audible) {
    this.referenceAudible = audible;
    this.referenceMuted = explicitlyMuted;
    this.updateReferenceGain();
  }
  setLayerGain(id: string, gain: number) {
    this.layerGains.set(id, gain);
    this.layerAssets = this.layerAssets.map(layer => layer.asset.id === id ? { ...layer, gain } : layer);
    if (id === "base") { this.updateReferenceGain(); return; }
    const voice = this.layerVoices.get(id);
    const audible = this.layerAssets.find(layer => layer.asset.id === id)?.audible;
    if (voice) voice.gain.gain.setTargetAtTime(audible ? gain : 0, this.getContext().currentTime, .008);
    if (this.state.candidate?.id === id) this.updateCandidateVoiceGain();
  }
  async syncLayers(layers: Layer[]) {
    const candidateUsedBeat = this.candidateUsesCollectiveBeat();
    this.layerAssets = layers;
    // The latest room projection is authoritative. setLayerGain updates this
    // map immediately for a responsive fader, then the persisted projection
    // confirms or corrects that optimistic value here.
    layers.forEach((layer) => this.layerGains.set(layer.asset.id, layer.gain));
    const candidateUsesBeat = this.candidateUsesCollectiveBeat();
    this.updateCandidateVoiceGain();
    if (candidateUsesBeat) this.clearCandidateVoices();
    else if (candidateUsedBeat && this.state.playing && this.candidateBuffer) this.armCandidate(this.nextCandidateStart());
    if (!this.state.playing) return;
    this.layerVoices.forEach((voice, id) => { if (!layers.some((layer) => layer.asset.id === id)) { this.stopVoice(voice); this.layerVoices.delete(id); } });
    await Promise.all(layers.map(async (layer) => {
      const known = this.layerVoices.get(layer.asset.id);
      if (known) { known.gain.gain.setTargetAtTime(layer.audible ? layer.gain : 0, this.getContext().currentTime, .008); return; }
      try {
        const decoded = await this.decode(layer.asset);
        const { buffer, rate } = this.musicalBuffer(decoded, layer.asset);
        if (!this.state.playing || !this.layerAssets.includes(layer) || this.layerVoices.has(layer.asset.id)) return;
        const when = this.getContext().currentTime + .025;
        const voice = this.voice(buffer, this.getLayerInput(), when, (this.position() + .025 - this.state.grid.origin) * rate, 60 / layer.asset.bpm! * this.state.grid.beatsPerBar * layer.asset.bars!, rate);
        voice.gain.gain.cancelScheduledValues(when); voice.gain.gain.setValueAtTime(layer.audible ? layer.gain : 0, when);
        this.layerVoices.set(layer.asset.id, voice);
      } catch { this.patch({ notice: "Une piste collective est indisponible ; le Beat continue." }); }
    }));
  }
  dispose() { this.generation++; this.referenceGeneration++; this.pause(); this.requests.forEach(controller => controller.abort()); this.requests.clear(); this.cache.clear(); this.cacheBytes.clear(); this.liveVoices.clear(); this.listeners.clear(); this.referenceEndedListeners.clear(); this.privatePreview = undefined; void this.context?.close(); this.context = undefined; }
}
