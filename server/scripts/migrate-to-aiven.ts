/**
 * ARIAT-NA Database Migration Script
 * Migrates schema to Aiven MySQL
 *
 * Usage:
 *   npm install tsx --save-dev
 *   npx tsx scripts/migrate-to-aiven.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

interface MigrationConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: {
    ca: Buffer;
    rejectUnauthorized: boolean;
  };
}

async function createConnection(config: MigrationConfig) {
  return await mysql.createConnection(config);
}

async function runMigration() {
  console.log('🚀 Starting ARIAT-NA Database Migration to Aiven');
  console.log('================================================\n');

  // SSL Configuration
  const sslConfig = process.env.DB_SSL_CA
    ? {
        ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA)),
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : undefined;

  const config: MigrationConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ariat_na',
    ssl: sslConfig,
  };

  console.log('📡 Connecting to Aiven MySQL...');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   SSL: ${sslConfig ? '✅ Enabled' : '❌ Disabled'}\n`);

  let connection: mysql.Connection | null = null;

  try {
    // Test connection
    connection = await createConnection(config);
    console.log('✅ Connected to Aiven MySQL successfully\n');

    // Read schema file
    console.log('📄 Reading schema file...');
    const schemaPath = path.join(__dirname, '../src/database/schema_v2.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file loaded\n');

    // Split schema into individual statements
    console.log('🔄 Executing schema statements...\n');
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Extract table name for logging
      const tableMatch = statement.match(/CREATE TABLE\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : `Statement ${i + 1}`;

      try {
        await connection.query(statement);
        console.log(`   ✅ ${tableName}`);
        successCount++;
      } catch (error: any) {
        // Ignore "table already exists" errors
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`   ⚠️  ${tableName} (already exists - skipped)`);
        } else {
          console.error(`   ❌ ${tableName}`);
          console.error(`      Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log('\n================================================');
    console.log(`✅ Migration completed!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('================================================\n');

    // Verify tables
    console.log('🔍 Verifying tables...\n');
    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      'SHOW TABLES'
    );

    console.log(`Found ${tables.length} tables:`);
    tables.forEach((row) => {
      const tableName = Object.values(row)[0];
      console.log(`   - ${tableName}`);
    });

    console.log('\n✨ Database migration successful!');

  } catch (error: any) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tips:');
      console.error('   - Check if DB_HOST is correct');
      console.error('   - Verify DB_PORT (usually 25060 for Aiven)');
      console.error('   - Ensure your IP is whitelisted in Aiven console');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Tips:');
      console.error('   - Verify DB_USER and DB_PASSWORD are correct');
      console.error('   - Check if user has proper permissions');
    } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      console.error('\n💡 Tips:');
      console.error('   - Verify SSL certificate path (DB_SSL_CA)');
      console.error('   - Re-download ca.pem from Aiven console');
    }

    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Connection closed');
    }
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
