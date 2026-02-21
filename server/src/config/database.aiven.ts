import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// SSL Configuration for Aiven MySQL
const sslConfig = process.env.DB_SSL_CA
  ? {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA)),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    }
  : undefined;

// Database connection pool configuration
const poolConfig: mysql.PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ariat_na',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // SSL configuration for Aiven
  ssl: sslConfig,
};

// Create connection pool
export const pool = mysql.createPool(poolConfig);

// Test database connection
export const testConnection = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log(`   Host: ${poolConfig.host}`);
    console.log(`   Database: ${poolConfig.database}`);
    console.log(`   SSL: ${sslConfig ? 'Enabled' : 'Disabled'}`);
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Execute query helper
export const query = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T> => {
  try {
    const [rows] = params.length
      ? await pool.execute(sql, params)
      : await pool.execute(sql);
    return rows as T;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Transaction helper
export const transaction = async <T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export default pool;
