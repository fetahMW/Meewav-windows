import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type { RoomGiftCode } from "../../rooms/place/placeGiftCatalog";

export const PROFILE_GIFT_INVENTORY_CODES: readonly RoomGiftCode[] = [
  "force-card",
  "vip-pass",
  "private-access",
  "golden-like",
  "supporter-bonus",
  "la-certif",
] as const;

type InventoryRpcRow = {
  gift_code: unknown;
  available_quantity: unknown;
  reserved_quantity: unknown;
  total_quantity: unknown;
  updated_at: unknown;
  enforcement_active: unknown;
};

export type ProfileGiftInventoryItem = {
  giftCode: RoomGiftCode;
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  updatedAt: string | null;
  enforcementActive: boolean;
};

export type ProfileGiftInventoryErrorCode =
  | "not-authenticated"
  | "owner-mismatch"
  | "inventory-load-failed"
  | "inventory-invalid-response";

export class ProfileGiftInventoryError extends Error {
  readonly code: ProfileGiftInventoryErrorCode;

  constructor(code: ProfileGiftInventoryErrorCode, message: string) {
    super(message);
    this.name = "ProfileGiftInventoryError";
    this.code = code;
  }
}

function isRoomGiftCode(value: unknown): value is RoomGiftCode {
  return typeof value === "string"
    && (PROFILE_GIFT_INVENTORY_CODES as readonly string[]).includes(value);
}

function safeQuantity(value: unknown) {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 1_000_000
    ? value
    : null;
}

function mapInventoryRows(data: unknown): ProfileGiftInventoryItem[] {
  if (!Array.isArray(data)) {
    throw new ProfileGiftInventoryError(
      "inventory-invalid-response",
      "Le stock de cadeaux a renvoyé une réponse invalide.",
    );
  }

  const byCode = new Map<RoomGiftCode, ProfileGiftInventoryItem>();
  let enforcementActive: boolean | null = null;
  for (const rawRow of data) {
    if (!rawRow || typeof rawRow !== "object") {
      throw new ProfileGiftInventoryError(
        "inventory-invalid-response",
        "Une ligne du stock de cadeaux est invalide.",
      );
    }
    const row = rawRow as InventoryRpcRow;
    const availableQuantity = safeQuantity(row.available_quantity);
    const reservedQuantity = safeQuantity(row.reserved_quantity);
    const totalQuantity = safeQuantity(row.total_quantity);
    if (
      !isRoomGiftCode(row.gift_code)
      || availableQuantity === null
      || reservedQuantity === null
      || totalQuantity === null
      || totalQuantity !== availableQuantity + reservedQuantity
      || (row.updated_at !== null && typeof row.updated_at !== "string")
      || typeof row.enforcement_active !== "boolean"
      || (enforcementActive !== null && enforcementActive !== row.enforcement_active)
      || byCode.has(row.gift_code)
    ) {
      throw new ProfileGiftInventoryError(
        "inventory-invalid-response",
        "Le stock de cadeaux contient des données incohérentes.",
      );
    }
    enforcementActive = row.enforcement_active;
    byCode.set(row.gift_code, {
      giftCode: row.gift_code,
      availableQuantity,
      reservedQuantity,
      totalQuantity,
      updatedAt: row.updated_at,
      enforcementActive,
    });
  }

  if (enforcementActive === null) {
    throw new ProfileGiftInventoryError(
      "inventory-invalid-response",
      "Le stock de cadeaux ne précise pas son état d’activation.",
    );
  }

  return PROFILE_GIFT_INVENTORY_CODES.map((giftCode) => byCode.get(giftCode) ?? {
    giftCode,
    availableQuantity: 0,
    reservedQuantity: 0,
    totalQuantity: 0,
    updatedAt: null,
    enforcementActive,
  });
}

export function createProfileGiftInventoryRepository(client: SupabaseClient = supabase) {
  return {
    async listMine(expectedOwnerUserId?: string): Promise<ProfileGiftInventoryItem[]> {
      const { data: authData, error: authError } = await client.auth.getUser();
      const user = authData.user as User | null;
      if (authError || !user) {
        throw new ProfileGiftInventoryError(
          "not-authenticated",
          "Ta session a expiré. Reconnecte-toi pour consulter tes cadeaux disponibles.",
        );
      }
      if (expectedOwnerUserId && expectedOwnerUserId !== user.id) {
        throw new ProfileGiftInventoryError(
          "owner-mismatch",
          "Cette session ne peut pas consulter le stock de cadeaux de ce profil.",
        );
      }

      const { data, error } = await client.rpc("profile_list_my_gift_inventory_v1");
      if (error) {
        throw new ProfileGiftInventoryError(
          "inventory-load-failed",
          "Tes cadeaux disponibles n’ont pas pu être chargés.",
        );
      }
      return mapInventoryRows(data);
    },
  };
}

export const profileGiftInventoryRepository = createProfileGiftInventoryRepository();
