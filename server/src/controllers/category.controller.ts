import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, AppError } from '../types';
import { pool } from '../config/database';

/**
 * Get all categories
 * GET /api/v1/categories
 */
export const getCategories = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { active = 'true' } = req.query;

  let sql = `
    SELECT c.*, COUNT(d.id) as destination_count
    FROM categories c
    LEFT JOIN destinations d ON c.id = d.category_id AND d.is_active = true
  `;

  if (active === 'true') {
    sql += ' WHERE c.is_active = true';
  }

  sql += ' GROUP BY c.id ORDER BY c.display_order ASC, c.name ASC';

  const [categories]: any = await pool.execute(sql);

  res.json({
    success: true,
    data: categories,
  });
};

/**
 * Get category by ID
 * GET /api/v1/categories/:id
 */
export const getCategoryById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const [categories]: any = await pool.execute(
    'SELECT * FROM categories WHERE id = ?',
    [id]
  );

  if (categories.length === 0) {
    throw new AppError('Category not found', 404);
  }

  res.json({
    success: true,
    data: categories[0],
  });
};

/**
 * Create category (Admin only)
 * POST /api/v1/categories
 */
export const createCategory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { name, slug, description, icon_url, display_order = 0 } = req.body;

  const categoryId = uuidv4();

  const sql = `
    INSERT INTO categories (id, name, slug, description, icon_url, display_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    categoryId,
    name,
    slug,
    description || null,
    icon_url || null,
    display_order,
    true,
  ]);

  const [categories]: any = await pool.execute(
    'SELECT * FROM categories WHERE id = ?',
    [categoryId]
  );

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: categories[0],
  });
};

/**
 * Update category (Admin only)
 * PUT /api/v1/categories/:id
 */
export const updateCategory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  const allowedFields = ['name', 'slug', 'description', 'icon_url', 'display_order', 'is_active'];
  const updateFields: string[] = [];
  const updateValues: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(updates[key]);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const sql = `
    UPDATE categories
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = ?
  `;

  const [result]: any = await pool.execute(sql, [...updateValues, id]);

  if (result.affectedRows === 0) {
    throw new AppError('Category not found', 404);
  }

  const [categories]: any = await pool.execute(
    'SELECT * FROM categories WHERE id = ?',
    [id]
  );

  res.json({
    success: true,
    message: 'Category updated successfully',
    data: categories[0],
  });
};

/**
 * Delete category (Admin only)
 * DELETE /api/v1/categories/:id
 */
export const deleteCategory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  // Check if category has destinations
  const [destinations]: any = await pool.execute(
    'SELECT COUNT(*) as count FROM destinations WHERE category_id = ?',
    [id]
  );

  if (destinations[0].count > 0) {
    throw new AppError('Cannot delete category with existing destinations', 400);
  }

  const [result]: any = await pool.execute(
    'DELETE FROM categories WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Category not found', 404);
  }

  res.json({
    success: true,
    message: 'Category deleted successfully',
  });
};
