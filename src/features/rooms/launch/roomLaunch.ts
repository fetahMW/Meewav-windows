import type { RoomsHomeRoomType } from "../home/roomsHome.types";
import type { RoomToolsState, WaveBaseLoop } from "../tools/roomTools.types";
import { validateWaveAudienceFile } from "../tools/audience/waveAudienceUpload.service";
import { isRoomLaunchAudio } from "./roomLaunchAudio";
export type RoomLaunchType = Exclude<RoomsHomeRoomType, "cage">;
type Field = { id: string; label: string; kind: "text" | "number" | "boolean" | "select" | "textarea"; initial: string | number | boolean; options?: string[]; min?: number; max?: number };
export const ROOM_LAUNCH_SPECS: Record<RoomLaunchType, { label: string; description: string; fields: Field[] }> = {
  place: { label: "La Place", description: "Un espace de rencontre et de collaboration ouvert au public.", fields: [{ id: "topic", label: "Sujet de la rencontre", kind: "textarea", initial: "" }, { id: "queueOpen", label: "Ouvrir la file de participation", kind: "boolean", initial: true }] },
  loge: { label: "La Loge", description: "Un rendez-vous privilégié avec ton public et tes invités.", fields: [{ id: "previewTitle", label: "Titre de l’avant-première", kind: "text", initial: "" }, { id: "previewDescription", label: "Présentation", kind: "textarea", initial: "" }, { id: "questionsOpen", label: "Accepter les questions", kind: "boolean", initial: true }, { id: "liveOnly", label: "Avant-première réservée au direct", kind: "boolean", initial: true }] },
  wave: {
    label: "La Wave", description: "Une création collective, avec une base commune et des propositions du public.",
    fields: [
      { id: "bpm", label: "Tempo (BPM)", kind: "number", initial: 92, min: 40, max: 240 },
      { id: "key", label: "Tonalité", kind: "select", initial: "Am", options: ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"] },
      { id: "maxSubmissionBars", label: "Longueur maximale des instruments (mesures)", kind: "select", initial: "8", options: ["4", "8", "16"] },
      { id: "submissionsOpen", label: "Ouvrir les propositions de boucles", kind: "boolean", initial: true },
    ],
  },
  classe: { label: "La Classe", description: "Un cours participatif, avec des places, des questions et des prises de parole.", fields: [{ id: "topic", label: "Objectif du cours", kind: "textarea", initial: "" }, { id: "seats", label: "Places élèves", kind: "number", initial: 24, min: 4, max: 24 }, { id: "handsOpen", label: "Autoriser les mains levées", kind: "boolean", initial: true }, { id: "questionsOpen", label: "Ouvrir les questions", kind: "boolean", initial: true }] },
  scene: { label: "La Scène", description: "Une performance avec un programme, un prompteur et l’avis du public.", fields: [{ id: "program", label: "Programme · un titre par ligne", kind: "textarea", initial: "Ouverture\nPerformance principale\nFinal" }, { id: "duration", label: "Durée indicative par passage (minutes)", kind: "number", initial: 5, min: 1, max: 120 }, { id: "evaluation", label: "Activer l’évaluation du public", kind: "boolean", initial: true }, { id: "prompter", label: "Texte du prompteur", kind: "textarea", initial: "" }] },
};
export type RoomLaunchConfiguration = { roomType: RoomLaunchType; title: string; description: string; access: "public" | "invitation" | "members"; values: Record<string, string | boolean | number>; baseLoop?: WaveBaseLoop };
export type RoomLaunchSession = { id: string; createdAt: string; configuration: RoomLaunchConfiguration };
export function defaultRoomLaunch(roomType: RoomLaunchType): RoomLaunchConfiguration { return { roomType, title: "", description: "", access: "public", values: Object.fromEntries(ROOM_LAUNCH_SPECS[roomType].fields.map((field) => [field.id, field.initial])) }; }
export function validateRoomLaunchIdentity(config: RoomLaunchConfiguration): string | null {
  if (!config || !ROOM_LAUNCH_SPECS[config.roomType]) return "Choisis un type de room.";
  if (typeof config.title !== "string" || !config.title.trim() || config.title.length > 100) return "Indique un titre de 1 à 100 caractères.";
  if (typeof config.description !== "string" || config.description.length > 500) return "La présentation est limitée à 500 caractères.";
  if (!["public", "members", "invitation"].includes(config.access)) return "Choisis un accès valide.";
  return null;
}
export function validateWaveLaunchBase(base: WaveBaseLoop | undefined, bpm: number): string | null {
  if (!base?.fileName || !base.title?.trim() || !(base.mediaUrl?.startsWith("blob:") || isRoomLaunchAudio(base.mediaPath))) return "Importe une boucle de base pour ouvrir la Wave.";
  try { validateWaveAudienceFile({ name: base.fileName, size: base.fileSize ?? 0, type: base.mimeType ?? "" }, "base"); }
  catch { return "Choisis un fichier WAV, MP3, AAC, FLAC ou M4A de 64 Mo maximum."; }
  if (!Number.isFinite(base.durationSeconds) || !(base.durationSeconds! > 0)) return "Attends la vérification du fichier audio.";
  if (![4, 8, 16].includes(base.bars) || !["loop", "long"].includes(base.format ?? "")) return "Choisis 4, 8, 16 mesures ou Son long.";
  if (base.format === "loop" && Math.abs(base.durationSeconds! - 60 / bpm * 4 * base.bars) > .1) return `Le fichier ne correspond pas à ${base.bars} mesures à ${bpm} BPM. Ajuste le tempo ou choisis « Son long » pour conserver toute sa durée.`;
  return null;
}
export function validateRoomLaunch(config: RoomLaunchConfiguration): string | null {
  const identityError = validateRoomLaunchIdentity(config);
  if (identityError) return identityError;
  if (!config.values || typeof config.values !== "object") return "Complète les réglages de la room.";
  for (const field of ROOM_LAUNCH_SPECS[config.roomType].fields) {
    const value = config.values[field.id];
    if (field.kind === "number" && (typeof value !== "number" || !Number.isInteger(value) || value < (field.min ?? 0) || value > (field.max ?? 1000))) return `Vérifie le champ « ${field.label} ».`;
    if (field.kind === "boolean" && typeof value !== "boolean") return `Vérifie le champ « ${field.label} ».`;
    if (field.kind === "select" && !field.options?.includes(String(value))) return `Vérifie le champ « ${field.label} ».`;
    if (["text", "textarea"].includes(field.kind) && (typeof value !== "string" || value.length > 4000)) return `Vérifie le champ « ${field.label} ».`;
  }
  if (config.roomType === "scene" && !String(config.values.program).trim()) return "Ajoute au moins un passage au programme.";
  if (config.roomType === "wave") return validateWaveLaunchBase(config.baseLoop, Number(config.values.bpm));
  return null;
}
export function createRoomLaunchSession(configuration: RoomLaunchConfiguration): RoomLaunchSession {
  const error = validateRoomLaunch(configuration); if (error) throw new Error(error);
  if (configuration.roomType === "wave" && !isRoomLaunchAudio(configuration.baseLoop?.mediaPath)) throw new Error("Enregistre la boucle de base avant d’ouvrir la Wave.");
  const session = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), configuration: structuredClone(configuration) };
  localStorage.setItem(`meewav:room-launch:v1:${session.id}`, JSON.stringify(session)); return session;
}
export function readRoomLaunchSession(id: string | null): RoomLaunchSession | null {
  if (!id) return null;
  try { const session = JSON.parse(localStorage.getItem(`meewav:room-launch:v1:${id}`) ?? "null"); return session?.id === id && !validateRoomLaunch(session.configuration) ? session : null; } catch { return null; }
}
export function applyRoomLaunchTools(state: RoomToolsState, session: RoomLaunchSession) {
  const { values: v, title } = session.configuration;
  if (state.wave) {
    const error = validateRoomLaunch(session.configuration); if (error) throw new Error(error);
    state.wave.title = title;
    state.wave.submissionsOpen = Boolean(v.submissionsOpen);
    state.wave.maxSubmissionBars = Number(v.maxSubmissionBars) as 4 | 8 | 16;
    state.wave.baseLoop = { ...session.configuration.baseLoop!, bpm: Number(v.bpm), key: String(v.key) };
    state.wave.layers = [{ id: "base", title: state.wave.baseLoop.title, author: "Host de la Wave", active: true, muted: false, solo: false }];
    state.wave.submissions = [];
    state.wave.activeSubmissionId = null;
    state.wave.playing = false;
    state.wave.history = [`${state.wave.baseLoop.title} · base importée au lancement`];
  }
  if (state.classe) { state.classe.handsOpen = Boolean(v.handsOpen); state.classe.questionsOpen = Boolean(v.questionsOpen); state.classe.seats = state.classe.seats.slice(0, Number(v.seats)); }
  if (state.loge) { state.loge.questionsOpen = Boolean(v.questionsOpen); state.loge.preview.title = String(v.previewTitle || title); state.loge.preview.description = String(v.previewDescription); state.loge.preview.liveOnly = Boolean(v.liveOnly); state.loge.preview.replayIncluded = !v.liveOnly; }
  if (state.scene) {
    state.scene.evaluation.defaultEnabled = Boolean(v.evaluation);
    state.scene.program = String(v.program).split("\n").map((text) => text.trim()).filter(Boolean).map((text, i) => ({ id: `launch-${i}`, title: text, artistId: state.scene!.people[0]?.id ?? "host", artistName: state.scene!.people[0]?.name ?? "Host", kind: "Morceau", durationMinutes: Number(v.duration), status: "upcoming", evaluationEnabled: Boolean(v.evaluation) }));
    if (state.scene.prompter.texts[0]) state.scene.prompter.texts[0].body = String(v.prompter);
  }
}
