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
import { markDocumentFailed, processDocumentOCR } from "./ocrWorker";
import * as fs from "fs";
import * as path from "path";

const GPU_QUEUE_KEY = process.env.OCR_GPU_QUEUE_KEY || "filot:ocr:gpu:queue";
const GPU_PROCESSING_KEY = process.env.OCR_GPU_PROCESSING_KEY || "filot:ocr:gpu:processing";
const GPU_ATTEMPTS_KEY = process.env.OCR_GPU_ATTEMPTS_KEY || "filot:ocr:gpu:attempts";
const GPU_RESULTS_CHANNEL = process.env.OCR_GPU_PUBLISH_CHANNEL || "filot:ocr:gpu:results";
const GPU_CONCURRENCY = parseInt(process.env.OCR_GPU_CONCURRENCY || "2", 10);
const GPU_POLL_INTERVAL_MS = parseInt(process.env.OCR_GPU_POLL_INTERVAL || "1000", 10);
const GPU_MAX_RETRIES = parseInt(process.env.OCR_GPU_MAX_RETRIES || "3", 10);

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
  activeJobs: Map<string, Promise<GPUOCRResult>>;
  pollIntervalId: NodeJS.Timeout | null;
}

const workerState: GPUWorkerState = {
  isRunning: false,
  isGPUAvailable: false,
  activeJobs: new Map(),
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
      logger.info("GPU disabled via NVIDIA_VISIBLE_DEVICES=none");
      return false;
    }
    
    if (process.env.OCR_GPU_ENABLED !== "true" && process.env.OCR_GPU_ENABLED !== "1") {
      logger.info("GPU not enabled via OCR_GPU_ENABLED");
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
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis not healthy, falling back to CPU queue", { documentId });
      return false;
    }
    
    const redis = getRedisClient();
    
    const existsInQueue = await redis.lpos(GPU_QUEUE_KEY, documentId);
    const existsInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
    
    if (existsInQueue !== null || existsInProcessing) {
      logger.info("Document already in GPU queue or processing", { documentId });
      return false;
    }
    
    await redis.rpush(GPU_QUEUE_KEY, documentId);
    await redis.hset(GPU_ATTEMPTS_KEY, documentId, "0");
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
    const pipeline = redis.pipeline();
    pipeline.srem(GPU_PROCESSING_KEY, documentId);
    pipeline.hdel(GPU_ATTEMPTS_KEY, documentId);
    await pipeline.exec();
    workerState.activeJobs.delete(documentId);
    logger.info("Document marked complete in GPU processing", { documentId });
  } catch (error) {
    logger.error("Failed to mark GPU document complete", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    workerState.activeJobs.delete(documentId);
  }
}

async function getAttempts(documentId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const attempts = await redis.hget(GPU_ATTEMPTS_KEY, documentId);
    return attempts ? parseInt(attempts, 10) : 0;
  } catch (error) {
    logger.error("Failed to get GPU attempts", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

async function incrementAttempts(documentId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const newAttempts = await redis.hincrby(GPU_ATTEMPTS_KEY, documentId, 1);
    return newAttempts;
  } catch (error) {
    logger.error("Failed to increment GPU attempts", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return GPU_MAX_RETRIES + 1;
  }
}

async function requeueWithDelay(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.srem(GPU_PROCESSING_KEY, documentId);
    await redis.rpush(GPU_QUEUE_KEY, documentId);
    logger.info("Document requeued for GPU retry", { documentId });
  } catch (error) {
    logger.error("Failed to requeue document for GPU", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function fallbackToCPU(documentId: string): Promise<void> {
  try {
    logger.info("Falling back to CPU OCR processing", { documentId });
    await processDocumentOCR(documentId);
  } catch (error) {
    logger.error("CPU fallback processing failed", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await markDocumentFailed(documentId, "GPU and CPU processing both failed");
  }
}

async function publishResult(result: GPUOCRResult): Promise<void> {
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis not healthy, skipping result publish", {
        documentId: result.documentId,
      });
      return;
    }
    
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
      gpuAvailable: workerState.isGPUAvailable,
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
    const processingTimeMs = Date.now() - startTime;
    
    logger.error("GPU OCR processing failed", {
      documentId,
      error: errorMessage,
      processingTimeMs,
    });

    return {
      success: false,
      documentId,
      error: errorMessage,
      gpuProcessed: false,
      processingTimeMs,
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

async function processJob(documentId: string): Promise<void> {
  try {
    const attempts = await incrementAttempts(documentId);
    
    const result = await processDocumentGPU(documentId);
    
    if (!result.success) {
      if (attempts < GPU_MAX_RETRIES) {
        logger.info("GPU processing failed, will retry", {
          documentId,
          attempts,
          maxRetries: GPU_MAX_RETRIES,
        });
        await requeueWithDelay(documentId);
        return;
      }
      
      logger.error("GPU processing max retries exceeded", {
        documentId,
        attempts,
      });
      
      if (isGPUAutoFallbackEnabled()) {
        await fallbackToCPU(documentId);
      } else {
        await markDocumentFailed(documentId, `GPU processing failed after ${attempts} attempts: ${result.error}`);
      }
    }
    
    await publishResult(result);
    await markGPUComplete(documentId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("GPU job processing error", {
      documentId,
      error: errorMessage,
    });
    
    const attempts = await getAttempts(documentId);
    if (attempts >= GPU_MAX_RETRIES) {
      if (isGPUAutoFallbackEnabled()) {
        await fallbackToCPU(documentId);
      } else {
        await markDocumentFailed(documentId, errorMessage);
      }
      await markGPUComplete(documentId);
    } else {
      await requeueWithDelay(documentId);
    }
  } finally {
    workerState.activeJobs.delete(documentId);
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

    const availableSlots = GPU_CONCURRENCY - workerState.activeJobs.size;
    
    for (let i = 0; i < availableSlots; i++) {
      const documentId = await dequeueFromGPU();
      if (!documentId) {
        break;
      }
      
      const jobPromise = processJob(documentId);
      workerState.activeJobs.set(documentId, jobPromise as unknown as Promise<GPUOCRResult>);
    }
  } catch (error) {
    logger.error("GPU worker poll loop error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function startGPUWorker(): Promise<boolean> {
  if (workerState.isRunning) {
    logger.warn("GPU OCR worker is already running");
    return true;
  }

  workerState.isGPUAvailable = await checkGPUAvailability();
  
  if (!workerState.isGPUAvailable) {
    if (isGPUAutoFallbackEnabled()) {
      logger.info("GPU not available, worker will fallback to CPU processing for queued items");
    } else {
      logger.warn("GPU not available and auto-fallback disabled, GPU worker not starting");
      return false;
    }
  }

  const redisHealthy = await isRedisHealthy();
  if (!redisHealthy) {
    logger.error("Cannot start GPU worker: Redis not available");
    return false;
  }

  workerState.isRunning = true;
  workerState.pollIntervalId = setInterval(pollLoop, GPU_POLL_INTERVAL_MS);

  logger.info("GPU OCR worker started", {
    concurrency: GPU_CONCURRENCY,
    pollIntervalMs: GPU_POLL_INTERVAL_MS,
    gpuAvailable: workerState.isGPUAvailable,
    autoFallbackEnabled: isGPUAutoFallbackEnabled(),
    maxRetries: GPU_MAX_RETRIES,
  });
  
  return true;
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
  autoFallbackEnabled: boolean;
  maxRetries: number;
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
    autoFallbackEnabled: isGPUAutoFallbackEnabled(),
    maxRetries: GPU_MAX_RETRIES,
  };
}

export async function getGPUQueueLength(): Promise<number> {
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      return 0;
    }
    const redis = getRedisClient();
    return await redis.llen(GPU_QUEUE_KEY);
  } catch (error) {
    return 0;
  }
}

export async function clearGPUQueues(): Promise<void> {
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Cannot clear GPU queues: Redis not healthy");
      return;
    }
    const redis = getRedisClient();
    await redis.del(GPU_QUEUE_KEY);
    await redis.del(GPU_PROCESSING_KEY);
    await redis.del(GPU_ATTEMPTS_KEY);
    logger.info("GPU queues cleared");
  } catch (error) {
    logger.error("Failed to clear GPU queues", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
