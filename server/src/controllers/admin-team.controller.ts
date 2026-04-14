/**
 * Admin Team Controller
 * Manages sub-admin accounts — only super_admin can create/deactivate.
 * All authenticated admins can list the team and read chat history.
 */

import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError } from "../types";
import { pool } from "../config/database";
import { hashPassword } from "../utils/auth";
import { RowDataPacket } from "mysql2";
import { logger } from "../utils/logger";

// ─── GET /admin/team ─────────────────────────────────────────────────────────

export const listAdmins = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, email, full_name, profile_image_url, role, is_active,
            is_online, last_seen_at, last_login_at, created_at
     FROM admins
     ORDER BY
       CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       full_name ASC`,
  );
  res.json({ success: true, data: rows });
};

// ─── POST /admin/team ────────────────────────────────────────────────────────

export const createAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "super_admin") {
    throw new AppError("Only super admins can create new admin accounts", 403);
  }

  const { email, full_name, password, role = "admin" } = req.body;

  if (!email?.trim()) throw new AppError("Email is required", 400);
  if (!full_name?.trim()) throw new AppError("Full name is required", 400);
  if (!password || password.length < 8)
    throw new AppError("Password must be at least 8 characters", 400);

  const validRoles = ["admin", "moderator"];
  if (!validRoles.includes(role)) {
    throw new AppError(`Role must be one of: ${validRoles.join(", ")}`, 400);
  }

  // Check duplicate email
  const [existing] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM admins WHERE email = ?",
    [email.toLowerCase().trim()],
  );
  if ((existing as any[]).length > 0) {
    throw new AppError("An admin with that email already exists", 409);
  }

  const id = uuidv4();
  const password_hash = await hashPassword(password);

  await pool.execute(
    `INSERT INTO admins (id, email, password_hash, full_name, role, is_active, is_default_password)
     VALUES (?, ?, ?, ?, ?, TRUE, TRUE)`,
    [id, email.toLowerCase().trim(), password_hash, full_name.trim(), role],
  );

  logger.info(`[TEAM] Admin created: ${email} (${role}) by ${req.user.id}`);

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, email, full_name, profile_image_url, role, is_active, created_at FROM admins WHERE id = ?",
    [id],
  );

  res.status(201).json({
    success: true,
    message: `Admin account created for ${full_name}`,
    data: (rows as any[])[0],
  });
};

// ─── PATCH /admin/team/:id/deactivate ────────────────────────────────────────

export const deactivateAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "super_admin") {
    throw new AppError("Only super admins can deactivate accounts", 403);
  }

  const { id } = req.params;
  if (id === req.user.id)
    throw new AppError("You cannot deactivate your own account", 400);

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, role, is_active FROM admins WHERE id = ?",
    [id],
  );
  if ((rows as any[]).length === 0) throw new AppError("Admin not found", 404);

  const target = (rows as any[])[0];
  if (target.role === "super_admin") {
    throw new AppError("Cannot deactivate another super admin", 403);
  }
  if (!target.is_active)
    throw new AppError("Account is already deactivated", 400);

  await pool.execute("UPDATE admins SET is_active = FALSE WHERE id = ?", [id]);
  logger.info(`[TEAM] Admin deactivated: ${id} by ${req.user.id}`);

  res.json({ success: true, message: "Account deactivated" });
};

// ─── PATCH /admin/team/:id/reactivate ────────────────────────────────────────

export const reactivateAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "super_admin") {
    throw new AppError("Only super admins can reactivate accounts", 403);
  }

  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, is_active FROM admins WHERE id = ?",
    [id],
  );
  if ((rows as any[]).length === 0) throw new AppError("Admin not found", 404);
  if ((rows as any[])[0].is_active)
    throw new AppError("Account is already active", 400);

  await pool.execute("UPDATE admins SET is_active = TRUE WHERE id = ?", [id]);
  logger.info(`[TEAM] Admin reactivated: ${id} by ${req.user.id}`);

  res.json({ success: true, message: "Account reactivated" });
};

// ─── GET /admin/team/chat ─────────────────────────────────────────────────────

export const getChatHistory = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT m.id, m.admin_id, m.message, m.created_at,
            a.full_name AS admin_name, a.profile_image_url
     FROM admin_chat_messages m
     JOIN admins a ON m.admin_id = a.id
     ORDER BY m.created_at DESC
     LIMIT 100`,
  );
  res.json({ success: true, data: (rows as any[]).reverse() });
};
