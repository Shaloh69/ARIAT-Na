import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run database migrations
 */
export const runMigrations = async (): Promise<void> => {
  console.log('🔄 Running database migrations...');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations/001_add_roads_and_point_types.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    // Split by semicolon and execute each statement
    const statements = migration
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await pool.query(statement);
      }
    }

    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migrations if executed directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
