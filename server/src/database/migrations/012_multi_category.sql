-- 012_multi_category.sql
-- Allow destinations to have multiple categories via a junction table.

-- 1. Create junction table (idempotent)
CREATE TABLE IF NOT EXISTS destination_categories (
  id             VARCHAR(36)  NOT NULL,
  destination_id VARCHAR(36)  NOT NULL,
  category_id    VARCHAR(36)  NOT NULL,
  display_order  INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dest_cat (destination_id, category_id),
  CONSTRAINT fk_dc_destination FOREIGN KEY (destination_id)
    REFERENCES destinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_dc_category FOREIGN KEY (category_id)
    REFERENCES categories(id)    ON DELETE RESTRICT,
  INDEX idx_dc_dest (destination_id),
  INDEX idx_dc_cat  (category_id)
);

-- 2. Populate junction table from existing single category_id (idempotent via INSERT IGNORE)
INSERT IGNORE INTO destination_categories (id, destination_id, category_id, display_order)
SELECT UUID(), d.id, d.category_id, 0
FROM destinations d
WHERE d.category_id IS NOT NULL;

-- 3. Drop the FK on destinations.category_id so we can make it nullable
SET @fk := (
  SELECT kcu.CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND tc.TABLE_SCHEMA   = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME     = kcu.TABLE_NAME
  WHERE tc.TABLE_SCHEMA    = DATABASE()
    AND tc.TABLE_NAME      = 'destinations'
    AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND kcu.COLUMN_NAME    = 'category_id'
  LIMIT 1
);
SET @sql := IF(
  @fk IS NOT NULL,
  CONCAT('ALTER TABLE destinations DROP FOREIGN KEY `', @fk, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Make category_id nullable (idempotent MODIFY)
ALTER TABLE destinations MODIFY COLUMN category_id VARCHAR(36) NULL;
