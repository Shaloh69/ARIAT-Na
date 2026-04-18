import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError, UserResponse, AdminResponse } from "../types";
import { pool } from "../config/database";
import {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from "../utils/auth";
import { logger } from "../utils/logger";

// =====================================================
// USER AUTHENTICATION (Flutter App)
// =====================================================

/**
 * Register new user
 * POST /api/v1/auth/user/register
 */
export const registerUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { email, password, full_name, phone_number } = req.body;

  // Check if user already exists
  const [existingUsers]: any = await pool.execute(
    "SELECT id FROM users WHERE email = ?",
    [email],
  );

  if (existingUsers.length > 0) {
    throw new AppError("Email already registered", 409);
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
    type: "user",
  });

  // Fetch created user
  const [users]: any = await pool.execute(
    "SELECT id, email, full_name, phone_number, is_verified, created_at FROM users WHERE id = ?",
    [userId],
  );

  const user: UserResponse = users[0];

  res.status(201).json({
    success: true,
    message: "User registered successfully",
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
  res: Response,
): Promise<void> => {
  const { email, password } = req.body;

  // Find user
  const [users]: any = await pool.execute(
    "SELECT * FROM users WHERE email = ?",
    [email],
  );

  if (users.length === 0) {
    throw new AppError("Invalid email or password", 401);
  }

  const user = users[0];

  // Check if user is active
  if (!user.is_active) {
    throw new AppError("Account has been deactivated", 403);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Update last login
  await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [
    user.id,
  ]);

  // Generate tokens
  const tokens = await generateTokens({
    id: user.id,
    email: user.email,
    type: "user",
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
    message: "Login successful",
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
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError("User not authenticated", 401);
  }

  const [users]: any = await pool.execute(
    "SELECT id, email, full_name, phone_number, profile_image_url, is_verified, created_at FROM users WHERE id = ?",
    [req.user.id],
  );

  if (users.length === 0) {
    throw new AppError("User not found", 404);
  }

  res.json({
    success: true,
    data: users[0],
  });
};

/**
 * Update current user profile
 * PUT /api/v1/auth/user/me
 */
export const updateCurrentUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError("User not authenticated", 401);
  }

  const { full_name, phone_number, profile_image_url } = req.body;

  if (!full_name && phone_number === undefined && profile_image_url === undefined) {
    throw new AppError(
      "At least one field (full_name, phone_number, or profile_image_url) is required",
      400,
    );
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (full_name !== undefined) {
    fields.push("full_name = ?");
    values.push(full_name);
  }
  if (phone_number !== undefined) {
    fields.push("phone_number = ?");
    values.push(phone_number);
  }
  if (profile_image_url !== undefined) {
    fields.push("profile_image_url = ?");
    values.push(profile_image_url);
  }

  values.push(req.user.id);

  await pool.execute(
    `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
    values,
  );

  const [users]: any = await pool.execute(
    "SELECT id, email, full_name, phone_number, profile_image_url, is_verified, created_at FROM users WHERE id = ?",
    [req.user.id],
  );

  if (users.length === 0) {
    throw new AppError("User not found", 404);
  }

  res.json({
    success: true,
    message: "Profile updated successfully",
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
  res: Response,
): Promise<void> => {
  const { email, password } = req.body;

  // Find admin
  const [admins]: any = await pool.execute(
    "SELECT * FROM admins WHERE email = ?",
    [email],
  );

  if (admins.length === 0) {
    logger.warn("Admin login failed: email not found", { email });
    throw new AppError("Invalid email or password", 401);
  }

  const admin = admins[0];

  // Check if admin is active
  if (!admin.is_active) {
    throw new AppError("Account has been deactivated", 403);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, admin.password_hash);

  if (!isPasswordValid) {
    logger.warn("Admin login failed: wrong password", { email });
    throw new AppError("Invalid email or password", 401);
  }

  // Update last login
  await pool.execute("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [
    admin.id,
  ]);

  // Generate tokens
  const tokens = await generateTokens({
    id: admin.id,
    email: admin.email,
    type: "admin",
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
    message: "Login successful",
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
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError("Admin not authenticated", 401);
  }

  const [admins]: any = await pool.execute(
    "SELECT id, email, full_name, profile_image_url, role, is_default_password, created_at FROM admins WHERE id = ?",
    [req.user.id],
  );

  if (admins.length === 0) {
    throw new AppError("Admin not found", 404);
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
  res: Response,
): Promise<void> => {
  const { refreshToken } = req.body;

  // Verify refresh token
  const payload = await verifyRefreshToken(refreshToken);

  if (!payload) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  // Revoke old refresh token
  await revokeRefreshToken(refreshToken);

  // Generate new tokens
  const tokens = await generateTokens(payload);

  res.json({
    success: true,
    message: "Token refreshed successfully",
    data: tokens,
  });
};

/**
 * Logout (revoke refresh token)
 * POST /api/v1/auth/logout
 */
export const logout = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  res.json({
    success: true,
    message: "Logged out successfully",
  });
};

/**
 * Logout from all devices (revoke all refresh tokens)
 * POST /api/v1/auth/logout-all
 */
export const logoutAll = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError("User not authenticated", 401);
  }

  await revokeAllUserTokens(req.user.id, req.user.type);

  res.json({
    success: true,
    message: "Logged out from all devices",
  });
};

// =====================================================
// PASSWORD RESET
// =====================================================

/**
 * Request password reset — returns a 6-digit code stored in DB
 * POST /api/v1/auth/user/forgot-password
 */
export const forgotPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { email } = req.body;
  if (!email) throw new AppError("Email is required", 400);

  const [users]: any = await pool.execute(
    "SELECT id FROM users WHERE email = ? AND is_active = TRUE",
    [email],
  );

  // Always return success to avoid email enumeration
  if (users.length === 0) {
    res.json({ success: true, message: "If that email exists, a reset code has been sent." });
    return;
  }

  const userId = users[0].id;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Invalidate previous codes for this user
  await pool.execute(
    "UPDATE password_resets SET used = TRUE WHERE user_id = ?",
    [userId],
  );

  await pool.execute(
    "INSERT INTO password_resets (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)",
    [uuidv4(), userId, code, expiresAt],
  );

  logger.info(`[PASSWORD_RESET] Code for ${email}: ${code}`);

  // In production this would send an email — for now the code is logged and returned in dev
  res.json({
    success: true,
    message: "Reset code sent.",
    ...(process.env.NODE_ENV !== "production" ? { debug_code: code } : {}),
  });
};

/**
 * Reset password using code
 * POST /api/v1/auth/user/reset-password
 */
export const resetPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { email, code, new_password } = req.body;
  if (!email || !code || !new_password) {
    throw new AppError("email, code, and new_password are required", 400);
  }
  if (new_password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  const [users]: any = await pool.execute(
    "SELECT id FROM users WHERE email = ? AND is_active = TRUE",
    [email],
  );
  if (users.length === 0) throw new AppError("Invalid request", 400);
  const userId = users[0].id;

  const [resets]: any = await pool.execute(
    "SELECT id FROM password_resets WHERE user_id = ? AND code = ? AND used = FALSE AND expires_at > NOW()",
    [userId, code],
  );
  if (resets.length === 0) throw new AppError("Invalid or expired reset code", 400);

  const newHash = await hashPassword(new_password);
  await pool.execute(
    "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
    [newHash, userId],
  );
  await pool.execute(
    "UPDATE password_resets SET used = TRUE WHERE id = ?",
    [resets[0].id],
  );

  // Revoke all refresh tokens so old sessions are invalidated
  await revokeAllUserTokens(userId, "user");

  res.json({ success: true, message: "Password reset successfully. Please log in again." });
};

/**
 * Change password for authenticated user
 * POST /api/v1/auth/user/change-password
 */
export const changePassword = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) throw new AppError("Not authenticated", 401);

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    throw new AppError("current_password and new_password are required", 400);
  }
  if (new_password.length < 8) {
    throw new AppError("New password must be at least 8 characters", 400);
  }
  if (current_password === new_password) {
    throw new AppError("New password must differ from current password", 400);
  }

  const [users]: any = await pool.execute(
    "SELECT password_hash FROM users WHERE id = ? AND is_active = TRUE",
    [req.user.id],
  );
  if (users.length === 0) throw new AppError("User not found", 404);

  const valid = await comparePassword(current_password, users[0].password_hash);
  if (!valid) throw new AppError("Current password is incorrect", 401);

  const newHash = await hashPassword(new_password);
  await pool.execute(
    "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
    [newHash, req.user.id],
  );

  res.json({ success: true, message: "Password changed successfully." });
};
