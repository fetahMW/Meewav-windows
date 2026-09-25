import type { MarketListingDraft } from "./MarketListingComposer";
import type { MarketCategory, MarketCondition } from "./marketDemoData";
import type {
  MarketplaceListingDraftInput,
  MarketplaceOwnerDraft,
  MarketplacePriceUnit,
} from "./market.types";

const DRAFT_CATEGORY_BY_CODE: Readonly<Record<string, MarketCategory>> = {
  synthetiseurs: "Synthétiseurs",
  synths: "Synthétiseurs",
  synthesizers: "Synthétiseurs",
  interfaces: "Interfaces audio",
  "interfaces-audio": "Interfaces audio",
  "audio-interfaces": "Interfaces audio",
  microphones: "Microphones",
  casques: "Casques",
  headphones: "Casques",
  guitares: "Guitares",
  guitars: "Guitares",
  "batteries-electroniques": "Batteries électroniques",
  "electronic-drums": "Batteries électroniques",
  "dj-et-vinyle": "DJ & vinyle",
  "dj-and-vinyl": "DJ & vinyle",
  "controleurs-midi": "Contrôleurs MIDI",
  "midi-controllers": "Contrôleurs MIDI",
  monitoring: "Monitoring",
  enregistreurs: "Enregistreurs",
  recorders: "Enregistreurs",
  "mix-et-mastering": "Mix & mastering",
  "mix-mastering": "Mix & mastering",
  "cours-et-coaching": "Cours & coaching",
  "courses-coaching": "Cours & coaching",
  billetterie: "Billetterie",
  ticketing: "Billetterie",
  "rooms-et-studios": "Rooms & studios",
  "rooms-and-studios": "Rooms & studios",
  autres: "Autres",
  other: "Autres",
};

function toMinorUnits(value: number) {
  return Math.round(value * 100);
}

function categoryCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function deriveShortDescription(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277).trimEnd()}…`;
}

function priceUnit(draft: MarketListingDraft): MarketplacePriceUnit {
  if (draft.pillarId === "rental") return "day";
  if (draft.pillarId === "collective") return "participant";
  if (draft.pillarId === "services") return draft.serviceKind === "ticket" ? "ticket" : "session";
  return "item";
}

export function toMarketplaceListingDraftInput(
  draft: MarketListingDraft,
  mediaFileIds: string[],
): MarketplaceListingDraftInput {
  if (!draft.pillarId) throw new Error("marketplace_listing_pillar_required");

  const amount = draft.pillarId === "rental"
    ? draft.dailyPrice
    : draft.pillarId === "collective"
      ? draft.unlockedUnitPrice
      : draft.price;
  const common = {
    pillar: draft.pillarId,
    sellerKind: draft.sellerKind,
    categoryCode: categoryCode(draft.category),
    title: draft.title,
    shortDescription: draft.shortDescription.trim() || deriveShortDescription(draft.description),
    description: draft.description,
    brand: draft.brand || null,
    model: draft.model || null,
    conditionCode: draft.condition,
    currencyCode: "EUR" as const,
    unitAmountMinor: toMinorUnits(amount),
    priceUnit: priceUnit(draft),
    city: draft.city || null,
    area: draft.area || null,
    pickup: draft.pickup,
    shipping: draft.shipping,
    remote: draft.remote,
    shippingAmountMinor: draft.shipping ? toMinorUnits(draft.shippingPrice) : 0,
    preparationDays: Math.max(0, Math.trunc(draft.preparationDays)),
    mediaFileIds,
  };

  if (draft.pillarId === "new") {
    return {
      ...common,
      pillar: "new",
      stock: Math.max(0, Math.trunc(draft.stock)),
      warrantyMonths: Math.max(0, Math.trunc(draft.warrantyMonths)),
      compareAtAmountMinor: draft.compareAtPrice > 0 ? toMinorUnits(draft.compareAtPrice) : null,
    };
  }
  if (draft.pillarId === "used") {
    return {
      ...common,
      pillar: "used",
      purchaseYear: draft.purchaseYear ? Number(draft.purchaseYear) : null,
      negotiable: draft.negotiable,
      conditionNotes: draft.conditionNotes || null,
    };
  }
  if (draft.pillarId === "rental") {
    return {
      ...common,
      pillar: "rental",
      dailyAmountMinor: toMinorUnits(draft.dailyPrice),
      weekendAmountMinor: draft.weekendPrice > 0 ? toMinorUnits(draft.weekendPrice) : null,
      weeklyAmountMinor: draft.weeklyPrice > 0 ? toMinorUnits(draft.weeklyPrice) : null,
      depositAmountMinor: toMinorUnits(draft.deposit),
      minimumDays: Math.max(1, Math.trunc(draft.minimumDays)),
      availableFrom: draft.availableFrom,
      instantBook: draft.instantBook,
    };
  }
  if (draft.pillarId === "services") {
    return {
      ...common,
      pillar: "services",
      serviceKind: draft.serviceKind,
      serviceFormat: draft.serviceFormat,
      durationLabel: draft.durationLabel,
      deliveryLabel: draft.deliveryLabel || null,
      nextAvailability: draft.nextAvailability,
      eventDate: draft.eventDate || null,
      capacity: draft.eventCapacity > 0 ? Math.trunc(draft.eventCapacity) : null,
      venueName: draft.venueName || null,
      includedEquipment: draft.includedEquipment || null,
    };
  }
  return {
    ...common,
    pillar: "collective",
    retailUnitAmountMinor: toMinorUnits(draft.retailUnitPrice),
    unlockedUnitAmountMinor: toMinorUnits(draft.unlockedUnitPrice),
    targetParticipants: Math.max(2, Math.trunc(draft.collectiveTarget)),
    campaignDays: Math.max(1, Math.trunc(draft.collectiveDays)),
  };
}

function toMajorUnits(value?: number | null) {
  return (value ?? 0) / 100;
}

function toComposerCondition(value?: string | null): MarketCondition {
  if (value === "new" || value === "mint" || value === "excellent" || value === "very-good") {
    return value;
  }
  return "excellent";
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resumedCategory(code: string): MarketCategory {
  return DRAFT_CATEGORY_BY_CODE[code.toLocaleLowerCase("fr-FR").replace(/_/g, "-")]
    ?? "Autres";
}

/**
 * Produces the complete content patch expected by the composer when an owner
 * reopens a server draft. Seller identity and consent checkboxes intentionally
 * stay outside this payload: the current authenticated identity must be
 * re-injected and publication consent must be confirmed again.
 */
export function toMarketListingDraftResumePatch(
  draft: MarketplaceOwnerDraft,
): Partial<MarketListingDraft> {
  const input = draft.input;
  const common: Partial<MarketListingDraft> = {
    pillarId: input.pillar,
    category: resumedCategory(input.categoryCode),
    brand: input.brand ?? "",
    model: input.model ?? "",
    title: input.title,
    shortDescription: input.shortDescription,
    description: input.description,
    condition: toComposerCondition(input.conditionCode),
    price: toMajorUnits(input.unitAmountMinor),
    city: input.city ?? "",
    area: input.area ?? "",
    pickup: input.pickup,
    shipping: input.shipping,
    remote: input.remote,
    shippingPrice: toMajorUnits(input.shippingAmountMinor),
    preparationDays: input.preparationDays ?? 0,
    media: draft.media.map((media) => ({
      id: media.mediaFileId,
      name: media.name,
      kind: media.mimeType.startsWith("video/") ? "video" : "image",
      url: media.sourceUrl ?? "",
      isCover: media.role === "cover",
      sizeLabel: media.sizeBytes < 1024 * 1024
        ? `${Math.max(1, Math.round(media.sizeBytes / 1024))} Ko`
        : `${(media.sizeBytes / (1024 * 1024)).toFixed(1)} Mo`,
      mediaFileId: media.mediaFileId,
    })),
    acceptAccuracy: false,
    acceptTerms: false,
  };

  if (input.pillar === "new") {
    return {
      ...common,
      stock: input.stock,
      warrantyMonths: input.warrantyMonths,
      compareAtPrice: toMajorUnits(input.compareAtAmountMinor),
    };
  }
  if (input.pillar === "used") {
    return {
      ...common,
      purchaseYear: input.purchaseYear ? String(input.purchaseYear) : "",
      negotiable: input.negotiable,
      conditionNotes: input.conditionNotes ?? "",
    };
  }
  if (input.pillar === "rental") {
    return {
      ...common,
      dailyPrice: toMajorUnits(input.dailyAmountMinor),
      weekendPrice: toMajorUnits(input.weekendAmountMinor),
      weeklyPrice: toMajorUnits(input.weeklyAmountMinor),
      deposit: toMajorUnits(input.depositAmountMinor),
      minimumDays: input.minimumDays,
      availableFrom: input.availableFrom,
      instantBook: input.instantBook,
    };
  }
  if (input.pillar === "services") {
    return {
      ...common,
      serviceKind: input.serviceKind,
      serviceFormat: input.serviceFormat,
      durationLabel: input.durationLabel,
      deliveryLabel: input.deliveryLabel ?? "",
      nextAvailability: input.nextAvailability,
      eventDate: toLocalDateTimeInput(input.eventDate),
      eventCapacity: input.capacity ?? 0,
      venueName: input.venueName ?? "",
      includedEquipment: input.includedEquipment ?? "",
    };
  }
  return {
    ...common,
    retailUnitPrice: toMajorUnits(input.retailUnitAmountMinor),
    unlockedUnitPrice: toMajorUnits(input.unlockedUnitAmountMinor),
    collectiveTarget: input.targetParticipants,
    collectiveDays: input.campaignDays,
  };
}
