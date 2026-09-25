export const RESOLVE_MUSIC_ZONE_SQL = `
  SELECT
    zone_id,
    display_name,
    commune_code,
    commune_name,
    quality,
    source_vintage
  FROM active_music_zones
  WHERE status IN ('validated', 'published')
    AND ST_Covers(
      geometry,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)
    )
  ORDER BY
    CASE quality WHEN 'curated' THEN 0 WHEN 'official' THEN 1 ELSE 2 END,
    ST_Area(geometry::geography) ASC,
    zone_id
  LIMIT 1
`;

export const RESOLVE_COMMUNE_FALLBACK_SQL = `
  SELECT
    fallback.zone_id,
    COALESCE(fallback.display_name, commune.official_name) AS display_name,
    commune.commune_code,
    commune.official_name AS commune_name,
    COALESCE(fallback.quality, 'fallback') AS quality,
    COALESCE(fallback.source_vintage, commune.source_vintage) AS source_vintage
  FROM active_administrative_zones commune
  LEFT JOIN LATERAL (
    SELECT zone_id, display_name, quality, source_vintage
    FROM active_music_zones candidate
    WHERE candidate.commune_code = commune.commune_code
      AND candidate.source_type = 'commune_fallback'
      AND candidate.status IN ('validated', 'published')
    ORDER BY candidate.zone_id
    LIMIT 1
  ) fallback ON TRUE
  WHERE commune.source_type = 'commune'
    AND ST_Covers(
      commune.geometry,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)
    )
  ORDER BY ST_Area(commune.geometry::geography) ASC, commune.id
  LIMIT 1
`;

export const SEARCH_MUSIC_ZONES_SQL = `
  SELECT
    zone_id,
    display_name,
    aliases,
    commune_code,
    commune_name,
    quality,
    source_vintage,
    bbox,
    ST_X(label_point) AS label_lng,
    ST_Y(label_point) AS label_lat
  FROM active_music_zones
  WHERE status IN ('validated', 'published')
    AND (
      display_name ILIKE $1
      OR commune_name ILIKE $1
      OR EXISTS (SELECT 1 FROM unnest(aliases) alias WHERE alias ILIKE $1)
    )
  ORDER BY
    CASE WHEN lower(display_name) = lower($2) THEN 0 ELSE 1 END,
    display_name,
    commune_name,
    zone_id
  LIMIT $3
`;

export function parseResolveZonePayload(payload) {
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, error: 'invalid_latitude' };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, error: 'invalid_longitude' };
  }
  return { valid: true, latitude, longitude };
}

export function normalizeSearchQuery(value, limitValue) {
  const query = String(value ?? '').trim().replace(/\s+/g, ' ');
  const rawLimit = Number(limitValue);
  const limit = Number.isFinite(rawLimit) ? Math.min(30, Math.max(1, Math.trunc(rawLimit))) : 12;
  return { query, limit };
}

function zonePayload(row, resolution) {
  return {
    zoneId: row.zone_id ?? null,
    displayName: row.display_name,
    communeCode: row.commune_code,
    communeName: row.commune_name,
    quality: row.quality,
    sourceVintage: row.source_vintage,
    resolution,
  };
}

export async function resolveGeographyPoint(database, payload) {
  const coordinates = parseResolveZonePayload(payload);
  if (!coordinates.valid) return { status: 400, body: { error: coordinates.error } };
  const parameters = [coordinates.longitude, coordinates.latitude];
  const exact = await database.query(RESOLVE_MUSIC_ZONE_SQL, parameters);
  if (exact.rows[0]) return { status: 200, body: zonePayload(exact.rows[0], 'music_zone') };

  const commune = await database.query(RESOLVE_COMMUNE_FALLBACK_SQL, parameters);
  if (commune.rows[0]) {
    const body = zonePayload(commune.rows[0], commune.rows[0].zone_id ? 'commune_fallback' : 'sector_selection_required');
    return { status: 200, body };
  }

  return {
    status: 200,
    body: {
      zoneId: null,
      displayName: null,
      communeCode: null,
      communeName: null,
      quality: 'fallback',
      sourceVintage: null,
      resolution: 'manual_selection_required',
    },
  };
}

export function geographySearchPayload(rows) {
  return rows.map((row) => ({
    zoneId: row.zone_id,
    displayName: row.display_name,
    aliases: row.aliases ?? [],
    communeCode: row.commune_code,
    communeName: row.commune_name,
    quality: row.quality,
    sourceVintage: row.source_vintage,
    bbox: row.bbox,
    labelPoint: [Number(row.label_lng), Number(row.label_lat)],
  }));
}
