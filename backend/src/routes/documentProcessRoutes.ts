import { Router } from "express";
import { authRequired } from "../auth/middleware";
import { sensitiveRateLimiter } from "../middlewares/rateLimiter";
import {
  processDocument,
  getDocumentResult,
} from "../controllers/documentProcessController";

const router = Router();

router.post("/:id/process", authRequired, sensitiveRateLimiter, processDocument);
router.get("/:id/result", authRequired, getDocumentResult);

export default router;
