import { logger } from "../../utils/logger";
import { db } from "../../db";
import { documents, manualReviews, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  sendToBuli2,
  getReviewStatus,
  cancelReview,
  isBuli2Configured,
} from "../../buli2/buli2Client";

export interface SendNotificationInput {
  recipientId: string;
  recipientType: "reviewer" | "user" | "admin";
  notificationType: "new_review" | "review_completed" | "reminder";
  reviewId: string;
  documentId: string;
  message?: string;
}

export interface SendNotificationOutput {
  success: boolean;
  notificationId?: string;
  error?: string;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationOutput> {
  const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  logger.info("KYC Activity: sendNotification", {
    notificationId,
    recipientId: input.recipientId,
    recipientType: input.recipientType,
    notificationType: input.notificationType,
    reviewId: input.reviewId,
    documentId: input.documentId,
    message: input.message,
  });

  try {
    if (input.recipientType === "admin") {
      logger.info("ADMIN_NOTIFICATION", {
        notificationId,
        type: input.notificationType,
        reviewId: input.reviewId,
        documentId: input.documentId,
        message: input.message || "No message provided",
        timestamp: new Date().toISOString(),
      });
    } else if (input.recipientType === "user") {
      logger.info("USER_NOTIFICATION", {
        notificationId,
        userId: input.recipientId,
        type: input.notificationType,
        reviewId: input.reviewId,
        documentId: input.documentId,
        message: input.message || "No message provided",
        timestamp: new Date().toISOString(),
      });
    } else if (input.recipientType === "reviewer") {
      logger.info("REVIEWER_NOTIFICATION", {
        notificationId,
        reviewerId: input.recipientId,
        type: input.notificationType,
        reviewId: input.reviewId,
        documentId: input.documentId,
        message: input.message || "No message provided",
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      notificationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown notification error";
    logger.error("KYC Activity: sendNotification failed", {
      error: errorMessage,
      reviewId: input.reviewId,
      notificationType: input.notificationType,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export interface FetchExternalDecisionInput {
  reviewId: string;
  buli2TaskId?: string;
  timeoutMs?: number;
}

export interface FetchExternalDecisionOutput {
  hasDecision: boolean;
  decision?: "approved" | "rejected";
  notes?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export async function fetchExternalDecision(
  input: FetchExternalDecisionInput
): Promise<FetchExternalDecisionOutput> {
  logger.info("KYC Activity: fetchExternalDecision", {
    reviewId: input.reviewId,
    buli2TaskId: input.buli2TaskId,
  });

  try {
    const reviews = await db
      .select()
      .from(manualReviews)
      .where(eq(manualReviews.id, input.reviewId))
      .limit(1);

    const review = reviews[0];

    if (review && review.decision && (review.decision === "approved" || review.decision === "rejected")) {
      logger.info("KYC Activity: Decision found in database", {
        reviewId: input.reviewId,
        decision: review.decision,
      });

      return {
        hasDecision: true,
        decision: review.decision as "approved" | "rejected",
        notes: review.notes || undefined,
        decidedAt: review.updatedAt?.toISOString(),
      };
    }

    if (input.buli2TaskId && isBuli2Configured()) {
      const buli2Status = await getReviewStatus(input.buli2TaskId, input.reviewId);
      
      if (buli2Status && buli2Status.decision) {
        const decision = buli2Status.decision as "approved" | "rejected";
        
        logger.info("KYC Activity: Decision found from BULI2", {
          reviewId: input.reviewId,
          buli2TaskId: input.buli2TaskId,
          decision,
        });

        return {
          hasDecision: true,
          decision,
          notes: buli2Status.notes,
          decidedBy: "BULI2",
        };
      }
    }

    logger.debug("KYC Activity: No decision found yet", {
      reviewId: input.reviewId,
      buli2TaskId: input.buli2TaskId,
    });

    return {
      hasDecision: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("KYC Activity: fetchExternalDecision failed", {
      error: errorMessage,
      reviewId: input.reviewId,
      buli2TaskId: input.buli2TaskId,
    });

    return {
      hasDecision: false,
    };
  }
}

export interface UpdateReviewStatusInput {
  reviewId: string;
  status: "pending" | "in_review" | "completed" | "failed";
  decision?: "approved" | "rejected";
  notes?: string;
}

export interface UpdateReviewStatusOutput {
  success: boolean;
  error?: string;
}

export async function updateReviewStatus(
  input: UpdateReviewStatusInput
): Promise<UpdateReviewStatusOutput> {
  logger.info("KYC Activity: updateReviewStatus", {
    reviewId: input.reviewId,
    status: input.status,
    decision: input.decision,
  });

  try {
    const updateData: Record<string, unknown> = {
      status: input.status,
      updatedAt: new Date(),
    };

    if (input.decision) {
      updateData.decision = input.decision;
    }

    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    await db
      .update(manualReviews)
      .set(updateData)
      .where(eq(manualReviews.id, input.reviewId));

    logger.info("KYC Activity: Review status updated successfully", {
      reviewId: input.reviewId,
      newStatus: input.status,
      decision: input.decision,
    });

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";
    logger.error("KYC Activity: updateReviewStatus failed", {
      error: errorMessage,
      reviewId: input.reviewId,
      status: input.status,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export interface SyncWithBuli2Input {
  reviewId: string;
  action: "create" | "update" | "fetch_status";
  payload?: object;
}

export interface SyncWithBuli2Output {
  success: boolean;
  buli2TaskId?: string;
  status?: string;
  error?: string;
}

export async function syncWithBuli2(
  input: SyncWithBuli2Input
): Promise<SyncWithBuli2Output> {
  logger.info("KYC Activity: syncWithBuli2", {
    reviewId: input.reviewId,
    action: input.action,
    hasPayload: !!input.payload,
  });

  if (!isBuli2Configured()) {
    logger.warn("KYC Activity: BULI2 not configured, skipping sync", {
      reviewId: input.reviewId,
      action: input.action,
    });

    return {
      success: true,
      buli2TaskId: `local-${input.reviewId}`,
      status: "local_mode",
    };
  }

  try {
    if (input.action === "create") {
      const payload = input.payload as {
        documentId: string;
        userId: string;
        documentType: string;
        parsedData: object;
        aiScore: number;
        aiDecision: string;
        reasons: string[];
      };

      const document = {
        id: payload.documentId,
        userId: payload.userId,
        type: payload.documentType,
      };

      const result = await sendToBuli2(
        document,
        payload.parsedData as Record<string, unknown>,
        payload.aiScore,
        {
          correlationId: input.reviewId,
        }
      );

      await db
        .update(manualReviews)
        .set({ buli2TaskId: result.ticketId })
        .where(eq(manualReviews.id, input.reviewId));

      logger.info("KYC Activity: BULI2 task created", {
        reviewId: input.reviewId,
        buli2TaskId: result.ticketId,
        status: result.status,
      });

      return {
        success: true,
        buli2TaskId: result.ticketId,
        status: result.status,
      };
    }

    if (input.action === "fetch_status") {
      const reviews = await db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.id, input.reviewId))
        .limit(1);

      const review = reviews[0];
      const buli2TaskId = review?.buli2TaskId;

      if (!buli2TaskId) {
        return {
          success: false,
          error: "No BULI2 task ID found for this review",
        };
      }

      const status = await getReviewStatus(buli2TaskId, input.reviewId);

      if (status) {
        return {
          success: true,
          buli2TaskId,
          status: status.status,
        };
      }

      return {
        success: false,
        buli2TaskId,
        error: "Could not fetch BULI2 status",
      };
    }

    if (input.action === "update") {
      const payload = input.payload as {
        status?: string;
        decision?: string;
        notes?: string;
        reason?: string;
      };

      if (payload.status === "cancelled") {
        const reviews = await db
          .select()
          .from(manualReviews)
          .where(eq(manualReviews.id, input.reviewId))
          .limit(1);

        const review = reviews[0];
        const buli2TaskId = review?.buli2TaskId;

        if (buli2TaskId) {
          await cancelReview(buli2TaskId, payload.reason, input.reviewId);
        }
      }

      logger.info("KYC Activity: BULI2 sync update completed", {
        reviewId: input.reviewId,
        status: payload.status,
      });

      return {
        success: true,
        status: payload.status,
      };
    }

    return {
      success: false,
      error: `Unknown action: ${input.action}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown BULI2 error";
    logger.error("KYC Activity: syncWithBuli2 failed", {
      error: errorMessage,
      reviewId: input.reviewId,
      action: input.action,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export interface FinalizeVerificationInput {
  reviewId: string;
  documentId: string;
  userId: string;
  decision: "approved" | "rejected";
  notes?: string;
}

export interface FinalizeVerificationOutput {
  success: boolean;
  documentStatus: string;
  userStatus: string;
  error?: string;
}

export async function finalizeVerification(
  input: FinalizeVerificationInput
): Promise<FinalizeVerificationOutput> {
  logger.info("KYC Activity: finalizeVerification", {
    reviewId: input.reviewId,
    documentId: input.documentId,
    userId: input.userId,
    decision: input.decision,
  });

  try {
    const documentStatus = input.decision === "approved" ? "manually_approved" : "manually_rejected";

    await db
      .update(documents)
      .set({
        verificationStatus: documentStatus,
        aiDecision: input.decision,
        processedAt: new Date(),
        resultJson: {
          finalDecision: input.decision,
          reviewNotes: input.notes,
          reviewId: input.reviewId,
          reviewCompletedAt: new Date().toISOString(),
        },
      })
      .where(eq(documents.id, input.documentId));

    logger.info("KYC Activity: Document status updated", {
      documentId: input.documentId,
      newStatus: documentStatus,
    });

    const userDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, input.userId));

    let allApproved = true;
    let anyRejected = false;
    let anyPending = false;

    for (const doc of userDocs) {
      const docStatus = doc.id === input.documentId ? documentStatus : doc.verificationStatus;
      
      if (docStatus === "manually_rejected" || docStatus === "auto_rejected") {
        anyRejected = true;
        allApproved = false;
      } else if (docStatus !== "manually_approved" && docStatus !== "auto_approved") {
        anyPending = true;
        allApproved = false;
      }
    }

    let userStatus: string;
    if (anyRejected) {
      userStatus = "rejected";
    } else if (allApproved) {
      userStatus = "verified";
    } else if (anyPending) {
      userStatus = "pending";
    } else {
      userStatus = "pending";
    }

    await db
      .update(users)
      .set({
        verificationStatus: userStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    logger.info("KYC Activity: User verification status updated", {
      userId: input.userId,
      newStatus: userStatus,
      totalDocuments: userDocs.length,
    });

    await db
      .update(manualReviews)
      .set({
        decision: input.decision,
        notes: input.notes,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(manualReviews.id, input.reviewId));

    logger.info("KYC Activity: Finalization complete", {
      reviewId: input.reviewId,
      documentId: input.documentId,
      userId: input.userId,
      documentStatus,
      userStatus,
    });

    return {
      success: true,
      documentStatus,
      userStatus,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown finalization error";
    logger.error("KYC Activity: finalizeVerification failed", {
      error: errorMessage,
      reviewId: input.reviewId,
      documentId: input.documentId,
      userId: input.userId,
    });

    return {
      success: false,
      documentStatus: "error",
      userStatus: "error",
      error: errorMessage,
    };
  }
}

export const ACTIVITY_TIMEOUTS = {
  sendNotification: "30s",
  fetchExternalDecision: "5m",
  updateReviewStatus: "30s",
  syncWithBuli2: "2m",
  finalizeVerification: "1m",
};

export const ACTIVITY_RETRY_POLICY = {
  sendNotification: {
    maximumAttempts: 3,
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
  },
  fetchExternalDecision: {
    maximumAttempts: 10,
    initialInterval: "5s",
    maximumInterval: "5m",
    backoffCoefficient: 2,
  },
  updateReviewStatus: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "1m",
    backoffCoefficient: 2,
  },
  syncWithBuli2: {
    maximumAttempts: 5,
    initialInterval: "2s",
    maximumInterval: "2m",
    backoffCoefficient: 2,
  },
  finalizeVerification: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "1m",
    backoffCoefficient: 2,
  },
};
