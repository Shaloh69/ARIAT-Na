import { Response, NextFunction } from 'express';
import { AuthRequest, AppError } from '../types';
import { verifyAccessToken, extractToken } from '../utils/auth';

/**
 * Middleware to authenticate user or admin
 */
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      throw new AppError('No authentication token provided', 401);
    }

    const payload = verifyAccessToken(token);
    req.user = payload;

    next();
  } catch (error) {
    next(new AppError('Invalid or expired authentication token', 401));
  }
};

/**
 * Middleware to authenticate only users (Flutter app)
 */
export const authenticateUser = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      throw new AppError('No authentication token provided', 401);
    }

    const payload = verifyAccessToken(token);

    if (payload.type !== 'user') {
      throw new AppError('User authentication required', 403);
    }

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired authentication token', 401));
    }
  }
};

/**
 * Middleware to authenticate only admins (Web console)
 */
export const authenticateAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      throw new AppError('No authentication token provided', 401);
    }

    const payload = verifyAccessToken(token);

    if (payload.type !== 'admin') {
      throw new AppError('Admin authentication required', 403);
    }

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired authentication token', 401));
    }
  }
};

/**
 * Middleware to check admin role
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.type !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

    if (req.user.role && !roles.includes(req.user.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token is valid but doesn't fail
 */
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req.headers.authorization);

    if (token) {
      const payload = verifyAccessToken(token);
      req.user = payload;
    }
  } catch (error) {
    // Silently fail - authentication is optional
  }

  next();
};
