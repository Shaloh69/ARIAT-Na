-- Migration 009: kiosk_sessions table
-- Stores itineraries generated at physical kiosks, claimable via QR scan.

CREATE TABLE IF NOT EXISTS kiosk_sessions (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    token        VARCHAR(16)  NOT NULL UNIQUE,
    itinerary_data LONGTEXT   NOT NULL,
    days         INT          NOT NULL DEFAULT 1,
    transport_mode VARCHAR(50),
    is_claimed   BOOLEAN      NOT NULL DEFAULT FALSE,
    claimed_by   VARCHAR(36)  NULL,
    claimed_at   TIMESTAMP    NULL,
    expires_at   TIMESTAMP    NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_token      (token),
    INDEX idx_expires_at (expires_at),
    INDEX idx_claimed_by (claimed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
