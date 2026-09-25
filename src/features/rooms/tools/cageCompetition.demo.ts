import { createPlaceDemoState, PLACE_DEMO_CHAT_SCRIPT } from "../place/place.fixtures";
import type { TournamentParticipant } from "./cageCompetition.types";

/** Uses exactly the demo Invités roster; it never pads an undersubscribed tournament. */
export function cageDemoGuestCandidates(): TournamentParticipant[] {
  const room = createPlaceDemoState();
  return [...new Map([...room.queue, ...room.participants].filter((guest) => guest.profile.id !== room.host.id).map((guest) => [guest.profile.id, guest])).values()].map<TournamentParticipant>((guest) => ({
    id: guest.profile.id,
    person: { id: guest.profile.id, name: guest.profile.displayName, avatarUrl: guest.profile.avatarUrl, role: guest.profile.role, gradeLevel: Math.max(1, Math.min(6, guest.profile.gradeLevel)) as 1 | 2 | 3 | 4 | 5 | 6, microphone: guest.isMicrophoneEnabled ? "ready" : "off", camera: guest.isCameraEnabled ? "ready" : "off" },
    present: true, registered: true, eligible: true, seed: null, status: "WAITING",
    readiness: { camera: guest.isCameraEnabled, microphone: guest.isMicrophoneEnabled, connection: true, mixer: true, permissions: guest.isCameraEnabled && guest.isMicrophoneEnabled },
    guestStatus: guest.status === "backstage" || guest.status === "ready" ? "backstage" : "waiting",
    graceEndsAt: null,
  }));
}

const CAGE_REACTIONS = [
  "Ce passage met tout le monde d’accord [[mw:micro-flamme]]",
  "J’attends les deux performances avant de voter.",
  "Le contraste entre les univers est incroyable.",
  "Casque branché, je ne rate pas une seconde.",
  "Il y a du niveau dans les coulisses aussi !",
  "La technique et l’émotion, les deux comptent.",
  "[[mw:coeur-musical]] Respect aux artistes qui osent monter.",
  "Le tableau commence à se dessiner…",
  "Ce serait fou de les retrouver en finale.",
  "Un vote, une voix. C’est nous qui décidons.",
  "Les styles se croisent, c’est ça qui est beau.",
  "[[mw:signe-rock]] Quelle présence sur scène !",
  "Bravo pour cette prise de risque.",
  "Le prochain duel va être serré.",
];
export const CAGE_DEMO_CHAT_SCRIPT = PLACE_DEMO_CHAT_SCRIPT.map((beat, index) => ({ ...beat, content: CAGE_REACTIONS[index % CAGE_REACTIONS.length] }));
