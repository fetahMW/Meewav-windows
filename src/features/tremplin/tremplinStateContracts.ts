import type { TremplinTokenLifecycleStage } from "./tremplinProductModel";

export type TokenStatus =
  | "observation"
  | "eligible"
  | "verification"
  | "comingSoon"
  | "active"
  | "suspended";

export type TransactionStatus =
  | "draft"
  | "quoted"
  | "quoteExpired"
  | "pendingIdentity"
  | "pendingConfirmation"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "refunded"
  | "blocked";

export type FollowStatus = "notFollowing" | "following" | "loading" | "error";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "additionalInformationRequired"
  | "underReview"
  | "approved"
  | "rejected"
  | "activated";

export function toCanonicalTokenStatus(stage: TremplinTokenLifecycleStage): TokenStatus {
  if (stage === "review") return "verification";
  if (stage === "upcoming") return "comingSoon";
  return stage;
}

export const TOKEN_STATUS_LABELS: Readonly<Record<TokenStatus, string>> = {
  observation: "Observation",
  eligible: "Éligible",
  verification: "Vérification",
  comingSoon: "Lancement prochain",
  active: "Actif",
  suspended: "Suspendu",
};
