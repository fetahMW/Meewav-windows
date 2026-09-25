import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map } from "maplibre-gl";
import { fetchGlobeItems } from "../api/globe.api";
import { DEFAULT_GLOBE_CENTER, DEFAULT_GLOBE_FILTERS } from "../api/globe.mock";
import type { GlobeDataState, GlobeFilters, GlobeViewportQuery } from "../types/globe.types";

function getViewportQuery(map: Map, filters: GlobeFilters): GlobeViewportQuery {
  const bounds = map.getBounds();
  if (!bounds) {
    const [longitude, latitude] = DEFAULT_GLOBE_CENTER;
    return {
      bbox: [longitude - 0.35, latitude - 0.25, longitude + 0.35, latitude + 0.25],
      zoom: map.getZoom(),
      filters,
    };
  }

  return {
    bbox: [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ],
    zoom: map.getZoom(),
    filters,
  };
}

export function useGlobeData(map: Map | null, ready: boolean) {
  const [filters, setFilters] = useState<GlobeFilters>(DEFAULT_GLOBE_FILTERS);
  const [state, setState] = useState<GlobeDataState>({
    items: [],
    loading: false,
    error: null,
    source: "mock",
  });
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const loadVisibleData = useCallback(async () => {
    if (!map) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const response = await fetchGlobeItems(getViewportQuery(map, filters));
      if (requestId !== requestIdRef.current) return;
      setState({
        items: response.items,
        loading: false,
        error: null,
        source: response.source,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Impossible de charger le Globe.",
      }));
    }
  }, [filters, map]);

  useEffect(() => {
    if (!map || !ready) return;

    const scheduleLoad = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void loadVisibleData();
      }, 220);
    };

    void loadVisibleData();
    map.on("moveend", scheduleLoad);
    map.on("zoomend", scheduleLoad);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      map.off("moveend", scheduleLoad);
      map.off("zoomend", scheduleLoad);
    };
  }, [loadVisibleData, map, ready]);

  const updateFilters = useMemo(() => ({
    setSearch: (search: string) => setFilters((current) => ({ ...current, search })),
    toggleOnline: () => setFilters((current) => ({ ...current, onlineOnly: !current.onlineOnly })),
    toggleLive: () => setFilters((current) => ({ ...current, liveOnly: !current.liveOnly })),
    toggleType: (type: GlobeFilters["types"][number]) => {
      setFilters((current) => {
        const hasType = current.types.includes(type);
        return {
          ...current,
          types: hasType ? current.types.filter((item) => item !== type) : [...current.types, type],
        };
      });
    },
  }), []);

  return {
    ...state,
    filters,
    updateFilters,
    refresh: loadVisibleData,
  };
}
