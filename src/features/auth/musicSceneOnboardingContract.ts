import type { MusicScene, MusicSceneCity } from "./musicSceneSelection";

const PENDING_ARRIVAL_STORAGE_KEY = "meewav:music-scene-onboarding:pending-arrival:v1";
const CURRENT_PROFILE_STORAGE_KEY = "meewav:music-scene-onboarding:current-profile:v1";

export type MusicSceneOnboardingProfile = {
  profileId: string;
  username: string;
  role: string;
  avatarFile: string;
  avatarIconId: string;
  visible: boolean;
};

export type MusicSceneOnboardingPayload = {
  version: 1;
  createdAt: number;
  auth?: {
    flow: "oauth";
    provider: "google" | "apple";
  };
  city: MusicSceneCity;
  scene: MusicScene;
  profile: MusicSceneOnboardingProfile;
};

export const CANONICAL_ONBOARDING_ROLE_LABELS = {
  viewer: "Utilisateur / Utilisatrice",
  vocalist: "Chanteur / Chanteuse / Rappeur",
  dancer: "Danseur / Danseuse",
  beatmaker: "Beatmaker",
  dj: "DJ",
  beatboxer: "Beatboxer",
  acoustic_guitarist: "Guitariste acoustique",
  electric_guitarist: "Guitariste électrique",
  pianist: "Pianiste",
  drummer: "Batteur / Batteuse",
  bassist: "Bassiste",
  violinist: "Violoniste",
  accordionist: "Accordéoniste",
  strings_instrumentalist: "Instrumentiste à cordes",
  wind_instrumentalist: "Instrumentiste à vent",
  brass_instrumentalist: "Instrumentiste à cuivre",
  percussionist: "Percussionniste",
  songwriter: "Auteur / Parolier",
  composer: "Compositeur",
  producer: "Producteur",
  sound_designer: "Sound designer",
  sound_engineer: "Ingénieur du son",
  vocal_coach: "Coach vocal",
  artistic_director: "Direction artistique",
  manager: "Management",
  label: "Label",
  videomaker: "Vidéaste clipper",
  studio: "Studio",
  stage_organization: "Organisation scénique",
} as const;

export type CanonicalOnboardingRoleKey = keyof typeof CANONICAL_ONBOARDING_ROLE_LABELS;

type OnboardingAvatarContract = {
  avatarIconId: string;
  roleKey: CanonicalOnboardingRoleKey;
  roleLabel: string;
};

/**
 * This is the Web counterpart of the canonical Supabase avatar catalogue.
 * There are 28 professional roles plus the shared viewer role; gendered or
 * legacy visual variants deliberately resolve to the same role key.
 */
export const ONBOARDING_AVATAR_CONTRACT: Readonly<Record<string, OnboardingAvatarContract>> = {
  "Violoniste.png": { avatarIconId: "avatar_1", roleKey: "violinist", roleLabel: "Violoniste" },
  "vidéaste clipper.png": { avatarIconId: "avatar_2", roleKey: "videomaker", roleLabel: "Vidéaste clipper" },
  "Utilisatrice.png": { avatarIconId: "avatar_3", roleKey: "viewer", roleLabel: "Utilisatrice" },
  "Utilisateur.png": { avatarIconId: "avatar_4", roleKey: "viewer", roleLabel: "Utilisateur" },
  "Studio d'enregistrement.png": { avatarIconId: "avatar_5", roleKey: "studio", roleLabel: "Studio" },
  "Sound designer.png": { avatarIconId: "avatar_6", roleKey: "sound_designer", roleLabel: "Sound designer" },
  "Pianiste..png": { avatarIconId: "avatar_7", roleKey: "pianist", roleLabel: "Pianiste" },
  "percussionniste.png": { avatarIconId: "avatar_8", roleKey: "percussionist", roleLabel: "Percussionniste" },
  "Organisation Scénique.png": { avatarIconId: "avatar_9", roleKey: "stage_organization", roleLabel: "Organisation scénique" },
  "Ménagement.png": { avatarIconId: "avatar_10", roleKey: "manager", roleLabel: "Management" },
  "Label.png": { avatarIconId: "avatar_11", roleKey: "label", roleLabel: "Label" },
  "Instrumentiste à cuivre..png": { avatarIconId: "avatar_12", roleKey: "brass_instrumentalist", roleLabel: "Instrumentiste à cuivre" },
  "Instruments a vent.png": { avatarIconId: "avatar_13", roleKey: "wind_instrumentalist", roleLabel: "Instrumentiste à vent" },
  "Ingénieur du son.png": { avatarIconId: "avatar_14", roleKey: "sound_engineer", roleLabel: "Ingénieur du son" },
  "Guitariste électrique..png": { avatarIconId: "avatar_15", roleKey: "electric_guitarist", roleLabel: "Guitariste électrique" },
  "Guitariste acoustique.png": { avatarIconId: "avatar_16", roleKey: "acoustic_guitarist", roleLabel: "Guitariste acoustique" },
  "DJ.png": { avatarIconId: "avatar_17", roleKey: "dj", roleLabel: "DJ" },
  "Direction artistique V2.png": { avatarIconId: "avatar_18", roleKey: "artistic_director", roleLabel: "Direction artistique" },
  "danseuse.png": { avatarIconId: "avatar_19", roleKey: "dancer", roleLabel: "Danseuse" },
  "danseurs.png": { avatarIconId: "avatar_20", roleKey: "dancer", roleLabel: "Danseur" },
  "Compositeur.png": { avatarIconId: "avatar_21", roleKey: "composer", roleLabel: "Compositeur" },
  "Coatch vocal.png": { avatarIconId: "avatar_22", roleKey: "vocal_coach", roleLabel: "Coach vocal" },
  "Chanteuse, rappeuse.png": { avatarIconId: "avatar_23", roleKey: "vocalist", roleLabel: "Chanteuse, rappeuse" },
  "Chanteur, rappeur..png": { avatarIconId: "avatar_24", roleKey: "vocalist", roleLabel: "Chanteur, rappeur" },
  "Beatmaker.png": { avatarIconId: "avatar_25", roleKey: "beatmaker", roleLabel: "Beatmaker" },
  "Beatboxer.png": { avatarIconId: "avatar_26", roleKey: "beatboxer", roleLabel: "Beatboxer" },
  "batteurs, batteuses.png": { avatarIconId: "avatar_27", roleKey: "drummer", roleLabel: "Batteur, batteuse" },
  "Bassiste.png": { avatarIconId: "avatar_28", roleKey: "bassist", roleLabel: "Bassiste" },
  "Auteur parolier.png": { avatarIconId: "avatar_29", roleKey: "songwriter", roleLabel: "Auteur, parolier" },
  "accordéoniste.png": { avatarIconId: "avatar_30", roleKey: "accordionist", roleLabel: "Accordéoniste" },
  "Instrumentiste à cordes V2.png": { avatarIconId: "avatar_31", roleKey: "strings_instrumentalist", roleLabel: "Instrumentiste à cordes" },
  "Instrumentiste à cordes.png": { avatarIconId: "avatar_32", roleKey: "strings_instrumentalist", roleLabel: "Instrumentiste à cordes" },
  "Producteur musicalv2.png": { avatarIconId: "avatar_33", roleKey: "producer", roleLabel: "Producteur" },
};

function normalizeRoleLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roleKeyFromValue(value: string): CanonicalOnboardingRoleKey | null {
  const normalized = normalizeRoleLookup(value);
  if (!normalized) return null;

  for (const [key, label] of Object.entries(CANONICAL_ONBOARDING_ROLE_LABELS)) {
    if (normalizeRoleLookup(key) === normalized || normalizeRoleLookup(label) === normalized) {
      return key as CanonicalOnboardingRoleKey;
    }
  }

  for (const avatar of Object.values(ONBOARDING_AVATAR_CONTRACT)) {
    if (normalizeRoleLookup(avatar.roleLabel) === normalized) return avatar.roleKey;
  }
  return null;
}

export function getOnboardingAvatarIconId(avatarFile: string) {
  return ONBOARDING_AVATAR_CONTRACT[avatarFile]?.avatarIconId ?? "avatar_4";
}

export function getCanonicalOnboardingAvatarFile(avatarFile: string) {
  return ONBOARDING_AVATAR_CONTRACT[avatarFile] ? avatarFile : "Utilisateur.png";
}

export function resolveOnboardingRole(avatarFile: string, selectedRole: string) {
  const avatar = ONBOARDING_AVATAR_CONTRACT[avatarFile];
  const selectedRoleKey = roleKeyFromValue(selectedRole);

  if (avatar) {
    const selectedLabel = selectedRole.trim();
    return {
      key: avatar.roleKey,
      label: selectedRoleKey === avatar.roleKey && selectedLabel && selectedLabel !== avatar.roleKey
        ? selectedLabel
        : avatar.roleLabel,
    };
  }

  const key = selectedRoleKey ?? "viewer";
  return { key, label: CANONICAL_ONBOARDING_ROLE_LABELS[key] };
}

export function getCanonicalOnboardingRoleLabel(roleKey: string) {
  const key = roleKeyFromValue(roleKey) ?? "viewer";
  return CANONICAL_ONBOARDING_ROLE_LABELS[key];
}

function isPayload(value: unknown): value is MusicSceneOnboardingPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<MusicSceneOnboardingPayload>;
  return payload.version === 1
    && typeof payload.createdAt === "number"
    && (
      !payload.auth
      || (
        payload.auth.flow === "oauth"
        && (payload.auth.provider === "google" || payload.auth.provider === "apple")
      )
    )
    && typeof payload.city?.communeCode === "string"
    && typeof payload.scene?.zoneId === "string"
    && (payload.scene?.source === "iris" || payload.scene?.source === "single-plate")
    && Array.isArray(payload.scene?.center)
    && typeof payload.profile?.profileId === "string";
}

function readStorage(storage: Storage, key: string) {
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    const payload = JSON.parse(value) as unknown;
    return isPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function saveMusicSceneOnboarding(payload: MusicSceneOnboardingPayload) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(payload);
  try {
    window.sessionStorage.setItem(PENDING_ARRIVAL_STORAGE_KEY, serialized);
  } catch {
    // Account creation remains usable even when the browser blocks session storage.
  }
  try {
    window.sessionStorage.setItem(CURRENT_PROFILE_STORAGE_KEY, serialized);
  } catch {
    // The production profile remains the source of truth when preview storage is blocked.
  }
}

export function peekPendingMusicSceneArrival() {
  if (typeof window === "undefined") return null;
  return readStorage(window.sessionStorage, PENDING_ARRIVAL_STORAGE_KEY);
}

export function consumePendingMusicSceneArrival() {
  const payload = peekPendingMusicSceneArrival();
  if (typeof window !== "undefined" && payload) {
    try {
      window.sessionStorage.removeItem(PENDING_ARRIVAL_STORAGE_KEY);
    } catch {
      // The in-memory navigation remains valid when browser storage is blocked.
    }
  }
  return payload;
}

export function readCurrentMusicSceneProfile() {
  if (typeof window === "undefined") return null;
  return readStorage(window.sessionStorage, CURRENT_PROFILE_STORAGE_KEY);
}

export function clearMusicSceneOnboardingPreview() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_ARRIVAL_STORAGE_KEY);
    window.sessionStorage.removeItem(CURRENT_PROFILE_STORAGE_KEY);
  } catch {
    // Authentication must never depend on optional preview storage.
  }
}
