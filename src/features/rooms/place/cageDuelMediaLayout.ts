import type { PlaceStageAspectRatio } from "./placeStageLayoutEngine";

export type CageDuelMediaLayout = "standard-duel" | "portrait-duel";

/**
 * Selects the dedicated Cage composition only when both current competitors
 * expose a portrait feed. Callers may supply the server-declared ratios first
 * and replace them with dimensions reported by the decoded media afterwards.
 */
export function resolveCageDuelMediaLayout(
  ratios: readonly (PlaceStageAspectRatio | null)[],
): CageDuelMediaLayout {
  return ratios.length === 2 && ratios.every((ratio) => ratio === "9:16")
    ? "portrait-duel"
    : "standard-duel";
}
