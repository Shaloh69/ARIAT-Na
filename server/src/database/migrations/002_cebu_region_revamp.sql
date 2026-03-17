-- =====================================================
-- Migration 002: Cebu Region Revamp
-- Adds clusters, curated_guides tables and extends
-- destinations, itineraries, itinerary_destinations
-- Run once against a v3 schema database
-- =====================================================

-- 1. Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    region_type ENUM('metro','south','north','islands','west') NOT NULL,
    description TEXT,
    center_lat DECIMAL(10, 8),
    center_lng DECIMAL(11, 8),
    recommended_trip_length VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_region_type (region_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Extend destinations
ALTER TABLE destinations
    ADD COLUMN cluster_id VARCHAR(36) NULL AFTER category_id,
    ADD COLUMN municipality VARCHAR(100) NULL AFTER address,
    ADD COLUMN budget_level ENUM('budget','mid','premium') DEFAULT 'mid' AFTER average_visit_duration,
    ADD COLUMN tags JSON NULL AFTER amenities,
    ADD COLUMN family_friendly BOOLEAN DEFAULT FALSE AFTER tags,
    ADD COLUMN transport_access TEXT NULL AFTER family_friendly;

-- Add FK + index (ignore error if already exists)
ALTER TABLE destinations
    ADD CONSTRAINT fk_destination_cluster FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL;

ALTER TABLE destinations
    ADD INDEX idx_cluster (cluster_id),
    ADD INDEX idx_municipality (municipality),
    ADD INDEX idx_budget_level (budget_level);

-- 3. Extend itineraries
ALTER TABLE itineraries
    ADD COLUMN days INT DEFAULT 1 AFTER description,
    ADD COLUMN cluster_ids JSON NULL AFTER days,
    ADD COLUMN trip_type VARCHAR(50) NULL AFTER cluster_ids,
    ADD COLUMN transport_mode VARCHAR(50) NULL AFTER trip_type,
    ADD COLUMN group_type VARCHAR(50) NULL AFTER transport_mode;

-- 4. Extend itinerary_destinations
ALTER TABLE itinerary_destinations
    ADD COLUMN day_number INT NOT NULL DEFAULT 1 AFTER itinerary_id;

-- Replace unique key to include day_number
ALTER TABLE itinerary_destinations DROP INDEX unique_itinerary_order;
ALTER TABLE itinerary_destinations ADD UNIQUE KEY unique_itinerary_day_order (itinerary_id, day_number, visit_order);

-- 5. Create curated_guides table
CREATE TABLE IF NOT EXISTS curated_guides (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    cover_image TEXT,
    tags JSON,
    clusters JSON,
    interests JSON,
    duration_label VARCHAR(50),
    days INT DEFAULT 1,
    difficulty ENUM('easy','moderate','challenging') DEFAULT 'easy',
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    destination_ids JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_featured (is_featured),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Schema version
INSERT INTO schema_version (version, description) VALUES
(4, 'Cebu Region Revamp: clusters, curated_guides, extended destinations/itineraries')
ON DUPLICATE KEY UPDATE description = VALUES(description), applied_at = CURRENT_TIMESTAMP;
