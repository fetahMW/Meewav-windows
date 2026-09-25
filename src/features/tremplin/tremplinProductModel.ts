import type { GradeLevel } from "../grades/gradeBadges";
import type { TremplinArtist } from "./tremplinArtistData";
import { getTremplinProfessionLabel, getTremplinRoleProfile } from "./tremplinRoleData";

export type TremplinTalentCategoryId =
  | "all"
  | "solo"
  | "groups"
  | "interpreters"
  | "djs"
  | "beatmakers"
  | "producers"
  | "composers"
  | "instrumentalists";

export type TremplinUserState =
  | "visitor"
  | "member"
  | "talent-level-1"
  | "talent-eligible"
  | "application-pending"
  | "token-active";

export type TremplinTokenLifecycleStage =
  | "observation"
  | "eligible"
  | "review"
  | "upcoming"
  | "active"
  | "suspended";

export type TremplinContextAction = {
  label: string;
  detail: string;
  destination: "understand" | "application" | "dashboard";
};

/**
 * Public product contract. These exclusions must also be enforced by the API
 * and recommendation services when real data replaces the local fixtures.
 */
export const TREMPLIN_SYSTEM_POLICY = {
  discovery: {
    financialSignalsExcluded: [
      "token-price",
      "token-price-change",
      "purchase-count",
      "resale-count",
      "financial-volume",
      "token-holder-count",
      "reciprocal-purchase",
    ],
  },
  grades: {
    financialSignalsExcluded: [
      "token-purchases",
      "amount-spent",
      "token-value",
      "token-holder-count",
      "reciprocal-purchase",
    ],
  },
  reciprocalSupport: {
    affectsGrade: false,
    affectsDiscovery: false,
    affectsShortsReach: false,
    createsPublicScore: false,
    mandatory: false,
  },
  notifications: {
    priceAlertsEnabledByDefault: false,
    allowedFinancialEvents: [
      "operation-completed",
      "document-available",
      "resale-window-opened",
      "rule-changed",
      "unusual-activity",
      "verification-required",
    ],
    promotionalPriceEvents: [],
  },
} as const;

const TREMPLIN_TOKEN_LIFECYCLE_OVERRIDES: Readonly<
  Record<string, TremplinTokenLifecycleStage>
> = {
  "maya-chen": "active",
  lunae: "active",
  "mina-roze": "upcoming",
  "neo-sillage": "review",
  "zelie-north": "eligible",
} as const;

const stableTalentHash = (value: string) => [...value].reduce(
  (hash, character, index) => (
    (hash * 31 + character.charCodeAt(0) * (index + 3)) % 100_003
  ),
  17,
);

export function getTremplinTokenLifecycleStage(
  artist: Pick<TremplinArtist, "id" | "gradeLevel">,
): TremplinTokenLifecycleStage {
  const explicitStage = TREMPLIN_TOKEN_LIFECYCLE_OVERRIDES[artist.id];
  if (explicitStage) return explicitStage;
  if (artist.gradeLevel <= 1) return "observation";

  const phase = stableTalentHash(artist.id) % 6;
  if (artist.gradeLevel === 2) {
    return ([
      "eligible",
      "review",
      "upcoming",
      "observation",
      "eligible",
      "review",
    ] as const)[phase];
  }
  if (phase === 0) return "active";
  if (phase === 1) return "review";
  if (phase === 2) return "upcoming";
  return "observation";
}

export const TREMPLIN_TALENT_CATEGORIES: readonly {
  id: TremplinTalentCategoryId;
  label: string;
}[] = [
  { id: "all", label: "Tous les artistes" },
  { id: "solo", label: "Artistes solo" },
  { id: "groups", label: "Groupes" },
  { id: "interpreters", label: "Chanteurs & interprètes" },
  { id: "djs", label: "DJs" },
  { id: "beatmakers", label: "Beatmakers" },
  { id: "producers", label: "Producteurs artistiques" },
  { id: "composers", label: "Compositeurs" },
  { id: "instrumentalists", label: "Instrumentistes" },
] as const;

export const TREMPLIN_TRUST_PROMISES = [
  "5 % maximum par personne",
  "Revente rapide pénalisée",
  "Profils vérifiés",
] as const;

/**
 * Fixture strictement pédagogique utilisée dans « Comment ça marche ».
 * Les montants réels restent fournis et recalculés par le serveur.
 */
export const TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE = {
  amountCents: 2_500,
  estimatedTokenHundredths: 2_770,
  feesCents: 73,
  artistShareCents: 75,
  totalDebitCents: 2_500,
  resaleLabel: "Selon les conditions affichées",
} as const;

export const TREMPLIN_GRADE_EXPERIENCE: Readonly<Record<GradeLevel, {
  title: string;
  definition: string;
  note: string;
  criteria: readonly string[];
}>> = {
  1: {
    title: "Débutant",
    definition: "Le profil artistique se structure autour d’une identité vérifiée et d’une première publication.",
    note: "Le grade n’accorde aucun avantage financier ni visibilité automatique.",
    criteria: ["Identité vérifiée", "Profil complété", "Première création publiée"],
  },
  2: {
    title: "Émergent",
    definition: "Le parcours présente une activité réelle, régulière et des projets documentés.",
    note: "À partir de ce niveau, l’artiste peut déposer une demande de jeton, sans garantie d’acceptation.",
    criteria: ["Publications documentées", "Activité régulière", "Audience authentique"],
  },
  3: {
    title: "Confirmé",
    definition: "Le parcours se consolide grâce aux réalisations, aux collaborations et aux étapes vérifiées.",
    note: "Le grade ne détermine ni la sélection éditoriale ni la recommandation du profil.",
    criteria: ["Collaborations vérifiées", "Réalisations documentées", "Activité suivie"],
  },
  4: {
    title: "Élite",
    definition: "Le parcours professionnel est structuré et appuyé par des crédits et réalisations vérifiés.",
    note: "Le grade ne garantit aucun programme, opportunité ou mise en avant.",
    criteria: ["Crédits professionnels", "Projets terminés", "Reconnaissance documentée"],
  },
  5: {
    title: "Maître",
    definition: "Le parcours confirme une expérience durable, une activité constante et des actions de transmission.",
    note: "Le grade ne garantit aucune visibilité ni accès automatique à un programme.",
    criteria: ["Expérience durable", "Transmission documentée", "Rayonnement professionnel"],
  },
  6: {
    title: "Légendaire",
    definition: "Un parcours majeur et durable est reconnu à partir d’œuvres, de crédits et d’accomplissements documentés.",
    note: "Ce niveau reconnaît un parcours documenté sans prédire sa réussite future.",
    criteria: ["Œuvres reconnues", "Longévité documentée", "Héritage professionnel"],
  },
} as const;

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr-FR");

const groupSignals = [
  "groupe",
  "duo",
  "trio",
  "quartet",
  "quatuor",
  "collectif",
  "orchestre",
  "ensemble",
];

export function isPublicTremplinTalent(artist: TremplinArtist) {
  const familyId = getTremplinRoleProfile(artist).familyId;
  return !artist.isAiArtist
    && familyId !== "danse-performance"
    && familyId !== "son-image"
    && familyId !== "accompagnement";
}

export function isGroupTalent(artist: TremplinArtist) {
  const identity = normalize([
    artist.name,
    artist.exactProfession ?? "",
    ...artist.disciplines,
  ].join(" "));
  return groupSignals.some((signal) => identity.includes(signal));
}

export function matchesTalentCategory(artist: TremplinArtist, categoryId: TremplinTalentCategoryId) {
  if (categoryId === "all") return true;
  const role = getTremplinRoleProfile(artist);
  const profession = normalize(getTremplinProfessionLabel(artist));

  if (categoryId === "solo") return !isGroupTalent(artist);
  if (categoryId === "groups") return isGroupTalent(artist);
  if (categoryId === "interpreters") return role.familyId === "voix";
  if (categoryId === "djs") return role.id === "dj";
  if (categoryId === "beatmakers") return role.id === "beatmaker";
  if (categoryId === "producers") {
    return role.id === "direction-artistique"
      || profession.includes("producteur")
      || profession.includes("productrice")
      || profession.includes("realisateur musical");
  }
  if (categoryId === "composers") {
    return role.id === "compositeur"
      || profession.includes("compositeur")
      || profession.includes("compositrice");
  }
  return role.familyId === "instruments";
}

export function getTremplinContextAction(userState: TremplinUserState): TremplinContextAction {
  if (userState === "talent-level-1") {
    return {
      label: "Voir les conditions d’accès",
      detail: "Le niveau 2 ouvre la demande",
      destination: "understand",
    };
  }
  if (userState === "talent-eligible") {
    return {
      label: "Demander mon jeton de talent",
      detail: "Dès le niveau 2 · Étude par MeeWav",
      destination: "application",
    };
  }
  if (userState === "application-pending") {
    return {
      label: "Suivre ma demande",
      detail: "Vérification en cours",
      destination: "application",
    };
  }
  if (userState === "token-active") {
    return {
      label: "Gérer mon jeton de talent",
      detail: "Espace artiste",
      destination: "dashboard",
    };
  }
  return {
    label: "Je suis artiste",
    detail: "Découvrir les conditions",
    destination: "understand",
  };
}

export function talentReasonToBelieve(artist: TremplinArtist) {
  const [firstSentence] = artist.biography.split(/(?<=[.!?])\s/);
  return firstSentence?.trim() || artist.biography;
}
