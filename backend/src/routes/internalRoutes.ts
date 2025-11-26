import { Router } from "express";
import { Request, Response } from "express";
import { db } from "../db";
import { manualReviews, documents, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

const router = Router();

router.post("/reviews", async (req: Request, res: Response) => {
  try {
    const {
      reviewId,
      documentId,
      userId,
      documentType,
      parsedData,
      ocrText,
      score,
      decision,
      reasons,
      callbackUrl,
    } = req.body;

    if (!documentId || !userId) {
      return res.status(400).json({
        error: "Missing required fields: documentId, userId",
      });
    }

    let taskId = reviewId;
    let existingReview = null;

    if (reviewId) {
      const [review] = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.id, reviewId));
      existingReview = review;
    }

    if (existingReview) {
      await db
        .update(manualReviews)
        .set({
          payload: {
            documentType,
            parsedData,
            ocrText,
            score,
            decision,
            reasons,
            callbackUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(manualReviews.id, reviewId));

      taskId = existingReview.id;
      logger.info("BULI2: Acknowledged existing review task", {
        taskId,
        documentId,
      });
    } else {
      try {
        const [newReview] = await db
          .insert(manualReviews)
          .values({
            ...(reviewId ? { id: reviewId } : {}),
            documentId,
            userId,
            payload: {
              documentType,
              parsedData,
              ocrText,
              score,
              decision,
              reasons,
              callbackUrl,
            },
            status: "pending",
            confidence: score,
          })
          .returning();

        taskId = newReview.id;
        logger.info("BULI2: Created new review task", { taskId, documentId });
      } catch (insertError: any) {
        if (insertError.code === "23503") {
          logger.warn("BULI2: FK constraint violation - likely standalone mode or invalid references", {
            reviewId,
            documentId,
            userId,
          });
          return res.status(400).json({
            error: "Invalid document or user reference. In shared DB mode, FiLot should create the review first. In standalone mode, references must exist.",
            code: "FOREIGN_KEY_VIOLATION",
          });
        }
        throw insertError;
      }
    }

    return res.status(201).json({
      taskId,
      status: "accepted",
    });
  } catch (error) {
    logger.error("BULI2: Failed to accept review", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Failed to accept review" });
  }
});

router.get("/reviews/:taskId/status", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const [review] = await db
      .select()
      .from(manualReviews)
      .where(eq(manualReviews.id, taskId));

    if (!review) {
      return res.status(404).json({ error: "Review task not found" });
    }

    return res.json({
      taskId: review.id,
      status: review.status,
      decision: review.decision,
      notes: review.notes,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    });
  } catch (error) {
    logger.error("BULI2: Failed to get review status", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Failed to get review status" });
  }
});

router.post(
  "/reviews/:taskId/decision",
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { decision, notes } = req.body;

      if (!decision || !["approved", "rejected"].includes(decision)) {
        return res.status(400).json({
          error: "Invalid decision. Must be 'approved' or 'rejected'",
        });
      }

      const [review] = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.id, taskId));

      if (!review) {
        return res.status(404).json({ error: "Review task not found" });
      }

      await db
        .update(manualReviews)
        .set({
          status: decision,
          decision,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(manualReviews.id, taskId));

      const verificationStatus =
        decision === "approved" ? "manually_approved" : "manually_rejected";

      await db
        .update(documents)
        .set({
          verificationStatus,
        })
        .where(eq(documents.id, review.documentId));

      await db
        .update(users)
        .set({
          verificationStatus,
          updatedAt: new Date(),
        })
        .where(eq(users.id, review.userId));

      logger.info("BULI2: Decision recorded", {
        taskId,
        decision,
        documentId: review.documentId,
        userId: review.userId,
      });

      const payload = review.payload as any;
      if (payload?.callbackUrl) {
        try {
          await fetch(payload.callbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId,
              decision,
              notes,
              documentId: review.documentId,
              userId: review.userId,
            }),
          });
          logger.info("BULI2: Callback sent to FiLot", {
            taskId,
            callbackUrl: payload.callbackUrl,
          });
        } catch (callbackError) {
          logger.warn("BULI2: Failed to send callback", {
            taskId,
            error:
              callbackError instanceof Error
                ? callbackError.message
                : "Unknown error",
          });
        }
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("BULI2: Failed to record decision", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return res.status(500).json({ error: "Failed to record decision" });
    }
  }
);

router.post("/reviews/:reviewId/callback", async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params;
    const { taskId, decision, notes } = req.body;

    if (!decision || !["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        error: "Invalid decision. Must be 'approved' or 'rejected'",
      });
    }

    const [review] = await db
      .select()
      .from(manualReviews)
      .where(eq(manualReviews.id, reviewId));

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    await db
      .update(manualReviews)
      .set({
        status: decision,
        decision,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(manualReviews.id, reviewId));

    const verificationStatus =
      decision === "approved" ? "manually_approved" : "manually_rejected";

    await db
      .update(documents)
      .set({
        verificationStatus,
      })
      .where(eq(documents.id, review.documentId));

    await db
      .update(users)
      .set({
        verificationStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, review.userId));

    logger.info("FiLot: Received callback from BULI2", {
      reviewId,
      taskId,
      decision,
      documentId: review.documentId,
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error("FiLot: Callback processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Failed to process callback" });
  }
});

export default router;
