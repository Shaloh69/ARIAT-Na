import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError } from "../types";
import { pool } from "../config/database";

// ─── Transit Stops (bus_stop, bus_terminal, pier) ────────────────────────────

/**
 * GET /api/v1/transit/stops
 * Returns all transit-type intersections (bus_stop, bus_terminal, pier).
 */
export const getTransitStops = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { type } = req.query;

  const transitTypes = ["bus_stop", "bus_terminal", "pier"];
  const typeFilter =
    type && transitTypes.includes(String(type)) ? [String(type)] : transitTypes;

  const placeholders = typeFilter.map(() => "?").join(", ");
  const [rows]: any = await pool.execute(
    `SELECT * FROM intersections WHERE point_type IN (${placeholders}) ORDER BY point_type ASC, name ASC`,
    typeFilter,
  );

  res.json({ success: true, data: rows });
};

/**
 * POST /api/v1/transit/stops
 * Create a bus_stop, bus_terminal, or pier.
 */
export const createTransitStop = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { name, latitude, longitude, point_type, address } = req.body;

  const validTypes = ["bus_stop", "bus_terminal", "pier"];
  if (!name || latitude === undefined || longitude === undefined) {
    throw new AppError("name, latitude, and longitude are required", 400);
  }
  if (!point_type || !validTypes.includes(point_type)) {
    throw new AppError(
      `point_type must be one of: ${validTypes.join(", ")}`,
      400,
    );
  }

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO intersections (id, name, latitude, longitude, point_type, address, is_destination)
     VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
    [id, name, latitude, longitude, point_type, address || null],
  );

  const [rows]: any = await pool.execute(
    "SELECT * FROM intersections WHERE id = ?",
    [id],
  );
  res
    .status(201)
    .json({ success: true, message: "Transit stop created", data: rows[0] });
};

/**
 * PUT /api/v1/transit/stops/:id
 * Update a transit stop's name, type, or address.
 */
export const updateTransitStop = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const { name, latitude, longitude, point_type, address } = req.body;

  const [existing]: any = await pool.execute(
    "SELECT id FROM intersections WHERE id = ? AND point_type IN ('bus_stop','bus_terminal','pier')",
    [id],
  );
  if (existing.length === 0) throw new AppError("Transit stop not found", 404);

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (latitude !== undefined) {
    fields.push("latitude = ?");
    values.push(latitude);
  }
  if (longitude !== undefined) {
    fields.push("longitude = ?");
    values.push(longitude);
  }
  if (point_type !== undefined) {
    fields.push("point_type = ?");
    values.push(point_type);
  }
  if (address !== undefined) {
    fields.push("address = ?");
    values.push(address);
  }

  if (fields.length === 0) throw new AppError("No valid fields to update", 400);

  await pool.execute(
    `UPDATE intersections SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
    [...values, id],
  );

  const [rows]: any = await pool.execute(
    "SELECT * FROM intersections WHERE id = ?",
    [id],
  );
  res.json({ success: true, message: "Transit stop updated", data: rows[0] });
};

/**
 * DELETE /api/v1/transit/stops/:id
 */
export const deleteTransitStop = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute(
    "DELETE FROM intersections WHERE id = ? AND point_type IN ('bus_stop','bus_terminal','pier')",
    [id],
  );
  if (result.affectedRows === 0)
    throw new AppError("Transit stop not found", 404);

  res.json({ success: true, message: "Transit stop deleted" });
};

// ─── Transit Routes ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/transit/routes
 * Returns all transit routes, optionally filtered by transport_type or active status.
 */
export const getTransitRoutes = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { transport_type, active } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  if (transport_type) {
    conditions.push("tr.transport_type = ?");
    params.push(transport_type);
  }
  if (active === "true") {
    conditions.push("tr.is_active = TRUE");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows]: any = await pool.execute(
    `SELECT tr.*, fc.display_name AS fare_config_name
     FROM transit_routes tr
     LEFT JOIN fare_configs fc ON fc.id = tr.fare_config_id
     ${where}
     ORDER BY tr.transport_type ASC, tr.route_name ASC`,
    params,
  );

  res.json({ success: true, data: rows });
};

/**
 * GET /api/v1/transit/routes/:id
 */
export const getTransitRouteById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const [rows]: any = await pool.execute(
    `SELECT tr.*, fc.display_name AS fare_config_name
     FROM transit_routes tr
     LEFT JOIN fare_configs fc ON fc.id = tr.fare_config_id
     WHERE tr.id = ?`,
    [id],
  );
  if (rows.length === 0) throw new AppError("Transit route not found", 404);
  res.json({ success: true, data: rows[0] });
};

/**
 * POST /api/v1/transit/routes
 * Create a new transit route.
 * Body: { fare_config_id, route_name, transport_type, road_ids, stop_ids, pickup_mode, color, description }
 */
export const createTransitRoute = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const {
    fare_config_id,
    route_name,
    transport_type,
    road_ids = [],
    stop_ids = [],
    pickup_mode = "stops_only",
    color = "#3b82f6",
    description,
    is_active = true,
  } = req.body;

  if (!fare_config_id || !route_name || !transport_type) {
    throw new AppError(
      "fare_config_id, route_name, and transport_type are required",
      400,
    );
  }

  const validPickup = ["anywhere", "stops_only"];
  if (!validPickup.includes(pickup_mode)) {
    throw new AppError('pickup_mode must be "anywhere" or "stops_only"', 400);
  }

  // Verify fare_config exists and derive pickup_mode from routing_behavior
  const [fc]: any = await pool.execute(
    "SELECT id, routing_behavior FROM fare_configs WHERE id = ?",
    [fare_config_id],
  );
  if (fc.length === 0) throw new AppError("fare_config not found", 404);

  // corridor_anywhere fare configs must always use pickup_mode='anywhere'
  const resolvedPickupMode =
    fc[0].routing_behavior === "corridor_anywhere" ? "anywhere" : pickup_mode;

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO transit_routes
       (id, fare_config_id, route_name, transport_type, road_ids, stop_ids, pickup_mode, color, description, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      fare_config_id,
      route_name,
      transport_type,
      JSON.stringify(road_ids),
      JSON.stringify(stop_ids),
      resolvedPickupMode,
      color,
      description || null,
      is_active,
    ],
  );

  const [rows]: any = await pool.execute(
    `SELECT tr.*, fc.display_name AS fare_config_name
     FROM transit_routes tr LEFT JOIN fare_configs fc ON fc.id = tr.fare_config_id
     WHERE tr.id = ?`,
    [id],
  );
  res
    .status(201)
    .json({ success: true, message: "Transit route created", data: rows[0] });
};

/**
 * PUT /api/v1/transit/routes/:id
 */
export const updateTransitRoute = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  const [existing]: any = await pool.execute(
    `SELECT tr.id, fc.routing_behavior AS current_routing_behavior
     FROM transit_routes tr
     LEFT JOIN fare_configs fc ON fc.id = tr.fare_config_id
     WHERE tr.id = ?`,
    [id],
  );
  if (existing.length === 0) throw new AppError("Transit route not found", 404);

  // If fare_config_id is changing, resolve routing_behavior from the new config
  let resolvedRoutingBehavior = existing[0].current_routing_behavior as string;
  if (updates.fare_config_id) {
    const [newFc]: any = await pool.execute(
      "SELECT routing_behavior FROM fare_configs WHERE id = ?",
      [updates.fare_config_id],
    );
    if (newFc.length === 0) throw new AppError("fare_config not found", 404);
    resolvedRoutingBehavior = newFc[0].routing_behavior;
  }

  // Force pickup_mode='anywhere' when fare config is corridor_anywhere
  if (resolvedRoutingBehavior === "corridor_anywhere") {
    updates.pickup_mode = "anywhere";
  }

  const allowed = [
    "fare_config_id",
    "route_name",
    "transport_type",
    "road_ids",
    "stop_ids",
    "pickup_mode",
    "color",
    "description",
    "is_active",
  ];
  const jsonFields = ["road_ids", "stop_ids"];

  const fields: string[] = [];
  const values: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(
        jsonFields.includes(key) ? JSON.stringify(updates[key]) : updates[key],
      );
    }
  });

  if (fields.length === 0) throw new AppError("No valid fields to update", 400);

  await pool.execute(
    `UPDATE transit_routes SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
    [...values, id],
  );

  const [rows]: any = await pool.execute(
    `SELECT tr.*, fc.display_name AS fare_config_name
     FROM transit_routes tr LEFT JOIN fare_configs fc ON fc.id = tr.fare_config_id
     WHERE tr.id = ?`,
    [id],
  );
  res.json({ success: true, message: "Transit route updated", data: rows[0] });
};

/**
 * DELETE /api/v1/transit/routes/:id
 */
export const deleteTransitRoute = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const [result]: any = await pool.execute(
    "DELETE FROM transit_routes WHERE id = ?",
    [id],
  );
  if (result.affectedRows === 0)
    throw new AppError("Transit route not found", 404);
  res.json({ success: true, message: "Transit route deleted" });
};
