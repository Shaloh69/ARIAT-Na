-- Migration 011: Guest accounts
-- Adds is_guest flag to users table so the app can identify temporary guest sessions.

ALTER TABLE users
  ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active;

-- Auto-cleanup: remove guest accounts older than 7 days (run periodically via cron/event)
-- CREATE EVENT cleanup_guest_accounts
--   ON SCHEDULE EVERY 1 DAY
--   DO DELETE FROM users WHERE is_guest = TRUE AND created_at < NOW() - INTERVAL 7 DAY;
