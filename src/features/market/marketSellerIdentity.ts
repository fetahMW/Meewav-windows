import type { GradeLevel } from "../grades/gradeBadges";

export type MarketSellerIdentity = {
  portraitUrl: string;
  gradeLevel: GradeLevel;
};

const MARKET_SELLER_IDENTITIES: Record<string, MarketSellerIdentity> = {
  "synth-district": { portraitUrl: "/images/preprofile/portraits/profile-19.webp", gradeLevel: 6 },
  "studio-supply": { portraitUrl: "/images/preprofile/portraits/profile-32.webp", gradeLevel: 5 },
  "broadcast-lab": { portraitUrl: "/images/preprofile/portraits/profile-27.webp", gradeLevel: 5 },
  "elise-tones": { portraitUrl: "/images/preprofile/portraits/profile-08.webp", gradeLevel: 4 },
  "vinyl-circuit": { portraitUrl: "/images/preprofile/portraits/profile-23.webp", gradeLevel: 4 },
  "session-club": { portraitUrl: "/images/preprofile/portraits/profile-04.webp", gradeLevel: 5 },
  "modular-corner": { portraitUrl: "/images/preprofile/portraits/profile-35.webp", gradeLevel: 6 },
  "guitar-house": { portraitUrl: "/images/preprofile/portraits/profile-13.webp", gradeLevel: 4 },
  "waveform-studio": { portraitUrl: "/images/preprofile/portraits/profile-30.webp", gradeLevel: 5 },
  "noemie-sound": { portraitUrl: "/images/preprofile/portraits/profile-11.webp", gradeLevel: 3 },
  "rhythm-workshop": { portraitUrl: "/images/preprofile/portraits/profile-16.webp", gradeLevel: 4 },
  "atlas-audio": { portraitUrl: "/images/preprofile/portraits/profile-25.webp", gradeLevel: 5 },
  "room-collective": { portraitUrl: "/images/preprofile/portraits/profile-37.webp", gradeLevel: 6 },
  "camille-mix": { portraitUrl: "/images/preprofile/portraits/profile-06.webp", gradeLevel: 4 },
};

function hashSellerId(sellerId: string) {
  let hash = 2166136261;

  for (const character of sellerId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getMarketSellerIdentity(sellerId: string): MarketSellerIdentity {
  const knownIdentity = MARKET_SELLER_IDENTITIES[sellerId];
  if (knownIdentity) return knownIdentity;

  const hash = hashSellerId(sellerId);
  const portraitIndex = (hash % 38) + 1;
  const gradeLevel = ((hash % 6) + 1) as GradeLevel;

  return {
    portraitUrl: `/images/preprofile/portraits/profile-${String(portraitIndex).padStart(2, "0")}.webp`,
    gradeLevel,
  };
}
