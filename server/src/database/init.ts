import mysql from 'mysql2/promise';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize the database
 * This script creates the database if it doesn't exist and runs the schema
 */
export const initDatabase = async (): Promise<void> => {
  console.log('🚀 Initializing database...');

  // Create connection without database
  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    multipleStatements: true,
  });

  try {
    // Create database if not exists
    console.log(`📦 Creating database: ${config.database.name}`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.database.name}`);
    console.log(`✅ Database '${config.database.name}' ready`);

    // Use the database
    await connection.query(`USE ${config.database.name}`);

    // Read and execute schema file
    const schemaPath = path.join(__dirname, 'schema_v3.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('📝 Creating tables...');
    await connection.query(schema);
    console.log('✅ Tables created successfully');

    console.log('✅ Database initialization completed!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
};

// Run initialization if executed directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('✅ Database is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
