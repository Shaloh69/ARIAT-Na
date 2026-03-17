import { Request, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export const getCuratedGuides = async (req: Request, res: Response): Promise<void> => {
  const { featured, tag } = req.query as Record<string, string>;
  let query = `SELECT * FROM curated_guides WHERE is_active = TRUE`;
  const params: (string | boolean)[] = [];

  if (featured === 'true') {
    query += ` AND is_featured = TRUE`;
  }

  query += ` ORDER BY display_order ASC, created_at DESC`;

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);

  const guides = (rows as any[]).map((g) => ({
    ...g,
    tags: typeof g.tags === 'string' ? JSON.parse(g.tags) : (g.tags ?? []),
    clusters: typeof g.clusters === 'string' ? JSON.parse(g.clusters) : (g.clusters ?? []),
    interests: typeof g.interests === 'string' ? JSON.parse(g.interests) : (g.interests ?? []),
    destination_ids: typeof g.destination_ids === 'string' ? JSON.parse(g.destination_ids) : (g.destination_ids ?? []),
  }));

  // Optional client-side tag filter
  const filtered = tag
    ? guides.filter((g) => Array.isArray(g.tags) && g.tags.includes(tag))
    : guides;

  res.json({ success: true, data: filtered });
};

export const getGuideById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM curated_guides WHERE (id = ? OR slug = ?) AND is_active = TRUE`,
    [id, id]
  );
  if ((rows as any[]).length === 0) {
    res.status(404).json({ success: false, error: 'Guide not found' });
    return;
  }
  const g = rows[0] as any;
  res.json({
    success: true,
    data: {
      ...g,
      tags: typeof g.tags === 'string' ? JSON.parse(g.tags) : (g.tags ?? []),
      clusters: typeof g.clusters === 'string' ? JSON.parse(g.clusters) : (g.clusters ?? []),
      interests: typeof g.interests === 'string' ? JSON.parse(g.interests) : (g.interests ?? []),
      destination_ids: typeof g.destination_ids === 'string' ? JSON.parse(g.destination_ids) : (g.destination_ids ?? []),
    },
  });
};
