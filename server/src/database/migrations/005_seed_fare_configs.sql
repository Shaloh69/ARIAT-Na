-- =====================================================
-- Migration 005: Seed Fare Configurations
-- Philippine LTFRB / local government standard rates
-- for Cebu transport modes (2025)
-- All amounts in Philippine Peso (PHP)
-- Run once — safe to re-run (ON DUPLICATE KEY UPDATE)
-- =====================================================

INSERT INTO fare_configs
  (id, transport_type, display_name, description, base_fare, per_km_rate, minimum_fare, peak_hour_multiplier, is_active, display_order)
VALUES
  (UUID(), 'walk',        'Walking',                    'On foot — no fare',                          0.00,  0.00,  0.00, 1.00, TRUE, 1),
  (UUID(), 'tricycle',    'Tricycle',                   'LTFRB-regulated tricycle fares (Cebu City)',12.00,  2.50, 12.00, 1.00, TRUE, 2),
  (UUID(), 'jeepney',     'Jeepney',                    'LTFRB 2023 adjusted minimum fare',           13.00,  1.80, 13.00, 1.00, TRUE, 3),
  (UUID(), 'bus',         'Bus (Non-AC)',                'Provincial non-airconditioned bus',          12.00,  2.20, 12.00, 1.00, TRUE, 4),
  (UUID(), 'bus_ac',      'Bus (Air-Conditioned)',       'Provincial airconditioned bus',              15.00,  2.65, 15.00, 1.00, TRUE, 5),
  (UUID(), 'habal_habal', 'Habal-Habal (Motorcycle)',   'Motorcycle taxi / informal transport',       20.00,  5.00, 20.00, 1.00, TRUE, 6),
  (UUID(), 'taxi',        'Taxi / Grab',                'Metered taxi / ride-hailing (Cebu City)',    40.00, 13.50, 40.00, 1.20, TRUE, 7),
  (UUID(), 'ferry',       'Ferry / FastCraft',          'Inter-island ferry (Cebu inter-island ops)',  80.00, 15.00, 80.00, 1.00, TRUE, 8);
