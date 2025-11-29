import { Router } from 'express';
import { getHealth, getMetrics } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);
router.get('/metrics', getMetrics);

export default router;
