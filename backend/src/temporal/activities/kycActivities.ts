import { logger } from "../../utils/logger";

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
  logger.info("Activity: sendNotification called", {
    recipientId: input.recipientId,
    notificationType: input.notificationType,
    reviewId: input.reviewId,
  });

  return {
    success: true,
    notificationId: `notif-${Date.now()}`,
  };
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
  logger.info("Activity: fetchExternalDecision called", {
    reviewId: input.reviewId,
    buli2TaskId: input.buli2TaskId,
  });

  return {
    hasDecision: false,
  };
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
  logger.info("Activity: updateReviewStatus called", {
    reviewId: input.reviewId,
    status: input.status,
    decision: input.decision,
  });

  return {
    success: true,
  };
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
  logger.info("Activity: syncWithBuli2 called", {
    reviewId: input.reviewId,
    action: input.action,
  });

  return {
    success: true,
    buli2TaskId: `buli2-task-${input.reviewId}`,
    status: "pending",
  };
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
  logger.info("Activity: finalizeVerification called", {
    reviewId: input.reviewId,
    documentId: input.documentId,
    decision: input.decision,
  });

  const status = input.decision === "approved" ? "manually_approved" : "manually_rejected";

  return {
    success: true,
    documentStatus: status,
    userStatus: status,
  };
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
