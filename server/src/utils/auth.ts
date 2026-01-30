import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { pool } from '../config/database';
import { TokenPayload, AuthTokens } from '../types';

/**
 * Hash a password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generate JWT access token
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload as object, config.jwt.secret, {
    expiresIn: '7d', // 7 days
  });
};

/**
 * Generate JWT refresh token
 */
export const generateRefreshToken = (): string => {
  return uuidv4();
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokens = async (
  payload: TokenPayload
): Promise<AuthTokens> => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();

  // Store refresh token in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  const sql = `
    INSERT INTO refresh_tokens (id, user_id, admin_id, token, user_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    uuidv4(),
    payload.type === 'user' ? payload.id : null,
    payload.type === 'admin' ? payload.id : null,
    refreshToken,
    payload.type,
    expiresAt,
  ]);

  return {
    accessToken,
    refreshToken,
  };
};

/**
 * Verify JWT access token
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = async (
  token: string
): Promise<TokenPayload | null> => {
  const sql = `
    SELECT rt.*, u.email as user_email, a.email as admin_email
    FROM refresh_tokens rt
    LEFT JOIN users u ON rt.user_id = u.id
    LEFT JOIN admins a ON rt.admin_id = a.id
    WHERE rt.token = ? AND rt.expires_at > NOW()
  `;

  const [rows]: any = await pool.execute(sql, [token]);

  if (rows.length === 0) {
    return null;
  }

  const tokenData = rows[0];

  return {
    id: tokenData.user_type === 'user' ? tokenData.user_id : tokenData.admin_id,
    email: tokenData.user_type === 'user' ? tokenData.user_email : tokenData.admin_email,
    type: tokenData.user_type,
    role: tokenData.user_type === 'admin' ? tokenData.role : undefined,
  };
};

/**
 * Revoke refresh token
 */
export const revokeRefreshToken = async (token: string): Promise<void> => {
  const sql = 'DELETE FROM refresh_tokens WHERE token = ?';
  await pool.execute(sql, [token]);
};

/**
 * Revoke all refresh tokens for a user
 */
export const revokeAllUserTokens = async (
  userId: string,
  userType: 'user' | 'admin'
): Promise<void> => {
  const column = userType === 'user' ? 'user_id' : 'admin_id';
  const sql = `DELETE FROM refresh_tokens WHERE ${column} = ?`;
  await pool.execute(sql, [userId]);
};

/**
 * Clean up expired tokens
 */
export const cleanupExpiredTokens = async (): Promise<void> => {
  const sql = 'DELETE FROM refresh_tokens WHERE expires_at < NOW()';
  await pool.execute(sql);
};

/**
 * Extract token from Authorization header
 */
export const extractToken = (authHeader?: string): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};
