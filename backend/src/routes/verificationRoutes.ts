import { Router } from "express";
import { Request, Response } from "express";
import { authRequired } from "../auth/middleware";
import { db } from "../db";
import { documents, manualReviews, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { computeScoreAndDecision } from "../services/aiScoring";
import { forwardReview } from "../services/forwardToBuli2";
import { escalateToBuli2 } from "../buli2/escalationService";
import { logger } from "../utils/logger";

const router = Router();

const BULI2_CALLBACK_URL = process.env.BULI2_CALLBACK_URL || "";

router.post("/evaluate", authRequired, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: "documentId is required" });
    }

    const userId = req.user.id;

    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.status !== "completed") {
      return res.status(400).json({
        error: "Document must be processed (OCR completed) before evaluation",
        currentStatus: document.status,
      });
    }

    if (
      document.verificationStatus &&
      document.verificationStatus !== "pending"
    ) {
      return res.json({
        documentId: document.id,
        score: document.aiScore,
        decision: document.aiDecision,
        verificationStatus: document.verificationStatus,
        message: "Document has already been evaluated",
      });
    }

    const parsedData =
      typeof document.resultJson === "object" ? document.resultJson : {};
    const ocrText = document.ocrText || "";
    const documentType = document.type as "KTP" | "NPWP";

    const scoringResult = computeScoreAndDecision(
      parsedData as object,
      ocrText,
      documentType
    );

    logger.info("AI scoring result", {
      documentId,
      score: scoringResult.score,
      decision: scoringResult.decision,
    });

    let verificationStatus: string;
    let reviewId: string | undefined;

    if (scoringResult.decision === "auto_approve") {
      verificationStatus = "auto_approved";

      await db
        .update(documents)
        .set({
          aiScore: scoringResult.score,
          aiDecision: scoringResult.decision,
          verificationStatus: "auto_approved",
          resultJson: {
            ...(parsedData as object),
            scoringReasons: scoringResult.reasons,
          },
        })
        .where(eq(documents.id, documentId));

      await db
        .update(users)
        .set({
          verificationStatus: "auto_approved",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info("Document auto-approved", { documentId, userId });
    } else if (scoringResult.decision === "auto_reject") {
      verificationStatus = "auto_rejected";

      await db
        .update(documents)
        .set({
          aiScore: scoringResult.score,
          aiDecision: scoringResult.decision,
          verificationStatus: "auto_rejected",
          resultJson: {
            ...(parsedData as object),
            scoringReasons: scoringResult.reasons,
          },
        })
        .where(eq(documents.id, documentId));

      await db
        .update(users)
        .set({
          verificationStatus: "auto_rejected",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info("Document auto-rejected", { documentId, userId });
    } else {
      verificationStatus = "pending_manual_review";

      await db
        .update(documents)
        .set({
          aiScore: scoringResult.score,
          aiDecision: scoringResult.decision,
          verificationStatus: "pending_manual_review",
          resultJson: {
            ...(parsedData as object),
            scoringReasons: scoringResult.reasons,
          },
        })
        .where(eq(documents.id, documentId));

      const [reviewRecord] = await db
        .insert(manualReviews)
        .values({
          documentId: documentId,
          userId: userId,
          payload: {
            documentType,
            parsedData,
            ocrText,
            score: scoringResult.score,
            reasons: scoringResult.reasons,
          },
          status: "pending",
          confidence: scoringResult.score,
        })
        .returning();

      reviewId = reviewRecord.id;

      const forwardPayload = {
        reviewId: reviewRecord.id,
        documentId,
        userId,
        documentType,
        parsedData: parsedData as object,
        ocrText,
        score: scoringResult.score,
        decision: scoringResult.decision,
        reasons: scoringResult.reasons,
        callbackUrl: BULI2_CALLBACK_URL
          ? `${BULI2_CALLBACK_URL}/${reviewRecord.id}`
          : undefined,
      };

      const forwardResult = await forwardReview(forwardPayload);

      if (forwardResult.success && forwardResult.taskId) {
        await db
          .update(manualReviews)
          .set({
            buli2TaskId: forwardResult.taskId,
            updatedAt: new Date(),
          })
          .where(eq(manualReviews.id, reviewRecord.id));
      }

      await db
        .update(users)
        .set({
          verificationStatus: "pending_manual_review",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info("Document forwarded for manual review", {
        documentId,
        userId,
        reviewId: reviewRecord.id,
        forwardSuccess: forwardResult.success,
      });
    }

    return res.json({
      documentId,
      score: scoringResult.score,
      decision: scoringResult.decision,
      verificationStatus,
      reviewId,
      reasons: scoringResult.reasons,
    });
  } catch (error) {
    logger.error("Verification evaluation error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Evaluation failed" });
  }
});

router.get("/status/:documentId", authRequired, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.params;
    const userId = req.user.id;

    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    let result: any = null;

    if (
      document.verificationStatus === "pending_manual_review" ||
      document.verificationStatus === "manually_approved" ||
      document.verificationStatus === "manually_rejected" ||
      document.verificationStatus === "needs_manual_review"
    ) {
      const [review] = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.documentId, documentId));

      if (review) {
        result = {
          reviewId: review.id,
          status: review.status,
          decision: review.decision,
          notes: review.notes,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
        };
      }
    }

    const status =
      document.verificationStatus === "manually_approved" ||
      document.verificationStatus === "manually_rejected"
        ? "review_result"
        : document.verificationStatus || "pending";

    return res.json({
      verificationStatus: document.verificationStatus || "pending",
      aiScore: document.aiScore,
      buli2TicketId: document.buli2TicketId || null,
      documentId,
      status,
      aiDecision: document.aiDecision,
      result,
    });
  } catch (error) {
    logger.error("Get verification status error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Failed to get verification status" });
  }
});

router.post("/:documentId/escalate", authRequired, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { documentId } = req.params;
    const userId = req.user.id;

    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.buli2TicketId) {
      return res.json({
        message: "Document already escalated to Buli2",
        ticketId: document.buli2TicketId,
        verificationStatus: document.verificationStatus,
      });
    }

    const parsedData = typeof document.resultJson === "object" ? document.resultJson : {};
    const score = document.aiScore || 0;

    const escalationResult = await escalateToBuli2(document, parsedData, score);

    logger.info("Document manually escalated to Buli2", {
      documentId,
      ticketId: escalationResult.ticketId,
    });

    return res.json({
      message: "Document escalated to Buli2 for manual review",
      ticketId: escalationResult.ticketId,
      status: escalationResult.status,
      verificationStatus: "needs_manual_review",
    });
  } catch (error) {
    logger.error("Escalation error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Escalation failed" });
  }
});

export default router;
