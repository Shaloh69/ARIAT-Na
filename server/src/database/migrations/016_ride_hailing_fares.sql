-- =====================================================
-- Migration 016: Ride-Hailing Fare Columns + Seed Grab
--
-- Adds per_minute_rate and booking_fee to fare_configs,
-- then seeds Grab entry for Cebu.
-- Updates existing metered-taxi (transport_type='taxi') with
-- confirmed per-minute and booking-fee values.
--
-- Rates sourced from in-app screenshots (Cebu, Mandaue area, 2025):
--   Metered Taxi : flag-down ₱40, ₱13.50/km, ₱2/min, booking ₱15
--   Grab Car     : base ₱40, ₱15/km, ₱2/min, booking ₱25, surge ×1.3
--
-- Safe to re-run.
-- =====================================================

-- 1. Add per_minute_rate column (rate-based fare component per minute)
SET @s = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'fare_configs'
      AND column_name  = 'per_minute_rate'
  ),
  'ALTER TABLE fare_configs ADD COLUMN per_minute_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- 2. Add booking_fee column (flat platform/booking fee per ride)
SET @s = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'fare_configs'
      AND column_name  = 'booking_fee'
  ),
  'ALTER TABLE fare_configs ADD COLUMN booking_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- 3. Backfill metered taxi with per-minute rate and booking fee
UPDATE fare_configs
   SET per_minute_rate = 2.00,
       booking_fee     = 15.00
 WHERE transport_type  = 'taxi';

-- 4. Insert Grab Car entry if not already present
INSERT INTO fare_configs
  (id, transport_type, display_name, description,
   base_fare, per_km_rate, per_minute_rate, minimum_fare,
   peak_hour_multiplier, booking_fee, is_active, display_order, routing_behavior)
SELECT UUID(), 'grab', 'Grab Car',
       'Grab ride-hailing standard car (Cebu)',
       40.00, 15.00, 2.00, 40.00, 1.30, 25.00, TRUE, 9, 'direct_fare'
 WHERE NOT EXISTS (SELECT 1 FROM fare_configs WHERE transport_type = 'grab');
