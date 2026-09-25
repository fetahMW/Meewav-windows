-- =====================================================================
-- MEEWAV POSTGRES / POSTGIS INITIALIZATION SCRIPT
-- =====================================================================
-- Target Database: Supabase Remote / Local PostgreSQL + PostGIS
-- Reference Project: dqabekaqpznjsagoxzwc
-- =====================================================================

-- 1. Enable required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create schema table for musicians
CREATE TABLE IF NOT EXISTS musicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);

-- 3. Create high-performance indexes
-- GiST spatial index is absolutely essential for fast MVT bounds intersection queries
CREATE INDEX IF NOT EXISTS musicians_geom_gix ON musicians USING gist (geom);
CREATE INDEX IF NOT EXISTS musicians_instrument_idx ON musicians (instrument);

-- 4. Truncate existing data to avoid duplicates during test runs (optional, uncomment if needed)
TRUNCATE TABLE musicians;

-- 5. Insert Paris minimal dataset (5 musicians)
-- Checking if data already exists to prevent duplicate key or redundant rows on repeated runs
INSERT INTO musicians (instrument, latitude, longitude, geom)
SELECT 'pianiste', 48.8612, 2.3335, ST_SetSRID(ST_MakePoint(2.3335, 48.8612), 4326)
WHERE NOT EXISTS (SELECT 1 FROM musicians WHERE instrument = 'pianiste' AND latitude = 48.8612);

INSERT INTO musicians (instrument, latitude, longitude, geom)
SELECT 'studio', 48.8524, 2.3518, ST_SetSRID(ST_MakePoint(2.3518, 48.8524), 4326)
WHERE NOT EXISTS (SELECT 1 FROM musicians WHERE instrument = 'studio' AND latitude = 48.8524);

INSERT INTO musicians (instrument, latitude, longitude, geom)
SELECT 'label', 48.8708, 2.3322, ST_SetSRID(ST_MakePoint(2.3322, 48.8708), 4326)
WHERE NOT EXISTS (SELECT 1 FROM musicians WHERE instrument = 'label' AND latitude = 48.8708);

INSERT INTO musicians (instrument, latitude, longitude, geom)
SELECT 'violon', 48.8530, 2.3482, ST_SetSRID(ST_MakePoint(2.3482, 48.8530), 4326)
WHERE NOT EXISTS (SELECT 1 FROM musicians WHERE instrument = 'violon' AND latitude = 48.8530);

INSERT INTO musicians (instrument, latitude, longitude, geom)
SELECT 'dj', 48.8608, 2.3514, ST_SetSRID(ST_MakePoint(2.3514, 48.8608), 4326)
WHERE NOT EXISTS (SELECT 1 FROM musicians WHERE instrument = 'dj' AND latitude = 48.8608);

-- Verify insertion
SELECT id, instrument, latitude, longitude FROM musicians;
