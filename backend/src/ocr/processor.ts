import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { runOCR } from "./tesseractService";
import { parseKTP } from "./ktpParser";
import { parseNPWP } from "./npwpParser";
import { downloadFromR2 } from "../services/r2Storage";
import * as fs from "fs";
import * as path from "path";

const processingQueue: string[] = [];
let isProcessing = false;

export function queueDocumentForProcessing(documentId: string) {
  if (!processingQueue.includes(documentId)) {
    processingQueue.push(documentId);
    console.log(`Document ${documentId} queued for processing`);
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
      console.error(`Document ${documentId} not found`);
      return;
    }

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    console.log(`Processing document ${documentId} of type ${document.type}`);

    if (!document.fileUrl) {
      throw new Error("Document has no file URL");
    }

    const fileKey = document.fileUrl.split("/").slice(-2).join("/");
    const fileBuffer = await downloadFromR2(fileKey);

    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const fileExtension = path.extname(fileKey);
    tempFilePath = path.join(tmpDir, `${documentId}${fileExtension}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    const ocrText = await runOCR(tempFilePath);
    console.log(`OCR completed for document ${documentId}`);

    let parsedResult: any;
    if (document.type === "KTP") {
      parsedResult = parseKTP(ocrText);
    } else if (document.type === "NPWP") {
      parsedResult = parseNPWP(ocrText);
    } else {
      throw new Error(`Unknown document type: ${document.type}`);
    }

    await db
      .update(documents)
      .set({
        status: "completed",
        resultJson: parsedResult,
      })
      .where(eq(documents.id, documentId));

    console.log(`Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);

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
      console.error("Unexpected error in processNextInQueue:", error);
    }
  }

  isProcessing = false;
}

export function startProcessingLoop() {
  console.log("Starting OCR processing loop...");
  setInterval(async () => {
    await processNextInQueue();
  }, 3000);
}
