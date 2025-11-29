import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadDocument, downloadDocument } from "../controllers/documentsController";
import { authRequired } from "../auth/middleware";
import { sensitiveRateLimiter } from "../middlewares/rateLimiter";
import { DocumentUploadSchema } from "../validators/schemas";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const validateDocumentUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = DocumentUploadSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errors,
      },
    });
    return;
  }

  req.body = result.data;
  next();
};

router.post(
  "/upload",
  authRequired,
  sensitiveRateLimiter,
  upload.single("file"),
  validateDocumentUpload,
  uploadDocument
);

router.get(
  "/:id/download",
  authRequired,
  downloadDocument
);

export default router;
