import type { WaveLoopCategory, WaveState, WaveSubmission } from "./roomTools.types";

export const WAVE_LOOP_CATEGORIES: ReadonlyArray<{
  id: WaveLoopCategory;
  label: string;
  badge: string;
  color: string;
}> = [
  { id: "bass", label: "Basses", badge: "BASSE", color: "#FF8A1E" },
  { id: "drums", label: "Drums", badge: "DRUMS", color: "#22E55B" },
  { id: "melody", label: "Mélodies", badge: "MÉLODIE", color: "#A855F7" },
  { id: "chords", label: "Accords", badge: "ACCORDS", color: "#E7BD64" },
  { id: "pad", label: "Nappes", badge: "NAPPE", color: "#6675FF" },
  { id: "acapella", label: "Acapella", badge: "ACAPELLA", color: "#3B82F6" },
  { id: "fx", label: "Ambiances / FX", badge: "FX", color: "#06B6D4" },
];

export const WAVE_SUBMISSION_INSTRUMENTS: ReadonlyArray<{ label: string; category: WaveLoopCategory }> = [
  { label: "Percussion", category: "drums" },
  { label: "Basse", category: "bass" },
  { label: "Synthé", category: "melody" },
  { label: "Accords", category: "chords" },
  { label: "Nappe / Pad", category: "pad" },
  { label: "Drone harmonique", category: "pad" },
  { label: "Voix", category: "acapella" },
  { label: "Guitare", category: "melody" },
  { label: "Ambiance", category: "fx" },
  { label: "Autre", category: "fx" },
];

export function waveAcceptedCategories(wave: Pick<WaveState, "acceptedCategories">): WaveLoopCategory[] {
  return WAVE_LOOP_CATEGORIES
    .filter(({ id }) => wave.acceptedCategories === undefined || wave.acceptedCategories.includes(id))
    .map(({ id }) => id);
}

export function waveSubmissionCategory(submission: Pick<WaveSubmission, "category" | "instrument" | "title">): WaveLoopCategory {
  if (submission.category && WAVE_LOOP_CATEGORIES.some(({ id }) => id === submission.category)) return submission.category;
  // Legacy submissions predate the explicit category chosen in the upload form.
  const value = `${submission.instrument} ${submission.title}`.toLocaleLowerCase("fr-FR");
  if (/bass|basse|808|sub/.test(value)) return "bass";
  if (/drum|kick|snare|hat|perc|clap|rythm/.test(value)) return "drums";
  if (/voix|vocal|acap|chant/.test(value)) return "acapella";
  if (/nappe|\bpad\b|drone|texture|atmosph[eè]re harmonique/.test(value)) return "pad";
  if (/accord|chord/.test(value)) return "chords";
  if (/m[eé]lo|synth|piano|guit|violon|keys|accord/.test(value)) return "melody";
  return "fx";
}
