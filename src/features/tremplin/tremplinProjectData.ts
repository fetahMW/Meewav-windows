import type { TremplinArtist, TremplinProjectSnapshot } from "./tremplinArtistData";
import { getTremplinRoleProfile, type TremplinRoleFamilyId } from "./tremplinRoleData";

const NEXT_MILESTONES: Record<TremplinRoleFamilyId, readonly string[]> = {
  voix: [
    "Finaliser la session live filmée",
    "Boucler trois répétitions avec l'équipe scénique",
    "Présenter le nouveau format devant 120 personnes",
  ],
  "danse-performance": [
    "Verrouiller la chorégraphie complète",
    "Filmer une répétition en conditions scéniques",
    "Tester la création devant un premier public",
  ],
  instruments: [
    "Enregistrer les prises définitives",
    "Finaliser les arrangements du répertoire",
    "Préparer une captation live en conditions réelles",
  ],
  "creation-production": [
    "Valider la direction des trois prochains titres",
    "Terminer le prototype sonore et visuel",
    "Livrer une première version prête à tester en public",
  ],
  "son-image": [
    "Finaliser les livrables de la session pilote",
    "Documenter le dispositif technique complet",
    "Produire une démonstration avant/après exploitable",
  ],
  accompagnement: [
    "Sécuriser les partenaires du prochain cycle",
    "Finaliser le calendrier de production et de diffusion",
    "Constituer l'équipe opérationnelle du projet",
  ],
};

const SUPPORT_NEEDS: Record<TremplinRoleFamilyId, readonly string[]> = {
  voix: [
    "Une équipe image pour la session live",
    "Un accompagnement scénique sur quatre semaines",
    "Un lieu équipé pour la répétition générale",
  ],
  "danse-performance": [
    "Un studio de répétition équipé pendant deux jours",
    "Une création lumière adaptée au mouvement",
    "Une captation plein pied du nouveau format",
  ],
  instruments: [
    "Un studio pour deux journées de prises",
    "Un réalisateur musical pour finaliser les arrangements",
    "Une captation multicaméra du nouveau set",
  ],
  "creation-production": [
    "Trois artistes pilotes pour éprouver le format",
    "Un budget de postproduction et de diffusion",
    "Un partenaire éditorial pour documenter le processus",
  ],
  "son-image": [
    "Un projet pilote à produire en conditions réelles",
    "Un renfort lumière et machinerie pour la captation",
    "Un studio partenaire pour la phase de finition",
  ],
  accompagnement: [
    "Des projets qualifiés à accompagner sur six mois",
    "Un partenaire de diffusion pour la première série",
    "Un réseau de lieux pour éprouver le dispositif",
  ],
};

const stableHash = (value: string) => [...value].reduce(
  (hash, character, index) => (hash * 29 + character.charCodeAt(0) * (index + 5)) % 10_007,
  31,
);

export function getTremplinProjectSnapshot(artist: TremplinArtist): TremplinProjectSnapshot {
  if (artist.project) return artist.project;

  const role = getTremplinRoleProfile(artist);
  const hash = stableHash(artist.id);
  const progressPercent = Math.min(
    91,
    39 + artist.gradeLevel * 7 + (artist.editorialSelection ? 5 : 0) + hash % 12,
  );
  const primaryMetric = artist.metrics[0]?.indicator ?? `${artist.community.memberCount} personnes engagées`;
  const secondaryMetric = artist.metrics[1]?.indicator ?? `${artist.updates.length} étapes documentées`;

  return {
    headline: artist.stageLabel,
    progressPercent,
    nextMilestone: NEXT_MILESTONES[role.familyId][hash % NEXT_MILESTONES[role.familyId].length],
    supportNeed: SUPPORT_NEEDS[role.familyId][(hash + 1) % SUPPORT_NEEDS[role.familyId].length],
    proofPoints: [
      primaryMetric,
      secondaryMetric,
      `+${artist.community.newMembers30Days} nouveaux abonnés en 30 jours`,
    ],
  };
}
