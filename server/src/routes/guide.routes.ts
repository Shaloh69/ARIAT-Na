import { Router } from 'express';
import { getCuratedGuides, getGuideById } from '../controllers/guide.controller';

const router = Router();
router.get('/', getCuratedGuides);
router.get('/:id', getGuideById);
export default router;
