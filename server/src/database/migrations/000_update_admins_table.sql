-- Migration: Update admins table with new fields if they don't exist
-- This is a safe migration that can be run on existing databases

-- Add profile_image_url if it doesn't exist
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admins'
     AND COLUMN_NAME = 'profile_image_url') = 0,
    'ALTER TABLE admins ADD COLUMN profile_image_url TEXT AFTER full_name',
    'SELECT ''Column profile_image_url already exists'' AS Info'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add is_default_password if it doesn't exist
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admins'
     AND COLUMN_NAME = 'is_default_password') = 0,
    'ALTER TABLE admins ADD COLUMN is_default_password BOOLEAN DEFAULT TRUE AFTER password_hash',
    'SELECT ''Column is_default_password already exists'' AS Info'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for is_default_password if it doesn't exist
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'admins'
     AND INDEX_NAME = 'idx_default_password') = 0,
    'ALTER TABLE admins ADD INDEX idx_default_password (is_default_password)',
    'SELECT ''Index idx_default_password already exists'' AS Info'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update existing admin records to have is_default_password = TRUE
UPDATE admins SET is_default_password = TRUE WHERE is_default_password IS NULL;

SELECT 'Migration completed successfully!' AS Status;
