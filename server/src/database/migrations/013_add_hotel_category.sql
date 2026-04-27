-- Add Hotels & Resorts category if it doesn't already exist
INSERT IGNORE INTO categories (id, name, slug, description, display_order, is_active)
VALUES (UUID(), 'Hotels & Resorts', 'hotel', 'Hotels, resorts, inns, and accommodation', 9, TRUE);
