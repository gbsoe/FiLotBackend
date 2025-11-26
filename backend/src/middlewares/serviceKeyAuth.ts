import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

const getServiceKey = (): string => {
  const key = process.env.SERVICE_INTERNAL_KEY;
  if (!key) {
    throw new Error("SERVICE_INTERNAL_KEY environment variable is not configured");
  }
  return key;
};

export const checkInternalServiceKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const providedKey = req.headers["x-service-key"] as string | undefined;

  let serviceKey: string;
  try {
    serviceKey = getServiceKey();
  } catch (error) {
    logger.error("SERVICE_INTERNAL_KEY is not configured");
    res.status(500).json({ error: "Internal service configuration error" });
    return;
  }

  if (!providedKey) {
    logger.warn("Internal route access attempted without service key", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({ error: "Missing service authentication" });
    return;
  }

  if (providedKey !== serviceKey) {
    logger.warn("Internal route access attempted with invalid service key", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({ error: "Invalid service authentication" });
    return;
  }

  next();
};

export const validateServiceKeyAtStartup = (): void => {
  const key = process.env.SERVICE_INTERNAL_KEY;
  if (!key) {
    logger.warn("SERVICE_INTERNAL_KEY is not configured. Internal routes will return 500 errors.");
  }
};
