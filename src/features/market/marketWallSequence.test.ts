import { describe, expect, it } from "vitest";
import { buildMarketWallSequence } from "./marketWallSequence";

describe("buildMarketWallSequence", () => {
  it("espace les visuels identiques tout en conservant chaque annonce une seule fois", () => {
    const products = Array.from({ length: 90 }, (_, index) => ({
      id: `listing-${index + 1}`,
      imageUrl: `visual-${index % 50}`,
    }));

    const sequence = buildMarketWallSequence(products);

    expect(sequence).toHaveLength(products.length);
    expect(new Set(sequence.map((product) => product.id))).toEqual(new Set(products.map((product) => product.id)));
    expect(new Set(sequence.slice(0, 50).map((product) => product.imageUrl)).size).toBe(50);
    expect(sequence[50].imageUrl).toBe(sequence[0].imageUrl);
  });

  it("ne masque aucune annonce lorsque plusieurs offres utilisent le même fallback", () => {
    const products = [
      { id: "a", imageUrl: "fallback" },
      { id: "b", imageUrl: "fallback" },
      { id: "c", imageUrl: "unique" },
      { id: "d", imageUrl: "fallback" },
    ];

    const sequence = buildMarketWallSequence(products);

    expect(sequence.map((product) => product.id)).toEqual(["a", "c", "b", "d"]);
    expect(new Set(sequence.map((product) => product.id)).size).toBe(products.length);
  });
});
