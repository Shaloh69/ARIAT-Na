const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
  });
  await conn.query(`INSERT IGNORE INTO schema_migrations (name) VALUES
    ('001_add_admin_profile_fields.sql'),
    ('002_cebu_region_revamp.sql'),
    ('002_seed_clusters.sql'),
    ('003_add_budget_to_itineraries.sql'),
    ('004_pier_island_routing.sql'),
    ('005_seed_fare_configs.sql'),
    ('006_destination_extended_fields.sql'),
    ('007_transit_routes.sql'),
    ('008_fare_config_routing_behavior.sql'),
    ('009_kiosk_sessions.sql'),
    ('010_fix_transit_pickup_mode.sql'),
    ('011_guest_accounts.sql')`);
  console.log('Stamped 001-011');
  await conn.end();
})().catch(e => { console.error(e.message); process.exit(1); });
