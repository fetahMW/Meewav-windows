import { describe, expect, it } from "vitest";
import type { TremplinTokenLifecycleStage } from "./tremplinProductModel";
import { TREMPLIN_HOME_TOKEN_STATUS_UI } from "./tremplinHomeTokenStatus";

const STAGES: TremplinTokenLifecycleStage[] = [
  "observation",
  "eligible",
  "review",
  "upcoming",
  "active",
  "suspended",
];

describe("mapping public des états du jeton sur l’accueil", () => {
  it("couvre les six états avec une explication et une action", () => {
    expect(Object.keys(TREMPLIN_HOME_TOKEN_STATUS_UI)).toEqual(STAGES);
    STAGES.forEach((stage) => {
      expect(TREMPLIN_HOME_TOKEN_STATUS_UI[stage].label).not.toBe("");
      expect(TREMPLIN_HOME_TOKEN_STATUS_UI[stage].helper).not.toBe("");
      expect(TREMPLIN_HOME_TOKEN_STATUS_UI[stage].action).not.toBe("");
    });
  });

  it("réserve le prix et l’accès au jeton de talent au seul état actif", () => {
    STAGES.forEach((stage) => {
      expect(TREMPLIN_HOME_TOKEN_STATUS_UI[stage].showPrice).toBe(stage === "active");
      expect(TREMPLIN_HOME_TOKEN_STATUS_UI[stage].allowSupport).toBe(stage === "active");
    });
  });

  it("nomme précisément l’action disponible pour chaque état", () => {
    expect(Object.fromEntries(STAGES.map((stage) => [stage, TREMPLIN_HOME_TOKEN_STATUS_UI[stage].action]))).toEqual({
      observation: "Voir le parcours",
      eligible: "Comprendre l’éligibilité",
      review: "Voir l’état de la demande",
      upcoming: "Comprendre le lancement",
      active: "Voir le jeton de talent",
      suspended: "Comprendre la suspension",
    });
  });
});
