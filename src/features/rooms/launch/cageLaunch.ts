/** The launch contract is snapshotted into a live session; templates stay unchanged. */
export type CageLaunchConfiguration = {
  version: 1;
  title: string;
  discipline: string;
  format: "tournament" | "championship" | "open-mic" | "open-mic-battle";
  participantCount: number;
  rosterMode: "prepared" | "first-eligible" | "manual" | "random";
  rosterProfileIds: string[];
  templateId?: string;
  rules: {
    performanceMode: "successive" | "alternating" | "simultaneous";
    rounds: number;
    passageDurationSeconds: number;
    votingDurationSeconds: number;
    votingMode: "public" | "jury" | "mixed";
    tieBreak: "sudden-death" | "replay";
    allowByes: boolean;
    allowFormatReduction: boolean;
    allowReplacement: boolean;
    disconnectGraceSeconds: number;
    noShowGraceSeconds: number;
    /** Chosen explicitly for an individual Open Mic session. */
    openMicFeedback?: "appreciation" | "scored" | "none";
  };
};

export type CageLaunchTemplate = { id: string; updatedAt: string; configuration: CageLaunchConfiguration };
export type CageLaunchSnapshot = { id: string; roomId: string; createdAt: string; configuration: CageLaunchConfiguration };

const TEMPLATE_KEY = "meewav:cage:launch-templates:v1:";
const SESSION_KEY = "meewav:cage:launch-session:v1:";
const DRAFT_KEY = "meewav:cage:launch-draft:v1:";
export const DEFAULT_CAGE_LAUNCH: CageLaunchConfiguration = {
  version: 1,
  title: "Tournoi La Cage",
  discipline: "Tous les talents",
  format: "tournament",
  participantCount: 16,
  rosterMode: "manual",
  rosterProfileIds: [],
  rules: {
    performanceMode: "successive", rounds: 1, passageDurationSeconds: 90,
    votingDurationSeconds: 60, votingMode: "public", tieBreak: "sudden-death",
    allowByes: false, allowFormatReduction: false, allowReplacement: true,
    disconnectGraceSeconds: 60, noShowGraceSeconds: 90,
  },
};

export function cloneCageConfiguration(configuration: CageLaunchConfiguration): CageLaunchConfiguration {
  return { ...configuration, rosterProfileIds: [...configuration.rosterProfileIds], rules: { ...configuration.rules } };
}

export function validateCageLaunch(configuration: CageLaunchConfiguration): string | null {
  if (!configuration.title.trim()) return "Donne un nom à cette compétition.";
  if (configuration.title.trim().length > 100) return "Le titre est limité à 100 caractères.";
  const minimumParticipants = configuration.format === "open-mic" ? 1 : 2;
  if (!Number.isInteger(configuration.participantCount) || configuration.participantCount < minimumParticipants || configuration.participantCount > 64) return `Choisis un format de ${minimumParticipants} à 64 participants.`;
  if (configuration.format === "tournament" && ![2, 4, 8, 16, 32, 64].includes(configuration.participantCount) && !configuration.rules.allowByes) return "Ce format nécessite des BYE. Autorise-les dans le règlement ou choisis 2, 4, 8, 16, 32 ou 64 participants.";
  if (!["tournament", "championship", "open-mic", "open-mic-battle"].includes(configuration.format)) return "Choisis un format de compétition.";
  if (!["prepared", "first-eligible", "manual", "random"].includes(configuration.rosterMode)) return "Choisis comment sélectionner les participants.";
  if (configuration.rosterMode === "prepared" && configuration.rosterProfileIds.length === 0) return "Ce modèle n’a pas de roster préparé. Choisis une sélection dans la file Invités.";
  if (configuration.format !== "open-mic" && !["successive", "alternating", "simultaneous"].includes(configuration.rules.performanceMode)) return "Choisis le déroulement des performances.";
  if (configuration.format !== "open-mic" && ![1, 2, 3, 5].includes(configuration.rules.rounds)) return "Choisis un nombre de manches valide.";
  if (configuration.format === "open-mic" && !["appreciation", "scored", "none"].includes(configuration.rules.openMicFeedback ?? "")) return "Choisis le retour du public après chaque passage Open Mic.";
  if (!Number.isFinite(configuration.rules.passageDurationSeconds) || configuration.rules.passageDurationSeconds < 30 || configuration.rules.passageDurationSeconds > 1800) return "La durée d’un passage doit être comprise entre 30 secondes et 30 minutes.";
  if ((configuration.format !== "open-mic" || configuration.rules.openMicFeedback !== "none") && (!Number.isFinite(configuration.rules.votingDurationSeconds) || configuration.rules.votingDurationSeconds < 15 || configuration.rules.votingDurationSeconds > 300)) return "La durée du retour du public doit être comprise entre 15 secondes et 5 minutes.";
  if (configuration.format !== "open-mic" && !["public", "jury", "mixed"].includes(configuration.rules.votingMode)) return "Choisis qui décide du résultat.";
  if (configuration.format !== "open-mic" && !["sudden-death", "replay"].includes(configuration.rules.tieBreak)) return "Choisis une règle en cas d’égalité.";
  if (![configuration.rules.allowByes, configuration.rules.allowFormatReduction, configuration.rules.allowReplacement].every((value) => typeof value === "boolean")) return "Confirme les règles de remplacement et de format.";
  if (![configuration.rules.disconnectGraceSeconds, configuration.rules.noShowGraceSeconds].every((seconds) => Number.isInteger(seconds) && seconds >= 15 && seconds <= 600)) return "Les délais doivent être compris entre 15 secondes et 10 minutes.";
  return null;
}

function isConfiguration(value: unknown, requireValid = true): value is CageLaunchConfiguration {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CageLaunchConfiguration>;
  if (!candidate.rules || typeof candidate.rules !== "object") return false;
  const rules = candidate.rules;
  return candidate.version === 1 && typeof candidate.title === "string" && typeof candidate.discipline === "string"
    && ["tournament", "championship", "open-mic", "open-mic-battle"].includes(candidate.format ?? "")
    && typeof candidate.participantCount === "number" && Number.isInteger(candidate.participantCount) && candidate.participantCount >= 1 && candidate.participantCount <= 64
    && ["prepared", "first-eligible", "manual", "random"].includes(candidate.rosterMode ?? "")
    && Array.isArray(candidate.rosterProfileIds) && candidate.rosterProfileIds.every((id) => typeof id === "string")
    && ["successive", "alternating", "simultaneous"].includes(rules.performanceMode)
    && Number.isInteger(rules.rounds) && rules.rounds > 0
    && Number.isFinite(rules.passageDurationSeconds) && rules.passageDurationSeconds > 0
    && Number.isFinite(rules.votingDurationSeconds) && rules.votingDurationSeconds > 0
    && ["public", "jury", "mixed"].includes(rules.votingMode)
    && ["sudden-death", "replay"].includes(rules.tieBreak)
    && [rules.allowByes, rules.allowFormatReduction, rules.allowReplacement].every((flag) => typeof flag === "boolean")
    && [rules.disconnectGraceSeconds, rules.noShowGraceSeconds].every((seconds) => Number.isFinite(seconds) && seconds > 0)
    && (rules.openMicFeedback === undefined || ["appreciation", "scored", "none"].includes(rules.openMicFeedback))
    && (!requireValid || validateCageLaunch(candidate as CageLaunchConfiguration) === null);
}

export function configurationFromProfileCage(draft: {
  id?: string; title: string; type?: string; format?: string; participants?: number;
  inviteeIds?: string[]; passage?: string; vote?: string; roundsOverride?: string | null;
}): CageLaunchConfiguration {
  const text = `${draft.type ?? ""} ${draft.format ?? ""}`.toLocaleLowerCase("fr");
  const count = draft.participants ?? 16;
  const invited = [...new Set(draft.inviteeIds ?? [])];
  const passage = Number.parseInt(draft.passage ?? "90", 10) || 90;
  const rounds = Number.parseInt(draft.roundsOverride ?? "1", 10) || 1;
  return {
    ...cloneCageConfiguration(DEFAULT_CAGE_LAUNCH),
    title: draft.title, templateId: draft.id,
    format: /open[ -]mic battle|gagnant reste/.test(text) ? "open-mic-battle" : /champion|robin|points/.test(text) ? "championship" : /open mic|passages libres/.test(text) ? "open-mic" : "tournament",
    participantCount: count, rosterMode: invited.length ? "prepared" : "manual", rosterProfileIds: invited,
    rules: {
      ...DEFAULT_CAGE_LAUNCH.rules,
      rounds,
      passageDurationSeconds: /min/i.test(draft.passage ?? "") ? passage * 60 : passage,
      votingMode: /jury/i.test(draft.vote ?? "") ? "jury" : /host|mixte/i.test(draft.vote ?? "") ? "mixed" : "public",
      ...(/aucun|sans vote/i.test(draft.vote ?? "") ? { openMicFeedback: "none" as const } : {}),
    },
  };
}

export function readCageLaunchTemplates(scope: string): CageLaunchTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const own: unknown = JSON.parse(window.localStorage.getItem(`${TEMPLATE_KEY}${scope}`) ?? "[]");
    const saved: CageLaunchTemplate[] = Array.isArray(own) ? own.filter((entry) => entry && typeof entry.id === "string" && isConfiguration(entry.configuration, false)) : [];
    const legacy: unknown = JSON.parse(window.localStorage.getItem(`meewav-profile-cages-v1:${scope}`) ?? "[]");
    if (Array.isArray(legacy)) {
      for (const entry of legacy) {
        if (!entry || typeof entry.id !== "string" || typeof entry.title !== "string" || saved.some((item) => item.id === entry.id)) continue;
        saved.push({ id: entry.id, updatedAt: "", configuration: configurationFromProfileCage(entry) });
      }
    }
    return saved;
  } catch { return []; }
}

export function saveCageLaunchTemplate(scope: string, configuration: CageLaunchConfiguration): CageLaunchTemplate {
  const id = crypto.randomUUID();
  const entry = { id, updatedAt: new Date().toISOString(), configuration: { ...cloneCageConfiguration(configuration), templateId: id } };
  const templates = readCageLaunchTemplates(scope);
  window.localStorage.setItem(`${TEMPLATE_KEY}${scope}`, JSON.stringify([entry, ...templates]));
  return entry;
}

export function stageCageLaunchDraft(scope: string, configuration: CageLaunchConfiguration) {
  window.sessionStorage.setItem(`${DRAFT_KEY}${scope}`, JSON.stringify(cloneCageConfiguration(configuration)));
}

export function readCageLaunchDraft(scope: string): CageLaunchConfiguration | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(`${DRAFT_KEY}${scope}`) ?? "null");
    return isConfiguration(value, false) ? cloneCageConfiguration(value) : null;
  } catch { return null; }
}

export function createCageDemoSession(configuration: CageLaunchConfiguration): CageLaunchSnapshot {
  const error = validateCageLaunch(configuration);
  if (error) throw new Error(error);
  const id = crypto.randomUUID();
  const snapshot = { id, roomId: id, createdAt: new Date().toISOString(), configuration: cloneCageConfiguration(configuration) };
  // Each launch gets its own immutable snapshot. Competition progress is stored separately.
  window.localStorage.setItem(`${SESSION_KEY}${id}`, JSON.stringify(snapshot));
  return snapshot;
}

export function readCageDemoSession(id: string | null): CageLaunchSnapshot | null {
  if (!id || typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(`${SESSION_KEY}${id}`) ?? "null") as CageLaunchSnapshot | null;
    return value?.id === id && typeof value.roomId === "string" && typeof value.createdAt === "string" && isConfiguration(value.configuration, false)
      ? { ...value, configuration: cloneCageConfiguration(value.configuration) } : null;
  } catch { return null; }
}
