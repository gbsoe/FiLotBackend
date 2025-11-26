import { Router, Request, Response } from "express";
import { generatePresignedUrl, extractKeyFromUrl } from "../services/r2Storage";
import { authRequired } from "../auth/middleware";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

const router = Router();

router.get("/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await db.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!document) {
      logger.warn("Secure download: Document not found", { documentId: id });
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.userId !== req.user!.id) {
      logger.warn("Secure download: Forbidden access attempt", {
        documentId: id,
        documentOwnerId: document.userId,
        requesterId: req.user!.id,
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!document.fileUrl) {
      logger.warn("Secure download: Document has no file URL", { documentId: id });
      return res.status(404).json({ error: "Document file not available" });
    }

    const fileKey = extractKeyFromUrl(document.fileUrl);
    const signedUrl = await generatePresignedUrl(fileKey);

    logger.info("Secure download: Presigned URL generated", {
      documentId: id,
      userId: req.user!.id,
      fileKey,
    });

    res.json({ url: signedUrl });
  } catch (err) {
    logger.error("Secure download: Failed to generate presigned URL", {
      error: err instanceof Error ? err.message : String(err),
      documentId: req.params.id,
    });
    res.status(500).json({ error: "Failed to generate secure URL" });
  }
});

export default router;
