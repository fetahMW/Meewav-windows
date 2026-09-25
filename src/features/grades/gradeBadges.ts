export type GradeLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type GradeBadgeMeta = {
  level: GradeLevel;
  label: string;
  shortLabel: string;
  badgeNumber: string;
  title: string;
  description: string;
  colorName: string;
  cssClass: string;
  mainColor: string;
  softColor: string;
  darkColor: string;
};

export const GRADE_BADGES: Record<GradeLevel, GradeBadgeMeta> = {
  1: {
    level: 1,
    label: "Débutant",
    shortLabel: "N1",
    badgeNumber: "1",
    title: "Niveau 1",
    description: "Premiers pas dans le réseau.",
    colorName: "white",
    cssClass: "grade-white",
    mainColor: "#FFFFFF",
    softColor: "#F8FAFC",
    darkColor: "#2A243A",
  },
  2: {
    level: 2,
    label: "Émergent",
    shortLabel: "N2",
    badgeNumber: "2",
    title: "Niveau 2",
    description: "Présence musicale en progression.",
    colorName: "orange",
    cssClass: "grade-orange",
    mainColor: "#F59E0B",
    softColor: "#FDE68A",
    darkColor: "#78350F",
  },
  3: {
    level: 3,
    label: "Confirmé",
    shortLabel: "N3",
    badgeNumber: "3",
    title: "Niveau 3",
    description: "Activité et réseau solides.",
    colorName: "green",
    cssClass: "grade-green",
    mainColor: "#34D399",
    softColor: "#86EFAC",
    darkColor: "#064E3B",
  },
  4: {
    level: 4,
    label: "Élite",
    shortLabel: "N4",
    badgeNumber: "4",
    title: "Niveau 4",
    description: "Profil remarqué dans la communauté.",
    colorName: "pink",
    cssClass: "grade-pink",
    mainColor: "#EC4899",
    softColor: "#F9A8D4",
    darkColor: "#831843",
  },
  5: {
    level: 5,
    label: "Maître",
    shortLabel: "N5",
    badgeNumber: "5",
    title: "Niveau 5",
    description: "Statut prestigieux reconnu.",
    colorName: "blue",
    cssClass: "grade-blue",
    mainColor: "#2563FF",
    softColor: "#93C5FD",
    darkColor: "#102A6B",
  },
  6: {
    level: 6,
    label: "Légendaire",
    shortLabel: "LEG",
    badgeNumber: "6",
    title: "Légendaire",
    description: "Icône du réseau Meewav.",
    colorName: "legendary",
    cssClass: "grade-legendary",
    mainColor: "#6A00FF",
    softColor: "#F0D5FF",
    darkColor: "#1B003C",
  },
};

export function normalizeGradeLevel(value: unknown): GradeLevel {
  const numberValue = Number(value);

  if (numberValue === 1) return 1;
  if (numberValue === 2) return 2;
  if (numberValue === 3) return 3;
  if (numberValue === 4) return 4;
  if (numberValue === 5) return 5;
  if (numberValue === 6) return 6;

  return 1;
}

/**
 * Normalizes a grade coming from a public projection without turning a hidden
 * or invalid value into the Débutant badge. Public profile views must use this
 * helper whenever the grade can legitimately be null.
 */
export function normalizeOptionalGradeLevel(value: unknown): GradeLevel | null {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);
  if (numberValue === 1) return 1;
  if (numberValue === 2) return 2;
  if (numberValue === 3) return 3;
  if (numberValue === 4) return 4;
  if (numberValue === 5) return 5;
  if (numberValue === 6) return 6;

  return null;
}

export function getGradeBadgeMeta(value: unknown): GradeBadgeMeta {
  return GRADE_BADGES[normalizeGradeLevel(value)];
}
