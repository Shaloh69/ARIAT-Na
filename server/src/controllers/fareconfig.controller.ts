import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError } from "../types";
import { pool } from "../config/database";

/**
 * Get all fare configs
 * GET /api/v1/fare-configs
 */
export const getFareConfigs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { active } = req.query;

  let sql = "SELECT * FROM fare_configs";

  if (active === "true") {
    sql += " WHERE is_active = TRUE";
  }

  sql += " ORDER BY display_order ASC, transport_type ASC";

  const [rows]: any = await pool.execute(sql);

  res.json({
    success: true,
    data: rows,
  });
};

/**
 * Get fare config by ID
 * GET /api/v1/fare-configs/:id
 */
export const getFareConfigById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const [rows]: any = await pool.execute(
    "SELECT * FROM fare_configs WHERE id = ?",
    [id],
  );

  if (rows.length === 0) {
    throw new AppError("Fare config not found", 404);
  }

  res.json({
    success: true,
    data: rows[0],
  });
};

/**
 * Create fare config (Admin only)
 * POST /api/v1/fare-configs
 */
export const createFareConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const {
    transport_type,
    display_name,
    description,
    base_fare = 0,
    per_km_rate = 0,
    minimum_fare = 0,
    peak_hour_multiplier = 1.0,
    routing_behavior = "direct_fare",
    is_active = true,
    display_order = 0,
  } = req.body;

  if (!transport_type || !display_name) {
    throw new AppError("transport_type and display_name are required", 400);
  }

  const validBehaviors = [
    "walk",
    "private",
    "direct_fare",
    "corridor_stops",
    "corridor_anywhere",
    "ferry",
  ];
  if (!validBehaviors.includes(routing_behavior)) {
    throw new AppError(
      `routing_behavior must be one of: ${validBehaviors.join(", ")}`,
      400,
    );
  }

  const id = uuidv4();

  await pool.execute(
    `INSERT INTO fare_configs
      (id, transport_type, display_name, description, base_fare, per_km_rate, minimum_fare, peak_hour_multiplier, routing_behavior, is_active, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      transport_type,
      display_name,
      description || null,
      base_fare,
      per_km_rate,
      minimum_fare,
      peak_hour_multiplier,
      routing_behavior,
      is_active,
      display_order,
    ],
  );

  const [rows]: any = await pool.execute(
    "SELECT * FROM fare_configs WHERE id = ?",
    [id],
  );

  res.status(201).json({
    success: true,
    message: "Fare config created successfully",
    data: rows[0],
  });
};

/**
 * Update fare config (Admin only)
 * PUT /api/v1/fare-configs/:id
 */
export const updateFareConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  const allowedFields = [
    "transport_type",
    "display_name",
    "description",
    "base_fare",
    "per_km_rate",
    "minimum_fare",
    "peak_hour_multiplier",
    "routing_behavior",
    "is_active",
    "display_order",
  ];

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(updates[key]);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  const sql = `
    UPDATE fare_configs
    SET ${updateFields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  const [result]: any = await pool.execute(sql, [...updateValues, id]);

  if (result.affectedRows === 0) {
    throw new AppError("Fare config not found", 404);
  }

  const [rows]: any = await pool.execute(
    "SELECT * FROM fare_configs WHERE id = ?",
    [id],
  );

  res.json({
    success: true,
    message: "Fare config updated successfully",
    data: rows[0],
  });
};

/**
 * Delete fare config (Admin only)
 * DELETE /api/v1/fare-configs/:id
 */
export const deleteFareConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute(
    "DELETE FROM fare_configs WHERE id = ?",
    [id],
  );

  if (result.affectedRows === 0) {
    throw new AppError("Fare config not found", 404);
  }

  res.json({
    success: true,
    message: "Fare config deleted successfully",
  });
};
