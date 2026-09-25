import { describe, expect, it } from "vitest";
import {
  getMarketListingRelativeDate,
  getMarketListingRelativeDateTime,
} from "./market.dates";
import { createMarketLocalMediaId } from "./market.media";

describe("MarketListingComposer media identity", () => {
  it("creates a new stable local key for every import, including the same file twice", () => {
    const firstImport = createMarketLocalMediaId();
    const secondImport = createMarketLocalMediaId();

    expect(firstImport).toMatch(/^market-media-/);
    expect(secondImport).toMatch(/^market-media-/);
    expect(secondImport).not.toBe(firstImport);
  });
});

describe("MarketListingComposer relative dates", () => {
  it("derives future defaults from the local calendar instead of fixed dates", () => {
    const now = new Date(2026, 11, 30, 9, 15);

    expect(getMarketListingRelativeDate(3, now)).toBe("2027-01-02");
    expect(getMarketListingRelativeDateTime(7, 20, 30, now)).toBe("2027-01-06T20:30");
  });
});
