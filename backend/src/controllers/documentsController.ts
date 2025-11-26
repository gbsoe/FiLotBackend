import { Request, Response } from "express";
import { uploadToR2, generatePresignedUrl, extractKeyFromUrl } from "../services/r2Storage";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import mime from "mime-types";
import crypto from "crypto";
import { validateFile } from "../utils/fileValidation";
import { logger } from "../utils/logger";
import "../types/User";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"];

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;
    const type = req.body.type;

    if (!["KTP", "NPWP"].includes(type)) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    const validationResult = validateFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (!validationResult.valid) {
      logger.warn("File validation failed during upload", {
        userId,
        type,
        error: validationResult.error,
      });
      return res.status(400).json({ error: validationResult.error });
    }

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: "Invalid file type. Only images (JPEG, PNG) and PDF are allowed" 
      });
    }

    const extension = mime.extension(req.file.mimetype) || "bin";
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return res.status(400).json({ 
        error: "Invalid file extension" 
      });
    }

    const key = `${userId}/${type}_${crypto.randomUUID()}.${extension}`;

    const storedKey = await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const doc = await db
      .insert(documents)
      .values({
        userId,
        type,
        fileUrl: storedKey,
        status: "uploaded",
      })
      .returning();

    logger.info("Document uploaded successfully", {
      documentId: doc[0].id,
      userId,
      type,
      key: storedKey,
    });

    return res.json({
      success: true,
      documentId: doc[0].id,
      document: {
        id: doc[0].id,
        type: doc[0].type,
        status: doc[0].status,
        createdAt: doc[0].createdAt,
      },
    });
  } catch (error) {
    logger.error("Upload error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Upload failed" });
  }
};

export const downloadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const documentId = req.params.id;
    const userId = req.user.id;

    const [document] = await db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.userId, userId))
      );

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!document.fileUrl) {
      return res.status(404).json({ error: "Document file not available" });
    }

    const fileKey = extractKeyFromUrl(document.fileUrl);

    const presignedUrl = await generatePresignedUrl(fileKey, 300);

    logger.info("Presigned URL generated for download", {
      documentId,
      userId,
      expiresIn: 300,
    });

    return res.json({
      url: presignedUrl,
      expiresIn: 300,
    });
  } catch (error) {
    logger.error("Download error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
};
