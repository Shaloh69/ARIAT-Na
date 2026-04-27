-- Unify hotel category slugs: rename "resorts-hotels" → "hotel" so the
-- kiosk interest filter (value="hotel") matches via category slug as well as tags.
-- If a separate "hotel" slug row already exists (from migration 013), merge by
-- re-pointing destination_categories rows then deleting the duplicate.

-- Step 1: re-point any destination_categories rows that point to the "hotel" (013) row
--         to instead point to the "resorts-hotels" row (so we keep the richer name).
UPDATE destination_categories dc
  JOIN categories old_cat ON dc.category_id = old_cat.id AND old_cat.slug = 'hotel'
  JOIN categories keep_cat ON keep_cat.slug = 'resorts-hotels'
SET dc.category_id = keep_cat.id
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'resorts-hotels');

-- Step 2: delete the stub "Hotels & Resorts" row added by migration 013 (if present)
DELETE FROM categories WHERE slug = 'hotel';

-- Step 3: rename the real category slug to "hotel"
UPDATE categories SET slug = 'hotel' WHERE slug = 'resorts-hotels';
