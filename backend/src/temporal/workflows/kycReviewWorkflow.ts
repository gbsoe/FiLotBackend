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
}

export interface KYCReviewWorkflowState {
  status: "pending" | "sent_to_reviewer" | "awaiting_decision" | "completed" | "failed";
  retryCount: number;
  lastError?: string;
}

export async function kycReviewWorkflow(
  input: KYCReviewWorkflowInput
): Promise<KYCReviewWorkflowOutput> {
  const state: KYCReviewWorkflowState = {
    status: "pending",
    retryCount: 0,
  };

  try {
    state.status = "sent_to_reviewer";

    state.status = "awaiting_decision";

    const decision = await waitForExternalDecision(input.reviewId);

    state.status = "completed";

    await finalizeReview(input.reviewId, decision);

    return {
      success: true,
      reviewId: input.reviewId,
      finalDecision: decision.decision,
      reviewerNotes: decision.notes,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    state.status = "failed";
    state.lastError = error instanceof Error ? error.message : "Unknown error";

    throw error;
  }
}

async function waitForExternalDecision(_reviewId: string): Promise<{
  decision: "approved" | "rejected";
  notes?: string;
}> {
  return {
    decision: "approved",
    notes: "Stub implementation - awaiting Temporal runtime",
  };
}

async function finalizeReview(
  _reviewId: string,
  _decision: { decision: "approved" | "rejected"; notes?: string }
): Promise<void> {
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
