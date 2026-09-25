import { ROOM_TOOL_PEOPLE } from "./roomTools.fixtures";
import type { WaveLoopCategory, WaveState } from "./roomTools.types";

export const WAVE_TEST_PRODUCTIONS = [
  { id: "Afro", bpm: 100, key: "Am", folder: "Afro_100BPM_A_minor" },
  { id: "Drill", bpm: 142, key: "Fm", folder: "Drill_142BPM_F_minor" },
  { id: "Trap", bpm: 150, key: "Cm", folder: "Trap_150BPM_C_minor" },
  { id: "Zouk", bpm: 92, key: "Gm", folder: "Zouk_92BPM_G_minor" },
  { id: "House", bpm: 124, key: "Am", folder: "House_124BPM_A_minor" },
] as const;

const tracks: Array<{ file: string; title: string; category: WaveLoopCategory; instrument: string }> = [
  { file: "Bass_A", title: "Basse A", category: "bass", instrument: "Basse" },
  { file: "Melody_B", title: "Mélodie B", category: "melody", instrument: "Synthé" },
  { file: "Drums_A", title: "Drums A", category: "drums", instrument: "Percussion" },
  { file: "Drums_B", title: "Drums B", category: "drums", instrument: "Percussion" },
  { file: "Bass_B", title: "Basse B", category: "bass", instrument: "Basse" },
  { file: "Acapella_Test_A", title: "Acapella test A", category: "acapella", instrument: "Acapella" },
];

export function seedWaveTestProduction(wave: WaveState, productionId = "Afro") {
  const production = WAVE_TEST_PRODUCTIONS.find((item) => item.id === productionId);
  if (!production) throw new Error("Production de simulation inconnue.");
  const receivedAt = new Date().toISOString();
  const media = (track: string) => {
    const fileName = `${production.id}_${track}_${production.bpm}BPM_8bars.wav`;
    // The supplied WAV generator truncates to a whole PCM frame.
    const frames = Math.floor(32 * 60 / production.bpm * 44100);
    return {
      fileName, fileSize: 44 + frames * 4, mimeType: "audio/wav",
      mediaUrl: `/audio/rooms/wave-test-pack/${production.folder}/Loops_8bars/${fileName}`,
      bpm: production.bpm, key: production.key, bars: 8 as const, durationSeconds: frames / 44100,
    };
  };
  wave.title = `${production.id} · Simulation`;
  wave.baseLoop = { ...media("Melody_A"), title: `${production.id} · Mélodie A`, kind: "Mélodie" };
  wave.layers = [{ id: "base", title: wave.baseLoop.title, author: "Puff", active: true, muted: false, solo: false }];
  wave.activeSubmissionId = null;
  wave.playing = false;
  wave.looping = true;
  wave.history = [];
  wave.submissionsOpen = true;
  wave.acceptedCategories = undefined;
  wave.submissions = tracks.map((track, index) => ({
    id: `test-${production.id}-${track.file}`, title: `${production.id} · ${track.title}`,
    instrument: track.instrument, category: track.category, contributor: ROOM_TOOL_PEOPLE.wave[index],
    ...media(track.file), status: "received", rightsConfirmed: true, version: 1, privateNotes: "",
    creditPublic: true, submittedAt: receivedAt,
    versions: [{ version: 1, receivedAt, note: "LaWave Test Pack", ...media(track.file) }],
  }));
}
