-- =====================================================
-- Migration 017: Ferry Pier Node Fixes
--
-- Adds missing mainland embarkation piers for island
-- destinations in Cebu, and fixes the Sumilon Pier
-- duplicate (was identical coordinates to Pier 1).
--
-- New piers (mainland embarkation points):
--   Maya Port      — Daanbantayan, north Cebu
--                    Embarkation for Malapascua Island
--   Hagnaya Port   — San Remigio, northwest Cebu
--                    Embarkation for Bantayan Island / Santa Fe
--   Oslob Pier     — Tan-awan, Oslob, south Cebu
--                    Embarkation for Sumilon Island
--
-- Also removes the erroneous duplicate "Sumilon Pier"
-- that had the same coordinates as "Pier 1".
--
-- Safe to re-run.
-- =====================================================

-- 1. Add Maya Port (Daanbantayan) — Malapascua Island embarkation
INSERT INTO intersections (id, name, latitude, longitude, point_type)
SELECT UUID(), 'Maya Port', 11.29300, 124.11840, 'pier'
WHERE NOT EXISTS (
  SELECT 1 FROM intersections WHERE name = 'Maya Port' AND point_type = 'pier'
);

-- 2. Add Hagnaya Port (San Remigio) — Bantayan Island / Santa Fe embarkation
INSERT INTO intersections (id, name, latitude, longitude, point_type)
SELECT UUID(), 'Hagnaya Port', 11.07440, 123.87120, 'pier'
WHERE NOT EXISTS (
  SELECT 1 FROM intersections WHERE name = 'Hagnaya Port' AND point_type = 'pier'
);

-- 3. Add Oslob Pier (Tan-awan, Oslob) — Sumilon Island embarkation
INSERT INTO intersections (id, name, latitude, longitude, point_type)
SELECT UUID(), 'Oslob Pier', 9.47650, 123.39200, 'pier'
WHERE NOT EXISTS (
  SELECT 1 FROM intersections WHERE name = 'Oslob Pier' AND point_type = 'pier'
);

-- 4. Remove the erroneous "Sumilon Pier" duplicate
--    (it was identical to Pier 1 at 9.4565, 123.3779 — wrong location)
DELETE FROM intersections
WHERE name = 'Sumilon Pier' AND point_type = 'pier'
  AND ABS(latitude  - 9.45652968) < 0.0001
  AND ABS(longitude - 123.37791848) < 0.0001;
