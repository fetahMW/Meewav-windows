export type PlaceTwistKind =
  | "heartbeat"
  | "dj_horn"
  | "applause"
  | "crowd_boo"
  | "drum_roll"
  | "countdown";

export const PLACE_TWIST_ASSETS: Readonly<Record<PlaceTwistKind, string>> = {
  heartbeat: "/audio/rooms/twists/heartbeat.wav",
  dj_horn: "/audio/rooms/twists/air-horn-trimmed.wav",
  applause: "/audio/rooms/twists/applaudissements.m4a",
  crowd_boo: "/audio/rooms/twists/huees-du-public.mp3",
  drum_roll: "/audio/rooms/twists/mixkit-drum-roll-566.wav",
  countdown: "/audio/rooms/twists/countdown-10-seconds.wav",
};

export const DEFAULT_PLACE_TWIST_VOLUME = 0.2;

class PlaceTwistAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private applauseSource: AudioBufferSourceNode | null = null;
  private applauseOutput: GainNode | null = null;
  private hornTemplate: HTMLAudioElement | null = null;
  private hornVoices = new Set<HTMLAudioElement>();
  private hornOnIdle: (() => void) | null = null;
  private volume = DEFAULT_PLACE_TWIST_VOLUME;
  private cueTimer: ReturnType<typeof setInterval> | null = null;

  private clearCueTimer() {
    if (this.cueTimer !== null) clearInterval(this.cueTimer);
    this.cueTimer = null;
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.audio) this.audio.volume = this.volume;
    this.hornVoices.forEach((voice) => { voice.volume = this.volume; });
    if (this.applauseOutput && this.context) {
      this.applauseOutput.gain.setTargetAtTime(this.volume * 0.82, this.context.currentTime, 0.012);
    }
  }

  stop() {
    this.clearCueTimer();
    if (this.audio) {
      this.audio.ontimeupdate = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    this.hornVoices.forEach((voice) => {
      voice.pause();
      voice.currentTime = 0;
    });
    this.hornVoices.clear();
    this.hornOnIdle = null;
    if (this.applauseSource) {
      try {
        this.applauseSource.stop();
      } catch {
        // The one-shot may already have completed.
      }
      this.applauseSource.disconnect();
      this.applauseSource = null;
    }
    this.applauseOutput?.disconnect();
    this.applauseOutput = null;
  }

  async pause() {
    if (this.hornVoices.size > 0) {
      this.hornVoices.forEach((voice) => voice.pause());
      return true;
    }
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      return true;
    }
    if (this.applauseSource && this.context?.state === "running") {
      await this.context.suspend();
      return true;
    }
    return false;
  }

  async resume() {
    if (this.hornVoices.size > 0) {
      await Promise.all([...this.hornVoices].map((voice) => voice.play()));
      return true;
    }
    if (this.audio?.paused) {
      await this.audio.play();
      return true;
    }
    if (this.applauseSource && this.context?.state === "suspended") {
      await this.context.resume();
      return true;
    }
    return false;
  }

  async play(kind: PlaceTwistKind, onEnded?: () => void, onOneSecondBeforeEnd?: () => void, onError?: () => void) {
    if (kind === "dj_horn") {
      await this.playHorn(onEnded);
      return;
    }
    this.stop();
    const source = PLACE_TWIST_ASSETS[kind];
    const audio = new Audio(source);
    let nearEndDispatched = false;
    audio.preload = "auto";
    audio.volume = this.volume;
    const checkCue = () => {
      if (this.audio !== audio || audio.paused || nearEndDispatched || !onOneSecondBeforeEnd || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (audio.duration - audio.currentTime > 1) return;
      nearEndDispatched = true;
      this.clearCueTimer();
      onOneSecondBeforeEnd();
    };
    audio.ontimeupdate = checkCue;
    audio.onended = () => {
      if (this.audio !== audio) return;
      this.clearCueTimer();
      this.audio = null;
      if (!nearEndDispatched) onOneSecondBeforeEnd?.();
      onEnded?.();
    };
    audio.onerror = () => {
      if (this.audio !== audio) return;
      this.stop();
      onError?.();
    };
    this.audio = audio;
    try {
      await audio.play();
      if (this.audio === audio && onOneSecondBeforeEnd && !nearEndDispatched) {
        // Le temps du média (et non un délai fixe) respecte pause, buffering
        // et durée réelle du fichier. timeupdate seul est trop peu fréquent.
        this.cueTimer = setInterval(checkCue, 25);
        checkCue();
      }
    } catch (error) {
      if (this.audio === audio) this.stop();
      throw error;
    }
  }

  preloadHorn() {
    if (this.hornTemplate) return;
    const template = new Audio(PLACE_TWIST_ASSETS.dj_horn);
    template.preload = "auto";
    template.load();
    this.hornTemplate = template;
  }

  private async playHorn(onEnded?: () => void) {
    this.preloadHorn();
    // Un klaxon fonctionne comme un sampler monophonique : chaque nouveau
    // coup coupe net le précédent, revient à zéro, puis seul le dernier coup
    // est autorisé à jouer jusqu'au bout.
    this.hornVoices.forEach((activeVoice) => {
      activeVoice.onended = null;
      activeVoice.pause();
      activeVoice.currentTime = 0;
    });
    this.hornVoices.clear();
    this.hornOnIdle = null;
    const voice = (this.hornTemplate?.cloneNode(true) as HTMLAudioElement | undefined)
      ?? new Audio(PLACE_TWIST_ASSETS.dj_horn);
    voice.preload = "auto";
    voice.volume = this.volume;
    this.hornVoices.add(voice);
    this.hornOnIdle = onEnded ?? null;
    voice.onended = () => {
      this.hornVoices.delete(voice);
      if (this.hornVoices.size === 0) {
        const finish = this.hornOnIdle;
        this.hornOnIdle = null;
        finish?.();
      }
    };
    await voice.play();
  }

  async playFile(source: string, onEnded?: () => void) {
    this.stop();
    const audio = new Audio(source);
    audio.preload = "auto";
    audio.volume = this.volume;
    audio.onended = () => {
      if (this.audio === audio) this.audio = null;
      onEnded?.();
    };
    this.audio = audio;
    await audio.play();
  }

  private getContext() {
    if (!this.context) this.context = new AudioContext({ latencyHint: "interactive" });
    return this.context;
  }

  /**
   * Produces an actual applause one-shot instead of presenting the silent iOS
   * animation as an audio feature. Multiple short, decorrelated hand-clap
   * transients are diffused through a real Web Audio room tail.
   */
  private async playGeneratedApplause(onEnded?: () => void) {
    const context = this.getContext();
    if (context.state === "suspended") await context.resume();

    const duration = 2.35;
    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const clapCount = 76;

    for (let clap = 0; clap < clapCount; clap += 1) {
      const progress = clap / clapCount;
      const crowdEnvelope = Math.sin(progress * Math.PI) ** 0.65;
      const eventTime = 0.04 + Math.random() * (duration - 0.16);
      const pan = Math.random() * 1.4 - 0.7;
      const eventGain = (0.12 + Math.random() * 0.18) * crowdEnvelope;
      const burstCount = 2 + Math.floor(Math.random() * 3);

      for (let burst = 0; burst < burstCount; burst += 1) {
        const start = Math.floor((eventTime + burst * (0.006 + Math.random() * 0.008)) * context.sampleRate);
        const burstLength = Math.floor((0.012 + Math.random() * 0.018) * context.sampleRate);
        for (let frame = 0; frame < burstLength && start + frame < frameCount; frame += 1) {
          const attack = Math.min(1, frame / Math.max(1, context.sampleRate * 0.0015));
          const decay = Math.exp(-frame / (context.sampleRate * (0.0045 + Math.random() * 0.003)));
          const sample = (Math.random() * 2 - 1) * attack * decay * eventGain;
          left[start + frame] += sample * (1 - Math.max(0, pan));
          right[start + frame] += sample * (1 + Math.min(0, pan));
        }
      }
    }

    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = context.createConvolver();
    const output = context.createGain();

    source.buffer = buffer;
    highPass.type = "highpass";
    highPass.frequency.value = 520;
    presence.type = "peaking";
    presence.frequency.value = 2300;
    presence.Q.value = 0.9;
    presence.gain.value = 4.5;
    compressor.threshold.value = -17;
    compressor.knee.value = 13;
    compressor.ratio.value = 4.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    dry.gain.value = 0.86;
    wet.gain.value = 0.28;
    output.gain.value = this.volume * 0.82;
    convolver.buffer = this.createRoomImpulse(context, 0.72, 2.6);

    source.connect(highPass);
    highPass.connect(presence);
    presence.connect(compressor);
    compressor.connect(dry);
    compressor.connect(convolver);
    convolver.connect(wet);
    dry.connect(output);
    wet.connect(output);
    output.connect(context.destination);

    this.applauseSource = source;
    this.applauseOutput = output;
    source.onended = () => {
      if (this.applauseSource !== source) return;
      source.disconnect();
      highPass.disconnect();
      presence.disconnect();
      compressor.disconnect();
      dry.disconnect();
      wet.disconnect();
      convolver.disconnect();
      output.disconnect();
      this.applauseSource = null;
      this.applauseOutput = null;
      onEnded?.();
    };
    source.start();
  }

  private createRoomImpulse(context: AudioContext, seconds: number, decay: number) {
    const length = Math.ceil(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let frame = 0; frame < length; frame += 1) {
        const envelope = (1 - frame / length) ** decay;
        data[frame] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }
}

export const placeTwistAudio = new PlaceTwistAudioEngine();
