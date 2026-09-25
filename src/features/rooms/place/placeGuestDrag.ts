const GUEST_DRAG_TYPE = "application/x-meewav-room-guest";

export type PlaceGuestDrag = {
  roomId: string;
  participantId: string;
  origin: "backstage" | "onstage";
};

export function writePlaceGuestDrag(transfer: DataTransfer, payload: PlaceGuestDrag) {
  transfer.effectAllowed = "move";
  transfer.setData(GUEST_DRAG_TYPE, JSON.stringify(payload));
}

export function readPlaceGuestDrag(transfer: DataTransfer): PlaceGuestDrag | null {
  if (!Array.from(transfer.types).includes(GUEST_DRAG_TYPE)) return null;
  try {
    const value: unknown = JSON.parse(transfer.getData(GUEST_DRAG_TYPE));
    if (!value || typeof value !== "object") return null;
    const drag = value as Partial<PlaceGuestDrag>;
    if (typeof drag.roomId !== "string" || typeof drag.participantId !== "string"
      || !["backstage", "onstage"].includes(drag.origin ?? "")) return null;
    return drag as PlaceGuestDrag;
  } catch { return null; }
}

export function hasPlaceGuestDrag(transfer: DataTransfer) {
  return Array.from(transfer.types).includes(GUEST_DRAG_TYPE);
}
