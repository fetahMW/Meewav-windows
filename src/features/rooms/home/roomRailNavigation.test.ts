import { describe, expect, it } from "vitest";
import { roomRailPageTarget } from "./roomRailNavigation";

describe("roomRailPageTarget", () => {
  const mixedCards = [0, 700, 940, 1640, 1880, 2580];

  it("advances through mixed widths without skipping the partly visible card", () => {
    expect(roomRailPageTarget(mixedCards, 0, 1000, 2900, 1)).toBe(940);
    expect(roomRailPageTarget(mixedCards, 940, 1000, 2900, 1)).toBe(1880);
  });

  it("returns to the nearest card edge on the previous page", () => {
    expect(roomRailPageTarget(mixedCards, 1880, 1000, 2900, -1)).toBe(940);
    expect(roomRailPageTarget(mixedCards, 940, 1000, 2900, -1)).toBe(0);
  });

  it("handles a card wider than the viewport and clamps to either end", () => {
    expect(roomRailPageTarget([0, 1300], 0, 1000, 1600, 1)).toBe(1300);
    expect(roomRailPageTarget([0, 1300], 1300, 1000, 1600, 1)).toBe(1600);
    expect(roomRailPageTarget(mixedCards, 2580, 1000, 2600, 1)).toBe(2600);
    expect(roomRailPageTarget(mixedCards, 0, 1000, 2600, -1)).toBe(0);
  });
});
