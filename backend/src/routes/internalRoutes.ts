import { Router } from "express";
import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { manualReviews, documents, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import { checkInternalServiceKey } from "../middlewares/serviceKeyAuth";
import { sensitiveRateLimiter } from "../middlewares/rateLimiter";
import {
  InternalReviewPayloadSchema,
  ReviewDecisionSchema,
  CallbackPayloadSchema,
  VerificationResultSchema,
  validateHmacSignature,
} from "../validators/schemas";

const router = Router();

router.use(checkInternalServiceKey);
router.use(sensitiveRateLimiter);

const BULI2_HMAC_SECRET = process.env.BULI2_HMAC_SECRET || "";
const BULI2_SIGNATURE_SECRET = process.env.BULI2_SIGNATURE_SECRET || "";

function getSignatureSecret(): string {
  return BULI2_SIGNATURE_SECRET || BULI2_HMAC_SECRET;
}

const validateInternalReviewPayload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = InternalReviewPayloadSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    logger.warn("BULI2: Invalid review payload", {
      errors,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errors,
      },
    });
    return;
  }

  req.body = result.data;
  next();
};

const validateReviewDecision = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = ReviewDecisionSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    logger.warn("BULI2: Invalid review decision payload", {
      errors,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errors,
      },
    });
    return;
  }

  req.body = result.data;
  next();
};

const validateCallbackPayload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = CallbackPayloadSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    logger.warn("BULI2: Invalid callback payload", {
      errors,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errors,
      },
    });
    return;
  }

  req.body = result.data;
  next();
};

const validateVerificationResult = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const result = VerificationResultSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    logger.warn("BULI2: Invalid verification result payload", {
      errors,
      path: req.path,
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errors,
      },
    });
    return;
  }

  req.body = result.data;
  next();
};

const validateBuli2Signature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const signatureSecret = getSignatureSecret();
  const signature = req.headers["x-buli2-signature"] as string;
  const reviewId = req.params.reviewId || req.body?.reviewId;
  const documentId = req.body?.documentId;
  const correlationId = req.headers["x-correlation-id"] as string;

  if (!signatureSecret) {
    logger.warn("BULI2: Signature validation disabled - no secret configured", {
      path: req.path,
      reviewId,
      documentId,
      correlationId,
    });
    next();
    return;
  }

  if (!signature) {
    const responseTime = Date.now() - startTime;
    logger.warn("BULI2: Missing signature header in callback request", {
      path: req.path,
      reviewId,
      documentId,
      correlationId,
      responseTimeMs: responseTime,
    });

    res.status(401).json({
      success: false,
      error: {
        message: "Missing X-Buli2-Signature header",
        code: "MISSING_SIGNATURE",
      },
    });
    return;
  }

  try {
    const isValid = validateHmacSignature(req.body, signature, signatureSecret);
    const responseTime = Date.now() - startTime;

    if (!isValid) {
      logger.warn("BULI2: Invalid signature in callback request", {
        path: req.path,
        reviewId,
        documentId,
        correlationId,
        responseTimeMs: responseTime,
      });

      res.status(401).json({
        success: false,
        error: {
          message: "Invalid signature",
          code: "INVALID_SIGNATURE",
        },
      });
      return;
    }

    logger.debug("BULI2: Signature validated successfully", {
      path: req.path,
      reviewId,
      documentId,
      correlationId,
      responseTimeMs: responseTime,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error("BULI2: Signature validation error", {
      path: req.path,
      reviewId,
      documentId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      responseTimeMs: responseTime,
    });

    res.status(401).json({
      success: false,
      error: {
        message: "Signature validation failed",
        code: "VALIDATION_ERROR",
      },
    });
    return;
  }

  next();
};

router.post("/reviews", validateInternalReviewPayload, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = req.headers["x-correlation-id"] as string;

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

    logger.info("BULI2: Processing incoming review request", {
      reviewId,
      documentId,
      userId,
      documentType,
      score,
      correlationId,
    });

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
      const responseTime = Date.now() - startTime;

      logger.info("BULI2: Updated existing review task", {
        taskId,
        documentId,
        correlationId,
        responseTimeMs: responseTime,
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
        const responseTime = Date.now() - startTime;

        logger.info("BULI2: Created new review task", {
          taskId,
          documentId,
          userId,
          correlationId,
          responseTimeMs: responseTime,
        });
      } catch (insertError: any) {
        const responseTime = Date.now() - startTime;

        if (insertError.code === "23503") {
          logger.warn("BULI2: FK constraint violation", {
            reviewId,
            documentId,
            userId,
            correlationId,
            responseTimeMs: responseTime,
          });

          return res.status(400).json({
            error: "Invalid document or user reference",
            code: "FOREIGN_KEY_VIOLATION",
          });
        }
        throw insertError;
      }
    }

    const responseTime = Date.now() - startTime;

    return res.status(201).json({
      taskId,
      status: "accepted",
      responseTimeMs: responseTime,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error("BULI2: Failed to accept review", {
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      responseTimeMs: responseTime,
    });

    return res.status(500).json({ error: "Failed to accept review" });
  }
});

router.get("/reviews/:taskId/status", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = req.headers["x-correlation-id"] as string;

  try {
    const { taskId } = req.params;

    const [review] = await db
      .select()
      .from(manualReviews)
      .where(eq(manualReviews.id, taskId));

    const responseTime = Date.now() - startTime;

    if (!review) {
      logger.warn("BULI2: Review task not found", {
        taskId,
        correlationId,
        responseTimeMs: responseTime,
      });

      return res.status(404).json({ error: "Review task not found" });
    }

    logger.info("BULI2: Review status retrieved", {
      taskId,
      documentId: review.documentId,
      status: review.status,
      correlationId,
      responseTimeMs: responseTime,
    });

    return res.json({
      taskId: review.id,
      status: review.status,
      decision: review.decision,
      notes: review.notes,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error("BULI2: Failed to get review status", {
      taskId: req.params.taskId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      responseTimeMs: responseTime,
    });

    return res.status(500).json({ error: "Failed to get review status" });
  }
});

router.post(
  "/reviews/:taskId/decision",
  validateReviewDecision,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const correlationId = req.headers["x-correlation-id"] as string;

    try {
      const { taskId } = req.params;
      const { decision, notes } = req.body;

      const [review] = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.id, taskId));

      if (!review) {
        const responseTime = Date.now() - startTime;

        logger.warn("BULI2: Review task not found for decision", {
          taskId,
          correlationId,
          responseTimeMs: responseTime,
        });

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

      const responseTime = Date.now() - startTime;

      logger.info("BULI2: Decision recorded", {
        taskId,
        decision,
        documentId: review.documentId,
        userId: review.userId,
        correlationId,
        responseTimeMs: responseTime,
      });

      const payload = review.payload as any;
      if (payload?.callbackUrl) {
        const callbackStartTime = Date.now();

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

          const callbackTime = Date.now() - callbackStartTime;

          logger.info("BULI2: Callback sent successfully", {
            taskId,
            documentId: review.documentId,
            correlationId,
            callbackTimeMs: callbackTime,
          });
        } catch (callbackError) {
          const callbackTime = Date.now() - callbackStartTime;

          logger.warn("BULI2: Failed to send callback", {
            taskId,
            documentId: review.documentId,
            correlationId,
            callbackTimeMs: callbackTime,
            error:
              callbackError instanceof Error
                ? callbackError.message
                : "Unknown error",
          });
        }
      }

      return res.json({ success: true });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error("BULI2: Failed to record decision", {
        taskId: req.params.taskId,
        correlationId,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTimeMs: responseTime,
      });

      return res.status(500).json({ error: "Failed to record decision" });
    }
  }
);

router.post(
  "/reviews/:reviewId/callback",
  validateBuli2Signature,
  validateCallbackPayload,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const correlationId = req.headers["x-correlation-id"] as string;

    try {
      const { reviewId } = req.params;
      const { decision, notes } = req.body;

      logger.info("BULI2: Processing callback", {
        reviewId,
        decision,
        correlationId,
      });

      const [review] = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.id, reviewId));

      if (!review) {
        const responseTime = Date.now() - startTime;

        logger.warn("BULI2: Review not found for callback", {
          reviewId,
          correlationId,
          responseTimeMs: responseTime,
        });

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

      const responseTime = Date.now() - startTime;

      logger.info("BULI2: Callback processed successfully", {
        reviewId,
        decision,
        documentId: review.documentId,
        userId: review.userId,
        correlationId,
        responseTimeMs: responseTime,
      });

      return res.json({ success: true });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error("BULI2: Callback processing failed", {
        reviewId: req.params.reviewId,
        correlationId,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTimeMs: responseTime,
      });

      return res.status(500).json({ error: "Failed to process callback" });
    }
  }
);

router.post(
  "/verification/result",
  validateBuli2Signature,
  validateVerificationResult,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const correlationId = req.headers["x-correlation-id"] as string;

    try {
      const {
        documentId,
        userId,
        verificationResult,
        score,
        decision,
        metadata,
      } = req.body;

      const responseTime = Date.now() - startTime;

      logger.info("BULI2: Received verification result", {
        documentId,
        userId,
        verificationResult,
        score,
        decision,
        correlationId,
        responseTimeMs: responseTime,
        metadata,
      });

      return res.status(200).json({
        success: true,
        message: "Verification result received",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error("BULI2: Failed to process verification result", {
        correlationId,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTimeMs: responseTime,
      });

      return res.status(500).json({ error: "Failed to process verification result" });
    }
  }
);

export default router;
