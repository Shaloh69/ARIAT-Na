-- =====================================================
-- Migration 007: Transit Routes
-- Defines fixed-route corridors for jeepney, bus, ferry,
-- tricycle, and habal-habal, each linked to a fare config.
-- pickup_mode controls whether passengers can board anywhere
-- or only at designated stops/terminals/piers.
-- Safe to re-run.
-- =====================================================

SET @s = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'transit_routes'),
  'CREATE TABLE transit_routes (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    fare_config_id VARCHAR(36)  NOT NULL,
    route_name     VARCHAR(100) NOT NULL,
    transport_type VARCHAR(50)  NOT NULL,
    road_ids       JSON         NOT NULL,
    stop_ids       JSON         NOT NULL,
    pickup_mode    ENUM(''anywhere'',''stops_only'') NOT NULL DEFAULT ''stops_only'',
    color          VARCHAR(7)   NOT NULL DEFAULT ''#3b82f6'',
    description    TEXT,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tr_fare_config FOREIGN KEY (fare_config_id)
      REFERENCES fare_configs(id) ON DELETE CASCADE
  )',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- Index for fast lookup by transport type
SET @s = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics
              WHERE table_schema = DATABASE()
                AND table_name = 'transit_routes'
                AND index_name  = 'idx_tr_transport_type'),
  'ALTER TABLE transit_routes ADD INDEX idx_tr_transport_type (transport_type)',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- Index for fare config lookup
SET @s = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics
              WHERE table_schema = DATABASE()
                AND table_name = 'transit_routes'
                AND index_name  = 'idx_tr_fare_config'),
  'ALTER TABLE transit_routes ADD INDEX idx_tr_fare_config (fare_config_id)',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;
