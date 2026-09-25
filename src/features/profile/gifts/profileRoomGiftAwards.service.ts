import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

type AwardRow = {
  id: string;
  draw_id_snapshot: string;
  room_id_snapshot: string;
  gift_code: string;
  gift_label: string;
  recipient_profile_id: string;
  recipient_display_name_snapshot: string;
  recipient_avatar_url_snapshot: string | null;
  awarded_by_snapshot: string;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  room_id_snapshot: string;
  room_title_snapshot: string;
  gift_code: string;
  gift_label: string;
  sender_profile_id_snapshot: string;
  sender_display_name_snapshot: string;
  sender_avatar_url_snapshot: string | null;
  recipient_profile_id: string;
  recipient_display_name_snapshot: string;
  recipient_avatar_url_snapshot: string | null;
  sent_at: string | null;
  created_at: string;
};

export type ProfileRoomGiftAward = {
  id: string;
  kind: "draw" | "direct";
  drawIdSnapshot: string | null;
  roomIdSnapshot: string;
  roomTitleSnapshot: string | null;
  giftCode: string;
  giftLabel: string;
  recipientDisplayNameSnapshot: string;
  recipientAvatarUrlSnapshot: string | null;
  awardedBySnapshot: string;
  senderDisplayNameSnapshot: string | null;
  senderAvatarUrlSnapshot: string | null;
  awardedAt: string;
};

export type ProfileRoomGiftAwardsErrorCode =
  | "not-authenticated"
  | "owner-mismatch"
  | "awards-load-failed";

export class ProfileRoomGiftAwardsError extends Error {
  readonly code: ProfileRoomGiftAwardsErrorCode;

  constructor(code: ProfileRoomGiftAwardsErrorCode, message: string) {
    super(message);
    this.name = "ProfileRoomGiftAwardsError";
    this.code = code;
  }
}

const AWARD_SELECT = [
  "id",
  "draw_id_snapshot",
  "room_id_snapshot",
  "gift_code",
  "gift_label",
  "recipient_profile_id",
  "recipient_display_name_snapshot",
  "recipient_avatar_url_snapshot",
  "awarded_by_snapshot",
  "created_at",
].join(",");

const DELIVERY_SELECT = [
  "id",
  "room_id_snapshot",
  "room_title_snapshot",
  "gift_code",
  "gift_label",
  "sender_profile_id_snapshot",
  "sender_display_name_snapshot",
  "sender_avatar_url_snapshot",
  "recipient_profile_id",
  "recipient_display_name_snapshot",
  "recipient_avatar_url_snapshot",
  "sent_at",
  "created_at",
].join(",");

function isMissingAwardsInfrastructure(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /relation .* does not exist|could not find (?:the )?table .* in the schema cache|not found in the schema cache/i
    .test(error.message ?? "");
}

function mapAward(row: AwardRow): ProfileRoomGiftAward {
  return {
    id: row.id,
    kind: "draw",
    drawIdSnapshot: row.draw_id_snapshot,
    roomIdSnapshot: row.room_id_snapshot,
    roomTitleSnapshot: null,
    giftCode: row.gift_code,
    giftLabel: row.gift_label,
    recipientDisplayNameSnapshot: row.recipient_display_name_snapshot,
    recipientAvatarUrlSnapshot: row.recipient_avatar_url_snapshot,
    awardedBySnapshot: row.awarded_by_snapshot,
    senderDisplayNameSnapshot: null,
    senderAvatarUrlSnapshot: null,
    awardedAt: row.created_at,
  };
}

function mapDelivery(row: DeliveryRow): ProfileRoomGiftAward {
  return {
    id: row.id,
    kind: "direct",
    drawIdSnapshot: null,
    roomIdSnapshot: row.room_id_snapshot,
    roomTitleSnapshot: row.room_title_snapshot,
    giftCode: row.gift_code,
    giftLabel: row.gift_label,
    recipientDisplayNameSnapshot: row.recipient_display_name_snapshot,
    recipientAvatarUrlSnapshot: row.recipient_avatar_url_snapshot,
    awardedBySnapshot: row.sender_profile_id_snapshot,
    senderDisplayNameSnapshot: row.sender_display_name_snapshot,
    senderAvatarUrlSnapshot: row.sender_avatar_url_snapshot,
    awardedAt: row.sent_at ?? row.created_at,
  };
}

export function createProfileRoomGiftAwardsRepository(client: SupabaseClient = supabase) {
  return {
    async listMine(expectedOwnerUserId?: string): Promise<ProfileRoomGiftAward[]> {
      const { data: authData, error: authError } = await client.auth.getUser();
      const user = authData.user;
      if (authError || !user) {
        throw new ProfileRoomGiftAwardsError(
          "not-authenticated",
          "Ta session a expiré. Reconnecte-toi pour retrouver tes cadeaux gagnés.",
        );
      }
      if (expectedOwnerUserId && expectedOwnerUserId !== user.id) {
        throw new ProfileRoomGiftAwardsError(
          "owner-mismatch",
          "Cette session ne peut pas lire les cadeaux gagnés de ce profil.",
        );
      }

      const awardsResult = await client
        .from("room_gift_awards_v1")
        .select(AWARD_SELECT)
        .eq("recipient_profile_id", user.id)
        .order("created_at", { ascending: false });

      if (awardsResult.error && !isMissingAwardsInfrastructure(awardsResult.error)) {
        throw new ProfileRoomGiftAwardsError(
          "awards-load-failed",
          "Les cadeaux gagnés en Room n’ont pas pu être chargés.",
        );
      }

      const deliveriesResult = await client
        .from("room_gift_deliveries_v1")
        .select(DELIVERY_SELECT)
        .eq("recipient_profile_id", user.id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false });

      if (deliveriesResult.error && !isMissingAwardsInfrastructure(deliveriesResult.error)) {
        throw new ProfileRoomGiftAwardsError(
          "awards-load-failed",
          "Les cadeaux reçus en Room n’ont pas pu être chargés.",
        );
      }

      const awards = awardsResult.error
        ? []
        : ((awardsResult.data ?? []) as unknown as AwardRow[]).map(mapAward);
      const deliveries = deliveriesResult.error
        ? []
        : ((deliveriesResult.data ?? []) as unknown as DeliveryRow[]).map(mapDelivery);

      return [...awards, ...deliveries].sort((left, right) => (
        new Date(right.awardedAt).getTime() - new Date(left.awardedAt).getTime()
      ));
    },
  };
}

export const profileRoomGiftAwardsRepository = createProfileRoomGiftAwardsRepository();
