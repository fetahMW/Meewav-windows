export const BASE_RPM = 100 / 3;
export const SPEEDS = Object.freeze([BASE_RPM, 45]);
export const REVOLUTION_MS = 60_000 / BASE_RPM;

/** Un taux de lecture qui conserve une révolution de 33⅓ ou 45 tours/minute. */
export function playbackRate(rpm = BASE_RPM) {
  if (!Number.isFinite(rpm) || rpm <= 0) return 1;
  return Math.min(90, rpm) / BASE_RPM;
}

/** Inclinaison volontairement très légère ; les coordonnées restent bornées. */
export function pointerTilt(clientX, clientY, rect, maximum = 2.4) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  const horizontal = clamp(((clientX - rect.left) / rect.width - 0.5) * 2);
  const vertical = clamp(((clientY - rect.top) / rect.height - 0.5) * 2);
  return { x: -vertical * maximum, y: horizontal * maximum };
}

// Des micro-sillons déterministes : pas d'aléatoire au rendu React.
export const GROOVES = Object.freeze(
  Array.from({ length: 220 }, (_, i) => ({
    radius: 190 + i * 1.375,
    opacity: 0.035 + ((i * 37) % 17) / 240,
    width: i % 9 === 0 ? 0.8 : 0.45,
  })),
);
