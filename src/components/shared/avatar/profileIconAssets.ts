export const PROFILE_ICON_BASE_PATH = "/images/V4";

export const PROFILE_ICON_FILES: Record<string, string> = {
  "artist-avatar-default": "Utilisateur.png",
  avatar_1: "Violoniste.png",
  avatar_2: "vidéaste clipper.png",
  avatar_3: "Utilisatrice.png",
  avatar_4: "Utilisateur.png",
  avatar_5: "Studio d'enregistrement.png",
  avatar_6: "Sound designer.png",
  avatar_7: "Pianiste..png",
  avatar_8: "percussionniste.png",
  avatar_9: "Organisation Scénique.png",
  avatar_10: "Ménagement.png",
  avatar_11: "Label.png",
  avatar_12: "Instrumentiste à cuivre..png",
  avatar_13: "Instruments a vent.png",
  avatar_14: "Ingénieur du son.png",
  avatar_15: "Guitariste électrique..png",
  avatar_16: "Guitariste acoustique.png",
  avatar_17: "DJ.png",
  avatar_18: "Direction artistique V2.png",
  avatar_19: "danseuse.png",
  avatar_20: "danseurs.png",
  avatar_21: "Compositeur.png",
  avatar_22: "Coatch vocal.png",
  avatar_23: "Chanteuse, rappeuse.png",
  avatar_24: "Chanteur, rappeur..png",
  avatar_25: "Beatmaker.png",
  avatar_26: "Beatboxer.png",
  avatar_27: "batteurs, batteuses.png",
  avatar_28: "Bassiste.png",
  avatar_29: "Auteur parolier.png",
  avatar_30: "accordéoniste.png",
  avatar_31: "Instrumentiste à cordes V2.png",
  avatar_32: "Instrumentiste à cordes.png",
  avatar_33: "Producteur musicalv2.png",
};

/**
 * Shared visual catalogue used by the Globe and by illustrated MeeWav filters.
 * Keeping the path resolver outside the map bundle avoids coupling feature UI
 * to MapLibre merely to render a small profile illustration.
 */
export function getProfileIconImageUrl(iconId: unknown): string {
  const key = typeof iconId === "string" && PROFILE_ICON_FILES[iconId]
    ? iconId
    : "avatar_4";
  return `${PROFILE_ICON_BASE_PATH}/${encodeURIComponent(PROFILE_ICON_FILES[key]).replace(/%2C/gi, ",")}`;
}
