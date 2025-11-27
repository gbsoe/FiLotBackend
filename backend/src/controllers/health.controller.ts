import { Request, Response } from 'express';
import { getActiveQueueEngine, isTemporalConfigured } from '../queue';

export const getHealth = (_req: Request, res: Response): void => {
  const uptime = process.uptime();
  const timestamp = new Date().toISOString();
  const ocrEngine = getActiveQueueEngine();
  const temporalConfigured = isTemporalConfigured();

  res.status(200).json({
    ok: true,
    status: 'ok',
    uptime: Math.floor(uptime),
    timestamp,
    environment: process.env.NODE_ENV || 'development',
    ocrEngine,
    temporalConfigured,
  });
};
