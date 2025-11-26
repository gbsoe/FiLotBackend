import express from "express";
import multer from "multer";
import { uploadDocument, downloadDocument } from "../controllers/documentsController";
import { authRequired } from "../auth/middleware";
import { sensitiveRateLimiter } from "../middlewares/rateLimiter";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

router.post(
  "/upload",
  authRequired,
  sensitiveRateLimiter,
  upload.single("file"),
  uploadDocument
);

router.get(
  "/:id/download",
  authRequired,
  downloadDocument
);

export default router;
