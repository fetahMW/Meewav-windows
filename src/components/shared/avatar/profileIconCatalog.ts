import { getProfileIconImageUrl } from "./profileIconAssets";

export type ProfileIconCategoryId =
  | "avatar_1"
  | "avatar_2"
  | "avatar_3"
  | "avatar_4"
  | "avatar_5"
  | "avatar_6"
  | "avatar_7"
  | "avatar_8"
  | "avatar_9"
  | "avatar_10"
  | "avatar_11"
  | "avatar_12"
  | "avatar_13"
  | "avatar_14"
  | "avatar_15"
  | "avatar_16"
  | "avatar_17"
  | "avatar_18"
  | "avatar_19"
  | "avatar_20"
  | "avatar_21"
  | "avatar_22"
  | "avatar_23"
  | "avatar_24"
  | "avatar_25"
  | "avatar_26"
  | "avatar_27"
  | "avatar_28"
  | "avatar_29"
  | "avatar_30";

export type ProfileIconCategory<Key extends string = string> = {
  key: Key;
  label: string;
  count: number;
  filterTokens: string[];
  imageUrl: string;
};

type ProfileIconCategoryDefinition = Omit<
  ProfileIconCategory<ProfileIconCategoryId>,
  "count" | "imageUrl"
>;

const PROFILE_ICON_CATEGORY_DEFINITIONS: ProfileIconCategoryDefinition[] = [
  { key: "avatar_1", label: "Violoniste", filterTokens: ["avatar_1", "1", "instr_cordes", "violon", "violoniste", "cordes"] },
  { key: "avatar_2", label: "Vidéaste clipper", filterTokens: ["avatar_2", "2", "clipper", "clippeur", "videaste", "videaste_clipper"] },
  { key: "avatar_3", label: "Utilisatrice", filterTokens: ["avatar_3", "3", "user_f", "utilisatrice"] },
  { key: "avatar_4", label: "Utilisateur", filterTokens: ["avatar_4", "4", "user", "utilisateur", "fan", "auditeur"] },
  { key: "avatar_5", label: "Studio", filterTokens: ["avatar_5", "5", "studio", "studio_enregistrement"] },
  { key: "avatar_6", label: "Sound designer", filterTokens: ["avatar_6", "6", "synthetiseur", "synth", "clavier", "clavieriste", "sound_designer"] },
  { key: "avatar_7", label: "Pianiste", filterTokens: ["avatar_7", "7", "pianiste", "piano"] },
  { key: "avatar_8", label: "Percussionniste", filterTokens: ["avatar_8", "8", "percussion", "percussionniste"] },
  { key: "avatar_9", label: "Organisation scénique", filterTokens: ["avatar_9", "9", "orga_event", "organisation_scenique", "organisateur"] },
  { key: "avatar_10", label: "Management", filterTokens: ["avatar_10", "10", "manager", "management", "booker"] },
  { key: "avatar_11", label: "Label", filterTokens: ["avatar_11", "11", "label"] },
  { key: "avatar_12", label: "Cuivres", filterTokens: ["avatar_12", "12", "instr_cuivre", "cuivre", "saxo", "trompettiste"] },
  { key: "avatar_13", label: "Instruments à vent", filterTokens: ["avatar_13", "13", "instr_vent", "vent"] },
  { key: "avatar_14", label: "Ingénieur du son", filterTokens: ["avatar_14", "14", "inge_son", "ingenieur_son", "ing_son", "sound_engineer"] },
  { key: "avatar_15", label: "Guitariste électrique", filterTokens: ["avatar_15", "15", "guitare_elec", "guitariste_electrique"] },
  { key: "avatar_16", label: "Guitariste acoustique", filterTokens: ["avatar_16", "16", "guitariste", "guitare", "guitarist"] },
  { key: "avatar_17", label: "DJ", filterTokens: ["avatar_17", "17", "dj", "deejay", "disc_jockey"] },
  { key: "avatar_18", label: "Direction artistique", filterTokens: ["avatar_18", "18", "direction_artistique", "artistic_direction"] },
  { key: "avatar_19", label: "Danseuse", filterTokens: ["avatar_19", "19", "danseuse"] },
  { key: "avatar_20", label: "Danseur", filterTokens: ["avatar_20", "20", "danseur", "danseurs", "dance"] },
  { key: "avatar_21", label: "Compositeur", filterTokens: ["avatar_21", "21", "compositeur", "composer"] },
  { key: "avatar_22", label: "Coach vocal", filterTokens: ["avatar_22", "22", "coach_vocal", "coatch_vocal", "vocal_coach"] },
  { key: "avatar_23", label: "Chanteuse / rappeuse", filterTokens: ["avatar_23", "23", "chanteuse", "chanteuse_rappeuse", "rappeuse"] },
  { key: "avatar_24", label: "Chanteur / rappeur", filterTokens: ["avatar_24", "24", "chanteur", "chanteur_rappeur", "rappeur", "micro", "microphone", "vox", "voice", "vocal"] },
  { key: "avatar_25", label: "Beatmaker", filterTokens: ["avatar_25", "25", "beatmaker", "producteur", "producer"] },
  { key: "avatar_26", label: "Beatboxer", filterTokens: ["avatar_26", "26", "beatboxer", "beatbox"] },
  { key: "avatar_27", label: "Batteur / batteuse", filterTokens: ["avatar_27", "27", "batteur", "batteuse", "drummer"] },
  { key: "avatar_28", label: "Bassiste", filterTokens: ["avatar_28", "28", "bassiste", "basse"] },
  { key: "avatar_29", label: "Auteur / parolier", filterTokens: ["avatar_29", "29", "auteur", "parolier", "songwriter", "lyrics"] },
  { key: "avatar_30", label: "Accordéoniste", filterTokens: ["avatar_30", "30", "accordeon", "accordeoniste"] },
];

export const GLOBE_ARTIST_ROLE_OPTIONS: ProfileIconCategory<ProfileIconCategoryId>[] =
  PROFILE_ICON_CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    count: 0,
    imageUrl: getProfileIconImageUrl(category.key),
  }));

type AudienceProfileIconId = "avatar_3" | "avatar_4";
export type SceneArtistRoleId = Exclude<ProfileIconCategoryId, AudienceProfileIconId>;

const AUDIENCE_PROFILE_ICON_IDS = new Set<ProfileIconCategoryId>(["avatar_3", "avatar_4"]);

function isSceneArtistRole(
  category: ProfileIconCategory<ProfileIconCategoryId>,
): category is ProfileIconCategory<SceneArtistRoleId> {
  return !AUDIENCE_PROFILE_ICON_IDS.has(category.key);
}

/** Artist-facing view used by media features: public listener avatars excluded. */
export const SCENE_ARTIST_ROLE_OPTIONS: ProfileIconCategory<SceneArtistRoleId>[] =
  GLOBE_ARTIST_ROLE_OPTIONS.filter(isSceneArtistRole);
