-- Align category slugs with kiosk interest filter values.
-- INSERT IGNORE means existing slugs are untouched; only missing ones are added.

INSERT IGNORE INTO categories (id, name, slug, description, display_order, is_active) VALUES
  (UUID(), 'Beaches',          'beach',       'Beach and coastal destinations',               1,  TRUE),
  (UUID(), 'Mountains & Nature','nature',     'Mountains, hills, and natural parks',          2,  TRUE),
  (UUID(), 'Heritage & History','heritage',   'Historical sites, museums, and landmarks',     3,  TRUE),
  (UUID(), 'Food & Dining',    'food',        'Restaurants, cafes, and food destinations',    4,  TRUE),
  (UUID(), 'Adventure',        'adventure',   'Outdoor activities, diving, hiking, water sports', 5, TRUE),
  (UUID(), 'Shopping',         'shopping',    'Malls, markets, and shopping centres',         6,  TRUE),
  (UUID(), 'Religious Sites',  'religion',    'Churches, temples, and spiritual landmarks',   7,  TRUE),
  (UUID(), 'Wildlife & Marine','wildlife',    'Wildlife sanctuaries and marine life',         8,  TRUE),
  (UUID(), 'Waterfalls',       'waterfall',   'Waterfalls and river destinations',            9,  TRUE),
  (UUID(), 'Scenic Views',     'scenic',      'Viewpoints, panoramas, and scenic spots',      10, TRUE),
  (UUID(), 'Entertainment',    'entertainment','Theme parks, shows, and entertainment venues',11, TRUE),
  (UUID(), 'Hotels & Accommodations','hotel', 'Hotels, resorts, inns, and lodging',           12, TRUE);
