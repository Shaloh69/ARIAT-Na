-- Migration: Add profile_image_url and is_default_password to admins table
-- Version: 001
-- Date: 2026-02-06

-- Add profile_image_url column to admins table
ALTER TABLE admins
ADD COLUMN profile_image_url TEXT NULL AFTER full_name;

-- Add is_default_password column to admins table
ALTER TABLE admins
ADD COLUMN is_default_password BOOLEAN DEFAULT TRUE AFTER password_hash;

-- Add index for faster queries on default password
ALTER TABLE admins
ADD INDEX idx_default_password (is_default_password);
