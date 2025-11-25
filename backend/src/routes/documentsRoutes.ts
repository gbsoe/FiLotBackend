import express from "express";
import multer from "multer";
import { uploadDocument } from "../controllers/documentsController";
import { authRequired } from "../auth/middleware";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.post(
  "/upload",
  authRequired,
  upload.single("file"),
  uploadDocument
);

export default router;
