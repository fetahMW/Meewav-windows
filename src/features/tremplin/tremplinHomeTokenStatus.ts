import type { TremplinTokenLifecycleStage } from "./tremplinProductModel";

export type TremplinHomeTokenStatusUi = {
  label: string;
  helper: string;
  action: string;
  showPrice: boolean;
  allowSupport: boolean;
};

/**
 * Public copy for the Tremplin resolver. The API remains the source of truth
 * for the lifecycle stage; this mapping only controls how that stage is shown.
 */
export const TREMPLIN_HOME_TOKEN_STATUS_UI: Readonly<Record<
  TremplinTokenLifecycleStage,
  TremplinHomeTokenStatusUi
>> = {
  observation: {
    label: "Parcours en observation",
    helper: "Aucun jeton actif",
    action: "Voir le parcours",
    showPrice: false,
    allowSupport: false,
  },
  eligible: {
    label: "Demande possible",
    helper: "L’artiste peut déposer une demande",
    action: "Comprendre l’éligibilité",
    showPrice: false,
    allowSupport: false,
  },
  review: {
    label: "Vérification en cours",
    helper: "Aucun prix affiché",
    action: "Voir l’état de la demande",
    showPrice: false,
    allowSupport: false,
  },
  upcoming: {
    label: "Lancement prochain",
    helper: "Aucune opération disponible",
    action: "Comprendre le lancement",
    showPrice: false,
    allowSupport: false,
  },
  active: {
    label: "Jeton de talent actif",
    helper: "Achat et revente disponibles",
    action: "Voir le jeton de talent",
    showPrice: true,
    allowSupport: true,
  },
  suspended: {
    label: "Opérations suspendues",
    helper: "Consulte les informations",
    action: "Comprendre la suspension",
    showPrice: false,
    allowSupport: false,
  },
};
