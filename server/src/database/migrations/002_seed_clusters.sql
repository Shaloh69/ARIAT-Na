-- =====================================================
-- Seed: Cebu Region Clusters
-- Run after 002_cebu_region_revamp.sql
-- =====================================================

INSERT INTO clusters (id, name, slug, region_type, description, center_lat, center_lng, recommended_trip_length, is_active, display_order) VALUES
('cls-metro-001', 'Metro Cebu',   'metro-cebu',   'metro',   'The urban heart of Cebu — Cebu City, Mandaue, Lapu-Lapu, and Busay highlands. Close-together attractions, best for city exploration, food, heritage, and shopping.', 10.31672, 123.89071, '1–2 days', TRUE, 1),
('cls-south-001', 'South Cebu',   'south-cebu',   'south',   'A scenic corridor of waterfalls, whale sharks, cliff diving, and heritage towns. Stretching from Naga to Oslob, Moalboal, and Badian.', 10.00000, 123.60000, '2–3 days', TRUE, 2),
('cls-north-001', 'North Cebu',   'north-cebu',   'north',   'Rugged coastlines, festivals, and access to Malapascua island. Danao, Carmen, Medellin, and Daanbantayan make this corridor great for off-the-beaten-path travel.', 10.72000, 124.00000, '1–2 days', TRUE, 3),
('cls-isl-001',   'Islands',      'islands',      'islands', 'Cebu''s famous island getaways — Bantayan, Camotes, and Malapascua. Each island has its own vibe: Bantayan for beaches, Camotes for lakes and coves, Malapascua for thresher sharks.', 11.16000, 123.73000, '2–4 days', TRUE, 4),
('cls-west-001',  'West Cebu',    'west-cebu',    'west',    'The quieter western side — Toledo corridor and scenic mountain roads. Less crowded, good for day trips from Metro Cebu.', 10.36000, 123.64000, '1 day',   TRUE, 5)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    updated_at = CURRENT_TIMESTAMP;
