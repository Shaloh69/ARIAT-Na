import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, AppError, UserResponse, AdminResponse } from '../types';
import { pool } from '../config/database';
import {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '../utils/auth';

// =====================================================
// USER AUTHENTICATION (Flutter App)
// =====================================================

/**
 * Register new user
 * POST /api/v1/auth/user/register
 */
export const registerUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { email, password, full_name, phone_number } = req.body;

  // Check if user already exists
  const [existingUsers]: any = await pool.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );

  if (existingUsers.length > 0) {
    throw new AppError('Email already registered', 409);
  }

  // Hash password
  const password_hash = await hashPassword(password);

  // Create user
  const userId = uuidv4();
  const sql = `
    INSERT INTO users (id, email, password_hash, full_name, phone_number, is_verified, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    userId,
    email,
    password_hash,
    full_name,
    phone_number || null,
    false,
    true,
  ]);

  // Generate tokens
  const tokens = await generateTokens({
    id: userId,
    email,
    type: 'user',
  });

  // Fetch created user
  const [users]: any = await pool.execute(
    'SELECT id, email, full_name, phone_number, is_verified, created_at FROM users WHERE id = ?',
    [userId]
  );

  const user: UserResponse = users[0];

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user,
      ...tokens,
    },
  });
};

/**
 * Login user
 * POST /api/v1/auth/user/login
 */
export const loginUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { email, password } = req.body;

  // Find user
  const [users]: any = await pool.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );

  if (users.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = users[0];

  // Check if user is active
  if (!user.is_active) {
    throw new AppError('Account has been deactivated', 403);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login
  await pool.execute(
    'UPDATE users SET last_login_at = NOW() WHERE id = ?',
    [user.id]
  );

  // Generate tokens
  const tokens = await generateTokens({
    id: user.id,
    email: user.email,
    type: 'user',
  });

  const userResponse: UserResponse = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone_number: user.phone_number,
    profile_image_url: user.profile_image_url,
    is_verified: user.is_verified,
    created_at: user.created_at,
  };

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userResponse,
      ...tokens,
    },
  });
};

/**
 * Get current user profile
 * GET /api/v1/auth/user/me
 */
export const getCurrentUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  const [users]: any = await pool.execute(
    'SELECT id, email, full_name, phone_number, profile_image_url, is_verified, created_at FROM users WHERE id = ?',
    [req.user.id]
  );

  if (users.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: users[0],
  });
};

// =====================================================
// ADMIN AUTHENTICATION (Web Console)
// =====================================================

/**
 * Login admin
 * POST /api/v1/auth/admin/login
 */
export const loginAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { email, password } = req.body;

  // Find admin
  const [admins]: any = await pool.execute(
    'SELECT * FROM admins WHERE email = ?',
    [email]
  );

  if (admins.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const admin = admins[0];

  // Check if admin is active
  if (!admin.is_active) {
    throw new AppError('Account has been deactivated', 403);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, admin.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login
  await pool.execute(
    'UPDATE admins SET last_login_at = NOW() WHERE id = ?',
    [admin.id]
  );

  // Generate tokens
  const tokens = await generateTokens({
    id: admin.id,
    email: admin.email,
    type: 'admin',
    role: admin.role,
  });

  const adminResponse: AdminResponse = {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    profile_image_url: admin.profile_image_url,
    role: admin.role,
    is_default_password: admin.is_default_password || false,
    created_at: admin.created_at,
  };

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      admin: adminResponse,
      ...tokens,
    },
  });
};

/**
 * Get current admin profile
 * GET /api/v1/auth/admin/me
 */
export const getCurrentAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('Admin not authenticated', 401);
  }

  const [admins]: any = await pool.execute(
    'SELECT id, email, full_name, profile_image_url, role, is_default_password, created_at FROM admins WHERE id = ?',
    [req.user.id]
  );

  if (admins.length === 0) {
    throw new AppError('Admin not found', 404);
  }

  res.json({
    success: true,
    data: admins[0],
  });
};

// =====================================================
// SHARED AUTHENTICATION FUNCTIONS
// =====================================================

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
export const refreshAccessToken = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { refreshToken } = req.body;

  // Verify refresh token
  const payload = await verifyRefreshToken(refreshToken);

  if (!payload) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Revoke old refresh token
  await revokeRefreshToken(refreshToken);

  // Generate new tokens
  const tokens = await generateTokens(payload);

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: tokens,
  });
};

/**
 * Logout (revoke refresh token)
 * POST /api/v1/auth/logout
 */
export const logout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

/**
 * Logout from all devices (revoke all refresh tokens)
 * POST /api/v1/auth/logout-all
 */
export const logoutAll = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  await revokeAllUserTokens(req.user.id, req.user.type);

  res.json({
    success: true,
    message: 'Logged out from all devices',
  });
};
