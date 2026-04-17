import express, { Application } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { config } from "./config/env";
import { testConnection, pool } from "./config/database";
import { logger } from "./utils/logger";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { initializeWebSocket } from "./services/websocket.service";
import { hashPassword } from "./utils/auth";
import { v4 as uuidv4 } from "uuid";

// Import routes
import authRoutes from "./routes/auth.routes";
import destinationRoutes from "./routes/destination.routes";
import categoryRoutes from "./routes/category.routes";
import intersectionRoutes from "./routes/intersection.routes";
import roadRoutes from "./routes/road.routes";
import routeRoutes from "./routes/route.routes";
import uploadRoutes from "./routes/upload.routes";
import adminProfileRoutes from "./routes/admin-profile.routes";
import aiRoutes from "./routes/ai.routes";
import clusterRoutes from "./routes/cluster.routes";
import guideRoutes from "./routes/guide.routes";
import fareConfigRoutes from "./routes/fareconfig.routes";
import transitRoutes from "./routes/transit.routes";
import kioskRoutes from "./routes/kiosk.routes";
import adminTeamRoutes from "./routes/admin-team.routes";
import adminUsersRoutes from "./routes/admin-users.routes";

// Create Express application
const app: Application = express();

// Trust Render's reverse proxy so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set("trust proxy", 1);

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
  }),
);

// Compression middleware
app.use(compression());

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later",
});

// Apply rate limiting to API routes
app.use("/api", limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "ARIAT-NA API is running",
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
app.use(`${apiPrefix}/ai`, aiRoutes);
app.use(`${apiPrefix}/clusters`, clusterRoutes);
app.use(`${apiPrefix}/guides`, guideRoutes);
app.use(`${apiPrefix}/fare-configs`, fareConfigRoutes);
app.use(`${apiPrefix}/transit`, transitRoutes);
app.use(`${apiPrefix}/kiosk`, kioskRoutes);
app.use(`${apiPrefix}/admin/team`, adminTeamRoutes);
app.use(`${apiPrefix}/admin/users`, adminUsersRoutes);

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

// Admin credentials sourced from environment (see config/env.ts)
const ADMIN_EMAIL = config.admin.email;
const ADMIN_PASSWORD = config.admin.password;
// Known old misspelling that may exist in the database from earlier seeds
const OLD_ADMIN_EMAIL = "admin@ariat-na.com";

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
      "SELECT id, email, is_active, is_default_password FROM admins",
    );
    logger.info(`[STARTUP] Existing admins: ${existingAdmins.length}`, {
      admins: existingAdmins.map((a: any) => ({
        email: a.email,
        is_active: a.is_active,
      })),
    });

    // Migrate old misspelled email if it exists
    const [oldAdmins]: any = await pool.execute(
      "SELECT id FROM admins WHERE email = ?",
      [OLD_ADMIN_EMAIL],
    );
    if (oldAdmins.length > 0) {
      // Check if the new email already exists (avoid duplicate)
      const [newAdmins]: any = await pool.execute(
        "SELECT id FROM admins WHERE email = ?",
        [ADMIN_EMAIL],
      );
      if (newAdmins.length === 0) {
        await pool.execute(
          "UPDATE admins SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
          [ADMIN_EMAIL, OLD_ADMIN_EMAIL],
        );
        logger.info(
          `[STARTUP] Migrated admin email: ${OLD_ADMIN_EMAIL} → ${ADMIN_EMAIL}`,
        );
      } else {
        // Both exist — remove the old one
        await pool.execute("DELETE FROM admins WHERE email = ?", [
          OLD_ADMIN_EMAIL,
        ]);
        logger.info(
          `[STARTUP] Removed duplicate old admin: ${OLD_ADMIN_EMAIL}`,
        );
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
      [
        uuidv4(),
        ADMIN_EMAIL,
        hashedPassword,
        true,
        "System Administrator",
        null,
        "super_admin",
        true,
      ],
    );

    if (result.affectedRows === 1) {
      logger.info(`[STARTUP] Default admin created: ${ADMIN_EMAIL}`);
    } else if (result.affectedRows === 2) {
      logger.info(`[STARTUP] Default admin password refreshed: ${ADMIN_EMAIL}`);
    } else {
      logger.info(`[STARTUP] Default admin verified: ${ADMIN_EMAIL}`);
    }
  } catch (error) {
    logger.error("[STARTUP] Failed to ensure admin exists:", error);
  }
};

/**
 * Auto-apply migration 002 if clusters / curated_guides tables are missing.
 * Uses information_schema to check column/table existence — safe to run every startup.
 */
const ensureMigration002 = async (): Promise<void> => {
  try {
    // --- clusters table ---
    const [clusterTables]: any = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clusters'",
    );
    if (clusterTables.length === 0) {
      logger.info("[STARTUP] Creating clusters table (migration 002)...");
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS clusters (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          region_type ENUM('metro','south','north','islands','west') NOT NULL,
          description TEXT,
          center_lat DECIMAL(10, 8),
          center_lng DECIMAL(11, 8),
          recommended_trip_length VARCHAR(50),
          is_active BOOLEAN DEFAULT TRUE,
          display_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_region_type (region_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info("[STARTUP] clusters table created.");
    }

    // --- seed clusters if empty ---
    const [clusterCount]: any = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM clusters",
    );
    if (clusterCount[0].cnt === 0) {
      logger.info("[STARTUP] Seeding clusters...");
      await pool.execute(`
        INSERT INTO clusters (id, name, slug, region_type, description, center_lat, center_lng, recommended_trip_length, is_active, display_order) VALUES
        ('cls-metro-001', 'Metro Cebu',  'metro-cebu', 'metro',   'The urban heart of Cebu — Cebu City, Mandaue, Lapu-Lapu, and Busay highlands. Close-together attractions, best for city exploration, food, heritage, and shopping.', 10.31672, 123.89071, '1–2 days', TRUE, 1),
        ('cls-south-001', 'South Cebu',  'south-cebu', 'south',   'A scenic corridor of waterfalls, whale sharks, cliff diving, and heritage towns. Stretching from Naga to Oslob, Moalboal, and Badian.', 10.00000, 123.60000, '2–3 days', TRUE, 2),
        ('cls-north-001', 'North Cebu',  'north-cebu', 'north',   'Rugged coastlines, festivals, and access to Malapascua island. Danao, Carmen, Medellin, and Daanbantayan make this corridor great for off-the-beaten-path travel.', 10.72000, 124.00000, '1–2 days', TRUE, 3),
        ('cls-isl-001',   'Islands',     'islands',    'islands', 'Cebu''s famous island getaways — Bantayan, Camotes, and Malapascua. Each island has its own vibe: Bantayan for beaches, Camotes for lakes and coves, Malapascua for thresher sharks.', 11.16000, 123.73000, '2–4 days', TRUE, 4),
        ('cls-west-001',  'West Cebu',   'west-cebu',  'west',    'The quieter western side — Toledo corridor and scenic mountain roads. Less crowded, good for day trips from Metro Cebu.', 10.36000, 123.64000, '1 day',   TRUE, 5)
        ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = CURRENT_TIMESTAMP
      `);
      logger.info("[STARTUP] Clusters seeded.");
    }

    // --- curated_guides table ---
    const [guideTables]: any = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'curated_guides'",
    );
    if (guideTables.length === 0) {
      logger.info("[STARTUP] Creating curated_guides table (migration 002)...");
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS curated_guides (
          id VARCHAR(36) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          cover_image TEXT,
          tags JSON,
          clusters JSON,
          interests JSON,
          duration_label VARCHAR(50),
          days INT DEFAULT 1,
          difficulty ENUM('easy','moderate','challenging') DEFAULT 'easy',
          is_featured BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          display_order INT DEFAULT 0,
          destination_ids JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_featured (is_featured),
          INDEX idx_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info("[STARTUP] curated_guides table created.");
    }

    // --- destinations columns from migration 002 ---
    const colChecks: [string, string][] = [
      [
        "cluster_id",
        "ALTER TABLE destinations ADD COLUMN cluster_id VARCHAR(36) NULL AFTER category_id",
      ],
      [
        "municipality",
        "ALTER TABLE destinations ADD COLUMN municipality VARCHAR(100) NULL AFTER address",
      ],
      [
        "budget_level",
        "ALTER TABLE destinations ADD COLUMN budget_level ENUM('budget','mid','premium') DEFAULT 'mid' AFTER average_visit_duration",
      ],
      [
        "tags",
        "ALTER TABLE destinations ADD COLUMN tags JSON NULL AFTER amenities",
      ],
      [
        "family_friendly",
        "ALTER TABLE destinations ADD COLUMN family_friendly BOOLEAN DEFAULT FALSE AFTER tags",
      ],
    ];
    for (const [colName, alterSql] of colChecks) {
      const [cols]: any = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'destinations' AND COLUMN_NAME = ?",
        [colName],
      );
      if (cols.length === 0) {
        logger.info(`[STARTUP] Adding destinations.${colName} column...`);
        await pool.execute(alterSql);
      }
    }

    // --- itineraries columns from migration 002 ---
    const itinCols: [string, string][] = [
      [
        "days",
        "ALTER TABLE itineraries ADD COLUMN days INT DEFAULT 1 AFTER description",
      ],
      [
        "cluster_ids",
        "ALTER TABLE itineraries ADD COLUMN cluster_ids JSON NULL AFTER days",
      ],
      [
        "trip_type",
        "ALTER TABLE itineraries ADD COLUMN trip_type VARCHAR(50) NULL AFTER cluster_ids",
      ],
      [
        "transport_mode",
        "ALTER TABLE itineraries ADD COLUMN transport_mode VARCHAR(50) NULL AFTER trip_type",
      ],
      [
        "group_type",
        "ALTER TABLE itineraries ADD COLUMN group_type VARCHAR(50) NULL AFTER transport_mode",
      ],
    ];
    for (const [colName, alterSql] of itinCols) {
      const [cols]: any = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'itineraries' AND COLUMN_NAME = ?",
        [colName],
      );
      if (cols.length === 0) {
        logger.info(`[STARTUP] Adding itineraries.${colName} column...`);
        await pool.execute(alterSql);
      }
    }

    // --- itinerary_destinations.day_number ---
    const [dayNumCols]: any = await pool.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'itinerary_destinations' AND COLUMN_NAME = 'day_number'",
    );
    if (dayNumCols.length === 0) {
      logger.info(
        "[STARTUP] Adding itinerary_destinations.day_number column...",
      );
      await pool.execute(
        "ALTER TABLE itinerary_destinations ADD COLUMN day_number INT NOT NULL DEFAULT 1 AFTER itinerary_id",
      );
    }

    // --- kiosk_sessions table ---
    const [kioskTables]: any = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kiosk_sessions'",
    );
    if (kioskTables.length === 0) {
      logger.info("[STARTUP] Creating kiosk_sessions table...");
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS kiosk_sessions (
          id VARCHAR(36) PRIMARY KEY,
          token VARCHAR(16) UNIQUE NOT NULL,
          itinerary_data LONGTEXT NOT NULL,
          days INT DEFAULT 1,
          transport_mode VARCHAR(50) DEFAULT 'private_car',
          is_claimed BOOLEAN DEFAULT FALSE,
          claimed_by VARCHAR(36) NULL,
          claimed_at TIMESTAMP NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_token (token),
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info("[STARTUP] kiosk_sessions table created.");
    }

    logger.info("[STARTUP] Migration 002 check complete.");
  } catch (error) {
    logger.error("[STARTUP] Migration 002 check failed:", error);
    // Non-fatal: server continues, but cluster/guide routes may fail
  }
};

/**
 * Auto-apply admin team migration:
 *   - admins.last_seen_at, admins.is_online
 *   - admin_chat_messages table
 * Safe idempotent checks — runs on every startup.
 */
const ensureAdminTeamMigration = async (): Promise<void> => {
  try {
    // --- admins.last_seen_at ---
    const [lsCols]: any = await pool.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'last_seen_at'",
    );
    if (lsCols.length === 0) {
      await pool.execute(
        "ALTER TABLE admins ADD COLUMN last_seen_at TIMESTAMP NULL AFTER last_login_at",
      );
      logger.info("[STARTUP] Added admins.last_seen_at");
    }

    // --- admins.is_online ---
    const [onlineCols]: any = await pool.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'is_online'",
    );
    if (onlineCols.length === 0) {
      await pool.execute(
        "ALTER TABLE admins ADD COLUMN is_online BOOLEAN DEFAULT FALSE AFTER last_seen_at",
      );
      logger.info("[STARTUP] Added admins.is_online");
    }

    // Reset all online flags on startup (clean state)
    await pool.execute("UPDATE admins SET is_online = FALSE");

    // --- admin_chat_messages table ---
    const [chatTables]: any = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_chat_messages'",
    );
    if (chatTables.length === 0) {
      await pool.execute(`
        CREATE TABLE admin_chat_messages (
          id VARCHAR(36) PRIMARY KEY,
          admin_id VARCHAR(36) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_created_at (created_at),
          FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info("[STARTUP] Created admin_chat_messages table");
    }

    logger.info("[STARTUP] Admin team migration check complete.");
  } catch (error) {
    logger.error("[STARTUP] Admin team migration failed:", error);
  }
};

const ensureEntrancePointType = async (): Promise<void> => {
  try {
    const [rows]: any = await pool.execute(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intersections' AND COLUMN_NAME = 'point_type'`,
    );
    if (rows.length > 0 && !String(rows[0].COLUMN_TYPE).includes("entrance")) {
      await pool.execute(
        `ALTER TABLE intersections MODIFY COLUMN point_type
         ENUM('tourist_spot','bus_terminal','bus_stop','pier','intersection','entrance')
         DEFAULT 'intersection'`,
      );
      logger.info("[STARTUP] Added 'entrance' to intersections.point_type ENUM");
    }
  } catch (error) {
    logger.error("[STARTUP] ensureEntrancePointType failed:", error);
  }
};

const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await testConnection();

    // Auto-apply migration 002 if tables/columns are missing
    await ensureMigration002();

    // Auto-apply admin team migration (presence + chat)
    await ensureAdminTeamMigration();

    // Ensure intersections.point_type ENUM includes 'entrance'
    await ensureEntrancePointType();

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
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled Promise Rejection:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the server
startServer();

export default app;
