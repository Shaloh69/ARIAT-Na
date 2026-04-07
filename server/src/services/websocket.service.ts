/**
 * WebSocket Service
 * - /          → user navigation (real-time routing)
 * - /admin     → admin presence & group chat
 */

import { Server as HttpServer } from 'http';
import { Server, Socket, Namespace } from 'socket.io';
import { verifyAccessToken } from '../utils/auth';
import { recalculateRoute, checkIfOffCourse } from './pathfinding.service';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

interface NavigationSession {
  userId: string;
  sessionId: string;
  route: any;
  currentPosition: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  optimizeFor: 'distance' | 'time';
  lastUpdate: Date;
}

// Active navigation sessions
const activeSessions = new Map<string, NavigationSession>();

// Socket.IO server instance
let io: Server;

// Admin namespace
let adminNs: Namespace;

// Online admins map: adminId → { socketId, full_name, profile_image_url, role }
interface OnlineAdmin {
  socketId: string;
  adminId: string;
  full_name: string;
  profile_image_url: string | null;
  role: string;
}
const onlineAdmins = new Map<string, OnlineAdmin>();

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`, {
      userId: socket.data.user?.id,
      userType: socket.data.user?.type,
    });

    // Join user to their personal room
    if (socket.data.user?.id) {
      socket.join(`user:${socket.data.user.id}`);
    }

    // Handle navigation session start
    socket.on('navigation:start', async (data) => {
      try {
        const { sessionId, route, destination, optimizeFor = 'distance' } = data;

        if (!sessionId || !route || !destination) {
          socket.emit('navigation:error', { message: 'Missing required navigation data' });
          return;
        }

        // Create navigation session
        const session: NavigationSession = {
          userId: socket.data.user.id,
          sessionId,
          route,
          currentPosition: { lat: 0, lon: 0 },
          destination,
          optimizeFor,
          lastUpdate: new Date(),
        };

        activeSessions.set(sessionId, session);
        socket.join(`navigation:${sessionId}`);

        logger.info(`Navigation session started: ${sessionId}`, { userId: socket.data.user.id });

        socket.emit('navigation:started', {
          sessionId,
          message: 'Navigation session started successfully',
        });
      } catch (error) {
        logger.error('Error starting navigation session:', error);
        socket.emit('navigation:error', { message: 'Failed to start navigation session' });
      }
    });

    // Handle location updates
    socket.on('navigation:location-update', async (data) => {
      try {
        const { sessionId, latitude, longitude, heading, speed } = data;

        if (!sessionId || latitude === undefined || longitude === undefined) {
          socket.emit('navigation:error', { message: 'Invalid location data' });
          return;
        }

        const session = activeSessions.get(sessionId);

        if (!session) {
          socket.emit('navigation:error', { message: 'Navigation session not found' });
          return;
        }

        if (session.userId !== socket.data.user?.id) {
          socket.emit('navigation:error', { message: 'Unauthorized session access' });
          return;
        }

        // Update current position
        session.currentPosition = { lat: latitude, lon: longitude };
        session.lastUpdate = new Date();

        // Check if user is off course
        if (session.route && session.route.roads && session.route.path) {
          const offCourseCheck = await checkIfOffCourse(
            latitude,
            longitude,
            session.route.path,
            session.route.roads,
            0.15 // 150m threshold
          );

          if (offCourseCheck.isOffCourse) {
            logger.info(`User off course in session ${sessionId}, recalculating...`);

            // Recalculate route
            const recalculation = await recalculateRoute(
              latitude,
              longitude,
              session.destination.lat,
              session.destination.lon,
              session.optimizeFor
            );

            if (recalculation.route && recalculation.route.success) {
              session.route = recalculation.route;

              // Notify user of route recalculation
              io.to(`navigation:${sessionId}`).emit('navigation:route-recalculated', {
                reason: 'off_course',
                offCourseDistance: offCourseCheck.distance,
                newRoute: {
                  path: recalculation.route.path,
                  roads: recalculation.route.roads,
                  totalDistance: recalculation.route.totalDistance,
                  estimatedTime: recalculation.route.estimatedTime,
                  steps: recalculation.route.steps,
                  virtualConnections: recalculation.route.virtualConnections,
                },
              });
            }
          } else {
            // User is on course, send progress update
            io.to(`navigation:${sessionId}`).emit('navigation:progress', {
              currentPosition: { latitude, longitude, heading, speed },
              distanceToNext: offCourseCheck.distance,
              nearestRoadIndex: offCourseCheck.nearestRoadIndex,
              isOnCourse: true,
            });
          }
        }
      } catch (error) {
        logger.error('Error processing location update:', error);
        socket.emit('navigation:error', { message: 'Failed to process location update' });
      }
    });

    // Handle navigation instructions request
    socket.on('navigation:get-next-instruction', (data) => {
      try {
        const { sessionId } = data;
        const session = activeSessions.get(sessionId);

        if (!session || !session.route) {
          socket.emit('navigation:error', { message: 'No active navigation session' });
          return;
        }

        if (session.userId !== socket.data.user?.id) {
          socket.emit('navigation:error', { message: 'Unauthorized session access' });
          return;
        }

        // Send next instruction
        const steps = session.route.steps;
        if (steps && steps.length > 0) {
          socket.emit('navigation:instruction', {
            currentStep: steps[0],
            remainingSteps: steps.length,
            totalDistance: session.route.totalDistance,
            estimatedTime: session.route.estimatedTime,
          });
        }
      } catch (error) {
        logger.error('Error getting next instruction:', error);
        socket.emit('navigation:error', { message: 'Failed to get navigation instruction' });
      }
    });

    // Handle navigation session end
    socket.on('navigation:end', (data) => {
      try {
        const { sessionId } = data;

        if (sessionId) {
          activeSessions.delete(sessionId);
          socket.leave(`navigation:${sessionId}`);
          logger.info(`Navigation session ended: ${sessionId}`);
        }

        socket.emit('navigation:ended', { sessionId });
      } catch (error) {
        logger.error('Error ending navigation session:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id}`, { reason });

      // Clean up sessions for this user
      activeSessions.forEach((session, sessionId) => {
        if (session.userId === socket.data.user?.id) {
          // Don't immediately delete - keep for a few minutes in case of reconnection
          setTimeout(() => {
            if (activeSessions.has(sessionId)) {
              activeSessions.delete(sessionId);
              logger.info(`Cleaned up abandoned session: ${sessionId}`);
            }
          }, 5 * 60 * 1000); // 5 minutes
        }
      });
    });
  });

  // Clean up stale sessions periodically
  setInterval(() => {
    const now = new Date();
    activeSessions.forEach((session, sessionId) => {
      const timeSinceUpdate = now.getTime() - session.lastUpdate.getTime();
      if (timeSinceUpdate > 30 * 60 * 1000) {
        // 30 minutes
        activeSessions.delete(sessionId);
        logger.info(`Removed stale navigation session: ${sessionId}`);
      }
    });
  }, 10 * 60 * 1000); // Every 10 minutes

  // ─── Admin namespace: /admin ─────────────────────────────────────────────────
  adminNs = io.of('/admin');

  // Auth middleware — admin only
  adminNs.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      if (payload.type !== 'admin') return next(new Error('Admin access required'));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid authentication token'));
    }
  });

  adminNs.on('connection', async (socket: Socket) => {
    const { id: adminId } = socket.data.user;

    // Fetch full admin profile for broadcast
    try {
      const [rows]: any = await pool.execute(
        'SELECT full_name, profile_image_url, role FROM admins WHERE id = ? AND is_active = TRUE',
        [adminId]
      );
      if (rows.length === 0) { socket.disconnect(); return; }

      const { full_name, profile_image_url, role } = rows[0];

      // Register as online
      onlineAdmins.set(adminId, { socketId: socket.id, adminId, full_name, profile_image_url, role });

      await pool.execute(
        'UPDATE admins SET is_online = TRUE, last_seen_at = NOW() WHERE id = ?',
        [adminId]
      );

      socket.join('admin:room');
      logger.info(`[ADMIN WS] ${full_name} connected`);

      // Send current online list to the newly connected admin
      socket.emit('admin:online-list', { admins: Array.from(onlineAdmins.values()) });

      // Broadcast join to everyone else
      socket.to('admin:room').emit('admin:joined', {
        adminId, full_name, profile_image_url, role,
      });

    } catch (err) {
      logger.error('[ADMIN WS] Error on connect:', err);
      socket.disconnect();
      return;
    }

    // ── Heartbeat — keep last_seen_at fresh ──────────────────────────────────
    socket.on('admin:heartbeat', async () => {
      try {
        await pool.execute(
          'UPDATE admins SET last_seen_at = NOW() WHERE id = ?',
          [adminId]
        );
      } catch { /* non-fatal */ }
    });

    // ── Group chat message ────────────────────────────────────────────────────
    socket.on('admin:chat', async (data: { message: string }) => {
      const text = (data?.message ?? '').trim();
      if (!text || text.length > 2000) {
        socket.emit('admin:error', { message: 'Message must be 1–2000 characters' });
        return;
      }

      try {
        const msgId = uuidv4();
        const admin = onlineAdmins.get(adminId);

        await pool.execute(
          'INSERT INTO admin_chat_messages (id, admin_id, message) VALUES (?, ?, ?)',
          [msgId, adminId, text]
        );

        const payload = {
          id: msgId,
          admin_id: adminId,
          admin_name: admin?.full_name ?? 'Unknown',
          profile_image_url: admin?.profile_image_url ?? null,
          message: text,
          created_at: new Date().toISOString(),
        };

        // Broadcast to all admins in the room (including sender)
        adminNs.to('admin:room').emit('admin:chat', payload);

      } catch (err) {
        logger.error('[ADMIN WS] Chat save error:', err);
        socket.emit('admin:error', { message: 'Failed to send message' });
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      onlineAdmins.delete(adminId);
      try {
        await pool.execute(
          'UPDATE admins SET is_online = FALSE, last_seen_at = NOW() WHERE id = ?',
          [adminId]
        );
      } catch { /* non-fatal */ }

      socket.to('admin:room').emit('admin:left', { adminId });
      logger.info(`[ADMIN WS] ${adminId} disconnected (${reason})`);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Get Socket.IO server instance
 */
export function getIO(): Server {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
}

/**
 * Send real-time update to specific user
 */
export function sendToUser(userId: string, event: string, data: any): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Send real-time update to navigation session
 */
export function sendToSession(sessionId: string, event: string, data: any): void {
  if (io) {
    io.to(`navigation:${sessionId}`).emit(event, data);
  }
}

/**
 * Get active navigation sessions count
 */
export function getActiveSessionsCount(): number {
  return activeSessions.size;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): NavigationSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get current online admin list (for REST fallback)
 */
export function getOnlineAdmins(): OnlineAdmin[] {
  return Array.from(onlineAdmins.values());
}
