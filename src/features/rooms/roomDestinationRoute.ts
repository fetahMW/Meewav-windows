export type RoomDestinationId = "home" | "loge" | "place" | "wave" | "cage" | "classe" | "scene";

const ROOM_DESTINATION_IDS = new Set<RoomDestinationId>([
  "home",
  "loge",
  "place",
  "wave",
  "cage",
  "classe",
  "scene",
]);

export function getRoomDestinationFromPath(pathname: string): RoomDestinationId {
  const [, root, destination] = pathname.toLowerCase().split("/");
  if (root !== "rooms" && root !== "room") return "place";
  // Collection walls are part of the Rooms home experience. Keeping them on
  // the home destination preserves the Rooms shell while the collection slug
  // is resolved by the home feature itself.
  if (destination === "collections") return "home";
  if (destination && ROOM_DESTINATION_IDS.has(destination as RoomDestinationId)) {
    return destination as RoomDestinationId;
  }
  return "place";
}

export function getRoomDestinationPath(destination: RoomDestinationId) {
  return `/rooms/${destination}`;
}
