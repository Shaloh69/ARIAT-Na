-- =====================================================
-- Migration 008: Routing Behavior on Fare Configs
--
-- Adds routing_behavior to fare_configs so every transport
-- type declares HOW it routes (walk, private vehicle,
-- direct fare, fixed corridor, ferry) without requiring
-- code changes for new transport types.
--
-- routing_behavior values:
--   walk              On foot, no fare
--   private           Own vehicle, no fare (car, van, motorbike)
--   direct_fare       Door-to-door with fare (taxi, Grab)
--   corridor_stops    Fixed route, board at stops only (bus, jeepney)
--   corridor_anywhere Fixed route, flag from anywhere on road (tricycle, habal-habal)
--   ferry             Pier-to-pier via sea
--
-- Safe to re-run.
-- =====================================================

-- 1. Add column if it doesn't exist
SET @s = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'fare_configs'
      AND column_name  = 'routing_behavior'
  ),
  'ALTER TABLE fare_configs ADD COLUMN routing_behavior
     ENUM(''walk'',''private'',''direct_fare'',''corridor_stops'',''corridor_anywhere'',''ferry'')
     NOT NULL DEFAULT ''direct_fare''
     AFTER peak_hour_multiplier',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- 2. Back-fill existing records based on known transport_type values

UPDATE fare_configs SET routing_behavior = 'walk'
  WHERE transport_type = 'walk' AND routing_behavior = 'direct_fare';

UPDATE fare_configs SET routing_behavior = 'private'
  WHERE transport_type IN ('private_car','hired_van','motorbike')
    AND routing_behavior = 'direct_fare';

UPDATE fare_configs SET routing_behavior = 'corridor_stops'
  WHERE transport_type IN ('jeepney','bus','bus_ac')
    AND routing_behavior = 'direct_fare';

UPDATE fare_configs SET routing_behavior = 'corridor_anywhere'
  WHERE transport_type IN ('tricycle','habal_habal')
    AND routing_behavior = 'direct_fare';

UPDATE fare_configs SET routing_behavior = 'direct_fare'
  WHERE transport_type = 'taxi' AND routing_behavior = 'direct_fare';

UPDATE fare_configs SET routing_behavior = 'ferry'
  WHERE transport_type = 'ferry' AND routing_behavior = 'direct_fare';
