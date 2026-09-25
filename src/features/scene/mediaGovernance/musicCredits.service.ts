import type {
  MusicCredit,
  MusicCreditsDecision,
  MusicCreditsIssue,
} from "./musicCredits.types";

function normaliseText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export function orderMusicCredits(credits: readonly MusicCredit[]) {
  return [...credits].sort((left, right) => (
    left.order - right.order
    || left.displayName.localeCompare(right.displayName, "fr")
    || left.id.localeCompare(right.id)
  ));
}

export function validateMusicCredits(
  assetId: string,
  credits: readonly MusicCredit[],
): MusicCreditsDecision {
  const issues: MusicCreditsIssue[] = [];
  const creditIds = new Set<string>();
  const attributionKeys = new Set<string>();

  if (credits.length === 0) issues.push({ code: "missing-credits" });

  for (const credit of credits) {
    const id = credit.id.trim();
    if (!id) {
      issues.push({ code: "invalid-credit-id" });
    } else if (creditIds.has(id)) {
      issues.push({ code: "duplicate-credit-id", creditId: credit.id });
    } else {
      creditIds.add(id);
    }

    if (credit.assetId !== assetId) {
      issues.push({ code: "asset-mismatch", creditId: credit.id || undefined });
    }
    if (!credit.displayName.trim()) {
      issues.push({ code: "invalid-display-name", creditId: credit.id || undefined });
    }
    if (!Number.isSafeInteger(credit.order) || credit.order < 0) {
      issues.push({ code: "invalid-order", creditId: credit.id || undefined });
    }

    const attributionKey = [
      credit.assetId,
      credit.role,
      normaliseText(credit.displayName),
    ].join("::");
    if (attributionKeys.has(attributionKey)) {
      issues.push({ code: "duplicate-credit", creditId: credit.id || undefined });
    } else {
      attributionKeys.add(attributionKey);
    }
  }

  if (!credits.some((credit) => (
    credit.assetId === assetId
    && credit.role === "primaryArtist"
    && Boolean(credit.displayName.trim())
  ))) {
    issues.push({ code: "missing-primary-artist" });
  }

  return {
    valid: issues.length === 0,
    assetId,
    orderedCredits: orderMusicCredits(credits),
    issues,
  };
}
