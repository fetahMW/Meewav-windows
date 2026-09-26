import type { RoomActorRole, RoomToolConfig, SpecializedRoomId } from "./roomTools.types";

const CONTROL: readonly RoomActorRole[] = ["host", "regisseur"];

export const SPECIALIZED_ROOM_TOOL_CONFIGS: Record<SpecializedRoomId, readonly RoomToolConfig[]> = {
  scene: [
    { id: "scene-program", label: "Programme", shortLabel: "Programme", eyebrow: "DÉROULÉ DU LIVE", description: "Organise les passages de la Scène", icon: "list", controlRoles: CONTROL },
    { id: "scene-prompter", label: "Prompteur", shortLabel: "Prompteur", eyebrow: "REPÈRES PRIVÉS", description: "Garde tes repères pendant ta prestation", icon: "text", controlRoles: [...CONTROL, "artist"] },
    { id: "scene-evaluation", label: "Évaluation", shortLabel: "Avis", eyebrow: "RETOUR DU PUBLIC", description: "Recueille l’avis du public après ta prestation", icon: "evaluation", controlRoles: CONTROL },
    { id: "scene-fundraiser", label: "Cagnotte", shortLabel: "Cagnotte", eyebrow: "OBJECTIF COLLECTIF", description: "Mobilise le public autour d’un objectif", icon: "fundraiser", controlRoles: CONTROL },
  ],
  classe: [
    { id: "classe-room", label: "La Classe", eyebrow: "24 ÉLÈVES PREMIUM", description: "Gère tes 24 élèves premium", icon: "seats", controlRoles: ["host"] },
    { id: "classe-questions", label: "Questions de la classe", shortLabel: "Questions", eyebrow: "QUESTIONS DE LA CLASSE", description: "Choisis les questions auxquelles répondre", icon: "question", controlRoles: [...CONTROL, "teacher"] },
  ],
  wave: [
    { id: "wave-gate", label: "Sas des boucles", shortLabel: "Boucle", eyebrow: "CENTRE DE CONTRÔLE", description: "Contrôler et classer les propositions", icon: "audio", controlRoles: CONTROL },
    { id: "wave-quarantine", label: "Quarantaine", eyebrow: "ATELIER PRIVÉ", description: "Retoucher les boucles avant le vote", icon: "focus", controlRoles: CONTROL },
    { id: "wave-sequencer", label: "Vote du public", shortLabel: "Vote", eyebrow: "VALIDATION COLLECTIVE", description: "Faire valider une boucle à la fois", icon: "vote", controlRoles: CONTROL },
    { id: "wave-orchestra", label: "Beat collectif", shortLabel: "Beat", eyebrow: "CONDUCTEUR OFFICIEL", description: "Piloter les boucles validées", icon: "sequence", controlRoles: CONTROL },
  ],
  cage: [
    { id: "cage-competition", label: "Bracket", eyebrow: "FORMAT & TABLEAU", description: "Tournoi, championnat ou open mic", icon: "trophy", controlRoles: CONTROL },
    { id: "cage-regie", label: "Régie", eyebrow: "PRÉPARER LA SUITE", description: "Participants prêts et prochains matchs", icon: "sequence", controlRoles: CONTROL },
    { id: "cage-battle", label: "Match", eyebrow: "PASSAGE EN COURS", description: "Performance, chrono et incidents", icon: "battle", controlRoles: CONTROL },
    { id: "cage-vote", label: "Vote & verdict", shortLabel: "Vote", eyebrow: "DÉCISION", description: "Public, jury ou hybride", icon: "vote", controlRoles: CONTROL },
  ],
  loge: [
    { id: "loge-dedication", label: "VIP", eyebrow: "INSTANT UNIQUE", description: "Crée un moment unique", icon: "dedication", controlRoles: CONTROL },
    { id: "loge-audience-choice", label: "Sondage", eyebrow: "AVIS EN DIRECT", description: "Demande l’avis de ta Loge", icon: "poll", controlRoles: CONTROL },
    { id: "loge-questions", label: "Questions", eyebrow: "PAROLE DU PUBLIC", description: "Réponds à ton public", icon: "question", controlRoles: CONTROL },
{ id: "gift", label: "Cadeau", eyebrow: "RÉCOMPENSE ROOM", description: "Offrir ou lancer un tirage", icon: "gift", controlRoles: ["host", "regisseur", "viewer"] },
  ],
};

export function roomToolConfig(roomType: SpecializedRoomId) {
  return SPECIALIZED_ROOM_TOOL_CONFIGS[roomType];
}

export function canControlRoomTool(tool: RoomToolConfig, role: RoomActorRole) {
  return tool.controlRoles.includes(role);
}

export function resolveRoomActorRole(roomType: SpecializedRoomId, isHost: boolean, isGuest: boolean, profileRole?: string | null): RoomActorRole {
  if (isHost) return "host";
  const normalized = profileRole?.toLocaleLowerCase("fr-FR") ?? "";
  if (normalized.includes("régie") || normalized.includes("regie")) return "regisseur";
  if (normalized.includes("prof") || normalized.includes("coach")) return "teacher";
  if (!isGuest) return profileRole ? "viewer" : "visitor";
  if (roomType === "scene") return "artist";
  // A Classe seat is independent from the common three-person Guest journey.
  // useRoomTools promotes a server-projected seat occupant after identity match.
  if (roomType === "classe") return "viewer";
  if (roomType === "wave") return "contributor";
  if (roomType === "cage") return "competitor";
  return "viewer";
}
