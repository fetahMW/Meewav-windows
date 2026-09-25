import type {
  GlobeApiResponse,
  GlobeFilters,
  GlobeItem,
  GlobePoint,
  GlobeViewportQuery,
} from "../types/globe.types";

const MOCK_POINTS: GlobePoint[] = [
  {
    id: "artist-paris-1",
    type: "artist",
    name: "Maya V.",
    role: "Chanteuse, rappeuse",
    city: "Paris",
    avatarUrl: "/avatar/web/carousel/chanteuse-rappeuse.webp",
    longitude: 2.3522,
    latitude: 48.8566,
    isOnline: true,
    isLive: true,
  },
  {
    id: "studio-paris-1",
    type: "studio",
    name: "Studio Oberkampf",
    role: "Studio",
    city: "Paris",
    avatarUrl: "/avatar/web/carousel/studio-enregistrement.webp",
    longitude: 2.3717,
    latitude: 48.8654,
    isOnline: true,
  },
  {
    id: "artist-montreuil-1",
    type: "artist",
    name: "Nox Bass",
    role: "Bassiste",
    city: "Montreuil",
    avatarUrl: "/avatar/web/carousel/bassiste.webp",
    longitude: 2.4432,
    latitude: 48.8638,
    isOnline: false,
  },
  {
    id: "room-boulogne-1",
    type: "room",
    name: "Room Seine",
    role: "Room",
    city: "Boulogne-Billancourt",
    avatarUrl: "/avatar/web/carousel/dj.webp",
    longitude: 2.2399,
    latitude: 48.8397,
    isOnline: true,
  },
  {
    id: "event-saint-denis-1",
    type: "event",
    name: "Scene Nord",
    role: "Event",
    city: "Saint-Denis",
    avatarUrl: "/avatar/web/carousel/organisateur-evenements.webp",
    longitude: 2.3574,
    latitude: 48.9362,
    isLive: true,
  },
  {
    id: "artist-lyon-1",
    type: "artist",
    name: "Lio Keys",
    role: "Pianiste",
    city: "Lyon",
    avatarUrl: "/avatar/web/carousel/pianiste.webp",
    longitude: 4.8357,
    latitude: 45.764,
    isOnline: true,
  },
];

const MOCK_CLUSTERS: GlobeItem[] = [
  {
    id: "cluster-paris-center",
    type: "cluster",
    longitude: 2.34,
    latitude: 48.86,
    count: 42,
    avatarPreviewUrls: [
      "/avatar/web/carousel/chanteuse-rappeuse.webp",
      "/avatar/web/carousel/dj.webp",
      "/avatar/web/carousel/studio-enregistrement.webp",
    ],
  },
  {
    id: "cluster-lyon",
    type: "cluster",
    longitude: 4.8357,
    latitude: 45.764,
    count: 18,
    avatarPreviewUrls: [
      "/avatar/web/carousel/pianiste.webp",
      "/avatar/web/carousel/guitariste-electrique.webp",
    ],
  },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

function isInsideBbox(item: GlobeItem, bbox: GlobeViewportQuery["bbox"]) {
  const [west, south, east, north] = bbox;
  return item.longitude >= west && item.longitude <= east && item.latitude >= south && item.latitude <= north;
}

function matchesFilters(item: GlobeItem, filters: GlobeFilters) {
  if (item.type === "cluster") return true;
  if (!filters.types.includes(item.type)) return false;
  if (filters.onlineOnly && !item.isOnline) return false;
  if (filters.liveOnly && !item.isLive) return false;

  const query = filters.search.trim().toLowerCase();
  if (!query) return true;

  return [item.name, item.city, item.role, item.type]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function getMockGlobeItems(query: GlobeViewportQuery): GlobeItem[] {
  const hasNarrowZoom = query.zoom >= 8;
  const sourceItems = hasNarrowZoom ? MOCK_POINTS : MOCK_CLUSTERS;
  const visibleItems = sourceItems
    .filter((item) => isInsideBbox(item, query.bbox))
    .filter((item) => matchesFilters(item, query.filters));

  return visibleItems.length > 0 ? visibleItems : sourceItems.filter((item) => matchesFilters(item, query.filters));
}

function normalizeGlobeItem(raw: unknown): GlobeItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<GlobeItem>;

  if (item.type === "cluster") {
    if (!item.id || typeof item.longitude !== "number" || typeof item.latitude !== "number") return null;
    return {
      id: String(item.id),
      type: "cluster",
      longitude: item.longitude,
      latitude: item.latitude,
      count: Number(item.count ?? 0),
      avatarPreviewUrls: Array.isArray(item.avatarPreviewUrls) ? item.avatarPreviewUrls : undefined,
    };
  }

  if (!item.id || !item.type || typeof item.longitude !== "number" || typeof item.latitude !== "number") return null;
  return item as GlobePoint;
}

function buildGlobeUrl(query: GlobeViewportQuery) {
  const url = new URL("/globe/clusters", API_BASE_URL);
  url.searchParams.set("bbox", query.bbox.join(","));
  url.searchParams.set("zoom", String(Math.round(query.zoom * 100) / 100));
  url.searchParams.set("types", query.filters.types.join(","));
  if (query.filters.onlineOnly) url.searchParams.set("online", "true");
  if (query.filters.liveOnly) url.searchParams.set("live", "true");
  if (query.filters.search.trim()) url.searchParams.set("q", query.filters.search.trim());
  return url;
}

export async function fetchGlobeItems(query: GlobeViewportQuery): Promise<GlobeApiResponse> {
  if (!API_BASE_URL) {
    return {
      items: getMockGlobeItems(query),
      source: "mock",
    };
  }

  try {
    const response = await fetch(buildGlobeUrl(query), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Globe API returned ${response.status}`);
    }

    const payload = await response.json();
    const rawItems = Array.isArray(payload) ? payload : payload.items;
    const items = Array.isArray(rawItems)
      ? rawItems.map(normalizeGlobeItem).filter((item): item is GlobeItem => Boolean(item))
      : [];

    return { items, source: "server" };
  } catch (error) {
    console.warn("Falling back to mock globe data.", error);
    return {
      items: getMockGlobeItems(query),
      source: "mock",
    };
  }
}
