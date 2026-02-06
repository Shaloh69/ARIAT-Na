-- =====================================================
-- ARIAT-NA Database Schema v3
-- MySQL Database for Travel Planning System with Supabase Storage
-- Version 3: Added media_files table for Supabase storage tracking
-- Optimized for Aiven MySQL deployment
-- =====================================================

-- Create database (for local development - skip for Aiven)
-- DROP DATABASE IF EXISTS defaultdb;
-- CREATE DATABASE defaultdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE defaultdb;

-- Drop existing tables if they exist
DROP TABLE IF EXISTS media_files;
DROP TABLE IF EXISTS roads;
DROP TABLE IF EXISTS itinerary_destinations;
DROP TABLE IF EXISTS itineraries;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS favorite_destinations;
DROP TABLE IF EXISTS destinations;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS intersections;
DROP TABLE IF EXISTS fare_configs;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS admins;

-- =====================================================
-- USERS TABLE (Flutter App Users)
-- =====================================================
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    profile_image_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ADMINS TABLE (Web Console Admins)
-- =====================================================
CREATE TABLE admins (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- REFRESH TOKENS TABLE (For JWT Refresh Tokens)
-- =====================================================
CREATE TABLE refresh_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    admin_id VARCHAR(36),
    token VARCHAR(500) UNIQUE NOT NULL,
    user_type ENUM('user', 'admin') NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    INDEX idx_admin_id (admin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- CATEGORIES TABLE
-- =====================================================
CREATE TABLE categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- INTERSECTIONS TABLE (Road Network Nodes)
-- =====================================================
CREATE TABLE intersections (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    is_destination BOOLEAN DEFAULT FALSE,
    destination_id VARCHAR(36) NULL,
    point_type ENUM('tourist_spot', 'bus_terminal', 'bus_stop', 'pier', 'intersection') DEFAULT 'intersection',
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_coordinates (latitude, longitude),
    INDEX idx_is_destination (is_destination),
    INDEX idx_point_type (point_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ROADS TABLE (Road Network Edges)
-- =====================================================
CREATE TABLE roads (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_intersection_id VARCHAR(36) NOT NULL,
    end_intersection_id VARCHAR(36) NOT NULL,
    road_type ENUM('highway', 'main_road', 'local_road') DEFAULT 'local_road',
    distance DECIMAL(10, 2),
    estimated_time INT,
    path JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_bidirectional BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (start_intersection_id) REFERENCES intersections(id) ON DELETE CASCADE,
    FOREIGN KEY (end_intersection_id) REFERENCES intersections(id) ON DELETE CASCADE,
    INDEX idx_start_intersection (start_intersection_id),
    INDEX idx_end_intersection (end_intersection_id),
    INDEX idx_road_type (road_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DESTINATIONS TABLE (Tourist Spots)
-- =====================================================
CREATE TABLE destinations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(36) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT,
    nearest_intersection_id VARCHAR(36),
    images JSON,
    operating_hours JSON,
    entrance_fee_local DECIMAL(10, 2) DEFAULT 0,
    entrance_fee_foreign DECIMAL(10, 2) DEFAULT 0,
    average_visit_duration INT DEFAULT 120,
    best_time_to_visit TEXT,
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INT DEFAULT 0,
    popularity_score INT DEFAULT 0,
    amenities JSON,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (nearest_intersection_id) REFERENCES intersections(id) ON DELETE SET NULL,
    INDEX idx_category (category_id),
    INDEX idx_coordinates (latitude, longitude),
    INDEX idx_active (is_active),
    INDEX idx_featured (is_featured),
    INDEX idx_rating (rating),
    INDEX idx_popularity (popularity_score),
    FULLTEXT INDEX idx_search (name, description, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- MEDIA FILES TABLE (Supabase Storage Tracking)
-- New in v3: Track all uploaded files from Supabase Storage
-- =====================================================
CREATE TABLE media_files (
    id VARCHAR(36) PRIMARY KEY,
    file_type ENUM('image', 'video', 'document') NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    public_url TEXT NOT NULL,
    thumbnail_url TEXT,
    entity_type ENUM('destination', 'category', 'user', 'review', 'other') NOT NULL,
    entity_id VARCHAR(36),
    uploaded_by VARCHAR(36),
    upload_source ENUM('admin', 'user', 'system') DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_file_type (file_type),
    INDEX idx_uploaded_by (uploaded_by),
    INDEX idx_created_at (created_at),
    UNIQUE KEY unique_storage_path (storage_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- FARE CONFIGS TABLE
-- =====================================================
CREATE TABLE fare_configs (
    id VARCHAR(36) PRIMARY KEY,
    transport_type VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_fare DECIMAL(10, 2) NOT NULL,
    per_km_rate DECIMAL(10, 2) NOT NULL,
    minimum_fare DECIMAL(10, 2) NOT NULL,
    peak_hour_multiplier DECIMAL(3, 2) DEFAULT 1.0,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transport_type (transport_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- FAVORITE DESTINATIONS TABLE
-- =====================================================
CREATE TABLE favorite_destinations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    destination_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE,
    UNIQUE KEY unique_favorite (user_id, destination_id),
    INDEX idx_user_id (user_id),
    INDEX idx_destination_id (destination_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- REVIEWS TABLE
-- =====================================================
CREATE TABLE reviews (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    destination_id VARCHAR(36) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    images JSON,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_destination_id (destination_id),
    INDEX idx_rating (rating),
    INDEX idx_approved (is_approved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ITINERARIES TABLE (Saved User Itineraries)
-- =====================================================
CREATE TABLE itineraries (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    start_latitude DECIMAL(10, 8),
    start_longitude DECIMAL(11, 8),
    start_address TEXT,
    optimize_for ENUM('distance', 'time', 'cost') DEFAULT 'time',
    transport_type VARCHAR(50),
    optimized_route JSON,
    total_distance DECIMAL(10, 2),
    estimated_time INT,
    estimated_cost DECIMAL(10, 2),
    is_saved BOOLEAN DEFAULT TRUE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ITINERARY DESTINATIONS (Many-to-Many)
-- =====================================================
CREATE TABLE itinerary_destinations (
    id VARCHAR(36) PRIMARY KEY,
    itinerary_id VARCHAR(36) NOT NULL,
    destination_id VARCHAR(36) NOT NULL,
    visit_order INT NOT NULL,
    planned_duration INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
    FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE,
    UNIQUE KEY unique_itinerary_order (itinerary_id, visit_order),
    INDEX idx_itinerary_id (itinerary_id),
    INDEX idx_destination_id (destination_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SCHEMA VERSION TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS schema_version (
    version INT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_version (version, description) VALUES
(3, 'Added media_files table for Supabase Storage tracking and optimized for Aiven MySQL');
