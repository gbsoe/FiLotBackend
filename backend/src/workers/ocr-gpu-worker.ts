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
import * as crypto from "crypto";

const GPU_QUEUE_KEY = process.env.OCR_GPU_QUEUE_KEY || "filot:ocr:gpu:queue";
const GPU_PROCESSING_KEY = process.env.OCR_GPU_PROCESSING_KEY || "filot:ocr:gpu:processing";
const GPU_ATTEMPTS_KEY = process.env.OCR_GPU_ATTEMPTS_KEY || "filot:ocr:gpu:attempts";
const GPU_RESULTS_CHANNEL = process.env.OCR_GPU_PUBLISH_CHANNEL || "filot:ocr:gpu:results";
const GPU_PROCESSING_TIMESTAMPS_KEY = "filot:ocr:gpu:processing:timestamps";
const GPU_CORRELATION_KEY = "filot:ocr:gpu:correlation";
const GPU_LOCK_PREFIX = "filot:ocr:gpu:lock:";
const GPU_CONCURRENCY = parseInt(process.env.OCR_GPU_CONCURRENCY || "2", 10);
const GPU_POLL_INTERVAL_MS = parseInt(process.env.OCR_GPU_POLL_INTERVAL || "1000", 10);
const GPU_MAX_RETRIES = parseInt(process.env.OCR_GPU_MAX_RETRIES || "3", 10);
const STUCK_JOB_TIMEOUT_MS = parseInt(process.env.OCR_GPU_STUCK_TIMEOUT || "300000", 10);
const REAPER_INTERVAL_MS = parseInt(process.env.OCR_GPU_REAPER_INTERVAL || "60000", 10);
const LOCK_TTL_SECONDS = parseInt(process.env.OCR_GPU_LOCK_TTL || "600", 10);

export interface GPUOCRResult {
  success: boolean;
  documentId: string;
  correlationId?: string;
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
  reaperIntervalId: NodeJS.Timeout | null;
  lastReaperRun: number;
}

const workerState: GPUWorkerState = {
  isRunning: false,
  isGPUAvailable: false,
  activeJobs: new Map(),
  pollIntervalId: null,
  reaperIntervalId: null,
  lastReaperRun: 0,
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

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

async function getCorrelationId(documentId: string): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.hget(GPU_CORRELATION_KEY, documentId);
  } catch (error) {
    logger.error("Failed to get correlation ID", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function setCorrelationId(documentId: string, correlationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.hset(GPU_CORRELATION_KEY, documentId, correlationId);
  } catch (error) {
    logger.error("Failed to set correlation ID", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function clearCorrelationId(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.hdel(GPU_CORRELATION_KEY, documentId);
  } catch (error) {
    logger.error("Failed to clear correlation ID", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function acquireProcessingLock(documentId: string, correlationId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const lockKey = `${GPU_LOCK_PREFIX}${documentId}`;
    const result = await redis.set(lockKey, correlationId, "EX", LOCK_TTL_SECONDS, "NX");
    return result === "OK";
  } catch (error) {
    logger.error("Failed to acquire processing lock", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

async function releaseProcessingLock(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const lockKey = `${GPU_LOCK_PREFIX}${documentId}`;
    await redis.del(lockKey);
  } catch (error) {
    logger.error("Failed to release processing lock", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function getProcessingStartTime(documentId: string): Promise<number | null> {
  try {
    const redis = getRedisClient();
    const timestamp = await redis.hget(GPU_PROCESSING_TIMESTAMPS_KEY, documentId);
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    logger.error("Failed to get processing start time", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function clearProcessingStartTime(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.hdel(GPU_PROCESSING_TIMESTAMPS_KEY, documentId);
  } catch (error) {
    logger.error("Failed to clear processing start time", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function checkDocumentStatus(documentId: string): Promise<string | null> {
  try {
    const [document] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, documentId));
    return document?.status || null;
  } catch (error) {
    logger.error("Failed to check document status", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

export async function reapStuckJobs(): Promise<number> {
  const correlationId = generateCorrelationId();
  logger.info("Starting stuck job reaper", { correlationId });
  
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis not healthy, skipping stuck job reaper", { correlationId });
      return 0;
    }
    
    const redis = getRedisClient();
    const processingDocIds = await redis.smembers(GPU_PROCESSING_KEY);
    
    if (processingDocIds.length === 0) {
      logger.info("No documents in processing set", { correlationId });
      return 0;
    }
    
    const now = Date.now();
    let reapedCount = 0;
    
    for (const documentId of processingDocIds) {
      const jobCorrelationId = await getCorrelationId(documentId);
      const startTime = await getProcessingStartTime(documentId);
      
      if (startTime === null) {
        logger.warn("Document in processing set without start time, marking for reap", {
          documentId,
          correlationId: jobCorrelationId || correlationId,
        });
        await handleStuckJob(documentId, jobCorrelationId || correlationId);
        reapedCount++;
        continue;
      }
      
      const processingDuration = now - startTime;
      
      if (processingDuration > STUCK_JOB_TIMEOUT_MS) {
        logger.warn("Stuck job detected", {
          documentId,
          correlationId: jobCorrelationId || correlationId,
          processingDurationMs: processingDuration,
          timeoutMs: STUCK_JOB_TIMEOUT_MS,
        });
        await handleStuckJob(documentId, jobCorrelationId || correlationId);
        reapedCount++;
      }
    }
    
    if (reapedCount > 0) {
      logger.info("Stuck job reaper completed", {
        correlationId,
        reapedCount,
        totalProcessing: processingDocIds.length,
      });
    }
    
    return reapedCount;
  } catch (error) {
    logger.error("Stuck job reaper failed", {
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

async function handleStuckJob(documentId: string, correlationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const attempts = await getAttempts(documentId);
    
    if (attempts >= GPU_MAX_RETRIES) {
      logger.error("Stuck job exceeded max retries, marking as failed", {
        documentId,
        correlationId,
        attempts,
        maxRetries: GPU_MAX_RETRIES,
      });
      
      await markDocumentFailed(documentId, `Job stuck and exceeded ${GPU_MAX_RETRIES} retries`);
      await markGPUComplete(documentId, correlationId);
    } else {
      logger.info("Requeueing stuck job for retry", {
        documentId,
        correlationId,
        attempts,
      });
      
      await releaseProcessingLock(documentId);
      await clearProcessingStartTime(documentId);
      await redis.srem(GPU_PROCESSING_KEY, documentId);
      await redis.rpush(GPU_QUEUE_KEY, documentId);
    }
  } catch (error) {
    logger.error("Failed to handle stuck job", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function enqueueForGPU(documentId: string): Promise<boolean> {
  const correlationId = generateCorrelationId();
  
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis not healthy, falling back to CPU queue", { 
        documentId, 
        correlationId,
      });
      return false;
    }
    
    const redis = getRedisClient();
    
    const existsInQueue = await redis.lpos(GPU_QUEUE_KEY, documentId);
    const existsInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
    
    if (existsInQueue !== null || existsInProcessing) {
      logger.info("Document already in GPU queue or processing", { 
        documentId, 
        correlationId,
      });
      return false;
    }
    
    await setCorrelationId(documentId, correlationId);
    await redis.rpush(GPU_QUEUE_KEY, documentId);
    await redis.hset(GPU_ATTEMPTS_KEY, documentId, "0");
    
    logger.info("Document enqueued for GPU OCR processing", { 
      documentId, 
      correlationId,
    });
    return true;
  } catch (error) {
    logger.error("Failed to enqueue document for GPU processing", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

async function dequeueFromGPU(): Promise<{ documentId: string; correlationId: string } | null> {
  try {
    const redis = getRedisClient();
    
    const documentId = await redis.lpop(GPU_QUEUE_KEY);
    if (!documentId) {
      return null;
    }
    
    let correlationId = await getCorrelationId(documentId);
    if (!correlationId) {
      correlationId = generateCorrelationId();
      await setCorrelationId(documentId, correlationId);
    }
    
    const lockAcquired = await acquireProcessingLock(documentId, correlationId);
    if (!lockAcquired) {
      logger.warn("Failed to acquire lock, document may be processed by another worker", {
        documentId,
        correlationId,
      });
      await redis.rpush(GPU_QUEUE_KEY, documentId);
      return null;
    }
    
    const status = await checkDocumentStatus(documentId);
    if (status === "processing" || status === "completed") {
      logger.warn("Document already being processed or completed, skipping", {
        documentId,
        correlationId,
        currentStatus: status,
      });
      await releaseProcessingLock(documentId);
      await clearCorrelationId(documentId);
      return null;
    }
    
    const pipeline = redis.multi();
    pipeline.sadd(GPU_PROCESSING_KEY, documentId);
    pipeline.hset(GPU_PROCESSING_TIMESTAMPS_KEY, documentId, Date.now().toString());
    const results = await pipeline.exec();
    
    if (!results || results.some(([err]) => err !== null)) {
      logger.error("Failed atomic dequeue operation", {
        documentId,
        correlationId,
      });
      await releaseProcessingLock(documentId);
      await redis.rpush(GPU_QUEUE_KEY, documentId);
      return null;
    }
    
    logger.info("Document dequeued for GPU processing", { 
      documentId, 
      correlationId,
    });
    
    return { documentId, correlationId };
  } catch (error) {
    logger.error("Failed to dequeue document from GPU queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function markGPUComplete(documentId: string, correlationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    pipeline.srem(GPU_PROCESSING_KEY, documentId);
    pipeline.hdel(GPU_ATTEMPTS_KEY, documentId);
    pipeline.hdel(GPU_PROCESSING_TIMESTAMPS_KEY, documentId);
    pipeline.hdel(GPU_CORRELATION_KEY, documentId);
    await pipeline.exec();
    
    await releaseProcessingLock(documentId);
    workerState.activeJobs.delete(documentId);
    
    logger.info("Document marked complete in GPU processing", { 
      documentId, 
      correlationId,
    });
  } catch (error) {
    logger.error("Failed to mark GPU document complete", {
      documentId,
      correlationId,
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

async function incrementAttempts(documentId: string, correlationId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const newAttempts = await redis.hincrby(GPU_ATTEMPTS_KEY, documentId, 1);
    logger.info("Incremented GPU attempt count", { 
      documentId, 
      correlationId,
      attempts: newAttempts,
    });
    return newAttempts;
  } catch (error) {
    logger.error("Failed to increment GPU attempts", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return GPU_MAX_RETRIES + 1;
  }
}

async function requeueWithDelay(documentId: string, correlationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await releaseProcessingLock(documentId);
    await clearProcessingStartTime(documentId);
    await redis.srem(GPU_PROCESSING_KEY, documentId);
    await redis.rpush(GPU_QUEUE_KEY, documentId);
    logger.info("Document requeued for GPU retry", { 
      documentId, 
      correlationId,
    });
  } catch (error) {
    logger.error("Failed to requeue document for GPU", {
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function fallbackToCPU(documentId: string, correlationId: string): Promise<void> {
  try {
    logger.info("Falling back to CPU OCR processing", { 
      documentId, 
      correlationId,
    });
    await processDocumentOCR(documentId);
  } catch (error) {
    logger.error("CPU fallback processing failed", {
      documentId,
      correlationId,
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
        correlationId: result.correlationId,
      });
      return;
    }
    
    const redis = getRedisClient();
    await redis.publish(GPU_RESULTS_CHANNEL, JSON.stringify(result));
    logger.info("GPU OCR result published", {
      documentId: result.documentId,
      correlationId: result.correlationId,
      success: result.success,
    });
  } catch (error) {
    logger.error("Failed to publish GPU OCR result", {
      documentId: result.documentId,
      correlationId: result.correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function processDocumentGPU(documentId: string, correlationId: string): Promise<GPUOCRResult> {
  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      logger.error("Document not found for GPU OCR processing", { 
        documentId, 
        correlationId,
      });
      return {
        success: false,
        documentId,
        correlationId,
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
      correlationId,
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
    logger.info("GPU OCR extraction completed", { 
      documentId, 
      correlationId,
    });

    await db
      .update(documents)
      .set({ 
        verificationStatus: "ocr_completed",
        ocrText: ocrText,
      })
      .where(eq(documents.id, documentId));

    logger.info("Document OCR completed, starting AI evaluation", {
      documentId,
      correlationId,
    });

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
        verificationStatus: "ai_evaluated",
        aiScore: score,
        aiDecision: decision,
        resultJson: parsedResult,
      })
      .where(eq(documents.id, documentId));

    logger.info("AI evaluation completed", {
      documentId,
      correlationId,
      score,
      decision,
    });

    await db
      .update(documents)
      .set({
        status: "completed",
        verificationStatus: outcome,
        processedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    const processingTimeMs = Date.now() - startTime;
    logger.info("GPU Document OCR processed successfully", {
      documentId,
      correlationId,
      score,
      outcome,
      processingTimeMs,
    });

    if (outcome === "pending_manual_review") {
      const docWithId = { ...document, id: documentId };
      await escalateToBuli2(docWithId, parsedResult, score);
      logger.info("Document escalated to BULI2 for manual review", { 
        documentId, 
        correlationId,
      });
    }

    return {
      success: true,
      documentId,
      correlationId,
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
      correlationId,
      error: errorMessage,
      processingTimeMs,
    });

    return {
      success: false,
      documentId,
      correlationId,
      error: errorMessage,
      gpuProcessed: false,
      processingTimeMs,
    };
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.warn("Failed to cleanup GPU temp file", { 
          tempFilePath, 
          correlationId,
        });
      }
    }
  }
}

async function processJob(documentId: string, correlationId: string): Promise<void> {
  try {
    const attempts = await incrementAttempts(documentId, correlationId);
    
    const result = await processDocumentGPU(documentId, correlationId);
    
    if (!result.success) {
      if (attempts < GPU_MAX_RETRIES) {
        logger.info("GPU processing failed, will retry", {
          documentId,
          correlationId,
          attempts,
          maxRetries: GPU_MAX_RETRIES,
        });
        await requeueWithDelay(documentId, correlationId);
        return;
      }
      
      logger.error("GPU processing max retries exceeded", {
        documentId,
        correlationId,
        attempts,
      });
      
      if (isGPUAutoFallbackEnabled()) {
        await fallbackToCPU(documentId, correlationId);
      } else {
        await markDocumentFailed(documentId, `GPU processing failed after ${attempts} attempts: ${result.error}`);
      }
    }
    
    await publishResult(result);
    await markGPUComplete(documentId, correlationId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("GPU job processing error", {
      documentId,
      correlationId,
      error: errorMessage,
    });
    
    const attempts = await getAttempts(documentId);
    if (attempts >= GPU_MAX_RETRIES) {
      if (isGPUAutoFallbackEnabled()) {
        await fallbackToCPU(documentId, correlationId);
      } else {
        await markDocumentFailed(documentId, errorMessage);
      }
      await markGPUComplete(documentId, correlationId);
    } else {
      await requeueWithDelay(documentId, correlationId);
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

    const now = Date.now();
    if (now - workerState.lastReaperRun >= REAPER_INTERVAL_MS) {
      workerState.lastReaperRun = now;
      reapStuckJobs().catch(err => {
        logger.error("Reaper failed in poll loop", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });
    }

    const availableSlots = GPU_CONCURRENCY - workerState.activeJobs.size;
    
    for (let i = 0; i < availableSlots; i++) {
      const dequeueResult = await dequeueFromGPU();
      if (!dequeueResult) {
        break;
      }
      
      const { documentId, correlationId } = dequeueResult;
      const jobPromise = processJob(documentId, correlationId);
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
  workerState.lastReaperRun = Date.now();
  workerState.pollIntervalId = setInterval(pollLoop, GPU_POLL_INTERVAL_MS);

  logger.info("GPU OCR worker started", {
    concurrency: GPU_CONCURRENCY,
    pollIntervalMs: GPU_POLL_INTERVAL_MS,
    gpuAvailable: workerState.isGPUAvailable,
    autoFallbackEnabled: isGPUAutoFallbackEnabled(),
    maxRetries: GPU_MAX_RETRIES,
    stuckJobTimeoutMs: STUCK_JOB_TIMEOUT_MS,
    reaperIntervalMs: REAPER_INTERVAL_MS,
    lockTtlSeconds: LOCK_TTL_SECONDS,
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

  if (workerState.reaperIntervalId) {
    clearInterval(workerState.reaperIntervalId);
    workerState.reaperIntervalId = null;
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
  stuckJobTimeoutMs: number;
  reaperIntervalMs: number;
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
    stuckJobTimeoutMs: STUCK_JOB_TIMEOUT_MS,
    reaperIntervalMs: REAPER_INTERVAL_MS,
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
    await redis.del(GPU_PROCESSING_TIMESTAMPS_KEY);
    await redis.del(GPU_CORRELATION_KEY);
    
    const lockKeys = await redis.keys(`${GPU_LOCK_PREFIX}*`);
    if (lockKeys.length > 0) {
      await redis.del(...lockKeys);
    }
    
    logger.info("GPU queues cleared");
  } catch (error) {
    logger.error("Failed to clear GPU queues", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
