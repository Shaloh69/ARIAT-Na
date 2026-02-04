/**
 * WebSocket Service for Real-Time Navigation
 * Handles live location updates, route recalculation, and navigation events
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/auth';
import { recalculateRoute, checkIfOffCourse } from './pathfinding.service';
import { logger } from '../utils/logger';

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

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Configure appropriately for production
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
