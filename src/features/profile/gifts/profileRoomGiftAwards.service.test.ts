import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfileRoomGiftAwardsRepository,
  ProfileRoomGiftAwardsError,
} from "./profileRoomGiftAwards.service";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

const awardRow = {
  id: "00000000-0000-4000-8000-000000000101",
  draw_id_snapshot: "00000000-0000-4000-8000-000000000201",
  room_id_snapshot: "00000000-0000-4000-8000-000000000301",
  gift_code: "vip-pass",
  gift_label: "Pass VIP",
  recipient_profile_id: OWNER_ID,
  recipient_display_name_snapshot: "Aïcha Sol",
  recipient_avatar_url_snapshot: null,
  awarded_by_snapshot: OTHER_ID,
  created_at: "2026-08-14T10:00:00.000Z",
};

const deliveryRow = {
  id: "00000000-0000-4000-8000-000000000102",
  room_id_snapshot: "00000000-0000-4000-8000-000000000302",
  room_title_snapshot: "La Place",
  gift_code: "force-card",
  gift_label: "Carte de Force",
  sender_profile_id_snapshot: OTHER_ID,
  sender_display_name_snapshot: "Naya Oris",
  sender_avatar_url_snapshot: null,
  recipient_profile_id: OWNER_ID,
  recipient_display_name_snapshot: "Aïcha Sol",
  recipient_avatar_url_snapshot: null,
  sent_at: "2026-08-14T11:00:00.000Z",
  created_at: "2026-08-14T10:59:00.000Z",
};

function createClient(options?: {
  userId?: string | null;
  awardsError?: { code?: string; message?: string } | null;
  deliveriesError?: { code?: string; message?: string } | null;
}) {
  const awardOrder = vi.fn().mockResolvedValue({ data: [awardRow], error: options?.awardsError ?? null });
  const awardEq = vi.fn().mockReturnValue({ order: awardOrder });
  const awardSelect = vi.fn().mockReturnValue({ eq: awardEq });
  const deliveryOrder = vi.fn().mockResolvedValue({ data: [deliveryRow], error: options?.deliveriesError ?? null });
  const deliveryStatusEq = vi.fn().mockReturnValue({ order: deliveryOrder });
  const deliveryRecipientEq = vi.fn().mockReturnValue({ eq: deliveryStatusEq });
  const deliverySelect = vi.fn().mockReturnValue({ eq: deliveryRecipientEq });
  const from = vi.fn().mockImplementation((table: string) => ({
    select: table === "room_gift_deliveries_v1" ? deliverySelect : awardSelect,
  }));
  const userId = options?.userId === undefined ? OWNER_ID : options.userId;
  const getUser = vi.fn().mockResolvedValue({
    data: { user: userId ? { id: userId } as User : null },
    error: userId ? null : { message: "missing session" },
  });
  const client = { from, auth: { getUser } } as unknown as SupabaseClient;
  return {
    client,
    from,
    awardSelect,
    awardEq,
    awardOrder,
    deliverySelect,
    deliveryRecipientEq,
    deliveryStatusEq,
    deliveryOrder,
    getUser,
  };
}

describe("profile Room gift awards repository", () => {
  it("loads only awards won by the authenticated profile and keeps Room snapshots", async () => {
    const mocks = createClient();

    const awards = await createProfileRoomGiftAwardsRepository(mocks.client).listMine(OWNER_ID);

    expect(mocks.from).toHaveBeenCalledWith("room_gift_awards_v1");
    expect(mocks.awardEq).toHaveBeenCalledWith("recipient_profile_id", OWNER_ID);
    expect(mocks.awardOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.deliveryRecipientEq).toHaveBeenCalledWith("recipient_profile_id", OWNER_ID);
    expect(mocks.deliveryStatusEq).toHaveBeenCalledWith("status", "sent");
    expect(mocks.deliveryOrder).toHaveBeenCalledWith("sent_at", { ascending: false });
    expect(awards).toHaveLength(2);
    expect(awards[0]).toEqual(expect.objectContaining({
      kind: "direct",
      giftCode: "force-card",
      giftLabel: "Carte de Force",
      roomTitleSnapshot: "La Place",
      senderDisplayNameSnapshot: "Naya Oris",
      awardedAt: deliveryRow.sent_at,
    }));
    expect(awards[1]).toEqual(expect.objectContaining({
      kind: "draw",
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      recipientDisplayNameSnapshot: "Aïcha Sol",
      drawIdSnapshot: awardRow.draw_id_snapshot,
      roomIdSnapshot: awardRow.room_id_snapshot,
    }));
  });

  it("rejects a profile scope different from the authenticated user before querying", async () => {
    const mocks = createClient();

    await expect(createProfileRoomGiftAwardsRepository(mocks.client).listMine(OTHER_ID))
      .rejects.toMatchObject({ code: "owner-mismatch" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a real authenticated session", async () => {
    const mocks = createClient({ userId: null });

    await expect(createProfileRoomGiftAwardsRepository(mocks.client).listMine())
      .rejects.toBeInstanceOf(ProfileRoomGiftAwardsError);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps the Profile usable before the award migration reaches an environment", async () => {
    const mocks = createClient({
      awardsError: { code: "PGRST205", message: "table missing from schema cache" },
      deliveriesError: { code: "PGRST205", message: "table missing from schema cache" },
    });

    await expect(createProfileRoomGiftAwardsRepository(mocks.client).listMine()).resolves.toEqual([]);
  });

  it("keeps direct gifts visible while the draw registry is still unavailable", async () => {
    const mocks = createClient({
      awardsError: { code: "PGRST205", message: "room_gift_awards_v1 missing" },
    });

    await expect(createProfileRoomGiftAwardsRepository(mocks.client).listMine())
      .resolves.toEqual([expect.objectContaining({ kind: "direct", giftLabel: "Carte de Force" })]);
  });

  it("does not hide permission failures as an empty gift registry", async () => {
    const mocks = createClient({
      awardsError: { code: "42501", message: "permission denied for table room_gift_awards_v1" },
    });

    await expect(createProfileRoomGiftAwardsRepository(mocks.client).listMine())
      .rejects.toMatchObject({ code: "awards-load-failed" });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
