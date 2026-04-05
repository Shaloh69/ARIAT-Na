import { Router } from 'express';
import { getCuratedGuides, getGuideById } from '../controllers/guide.controller';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();
router.get('/', asyncHandler(getCuratedGuides));
router.get('/:id', asyncHandler(getGuideById));
export default router;
