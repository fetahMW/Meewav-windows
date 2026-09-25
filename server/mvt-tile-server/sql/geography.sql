CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS geography_dataset_versions (
  dataset_id uuid NOT NULL,
  version text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  PRIMARY KEY (dataset_id, version)
);

CREATE TABLE IF NOT EXISTS geography_active_datasets (
  scope text PRIMARY KEY,
  dataset_id uuid NOT NULL,
  version text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (dataset_id, version)
    REFERENCES geography_dataset_versions(dataset_id, version)
);

CREATE TABLE IF NOT EXISTS administrative_zones (
  dataset_id uuid NOT NULL,
  dataset_version text NOT NULL,
  id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('region', 'department', 'commune', 'iris', 'local_district')),
  source_provider text NOT NULL,
  source_code text NOT NULL,
  source_vintage text NOT NULL,
  official_name text NOT NULL,
  parent_id uuid,
  commune_code text,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  PRIMARY KEY (dataset_id, dataset_version, id),
  FOREIGN KEY (dataset_id, dataset_version)
    REFERENCES geography_dataset_versions(dataset_id, version) ON DELETE CASCADE,
  FOREIGN KEY (dataset_id, dataset_version, parent_id)
    REFERENCES administrative_zones(dataset_id, dataset_version, id)
);

CREATE INDEX IF NOT EXISTS administrative_zones_geometry_gix ON administrative_zones USING gist (geometry);
CREATE INDEX IF NOT EXISTS administrative_zones_commune_code_idx ON administrative_zones (commune_code);

CREATE TABLE IF NOT EXISTS music_zones (
  dataset_id uuid NOT NULL,
  dataset_version text NOT NULL,
  zone_id uuid NOT NULL,
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  commune_code text NOT NULL,
  commune_name text NOT NULL,
  parent_zone_id uuid,
  source_type text NOT NULL CHECK (source_type IN ('official', 'merged', 'local', 'generated', 'commune_fallback', 'custom')),
  source_vintage text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
  quality text NOT NULL CHECK (quality IN ('official', 'curated', 'fallback')),
  bbox double precision[] NOT NULL CHECK (cardinality(bbox) = 4),
  center geometry(Point, 4326) NOT NULL,
  label_point geometry(Point, 4326) NOT NULL,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  presentation jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (dataset_id, dataset_version, zone_id),
  FOREIGN KEY (dataset_id, dataset_version)
    REFERENCES geography_dataset_versions(dataset_id, version) ON DELETE CASCADE,
  FOREIGN KEY (dataset_id, dataset_version, parent_zone_id)
    REFERENCES music_zones(dataset_id, dataset_version, zone_id)
);

CREATE INDEX IF NOT EXISTS music_zones_geometry_gix ON music_zones USING gist (geometry);
CREATE INDEX IF NOT EXISTS music_zones_commune_code_idx ON music_zones (commune_code);
CREATE INDEX IF NOT EXISTS music_zones_display_name_idx ON music_zones (lower(display_name));

CREATE TABLE IF NOT EXISTS music_zone_sources (
  dataset_id uuid NOT NULL,
  dataset_version text NOT NULL,
  zone_id uuid NOT NULL,
  administrative_zone_id uuid NOT NULL,
  PRIMARY KEY (dataset_id, dataset_version, zone_id, administrative_zone_id),
  FOREIGN KEY (dataset_id, dataset_version, zone_id)
    REFERENCES music_zones(dataset_id, dataset_version, zone_id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_id, dataset_version, administrative_zone_id)
    REFERENCES administrative_zones(dataset_id, dataset_version, id)
);

CREATE TABLE IF NOT EXISTS zone_aliases (
  dataset_id uuid NOT NULL,
  dataset_version text NOT NULL,
  zone_id uuid NOT NULL,
  alias text NOT NULL,
  PRIMARY KEY (dataset_id, dataset_version, zone_id, alias),
  FOREIGN KEY (dataset_id, dataset_version, zone_id)
    REFERENCES music_zones(dataset_id, dataset_version, zone_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS zone_camera_overrides (
  dataset_id uuid NOT NULL,
  dataset_version text NOT NULL,
  zone_id uuid NOT NULL,
  zoom double precision,
  pitch double precision,
  bearing double precision,
  padding double precision,
  PRIMARY KEY (dataset_id, dataset_version, zone_id),
  FOREIGN KEY (dataset_id, dataset_version, zone_id)
    REFERENCES music_zones(dataset_id, dataset_version, zone_id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW active_administrative_zones AS
SELECT zones.*
FROM administrative_zones zones
JOIN geography_active_datasets active
  ON active.dataset_id = zones.dataset_id
 AND active.version = zones.dataset_version;

CREATE OR REPLACE VIEW active_music_zones AS
SELECT zones.*
FROM music_zones zones
JOIN geography_active_datasets active
  ON active.dataset_id = zones.dataset_id
 AND active.version = zones.dataset_version;
