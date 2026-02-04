import { Router } from 'express';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  loginAdmin,
  getCurrentAdmin,
  refreshAccessToken,
  logout,
  logoutAll,
} from '../controllers/auth.controller';
import {
  registerValidator,
  loginValidator,
  refreshTokenValidator,
} from '../utils/validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateUser, authenticateAdmin, authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// =====================================================
// USER AUTHENTICATION ROUTES (Flutter App)
// =====================================================
router.post(
  '/user/register',
  registerValidator,
  validate,
  asyncHandler(registerUser)
);

router.post(
  '/user/login',
  loginValidator,
  validate,
  asyncHandler(loginUser)
);

router.get(
  '/user/me',
  authenticateUser,
  asyncHandler(getCurrentUser)
);

// =====================================================
// ADMIN AUTHENTICATION ROUTES (Web Console)
// =====================================================
router.post(
  '/admin/login',
  loginValidator,
  validate,
  asyncHandler(loginAdmin)
);

router.get(
  '/admin/me',
  authenticateAdmin,
  asyncHandler(getCurrentAdmin)
);

// =====================================================
// SHARED AUTHENTICATION ROUTES
// =====================================================
router.post(
  '/refresh',
  refreshTokenValidator,
  validate,
  asyncHandler(refreshAccessToken)
);

router.post(
  '/logout',
  refreshTokenValidator,
  validate,
  asyncHandler(logout)
);

router.post(
  '/logout-all',
  authenticate,
  asyncHandler(logoutAll)
);

export default router;
