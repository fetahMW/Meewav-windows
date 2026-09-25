import type { Map as MapLibreMap } from "maplibre-gl";
import { feature } from "topojson-client";
import type { GeometryObject, Topology } from "topojson-specification";

export type LandRing = readonly (readonly [number, number])[];

type GeoGeometry = {
  type: string;
  coordinates?: unknown;
  geometries?: GeoGeometry[];
};

function collectRings(geometry: GeoGeometry | null | undefined, output: LandRing[]): void {
  if (!geometry) return;

  if (geometry.type === "Polygon") {
    const polygon = geometry.coordinates as LandRing[];
    output.push(...polygon);
    return;
  }

  if (geometry.type === "MultiPolygon") {
    const multiPolygon = geometry.coordinates as LandRing[][];
    for (const polygon of multiPolygon) output.push(...polygon);
    return;
  }

  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) collectRings(child, output);
  }
}

export async function loadPremiumLandRings(signal: AbortSignal): Promise<LandRing[]> {
  const response = await fetch("/geo/land-110m.json", { signal });
  if (!response.ok) throw new Error(`Unable to load globe land mask (${response.status})`);

  const topology = (await response.json()) as Topology<{ land: GeometryObject }>;
  const geo = feature(topology, topology.objects.land) as unknown as {
    type: "Feature" | "FeatureCollection";
    geometry?: GeoGeometry;
    features?: { geometry: GeoGeometry }[];
  };
  const rings: LandRing[] = [];

  if (geo.type === "FeatureCollection") {
    for (const item of geo.features ?? []) collectRings(item.geometry, rings);
  } else {
    collectRings(geo.geometry, rings);
  }

  return rings.filter((ring) => ring.length >= 3);
}

export function buildProjectedLandPath(
  map: MapLibreMap,
  rings: readonly LandRing[],
): string {
  const parts: string[] = [];

  for (const ring of rings) {
    const segment: string[] = [];

    for (const coordinate of ring) {
      const [longitude, latitude] = coordinate;
      const point = map.project([longitude, latitude]);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

      segment.push(`${segment.length === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    }

    if (segment.length >= 3) parts.push(`${segment.join(" ")} Z`);
  }

  return parts.join(" ");
}
