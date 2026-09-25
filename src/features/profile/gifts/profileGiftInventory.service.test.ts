import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfileGiftInventoryRepository,
  PROFILE_GIFT_INVENTORY_CODES,
  ProfileGiftInventoryError,
} from "./profileGiftInventory.service";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

function createClient(options?: {
  userId?: string | null;
  data?: unknown;
  rpcError?: { code?: string; message?: string } | null;
}) {
  const userId = options?.userId === undefined ? OWNER_ID : options.userId;
  const getUser = vi.fn().mockResolvedValue({
    data: { user: userId ? { id: userId } as User : null },
    error: userId ? null : { message: "missing session" },
  });
  const rpc = vi.fn().mockResolvedValue({
    data: options?.data ?? [
      {
        gift_code: "vip-pass",
        available_quantity: 3,
        reserved_quantity: 1,
        total_quantity: 4,
        updated_at: "2026-08-15T12:00:00.000Z",
        enforcement_active: true,
      },
      {
        gift_code: "golden-like",
        available_quantity: 1,
        reserved_quantity: 0,
        total_quantity: 1,
        updated_at: null,
        enforcement_active: true,
      },
    ],
    error: options?.rpcError ?? null,
  });
  return {
    client: { auth: { getUser }, rpc } as unknown as SupabaseClient,
    getUser,
    rpc,
  };
}

describe("Profile gift inventory repository", () => {
  it("loads the owner-only RPC and fills absent canonical gifts with zero", async () => {
    const mocks = createClient();

    const inventory = await createProfileGiftInventoryRepository(mocks.client).listMine(OWNER_ID);

    expect(mocks.rpc).toHaveBeenCalledWith("profile_list_my_gift_inventory_v1");
    expect(inventory.map((item) => item.giftCode)).toEqual(PROFILE_GIFT_INVENTORY_CODES);
    expect(inventory.find((item) => item.giftCode === "vip-pass")).toMatchObject({
      availableQuantity: 3,
      reservedQuantity: 1,
      totalQuantity: 4,
      enforcementActive: true,
    });
    expect(inventory.find((item) => item.giftCode === "force-card")).toMatchObject({
      availableQuantity: 0,
      reservedQuantity: 0,
      totalQuantity: 0,
      updatedAt: null,
    });
  });

  it("rejects a foreign Profile scope before calling the inventory RPC", async () => {
    const mocks = createClient();

    await expect(createProfileGiftInventoryRepository(mocks.client).listMine(OTHER_ID))
      .rejects.toMatchObject({ code: "owner-mismatch" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    const mocks = createClient({ userId: null });

    await expect(createProfileGiftInventoryRepository(mocks.client).listMine())
      .rejects.toBeInstanceOf(ProfileGiftInventoryError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces missing or unauthorized infrastructure instead of inventing stock", async () => {
    const mocks = createClient({ rpcError: { code: "PGRST202", message: "function missing" } });

    await expect(createProfileGiftInventoryRepository(mocks.client).listMine())
      .rejects.toMatchObject({ code: "inventory-load-failed" });
  });

  it("rejects unknown gifts, negative quantities and inconsistent totals", async () => {
    for (const data of [
      [{ gift_code: "mystery", available_quantity: 1, reserved_quantity: 0, total_quantity: 1, updated_at: null, enforcement_active: true }],
      [{ gift_code: "vip-pass", available_quantity: -1, reserved_quantity: 0, total_quantity: -1, updated_at: null, enforcement_active: true }],
      [{ gift_code: "vip-pass", available_quantity: 1, reserved_quantity: 1, total_quantity: 1, updated_at: null, enforcement_active: true }],
    ]) {
      const mocks = createClient({ data });
      await expect(createProfileGiftInventoryRepository(mocks.client).listMine())
        .rejects.toMatchObject({ code: "inventory-invalid-response" });
    }
  });
});
