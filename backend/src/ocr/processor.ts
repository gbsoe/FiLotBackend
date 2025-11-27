import { 
  getQueueClient, 
  getConfiguredQueueEngine, 
  getActiveQueueEngine,
  startQueue,
  stopQueue,
  switchToRedis
} from "../queue";
import { logger } from "../utils/logger";

export async function queueDocumentForProcessing(documentId: string): Promise<boolean> {
  const activeEngine = getActiveQueueEngine();
  
  try {
    const queueClient = getQueueClient();
    const result = await queueClient.enqueueDocument(documentId);
    if (result) {
      logger.info("Document queued for processing", { documentId, engine: activeEngine });
    }
    return result;
  } catch (error) {
    if (activeEngine === "temporal") {
      logger.warn("Temporal queue failed, falling back to Redis", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      try {
        await switchToRedis();
        const redisClient = getQueueClient();
        const result = await redisClient.enqueueDocument(documentId);
        if (result) {
          logger.info("Document queued for processing via Redis (fallback)", { documentId });
        }
        return result;
      } catch (fallbackError) {
        logger.error("Fallback to Redis also failed", {
          documentId,
          error: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
        });
        return false;
      }
    }

    logger.error("Failed to queue document for processing", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export { getActiveQueueEngine };

export async function startProcessingLoop(): Promise<void> {
  const configuredEngine = getConfiguredQueueEngine();

  try {
    await startQueue(configuredEngine);
    logger.info("Processing loop started", { engine: configuredEngine });
  } catch (error) {
    if (configuredEngine === "temporal") {
      logger.warn("Temporal worker failed to start, falling back to Redis", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      try {
        await switchToRedis();
        logger.info("Processing loop started with Redis fallback");
        return;
      } catch (fallbackError) {
        logger.error("Failed to start Redis fallback worker after Temporal failure", {
          error: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
        });
        throw fallbackError;
      }
    }

    logger.error("Failed to start processing loop", {
      engine: configuredEngine,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function stopProcessingLoop(): Promise<void> {
  await stopQueue();
  logger.info("Processing loop stopped");
}
