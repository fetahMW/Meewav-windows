import type { TremplinArtist } from "./tremplinArtistData";

export type TremplinRoleFamilyId =
  | "voix"
  | "danse-performance"
  | "instruments"
  | "creation-production"
  | "son-image"
  | "accompagnement";

export type TremplinRoleId =
  | "chanteuse-rappeuse"
  | "chanteur-rappeur"
  | "danseuse"
  | "danseur"
  | "beatmaker"
  | "dj"
  | "beatboxer"
  | "guitariste-acoustique"
  | "guitariste-electrique"
  | "pianiste"
  | "batteur-batteuse"
  | "bassiste"
  | "violoniste"
  | "accordeoniste"
  | "instrumentiste-vent"
  | "instrumentiste-cuivre"
  | "percussionniste"
  | "auteur-parolier"
  | "compositeur"
  | "sound-designer"
  | "ingenieur-son"
  | "coach-vocal"
  | "direction-artistique"
  | "management"
  | "label"
  | "videaste-clipper"
  | "studio-enregistrement"
  | "organisation-scenique";

export type TremplinRoleProfile = {
  id: TremplinRoleId;
  label: string;
  shortLabel: string;
  familyId: TremplinRoleFamilyId;
  familyLabel: string;
  avatarSrc: string;
  description: string;
  keywords: readonly string[];
};

const role = (
  id: TremplinRoleId,
  label: string,
  shortLabel: string,
  familyId: TremplinRoleFamilyId,
  familyLabel: string,
  avatarFile: string,
  description: string,
  keywords: readonly string[],
): TremplinRoleProfile => ({
  id,
  label,
  shortLabel,
  familyId,
  familyLabel,
  avatarSrc: `/avatars/${avatarFile}`,
  description,
  keywords,
});

/**
 * The canonical 28-role MeeWav directory.
 *
 * These are professions and ecosystem roles, not music genres. The two public
 * avatars (Utilisateur and Utilisatrice) intentionally live outside Tremplin.
 */
export const TREMPLIN_ROLE_PROFILES: readonly TremplinRoleProfile[] = [
  role("chanteuse-rappeuse", "Chanteuse, rappeuse", "Chanteuse · rappeuse", "voix", "Voix & interprétation", "chanteuse-rappeuse.png", "Interprète, chante, rappe et porte un projet par sa voix.", ["chanteuse", "rappeuse", "vocaliste", "soprano"]),
  role("chanteur-rappeur", "Chanteur, rappeur", "Chanteur · rappeur", "voix", "Voix & interprétation", "chanteur-rappeur.png", "Interprète, chante, rappe et porte un projet par sa voix.", ["chanteur", "rappeur", "vocaliste", "crooner"]),
  role("danseuse", "Danseuse", "Danseuse", "danse-performance", "Danse & performance", "danseuse.png", "Danse, performe et construit le langage chorégraphique d'un projet.", ["danseuse", "choregraphe"]),
  role("danseur", "Danseur", "Danseur", "danse-performance", "Danse & performance", "danseur.png", "Danse, performe et construit le langage chorégraphique d'un projet.", ["danseur", "krump"]),
  role("beatboxer", "Beatboxer", "Beatboxer", "voix", "Voix & interprétation", "beatboxer.png", "Crée rythmes, textures et performances uniquement avec la voix.", ["beatboxer", "beatbox"]),

  role("guitariste-acoustique", "Guitariste acoustique", "Guitare acoustique", "instruments", "Musiciens & instruments", "guitariste-acoustique.png", "Compose, accompagne et performe à la guitare acoustique.", ["guitariste acoustique", "guitare acoustique", "guitare nylon", "flamenco"]),
  role("guitariste-electrique", "Guitariste électrique", "Guitare électrique", "instruments", "Musiciens & instruments", "guitariste-electrique.png", "Apporte riffs, solos et textures électriques au projet.", ["guitariste electrique", "guitariste", "guitare electrique"]),
  role("pianiste", "Pianiste", "Pianiste", "instruments", "Musiciens & instruments", "pianiste.png", "Compose, accompagne et performe au piano ou aux claviers.", ["pianiste", "clavieriste", "piano"]),
  role("batteur-batteuse", "Batteur, batteuse", "Batterie", "instruments", "Musiciens & instruments", "batteur-batteuse.png", "Construit le rythme, la dynamique et l'énergie live.", ["batteur", "batteuse", "batterie"]),
  role("bassiste", "Bassiste", "Bassiste", "instruments", "Musiciens & instruments", "bassiste.png", "Pose le groove et les fondations rythmiques du morceau.", ["bassiste", "contrebassiste", "basse"]),
  role("violoniste", "Cordes, harpe & luths", "Cordes · harpe · luths", "instruments", "Musiciens & instruments", "violoniste.png", "Apporte mélodie, tension et couleur au violon, au violoncelle, à la harpe, au oud ou aux cordes traditionnelles.", ["violoniste", "violoncelliste", "harpiste", "joueur de kora", "oudiste", "instrumentiste a cordes", "violon", "violoncelle", "harpe", "kora", "oud"]),
  role("accordeoniste", "Accordéoniste", "Accordéoniste", "instruments", "Musiciens & instruments", "accordeoniste.png", "Développe une signature forte autour de l'accordéon.", ["accordeoniste", "accordeon"]),
  role("instrumentiste-vent", "Instrumentiste à vent", "Bois & vents", "instruments", "Musiciens & instruments", "instrumentiste-a-vent.png", "Joue flûte, clarinette, hautbois ou saxophone.", ["flutiste", "saxophoniste", "clarinettiste", "hautbois", "instrumentiste a vent"]),
  role("instrumentiste-cuivre", "Instrumentiste à cuivre", "Cuivres", "instruments", "Musiciens & instruments", "instrumentiste-cuivre.png", "Joue trompette, trombone, tuba ou cor.", ["trompettiste", "tromboniste", "tuba", "corniste", "cuivre"]),
  role("percussionniste", "Percussionniste", "Percussionniste", "instruments", "Musiciens & instruments", "percussionniste.png", "Ajoute rythmes organiques et textures percussives.", ["percussionniste", "percussions", "marimba"]),

  role("beatmaker", "Beatmaker", "Beatmaker", "creation-production", "Création & production", "beatmaker.png", "Crée des instrumentales, rythmes et identités de production.", ["beatmaker", "beatmakeuse", "producteur de beats"]),
  role("dj", "DJ", "DJ", "creation-production", "Création & production", "dj.png", "Mixe, sélectionne et construit l'énergie d'un set en direct.", ["dj", "deejay"]),
  role("auteur-parolier", "Auteur, parolier", "Auteur · parolier", "creation-production", "Création & production", "auteur-parolier.png", "Écrit les textes, refrains et récits qui portent les morceaux.", ["auteur", "autrice", "parolier", "paroliere", "poete", "slameur"]),
  role("compositeur", "Compositeur", "Composition", "creation-production", "Création & production", "compositeur.png", "Crée mélodies, harmonies et architectures musicales.", ["compositeur", "compositrice", "arrangeur", "arrangeuse", "realisateur musical", "producteur", "productrice"]),
  role("direction-artistique", "Direction artistique", "Direction artistique", "creation-production", "Création & production", "directeur-artistique.png", "Garantit la cohérence du son, de l'image et du récit.", ["direction artistique", "directeur artistique", "directrice artistique"]),

  role("sound-designer", "Sound designer", "Sound design", "son-image", "Son, studio & image", "sound-designer.png", "Crée des sons, ambiances et textures originales.", ["sound designer", "sound design", "field recordist"]),
  role("ingenieur-son", "Ingénieur du son", "Ingénierie son", "son-image", "Son, studio & image", "ingenieur-son.png", "Enregistre, mixe et garantit la qualité sonore du projet.", ["ingenieur du son", "ingenieure du son", "mixeur", "mixage", "mastering engineer"]),
  role("videaste-clipper", "Vidéaste clipper", "Vidéaste · clipper", "son-image", "Son, studio & image", "videaste-clipper.png", "Réalise clips, sessions filmées et contenus visuels.", ["videaste", "clipper", "realisatrice clips", "realisateur clips", "vj"]),
  role("studio-enregistrement", "Studio d'enregistrement", "Studio", "son-image", "Son, studio & image", "studio-enregistrement.png", "Met à disposition un lieu, une équipe et du matériel professionnel.", ["studio d'enregistrement", "studio", "regie"]),

  role("coach-vocal", "Coach vocal", "Coach vocal", "accompagnement", "Équipes & accompagnement", "coach-vocal.png", "Travaille justesse, souffle, endurance et interprétation.", ["coach vocal", "coaching vocal"]),
  role("management", "Management", "Management", "accompagnement", "Équipes & accompagnement", "management.png", "Structure la stratégie, les contrats, le planning et les opportunités.", ["management", "manager", "manageuse"]),
  role("label", "Label", "Label", "accompagnement", "Équipes & accompagnement", "label.png", "Développe, produit, distribue et accompagne des projets.", ["label", "a&r", "edition musicale"]),
  role("organisation-scenique", "Organisation scénique", "Scène & régie", "accompagnement", "Équipes & accompagnement", "organisateur-evenements.png", "Conçoit la scénographie, la régie et les conditions du live.", ["organisation scenique", "scenographe", "regisseur", "regisseuse", "production live"]),
] as const;

const normalizeRoleText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr-FR");

export const TREMPLIN_ROLE_FAMILIES = Array.from(
  new Map(TREMPLIN_ROLE_PROFILES.map((profile) => [
    profile.familyId,
    { id: profile.familyId, label: profile.familyLabel },
  ])).values(),
);

export const TREMPLIN_PRIMARY_FAMILY_MINIMUM = 20;

export function findTremplinRoleProfile(artist: TremplinArtist): TremplinRoleProfile | undefined {
  const explicitRole = artist.roleId
    ? TREMPLIN_ROLE_PROFILES.find(({ id }) => id === artist.roleId)
    : undefined;
  if (explicitRole) return explicitRole;

  for (const discipline of artist.disciplines) {
    const identity = normalizeRoleText(discipline);
    const disciplineRole = TREMPLIN_ROLE_PROFILES.find(({ keywords }) => (
      keywords.some((keyword) => identity.includes(normalizeRoleText(keyword)))
    ));
    if (disciplineRole) return disciplineRole;
  }

  return undefined;
}

export function getTremplinRoleProfile(artist: TremplinArtist): TremplinRoleProfile {
  return findTremplinRoleProfile(artist)
    ?? TREMPLIN_ROLE_PROFILES.find(({ id }) => id === "compositeur")
    ?? TREMPLIN_ROLE_PROFILES[0];
}

/**
 * Directory roles group related skills for discovery. Cards keep the precise
 * profession supplied by the profile: "Saxophoniste", for example, is never
 * flattened to "Instrumentiste à vent".
 */
export function getTremplinProfessionLabel(artist: TremplinArtist): string {
  return artist.exactProfession?.trim()
    || artist.disciplines[0]?.trim()
    || getTremplinRoleProfile(artist).label;
}

export function artistMatchesTremplinRole(artist: TremplinArtist, roleId: TremplinRoleId) {
  if (artist.roleId) return artist.roleId === roleId;
  return findTremplinRoleProfile(artist)?.id === roleId;
}
