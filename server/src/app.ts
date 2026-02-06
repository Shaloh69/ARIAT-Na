import express, { Application } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { testConnection, pool } from './config/database';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { initializeWebSocket } from './services/websocket.service';
import { hashPassword } from './utils/auth';
import { v4 as uuidv4 } from 'uuid';

// Import routes
import authRoutes from './routes/auth.routes';
import destinationRoutes from './routes/destination.routes';
import categoryRoutes from './routes/category.routes';
import intersectionRoutes from './routes/intersection.routes';
import roadRoutes from './routes/road.routes';
import routeRoutes from './routes/route.routes';
import uploadRoutes from './routes/upload.routes';
import adminProfileRoutes from './routes/admin-profile.routes';

// Create Express application
const app: Application = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

// Compression middleware
app.use(compression());

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later',
});

// Apply rate limiting to API routes
app.use('/api', limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ARIAT-NA API is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API Routes
const apiPrefix = config.apiPrefix;
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/destinations`, destinationRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/intersections`, intersectionRoutes);
app.use(`${apiPrefix}/roads`, roadRoutes);
app.use(`${apiPrefix}/routes`, routeRoutes);
app.use(`${apiPrefix}/upload`, uploadRoutes);
app.use(`${apiPrefix}/admin`, adminProfileRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// =====================================================
// SERVER INITIALIZATION
// =====================================================

const PORT = config.port;

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize WebSocket server
initializeWebSocket(httpServer);

// Canonical admin credentials — always use these regardless of .env overrides
const ADMIN_EMAIL = 'admin@airat-na.com';
const ADMIN_PASSWORD = 'Admin123!';
// Known old misspelling that may exist in the database from earlier seeds
const OLD_ADMIN_EMAIL = 'admin@ariat-na.com';

/**
 * Ensure the default admin user exists in the database with the correct password.
 * This runs on every server startup so login always works
 * even if db:seed was not run after db:init.
 * Also migrates the old misspelled email (ariat → airat) if found.
 */
const ensureAdminExists = async (): Promise<void> => {
  try {

    // Check all existing admins
    const [existingAdmins]: any = await pool.execute(
      'SELECT id, email, is_active, is_default_password FROM admins'
    );
    logger.info(`[STARTUP] Existing admins: ${existingAdmins.length}`, {
      admins: existingAdmins.map((a: any) => ({ email: a.email, is_active: a.is_active })),
    });

    // Migrate old misspelled email if it exists
    const [oldAdmins]: any = await pool.execute(
      'SELECT id FROM admins WHERE email = ?',
      [OLD_ADMIN_EMAIL]
    );
    if (oldAdmins.length > 0) {
      // Check if the new email already exists (avoid duplicate)
      const [newAdmins]: any = await pool.execute(
        'SELECT id FROM admins WHERE email = ?',
        [ADMIN_EMAIL]
      );
      if (newAdmins.length === 0) {
        await pool.execute(
          'UPDATE admins SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
          [ADMIN_EMAIL, OLD_ADMIN_EMAIL]
        );
        logger.info(`[STARTUP] Migrated admin email: ${OLD_ADMIN_EMAIL} → ${ADMIN_EMAIL}`);
      } else {
        // Both exist — remove the old one
        await pool.execute('DELETE FROM admins WHERE email = ?', [OLD_ADMIN_EMAIL]);
        logger.info(`[STARTUP] Removed duplicate old admin: ${OLD_ADMIN_EMAIL}`);
      }
    }

    // Now upsert the admin with the correct email and canonical password
    const hashedPassword = await hashPassword(ADMIN_PASSWORD);

    const [result]: any = await pool.execute(
      `INSERT INTO admins (id, email, password_hash, is_default_password, full_name, profile_image_url, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = IF(is_default_password = TRUE, VALUES(password_hash), password_hash),
         updated_at = CURRENT_TIMESTAMP`,
      [uuidv4(), ADMIN_EMAIL, hashedPassword, true, 'System Administrator', null, 'super_admin', true]
    );

    if (result.affectedRows === 1) {
      logger.info(`[STARTUP] Default admin created: ${ADMIN_EMAIL}`);
    } else if (result.affectedRows === 2) {
      logger.info(`[STARTUP] Default admin password refreshed: ${ADMIN_EMAIL}`);
    } else {
      logger.info(`[STARTUP] Default admin verified: ${ADMIN_EMAIL}`);
    }
  } catch (error) {
    logger.error('[STARTUP] Failed to ensure admin exists:', error);
  }
};

const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await testConnection();

    // Ensure default admin user exists
    await ensureAdminExists();

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 API Base URL: http://localhost:${PORT}${apiPrefix}`);
      logger.info(`📊 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket server ready for real-time navigation`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

export default app;
