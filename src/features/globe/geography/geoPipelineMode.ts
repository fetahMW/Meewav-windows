export const GEO_PIPELINE_MODES = ["legacy", "national", "comparison"] as const;

export type GeoPipelineMode = (typeof GEO_PIPELINE_MODES)[number];

const DEFAULT_GEO_PIPELINE_MODE: GeoPipelineMode = "legacy";

function isGeoPipelineMode(value: unknown): value is GeoPipelineMode {
  return typeof value === "string" && GEO_PIPELINE_MODES.includes(value as GeoPipelineMode);
}

export function resolveGeoPipelineMode({
  configuredMode,
  legacyBooleanFlag,
  search = "",
  allowQueryOverride = false,
}: {
  configuredMode?: string;
  legacyBooleanFlag?: string;
  search?: string;
  allowQueryOverride?: boolean;
}): GeoPipelineMode {
  if (allowQueryOverride && search) {
    const queryMode = new URLSearchParams(search).get("geoPipeline");
    if (isGeoPipelineMode(queryMode)) return queryMode;
  }

  if (isGeoPipelineMode(configuredMode)) return configuredMode;
  if (legacyBooleanFlag === "true") return "national";
  return DEFAULT_GEO_PIPELINE_MODE;
}

export function getGeoPipelineMode(): GeoPipelineMode {
  return resolveGeoPipelineMode({
    configuredMode: import.meta.env.VITE_GEO_PIPELINE_MODE,
    legacyBooleanFlag: import.meta.env.VITE_USE_NATIONAL_GEO_PIPELINE,
    search: typeof window === "undefined" ? "" : window.location.search,
    allowQueryOverride: import.meta.env.DEV,
  });
}

export function usesNationalGeoPipeline(mode: GeoPipelineMode) {
  return mode === "national" || mode === "comparison";
}
