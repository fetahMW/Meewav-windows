import type { PremiumFlyTarget } from "../maplibre/navigation/premiumFly";
import type { FranceSearchResult } from "../maplibre/search-france/franceSearchTypes";

export const FRANCE_SINGLE_PLATE_RUNTIME_INDEX_URL =
  "/map/france-single-plate/2026/runtime-index.json";

const MAX_RUNTIME_INDEX_BYTES = 1_048_576;

export type FranceSinglePlateBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type FranceSinglePlateManifestEntry = {
  readonly zoneId: `commune_${string}`;
  readonly label: string;
  readonly runtimeMode: "single_plate";
  readonly departmentCode: string;
  readonly fragmentUrl: `/map/${string}.geojson`;
  readonly featureId: `commune_${string}`;
  readonly featureIndex: number;
  readonly labelPoint: readonly [longitude: number, latitude: number];
  readonly bbox: FranceSinglePlateBounds;
  readonly camera: {
    readonly center: readonly [longitude: number, latitude: number];
    readonly zoom: number;
    readonly pitch: 60;
    readonly bearing: 0;
    readonly speed: 0.85;
    readonly curve: 1.4;
    readonly bbox: FranceSinglePlateBounds;
  };
  readonly sourceOfficialId: string;
  readonly classificationReason:
    | "single_iris_type_z"
    | "single_iris_code_0000"
    | "single_iris_type_z_and_code_0000";
};

export type FranceSinglePlateRuntimeIndex = {
  readonly schemaVersion: 1;
  readonly kind: "france_single_plate_runtime_index";
  readonly runtimeMode: "single_plate";
  readonly inputFingerprint: string;
  readonly fragmentBaseUrl: `/map/${string}`;
  readonly summary: {
    readonly communeCount: number;
    readonly fragmentCount: number;
    readonly activeCollectionFeatureCount: 1;
    readonly lookup: "commune_code_to_feature_index_o1";
    readonly departmentResolution: "first_two_commune_code_characters";
  };
  readonly communes: Readonly<Record<string, number>>;
};

type FranceSinglePlateRuntimeLocator = {
  readonly communeCode: string;
  readonly departmentCode: string;
  readonly fragmentUrl: `/map/${string}.geojson`;
  readonly featureId: `commune_${string}`;
  readonly featureIndex: number;
};

export type FranceSinglePlateFeatureProperties = {
  readonly zoneId: `commune_${string}`;
  readonly label: string;
  readonly searchLabel: string;
  readonly sourceNameMatchesSearch: boolean;
  readonly communeCode: string;
  readonly districtCode: string;
  readonly territoryType: "commune";
  readonly runtimeMode: "single_plate";
  readonly classificationReason:
    | "single_iris_type_z"
    | "single_iris_code_0000"
    | "single_iris_type_z_and_code_0000";
  readonly colorIndex: number;
  readonly groundColor: string;
  readonly labelLng: number;
  readonly labelLat: number;
  readonly bbox: FranceSinglePlateBounds;
  readonly officialId: string;
  readonly sourceGeometryRepair?: "polygonal_self_union";
};

export type FranceSinglePlateFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FranceSinglePlateFeatureProperties
> & { readonly id: `commune_${string}` };

export type FranceSinglePlateCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FranceSinglePlateFeatureProperties
> & {
  readonly features: readonly [FranceSinglePlateFeature];
};

export type FranceSinglePlateSearchSelection = {
  readonly communeCode: string;
  readonly entry: FranceSinglePlateManifestEntry;
  readonly collection: FranceSinglePlateCollection;
  readonly flyTarget: PremiumFlyTarget;
  readonly eventDetail: {
    readonly zoneId: string;
    readonly displayName: string;
    readonly communeCode: string;
    readonly communeName: string;
    readonly runtimeMode: "single_plate";
    readonly colorIndex: number;
    readonly groundColor: string;
    readonly geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  };
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function assertRuntimeIndex(payload: unknown): asserts payload is FranceSinglePlateRuntimeIndex {
  const manifest = payload as Partial<FranceSinglePlateRuntimeIndex> | null;
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.kind !== "france_single_plate_runtime_index"
    || manifest.runtimeMode !== "single_plate"
    || typeof manifest.fragmentBaseUrl !== "string"
    || !manifest.communes
    || typeof manifest.communes !== "object"
  ) {
    throw new Error("France single-plate runtime index has an invalid format");
  }
}

function assertDepartmentCollection(payload: unknown, entry: FranceSinglePlateRuntimeLocator) {
  const collection = payload as (GeoJSON.FeatureCollection & {
    metadata?: {
      kind?: unknown;
      runtimeMode?: unknown;
      departmentCode?: unknown;
      featureCount?: unknown;
    };
  }) | null;
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${entry.fragmentUrl} is not a GeoJSON FeatureCollection`);
  }
  if (
    collection.metadata?.kind !== "france_single_plate_department_fragment"
    || collection.metadata.runtimeMode !== "single_plate"
    || collection.metadata.departmentCode !== entry.departmentCode
    || Number(collection.metadata.featureCount) !== collection.features.length
  ) {
    throw new Error(`${entry.fragmentUrl} violates the single-plate fragment metadata contract`);
  }
  return collection;
}

function parseDirectCommuneCode(result: Pick<FranceSearchResult, "id" | "type">) {
  if (result.type !== "city" && result.type !== "commune") return null;
  return result.id.match(/^commune-([0-9A-Z]{5})$/iu)?.[1]?.toUpperCase() ?? null;
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function computeFranceSinglePlateRuntimeCamera(bbox: FranceSinglePlateBounds) {
  const [west, south, east, north] = bbox;
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new Error("Single-plate feature has an invalid camera bbox");
  }
  const center = [(west + east) / 2, (south + north) / 2] as const;
  const latitudeScale = Math.max(0.15, Math.cos(center[1] * Math.PI / 180));
  const geographicSpan = Math.max((east - west) * latitudeScale, north - south, 0.00008);
  // Keep the full extent as the source of truth, then target the close local
  // occupancy validated on the real Globe viewport: the selected commune
  // should fill most of the screen rather than remain an overview plaque.
  // The logarithmic span still makes the result proportional for every city.
  const rawZoom = 9.4 - Math.log2(geographicSpan);
  const steppedZoom = Math.round(rawZoom / 0.05) * 0.05;
  return {
    center: [round(center[0]), round(center[1])] as const,
    zoom: round(Math.max(9.7, Math.min(16.4, steppedZoom)), 2),
    pitch: 60 as const,
    // A bbox has no reliable principal axis. Keep north stable rather than
    // inventing a fragile orientation that could rotate between datasets.
    bearing: 0 as const,
    speed: 0.85 as const,
    curve: 1.4 as const,
    bbox,
  };
}

export class FranceSinglePlateRegistry {
  private readonly runtimeIndexUrl: string;
  private readonly fetcher: FetchLike;
  private runtimeIndexPromise: Promise<FranceSinglePlateRuntimeIndex> | null = null;
  private fragmentCache: {
    url: string;
    promise: Promise<GeoJSON.FeatureCollection>;
  } | null = null;

  constructor({
    runtimeIndexUrl = FRANCE_SINGLE_PLATE_RUNTIME_INDEX_URL,
    fetcher = globalThis.fetch.bind(globalThis),
  }: {
    runtimeIndexUrl?: string;
    fetcher?: FetchLike;
  } = {}) {
    this.runtimeIndexUrl = runtimeIndexUrl;
    this.fetcher = fetcher;
  }

  loadRuntimeIndex() {
    if (this.runtimeIndexPromise) return this.runtimeIndexPromise;
    this.runtimeIndexPromise = this.fetcher(this.runtimeIndexUrl, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`France single-plate runtime index unavailable: HTTP ${response.status}`);
        }
        const contents = await response.text();
        if (new TextEncoder().encode(contents).byteLength > MAX_RUNTIME_INDEX_BYTES) {
          throw new Error("France single-plate runtime index exceeds the 1 MiB startup budget");
        }
        const payload: unknown = JSON.parse(contents);
        assertRuntimeIndex(payload);
        if (
          Object.keys(payload.communes).length !== payload.summary.communeCount
          || payload.summary.activeCollectionFeatureCount !== 1
        ) {
          throw new Error("France single-plate runtime index coverage is inconsistent");
        }
        return payload;
      })
      .catch((error: unknown) => {
        this.runtimeIndexPromise = null;
        throw error;
      });
    return this.runtimeIndexPromise;
  }

  async getEntry(communeCode: string) {
    const code = String(communeCode).trim().toUpperCase();
    if (!/^[0-9A-Z]{5}$/u.test(code)) return null;
    const runtimeIndex = await this.loadRuntimeIndex();
    const featureIndex = runtimeIndex.communes[code];
    if (!Number.isInteger(featureIndex) || featureIndex < 0) return null;
    const departmentCode = code.slice(0, 2);
    return {
      communeCode: code,
      departmentCode,
      fragmentUrl: `${runtimeIndex.fragmentBaseUrl}/${departmentCode}.geojson`,
      featureId: `commune_${code}`,
      featureIndex,
    } as FranceSinglePlateRuntimeLocator;
  }

  private loadFragment(entry: FranceSinglePlateRuntimeLocator) {
    if (this.fragmentCache?.url === entry.fragmentUrl) return this.fragmentCache.promise;
    const promise = this.fetcher(entry.fragmentUrl, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${entry.fragmentUrl} unavailable: HTTP ${response.status}`);
        }
        return assertDepartmentCollection(await response.json(), entry);
      })
      .catch((error: unknown) => {
        if (this.fragmentCache?.promise === promise) this.fragmentCache = null;
        throw error;
      });
    // A single-entry cache bounds retained geometry to one department. The
    // active MapLibre collection built below still contains exactly one plate.
    this.fragmentCache = { url: entry.fragmentUrl, promise };
    return promise;
  }

  async loadActiveCollection(communeCode: string): Promise<FranceSinglePlateCollection | null> {
    const code = String(communeCode).trim().toUpperCase();
    const entry = await this.getEntry(code);
    if (!entry) return null;
    const fragment = await this.loadFragment(entry);
    const pointedFeature = fragment.features[entry.featureIndex];
    const feature = pointedFeature?.id === entry.featureId
      ? pointedFeature
      : fragment.features.find((candidate) => candidate.id === entry.featureId);
    const properties = feature?.properties as Partial<FranceSinglePlateFeatureProperties> | undefined;
    if (
      !feature
      || (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon")
      || feature.id !== `commune_${code}`
      || properties?.zoneId !== feature.id
      || properties.communeCode !== code
      || properties.districtCode !== code
      || properties.territoryType !== "commune"
      || properties.runtimeMode !== "single_plate"
      || ![
        "single_iris_type_z",
        "single_iris_code_0000",
        "single_iris_type_z_and_code_0000",
      ].includes(String(properties.classificationReason))
    ) {
      throw new Error(`${code} single-plate fragment pointer violates the runtime contract`);
    }
    return {
      type: "FeatureCollection",
      features: [feature as FranceSinglePlateFeature],
    } as FranceSinglePlateCollection;
  }
}

const defaultRegistry = new FranceSinglePlateRegistry();
let defaultSinglePlateCommuneIdsPromise: Promise<ReadonlySet<string>> | null = null;

export function loadFranceSinglePlateCommuneIds(): Promise<ReadonlySet<string>> {
  if (defaultSinglePlateCommuneIdsPromise) return defaultSinglePlateCommuneIdsPromise;
  defaultSinglePlateCommuneIdsPromise = defaultRegistry.loadRuntimeIndex()
    .then((runtimeIndex) => new Set(
      Object.keys(runtimeIndex.communes).map((communeCode) => `commune-${communeCode}`),
    ))
    .catch((error: unknown) => {
      defaultSinglePlateCommuneIdsPromise = null;
      throw error;
    });
  return defaultSinglePlateCommuneIdsPromise;
}

export async function resolveFranceSinglePlateSearchSelection(
  result: FranceSearchResult,
  registry: FranceSinglePlateRegistry = defaultRegistry,
): Promise<FranceSinglePlateSearchSelection | null> {
  const communeCode = parseDirectCommuneCode(result);
  if (!communeCode) return null;
  const [locator, collection] = await Promise.all([
    registry.getEntry(communeCode),
    registry.loadActiveCollection(communeCode),
  ]);
  if (!locator || !collection) return null;
  const [feature] = collection.features;
  const properties = feature.properties;
  const bbox = properties.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error(`${communeCode} single-plate feature has no complete bbox`);
  }
  const camera = computeFranceSinglePlateRuntimeCamera(bbox);
  const entry: FranceSinglePlateManifestEntry = {
    zoneId: locator.featureId,
    label: properties.label,
    runtimeMode: "single_plate",
    departmentCode: locator.departmentCode,
    fragmentUrl: locator.fragmentUrl,
    featureId: locator.featureId,
    featureIndex: locator.featureIndex,
    labelPoint: [properties.labelLng, properties.labelLat],
    bbox,
    camera,
    sourceOfficialId: properties.officialId,
    classificationReason: properties.classificationReason,
  };
  return {
    communeCode,
    entry,
    collection,
    flyTarget: {
      name: entry.zoneId,
      center: [...entry.camera.center],
      zoom: entry.camera.zoom,
      pitch: entry.camera.pitch,
      bearing: entry.camera.bearing,
      speed: entry.camera.speed,
      curve: entry.camera.curve,
    },
    eventDetail: {
      zoneId: entry.zoneId,
      displayName: entry.label,
      communeCode,
      communeName: entry.label,
      runtimeMode: "single_plate",
      colorIndex: feature.properties.colorIndex,
      groundColor: feature.properties.groundColor,
      geometry: feature.geometry,
    },
  };
}

export function publishFranceSinglePlateSearchSelection(
  selection: FranceSinglePlateSearchSelection,
) {
  window.dispatchEvent(new CustomEvent("meewav:national-zone-selected", {
    detail: selection.eventDetail,
  }));
}
