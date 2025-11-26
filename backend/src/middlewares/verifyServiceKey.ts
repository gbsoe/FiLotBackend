import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export function verifyServiceKey(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const key = req.headers["x-service-key"] as string | undefined;

  if (!key || key !== process.env.SERVICE_INTERNAL_KEY) {
    logger.warn("Service key verification failed", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      hasKey: !!key,
    });
    res.status(403).json({ error: "Forbidden: Invalid service key" });
    return;
  }

  next();
}
