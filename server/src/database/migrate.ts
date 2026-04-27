/**
 * Migration runner — applies any unapplied SQL files from src/database/migrations/
 * in alphabetical order. Tracks applied migrations in a `schema_migrations` table.
 *
 * Usage:
 *   npm run db:migrate
 */

import mysql from "mysql2/promise";
import { config } from "../config/env";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function run(): Promise<void> {
  const conn = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    multipleStatements: true,
  });

  try {
    // Ensure tracking table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      )
    `);

    // Fetch already-applied migrations
    const [applied] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT name FROM schema_migrations ORDER BY name ASC",
    );
    const appliedSet = new Set((applied as any[]).map((r: any) => r.name));

    // Collect migration files sorted alphabetically
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log("✅ No pending migrations — database is up to date.");
      return;
    }

    console.log(`🔄 Running ${pending.length} migration(s)…\n`);

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      process.stdout.write(`  ▶ ${file} … `);
      try {
        await conn.query(sql);
        await conn.query(
          "INSERT INTO schema_migrations (name) VALUES (?)",
          [file],
        );
        console.log("✓");
      } catch (err: any) {
        console.log("✗");
        console.error(`\n❌ Migration failed: ${file}`);
        console.error(err.message ?? err);
        process.exit(1);
      }
    }

    console.log("\n✅ All migrations applied successfully.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Migration runner error:", err);
  process.exit(1);
});
