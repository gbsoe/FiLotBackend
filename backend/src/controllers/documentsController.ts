import { Request, Response } from "express";
import { uploadToR2 } from "../services/r2Storage";
import { db } from "../db";
import { documents } from "../db/schema";
import mime from "mime-types";
import crypto from "crypto";
import "../types/User";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];

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

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and PDF are allowed" 
      });
    }

    const extension = mime.extension(req.file.mimetype) || "bin";
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return res.status(400).json({ 
        error: "Invalid file extension" 
      });
    }

    const key = `${userId}/${type}_${crypto.randomUUID()}.${extension}`;

    const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const doc = await db
      .insert(documents)
      .values({
        userId,
        type,
        fileUrl: url,
        status: "uploaded",
      })
      .returning();

    return res.json({
      success: true,
      fileUrl: url,
      document: doc[0],
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
};
