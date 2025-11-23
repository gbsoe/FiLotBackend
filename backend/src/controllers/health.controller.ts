import { Request, Response } from 'express';

export const getHealth = (_req: Request, res: Response): void => {
  const uptime = process.uptime();
  const timestamp = new Date().toISOString();

  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(uptime),
    timestamp,
    environment: process.env.NODE_ENV || 'development',
  });
};
