/**
 * Mock data and deterministic quote helpers for the Tremplin artist-token UI.
 *
 * These helpers are intentionally presentation-side simulations. A production
 * transaction must always be recalculated and authorised by the server (KYC,
 * ownership limit, fees, curve version, idempotency and available balance).
 */
import { tremplinArtists } from "./tremplinArtistData.ts";

export const TREMPLIN_TOKEN_PERIODS = ["24h", "7d", "30d", "3m", "1y", "all"] as const;

export type TremplinTokenPeriod = (typeof TREMPLIN_TOKEN_PERIODS)[number];
export type TremplinTokenTrendDirection = "up" | "down" | "stable";
export type TremplinTokenOperation = "purchase" | "resale";
export type TremplinKycStatus = "verified" | "pending" | "missing";
export type TremplinTransactionStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "refunded"
  | "blocked-for-verification";

export type TremplinTokenHistoryEvent = {
  type: TremplinTokenOperation;
  amountEur: number;
  label: string;
};

export type TremplinTokenHistoryPoint = {
  timestamp: string;
  label: string;
  valueEur: number;
  event?: TremplinTokenHistoryEvent;
};

export type TremplinTokenValueHistory = Record<
  TremplinTokenPeriod,
  readonly TremplinTokenHistoryPoint[]
>;

export type TremplinTokenTrend = {
  direction: TremplinTokenTrendDirection;
  changePercent: number;
  text: string;
};

export type TremplinTokenActivity = {
  purchases7d: number;
  resales7d: number;
  purchaseVolume7dEur: number;
  resaleVolume7dEur: number;
  lastActivityLabel: string;
};

export type TremplinNextRoom = {
  id: string;
  title: string;
  startsAt: string;
  dateLabel: string;
  format: "live" | "ecoute" | "studio" | "questions-reponses";
  accessLabel: string;
  interestedCount: number;
};

export type TremplinUserTokenPosition = {
  quantity: number;
  initialAmountEur: number;
  estimatedValueEur: number;
  ownershipSharePercent: number;
  averagePurchasePriceEur: number;
  acquiredAt?: string;
};

export type TremplinLinearCurveParameters = {
  model: "linear";
  version: string;
  floorPriceEur: number;
  slopeEurPerToken: number;
};

export type TremplinArtistToken = {
  artistId: string;
  artistName: string;
  tokenName: string;
  symbol: string;
  admittedAt: string;
  currency: "EUR";
  currentValueEur: number;
  holderCount: number;
  circulatingSupply: number;
  trend7d: TremplinTokenTrend;
  valueHistory: TremplinTokenValueHistory;
  activity: TremplinTokenActivity;
  userPosition: TremplinUserTokenPosition;
  nextRoom: TremplinNextRoom;
  curve: TremplinLinearCurveParameters;
};

export type TremplinPlatformConfig = {
  version: string;
  currency: "EUR";
  feesBps: {
    purchase: number;
    resale: number;
    rapidExit: number;
    technical: number;
  };
  distributionsBps: {
    artistOnPurchase: number;
    reserveOnPurchase: number;
  };
  rapidExitWindowHours: number;
  maximumOwnershipBps: number;
  kycRequired: boolean;
  serverAuthoritative: true;
};

export const TREMPLIN_PLATFORM_CONFIG: TremplinPlatformConfig = {
  version: "mock-2026.07",
  currency: "EUR",
  feesBps: {
    purchase: 250,
    resale: 250,
    rapidExit: 800,
    technical: 40,
  },
  distributionsBps: {
    artistOnPurchase: 2000,
    reserveOnPurchase: 100,
  },
  rapidExitWindowHours: 72,
  maximumOwnershipBps: 500,
  kycRequired: true,
  serverAuthoritative: true,
};

export type TremplinFeeLine = {
  id: "meeway" | "technical" | "rapid-exit";
  label: string;
  rateBps: number;
  amountEur: number;
};

export type TremplinDistributionLine = {
  id: "artist" | "reserve" | "curve";
  label: string;
  rateBps: number | null;
  amountEur: number;
};

export type TremplinSimulationBase = {
  quoteOnly: true;
  requiresServerConfirmation: true;
  operation: TremplinTokenOperation;
  artistId: string;
  symbol: string;
  currency: "EUR";
  curveVersion: string;
  platformConfigVersion: string;
  eligible: boolean;
  blockedReasons: readonly string[];
  warnings: readonly string[];
  priceBeforeEur: number;
  priceAfterEur: number;
  averageExecutionPriceEur: number;
  priceImpactPercent: number;
  supplyBefore: number;
  supplyAfter: number;
  userQuantityBefore: number;
  userQuantityAfter: number;
  ownershipShareBeforePercent: number;
  ownershipShareAfterPercent: number;
  maximumOwnershipPercent: number;
  feeLines: readonly TremplinFeeLine[];
  totalFeesEur: number;
};

export type TremplinPurchaseSimulation = TremplinSimulationBase & {
  operation: "purchase";
  amountPaidEur: number;
  estimatedTokenQuantity: number;
  amountAppliedToCurveEur: number;
  distributionLines: readonly TremplinDistributionLine[];
  artistAmountEur: number;
  reserveAmountEur: number;
  maximumAdditionalQuantity: number;
};

export type TremplinResaleSimulation = TremplinSimulationBase & {
  operation: "resale";
  quantityResold: number;
  estimatedValueBeforeFeesEur: number;
  netAmountEur: number;
  rapidExitApplied: boolean;
};

export type TremplinPurchaseSimulationInput = {
  token: TremplinArtistToken;
  amountEur: number;
  currentUserQuantity?: number;
  kycStatus?: TremplinKycStatus;
  config?: TremplinPlatformConfig;
};

export type TremplinResaleSimulationInput = {
  token: TremplinArtistToken;
  quantity: number;
  currentUserQuantity?: number;
  kycStatus?: TremplinKycStatus;
  rapidExit?: boolean;
  config?: TremplinPlatformConfig;
};

export type TremplinTokenTransaction = {
  id: string;
  transactionReference: string;
  occurredAt: string;
  dateLabel: string;
  artistId: string;
  artistName: string;
  symbol: string;
  operation: TremplinTokenOperation;
  amountEur: number;
  tokenQuantity: number;
  averagePriceEur: number;
  feesEur: number;
  netAmountEur: number;
  status: TremplinTransactionStatus;
  statusLabel: string;
  receiptReference: string | null;
};

type TokenSeed = {
  artistId: string;
  artistName: string;
  tokenName: string;
  symbol: string;
  currentValueEur: number;
  holderCount: number;
  circulatingSupply: number;
  userQuantity: number;
  userInitialAmountEur: number;
  userAcquiredAt?: string;
  change7dPercent: number;
  historySeed: number;
  activity: TremplinTokenActivity;
  nextRoom: TremplinNextRoom;
};

const BASIS_POINTS = 10_000;
const HISTORY_NOW = Date.UTC(2026, 6, 26, 18, 0, 0);

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const fromBps = (amount: number, basisPoints: number): number =>
  round((amount * basisPoints) / BASIS_POINTS, 2);

const percent = (quantity: number, supply: number): number =>
  supply > 0 ? round((quantity / supply) * 100, 4) : 0;

const isFiniteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const isValidBasisPoints = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= BASIS_POINTS;

const safeBasisPoints = (value: number): number =>
  isValidBasisPoints(value) ? value : 0;

const hasValidCurve = (curve: TremplinLinearCurveParameters): boolean =>
  isFiniteNonNegative(curve.floorPriceEur) &&
  curve.floorPriceEur > 0 &&
  isFiniteNonNegative(curve.slopeEurPerToken);

const safeCurve = (
  curve: TremplinLinearCurveParameters,
): TremplinLinearCurveParameters => hasValidCurve(curve)
  ? curve
  : { ...curve, floorPriceEur: 0.01, slopeEurPerToken: 0 };

const periodMeta: Record<
  TremplinTokenPeriod,
  { points: number; stepHours: number; driftFactor: number }
> = {
  "24h": { points: 13, stepHours: 2, driftFactor: 0.18 },
  "7d": { points: 15, stepHours: 12, driftFactor: 1 },
  "30d": { points: 16, stepHours: 48, driftFactor: 1.65 },
  "3m": { points: 16, stepHours: 144, driftFactor: 2.15 },
  "1y": { points: 19, stepHours: 480, driftFactor: 3.1 },
  all: { points: 20, stepHours: 720, driftFactor: 3.7 },
};

const formatHistoryLabel = (timestamp: number, period: TremplinTokenPeriod): string => {
  const date = new Date(timestamp);
  if (period === "24h") {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  if (period === "7d") {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
    }).format(date);
  }
  if (period === "1y" || period === "all") {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date);
};

const createHistoryPoints = (
  seed: TokenSeed,
  period: TremplinTokenPeriod,
): readonly TremplinTokenHistoryPoint[] => {
  const meta = periodMeta[period];
  const periodChange = seed.change7dPercent * meta.driftFactor;
  const volatility = Math.min(0.035, 0.011 + (seed.historySeed % 5) * 0.003);

  return Array.from({ length: meta.points }, (_, index) => {
    const progress = index / (meta.points - 1);
    const timestamp = HISTORY_NOW - (meta.points - 1 - index) * meta.stepHours * 3_600_000;
    const startFactor = 1 / Math.max(0.35, 1 + periodChange / 100);
    const baseFactor = startFactor + (1 - startFactor) * progress;
    const wave =
      Math.sin((index + seed.historySeed) * 1.17) * volatility * Math.sin(Math.PI * progress);
    const valueEur = index === meta.points - 1
      ? seed.currentValueEur
      : round(Math.max(0.01, seed.currentValueEur * (baseFactor + wave)), 4);
    const event = index === Math.floor(meta.points * 0.58) && period !== "24h"
      ? {
          type: seed.historySeed % 3 === 0 ? "resale" as const : "purchase" as const,
          amountEur: 25 + (seed.historySeed % 6) * 25,
          label: seed.historySeed % 3 === 0 ? "Revente notable" : "Achat notable",
        }
      : undefined;

    return {
      timestamp: new Date(timestamp).toISOString(),
      label: formatHistoryLabel(timestamp, period),
      valueEur,
      ...(event ? { event } : {}),
    };
  });
};

const createValueHistory = (seed: TokenSeed): TremplinTokenValueHistory => ({
  "24h": createHistoryPoints(seed, "24h"),
  "7d": createHistoryPoints(seed, "7d"),
  "30d": createHistoryPoints(seed, "30d"),
  "3m": createHistoryPoints(seed, "3m"),
  "1y": createHistoryPoints(seed, "1y"),
  all: createHistoryPoints(seed, "all"),
});

const createTrend = (changePercent: number): TremplinTokenTrend => {
  const direction: TremplinTokenTrendDirection =
    changePercent > 0.35 ? "up" : changePercent < -0.35 ? "down" : "stable";
  const text = direction === "up"
    ? "Valeur en hausse sur 7 jours"
    : direction === "down"
      ? "Valeur en baisse sur 7 jours"
      : "Stable sur 7 jours";
  return { direction, changePercent: round(changePercent, 2), text };
};

const createCurve = (seed: TokenSeed): TremplinLinearCurveParameters => {
  const slopeEurPerToken = round(
    Math.max(0.00000075, seed.currentValueEur / (seed.circulatingSupply * 4.8)),
    10,
  );
  const floorPriceEur = round(
    Math.max(0.005, seed.currentValueEur - slopeEurPerToken * seed.circulatingSupply),
    6,
  );
  return {
    model: "linear",
    version: "linear-2026.07-v1",
    floorPriceEur,
    slopeEurPerToken,
  };
};

const coreTokenSeeds: readonly TokenSeed[] = [
  {
    artistId: "lunae", artistName: "Lunaé", tokenName: "Jeton Lunaé", symbol: "LUNAE",
    currentValueEur: 0.84, holderCount: 1248, circulatingSupply: 184_000,
    userQuantity: 52.4, userInitialAmountEur: 38, userAcquiredAt: "2026-06-21T14:12:00.000Z",
    change7dPercent: 4.8, historySeed: 3,
    activity: { purchases7d: 183, resales7d: 47, purchaseVolume7dEur: 11_420, resaleVolume7dEur: 3_180, lastActivityLabel: "Achat confirmé il y a 8 min" },
    nextRoom: { id: "room-lunae-ep", title: "Écoute privée · EP Minuit clair", startsAt: "2026-07-28T19:30:00+02:00", dateLabel: "28 juil. · 19 h 30", format: "ecoute", accessLabel: "Room publique", interestedCount: 386 },
  },
  {
    artistId: "sama-k", artistName: "Sama K", tokenName: "Jeton Sama K", symbol: "SAMAK",
    currentValueEur: 0.57, holderCount: 842, circulatingSupply: 151_500,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: 1.1, historySeed: 5,
    activity: { purchases7d: 94, resales7d: 29, purchaseVolume7dEur: 5_860, resaleVolume7dEur: 1_740, lastActivityLabel: "Revente confirmée il y a 21 min" },
    nextRoom: { id: "room-sama-repetition", title: "Répétition ouverte du trio", startsAt: "2026-07-29T20:00:00+02:00", dateLabel: "29 juil. · 20 h", format: "live", accessLabel: "Room publique", interestedCount: 214 },
  },
  {
    artistId: "neo-sillage", artistName: "Néo Sillage", tokenName: "Jeton Néo Sillage", symbol: "NEOS",
    currentValueEur: 1.16, holderCount: 1736, circulatingSupply: 226_400,
    userQuantity: 31.75, userInitialAmountEur: 32, userAcquiredAt: "2026-05-10T09:45:00.000Z",
    change7dPercent: 7.2, historySeed: 7,
    activity: { purchases7d: 231, resales7d: 68, purchaseVolume7dEur: 19_750, resaleVolume7dEur: 6_280, lastActivityLabel: "Achat confirmé il y a 4 min" },
    nextRoom: { id: "room-neo-visual", title: "Test du live audiovisuel", startsAt: "2026-07-30T21:00:00+02:00", dateLabel: "30 juil. · 21 h", format: "studio", accessLabel: "Room Tremplin", interestedCount: 521 },
  },
  {
    artistId: "mina-roze", artistName: "Mina Roze", tokenName: "Jeton Mina Roze", symbol: "MINA",
    currentValueEur: 0.43, holderCount: 612, circulatingSupply: 119_300,
    userQuantity: 84, userInitialAmountEur: 31, userAcquiredAt: "2026-07-03T17:20:00.000Z",
    change7dPercent: -2.4, historySeed: 9,
    activity: { purchases7d: 61, resales7d: 38, purchaseVolume7dEur: 3_150, resaleVolume7dEur: 2_470, lastActivityLabel: "Achat confirmé il y a 37 min" },
    nextRoom: { id: "room-mina-clip", title: "Dans les coulisses du clip", startsAt: "2026-07-31T18:30:00+02:00", dateLabel: "31 juil. · 18 h 30", format: "questions-reponses", accessLabel: "Room publique", interestedCount: 173 },
  },
  {
    artistId: "awen", artistName: "Awen", tokenName: "Jeton Awen", symbol: "AWEN",
    currentValueEur: 0.31, holderCount: 487, circulatingSupply: 96_800,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: 0.2, historySeed: 11,
    activity: { purchases7d: 48, resales7d: 17, purchaseVolume7dEur: 2_080, resaleVolume7dEur: 680, lastActivityLabel: "Achat confirmé il y a 49 min" },
    nextRoom: { id: "room-awen-maquettes", title: "Écoute des deux nouvelles maquettes", startsAt: "2026-08-01T20:30:00+02:00", dateLabel: "1 août · 20 h 30", format: "ecoute", accessLabel: "Room publique", interestedCount: 148 },
  },
  {
    artistId: "kelya-v", artistName: "Kelya V", tokenName: "Jeton Kelya V", symbol: "KELYA",
    currentValueEur: 0.76, holderCount: 1059, circulatingSupply: 172_200,
    userQuantity: 25, userInitialAmountEur: 17.5, userAcquiredAt: "2026-06-14T12:10:00.000Z",
    change7dPercent: 3.6, historySeed: 13,
    activity: { purchases7d: 127, resales7d: 35, purchaseVolume7dEur: 8_940, resaleVolume7dEur: 2_260, lastActivityLabel: "Achat confirmé il y a 12 min" },
    nextRoom: { id: "room-kelya-showcase", title: "Filage du showcase", startsAt: "2026-08-02T19:00:00+02:00", dateLabel: "2 août · 19 h", format: "live", accessLabel: "Room Tremplin", interestedCount: 307 },
  },
  {
    artistId: "soren-l", artistName: "Soren L", tokenName: "Jeton Soren L", symbol: "SOREN",
    currentValueEur: 0.68, holderCount: 934, circulatingSupply: 163_600,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: -1.3, historySeed: 15,
    activity: { purchases7d: 79, resales7d: 41, purchaseVolume7dEur: 4_820, resaleVolume7dEur: 2_960, lastActivityLabel: "Revente confirmée il y a 16 min" },
    nextRoom: { id: "room-soren-tournee", title: "Préparer la mini-tournée", startsAt: "2026-08-03T20:00:00+02:00", dateLabel: "3 août · 20 h", format: "questions-reponses", accessLabel: "Room publique", interestedCount: 196 },
  },
  {
    artistId: "naim-o", artistName: "Naïm O", tokenName: "Jeton Naïm O", symbol: "NAIMO",
    currentValueEur: 0.92, holderCount: 1184, circulatingSupply: 198_700,
    userQuantity: 14.2, userInitialAmountEur: 11.2, userAcquiredAt: "2026-04-22T18:30:00.000Z",
    change7dPercent: 2.7, historySeed: 17,
    activity: { purchases7d: 112, resales7d: 34, purchaseVolume7dEur: 10_240, resaleVolume7dEur: 2_990, lastActivityLabel: "Achat confirmé il y a 6 min" },
    nextRoom: { id: "room-naim-quartet", title: "Session live avec le quartet", startsAt: "2026-08-04T21:00:00+02:00", dateLabel: "4 août · 21 h", format: "live", accessLabel: "Room publique", interestedCount: 442 },
  },
  {
    artistId: "yuna-vox", artistName: "Yuna Vox", tokenName: "Jeton Yuna Vox", symbol: "YUNAV",
    currentValueEur: 1.38, holderCount: 2106, circulatingSupply: 264_900,
    userQuantity: 62, userInitialAmountEur: 66, userAcquiredAt: "2026-03-08T11:00:00.000Z",
    change7dPercent: 6.1, historySeed: 19,
    activity: { purchases7d: 286, resales7d: 91, purchaseVolume7dEur: 28_760, resaleVolume7dEur: 9_540, lastActivityLabel: "Achat confirmé il y a 2 min" },
    nextRoom: { id: "room-yuna-immersif", title: "Pré-écoute du mix immersif", startsAt: "2026-08-05T20:30:00+02:00", dateLabel: "5 août · 20 h 30", format: "ecoute", accessLabel: "Room Tremplin", interestedCount: 714 },
  },
  {
    artistId: "olympe-404", artistName: "Olympe 404", tokenName: "Jeton Olympe 404", symbol: "OLY404",
    currentValueEur: 0.49, holderCount: 703, circulatingSupply: 137_800,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: -0.1, historySeed: 21,
    activity: { purchases7d: 73, resales7d: 25, purchaseVolume7dEur: 3_960, resaleVolume7dEur: 1_210, lastActivityLabel: "Achat confirmé il y a 28 min" },
    nextRoom: { id: "room-olympe-modulaire", title: "Live modulaire sans filet", startsAt: "2026-08-06T22:00:00+02:00", dateLabel: "6 août · 22 h", format: "live", accessLabel: "Room publique", interestedCount: 259 },
  },
  {
    artistId: "malik-j", artistName: "Malik J", tokenName: "Jeton Malik J", symbol: "MALIKJ",
    currentValueEur: 1.04, holderCount: 1468, circulatingSupply: 219_100,
    userQuantity: 18.5, userInitialAmountEur: 17, userAcquiredAt: "2026-05-29T16:44:00.000Z",
    change7dPercent: 2.1, historySeed: 23,
    activity: { purchases7d: 149, resales7d: 52, purchaseVolume7dEur: 14_380, resaleVolume7dEur: 4_860, lastActivityLabel: "Revente confirmée il y a 11 min" },
    nextRoom: { id: "room-malik-cuivres", title: "Journal de session · les cuivres", startsAt: "2026-08-07T19:30:00+02:00", dateLabel: "7 août · 19 h 30", format: "studio", accessLabel: "Room publique", interestedCount: 331 },
  },
  {
    artistId: "zelie-north", artistName: "Zélie North", tokenName: "Jeton Zélie North", symbol: "ZELIE",
    currentValueEur: 0.36, holderCount: 529, circulatingSupply: 104_600,
    userQuantity: 41, userInitialAmountEur: 13.5, userAcquiredAt: "2026-07-08T08:50:00.000Z",
    change7dPercent: 5.4, historySeed: 25,
    activity: { purchases7d: 88, resales7d: 16, purchaseVolume7dEur: 4_670, resaleVolume7dEur: 740, lastActivityLabel: "Achat confirmé il y a 19 min" },
    nextRoom: { id: "room-zelie-ecriture", title: "Carnet d'écriture ouvert", startsAt: "2026-08-08T18:00:00+02:00", dateLabel: "8 août · 18 h", format: "questions-reponses", accessLabel: "Room Tremplin", interestedCount: 181 },
  },
  {
    artistId: "cassandre-bleu", artistName: "Cassandre Bleu", tokenName: "Jeton Cassandre Bleu", symbol: "CASSB",
    currentValueEur: 0.63, holderCount: 891, circulatingSupply: 158_200,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: -3.1, historySeed: 27,
    activity: { purchases7d: 67, resales7d: 44, purchaseVolume7dEur: 4_490, resaleVolume7dEur: 3_280, lastActivityLabel: "Revente confirmée il y a 9 min" },
    nextRoom: { id: "room-cassandre-clip", title: "Décor du prochain clip", startsAt: "2026-08-09T20:00:00+02:00", dateLabel: "9 août · 20 h", format: "studio", accessLabel: "Room publique", interestedCount: 227 },
  },
  {
    artistId: "anis-valeur", artistName: "Anis Valeur", tokenName: "Jeton Anis Valeur", symbol: "ANISV",
    currentValueEur: 0.71, holderCount: 976, circulatingSupply: 169_400,
    userQuantity: 0, userInitialAmountEur: 0, change7dPercent: 1.9, historySeed: 29,
    activity: { purchases7d: 104, resales7d: 31, purchaseVolume7dEur: 7_360, resaleVolume7dEur: 2_140, lastActivityLabel: "Achat confirmé il y a 14 min" },
    nextRoom: { id: "room-anis-projection", title: "Projection de travail · épisode 2", startsAt: "2026-08-10T21:30:00+02:00", dateLabel: "10 août · 21 h 30", format: "ecoute", accessLabel: "Room Tremplin", interestedCount: 295 },
  },
  {
    artistId: "maya-chen", artistName: "Maya Chen", tokenName: "Jeton Maya Chen", symbol: "MAYA",
    currentValueEur: 1.52, holderCount: 2384, circulatingSupply: 281_600,
    userQuantity: 21.6, userInitialAmountEur: 28, userAcquiredAt: "2026-02-18T15:15:00.000Z",
    change7dPercent: 8.3, historySeed: 31,
    activity: { purchases7d: 328, resales7d: 104, purchaseVolume7dEur: 36_840, resaleVolume7dEur: 12_590, lastActivityLabel: "Achat confirmé à l'instant" },
    nextRoom: { id: "room-maya-production", title: "De la boucle brute au morceau", startsAt: "2026-08-11T18:00:00+02:00", dateLabel: "11 août · 18 h", format: "studio", accessLabel: "Room publique", interestedCount: 806 },
  },
];

const generatedTokenIdentities = [
  ["lior-benali", "Lior Benali", "LIORB"],
  ["anais-kor", "Anaïs Kor", "ANAK"],
  ["demba-flow", "Demba Flow", "DEMBA"],
  ["clara-volt", "Clara Volt", "CLARA"],
  ["jules-orion", "Jules Orion", "JORION"],
  ["aina-sol", "Aïna Sol", "AINAS"],
  ["ilyne-k", "Ilyne K", "ILYNE"],
  ["elio-serra", "Elio Serra", "ELIO"],
  ["maia-kuroda", "Maïa Kuroda", "MAIAK"],
  ["sekou-mare", "Sékou Maré", "SEKOU"],
  ["luma-vale", "Luma Vale", "LUMA"],
  ["north-static", "North Static", "NSTAT"],
  ["kairo-grid", "Kairo Grid", "KAIRO"],
  ["aren-veil", "Aren Veil", "AREN"],
  ["naoko-serein", "Naoko Serein", "NAOKO"],
  ["samra-flux", "Samra Flux", "SAMRA"],
  ["elior-saint", "Elior Saint", "ELIOR"],
  ["amina-sola", "Amina Sola", "AMINA"],
  ["vesper-k", "Vesper K", "VESPER"],
  ["solis-miro", "Solis Miro", "SOLIS"],
  ["nabil-orsen", "Nabil Orsen", "NABIL"],
  ["malik-soren", "Malik Soren", "MALIK"],
  ["liora-fado", "Liora Fado", "LIORA"],
  ["vera-kline", "Véra Kline", "VERAK"],
  ["idriss-ngoma", "Idriss N'Goma", "INGOM"],
  ["anjali-veyra", "Anjali Veyra", "ANJALI"],
  ["nils-bensaid", "Nils Bensaïd", "NILSB"],
  ["ines-raku", "Inès Raku", "INESR"],
  ["thea-novak", "Théa Novak", "THEAN"],
  ["jules-ndoye", "Jules N'Doye", "JNDYE"],
  ["soraya-bell", "Soraya Bell", "SORAY"],
  ["leon-vasseur", "Léon Vasseur", "LEONV"],
  ["imani-kader", "Imani Kader", "IMANI"],
  ["celiane-aube", "Céliane Aube", "CELIA"],
  ["kenji-ravel", "Kenji Ravel", "KENJI"],
  ["noah-belair", "Noah Belair", "NOAHB"],
  ["mina-lattice", "Mina Lattice", "MINAL"],
  ["toma-silex", "Toma Silex", "TOMAS"],
  ["idriss-noor", "Idriss Noor", "INOOR"],
  ["ophelie-grant", "Ophélie Grant", "OPHEL"],
  ["min-jae-lune", "Min-Jae Lune", "MJLUNE"],
  ["noa-prism", "Noa Prism", "NOAPR"],
  ["nassim-halim", "Nassim Halim", "NHALIM"],
  ["mara-shin", "Mara Shin", "MARASH"],
  ["rokh-ndao", "Rokh N'Dao", "ROKH"],
  ["velours-nord", "Velours Nord", "VLNORD"],
  ["maelle-keran", "Maëlle Keran", "MAELLE"],
  ["alba-roche", "Alba Roche", "ALBAR"],
  ["kima-voss", "Kima Voss", "KIMAV"],
  ["yacine-kermor", "Yacine Kermor", "YACINE"],
  ["nola-mbaye", "Nola M'Baye", "NOLAMB"],
  ["miko-reve", "Miko Rêve", "MIKOR"],
  ["gael-ferran", "Gaël Ferran", "GAELF"],
  ["kenza-loba", "Kenza Loba", "KENZA"],
  ["milo-kanza", "Milo Kanza", "MILOK"],
  ["ilyes-pulse", "Ilyes Pulse", "ILYESP"],
  ["elise-kemba", "Élise Kemba", "ELISEK"],
  ["ewen-tran", "Éwen Tran", "EWENT"],
  ["naya-oris", "Naya Oris", "NAYAOR"],
  ["lucien-aoki", "Lucien Aoki", "LAOKI"],
  ["jo-varenne", "Jo Varenne", "JOVAR"],
  ["eliott-marek", "Eliott Marek", "ELIOTT"],
  ["moussa-elian", "Moussa Elian", "MOUSS"],
  ["adrien-kora", "Adrien Kora", "ADKORA"],
  ["salome-kit", "Salomé Kit", "SALOME"],
  ["jonas-reef", "Jonas Reef", "JONASR"],
  ["aya-miro", "Aya Miro", "AYAM"],
  ["robin-ciel", "Robin Ciel", "ROBC"],
  ["camille-forge", "Camille Forge", "CAMFOR"],
  ["louna-saphir", "Louna Saphir", "LOUNA"],
  ["samir-octave", "Samir Octave", "SAMOCT"],
  ["june-kairo", "June Kairo", "JUNEK"],
  ["aicha-sol", "Aïcha Sol", "AICHAS"],
  ["tiago-luz", "Tiago Luz", "TIAGO"],
  ["rania-vox", "Rania Vox", "RANIAV"],
  ["lou-ardent", "Lou Ardent", "LOUARD"],
  ["zoe-marimba", "Zoé Marimba", "ZOEM"],
  ["bilal-dune", "Bilal Dune", "BILDUN"],
  ["cleo-vent", "Cléo Vent", "CLEOV"],
  ["ana-vela", "Ana Vela", "ANAVEL"],
  ["oumar-lines", "Oumar Lines", "OUMAR"],
  ["sacha-bloom", "Sacha Bloom", "SACHAB"],
  ["mariam-delta", "Mariam Delta", "MARDEL"],
  ["hugo-quartz", "Hugo Quartz", "HUGOQ"],
  ["tess-aoki", "Tess Aoki", "TESSA"],
  ["minuit-label", "Minuit Label", "MINUIT"],
  ["studio-echo-13", "Studio Écho 13", "ECHO13"],
  ["selma-keita-management", "Selma Keita", "SELMAK"],
  ["atelier-scene", "Atelier Scène", "ATLSCN"],
  ["nora-valen", "Nora Valen", "NORAV"],
  ["agathe-lune", "Agathe Lune", "AGLUNE"],
  ["imani-cole", "Imani Cole", "IMCOL"],
  ["mael-nox", "Maël Nox", "MAELN"],
  ["zora-madi", "Zora Madi", "ZORAM"],
  ["sacha-moret", "Sacha Moret", "SMORET"],
  ["lyes-kora", "Lyes Kora", "LYESK"],
  ["noham-faye", "Noham Faye", "NOHAM"],
  ["yuna-brass", "Yuna Brass", "YUNAB"],
  ["camille-roe", "Camille Roe", "CAMROE"],
] as const;

const generatedTokenSeeds: readonly TokenSeed[] = generatedTokenIdentities.map(
  ([artistId, artistName, symbol], index) => {
    const currentValueEur = round(0.29 + (index % 7) * 0.11 + index * 0.018, 2);
    const holderCount = 376 + index * 97 + (index % 4) * 41;
    const circulatingSupply = 92_000 + index * 8_700;
    const change7dPercent = round(-2.8 + ((index * 17) % 94) / 10, 1);
    const day = 27 + (index % 5);
    return {
      artistId,
      artistName,
      tokenName: `Jeton ${artistName}`,
      symbol,
      currentValueEur,
      holderCount,
      circulatingSupply,
      userQuantity: index % 4 === 0 ? 8 + index * 1.7 : 0,
      userInitialAmountEur: index % 4 === 0 ? 6 + index * 1.15 : 0,
      ...(index % 4 === 0 ? { userAcquiredAt: `2026-06-${String(4 + index % 24).padStart(2, "0")}T16:20:00.000Z` } : {}),
      change7dPercent,
      historySeed: 41 + index * 2,
      activity: {
        purchases7d: 46 + index * 13,
        resales7d: 12 + index * 4,
        purchaseVolume7dEur: 2_380 + index * 1_170,
        resaleVolume7dEur: 640 + index * 430,
        lastActivityLabel: `${index % 5 === 0 ? "Revente" : "Achat"} confirmé il y a ${3 + index * 2} min`,
      },
      nextRoom: {
        id: `room-${artistId}-tremplin`,
        title: ["Écoute de travail", "Session ouverte", "Dans les coulisses", "Questions à l'artiste"][index % 4],
        startsAt: `2026-07-${String(day).padStart(2, "0")}T${String(18 + index % 4).padStart(2, "0")}:30:00+02:00`,
        dateLabel: `${day} juil. · ${18 + index % 4} h 30`,
        format: (["ecoute", "live", "studio", "questions-reponses"] as const)[index % 4],
        accessLabel: index % 3 === 0 ? "Room Tremplin" : "Room publique",
        interestedCount: 104 + index * 39,
      },
    };
  },
);

const predefinedTokenSeeds: readonly TokenSeed[] = [
  ...coreTokenSeeds,
  ...generatedTokenSeeds,
];

const predefinedTokenArtistIds = new Set(predefinedTokenSeeds.map(({ artistId }) => artistId));
const supplementalTokenSeeds: readonly TokenSeed[] = tremplinArtists
  .filter(({ id }) => !predefinedTokenArtistIds.has(id))
  .map((artist, offset) => {
    const index = predefinedTokenSeeds.length + offset;
    const currentValueEur = round(0.42 + (index % 9) * 0.09 + index * 0.012, 2);
    const holderCount = 420 + index * 73 + (index % 5) * 29;
    const circulatingSupply = 108_000 + index * 7_900;
    const change7dPercent = round(-1.9 + ((index * 19) % 87) / 10, 1);
    const day = 27 + (index % 5);
    return {
      artistId: artist.id,
      artistName: artist.name,
      tokenName: `Jeton ${artist.name}`,
      symbol: `MW${String(offset + 1).padStart(4, "0")}`,
      currentValueEur,
      holderCount,
      circulatingSupply,
      userQuantity: index % 4 === 0 ? 10 + index * 1.25 : 0,
      userInitialAmountEur: index % 4 === 0 ? 8 + index * 0.92 : 0,
      ...(index % 4 === 0 ? { userAcquiredAt: `2026-06-${String(4 + index % 24).padStart(2, "0")}T16:20:00.000Z` } : {}),
      change7dPercent,
      historySeed: 67 + index * 2,
      activity: {
        purchases7d: 52 + index * 11,
        resales7d: 10 + index * 3,
        purchaseVolume7dEur: 2_900 + index * 980,
        resaleVolume7dEur: 710 + index * 360,
        lastActivityLabel: `${index % 5 === 0 ? "Revente" : "Achat"} confirmé il y a ${4 + index * 2} min`,
      },
      nextRoom: {
        id: `room-${artist.id}-tremplin`,
        title: ["Présentation de projet", "Session ouverte", "Dans les coulisses", "Questions au profil"][index % 4],
        startsAt: `2026-07-${String(day).padStart(2, "0")}T${String(18 + index % 4).padStart(2, "0")}:30:00+02:00`,
        dateLabel: `${day} juil. · ${18 + index % 4} h 30`,
        format: (["ecoute", "live", "studio", "questions-reponses"] as const)[index % 4],
        accessLabel: index % 3 === 0 ? "Room Tremplin" : "Room publique",
        interestedCount: 118 + index * 31,
      },
    };
  });

const tokenSeeds: readonly TokenSeed[] = [
  ...predefinedTokenSeeds,
  ...supplementalTokenSeeds,
];

const createArtistToken = (seed: TokenSeed, index: number): TremplinArtistToken => {
  const estimatedValueEur = round(seed.userQuantity * seed.currentValueEur, 2);
  return {
    artistId: seed.artistId,
    artistName: seed.artistName,
    tokenName: seed.tokenName,
    symbol: seed.symbol,
    admittedAt: new Date(Date.UTC(2026, 5, 1 + (index * 3) % 48, 10, 0, 0)).toISOString(),
    currency: "EUR",
    currentValueEur: seed.currentValueEur,
    holderCount: seed.holderCount,
    circulatingSupply: seed.circulatingSupply,
    trend7d: createTrend(seed.change7dPercent),
    valueHistory: createValueHistory(seed),
    activity: seed.activity,
    userPosition: {
      quantity: seed.userQuantity,
      initialAmountEur: seed.userInitialAmountEur,
      estimatedValueEur,
      ownershipSharePercent: percent(seed.userQuantity, seed.circulatingSupply),
      averagePurchasePriceEur: seed.userQuantity > 0
        ? round(seed.userInitialAmountEur / seed.userQuantity, 4)
        : 0,
      ...(seed.userAcquiredAt ? { acquiredAt: seed.userAcquiredAt } : {}),
    },
    nextRoom: seed.nextRoom,
    curve: createCurve(seed),
  };
};

export const tremplinArtistTokens: readonly TremplinArtistToken[] =
  tokenSeeds.map(createArtistToken);

export const tremplinArtistTokenById: ReadonlyMap<string, TremplinArtistToken> =
  new Map(tremplinArtistTokens.map((token) => [token.artistId, token]));

export const getTremplinArtistToken = (
  artistId: string,
): TremplinArtistToken | undefined => tremplinArtistTokenById.get(artistId);

export const calculateLinearBondingCurvePrice = (
  curve: TremplinLinearCurveParameters,
  supply: number,
): number => {
  const normalizedCurve = safeCurve(curve);
  const normalizedSupply = Number.isFinite(supply) ? Math.max(0, supply) : 0;
  return round(
    normalizedCurve.floorPriceEur + normalizedCurve.slopeEurPerToken * normalizedSupply,
    6,
  );
};

const integrateLinearCurve = (
  curve: TremplinLinearCurveParameters,
  supplyFrom: number,
  supplyTo: number,
): number => {
  const lower = Math.max(0, Math.min(supplyFrom, supplyTo));
  const upper = Math.max(0, Math.max(supplyFrom, supplyTo));
  return round(
    curve.floorPriceEur * (upper - lower) +
      (curve.slopeEurPerToken / 2) * (upper ** 2 - lower ** 2),
    6,
  );
};

const quantityForCurveBudget = (
  curve: TremplinLinearCurveParameters,
  supply: number,
  budgetEur: number,
): number => {
  if (budgetEur <= 0) return 0;
  const priceNow = calculateLinearBondingCurvePrice(curve, supply);
  if (curve.slopeEurPerToken <= 0) return budgetEur / Math.max(priceNow, 0.000001);
  return Math.max(
    0,
    (-priceNow + Math.sqrt(priceNow ** 2 + 2 * curve.slopeEurPerToken * budgetEur)) /
      curve.slopeEurPerToken,
  );
};

const getOwnershipLimit = (config: TremplinPlatformConfig): number =>
  config.maximumOwnershipBps / BASIS_POINTS;

const getMaximumAdditionalQuantity = (
  supply: number,
  currentUserQuantity: number,
  config: TremplinPlatformConfig,
): number => {
  const limit = getOwnershipLimit(config);
  return Math.max(0, (limit * supply - currentUserQuantity) / Math.max(0.000001, 1 - limit));
};

const getKycBlockReason = (
  config: TremplinPlatformConfig,
  kycStatus: TremplinKycStatus,
): string | null =>
  config.kycRequired && kycStatus !== "verified"
    ? "La vérification d'identité doit être validée avant cette opération."
    : null;

export const simulateBondingCurvePurchase = ({
  token,
  amountEur,
  currentUserQuantity = token.userPosition.quantity,
  kycStatus = "verified",
  config = TREMPLIN_PLATFORM_CONFIG,
}: TremplinPurchaseSimulationInput): TremplinPurchaseSimulation => {
  const amountIsValid = Number.isFinite(amountEur) && amountEur > 0;
  const currentQuantityIsValid = isFiniteNonNegative(currentUserQuantity);
  const supplyIsValid = isFiniteNonNegative(token.circulatingSupply) && token.circulatingSupply > 0;
  const curveIsValid = hasValidCurve(token.curve);
  const purchaseFeeBps = safeBasisPoints(config.feesBps.purchase);
  const technicalFeeBps = safeBasisPoints(config.feesBps.technical);
  const artistDistributionBps = safeBasisPoints(config.distributionsBps.artistOnPurchase);
  const reserveDistributionBps = safeBasisPoints(config.distributionsBps.reserveOnPurchase);
  const deductionBps = purchaseFeeBps + technicalFeeBps + artistDistributionBps + reserveDistributionBps;
  const configIsValid =
    isValidBasisPoints(config.feesBps.purchase) &&
    isValidBasisPoints(config.feesBps.technical) &&
    isValidBasisPoints(config.distributionsBps.artistOnPurchase) &&
    isValidBasisPoints(config.distributionsBps.reserveOnPurchase) &&
    deductionBps < BASIS_POINTS &&
    Number.isFinite(config.maximumOwnershipBps) &&
    config.maximumOwnershipBps > 0 &&
    config.maximumOwnershipBps <= BASIS_POINTS;
  const normalizedCurve = safeCurve(token.curve);
  const safeSupply = supplyIsValid ? token.circulatingSupply : 0;
  const safeCurrentUserQuantity = currentQuantityIsValid ? currentUserQuantity : 0;
  const safeAmountEur = amountIsValid ? amountEur : 0;
  const meewayFeeEur = fromBps(safeAmountEur, purchaseFeeBps);
  const technicalFeeEur = fromBps(safeAmountEur, technicalFeeBps);
  const artistAmountEur = fromBps(safeAmountEur, artistDistributionBps);
  const reserveAmountEur = fromBps(safeAmountEur, reserveDistributionBps);
  const totalFeesEur = round(meewayFeeEur + technicalFeeEur, 2);
  const amountAppliedToCurveEur = round(
    Math.max(0, safeAmountEur - totalFeesEur - artistAmountEur - reserveAmountEur),
    2,
  );
  const estimatedTokenQuantity = round(
    quantityForCurveBudget(normalizedCurve, safeSupply, amountAppliedToCurveEur),
    6,
  );
  const supplyAfter = safeSupply + estimatedTokenQuantity;
  const userQuantityAfter = safeCurrentUserQuantity + estimatedTokenQuantity;
  const priceBeforeEur = calculateLinearBondingCurvePrice(normalizedCurve, safeSupply);
  const priceAfterEur = calculateLinearBondingCurvePrice(normalizedCurve, supplyAfter);
  const ownershipConfig = configIsValid ? config : TREMPLIN_PLATFORM_CONFIG;
  const maximumAdditionalQuantity = round(
    getMaximumAdditionalQuantity(safeSupply, safeCurrentUserQuantity, ownershipConfig),
    6,
  );
  const blockedReasons: string[] = [];
  const kycReason = getKycBlockReason(config, kycStatus);
  if (kycReason) blockedReasons.push(kycReason);
  if (!amountIsValid) blockedReasons.push("Le montant doit être un nombre fini supérieur à 0 €.");
  if (!currentQuantityIsValid) blockedReasons.push("La quantité détenue transmise est invalide.");
  if (!supplyIsValid || !curveIsValid) blockedReasons.push("Les paramètres de la courbe sont invalides.");
  if (!configIsValid) blockedReasons.push("La configuration financière est invalide ou dépasse 100 % du montant.");
  if (estimatedTokenQuantity > maximumAdditionalQuantity) {
    blockedReasons.push(
      `Cette opération dépasserait la limite de ${round(ownershipConfig.maximumOwnershipBps / 100, 2)} % des jetons d'un même artiste.`,
    );
  }

  return {
    quoteOnly: true,
    requiresServerConfirmation: true,
    operation: "purchase",
    artistId: token.artistId,
    symbol: token.symbol,
    currency: config.currency,
    curveVersion: token.curve.version,
    platformConfigVersion: config.version,
    eligible: blockedReasons.length === 0,
    blockedReasons,
    warnings: [
      "La valeur du jeton peut monter ou descendre après l'achat. Aucun résultat financier n'est garanti.",
      "Cette estimation sera recalculée par le serveur au moment de la confirmation.",
    ],
    amountPaidEur: round(safeAmountEur, 2),
    estimatedTokenQuantity,
    amountAppliedToCurveEur,
    priceBeforeEur,
    priceAfterEur,
    averageExecutionPriceEur: estimatedTokenQuantity > 0
      ? round(amountAppliedToCurveEur / estimatedTokenQuantity, 6)
      : 0,
    priceImpactPercent: priceBeforeEur > 0
      ? round(((priceAfterEur - priceBeforeEur) / priceBeforeEur) * 100, 4)
      : 0,
    supplyBefore: safeSupply,
    supplyAfter: round(supplyAfter, 6),
    userQuantityBefore: round(safeCurrentUserQuantity, 6),
    userQuantityAfter: round(userQuantityAfter, 6),
    ownershipShareBeforePercent: percent(safeCurrentUserQuantity, safeSupply),
    ownershipShareAfterPercent: percent(userQuantityAfter, supplyAfter),
    maximumOwnershipPercent: round(ownershipConfig.maximumOwnershipBps / 100, 2),
    maximumAdditionalQuantity,
    feeLines: [
      { id: "meeway", label: "Commission Meeway", rateBps: purchaseFeeBps, amountEur: meewayFeeEur },
      { id: "technical", label: "Frais techniques", rateBps: technicalFeeBps, amountEur: technicalFeeEur },
    ],
    totalFeesEur,
    distributionLines: [
      { id: "artist", label: "Part destinée à l'artiste", rateBps: artistDistributionBps, amountEur: artistAmountEur },
      { id: "reserve", label: "Part destinée à la réserve de fonctionnement", rateBps: reserveDistributionBps, amountEur: reserveAmountEur },
      { id: "curve", label: "Montant affecté au mécanisme de calcul du prix", rateBps: null, amountEur: amountAppliedToCurveEur },
    ],
    artistAmountEur,
    reserveAmountEur,
  };
};

export const simulateBondingCurveResale = ({
  token,
  quantity,
  currentUserQuantity = token.userPosition.quantity,
  kycStatus = "verified",
  rapidExit = false,
  config = TREMPLIN_PLATFORM_CONFIG,
}: TremplinResaleSimulationInput): TremplinResaleSimulation => {
  const quantityIsValid = Number.isFinite(quantity) && quantity > 0;
  const currentQuantityIsValid = isFiniteNonNegative(currentUserQuantity);
  const supplyIsValid = isFiniteNonNegative(token.circulatingSupply) && token.circulatingSupply > 0;
  const curveIsValid = hasValidCurve(token.curve);
  const resaleFeeBps = safeBasisPoints(config.feesBps.resale);
  const technicalFeeBps = safeBasisPoints(config.feesBps.technical);
  const rapidExitFeeBps = safeBasisPoints(config.feesBps.rapidExit);
  const applicableFeeBps = resaleFeeBps + technicalFeeBps + (rapidExit ? rapidExitFeeBps : 0);
  const ownershipBpsIsValid =
    Number.isFinite(config.maximumOwnershipBps) &&
    config.maximumOwnershipBps > 0 &&
    config.maximumOwnershipBps <= BASIS_POINTS;
  const configIsValid =
    isValidBasisPoints(config.feesBps.resale) &&
    isValidBasisPoints(config.feesBps.technical) &&
    isValidBasisPoints(config.feesBps.rapidExit) &&
    applicableFeeBps < BASIS_POINTS &&
    ownershipBpsIsValid;
  const ownershipConfig = configIsValid ? config : TREMPLIN_PLATFORM_CONFIG;
  const normalizedCurve = safeCurve(token.curve);
  const safeSupply = supplyIsValid ? token.circulatingSupply : 0;
  const safeCurrentUserQuantity = currentQuantityIsValid ? currentUserQuantity : 0;
  const safeQuantity = quantityIsValid ? quantity : 0;
  const executableQuantity = Math.min(safeQuantity, safeCurrentUserQuantity, safeSupply);
  const supplyAfter = Math.max(0, safeSupply - executableQuantity);
  const estimatedValueBeforeFeesEur = round(
    integrateLinearCurve(normalizedCurve, supplyAfter, safeSupply),
    2,
  );
  const meewayFeeEur = fromBps(estimatedValueBeforeFeesEur, resaleFeeBps);
  const technicalFeeEur = fromBps(estimatedValueBeforeFeesEur, technicalFeeBps);
  const rapidExitFeeEur = rapidExit
    ? fromBps(estimatedValueBeforeFeesEur, rapidExitFeeBps)
    : 0;
  const totalFeesEur = round(meewayFeeEur + technicalFeeEur + rapidExitFeeEur, 2);
  const netAmountEur = round(Math.max(0, estimatedValueBeforeFeesEur - totalFeesEur), 2);
  const userQuantityAfter = Math.max(0, safeCurrentUserQuantity - executableQuantity);
  const priceBeforeEur = calculateLinearBondingCurvePrice(normalizedCurve, safeSupply);
  const priceAfterEur = calculateLinearBondingCurvePrice(normalizedCurve, supplyAfter);
  const blockedReasons: string[] = [];
  const warnings: string[] = [
    "La valeur et le montant net restent estimatifs jusqu'à la confirmation du serveur.",
  ];
  const kycReason = getKycBlockReason(config, kycStatus);
  if (kycReason) blockedReasons.push(kycReason);
  if (!quantityIsValid) blockedReasons.push("La quantité à revendre doit être un nombre fini supérieur à zéro.");
  if (!currentQuantityIsValid) blockedReasons.push("La quantité détenue transmise est invalide.");
  if (!supplyIsValid || !curveIsValid) blockedReasons.push("Les paramètres de la courbe sont invalides.");
  if (!configIsValid) blockedReasons.push("La configuration des frais de revente est invalide ou dépasse 100 %.");
  if (safeQuantity > safeCurrentUserQuantity) {
    blockedReasons.push("Tu ne peux pas revendre plus de jetons que tu n’en détiens.");
  }
  if (rapidExit) {
    warnings.push(
      "Une revente aussi rapide entraîne des frais importants. Le montant net estimé peut être inférieur au montant initial correspondant.",
    );
  }

  return {
    quoteOnly: true,
    requiresServerConfirmation: true,
    operation: "resale",
    artistId: token.artistId,
    symbol: token.symbol,
    currency: config.currency,
    curveVersion: token.curve.version,
    platformConfigVersion: config.version,
    eligible: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    quantityResold: round(executableQuantity, 6),
    estimatedValueBeforeFeesEur,
    netAmountEur,
    rapidExitApplied: rapidExit,
    priceBeforeEur,
    priceAfterEur,
    averageExecutionPriceEur: executableQuantity > 0
      ? round(estimatedValueBeforeFeesEur / executableQuantity, 6)
      : 0,
    priceImpactPercent: priceBeforeEur > 0
      ? round(((priceAfterEur - priceBeforeEur) / priceBeforeEur) * 100, 4)
      : 0,
    supplyBefore: safeSupply,
    supplyAfter: round(supplyAfter, 6),
    userQuantityBefore: round(safeCurrentUserQuantity, 6),
    userQuantityAfter: round(userQuantityAfter, 6),
    ownershipShareBeforePercent: percent(safeCurrentUserQuantity, safeSupply),
    ownershipShareAfterPercent: percent(userQuantityAfter, supplyAfter),
    maximumOwnershipPercent: round(ownershipConfig.maximumOwnershipBps / 100, 2),
    feeLines: [
      { id: "meeway", label: "Frais de revente Meeway", rateBps: resaleFeeBps, amountEur: meewayFeeEur },
      { id: "technical", label: "Frais techniques", rateBps: technicalFeeBps, amountEur: technicalFeeEur },
      ...(rapidExit
        ? [{ id: "rapid-exit" as const, label: "Frais de revente anticipée", rateBps: rapidExitFeeBps, amountEur: rapidExitFeeEur }]
        : []),
    ],
    totalFeesEur,
  };
};

export const TREMPLIN_TRANSACTION_STATUS_LABELS: Record<
  TremplinTransactionStatus,
  string
> = {
  pending: "En attente",
  confirmed: "Confirmé",
  failed: "Échoué",
  cancelled: "Annulé",
  refunded: "Remboursé",
  "blocked-for-verification": "Bloqué pour vérification",
};

const transaction = (
  data: Omit<TremplinTokenTransaction, "statusLabel">,
): TremplinTokenTransaction => ({
  ...data,
  statusLabel: TREMPLIN_TRANSACTION_STATUS_LABELS[data.status],
});

export const tremplinMockTransactions: readonly TremplinTokenTransaction[] = [
  transaction({ id: "tx-20260719-001", transactionReference: "MW-TRE-260719-001", occurredAt: "2026-07-19T17:52:00.000Z", dateLabel: "19 juil. 2026 · 19 h 52", artistId: "lunae", artistName: "Lunaé", symbol: "LUNAE", operation: "purchase", amountEur: 25, tokenQuantity: 28.4471, averagePriceEur: 0.8085, feesEur: 0.73, netAmountEur: 25, status: "confirmed", receiptReference: "RC-TRE-847201" }),
  transaction({ id: "tx-20260718-002", transactionReference: "MW-TRE-260718-002", occurredAt: "2026-07-18T12:04:00.000Z", dateLabel: "18 juil. 2026 · 14 h 04", artistId: "zelie-north", artistName: "Zélie North", symbol: "ZELIE", operation: "purchase", amountEur: 50, tokenQuantity: 128.625, averagePriceEur: 0.3624, feesEur: 1.45, netAmountEur: 50, status: "pending", receiptReference: null }),
  transaction({ id: "tx-20260715-003", transactionReference: "MW-TRE-260715-003", occurredAt: "2026-07-15T08:31:00.000Z", dateLabel: "15 juil. 2026 · 10 h 31", artistId: "neo-sillage", artistName: "Néo Sillage", symbol: "NEOS", operation: "resale", amountEur: 18.42, tokenQuantity: 16, averagePriceEur: 1.1513, feesEur: 0.53, netAmountEur: 17.89, status: "confirmed", receiptReference: "RC-TRE-839514" }),
  transaction({ id: "tx-20260712-004", transactionReference: "MW-TRE-260712-004", occurredAt: "2026-07-12T19:40:00.000Z", dateLabel: "12 juil. 2026 · 21 h 40", artistId: "mina-roze", artistName: "Mina Roze", symbol: "MINA", operation: "purchase", amountEur: 25, tokenQuantity: 54.18, averagePriceEur: 0.4247, feesEur: 0.73, netAmountEur: 25, status: "failed", receiptReference: null }),
  transaction({ id: "tx-20260709-005", transactionReference: "MW-TRE-260709-005", occurredAt: "2026-07-09T13:18:00.000Z", dateLabel: "9 juil. 2026 · 15 h 18", artistId: "kelya-v", artistName: "Kelya V", symbol: "KELYA", operation: "purchase", amountEur: 10, tokenQuantity: 12.083, averagePriceEur: 0.7611, feesEur: 0.29, netAmountEur: 10, status: "cancelled", receiptReference: null }),
  transaction({ id: "tx-20260703-006", transactionReference: "MW-TRE-260703-006", occurredAt: "2026-07-03T09:12:00.000Z", dateLabel: "3 juil. 2026 · 11 h 12", artistId: "yuna-vox", artistName: "Yuna Vox", symbol: "YUNAV", operation: "purchase", amountEur: 100, tokenQuantity: 66.72, averagePriceEur: 1.3782, feesEur: 2.9, netAmountEur: 100, status: "refunded", receiptReference: "RC-TRE-810492" }),
  transaction({ id: "tx-20260629-007", transactionReference: "MW-TRE-260629-007", occurredAt: "2026-06-29T16:52:00.000Z", dateLabel: "29 juin 2026 · 18 h 52", artistId: "maya-chen", artistName: "Maya Chen", symbol: "MAYA", operation: "purchase", amountEur: 50, tokenQuantity: 30.21, averagePriceEur: 1.5226, feesEur: 1.45, netAmountEur: 50, status: "blocked-for-verification", receiptReference: null }),
  transaction({ id: "tx-20260622-008", transactionReference: "MW-TRE-260622-008", occurredAt: "2026-06-22T11:09:00.000Z", dateLabel: "22 juin 2026 · 13 h 09", artistId: "malik-j", artistName: "Malik J", symbol: "MALIKJ", operation: "resale", amountEur: 9.34, tokenQuantity: 9, averagePriceEur: 1.0378, feesEur: 0.27, netAmountEur: 9.07, status: "confirmed", receiptReference: "RC-TRE-792318" }),
];
