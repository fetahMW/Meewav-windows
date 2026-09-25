import { describe, expect, it, vi } from "vitest";
import { getTremplinArtistToken } from "./tremplinTokenData";
import {
  tremplinApiQuoteRepository,
  tremplinDemoQuoteRepository,
} from "./tremplinQuoteService";

describe("Tremplin quote repositories", () => {
  it("identifie et expire une estimation de démonstration", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00.000Z"));
    const token = getTremplinArtistToken("lunae");
    expect(token).toBeDefined();

    const quote = tremplinDemoQuoteRepository.createQuote({
      operation: "purchase",
      token: token!,
      amountEur: 25,
      kycStatus: "verified",
    });

    expect(quote.source).toBe("demo");
    expect(quote.quoteId).toContain("demo-lunae-purchase-25");
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.createdAt)).toBe(120_000);
    expect(tremplinDemoQuoteRepository.isExpired(quote, new Date("2026-08-04T12:01:59.999Z"))).toBe(false);
    expect(tremplinDemoQuoteRepository.isExpired(quote, new Date("2026-08-04T12:02:00.000Z"))).toBe(true);
    vi.useRealTimers();
  });

  it("refuse toute fausse opération API tant que le backend n’est pas connecté", () => {
    const token = getTremplinArtistToken("lunae");
    expect(token).toBeDefined();

    expect(() => tremplinApiQuoteRepository.createQuote({
      operation: "purchase",
      token: token!,
      amountEur: 25,
      kycStatus: "verified",
    })).toThrow(/Backend Tremplin non connecté/);
  });
});
