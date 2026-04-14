/**
 * Admin Users Controller
 * Provides admin visibility into registered mobile app users.
 * - List all users (paginated)
 * - Delete a user account
 */

import { Response } from "express";
import { AuthRequest, AppError } from "../types";
import { pool } from "../config/database";
import { RowDataPacket } from "mysql2";
import { logger } from "../utils/logger";
import { getOnlineUsers } from "../services/websocket.service";

// ─── GET /admin/users ─────────────────────────────────────────────────────────

export const listUsers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  // Sanitise to safe integers — embedded directly in SQL to avoid the mysql2 v3
  // "Incorrect arguments to mysqld_stmt_execute" bug with LIMIT/OFFSET placeholders
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit as string) || 50),
  );
  const offset = (page - 1) * limit;
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const whereClause = search
    ? "WHERE (u.full_name LIKE ? OR u.email LIKE ?)"
    : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  // LIMIT and OFFSET are integer-literal-embedded (not ? params) to sidestep the mysql2 bug
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.id, u.email, u.full_name, u.phone_number,
            IFNULL(u.profile_image_url, NULL)  AS profile_image_url,
            u.is_verified, u.is_active, u.created_at,
            IFNULL(u.last_login_at, NULL)       AS last_login_at,
            COUNT(DISTINCT i.id)                AS itinerary_count
     FROM users u
     LEFT JOIN itineraries i ON i.user_id = u.id
     ${whereClause}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    searchParams,
  );

  const [[{ total }]]: any = await pool.execute(
    `SELECT COUNT(*) AS total FROM users ${whereClause}`,
    searchParams,
  );

  // Merge real-time online status
  const onlineSet = new Set(getOnlineUsers().map((u) => u.userId));
  const data = rows.map((r) => ({ ...r, is_online: onlineSet.has(r.id) }));

  res.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
};

// ─── GET /admin/users/active ──────────────────────────────────────────────────

export const getActiveUsers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  res.json({ success: true, data: getOnlineUsers() });
};

// ─── DELETE /admin/users/:id ──────────────────────────────────────────────────

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, email, full_name FROM users WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new AppError("User not found", 404);

  const user = rows[0];

  // Delete user (cascades to refresh_tokens, itineraries etc. if FK set)
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);

  logger.info(
    `[ADMIN] User deleted: ${user.email} (${id}) by admin ${req.user?.id}`,
  );

  res.json({
    success: true,
    message: `User ${user.full_name} deleted successfully`,
  });
};
