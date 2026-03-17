-- =====================================================
-- Migration 004: Pier / Island-Hopping Routing
-- Adds is_island flag to destinations and ferry road type
-- Run once against a database that has schema_v3 + migrations 002/003
-- =====================================================

-- 1. Add is_island flag to destinations
ALTER TABLE destinations
    ADD COLUMN is_island BOOLEAN NOT NULL DEFAULT FALSE AFTER family_friendly,
    ADD INDEX idx_is_island (is_island);

-- 2. Extend road_type ENUM to include ferry routes
ALTER TABLE roads
    MODIFY road_type ENUM('highway', 'main_road', 'local_road', 'ferry') NOT NULL DEFAULT 'local_road';
