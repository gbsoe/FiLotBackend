import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { runOCR } from "../ocr/tesseractService";
import { parseKTP } from "../ocr/ktpParser";
import { parseNPWP } from "../ocr/npwpParser";
import { downloadFromR2, extractKeyFromUrl } from "../services/r2Storage";
import { determineVerificationPath } from "../verification/hybridEngine";
import { escalateToBuli2 } from "../buli2/escalationService";
import { logger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

export interface OCRResult {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: any;
  score?: number;
  decision?: string;
  outcome?: string;
  error?: string;
}

export async function processDocumentOCR(documentId: string): Promise<OCRResult> {
  let tempFilePath: string | null = null;

  try {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      logger.error("Document not found for OCR processing", { documentId });
      return {
        success: false,
        documentId,
        error: "Document not found",
      };
    }

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    logger.info("Starting OCR for document", { documentId, type: document.type });

    if (!document.fileUrl) {
      throw new Error("Document has no file URL");
    }

    const fileKey = extractKeyFromUrl(document.fileUrl);
    const fileBuffer = await downloadFromR2(fileKey);

    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const fileExtension = path.extname(fileKey);
    tempFilePath = path.join(tmpDir, `${documentId}${fileExtension}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    const ocrText = await runOCR(tempFilePath);
    logger.info("OCR extraction completed", { documentId });

    let parsedResult: any;
    if (document.type === "KTP") {
      parsedResult = parseKTP(ocrText);
    } else if (document.type === "NPWP") {
      parsedResult = parseNPWP(ocrText);
    } else {
      throw new Error(`Unknown document type: ${document.type}`);
    }

    const docType = document.type as "KTP" | "NPWP";
    const { outcome, score, decision } = determineVerificationPath(docType, parsedResult);

    await db
      .update(documents)
      .set({
        status: "completed",
        aiScore: score,
        aiDecision: decision,
        verificationStatus: outcome,
        resultJson: parsedResult,
        ocrText: ocrText,
        processedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    logger.info("Document OCR processed successfully", { documentId, score, outcome });

    if (outcome === "pending_manual_review") {
      const docWithId = { ...document, id: documentId };
      await escalateToBuli2(docWithId, parsedResult, score);
      logger.info("Document escalated to BULI2 for manual review", { documentId });
    }

    return {
      success: true,
      documentId,
      ocrText,
      parsedResult,
      score,
      decision,
      outcome,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("OCR processing failed", { documentId, error: errorMessage });

    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.warn("Failed to cleanup temp file", { tempFilePath });
      }
    }
  }
}

export async function markDocumentFailed(
  documentId: string,
  errorMessage: string
): Promise<void> {
  try {
    await db
      .update(documents)
      .set({
        status: "failed",
        resultJson: {
          error: errorMessage,
          failedAt: new Date().toISOString(),
          maxRetriesExceeded: true,
        },
      })
      .where(eq(documents.id, documentId));

    logger.info("Document marked as failed", { documentId, error: errorMessage });
  } catch (error) {
    logger.error("Failed to mark document as failed in database", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
