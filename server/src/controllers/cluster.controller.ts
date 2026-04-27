import { Request, Response } from "express";
import { pool } from "../config/database";
import { RowDataPacket } from "mysql2";

const toNum = (v: any, fallback: number | null = 0): number | null =>
  v !== null && v !== undefined && v !== "" ? Number(v) : fallback;

export const getClusters = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const interestsParam = req.query.interests as string | undefined;
  const interestSlugs = interestsParam
    ? interestsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  let rows: RowDataPacket[];

  if (interestSlugs.length > 0) {
    const placeholders = interestSlugs.map(() => "?").join(",");
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT cl.*, COUNT(d.id) AS destination_count
       FROM clusters cl
       LEFT JOIN destinations d ON d.cluster_id = cl.id
         AND d.is_active = TRUE
         AND d.category_id IN (SELECT id FROM categories WHERE slug IN (${placeholders}))
       WHERE cl.is_active = TRUE
       GROUP BY cl.id
       ORDER BY cl.display_order ASC`,
      interestSlugs,
    );
  } else {
    [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT cl.*, COUNT(d.id) AS destination_count
       FROM clusters cl
       LEFT JOIN destinations d ON d.cluster_id = cl.id AND d.is_active = TRUE
       WHERE cl.is_active = TRUE
       GROUP BY cl.id
       ORDER BY cl.display_order ASC`,
    );
  }

  const data = (rows as any[]).map((cl) => ({
    ...cl,
    center_lat: toNum(cl.center_lat, null),
    center_lng: toNum(cl.center_lng, null),
    destination_count: Number(cl.destination_count) || 0,
  }));
  res.json({ success: true, data });
};

export const getClusterById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT cl.*, COUNT(d.id) AS destination_count
     FROM clusters cl
     LEFT JOIN destinations d ON d.cluster_id = cl.id AND d.is_active = TRUE
     WHERE cl.id = ? OR cl.slug = ?
     GROUP BY cl.id`,
    [id, id],
  );
  if ((rows as any[]).length === 0) {
    res.status(404).json({ success: false, error: "Cluster not found" });
    return;
  }
  const raw = rows[0] as any;
  const cluster = {
    ...raw,
    center_lat: toNum(raw.center_lat, null),
    center_lng: toNum(raw.center_lng, null),
    destination_count: Number(raw.destination_count) || 0,
  };

  // Fetch featured destinations for this cluster
  const [featuredRows] = await pool.execute<RowDataPacket[]>(
    `SELECT d.id, d.name, d.latitude, d.longitude, d.images, d.rating,
            d.average_visit_duration, d.entrance_fee_local, d.budget_level,
            c.name AS category_name, c.slug AS category_slug
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     WHERE d.cluster_id = ? AND d.is_active = TRUE
     ORDER BY d.is_featured DESC, d.popularity_score DESC, d.rating DESC
     LIMIT 6`,
    [cluster.id],
  );

  const featured_places = (featuredRows as any[]).map((p) => ({
    ...p,
    latitude: toNum(p.latitude) ?? 0,
    longitude: toNum(p.longitude) ?? 0,
    rating: toNum(p.rating) ?? 0,
    entrance_fee_local: toNum(p.entrance_fee_local) ?? 0,
    images: (() => {
      if (p.images === null || p.images === undefined) return [];
      if (typeof p.images === "object") return p.images;
      try {
        return JSON.parse(p.images);
      } catch {
        return [];
      }
    })(),
  }));

  res.json({ success: true, data: { ...cluster, featured_places } });
};
