// Shared visibility/size contract for every MapLibre-rendered avatar.
// The authenticated host deliberately multiplies the standard sprite size,
// but keeps exactly the same zoom threshold as the Paris avatar population.
export const MVT_STANDARD_AVATAR_ICON_SIZE = 0.112;
export const HOST_AVATAR_SIZE_MULTIPLIER = 2.5;
export const AVATAR_VISIBLE_MIN_ZOOM = 15;

// Shared ground marker used by the historical Paris profile pins and by the
// freshly-created current-user avatar. Keeping the radius expressions here
// prevents onboarding from drifting into a separate, screen-facing marker.
export const AVATAR_GROUND_REPERE_OUTER_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  14.5,
  16,
  16,
  24,
  17.5,
  32,
  19,
  41,
] as any;

export const AVATAR_GROUND_REPERE_INNER_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  14.5,
  9,
  16,
  14,
  17.5,
  19,
  19,
  25,
] as any;

export const AVATAR_GROUND_REPERE_PITCH_ALIGNMENT = "map" as const;
export const AVATAR_GROUND_REPERE_PITCH_SCALE = "map" as const;
