import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { runOCR } from "./tesseractService";
import { parseKTP } from "./ktpParser";
import { parseNPWP } from "./npwpParser";
import { downloadFromR2, extractKeyFromUrl } from "../services/r2Storage";
import { determineVerificationPath } from "../verification/hybridEngine";
import { escalateToBuli2 } from "../buli2/escalationService";
import { logger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

const processingQueue: string[] = [];
let isProcessing = false;

export function queueDocumentForProcessing(documentId: string) {
  if (!processingQueue.includes(documentId)) {
    processingQueue.push(documentId);
    logger.info("Document queued for processing", { documentId });
  }
}

async function processDocument(documentId: string) {
  let tempFilePath: string | null = null;

  try {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      logger.error("Document not found for processing", { documentId });
      return;
    }

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    logger.info("Processing document", { documentId, type: document.type });

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
    logger.info("OCR completed", { documentId });

    let parsedResult: any;
    if (document.type === "KTP") {
      parsedResult = parseKTP(ocrText);
    } else if (document.type === "NPWP") {
      parsedResult = parseNPWP(ocrText);
    } else {
      throw new Error(`Unknown document type: ${document.type}`);
    }

    const docType = document.type as 'KTP' | 'NPWP';
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

    logger.info("Document processed", { documentId, score, outcome });

    if (outcome === "pending_manual_review") {
      const docWithId = { ...document, id: documentId };
      await escalateToBuli2(docWithId, parsedResult, score);
      logger.info("Document escalated to Buli2 for manual review", { documentId });
    }

    logger.info("Document processing completed successfully", { documentId });
  } catch (error) {
    logger.error("Error processing document", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    await db
      .update(documents)
      .set({
        status: "failed",
        resultJson: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })
      .where(eq(documents.id, documentId));
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

async function processNextInQueue() {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const documentId = processingQueue.shift();

  if (documentId) {
    try {
      await processDocument(documentId);
    } catch (error) {
      logger.error("Unexpected error in processing queue", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  isProcessing = false;
}

export function startProcessingLoop() {
  logger.info("Starting OCR processing loop");
  setInterval(async () => {
    await processNextInQueue();
  }, 3000);
}
