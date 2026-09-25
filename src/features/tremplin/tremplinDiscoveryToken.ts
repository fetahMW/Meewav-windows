import type { TremplinTokenLifecycleStage } from "./tremplinProductModel";
import type { TremplinArtistToken } from "./tremplinTokenData";

export type TremplinDiscoveryTokenUi = {
  label: string;
  helper: string;
  primaryAction: string;
  showPrice: boolean;
  showChange24h: boolean;
};

export const TREMPLIN_DISCOVERY_TOKEN_UI: Readonly<Record<
  TremplinTokenLifecycleStage,
  TremplinDiscoveryTokenUi
>> = {
  observation: {
    label: "Parcours en observation",
    helper: "Aucun jeton actif",
    primaryAction: "Voir le parcours",
    showPrice: false,
    showChange24h: false,
  },
  eligible: {
    label: "Demande possible",
    helper: "L’artiste peut demander l’étude de son jeton",
    primaryAction: "Comprendre l’éligibilité",
    showPrice: false,
    showChange24h: false,
  },
  review: {
    label: "Vérification en cours",
    helper: "Aucun prix affiché",
    primaryAction: "Voir l’état de la demande",
    showPrice: false,
    showChange24h: false,
  },
  upcoming: {
    label: "Lancement prochain",
    helper: "Aucune opération disponible",
    primaryAction: "Comprendre le lancement",
    showPrice: false,
    showChange24h: false,
  },
  active: {
    label: "Jeton de talent actif",
    helper: "Achat et revente disponibles",
    primaryAction: "Voir le jeton",
    showPrice: true,
    showChange24h: true,
  },
  suspended: {
    label: "Opérations suspendues",
    helper: "Consulte les informations",
    primaryAction: "Comprendre la suspension",
    showPrice: false,
    showChange24h: false,
  },
} as const;

export type TremplinToken24hSnapshot = {
  changePercent: number | null;
  updatedAt: string | null;
};

export function getTremplinToken24hSnapshot(
  token: Pick<TremplinArtistToken, "valueHistory"> | undefined,
): TremplinToken24hSnapshot {
  const points = token?.valueHistory["24h"] ?? [];
  if (points.length < 2) return { changePercent: null, updatedAt: points[0]?.timestamp ?? null };
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { changePercent: null, updatedAt: null };

  const updatedAt = Number.isNaN(Date.parse(last.timestamp)) ? null : last.timestamp;
  if (!Number.isFinite(first.valueEur) || !Number.isFinite(last.valueEur) || first.valueEur <= 0) {
    return { changePercent: null, updatedAt };
  }

  const changePercent = ((last.valueEur - first.valueEur) / first.valueEur) * 100;
  return {
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    updatedAt,
  };
}

export function formatTremplinTokenUpdatedAt(value: string | null) {
  if (!value) return "Mise à jour indisponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Mise à jour indisponible";
  return `Mis à jour à ${new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date)}`;
}

export function formatTremplinTokenPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
