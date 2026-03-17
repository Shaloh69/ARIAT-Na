-- =====================================================
-- Migration 006: Destination Extended Fields
-- Safe to re-run: each statement checks information_schema
-- before altering the table, so duplicate columns never occur.
-- No DELIMITER changes required — works in any MySQL client.
-- =====================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper macro (inline SET/PREPARE/EXECUTE — no stored procedure needed)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Back-fill: family_friendly (migration 002) ────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'family_friendly') = 0,
  'ALTER TABLE destinations ADD COLUMN family_friendly BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT ''family_friendly already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: budget_level (migration 002) ───────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'budget_level') = 0,
  'ALTER TABLE destinations ADD COLUMN budget_level ENUM(''budget'',''mid'',''premium'') NOT NULL DEFAULT ''mid''',
  'SELECT ''budget_level already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: municipality (migration 002) ───────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'municipality') = 0,
  'ALTER TABLE destinations ADD COLUMN municipality VARCHAR(100) NULL',
  'SELECT ''municipality already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: cluster_id (migration 002) ─────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'cluster_id') = 0,
  'ALTER TABLE destinations ADD COLUMN cluster_id VARCHAR(36) NULL',
  'SELECT ''cluster_id already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: tags (migration 002) ──────────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'tags') = 0,
  'ALTER TABLE destinations ADD COLUMN tags JSON NULL',
  'SELECT ''tags already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: transport_access (migration 002) ───────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'transport_access') = 0,
  'ALTER TABLE destinations ADD COLUMN transport_access TEXT NULL',
  'SELECT ''transport_access already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: is_island (migration 004) ─────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'is_island') = 0,
  'ALTER TABLE destinations ADD COLUMN is_island BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT ''is_island already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Back-fill: ferry road type (migration 004) ────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roads' AND COLUMN_NAME = 'road_type'
     AND COLUMN_TYPE LIKE '%ferry%') = 0,
  'ALTER TABLE roads MODIFY road_type ENUM(''highway'',''main_road'',''local_road'',''ferry'') NOT NULL DEFAULT ''local_road''',
  'SELECT ''ferry road_type already present''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ─────────────────────────────────────────────────────────────────────────────
-- New fields (migration 006)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Contact information ───────────────────────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'contact_phone') = 0,
  'ALTER TABLE destinations ADD COLUMN contact_phone VARCHAR(20) NULL',
  'SELECT ''contact_phone already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'contact_email') = 0,
  'ALTER TABLE destinations ADD COLUMN contact_email VARCHAR(255) NULL',
  'SELECT ''contact_email already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'website_url') = 0,
  'ALTER TABLE destinations ADD COLUMN website_url VARCHAR(500) NULL',
  'SELECT ''website_url already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'facebook_url') = 0,
  'ALTER TABLE destinations ADD COLUMN facebook_url VARCHAR(500) NULL',
  'SELECT ''facebook_url already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'instagram_url') = 0,
  'ALTER TABLE destinations ADD COLUMN instagram_url VARCHAR(500) NULL',
  'SELECT ''instagram_url already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Restaurant-specific ───────────────────────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'menu_images') = 0,
  'ALTER TABLE destinations ADD COLUMN menu_images JSON NULL',
  'SELECT ''menu_images already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'cuisine_types') = 0,
  'ALTER TABLE destinations ADD COLUMN cuisine_types JSON NULL',
  'SELECT ''cuisine_types already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'service_types') = 0,
  'ALTER TABLE destinations ADD COLUMN service_types JSON NULL',
  'SELECT ''service_types already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'seating_capacity') = 0,
  'ALTER TABLE destinations ADD COLUMN seating_capacity INT UNSIGNED NULL',
  'SELECT ''seating_capacity already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- ── Hotel / accommodation-specific ────────────────────────────────────────
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'accommodation_pricing') = 0,
  'ALTER TABLE destinations ADD COLUMN accommodation_pricing JSON NULL',
  'SELECT ''accommodation_pricing already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'star_rating') = 0,
  'ALTER TABLE destinations ADD COLUMN star_rating TINYINT UNSIGNED NULL',
  'SELECT ''star_rating already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'check_in_time') = 0,
  'ALTER TABLE destinations ADD COLUMN check_in_time VARCHAR(10) NULL DEFAULT ''14:00''',
  'SELECT ''check_in_time already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = 'check_out_time') = 0,
  'ALTER TABLE destinations ADD COLUMN check_out_time VARCHAR(10) NULL DEFAULT ''12:00''',
  'SELECT ''check_out_time already exists''');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;
