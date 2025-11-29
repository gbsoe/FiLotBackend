import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  patched,
  ApplicationFailure,
  CancellationScope,
} from "@temporalio/workflow";

import type {
  SendNotificationInput,
  SendNotificationOutput,
  UpdateReviewStatusInput,
  UpdateReviewStatusOutput,
  SyncWithBuli2Input,
  SyncWithBuli2Output,
  FinalizeVerificationInput,
  FinalizeVerificationOutput,
  FetchExternalDecisionInput,
  FetchExternalDecisionOutput,
} from "../activities/kycActivities";

export const WORKFLOW_VERSION = {
  INITIAL: "1.0.0",
  CURRENT: "1.1.0",
};

export interface KYCReviewWorkflowInput {
  reviewId: string;
  documentId: string;
  userId: string;
  documentType: "KTP" | "NPWP";
  parsedData: object;
  ocrText: string;
  aiScore: number;
  aiDecision: string;
  reasons: string[];
}

export interface KYCReviewWorkflowOutput {
  success: boolean;
  reviewId: string;
  finalDecision: "approved" | "rejected";
  reviewerNotes?: string;
  completedAt: string;
  workflowVersion: string;
}

export interface KYCReviewWorkflowState {
  status: "pending" | "sent_to_reviewer" | "awaiting_decision" | "completed" | "failed" | "cancelled";
  retryCount: number;
  lastError?: string;
  buli2TaskId?: string;
  decision?: "approved" | "rejected";
  reviewerNotes?: string;
  startedAt: string;
  updatedAt: string;
}

export interface ReviewDecisionSignal {
  decision: "approved" | "rejected";
  notes?: string;
  decidedBy?: string;
}

export const reviewDecisionSignal = defineSignal<[ReviewDecisionSignal]>("reviewDecision");
export const cancelReviewSignal = defineSignal<[string]>("cancelReview");

export const getWorkflowStateQuery = defineQuery<KYCReviewWorkflowState>("getWorkflowState");
export const getReviewIdQuery = defineQuery<string>("getReviewId");

const activities = proxyActivities<{
  sendNotification: (input: SendNotificationInput) => Promise<SendNotificationOutput>;
  updateReviewStatus: (input: UpdateReviewStatusInput) => Promise<UpdateReviewStatusOutput>;
  syncWithBuli2: (input: SyncWithBuli2Input) => Promise<SyncWithBuli2Output>;
  finalizeVerification: (input: FinalizeVerificationInput) => Promise<FinalizeVerificationOutput>;
  fetchExternalDecision: (input: FetchExternalDecisionInput) => Promise<FetchExternalDecisionOutput>;
}>({
  startToCloseTimeout: "5m",
  retry: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "1m",
    backoffCoefficient: 2,
  },
});

const notificationActivities = proxyActivities<{
  sendNotification: (input: SendNotificationInput) => Promise<SendNotificationOutput>;
}>({
  startToCloseTimeout: "30s",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
  },
});

const buli2Activities = proxyActivities<{
  syncWithBuli2: (input: SyncWithBuli2Input) => Promise<SyncWithBuli2Output>;
}>({
  startToCloseTimeout: "2m",
  retry: {
    maximumAttempts: 5,
    initialInterval: "2s",
    maximumInterval: "2m",
    backoffCoefficient: 2,
  },
});

export async function kycReviewWorkflow(
  input: KYCReviewWorkflowInput
): Promise<KYCReviewWorkflowOutput> {
  const now = new Date().toISOString();
  const state: KYCReviewWorkflowState = {
    status: "pending",
    retryCount: 0,
    startedAt: now,
    updatedAt: now,
  };

  let decisionReceived: ReviewDecisionSignal | null = null;
  let cancelled = false;
  let cancellationReason = "";

  setHandler(getWorkflowStateQuery, () => state);
  setHandler(getReviewIdQuery, () => input.reviewId);

  setHandler(reviewDecisionSignal, (signal: ReviewDecisionSignal) => {
    decisionReceived = signal;
    state.decision = signal.decision;
    state.reviewerNotes = signal.notes;
    state.updatedAt = new Date().toISOString();
  });

  setHandler(cancelReviewSignal, (reason: string) => {
    cancelled = true;
    cancellationReason = reason;
    state.status = "cancelled";
    state.updatedAt = new Date().toISOString();
  });

  try {
    await activities.updateReviewStatus({
      reviewId: input.reviewId,
      status: "pending",
    });

    state.status = "sent_to_reviewer";
    state.updatedAt = new Date().toISOString();

    if (patched("v1.1.0-buli2-sync")) {
      const buli2Result = await buli2Activities.syncWithBuli2({
        reviewId: input.reviewId,
        action: "create",
        payload: {
          documentId: input.documentId,
          userId: input.userId,
          documentType: input.documentType,
          parsedData: input.parsedData,
          aiScore: input.aiScore,
          aiDecision: input.aiDecision,
          reasons: input.reasons,
        },
      });

      if (buli2Result.success && buli2Result.buli2TaskId) {
        state.buli2TaskId = buli2Result.buli2TaskId;
      }
    }

    await activities.updateReviewStatus({
      reviewId: input.reviewId,
      status: "in_review",
    });

    await CancellationScope.nonCancellable(async () => {
      await notificationActivities.sendNotification({
        recipientId: "admin",
        recipientType: "admin",
        notificationType: "new_review",
        reviewId: input.reviewId,
        documentId: input.documentId,
        message: `New KYC review required for document ${input.documentType}. AI Score: ${input.aiScore}`,
      });
    });

    state.status = "awaiting_decision";
    state.updatedAt = new Date().toISOString();

    const DECISION_TIMEOUT_HOURS = 168;
    const POLLING_INTERVAL_MINUTES = 5;
    const maxPollingAttempts = (DECISION_TIMEOUT_HOURS * 60) / POLLING_INTERVAL_MINUTES;
    let pollingAttempts = 0;

    while (!decisionReceived && !cancelled && pollingAttempts < maxPollingAttempts) {
      const hasDecision = await condition(
        () => decisionReceived !== null || cancelled,
        `${POLLING_INTERVAL_MINUTES}m`
      );

      if (hasDecision) {
        break;
      }

      if (state.buli2TaskId && patched("v1.1.0-poll-buli2")) {
        const pollResult = await activities.fetchExternalDecision({
          reviewId: input.reviewId,
          buli2TaskId: state.buli2TaskId,
        });

        if (pollResult.hasDecision && pollResult.decision) {
          decisionReceived = {
            decision: pollResult.decision,
            notes: pollResult.notes,
            decidedBy: pollResult.decidedBy,
          };
          state.decision = pollResult.decision;
          state.reviewerNotes = pollResult.notes;
          state.updatedAt = new Date().toISOString();
          break;
        }
      }

      pollingAttempts++;
      state.retryCount = pollingAttempts;
      state.updatedAt = new Date().toISOString();
    }

    if (cancelled) {
      await handleCancellation(input.reviewId, input.documentId, cancellationReason, state);
      throw ApplicationFailure.create({
        type: "REVIEW_CANCELLED",
        message: `Review cancelled: ${cancellationReason}`,
        nonRetryable: true,
      });
    }

    if (!decisionReceived) {
      await handleTimeout(input.reviewId, input.documentId, state);
      throw ApplicationFailure.create({
        type: "REVIEW_TIMEOUT",
        message: `Review timed out after ${DECISION_TIMEOUT_HOURS} hours without decision`,
        nonRetryable: true,
      });
    }

    state.status = "completed";
    state.updatedAt = new Date().toISOString();

    await activities.finalizeVerification({
      reviewId: input.reviewId,
      documentId: input.documentId,
      userId: input.userId,
      decision: decisionReceived.decision,
      notes: decisionReceived.notes,
    });

    await activities.updateReviewStatus({
      reviewId: input.reviewId,
      status: "completed",
      decision: decisionReceived.decision,
      notes: decisionReceived.notes,
    });

    await CancellationScope.nonCancellable(async () => {
      await notificationActivities.sendNotification({
        recipientId: input.userId,
        recipientType: "user",
        notificationType: "review_completed",
        reviewId: input.reviewId,
        documentId: input.documentId,
        message: `Your document verification has been ${decisionReceived!.decision}`,
      });
    });

    if (state.buli2TaskId && patched("v1.1.0-buli2-sync")) {
      await buli2Activities.syncWithBuli2({
        reviewId: input.reviewId,
        action: "update",
        payload: {
          status: "completed",
          decision: decisionReceived.decision,
          notes: decisionReceived.notes,
        },
      });
    }

    return {
      success: true,
      reviewId: input.reviewId,
      finalDecision: decisionReceived.decision,
      reviewerNotes: decisionReceived.notes,
      completedAt: new Date().toISOString(),
      workflowVersion: WORKFLOW_VERSION.CURRENT,
    };
  } catch (error) {
    state.status = "failed";
    state.lastError = error instanceof Error ? error.message : "Unknown error";
    state.updatedAt = new Date().toISOString();

    await compensateOnError(input.reviewId, input.documentId, state);

    throw error;
  }
}

async function handleCancellation(
  reviewId: string,
  _documentId: string,
  reason: string,
  state: KYCReviewWorkflowState
): Promise<void> {
  try {
    await activities.updateReviewStatus({
      reviewId,
      status: "failed",
      notes: `Cancelled: ${reason}`,
    });

    if (state.buli2TaskId) {
      await buli2Activities.syncWithBuli2({
        reviewId,
        action: "update",
        payload: {
          status: "cancelled",
          reason,
        },
      });
    }
  } catch (error) {
  }
}

async function handleTimeout(
  reviewId: string,
  documentId: string,
  _state: KYCReviewWorkflowState
): Promise<void> {
  try {
    await activities.updateReviewStatus({
      reviewId,
      status: "failed",
      notes: "Review timed out - no decision received",
    });

    await notificationActivities.sendNotification({
      recipientId: "admin",
      recipientType: "admin",
      notificationType: "reminder",
      reviewId,
      documentId,
      message: "Review timed out - manual intervention required",
    });
  } catch (error) {
  }
}

async function compensateOnError(
  reviewId: string,
  documentId: string,
  state: KYCReviewWorkflowState
): Promise<void> {
  try {
    await activities.updateReviewStatus({
      reviewId,
      status: "failed",
      notes: state.lastError || "Workflow failed unexpectedly",
    });

    await notificationActivities.sendNotification({
      recipientId: "admin",
      recipientType: "admin",
      notificationType: "reminder",
      reviewId,
      documentId,
      message: `Workflow failed: ${state.lastError || "Unknown error"}`,
    });
  } catch (compensationError) {
  }
}

export const TASK_QUEUE_NAME = "kyc-review-queue";

export const WORKFLOW_ID_PREFIX = "kyc-review-";

export function generateWorkflowId(reviewId: string): string {
  return `${WORKFLOW_ID_PREFIX}${reviewId}`;
}

export const WORKFLOW_TIMEOUTS = {
  executionTimeout: "7d",
  runTimeout: "1d",
  taskTimeout: "10m",
};

export const RETRY_POLICY = {
  initialInterval: "1s",
  backoffCoefficient: 2,
  maximumInterval: "1h",
  maximumAttempts: 5,
};
