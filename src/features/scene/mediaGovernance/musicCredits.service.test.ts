import { describe, expect, it } from "vitest";

import { orderMusicCredits, validateMusicCredits } from "./musicCredits.service";
import type { MusicCredit } from "./musicCredits.types";

function credit(overrides: Partial<MusicCredit> = {}): MusicCredit {
  return {
    id: "credit-primary",
    assetId: "asset-1",
    displayName: "Naya Oris",
    role: "primaryArtist",
    order: 0,
    profileId: "naya-oris",
    ...overrides,
  };
}

describe("music credits validation", () => {
  it("accepts ordered attribution with a primary artist", () => {
    const credits = [
      credit({ id: "composer", displayName: "Malo B.", role: "composer", order: 2 }),
      credit(),
      credit({ id: "producer", displayName: "Ana S.", role: "producer", order: 1 }),
    ];

    const result = validateMusicCredits("asset-1", credits);

    expect(result.valid).toBe(true);
    expect(result.orderedCredits.map(({ id }) => id)).toEqual([
      "credit-primary",
      "producer",
      "composer",
    ]);
    expect(credits.map(({ id }) => id)).toEqual(["composer", "credit-primary", "producer"]);
  });

  it("rejects missing primary attribution, duplicates and another asset's credit", () => {
    const result = validateMusicCredits("asset-1", [
      credit({ id: "same", role: "composer", displayName: "  Malo B. ", order: 1 }),
      credit({ id: "same", role: "composer", displayName: "malo   b.", order: 2 }),
      credit({ id: "foreign", assetId: "asset-2", role: "producer", order: 3 }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "duplicate-credit-id",
      "duplicate-credit",
      "asset-mismatch",
      "missing-primary-artist",
    ]));
  });

  it("orders credits without treating credits as rights evidence", () => {
    const onlyCredit = credit();

    expect(orderMusicCredits([onlyCredit])).toEqual([onlyCredit]);
    expect("evidenceReference" in onlyCredit).toBe(false);
    expect("consentedUses" in onlyCredit).toBe(false);
  });
});
