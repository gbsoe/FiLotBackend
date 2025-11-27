import { getRedisClient } from "./redisClient";
import { logger } from "../utils/logger";

const QUEUE_KEY = "filot:ocr:queue";
const PROCESSING_KEY = "filot:ocr:processing";
const ATTEMPTS_HASH_KEY = "filot:ocr:attempts";
const DELAY_QUEUE_KEY = "filot:ocr:delayed";

export interface QueuedDocument {
  documentId: string;
  queuedAt: number;
  attempts: number;
}

export async function enqueue(documentId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    
    const existsInQueue = await redis.lpos(QUEUE_KEY, documentId);
    const existsInProcessing = await redis.sismember(PROCESSING_KEY, documentId);
    
    if (existsInQueue !== null || existsInProcessing) {
      logger.info("Document already in queue or processing", { documentId });
      return false;
    }
    
    await redis.rpush(QUEUE_KEY, documentId);
    await redis.hset(ATTEMPTS_HASH_KEY, documentId, "0");
    
    logger.info("Document enqueued for processing", { documentId });
    return true;
  } catch (error) {
    logger.error("Failed to enqueue document", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function dequeue(): Promise<string | null> {
  try {
    const redis = getRedisClient();
    
    const documentId = await redis.lpop(QUEUE_KEY);
    
    if (documentId) {
      await redis.sadd(PROCESSING_KEY, documentId);
      logger.info("Document dequeued for processing", { documentId });
    }
    
    return documentId;
  } catch (error) {
    logger.error("Failed to dequeue document", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function requeue(documentId: string, delayMs: number = 0): Promise<void> {
  try {
    const redis = getRedisClient();
    
    await redis.srem(PROCESSING_KEY, documentId);
    
    if (delayMs > 0) {
      const executeAt = Date.now() + delayMs;
      await redis.zadd(DELAY_QUEUE_KEY, executeAt, documentId);
      logger.info("Document requeued with delay", { documentId, delayMs });
    } else {
      await redis.rpush(QUEUE_KEY, documentId);
      logger.info("Document requeued immediately", { documentId });
    }
  } catch (error) {
    logger.error("Failed to requeue document", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markComplete(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    
    const pipeline = redis.pipeline();
    pipeline.srem(PROCESSING_KEY, documentId);
    pipeline.hdel(ATTEMPTS_HASH_KEY, documentId);
    pipeline.zrem(DELAY_QUEUE_KEY, documentId);
    await pipeline.exec();
    
    logger.info("Document marked as complete in queue", { documentId });
  } catch (error) {
    logger.error("Failed to mark document complete", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markFailed(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    
    const pipeline = redis.pipeline();
    pipeline.srem(PROCESSING_KEY, documentId);
    pipeline.hdel(ATTEMPTS_HASH_KEY, documentId);
    pipeline.zrem(DELAY_QUEUE_KEY, documentId);
    await pipeline.exec();
    
    logger.info("Document marked as failed in queue", { documentId });
  } catch (error) {
    logger.error("Failed to mark document failed", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function getAttempts(documentId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const attempts = await redis.hget(ATTEMPTS_HASH_KEY, documentId);
    return attempts ? parseInt(attempts, 10) : 0;
  } catch (error) {
    logger.error("Failed to get attempts", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export async function incrementAttempts(documentId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const newAttempts = await redis.hincrby(ATTEMPTS_HASH_KEY, documentId, 1);
    logger.info("Incremented attempt count", { documentId, attempts: newAttempts });
    return newAttempts;
  } catch (error) {
    logger.error("Failed to increment attempts", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function getQueueLength(): Promise<number> {
  try {
    const redis = getRedisClient();
    return await redis.llen(QUEUE_KEY);
  } catch (error) {
    logger.error("Failed to get queue length", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export async function getProcessingCount(): Promise<number> {
  try {
    const redis = getRedisClient();
    return await redis.scard(PROCESSING_KEY);
  } catch (error) {
    logger.error("Failed to get processing count", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export async function getDelayedCount(): Promise<number> {
  try {
    const redis = getRedisClient();
    return await redis.zcard(DELAY_QUEUE_KEY);
  } catch (error) {
    logger.error("Failed to get delayed count", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export async function processDelayedQueue(): Promise<number> {
  try {
    const redis = getRedisClient();
    const now = Date.now();
    
    const readyDocuments = await redis.zrangebyscore(DELAY_QUEUE_KEY, 0, now);
    
    if (readyDocuments.length === 0) {
      return 0;
    }
    
    const pipeline = redis.pipeline();
    for (const documentId of readyDocuments) {
      pipeline.zrem(DELAY_QUEUE_KEY, documentId);
      pipeline.rpush(QUEUE_KEY, documentId);
    }
    await pipeline.exec();
    
    logger.info("Moved delayed documents to queue", { count: readyDocuments.length });
    return readyDocuments.length;
  } catch (error) {
    logger.error("Failed to process delayed queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export async function getProcessingDocuments(): Promise<string[]> {
  try {
    const redis = getRedisClient();
    return await redis.smembers(PROCESSING_KEY);
  } catch (error) {
    logger.error("Failed to get processing documents", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

export async function clearProcessingSet(): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(PROCESSING_KEY);
    logger.info("Cleared processing set");
  } catch (error) {
    logger.error("Failed to clear processing set", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function clearDocumentFromAllQueues(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    
    const pipeline = redis.pipeline();
    pipeline.lrem(QUEUE_KEY, 0, documentId);
    pipeline.srem(PROCESSING_KEY, documentId);
    pipeline.hdel(ATTEMPTS_HASH_KEY, documentId);
    pipeline.zrem(DELAY_QUEUE_KEY, documentId);
    await pipeline.exec();
    
    logger.info("Cleared document from all queues", { documentId });
  } catch (error) {
    logger.error("Failed to clear document from all queues", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function resetAttempts(documentId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.hset(ATTEMPTS_HASH_KEY, documentId, "0");
    logger.info("Reset attempts for document", { documentId });
  } catch (error) {
    logger.error("Failed to reset attempts", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getQueueStats(): Promise<{
  queueLength: number;
  processingCount: number;
  delayedCount: number;
}> {
  const [queueLength, processingCount, delayedCount] = await Promise.all([
    getQueueLength(),
    getProcessingCount(),
    getDelayedCount(),
  ]);
  
  return { queueLength, processingCount, delayedCount };
}
