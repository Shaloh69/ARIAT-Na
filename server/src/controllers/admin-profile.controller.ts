import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest, AppError } from '../types';
import { uploadFile, deleteFileByUrl } from '../services/upload.service';
import bcrypt from 'bcrypt';

/**
 * Get admin profile
 * GET /api/v1/admin/profile
 */
export const getAdminProfile = async (
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

/**
 * Update admin profile
 * PUT /api/v1/admin/profile
 */
export const updateAdminProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('Admin not authenticated', 401);
  }

  const { full_name, email } = req.body;
  const adminId = req.user.id;

  // Check if admin exists
  const [existingAdmins]: any = await pool.execute(
    'SELECT * FROM admins WHERE id = ?',
    [adminId]
  );

  if (existingAdmins.length === 0) {
    throw new AppError('Admin not found', 404);
  }

  const admin = existingAdmins[0];

  // Check if email is being changed and if it's already taken
  if (email && email !== admin.email) {
    const [emailCheck]: any = await pool.execute(
      'SELECT id FROM admins WHERE email = ? AND id != ?',
      [email, adminId]
    );

    if (emailCheck.length > 0) {
      throw new AppError('Email is already taken', 400);
    }
  }

  // Update admin profile
  await pool.execute(
    'UPDATE admins SET full_name = ?, email = ?, updated_at = NOW() WHERE id = ?',
    [full_name || admin.full_name, email || admin.email, adminId]
  );

  // Fetch updated admin
  const [updatedAdmins]: any = await pool.execute(
    'SELECT id, email, full_name, profile_image_url, role, is_default_password, created_at FROM admins WHERE id = ?',
    [adminId]
  );

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedAdmins[0],
  });
};

/**
 * Upload admin profile image
 * POST /api/v1/admin/profile/image
 */
export const uploadAdminProfileImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('Admin not authenticated', 401);
  }

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const adminId = req.user.id;

  // Get current admin to check for existing profile image
  const [admins]: any = await pool.execute(
    'SELECT profile_image_url FROM admins WHERE id = ?',
    [adminId]
  );

  if (admins.length === 0) {
    throw new AppError('Admin not found', 404);
  }

  const admin = admins[0];

  // Delete old profile image if exists
  if (admin.profile_image_url) {
    try {
      await deleteFileByUrl(admin.profile_image_url);
    } catch (error) {
      console.error('Error deleting old profile image:', error);
    }
  }

  // Upload new profile image
  const result = await uploadFile(req.file.buffer, req.file.originalname, {
    folder: 'admin-profiles',
    contentType: req.file.mimetype,
  });

  // Update admin profile image URL
  await pool.execute(
    'UPDATE admins SET profile_image_url = ?, updated_at = NOW() WHERE id = ?',
    [result.url, adminId]
  );

  res.json({
    success: true,
    message: 'Profile image uploaded successfully',
    data: {
      profile_image_url: result.url,
    },
  });
};

/**
 * Delete admin profile image
 * DELETE /api/v1/admin/profile/image
 */
export const deleteAdminProfileImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('Admin not authenticated', 401);
  }

  const adminId = req.user.id;

  // Get current admin
  const [admins]: any = await pool.execute(
    'SELECT profile_image_url FROM admins WHERE id = ?',
    [adminId]
  );

  if (admins.length === 0) {
    throw new AppError('Admin not found', 404);
  }

  const admin = admins[0];

  if (!admin.profile_image_url) {
    throw new AppError('No profile image to delete', 400);
  }

  // Delete profile image from storage
  await deleteFileByUrl(admin.profile_image_url);

  // Update admin profile image URL to null
  await pool.execute(
    'UPDATE admins SET profile_image_url = NULL, updated_at = NOW() WHERE id = ?',
    [adminId]
  );

  res.json({
    success: true,
    message: 'Profile image deleted successfully',
  });
};

/**
 * Change admin password
 * PUT /api/v1/admin/profile/password
 */
export const changeAdminPassword = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError('Admin not authenticated', 401);
  }

  const { current_password, new_password } = req.body;
  const adminId = req.user.id;

  if (!current_password || !new_password) {
    throw new AppError('Current password and new password are required', 400);
  }

  if (new_password.length < 8) {
    throw new AppError('New password must be at least 8 characters long', 400);
  }

  // Get current admin
  const [admins]: any = await pool.execute(
    'SELECT password_hash FROM admins WHERE id = ?',
    [adminId]
  );

  if (admins.length === 0) {
    throw new AppError('Admin not found', 404);
  }

  const admin = admins[0];

  // Verify current password
  const isPasswordValid = await bcrypt.compare(current_password, admin.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(new_password, 10);

  // Update password and mark as not default
  await pool.execute(
    'UPDATE admins SET password_hash = ?, is_default_password = FALSE, updated_at = NOW() WHERE id = ?',
    [hashedPassword, adminId]
  );

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
};
