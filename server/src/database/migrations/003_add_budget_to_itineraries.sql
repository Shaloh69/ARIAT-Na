-- =====================================================
-- Migration 003: Add budget column to itineraries
-- Stores the user's trip budget constraint (PHP)
-- Run once against a database with migration 002 applied
-- =====================================================

ALTER TABLE itineraries
    ADD COLUMN budget DECIMAL(10, 2) NULL AFTER group_type;

INSERT INTO schema_version (version, description) VALUES
(5, 'Add budget column to itineraries')
ON DUPLICATE KEY UPDATE description = VALUES(description), applied_at = CURRENT_TIMESTAMP;
