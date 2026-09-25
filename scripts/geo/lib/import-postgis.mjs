import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertExistingGroup } from "./migrate-existing.mjs";
import { validateDataset } from "./validate.mjs";

function safeSegment(value, name) {
  const normalized = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error(`${name} must contain only letters, digits, dots, underscores or dashes`);
  }
  return normalized;
}

function sqlPayloadLiteral(payload) {
  const json = JSON.stringify(payload);
  let delimiter = "$meewav_geo$";
  let suffix = 0;
  while (json.includes(delimiter)) {
    suffix += 1;
    delimiter = `$meewav_geo_${suffix}$`;
  }
  return `${delimiter}${json}${delimiter}`;
}

export async function loadCanonicalDataset(rootDirectory, options = {}) {
  const scope = safeSegment(options.scope ?? "all", "scope");
  let dataset;
  let inputPath = null;
  if (options.inputPath) {
    inputPath = path.resolve(rootDirectory, options.inputPath);
    dataset = JSON.parse(await readFile(inputPath, "utf8"));
  } else {
    const conversion = await convertExistingGroup(rootDirectory, scope, { version: options.version });
    dataset = conversion.dataset;
  }
  if (options.version && dataset.version !== options.version) {
    dataset = { ...dataset, version: safeSegment(options.version, "version") };
  }
  if (options.inputPath && options.scope && dataset.scope !== scope) {
    throw new Error(`Canonical dataset scope ${dataset.scope} does not match requested scope ${scope}`);
  }
  if (options.vintage) {
    const mismatches = (dataset.sources ?? []).filter((source) => String(source.vintage) !== String(options.vintage));
    if (mismatches.length > 0) {
      throw new Error(`Canonical dataset does not exclusively use requested vintage ${options.vintage}`);
    }
  }
  const validation = validateDataset(dataset);
  if (!validation.valid) {
    const summary = validation.errors.slice(0, 5).map((entry) => `${entry.code} ${entry.path}`).join(", ");
    throw new Error(`Canonical dataset is invalid and cannot be imported: ${summary}`);
  }
  return { dataset, validation, inputPath };
}

export function renderPostgisImportSql(dataset) {
  const payload = sqlPayloadLiteral(dataset);
  return `\\set ON_ERROR_STOP on

BEGIN;

DO $meewav_guard$
BEGIN
  IF to_regclass('public.geography_dataset_versions') IS NULL
     OR to_regclass('public.music_zones') IS NULL THEN
    RAISE EXCEPTION 'geography_schema_missing: apply server/mvt-tile-server/sql/geography.sql first';
  END IF;
END
$meewav_guard$;

CREATE TEMP TABLE meewav_geography_import(payload jsonb) ON COMMIT DROP;
INSERT INTO meewav_geography_import(payload) VALUES (${payload}::jsonb);

DO $meewav_active_guard$
DECLARE
  imported_dataset_id uuid;
  imported_version text;
BEGIN
  SELECT (payload->>'datasetId')::uuid, payload->>'version'
  INTO imported_dataset_id, imported_version
  FROM meewav_geography_import;

  IF EXISTS (
    SELECT 1 FROM geography_active_datasets
    WHERE dataset_id = imported_dataset_id AND version = imported_version
  ) THEN
    RAISE EXCEPTION 'active_dataset_is_immutable: publish a new version instead';
  END IF;
END
$meewav_active_guard$;

INSERT INTO geography_dataset_versions (
  dataset_id, version, scope, status, sources, created_at, imported_at, published_at
)
SELECT
  (payload->>'datasetId')::uuid,
  payload->>'version',
  payload->>'scope',
  payload->>'status',
  payload->'sources',
  (payload->>'createdAt')::timestamptz,
  now(),
  CASE WHEN payload->>'publishedAt' IS NULL THEN NULL ELSE (payload->>'publishedAt')::timestamptz END
FROM meewav_geography_import
ON CONFLICT (dataset_id, version) DO UPDATE SET
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  sources = EXCLUDED.sources,
  created_at = EXCLUDED.created_at,
  imported_at = now(),
  published_at = EXCLUDED.published_at;

DELETE FROM music_zones
WHERE (dataset_id, dataset_version) = (
  SELECT (payload->>'datasetId')::uuid, payload->>'version' FROM meewav_geography_import
);
DELETE FROM administrative_zones
WHERE (dataset_id, dataset_version) = (
  SELECT (payload->>'datasetId')::uuid, payload->>'version' FROM meewav_geography_import
);

INSERT INTO administrative_zones (
  dataset_id, dataset_version, id, source_type, source_provider, source_code,
  source_vintage, official_name, parent_id, commune_code, geometry
)
SELECT
  (root.payload->>'datasetId')::uuid,
  root.payload->>'version',
  (zone->>'id')::uuid,
  zone->>'sourceType',
  zone->>'sourceProvider',
  zone->>'sourceCode',
  zone->>'sourceVintage',
  zone->>'officialName',
  CASE WHEN zone->>'parentId' IS NULL THEN NULL ELSE (zone->>'parentId')::uuid END,
  zone->>'communeCode',
  ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON((zone->'geometry')::text), 4326))
FROM meewav_geography_import root
CROSS JOIN LATERAL jsonb_array_elements(root.payload->'administrativeZones') zone;

INSERT INTO music_zones (
  dataset_id, dataset_version, zone_id, display_name, aliases, commune_code,
  commune_name, parent_zone_id, source_type, source_vintage, status, quality,
  bbox, center, label_point, geometry, presentation
)
SELECT
  (root.payload->>'datasetId')::uuid,
  root.payload->>'version',
  (zone->>'zoneId')::uuid,
  zone->>'displayName',
  ARRAY(SELECT jsonb_array_elements_text(zone->'aliases')),
  zone->>'communeCode',
  zone->>'communeName',
  CASE WHEN zone->>'parentZoneId' IS NULL THEN NULL ELSE (zone->>'parentZoneId')::uuid END,
  zone->>'sourceType',
  zone->>'sourceVintage',
  zone->>'status',
  zone->>'quality',
  ARRAY(SELECT bbox_value::double precision FROM jsonb_array_elements_text(zone->'bbox') AS bbox_values(bbox_value)),
  ST_SetSRID(ST_MakePoint((zone->'center'->>0)::double precision, (zone->'center'->>1)::double precision), 4326),
  ST_SetSRID(ST_MakePoint((zone->'labelPoint'->>0)::double precision, (zone->'labelPoint'->>1)::double precision), 4326),
  ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON((zone->'geometry')::text), 4326)),
  COALESCE(zone->'presentation', '{}'::jsonb)
FROM meewav_geography_import root
CROSS JOIN LATERAL jsonb_array_elements(root.payload->'musicZones') zone;

INSERT INTO music_zone_sources (dataset_id, dataset_version, zone_id, administrative_zone_id)
SELECT
  (root.payload->>'datasetId')::uuid,
  root.payload->>'version',
  (zone->>'zoneId')::uuid,
  source_id::uuid
FROM meewav_geography_import root
CROSS JOIN LATERAL jsonb_array_elements(root.payload->'musicZones') zone
CROSS JOIN LATERAL jsonb_array_elements_text(zone->'sourceZoneIds') AS source_ids(source_id);

INSERT INTO zone_aliases (dataset_id, dataset_version, zone_id, alias)
SELECT
  (root.payload->>'datasetId')::uuid,
  root.payload->>'version',
  (zone->>'zoneId')::uuid,
  alias
FROM meewav_geography_import root
CROSS JOIN LATERAL jsonb_array_elements(root.payload->'musicZones') zone
CROSS JOIN LATERAL jsonb_array_elements_text(zone->'aliases') AS aliases(alias);

INSERT INTO zone_camera_overrides (dataset_id, dataset_version, zone_id, zoom, pitch, bearing, padding)
SELECT
  (root.payload->>'datasetId')::uuid,
  root.payload->>'version',
  (zone->>'zoneId')::uuid,
  (zone->'cameraOverride'->>'zoom')::double precision,
  (zone->'cameraOverride'->>'pitch')::double precision,
  (zone->'cameraOverride'->>'bearing')::double precision,
  (zone->'cameraOverride'->>'padding')::double precision
FROM meewav_geography_import root
CROSS JOIN LATERAL jsonb_array_elements(root.payload->'musicZones') zone
WHERE zone ? 'cameraOverride';

COMMIT;
`;
}

export function renderPostgisActivationSql(dataset) {
  const datasetId = dataset.datasetId.replaceAll("'", "''");
  const version = dataset.version.replaceAll("'", "''");
  const scope = dataset.scope.replaceAll("'", "''");
  return `\\set ON_ERROR_STOP on

BEGIN;

DO $meewav_publish_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM geography_dataset_versions
    WHERE dataset_id = '${datasetId}'::uuid
      AND version = '${version}'
      AND status IN ('validated', 'published')
  ) THEN
    RAISE EXCEPTION 'dataset_missing_or_not_validated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM music_zones
    WHERE dataset_id = '${datasetId}'::uuid
      AND dataset_version = '${version}'
      AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'draft_zone_cannot_be_published';
  END IF;
END
$meewav_publish_guard$;

UPDATE geography_dataset_versions
SET status = 'published', published_at = now()
WHERE dataset_id = '${datasetId}'::uuid AND version = '${version}';

UPDATE music_zones
SET status = 'published'
WHERE dataset_id = '${datasetId}'::uuid AND dataset_version = '${version}';

INSERT INTO geography_active_datasets (scope, dataset_id, version, activated_at)
VALUES ('${scope}', '${datasetId}'::uuid, '${version}', now())
ON CONFLICT (scope) DO UPDATE SET
  dataset_id = EXCLUDED.dataset_id,
  version = EXCLUDED.version,
  activated_at = now();

COMMIT;
`;
}

export function renderPostgisValidationSql(dataset) {
  const datasetId = dataset.datasetId.replaceAll("'", "''");
  const version = dataset.version.replaceAll("'", "''");
  return `\\set ON_ERROR_STOP on

DO $meewav_validate$
DECLARE
  invalid_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM geography_dataset_versions
    WHERE dataset_id = '${datasetId}'::uuid AND version = '${version}'
  ) THEN
    RAISE EXCEPTION 'dataset_not_imported';
  END IF;

  SELECT count(*) INTO invalid_count
  FROM administrative_zones
  WHERE dataset_id = '${datasetId}'::uuid AND dataset_version = '${version}'
    AND (ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry));
  IF invalid_count > 0 THEN RAISE EXCEPTION 'invalid_administrative_geometries: %', invalid_count; END IF;

  SELECT count(*) INTO invalid_count
  FROM music_zones
  WHERE dataset_id = '${datasetId}'::uuid AND dataset_version = '${version}'
    AND (ST_IsEmpty(geometry) OR NOT ST_IsValid(geometry) OR NOT ST_Covers(geometry, label_point));
  IF invalid_count > 0 THEN RAISE EXCEPTION 'invalid_music_zones_or_label_points: %', invalid_count; END IF;

  SELECT count(*) INTO invalid_count
  FROM music_zones first_zone
  JOIN music_zones second_zone
    ON second_zone.dataset_id = first_zone.dataset_id
   AND second_zone.dataset_version = first_zone.dataset_version
   AND second_zone.commune_code = first_zone.commune_code
   AND second_zone.zone_id > first_zone.zone_id
  WHERE first_zone.dataset_id = '${datasetId}'::uuid
    AND first_zone.dataset_version = '${version}'
    AND first_zone.parent_zone_id IS DISTINCT FROM second_zone.zone_id
    AND second_zone.parent_zone_id IS DISTINCT FROM first_zone.zone_id
    AND ST_Overlaps(first_zone.geometry, second_zone.geometry);
  IF invalid_count > 0 THEN RAISE EXCEPTION 'problematic_music_zone_overlaps: %', invalid_count; END IF;

  SELECT count(*) INTO invalid_count
  FROM (
    SELECT commune.id
    FROM administrative_zones commune
    JOIN music_zones zone
      ON zone.dataset_id = commune.dataset_id
     AND zone.dataset_version = commune.dataset_version
     AND zone.commune_code = commune.commune_code
    WHERE commune.dataset_id = '${datasetId}'::uuid
      AND commune.dataset_version = '${version}'
      AND commune.source_type = 'commune'
    GROUP BY commune.id, commune.geometry
    HAVING ST_Area(ST_Intersection(commune.geometry, ST_Union(zone.geometry))::geography)
      / NULLIF(ST_Area(commune.geometry::geography), 0) < 0.95
  ) insufficient_coverage;
  IF invalid_count > 0 THEN RAISE EXCEPTION 'insufficient_commune_coverage: %', invalid_count; END IF;

  SELECT count(*) INTO invalid_count
  FROM music_zone_sources current_link
  JOIN administrative_zones current_source
    ON current_source.dataset_id = current_link.dataset_id
   AND current_source.dataset_version = current_link.dataset_version
   AND current_source.id = current_link.administrative_zone_id
  JOIN administrative_zones previous_source
    ON previous_source.dataset_id = current_source.dataset_id
   AND previous_source.dataset_version <> current_source.dataset_version
   AND previous_source.source_provider = current_source.source_provider
   AND previous_source.source_code = current_source.source_code
  JOIN music_zone_sources previous_link
    ON previous_link.dataset_id = previous_source.dataset_id
   AND previous_link.dataset_version = previous_source.dataset_version
   AND previous_link.administrative_zone_id = previous_source.id
  WHERE current_link.dataset_id = '${datasetId}'::uuid
    AND current_link.dataset_version = '${version}'
    AND current_link.zone_id <> previous_link.zone_id;
  IF invalid_count > 0 THEN RAISE EXCEPTION 'unstable_zone_ids_between_versions: %', invalid_count; END IF;
END
$meewav_validate$;
`;
}

export async function buildPostgisImport(rootDirectory, options = {}) {
  const loaded = await loadCanonicalDataset(rootDirectory, options);
  const version = safeSegment(loaded.dataset.version, "version");
  const scope = safeSegment(loaded.dataset.scope, "scope");
  const sql = renderPostgisImportSql(loaded.dataset);
  const sqlBytes = Buffer.from(sql);
  const canonicalBytes = Buffer.from(`${JSON.stringify(loaded.dataset)}\n`);
  const manifest = {
    schemaVersion: 1,
    datasetId: loaded.dataset.datasetId,
    version,
    scope,
    status: loaded.dataset.status,
    requestedVintage: options.vintage ?? null,
    administrativeZoneCount: loaded.dataset.administrativeZones.length,
    musicZoneCount: loaded.dataset.musicZones.length,
    canonicalSha256: createHash("sha256").update(canonicalBytes).digest("hex"),
    sqlBytes: sqlBytes.length,
    sqlSha256: createHash("sha256").update(sqlBytes).digest("hex"),
  };
  const outputDirectory = options.outputDirectory
    ? path.resolve(rootDirectory, options.outputDirectory)
    : path.join(rootDirectory, "geo", "output", "imports", version);
  await mkdir(outputDirectory, { recursive: true });
  const sqlPath = path.join(outputDirectory, `${scope}.import.sql`);
  const manifestPath = path.join(outputDirectory, `${scope}.import-manifest.json`);
  await Promise.all([
    writeFile(sqlPath, sqlBytes),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  return { ...loaded, sqlPath, manifestPath, manifest };
}
