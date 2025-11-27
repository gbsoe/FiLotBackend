import { getQueueClient, getDefaultQueueEngine, QueueEngine } from "../queue";
import { enqueue } from "../services/queueService";
import { logger } from "../utils/logger";

export async function queueDocumentForProcessing(documentId: string): Promise<boolean> {
  const engine = getDefaultQueueEngine();

  try {
    if (engine === "temporal") {
      const queueClient = getQueueClient({ engine: "temporal" });
      await queueClient.enqueueDocument(documentId);
      logger.info("Document queued for processing via Temporal", { documentId });
      return true;
    }

    const result = await enqueue(documentId);
    if (result) {
      logger.info("Document queued for processing via Redis", { documentId });
    }
    return result;
  } catch (error) {
    if (engine === "temporal") {
      logger.warn("Temporal queue failed, falling back to Redis", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      try {
        const result = await enqueue(documentId);
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

export function getActiveQueueEngine(): QueueEngine {
  return getDefaultQueueEngine();
}

export { startQueueWorker as startProcessingLoop } from "../workers/queueWorker";
