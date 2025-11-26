import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger";

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  handler: (req, res, _next, options) => {
    logger.warn("Global rate limit exceeded", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
});

export const sensitiveRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to sensitive endpoint, please try again later" },
  handler: (req, res, _next, options) => {
    logger.warn("Sensitive rate limit exceeded", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
});
