import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { getProfileIconImageUrl, PROFILE_ICON_FILES } from "../../components/shared/avatar/profileIconAssets";
import type { DemoProfile, ProfileNotification } from "./profile.data";

type JsonRecord = Record<string, unknown>;

export type ProfileRecord = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
  avatar_style_key?: string | null;
  avatar_icon_id?: string | null;
  artist_type: string | null;
  primary_role_key: string | null;
  city: string | null;
  country: string | null;
  followers_count: number | null;
  following_count: number | null;
  grade: number | null;
  is_ghost_mode: boolean | null;
  is_verified: boolean | null;
  profile_image_url: string | null;
  public_profile_preferences: unknown;
  show_on_public_profile: boolean | null;
};

export type GradeStateRecord = {
  level: number | null;
  total_points: number | null;
  progress_basis_points: number | null;
};

export type NotificationRecord = {
  id: string;
  type: string;
  content: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

const PROFILE_SELECT = [
  "id",
  "username",
  "full_name",
  "bio",
  "avatar_url",
  "avatar_name",
  "avatar_style_key",
  "avatar_icon_id",
  "artist_type",
  "primary_role_key",
  "city",
  "country",
  "followers_count",
  "following_count",
  "grade",
  "is_ghost_mode",
  "is_verified",
  "profile_image_url",
  "public_profile_preferences",
  "show_on_public_profile",
].join(",");

const NOTIFICATION_SELECT = "id,type,content,is_read,created_at";

const ROLE_LABELS: Record<string, string> = {
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
};

const AVATAR_ASSET_ALIASES: Record<string, string> = {
  "avatar-1": "violoniste.png",
  "avatar-2": "videaste-clipper.png",
  "avatar-3": "utilisatrice.png",
  "avatar-4": "utilisateur.png",
  "avatar-5": "studio-enregistrement.png",
  "avatar-6": "sound-designer.png",
  "avatar-7": "pianiste.png",
  "avatar-8": "percussionniste.png",
  "avatar-9": "organisateur-evenements.png",
  "avatar-10": "management.png",
  "avatar-11": "label.png",
  "avatar-12": "instrumentiste-cuivre.png",
  "avatar-13": "instrumentiste-a-vent.png",
  "avatar-14": "ingenieur-son.png",
  "avatar-15": "guitariste-electrique.png",
  "avatar-16": "guitariste-acoustique.png",
  "avatar-17": "dj.png",
  "avatar-18": "directeur-artistique.png",
  "avatar-19": "danseuse.png",
  "avatar-20": "danseur.png",
  "avatar-21": "compositeur.png",
  "avatar-22": "coach-vocal.png",
  "avatar-23": "chanteuse-rappeuse.png",
  "avatar-24": "chanteur-rappeur.png",
  "avatar-25": "beatmaker.png",
  "avatar-26": "beatboxer.png",
  "avatar-27": "batteur-batteuse.png",
  "avatar-28": "bassiste.png",
  "avatar-29": "auteur-parolier.png",
  "avatar-30": "accordeoniste.png",
  utilisateurs: "utilisateur.png",
  utilisatrice: "utilisatrice.png",
  utilisateur: "utilisateur.png",
  "chanteuse-rappeuse": "chanteuse-rappeuse.png",
  "chanteur-rappeur": "chanteur-rappeur.png",
  danseuse: "danseuse.png",
  danseurs: "danseur.png",
  beatmaker: "beatmaker.png",
  dj: "dj.png",
  beatboxer: "beatboxer.png",
  "guitariste-acoustique": "guitariste-acoustique.png",
  "guitariste-electrique": "guitariste-electrique.png",
  pianiste: "pianiste.png",
  "batteurs-batteuses": "batteur-batteuse.png",
  bassiste: "bassiste.png",
  violoniste: "violoniste.png",
  accordeoniste: "accordeoniste.png",
  "instruments-a-vent": "instrumentiste-a-vent.png",
  "instrumentiste-a-cuivre": "instrumentiste-cuivre.png",
  percussionniste: "percussionniste.png",
  "auteur-parolier": "auteur-parolier.png",
  compositeur: "compositeur.png",
  "sound-designer": "sound-designer.png",
  "ingenieur-du-son": "ingenieur-son.png",
  "coatch-vocal": "coach-vocal.png",
  "direction-artistique-v2": "directeur-artistique.png",
  menagement: "management.png",
  management: "management.png",
  label: "label.png",
  "videaste-clipper": "videaste-clipper.png",
  "studio-d-enregistrement": "studio-enregistrement.png",
  "organisation-scenique": "organisateur-evenements.png",
};

const GRADE_MINIMUM_POINTS = [0, 0, 1_000, 2_000, 3_000, 4_000, 6_000] as const;

export type ProfileServiceErrorCode =
  | "profile-not-found"
  | "profile-load-failed"
  | "profile-update-failed"
  | "notifications-load-failed"
  | "notifications-update-failed"
  | "invalid-profile";

export class ProfileServiceError extends Error {
  readonly code: ProfileServiceErrorCode;

  constructor(code: ProfileServiceErrorCode, message: string) {
    super(message);
    this.name = "ProfileServiceError";
    this.code = code;
  }
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function readBoolean(record: JsonRecord, key: string, fallback: boolean) {
  return typeof record[key] === "boolean" ? record[key] as boolean : fallback;
}

function readNumber(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAdditiveSchemaCompatibilityError(error: unknown) {
  const record = asRecord(error);
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "PGRST204" || code === "42703" || /display_name/i.test(message);
}

function clampGrade(value: number | null | undefined): DemoProfile["grade"] {
  const integer = Math.trunc(value ?? 1);
  return Math.min(6, Math.max(1, integer)) as DemoProfile["grade"];
}

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value ?? 0)).replace("k", " k");
}

function humanizeRole(value: string | null | undefined) {
  const role = value?.trim();
  if (!role) return "Créateur Meewav";
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  if (!role.includes("_")) return role;
  const words = role.replace(/_/g, " ");
  return words.charAt(0).toLocaleUpperCase("fr-FR") + words.slice(1);
}

export function canonicalRoleKeyForLabel(label: string, fallback: string | null = null) {
  const trimmedLabel = label.trim();
  if (ROLE_LABELS[trimmedLabel]) return trimmedLabel;
  const normalizedParts = trimmedLabel
    .split("·")
    .map((part) => part.trim().toLocaleLowerCase("fr-FR"))
    .filter(Boolean);
  for (const part of normalizedParts) {
    const match = Object.entries(ROLE_LABELS).find(([, value]) => value.toLocaleLowerCase("fr-FR") === part);
    if (match) return match[0];
  }
  return fallback;
}

function avatarFromRecord(record: ProfileRecord) {
  const uploadedUrl = record.profile_image_url?.trim();
  if (uploadedUrl && (/^https?:\/\//i.test(uploadedUrl) || uploadedUrl.startsWith("/") || uploadedUrl.startsWith("blob:"))) return uploadedUrl;

  const selectedIcon = [record.avatar_style_key, record.avatar_icon_id]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value && PROFILE_ICON_FILES[value]));
  if (selectedIcon) return getProfileIconImageUrl(selectedIcon);

  const directUrl = record.avatar_url?.trim();
  if (directUrl && (/^https?:\/\//i.test(directUrl) || directUrl.startsWith("/") || directUrl.startsWith("blob:"))) return directUrl;

  const filename = record.avatar_name?.trim() || directUrl;
  if (filename) {
    const slug = filename
      .replace(/\.png$/i, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const asset = AVATAR_ASSET_ALIASES[slug];
    if (asset) return `/avatars/${asset}`;
  }

  return "/avatars/utilisateur.png";
}

function notificationTitle(type: string) {
  switch (type) {
    case "follow": return "Nouvel abonnement";
    case "message": return "Nouveau message";
    case "collaboration": return "Proposition de collaboration";
    case "payment": return "Paiement mis à jour";
    case "contract": return "Contrat à consulter";
    case "grade": return "Ton grade évolue";
    default: return "Nouvelle activité";
  }
}

function formatRelativeTime(value: string | null) {
  if (!value) return "À l’instant";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "À l’instant";

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (elapsedSeconds < 60) return "À l’instant";
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)} min`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)} h`;
  if (elapsedSeconds < 172_800) return "Hier";
  if (elapsedSeconds < 604_800) return `${Math.floor(elapsedSeconds / 86_400)} j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(timestamp);
}

function completionForProfile(record: ProfileRecord) {
  const values = [
    record.full_name,
    record.username,
    record.artist_type,
    record.city,
    record.country,
    record.bio,
    record.profile_image_url || record.avatar_url || record.avatar_name,
  ];
  return Math.round(values.filter((value) => Boolean(value?.trim())).length / values.length * 100);
}

export function mapProfileRecord(record: ProfileRecord, gradeState?: GradeStateRecord | null): DemoProfile {
  const preferences = asRecord(record.public_profile_preferences);
  const grade = clampGrade(record.grade);
  const stateLevel = clampGrade(gradeState?.level);
  const trustedGradeState = gradeState && stateLevel === grade ? gradeState : null;
  const totalPoints = Math.max(0, trustedGradeState?.total_points ?? 0);
  const nextMinimum = grade < 6 ? GRADE_MINIMUM_POINTS[grade + 1] : totalPoints;
  const progressFromState = trustedGradeState
    ? Math.round(Math.max(0, Math.min(10_000, trustedGradeState.progress_basis_points ?? 0)) / 100)
    : null;
  const username = record.username?.trim().replace(/^@+/, "") || "profil";

  return {
    displayName: record.full_name?.trim() || `@${username}`,
    username: `@${username}`,
    role: humanizeRole(record.primary_role_key ?? record.artist_type),
    roleKey: record.primary_role_key
      ?? canonicalRoleKeyForLabel(record.artist_type ?? "", null),
    city: record.city?.trim() || "Ville non renseignée",
    country: record.country?.trim() || "Pays non renseigné",
    bio: record.bio?.trim() || "Ajoute une bio pour présenter ton parcours et tes collaborations.",
    avatarUrl: avatarFromRecord(record),
    followers: formatCount(record.followers_count),
    following: formatCount(record.following_count),
    grade,
    gradeProgress: progressFromState ?? Math.max(0, Math.min(100, readNumber(preferences, "grade_progress") ?? 0)),
    pointsToNextGrade: grade < 6 ? Math.max(0, nextMinimum - totalPoints) : 0,
    tokenValue: readString(preferences, "token_value") ?? "0,00 €",
    profileCompletion: Math.max(0, Math.min(100, readNumber(preferences, "profile_completion") ?? completionForProfile(record))),
    isVerified: record.is_verified === true,
    visibility: {
      role: readBoolean(preferences, "show_role", true),
      grade: readBoolean(preferences, "show_grade", true),
      collab: readBoolean(preferences, "show_collab", true),
      viewerMenu: readBoolean(preferences, "show_viewer_menu", false),
      showOnPublicProfile: record.show_on_public_profile === true,
      isGhostMode: record.is_ghost_mode !== false,
    },
    publicProfilePreferences: preferences,
  };
}

export function mapNotificationRecord(record: NotificationRecord): ProfileNotification {
  return {
    id: record.id,
    title: notificationTitle(record.type),
    detail: record.content?.trim() || "Une activité récente concerne ton profil.",
    time: formatRelativeTime(record.created_at),
    unread: record.is_read !== true,
    type: record.type,
  };
}

export function toOwnerProfileUpdate(profile: DemoProfile) {
  const username = profile.username.trim().replace(/^@+/, "").toLocaleLowerCase("fr-FR");
  const displayName = profile.displayName.trim();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new ProfileServiceError("invalid-profile", "Le nom d’utilisateur doit contenir 3 à 20 lettres, chiffres ou underscores.");
  }
  if (!displayName || displayName.length > 80) {
    throw new ProfileServiceError("invalid-profile", "Le nom affiché doit contenir entre 1 et 80 caractères.");
  }
  if (profile.bio.length > 220) {
    throw new ProfileServiceError("invalid-profile", "La bio ne peut pas dépasser 220 caractères.");
  }

  const publicPreferences = {
    ...profile.publicProfilePreferences,
    show_role: profile.visibility.role,
    show_grade: profile.visibility.grade,
    show_collab: profile.visibility.collab,
    show_viewer_menu: profile.visibility.viewerMenu,
  };
  const primaryRoleKey = canonicalRoleKeyForLabel(profile.role, profile.roleKey)
    ?? (profile.role.trim() || null);

  return {
    username,
    full_name: displayName,
    artist_type: primaryRoleKey,
    primary_role_key: primaryRoleKey,
    city: profile.city.trim() || null,
    country: profile.country.trim() || null,
    bio: profile.bio.trim() || null,
    // Data URLs belong in Storage, never in the shared profile row.
    ...(profile.avatarUrl && !profile.avatarUrl.startsWith("data:") ? { avatar_url: profile.avatarUrl } : {}),
    public_profile_preferences: publicPreferences,
    show_on_public_profile: profile.visibility.showOnPublicProfile,
    is_ghost_mode: profile.visibility.isGhostMode,
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;

export function createProfileRepository(client: SupabaseClient = supabase) {
  const getGradeState = async (userId: string) => {
    const result = await client
      .from("profile_grade_state")
      .select("level,total_points,progress_basis_points")
      .eq("profile_id", userId)
      .maybeSingle();
    return result.error ? null : result.data as unknown as GradeStateRecord | null;
  };

  return {
    async getOwnerProfile(userId: string) {
      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw new ProfileServiceError("profile-load-failed", "Impossible de charger le profil pour le moment.");
      }
      if (!data) {
        throw new ProfileServiceError("profile-not-found", "Ce compte n’a pas encore de profil Meewav.");
      }

      // Grade state is additive. A deployment that has not received the new
      // table yet still renders the canonical grade stored on profiles.
      return mapProfileRecord(data as unknown as ProfileRecord, await getGradeState(userId));
    },

    async updateOwnerProfile(userId: string, profile: DemoProfile) {
      const update = toOwnerProfileUpdate(profile);
      // `display_name` is the canonical cross-platform field introduced by the
      // additive foundation. The one-time compatibility retry keeps the Web
      // usable against an environment that has not received that migration yet.
      let result = await client
        .from("profiles")
        .update({ ...update, display_name: update.full_name })
        .eq("id", userId)
        .select(PROFILE_SELECT)
        .single();

      if (result.error && isAdditiveSchemaCompatibilityError(result.error)) {
        result = await client
          .from("profiles")
          .update(update)
          .eq("id", userId)
          .select(PROFILE_SELECT)
          .single();
      }

      if (result.error || !result.data) {
        throw new ProfileServiceError("profile-update-failed", "Le profil n’a pas pu être sauvegardé. Réessaie dans un instant.");
      }

      return mapProfileRecord(result.data as unknown as ProfileRecord, await getGradeState(userId));
    },

    async getNotifications(userId: string) {
      const { data, error } = await client
        .from("notifications")
        .select(NOTIFICATION_SELECT)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        throw new ProfileServiceError("notifications-load-failed", "Impossible de charger les notifications pour le moment.");
      }

      return (data ?? []).map((record) => mapNotificationRecord(record as unknown as NotificationRecord));
    },

    async markNotificationsRead(userId: string, notificationIds?: string[]) {
      let query = client
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (notificationIds?.length) query = query.in("id", notificationIds);
      const { error } = await query;

      if (error) {
        throw new ProfileServiceError("notifications-update-failed", "Les notifications n’ont pas pu être mises à jour.");
      }
    },
  };
}

export const profileRepository = createProfileRepository();
