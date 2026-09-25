import {
  simulateBondingCurvePurchase,
  simulateBondingCurveResale,
  type TremplinArtistToken,
  type TremplinKycStatus,
  type TremplinPurchaseSimulation,
  type TremplinResaleSimulation,
} from "./tremplinTokenData";

export type TremplinQuote = (TremplinPurchaseSimulation | TremplinResaleSimulation) & {
  quoteId: string;
  createdAt: string;
  expiresAt: string;
  source: "demo" | "api";
};

export type TremplinQuoteRequest =
  | { operation: "purchase"; token: TremplinArtistToken; amountEur: number; kycStatus: TremplinKycStatus }
  | { operation: "resale"; token: TremplinArtistToken; quantity: number; kycStatus: TremplinKycStatus; rapidExit: boolean };

export interface TremplinQuoteRepository {
  createQuote(request: TremplinQuoteRequest): TremplinQuote;
  isExpired(quote: TremplinQuote, now?: Date): boolean;
}

const DEMO_QUOTE_TTL_MS = 2 * 60 * 1000;

function stableQuoteId(request: TremplinQuoteRequest, createdAt: string) {
  const amount = request.operation === "purchase" ? request.amountEur : request.quantity;
  return `demo-${request.token.artistId}-${request.operation}-${amount}-${createdAt}`;
}

export const tremplinDemoQuoteRepository: TremplinQuoteRepository = {
  createQuote(request) {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(createdAt) + DEMO_QUOTE_TTL_MS).toISOString();
    const simulation = request.operation === "purchase"
      ? simulateBondingCurvePurchase({ token: request.token, amountEur: request.amountEur, kycStatus: request.kycStatus })
      : simulateBondingCurveResale({ token: request.token, quantity: request.quantity, kycStatus: request.kycStatus, rapidExit: request.rapidExit });
    return {
      ...simulation,
      quoteId: stableQuoteId(request, createdAt),
      createdAt,
      expiresAt,
      source: "demo",
    };
  },
  isExpired(quote, now = new Date()) {
    return now.getTime() >= Date.parse(quote.expiresAt);
  },
};

/**
 * Production adapter placeholder. It deliberately fails until the documented
 * quote/order API exists, preventing a local simulation from becoming a real
 * transaction by accident.
 */
export const tremplinApiQuoteRepository: TremplinQuoteRepository = {
  createQuote() {
    throw new Error("Backend Tremplin non connecté : impossible de créer une estimation réelle.");
  },
  isExpired(quote, now = new Date()) {
    return now.getTime() >= Date.parse(quote.expiresAt);
  },
};
