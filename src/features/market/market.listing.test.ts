import { describe, expect, it } from "vitest";
import type { MarketListingDraft } from "./MarketListingComposer";
import {
  toMarketplaceListingDraftInput,
  toMarketListingDraftResumePatch,
} from "./market.listing";
import type { MarketplaceOwnerDraft } from "./market.types";

const MEDIA_ID = "10000000-0000-4000-8000-000000000001";

function draft(pillarId: MarketListingDraft["pillarId"]): MarketListingDraft {
  return {
    pillarId,
    serviceKind: "production",
    category: "Mix & mastering",
    brand: "Meewav",
    model: "Studio",
    title: "Une offre réellement documentée",
    shortDescription: "Une accroche indépendante.",
    description: "Une description suffisamment longue pour traverser tout le parcours de validation sans raccourci.",
    condition: "excellent",
    conditionNotes: "Une trace légère.",
    purchaseYear: "2024",
    negotiable: true,
    price: 249,
    compareAtPrice: 299,
    stock: 3,
    warrantyMonths: 24,
    dailyPrice: 42,
    weekendPrice: 98,
    weeklyPrice: 219,
    deposit: 800,
    minimumDays: 2,
    availableFrom: "2026-08-01",
    instantBook: true,
    serviceFormat: "À distance",
    durationLabel: "1 morceau",
    deliveryLabel: "5 jours",
    nextAvailability: "Cette semaine",
    eventDate: "2026-08-01T20:00",
    eventCapacity: 40,
    venueName: "Room Meewav",
    includedEquipment: "Console et micros",
    retailUnitPrice: 599,
    unlockedUnitPrice: 499,
    collectiveTarget: 40,
    collectiveJoined: 0,
    collectiveDays: 7,
    city: "Paris",
    area: "11e",
    pickup: true,
    shipping: false,
    remote: false,
    shippingPrice: 14.9,
    preparationDays: 2,
    media: [],
    sellerName: "Fetah",
    sellerKind: "artist",
    sellerMonogram: "FT",
    responseTime: "Sous 2 h",
    sellerBio: "Fondateur",
    acceptAccuracy: true,
    acceptTerms: true,
  };
}

describe("market listing adapter", () => {
  it.each([
    ["new", "item"],
    ["used", "item"],
    ["rental", "day"],
    ["services", "session"],
    ["collective", "participant"],
  ] as const)("convertit le parcours %s sans autorité client sur le statut", (pillar, unit) => {
    const result = toMarketplaceListingDraftInput(draft(pillar), []);
    expect(result.pillar).toBe(pillar);
    expect(result.priceUnit).toBe(unit);
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("sellerProfileId");
  });

  it("convertit toujours les euros en centimes entiers", () => {
    const source = draft("new");
    source.shipping = true;
    const result = toMarketplaceListingDraftInput(source, []);
    expect(result.unitAmountMinor).toBe(24_900);
    expect(result.shippingAmountMinor).toBe(1_490);
  });

  it("ne transmet aucun frais quand l’expédition est désactivée", () => {
    const source = draft("used");
    source.shipping = false;
    source.shippingPrice = 14.9;
    expect(toMarketplaceListingDraftInput(source, []).shippingAmountMinor).toBe(0);
  });

  it("préserve séparément l’accroche publique et les traces d’usage", () => {
    const source = draft("used");
    source.shortDescription = "Interface compacte pour studio nomade.";
    source.conditionNotes = "Une rayure sous le châssis, sans impact audio.";

    const input = toMarketplaceListingDraftInput(source, []);
    expect(input.shortDescription).toBe("Interface compacte pour studio nomade.");
    expect(input).toMatchObject({
      conditionNotes: "Une rayure sous le châssis, sans impact audio.",
    });
  });

  it("préserve les champs métier de chaque pilier jusqu’au contrat Supabase", () => {
    expect(toMarketplaceListingDraftInput(draft("new"), [])).toMatchObject({
      pillar: "new",
      stock: 3,
      warrantyMonths: 24,
      preparationDays: 2,
    });
    expect(toMarketplaceListingDraftInput(draft("used"), [])).toMatchObject({
      pillar: "used",
      purchaseYear: 2024,
      negotiable: true,
      conditionNotes: "Une trace légère.",
      preparationDays: 2,
    });
    expect(toMarketplaceListingDraftInput(draft("rental"), [])).toMatchObject({
      pillar: "rental",
      minimumDays: 2,
      availableFrom: "2026-08-01",
      instantBook: true,
      preparationDays: 2,
    });

    const ticket = draft("services");
    ticket.serviceKind = "ticket";
    expect(toMarketplaceListingDraftInput(ticket, [])).toMatchObject({
      pillar: "services",
      priceUnit: "ticket",
      eventDate: "2026-08-01T20:00",
      capacity: 40,
      venueName: "Room Meewav",
      includedEquipment: "Console et micros",
      preparationDays: 2,
    });
    expect(toMarketplaceListingDraftInput(draft("collective"), [])).toMatchObject({
      pillar: "collective",
      targetParticipants: 40,
      campaignDays: 7,
      preparationDays: 2,
    });
  });

  it.each(["new", "used", "rental", "services", "collective"] as const)(
    "reconstruit le parcours Composer %s sans perdre ses prix, termes ni média",
    (pillar) => {
      const source = draft(pillar);
      if (pillar === "services") source.serviceKind = "ticket";
      source.shipping = true;
      const input = toMarketplaceListingDraftInput(source, [MEDIA_ID]);
      const ownerDraft: MarketplaceOwnerDraft = {
        listingId: "10000000-0000-4000-8000-000000000002",
        status: "draft",
        version: 4,
        input,
        media: [{
          mediaFileId: MEDIA_ID,
          role: "cover",
          position: 0,
          name: "cover.webp",
          mimeType: "image/webp",
          sizeBytes: 524_288,
          storageBucket: "profile-media",
          storagePath: `${MEDIA_ID}/market/cover.webp`,
          sourceUrl: "https://signed.example.test/cover.webp",
        }],
        createdAt: "2026-07-19T08:00:00.000Z",
        updatedAt: "2026-07-19T09:00:00.000Z",
      };

      const resumed = toMarketListingDraftResumePatch(ownerDraft);
      expect(resumed).toMatchObject({
        pillarId: pillar,
        title: source.title,
        shortDescription: source.shortDescription,
        description: source.description,
        shippingPrice: source.shippingPrice,
        preparationDays: source.preparationDays,
        media: [expect.objectContaining({
          mediaFileId: MEDIA_ID,
          isCover: true,
          url: "https://signed.example.test/cover.webp",
        })],
        acceptAccuracy: false,
        acceptTerms: false,
      });
      if (pillar === "new") {
        expect(resumed).toMatchObject({
          stock: source.stock,
          warrantyMonths: source.warrantyMonths,
          compareAtPrice: source.compareAtPrice,
        });
      } else if (pillar === "used") {
        expect(resumed).toMatchObject({
          purchaseYear: source.purchaseYear,
          negotiable: source.negotiable,
          conditionNotes: source.conditionNotes,
        });
      } else if (pillar === "rental") {
        expect(resumed).toMatchObject({
          dailyPrice: source.dailyPrice,
          weekendPrice: source.weekendPrice,
          weeklyPrice: source.weeklyPrice,
          deposit: source.deposit,
          minimumDays: source.minimumDays,
        });
      } else if (pillar === "services") {
        expect(resumed).toMatchObject({
          serviceKind: "ticket",
          eventCapacity: source.eventCapacity,
          venueName: source.venueName,
          includedEquipment: source.includedEquipment,
        });
      } else {
        expect(resumed).toMatchObject({
          retailUnitPrice: source.retailUnitPrice,
          unlockedUnitPrice: source.unlockedUnitPrice,
          collectiveTarget: source.collectiveTarget,
          collectiveDays: source.collectiveDays,
        });
      }
    },
  );
});
