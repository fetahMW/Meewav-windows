export type GlobePointType = "artist" | "studio" | "event" | "room" | "user";

export type GlobePoint = {
  id: string;
  type: GlobePointType;
  name: string;
  avatarUrl: string;
  longitude: number;
  latitude: number;
  city?: string;
  role?: string;
  isOnline?: boolean;
  isLive?: boolean;
};

export type GlobeCluster = {
  id: string;
  type: "cluster";
  longitude: number;
  latitude: number;
  count: number;
  avatarPreviewUrls?: string[];
};

export type GlobeItem = GlobePoint | GlobeCluster;

export type GlobeFilters = {
  types: GlobePointType[];
  onlineOnly: boolean;
  liveOnly: boolean;
  search: string;
};

export type GlobeViewportQuery = {
  bbox: [number, number, number, number];
  zoom: number;
  filters: GlobeFilters;
};

export type GlobeApiResponse = {
  items: GlobeItem[];
  source: "server" | "mock";
};

export type GlobeDataState = {
  items: GlobeItem[];
  loading: boolean;
  error: string | null;
  source: "server" | "mock";
};
