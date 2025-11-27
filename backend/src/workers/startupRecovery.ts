import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { enqueue, clearProcessingSet, clearDocumentFromAllQueues, resetAttempts } from "../services/queueService";
import { logger } from "../utils/logger";

export async function recoverStuckDocuments(): Promise<number> {
  try {
    logger.info("Starting document recovery process");

    await clearProcessingSet();

    const stuckDocuments = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.status, "processing"));

    if (stuckDocuments.length === 0) {
      logger.info("No stuck documents found during recovery");
      return 0;
    }

    logger.info("Found stuck documents", { count: stuckDocuments.length });

    let recoveredCount = 0;

    for (const doc of stuckDocuments) {
      try {
        await clearDocumentFromAllQueues(doc.id);
        
        await resetAttempts(doc.id);

        await db
          .update(documents)
          .set({ status: "uploaded" })
          .where(eq(documents.id, doc.id));

        await enqueue(doc.id);
        recoveredCount++;

        logger.info("Recovered document", { documentId: doc.id });
      } catch (error) {
        logger.error("Failed to recover document", {
          documentId: doc.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logger.info("Document recovery completed", {
      found: stuckDocuments.length,
      recovered: recoveredCount,
    });

    return recoveredCount;
  } catch (error) {
    logger.error("Document recovery process failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}
