import { Router } from 'express';
import {
  getAdminProfile,
  updateAdminProfile,
  uploadAdminProfileImage,
  deleteAdminProfileImage,
  changeAdminPassword,
} from '../controllers/admin-profile.controller';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { uploadSingleImage, handleMulterError } from '../middleware/multer.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateAdmin);

// Profile routes
router.get('/profile', asyncHandler(getAdminProfile));
router.put('/profile', asyncHandler(updateAdminProfile));

// Profile image routes
router.post(
  '/profile/image',
  uploadSingleImage,
  handleMulterError,
  asyncHandler(uploadAdminProfileImage)
);
router.delete('/profile/image', asyncHandler(deleteAdminProfileImage));

// Password change route
router.put('/profile/password', asyncHandler(changeAdminPassword));

export default router;
