import { enqueue } from "../services/queueService";
import { logger } from "../utils/logger";

export async function queueDocumentForProcessing(documentId: string): Promise<boolean> {
  try {
    const result = await enqueue(documentId);
    if (result) {
      logger.info("Document queued for processing via Redis", { documentId });
    }
    return result;
  } catch (error) {
    logger.error("Failed to queue document for processing", {
      documentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export { startQueueWorker as startProcessingLoop } from "../workers/queueWorker";
