import {
  dequeue,
  requeue,
  markComplete,
  markFailed,
  getAttempts,
  incrementAttempts,
  processDelayedQueue,
  getQueueStats,
} from "../services/queueService";
import { isRedisHealthy } from "../services/redisClient";
import { processDocumentOCR, markDocumentFailed } from "./ocrWorker";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000;
let isWorkerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
let delayedQueueInterval: NodeJS.Timeout | null = null;
let redisAvailable = false;

function calculateExponentialDelay(attempts: number): number {
  return BASE_DELAY_MS * Math.pow(3, attempts - 1);
}

async function processNextDocument(): Promise<void> {
  if (isWorkerRunning || !redisAvailable) {
    return;
  }

  try {
    isWorkerRunning = true;

    const documentId = await dequeue();

    if (!documentId) {
      return;
    }

    const currentAttempts = await getAttempts(documentId);
    logger.info("Processing document from queue", { documentId, currentAttempts });

    const result = await processDocumentOCR(documentId);

    if (result.success) {
      await markComplete(documentId);
      logger.info("Document processing completed successfully", {
        documentId,
        score: result.score,
        outcome: result.outcome,
      });
    } else {
      const newAttempts = await incrementAttempts(documentId);

      if (newAttempts < MAX_RETRIES) {
        const delayMs = calculateExponentialDelay(newAttempts);
        await requeue(documentId, delayMs);
        logger.warn("Document processing failed, requeued with backoff", {
          documentId,
          attempt: newAttempts,
          maxRetries: MAX_RETRIES,
          delayMs,
          error: result.error,
        });
      } else {
        await markFailed(documentId);
        await markDocumentFailed(documentId, result.error || "Max retries exceeded");
        logger.error("Document processing failed permanently", {
          documentId,
          attempts: newAttempts,
          error: result.error,
        });
      }
    }
  } catch (error) {
    logger.error("Queue worker error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    isWorkerRunning = false;
  }
}

async function checkDelayedQueue(): Promise<void> {
  if (!redisAvailable) {
    return;
  }
  
  try {
    const movedCount = await processDelayedQueue();
    if (movedCount > 0) {
      logger.info("Moved delayed documents to main queue", { count: movedCount });
    }
  } catch (error) {
    logger.error("Failed to process delayed queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function checkAndUpdateRedisHealth(): Promise<void> {
  const wasAvailable = redisAvailable;
  redisAvailable = await isRedisHealthy();
  
  if (!wasAvailable && redisAvailable) {
    logger.info("Redis connection restored");
  } else if (wasAvailable && !redisAvailable) {
    logger.warn("Redis connection lost");
  }
}

export async function startQueueWorker(pollIntervalMs: number = 3000): Promise<void> {
  if (workerInterval) {
    logger.warn("Queue worker already running");
    return;
  }

  redisAvailable = await isRedisHealthy();
  
  if (!redisAvailable) {
    logger.warn("Redis not available - queue worker will run in degraded mode");
  }

  logger.info("Starting queue worker", { pollIntervalMs, redisAvailable });

  workerInterval = setInterval(async () => {
    await checkAndUpdateRedisHealth();
    await processNextDocument();
  }, pollIntervalMs);

  delayedQueueInterval = setInterval(async () => {
    await checkDelayedQueue();
  }, 1000);

  if (redisAvailable) {
    processNextDocument();
  }
}

export function stopQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info("Queue worker stopped");
  }

  if (delayedQueueInterval) {
    clearInterval(delayedQueueInterval);
    delayedQueueInterval = null;
    logger.info("Delayed queue checker stopped");
  }
}

export async function getWorkerStatus(): Promise<{
  isRunning: boolean;
  isProcessing: boolean;
  queueStats: {
    queueLength: number;
    processingCount: number;
    delayedCount: number;
  };
}> {
  const queueStats = await getQueueStats();
  return {
    isRunning: workerInterval !== null,
    isProcessing: isWorkerRunning,
    queueStats,
  };
}

export { MAX_RETRIES, BASE_DELAY_MS };
