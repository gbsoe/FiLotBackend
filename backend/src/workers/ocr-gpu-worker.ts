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
import { getRedisClient, isRedisHealthy } from "../services/redisClient";
import * as fs from "fs";
import * as path from "path";

const GPU_QUEUE_KEY = process.env.OCR_GPU_QUEUE_KEY || "filot:ocr:gpu:queue";
const GPU_PROCESSING_KEY = process.env.OCR_GPU_PROCESSING_KEY || "filot:ocr:gpu:processing";
const GPU_RESULTS_CHANNEL = process.env.OCR_GPU_PUBLISH_CHANNEL || "filot:ocr:gpu:results";
const GPU_CONCURRENCY = parseInt(process.env.OCR_GPU_CONCURRENCY || "2", 10);
const GPU_POLL_INTERVAL_MS = parseInt(process.env.OCR_GPU_POLL_INTERVAL || "1000", 10);

export interface GPUOCRResult {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: Record<string, unknown>;
  score?: number;
  decision?: string;
  outcome?: string;
  error?: string;
  gpuProcessed: boolean;
  processingTimeMs?: number;
}

interface GPUWorkerState {
  isRunning: boolean;
  isGPUAvailable: boolean;
  activeJobs: Set<string>;
  pollIntervalId: NodeJS.Timeout | null;
}

const workerState: GPUWorkerState = {
  isRunning: false,
  isGPUAvailable: false,
  activeJobs: new Set(),
  pollIntervalId: null,
};

export function isGPUEnabled(): boolean {
  const enabled = process.env.OCR_GPU_ENABLED?.toLowerCase();
  return enabled === "true" || enabled === "1";
}

export function isGPUAutoFallbackEnabled(): boolean {
  const autoFallback = process.env.OCR_GPU_AUTOFALLBACK?.toLowerCase();
  return autoFallback !== "false";
}

async function checkGPUAvailability(): Promise<boolean> {
  try {
    if (process.env.NVIDIA_VISIBLE_DEVICES === "none") {
      return false;
    }
    return true;
  } catch (error) {
    logger.error("GPU availability check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export async function enqueueForGPU(documentId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    
    const existsInQueue = await redis.lpos(GPU_QUEUE_KEY, documentId);
    const existsInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
    
    if (existsInQueue !== null || existsInProcessing) {
      logger.info("Document already in GPU queue or processing", { documentId });
      return false;
    }
    
    await redis.rpush(GPU_QUEUE_KEY, documentId);
    logger.info("Document enqueued for GPU OCR processing", { documentId });
    return true;
  } catch (error) {
    logger.error("Failed to enqueue document for GPU processing", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

async function dequeueFromGPU(): Promise<string | null> {
  try {
    const redis = getRedisClient();
    const documentId = await redis.lpop(GPU_QUEUE_KEY);
    
    if (documentId) {
      await redis.sadd(GPU_PROCESSING_KEY, documentId);
      logger.info("Document dequeued for GPU processing", { documentId });
    }
    
    return documentId;
  } catch (error) {
    logger.error("Failed to dequeue document from GPU queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function markGPUComplete(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.srem(GPU_PROCESSING_KEY, documentId);
    workerState.activeJobs.delete(documentId);
    logger.info("Document marked complete in GPU processing", { documentId });
  } catch (error) {
    logger.error("Failed to mark GPU document complete", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function publishResult(result: GPUOCRResult): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.publish(GPU_RESULTS_CHANNEL, JSON.stringify(result));
    logger.info("GPU OCR result published", {
      documentId: result.documentId,
      success: result.success,
    });
  } catch (error) {
    logger.error("Failed to publish GPU OCR result", {
      documentId: result.documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function processDocumentGPU(documentId: string): Promise<GPUOCRResult> {
  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      logger.error("Document not found for GPU OCR processing", { documentId });
      return {
        success: false,
        documentId,
        error: "Document not found",
        gpuProcessed: false,
      };
    }

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    logger.info("Starting GPU OCR for document", {
      documentId,
      type: document.type,
      gpuEnabled: isGPUEnabled(),
    });

    if (!document.fileUrl) {
      throw new Error("Document has no file URL");
    }

    const fileKey = extractKeyFromUrl(document.fileUrl);
    const fileBuffer = await downloadFromR2(fileKey);

    const tmpDir = "/tmp/gpu-ocr";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const fileExtension = path.extname(fileKey);
    tempFilePath = path.join(tmpDir, `${documentId}${fileExtension}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    const ocrText = await runOCR(tempFilePath);
    logger.info("GPU OCR extraction completed", { documentId });

    let parsedResult: Record<string, unknown>;
    if (document.type === "KTP") {
      parsedResult = parseKTP(ocrText) as unknown as Record<string, unknown>;
    } else if (document.type === "NPWP") {
      parsedResult = parseNPWP(ocrText) as unknown as Record<string, unknown>;
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

    const processingTimeMs = Date.now() - startTime;
    logger.info("GPU Document OCR processed successfully", {
      documentId,
      score,
      outcome,
      processingTimeMs,
    });

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
      gpuProcessed: true,
      processingTimeMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("GPU OCR processing failed", { documentId, error: errorMessage });

    try {
      await db
        .update(documents)
        .set({
          status: "failed",
          resultJson: {
            error: errorMessage,
            failedAt: new Date().toISOString(),
            gpuProcessingFailed: true,
          },
        })
        .where(eq(documents.id, documentId));
    } catch (dbError) {
      logger.error("Failed to update document status after GPU error", {
        documentId,
        dbError: dbError instanceof Error ? dbError.message : "Unknown error",
      });
    }

    return {
      success: false,
      documentId,
      error: errorMessage,
      gpuProcessed: false,
      processingTimeMs: Date.now() - startTime,
    };
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.warn("Failed to cleanup GPU temp file", { tempFilePath });
      }
    }
  }
}

async function processNextJob(): Promise<void> {
  if (workerState.activeJobs.size >= GPU_CONCURRENCY) {
    return;
  }

  const documentId = await dequeueFromGPU();
  if (!documentId) {
    return;
  }

  workerState.activeJobs.add(documentId);

  try {
    const result = await processDocumentGPU(documentId);
    await publishResult(result);
  } finally {
    await markGPUComplete(documentId);
  }
}

async function pollLoop(): Promise<void> {
  if (!workerState.isRunning) {
    return;
  }

  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis not healthy, GPU worker pausing");
      return;
    }

    const pendingSlots = GPU_CONCURRENCY - workerState.activeJobs.size;
    const processPromises: Promise<void>[] = [];

    for (let i = 0; i < pendingSlots; i++) {
      processPromises.push(processNextJob());
    }

    await Promise.all(processPromises);
  } catch (error) {
    logger.error("GPU worker poll loop error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function startGPUWorker(): Promise<void> {
  if (!isGPUEnabled()) {
    logger.info("GPU OCR worker is disabled (OCR_GPU_ENABLED != true)");
    return;
  }

  if (workerState.isRunning) {
    logger.warn("GPU OCR worker is already running");
    return;
  }

  const redisHealthy = await isRedisHealthy();
  if (!redisHealthy) {
    logger.error("Cannot start GPU worker: Redis not available");
    return;
  }

  workerState.isGPUAvailable = await checkGPUAvailability();
  if (!workerState.isGPUAvailable && !isGPUAutoFallbackEnabled()) {
    logger.error("GPU not available and auto-fallback is disabled");
    return;
  }

  workerState.isRunning = true;
  workerState.pollIntervalId = setInterval(pollLoop, GPU_POLL_INTERVAL_MS);

  logger.info("GPU OCR worker started", {
    concurrency: GPU_CONCURRENCY,
    pollIntervalMs: GPU_POLL_INTERVAL_MS,
    gpuAvailable: workerState.isGPUAvailable,
    autoFallbackEnabled: isGPUAutoFallbackEnabled(),
  });
}

export function stopGPUWorker(): void {
  if (!workerState.isRunning) {
    logger.warn("GPU OCR worker is not running");
    return;
  }

  if (workerState.pollIntervalId) {
    clearInterval(workerState.pollIntervalId);
    workerState.pollIntervalId = null;
  }

  workerState.isRunning = false;
  logger.info("GPU OCR worker stopped", {
    activeJobs: workerState.activeJobs.size,
  });
}

export async function getGPUWorkerStatus(): Promise<{
  isRunning: boolean;
  isGPUAvailable: boolean;
  isGPUEnabled: boolean;
  activeJobsCount: number;
  queueLength: number;
  processingCount: number;
}> {
  let queueLength = 0;
  let processingCount = 0;

  try {
    const redisHealthy = await isRedisHealthy();
    if (redisHealthy) {
      const redis = getRedisClient();
      queueLength = await redis.llen(GPU_QUEUE_KEY);
      processingCount = await redis.scard(GPU_PROCESSING_KEY);
    }
  } catch (error) {
    logger.error("Failed to get GPU queue stats", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return {
    isRunning: workerState.isRunning,
    isGPUAvailable: workerState.isGPUAvailable,
    isGPUEnabled: isGPUEnabled(),
    activeJobsCount: workerState.activeJobs.size,
    queueLength,
    processingCount,
  };
}

export async function getGPUQueueLength(): Promise<number> {
  try {
    const redis = getRedisClient();
    return await redis.llen(GPU_QUEUE_KEY);
  } catch (error) {
    return 0;
  }
}

export async function clearGPUQueues(): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(GPU_QUEUE_KEY);
    await redis.del(GPU_PROCESSING_KEY);
    logger.info("GPU queues cleared");
  } catch (error) {
    logger.error("Failed to clear GPU queues", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
