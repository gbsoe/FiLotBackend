import { Request, Response } from "express";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { queueDocumentForProcessing } from "../ocr/processor";

export const processDocument = async (req: Request, res: Response) => {
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

    if (document.status === "processing") {
      return res.status(400).json({ error: "Document is already being processed" });
    }

    if (document.status === "completed") {
      return res.status(400).json({ error: "Document has already been processed" });
    }

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    queueDocumentForProcessing(documentId);

    return res.json({
      queued: true,
      documentId: documentId,
    });
  } catch (error) {
    console.error("Process document error:", error);
    return res.status(500).json({ error: "Failed to queue document for processing" });
  }
};

export const getDocumentResult = async (req: Request, res: Response) => {
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

    if (document.status === "failed") {
      return res.json({
        status: document.status,
        error: document.resultJson && typeof document.resultJson === 'object' && 'error' in document.resultJson
          ? (document.resultJson as any).error
          : "Processing failed",
      });
    }

    return res.json({
      status: document.status,
      result: document.resultJson,
    });
  } catch (error) {
    console.error("Get document result error:", error);
    return res.status(500).json({ error: "Failed to retrieve document result" });
  }
};
