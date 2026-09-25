import { describe, expect, it } from "vitest";

import { normalizeOptionalGradeLevel } from "./gradeBadges";

describe("normalizeOptionalGradeLevel", () => {
  it("préserve un grade public masqué au lieu de fabriquer le niveau 1", () => {
    expect(normalizeOptionalGradeLevel(null)).toBeNull();
    expect(normalizeOptionalGradeLevel(undefined)).toBeNull();
    expect(normalizeOptionalGradeLevel("")).toBeNull();
  });

  it("accepte uniquement les six niveaux canoniques", () => {
    expect(normalizeOptionalGradeLevel(2)).toBe(2);
    expect(normalizeOptionalGradeLevel("6")).toBe(6);
    expect(normalizeOptionalGradeLevel(0)).toBeNull();
    expect(normalizeOptionalGradeLevel(7)).toBeNull();
    expect(normalizeOptionalGradeLevel("inconnu")).toBeNull();
  });
});
