import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  listAdmins,
  createAdmin,
  deactivateAdmin,
  reactivateAdmin,
  getChatHistory,
} from '../controllers/admin-team.controller';

const router = Router();

router.use(authenticateAdmin);

router.get('/', asyncHandler(listAdmins));
router.post('/', asyncHandler(createAdmin));
router.patch('/:id/deactivate', asyncHandler(deactivateAdmin));
router.patch('/:id/reactivate', asyncHandler(reactivateAdmin));
router.get('/chat', asyncHandler(getChatHistory));

export default router;
