import { ROOMS_HOME_CATALOG, ROOMS_HOME_COLLECTIONS } from "./roomsHome.fixtures";
import type {
  RoomsHomeCollectionDefinition,
  RoomsHomeCollectionSlug,
  RoomsHomeFormatFilter,
  RoomsHomeRoom,
  RoomsHomeRoomType,
} from "./roomsHome.types";

export const ROOMS_HOME_ROOM_TYPE_LABELS: Readonly<Record<RoomsHomeRoomType, string>> = {
  cage: "La Cage",
  wave: "La Wave",
  place: "La Place",
  classe: "La Classe",
  loge: "La Loge",
  scene: "La Scène",
};

export const ROOMS_HOME_ROOM_TYPE_ROUTES: Readonly<Record<RoomsHomeRoomType, string>> = {
  cage: "/rooms/cage",
  wave: "/rooms/wave",
  place: "/rooms/place",
  classe: "/rooms/classe",
  loge: "/rooms/loge",
  scene: "/rooms/scene",
};

const COLLECTION_BY_SLUG = new Map<string, RoomsHomeCollectionDefinition>(
  ROOMS_HOME_COLLECTIONS.map((collection) => [collection.slug, collection]),
);

const PREVIOUS_COLLECTION: Partial<Record<RoomsHomeCollectionSlug, RoomsHomeCollectionSlug>> = {
  "pour-toi": "buzz-maintenant",
  "artistes-en-room": "pour-toi",
  "battles-qui-chauffent": "artistes-en-room",
  "creations-collaborations": "battles-qui-chauffent",
  "apprendre-avec-les-artistes": "creations-collaborations",
  "grands-rendez-vous": "apprendre-avec-les-artistes",
};

function stableIdCompare(left: RoomsHomeRoom, right: RoomsHomeRoom) {
  return left.id.localeCompare(right.id, "fr");
}

function compareDescending(
  primary: (room: RoomsHomeRoom) => number,
  secondary: (room: RoomsHomeRoom) => number,
) {
  return (left: RoomsHomeRoom, right: RoomsHomeRoom) => (
    primary(right) - primary(left)
    || secondary(right) - secondary(left)
    || stableIdCompare(left, right)
  );
}

const BY_BUZZ = compareDescending(
  (room) => room.buzzScore,
  (room) => room.viewerCount,
);

const BY_RECOMMENDATION = compareDescending(
  (room) => room.recommendationScore,
  (room) => room.engagementScore,
);

const BY_FOLLOWED_RELEVANCE = compareDescending(
  (room) => room.recommendationScore + room.buzzScore,
  (room) => room.viewerCount,
);

const BY_BATTLE_HEAT = compareDescending(
  (room) => room.engagementScore * 100_000 + room.viewerCount,
  (room) => room.buzzScore,
);

const BY_CREATION_MOMENTUM = compareDescending(
  (room) => room.engagementScore + room.recommendationScore,
  (room) => room.viewerCount,
);

const BY_LEARNING_RELEVANCE = compareDescending(
  (room) => room.recommendationScore,
  (room) => room.engagementScore,
);

const BY_EVENT_PRESTIGE = compareDescending(
  (room) => room.buzzScore + room.engagementScore,
  (room) => room.viewerCount,
);

function filterByMediaFormat(
  rooms: readonly RoomsHomeRoom[],
  filter: RoomsHomeFormatFilter,
) {
  return filter === "all"
    ? rooms
    : rooms.filter((room) => room.mediaFormat === filter);
}

function selectCollectionCandidates(
  collectionSlug: RoomsHomeCollectionSlug,
  catalog: readonly RoomsHomeRoom[],
) {
  const joinable = catalog.filter((room) => room.isJoinable);

  switch (collectionSlug) {
    case "buzz-maintenant":
      return [...joinable].sort(BY_BUZZ);
    case "pour-toi":
      return [...joinable].sort(BY_RECOMMENDATION);
    case "artistes-en-room":
      return joinable
        .filter((room) => room.isFollowedHost)
        .sort(BY_FOLLOWED_RELEVANCE);
    case "battles-qui-chauffent":
      return joinable
        .filter((room) => room.roomType === "cage")
        .sort(BY_BATTLE_HEAT);
    case "creations-collaborations":
      return joinable
        .filter((room) => room.roomType === "wave" || room.roomType === "place")
        .sort(BY_CREATION_MOMENTUM);
    case "apprendre-avec-les-artistes":
      return joinable
        .filter((room) => room.roomType === "classe")
        .sort(BY_LEARNING_RELEVANCE);
    case "grands-rendez-vous":
      return joinable
        .filter((room) => room.roomType === "loge" || room.roomType === "scene")
        .sort(BY_EVENT_PRESTIGE);
  }
}

export function getRoomsHomeCollectionBySlug(
  collectionSlug: string,
): RoomsHomeCollectionDefinition | undefined {
  return COLLECTION_BY_SLUG.get(collectionSlug);
}

/** Returns the complete, vertically pageable wall behind a "Voir plus" route. */
export function getRoomsHomeCollectionItems(
  collectionSlug: string,
  filter: RoomsHomeFormatFilter = "all",
  catalog: readonly RoomsHomeRoom[] = ROOMS_HOME_CATALOG,
): RoomsHomeRoom[] {
  const collection = getRoomsHomeCollectionBySlug(collectionSlug);
  if (!collection) return [];

  return [...filterByMediaFormat(
    selectCollectionCandidates(collection.slug, catalog),
    filter,
  )];
}

/**
 * Returns at most ten home cards. Consecutive rails first consume candidates
 * absent from the preceding rail, while preserving their collection ranking;
 * a deterministic fallback keeps a rail full when a narrow format filter is on.
 */
export function getRoomsHomeRailItems(
  collectionSlug: string,
  filter: RoomsHomeFormatFilter = "all",
  catalog: readonly RoomsHomeRoom[] = ROOMS_HOME_CATALOG,
): RoomsHomeRoom[] {
  const collection = getRoomsHomeCollectionBySlug(collectionSlug);
  if (!collection) return [];

  const candidates = getRoomsHomeCollectionItems(collection.slug, filter, catalog);
  const previousSlug = PREVIOUS_COLLECTION[collection.slug];
  if (!previousSlug) return candidates.slice(0, collection.homeLimit);

  const previousIds = new Set(
    getRoomsHomeRailItems(previousSlug, filter, catalog).map((room) => room.id),
  );
  const fresh = candidates.filter((room) => !previousIds.has(room.id));
  const repeatedFallback = candidates.filter((room) => previousIds.has(room.id));

  return [...fresh, ...repeatedFallback].slice(0, collection.homeLimit);
}

export function getRoomsHomeRails(
  filter: RoomsHomeFormatFilter = "all",
  catalog: readonly RoomsHomeRoom[] = ROOMS_HOME_CATALOG,
) {
  return ROOMS_HOME_COLLECTIONS.map((collection) => ({
    collection,
    items: getRoomsHomeRailItems(collection.slug, filter, catalog),
  }));
}
