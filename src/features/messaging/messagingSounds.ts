type MessageSoundKind = "send" | "receive";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export const MESSAGE_SENT_SOUND_URL = "/audio/messaging/message-sent-pro.mp3";

const MESSAGE_SENT_VOLUME = 0.72;

let audioContext: AudioContext | null = null;
let sentSound: HTMLAudioElement | null = null;

function createSentSound() {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(MESSAGE_SENT_SOUND_URL);
  audio.preload = "auto";
  audio.volume = MESSAGE_SENT_VOLUME;
  return audio;
}

function getSentSound() {
  sentSound ??= createSentSound();
  return sentSound;
}

export function preloadMessageSounds() {
  getSentSound();
}

function playSentSound() {
  const source = getSentSound();
  if (!source) return;

  const audio = source.paused
    ? source
    : source.cloneNode(true) as HTMLAudioElement;
  audio.currentTime = 0;
  audio.volume = MESSAGE_SENT_VOLUME;

  try {
    const playback = audio.play();
    void playback?.catch(() => {
      // Certains navigateurs bloquent l'audio avant la première interaction.
    });
  } catch {
    // L'interface d'envoi reste fonctionnelle si l'audio n'est pas disponible.
  }
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function addPluck(
  context: AudioContext,
  startAt: number,
  fromFrequency: number,
  toFrequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromFrequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, startAt + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3400, startAt);
  filter.Q.setValueAtTime(0.7, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.015);
}

function addSoftClick(context: AudioContext, startAt: number, volume: number) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * 0.024));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const envelope = 1 - index / frameCount;
    channel[index] = (Math.random() * 2 - 1) * envelope * envelope;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 2100;
  filter.Q.value = 1.3;
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.026);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(startAt);
}

export function playMessageSound(kind: MessageSoundKind) {
  if (kind === "send") {
    playSentSound();
    return;
  }

  const context = getAudioContext();
  if (!context) return;

  void context.resume().then(() => {
    const now = context.currentTime + 0.008;
    addSoftClick(context, now, 0.032);

    addPluck(context, now, 980, 720, 0.12, 0.052, "triangle");
    addPluck(context, now + 0.045, 760, 560, 0.11, 0.034, "sine");
  }).catch(() => {
    // Certains navigateurs bloquent l'audio avant la première interaction.
  });
}
