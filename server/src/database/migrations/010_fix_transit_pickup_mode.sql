-- =====================================================
-- Migration 010: Fix transit route pickup_mode
-- Sets pickup_mode='anywhere' for all transit routes
-- whose fare config has routing_behavior='corridor_anywhere'.
-- Safe to re-run.
-- =====================================================

UPDATE transit_routes tr
  JOIN fare_configs fc ON fc.id = tr.fare_config_id
SET tr.pickup_mode = 'anywhere',
    tr.updated_at  = CURRENT_TIMESTAMP
WHERE fc.routing_behavior = 'corridor_anywhere'
  AND tr.pickup_mode = 'stops_only';
