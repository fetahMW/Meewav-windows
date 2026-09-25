/** Canonical Room gift identities shared by the UI, demo and live adapter. */
export const ROOM_GIFT_LABEL_BY_CODE = {
  "force-card": "Distinction Live",
  "vip-pass": "Pass VIP",
  "private-access": "Cadeau surprise",
  "golden-like": "Supporter d’Or",
  "supporter-bonus": "Bonus supporter",
  "la-certif": "La Certif",
} as const;

export type RoomGiftCode = keyof typeof ROOM_GIFT_LABEL_BY_CODE;

export function roomGiftCodeForLabel(label: string): RoomGiftCode | null {
  const entry = Object.entries(ROOM_GIFT_LABEL_BY_CODE)
    .find(([, canonicalLabel]) => canonicalLabel === label);
  return (entry?.[0] as RoomGiftCode | undefined) ?? null;
}

export function canonicalRoomGift(code: string, label: string) {
  if (!(code in ROOM_GIFT_LABEL_BY_CODE)) return null;
  const canonicalCode = code as RoomGiftCode;
  const canonicalLabel = ROOM_GIFT_LABEL_BY_CODE[canonicalCode];
  return label.trim() === canonicalLabel ? { code: canonicalCode, label: canonicalLabel } : null;
}
