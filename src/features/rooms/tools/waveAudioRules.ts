import type { WaveLoopCategory, WaveState, WaveSubmission } from "./roomTools.types";
import { waveSubmissionCategory } from "./waveLoopCategories";
import { waveBarsForImportedDuration } from "./waveImportGrid";
export const WAVE_BASE_MAX_BYTES = 64 * 1024 * 1024;
export const WAVE_AUDIO_ACCEPT = ".wav,.mp3,.aac,.flac,.m4a,audio/wav,audio/mpeg,audio/aac,audio/flac,audio/mp4";

export const waveSubmissionMaxBars = (wave: WaveState, category?: WaveLoopCategory) => category === "acapella" ? 16 : wave.maxSubmissionBars ?? wave.baseLoop.bars;

export function assertWaveSubmissionDuration(duration: number, wave: WaveState, category?: WaveLoopCategory) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Le fichier audio est illisible ou vide.");
  const maxBars = waveSubmissionMaxBars(wave, category);
  if (!(wave.baseLoop.bpm > 0) || ![4, 8, 16].includes(maxBars)) throw new Error("Le format des contributions doit être réglé par le host.");
  if (duration > 60 / wave.baseLoop.bpm * 4 * maxBars + .1) throw new Error(`Les propositions sont limitées à ${maxBars} mesures à ${wave.baseLoop.bpm} BPM. Une production plus longue doit remplacer la boucle de base.`);
}

export function assertWaveSubmissionFormat(wave: WaveState, submission: Pick<WaveSubmission, "durationSeconds" | "bars"> & Partial<Pick<WaveSubmission, "category" | "instrument" | "title">>) {
  const category = waveSubmissionCategory({ instrument: "", title: "", ...submission });
  assertWaveSubmissionDuration(submission.durationSeconds, wave, category);
  if (![4, 8, 16].includes(submission.bars) || submission.bars > waveSubmissionMaxBars(wave, category)) throw new Error(`Le host accepte au maximum ${waveSubmissionMaxBars(wave, category)} mesures dans cette catégorie.`);
}

export function waveSubmissionBarsForDuration(durationSeconds: number, wave: WaveState, category?: WaveLoopCategory) {
  assertWaveSubmissionDuration(durationSeconds, wave, category);
  return waveBarsForImportedDuration({ durationSeconds, bpm: wave.baseLoop.bpm, fallbackBars: waveSubmissionMaxBars(wave, category) });
}

export async function readWaveSubmissionAudio(file: File, wave: WaveState, category?: WaveLoopCategory) {
  const durationSeconds = await measureWaveAudio(file);
  return { durationSeconds, bars: waveSubmissionBarsForDuration(durationSeconds, wave, category) };
}

/** Decode the actual audio, rather than trusting its extension or a declared bar count. */
export async function measureWaveAudio(file: File): Promise<number> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!buffer.length || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error("empty_audio");
    // Same decoded-memory budget as the room's audio transport.
    if (buffer.length * buffer.numberOfChannels * 4 > 128 * 1024 * 1024) {
      throw new Error("Cette piste est trop volumineuse une fois décodée. Choisis une version plus légère.");
    }
    return buffer.duration;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cette piste")) throw error;
    throw new Error("Impossible de lire ce fichier audio. Choisis un fichier WAV, MP3, AAC, FLAC ou M4A valide.");
  } finally {
    await context.close();
  }
}
