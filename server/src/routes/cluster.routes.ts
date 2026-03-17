import { Router } from 'express';
import { getClusters, getClusterById } from '../controllers/cluster.controller';

const router = Router();
router.get('/', getClusters);
router.get('/:id', getClusterById);
export default router;
