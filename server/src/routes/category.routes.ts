import { Router } from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { createCategoryValidator } from '../utils/validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Public routes
router.get('/', asyncHandler(getCategories));
router.get('/:id', asyncHandler(getCategoryById));

// Admin only routes
router.post(
  '/',
  authenticateAdmin,
  createCategoryValidator,
  validate,
  asyncHandler(createCategory)
);

router.put(
  '/:id',
  authenticateAdmin,
  asyncHandler(updateCategory)
);

router.delete(
  '/:id',
  authenticateAdmin,
  asyncHandler(deleteCategory)
);

export default router;
