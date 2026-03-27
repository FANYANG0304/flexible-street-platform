-- ══════════════════════════════════════════════════════════════════════════════
-- Center City Open Streets 2026 — street_events table
-- Data source: centercityphila.org/openstreets-ww + phillyvoice.com + inquirer.com
-- Street coordinates: approximate from Philadelphia street grid
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Create table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS street_events (
  id            SERIAL PRIMARY KEY,
  series_name   TEXT    NOT NULL,   -- 'Open Streets: West Walnut' | 'Open Streets: Midtown Village'
  street_name   TEXT    NOT NULL,   -- physical street name
  location_desc TEXT,               -- human-readable extent
  neighborhood  TEXT,               -- 'Rittenhouse' | 'Midtown Village'
  zone_type     TEXT    NOT NULL DEFAULT 'commercial',  -- aligns with study zone logic
  event_date    DATE    NOT NULL,
  day_of_week   TEXT,
  open_time     TIME    NOT NULL,
  close_time    TIME    NOT NULL,
  notes         TEXT,
  source_url    TEXT,
  geometry      geometry(LineString, 4326)
);

CREATE INDEX IF NOT EXISTS street_events_geom_idx  ON street_events USING gist (geometry);
CREATE INDEX IF NOT EXISTS street_events_date_idx  ON street_events (event_date);
CREATE INDEX IF NOT EXISTS street_events_zone_idx  ON street_events (zone_type);


-- 2. RPC function — returns GeoJSON FeatureCollection within a bounding box
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_street_events_in_bounds(
  min_lng FLOAT, min_lat FLOAT,
  max_lng FLOAT, max_lat FLOAT
)
RETURNS JSON
LANGUAGE SQL STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geometry)::json,
        'properties', json_build_object(
          'id',           id,
          'series_name',  series_name,
          'street_name',  street_name,
          'location_desc',location_desc,
          'neighborhood', neighborhood,
          'zone_type',    zone_type,
          'event_date',   TO_CHAR(event_date, 'YYYY-MM-DD'),
          'day_of_week',  day_of_week,
          'open_time',    TO_CHAR(open_time,  'HH24:MI'),
          'close_time',   TO_CHAR(close_time, 'HH24:MI'),
          'notes',        notes
        )
      )
    ), '[]'::json)
  )
  FROM street_events
  WHERE ST_Intersects(
    geometry,
    ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  );
$$;


-- 3. Insert data
--    Street coordinates (approximate, Philadelphia grid):
--      Walnut St  lat ≈ 39.9484  |  Broad St   lng ≈ -75.1638  |  19th St  lng ≈ -75.1733
--      Chestnut St lat ≈ 39.9506 |  18th St    lng ≈ -75.1714  |  Locust St lat ≈ 39.9465
--      Sansom St  lat ≈ 39.9493  |  13th St    lng ≈ -75.1619  |  12th St   lng ≈ -75.1600
--      Juniper St lng ≈ -75.1628 |  Drury St   lng ≈ -75.1617, lat 39.9496→39.9489
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: we insert one row per (event_date × street_segment).
-- West Walnut = 2 streets × 15 dates = 30 rows
-- Midtown Village = 3 streets × 5 dates = 15 rows

INSERT INTO street_events
  (series_name, street_name, location_desc, neighborhood, zone_type,
   event_date, day_of_week, open_time, close_time, notes, source_url, geometry)
VALUES

-- ── Open Streets: West Walnut — Walnut St (Broad to 19th) ─────────────────

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-04-05','Sunday','10:00','17:00','Easter Sunday',
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-04-12','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-04-19','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-04-26','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-05-03','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-05-10','Sunday','10:00','17:00',$$Mother's Day$$,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-05-17','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-09-13','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-09-20','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-09-27','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-10-04','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-10-11','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-10-18','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-10-25','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

('Open Streets: West Walnut','Walnut St','Broad St to 19th St','Rittenhouse','commercial',
 '2026-12-06','Sunday','10:00','17:00','Holiday event',
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1638 39.9484, -75.1733 39.9484)', 4326)),

-- ── Open Streets: West Walnut — 18th St (Chestnut to Locust) ──────────────

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-04-05','Sunday','10:00','17:00','Easter Sunday',
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-04-12','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-04-19','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-04-26','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-05-03','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-05-10','Sunday','10:00','17:00',$$Mother's Day$$,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-05-17','Sunday','10:00','17:00',NULL,
 'https://centercityphila.org/explore-center-city/openstreets-ww',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-09-13','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-09-20','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-09-27','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-10-04','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-10-11','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-10-18','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-10-25','Sunday','10:00','17:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

('Open Streets: West Walnut','18th St','Chestnut St to Locust St','Rittenhouse','commercial',
 '2026-12-06','Sunday','10:00','17:00','Holiday event',
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1714 39.9506, -75.1714 39.9465)', 4326)),

-- ── Open Streets: Midtown Village — 13th St (Chestnut to Walnut) ──────────

('Open Streets: Midtown Village','13th St','Chestnut St to Walnut St','Midtown Village','commercial',
 '2026-06-02','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1619 39.9506, -75.1619 39.9484)', 4326)),

('Open Streets: Midtown Village','13th St','Chestnut St to Walnut St','Midtown Village','commercial',
 '2026-06-09','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1619 39.9506, -75.1619 39.9484)', 4326)),

('Open Streets: Midtown Village','13th St','Chestnut St to Walnut St','Midtown Village','commercial',
 '2026-06-16','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1619 39.9506, -75.1619 39.9484)', 4326)),

('Open Streets: Midtown Village','13th St','Chestnut St to Walnut St','Midtown Village','commercial',
 '2026-06-23','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1619 39.9506, -75.1619 39.9484)', 4326)),

('Open Streets: Midtown Village','13th St','Chestnut St to Walnut St','Midtown Village','commercial',
 '2026-06-30','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1619 39.9506, -75.1619 39.9484)', 4326)),

-- ── Open Streets: Midtown Village — Sansom St (Juniper to 12th) ───────────

('Open Streets: Midtown Village','Sansom St','Juniper St to 12th St','Midtown Village','commercial',
 '2026-06-02','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1628 39.9493, -75.1600 39.9493)', 4326)),

('Open Streets: Midtown Village','Sansom St','Juniper St to 12th St','Midtown Village','commercial',
 '2026-06-09','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1628 39.9493, -75.1600 39.9493)', 4326)),

('Open Streets: Midtown Village','Sansom St','Juniper St to 12th St','Midtown Village','commercial',
 '2026-06-16','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1628 39.9493, -75.1600 39.9493)', 4326)),

('Open Streets: Midtown Village','Sansom St','Juniper St to 12th St','Midtown Village','commercial',
 '2026-06-23','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1628 39.9493, -75.1600 39.9493)', 4326)),

('Open Streets: Midtown Village','Sansom St','Juniper St to 12th St','Midtown Village','commercial',
 '2026-06-30','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1628 39.9493, -75.1600 39.9493)', 4326)),

-- ── Open Streets: Midtown Village — Drury St ──────────────────────────────

('Open Streets: Midtown Village','Drury St','Near 13th & Sansom','Midtown Village','commercial',
 '2026-06-02','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1617 39.9496, -75.1617 39.9489)', 4326)),

('Open Streets: Midtown Village','Drury St','Near 13th & Sansom','Midtown Village','commercial',
 '2026-06-09','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1617 39.9496, -75.1617 39.9489)', 4326)),

('Open Streets: Midtown Village','Drury St','Near 13th & Sansom','Midtown Village','commercial',
 '2026-06-16','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1617 39.9496, -75.1617 39.9489)', 4326)),

('Open Streets: Midtown Village','Drury St','Near 13th & Sansom','Midtown Village','commercial',
 '2026-06-23','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1617 39.9496, -75.1617 39.9489)', 4326)),

('Open Streets: Midtown Village','Drury St','Near 13th & Sansom','Midtown Village','commercial',
 '2026-06-30','Tuesday','16:00','21:00',NULL,
 'https://www.phillyvoice.com/open-streets-center-city-2026-dates/',
 ST_GeomFromText('LINESTRING(-75.1617 39.9496, -75.1617 39.9489)', 4326));

-- ══════════════════════════════════════════════════════════════════════════════
-- Verify
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT series_name, street_name, COUNT(*) FROM street_events GROUP BY 1,2 ORDER BY 1,2;
-- Expected: West Walnut × Walnut St = 15, West Walnut × 18th St = 15
--           Midtown Village × 13th St = 5, Midtown Village × Sansom St = 5, Midtown Village × Drury St = 5
