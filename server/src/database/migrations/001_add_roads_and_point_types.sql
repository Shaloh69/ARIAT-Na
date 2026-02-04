-- Migration: Add roads table and point_type to intersections
-- Date: 2026-02-04

-- Add point_type column to intersections if it doesn't exist
ALTER TABLE intersections
ADD COLUMN IF NOT EXISTS point_type ENUM('tourist_spot', 'bus_terminal', 'bus_stop', 'pier', 'intersection')
DEFAULT 'intersection' AFTER destination_id;

-- Create roads table
CREATE TABLE IF NOT EXISTS roads (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Road endpoints
    start_intersection_id VARCHAR(36) NOT NULL,
    end_intersection_id VARCHAR(36) NOT NULL,

    -- Road properties
    road_type ENUM('highway', 'main_road', 'local_road') DEFAULT 'local_road',
    distance DECIMAL(10, 2), -- kilometers
    estimated_time INT, -- minutes

    -- Path data (GeoJSON LineString coordinates as JSON)
    path JSON NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_bidirectional BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (start_intersection_id) REFERENCES intersections(id) ON DELETE CASCADE,
    FOREIGN KEY (end_intersection_id) REFERENCES intersections(id) ON DELETE CASCADE,
    INDEX idx_start_intersection (start_intersection_id),
    INDEX idx_end_intersection (end_intersection_id),
    INDEX idx_road_type (road_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
