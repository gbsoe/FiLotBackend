import { Connection, Client, WorkflowNotFoundError } from "@temporalio/client";
import { logger } from "../utils/logger";
import {
  KYCReviewWorkflowInput,
  KYCReviewWorkflowOutput,
  KYCReviewWorkflowState,
  TASK_QUEUE_NAME,
  generateWorkflowId,
  reviewDecisionSignal,
  cancelReviewSignal,
  getWorkflowStateQuery,
} from "./workflows/kycReviewWorkflow";

export interface TemporalClientConfig {
  address: string;
  namespace: string;
  apiKey?: string;
  taskQueue: string;
}

export interface TemporalConnectionStatus {
  isConnected: boolean;
  address?: string;
  namespace?: string;
  error?: string;
}

export interface StartWorkflowResult {
  success: boolean;
  workflowId: string;
  runId?: string;
  error?: string;
}

export interface SignalWorkflowResult {
  success: boolean;
  workflowId: string;
  error?: string;
}

export interface CancelWorkflowResult {
  success: boolean;
  workflowId: string;
  error?: string;
}

export interface WorkflowStateResult {
  success: boolean;
  workflowId: string;
  state?: KYCReviewWorkflowState;
  error?: string;
}

let temporalClient: Client | null = null;
let temporalConnection: Connection | null = null;
let connectionStatus: TemporalConnectionStatus = { isConnected: false };

export function getTemporalConfig(): TemporalClientConfig | null {
  const address = process.env.TEMPORAL_ENDPOINT || process.env.TEMPORAL_ADDRESS;
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const apiKey = process.env.TEMPORAL_API_KEY;
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || TASK_QUEUE_NAME;

  if (!address) {
    return null;
  }

  return {
    address,
    namespace,
    apiKey,
    taskQueue,
  };
}

export function isTemporalConfigured(): boolean {
  const config = getTemporalConfig();
  return config !== null && !!config.address;
}

export async function createTemporalClient(): Promise<Client | null> {
  const config = getTemporalConfig();

  if (!config) {
    logger.warn("Temporal client not configured - missing TEMPORAL_ENDPOINT or TEMPORAL_ADDRESS");
    connectionStatus = {
      isConnected: false,
      error: "Missing TEMPORAL_ENDPOINT or TEMPORAL_ADDRESS environment variable",
    };
    return null;
  }

  if (temporalClient) {
    return temporalClient;
  }

  try {
    logger.info("Creating Temporal client", {
      address: config.address ? "[configured]" : "[missing]",
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      hasApiKey: !!config.apiKey,
    });

    const connectionOptions: Parameters<typeof Connection.connect>[0] = {
      address: config.address,
    };

    if (config.apiKey) {
      connectionOptions.tls = {};
      connectionOptions.apiKey = config.apiKey;
    }

    temporalConnection = await Connection.connect(connectionOptions);

    temporalClient = new Client({
      connection: temporalConnection,
      namespace: config.namespace,
    });

    connectionStatus = {
      isConnected: true,
      address: config.address,
      namespace: config.namespace,
    };

    logger.info("Temporal client connected successfully", {
      namespace: config.namespace,
      taskQueue: config.taskQueue,
    });

    return temporalClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create Temporal client", { error: errorMessage });
    connectionStatus = {
      isConnected: false,
      error: errorMessage,
    };
    return null;
  }
}

export function getTemporalClient(): Client | null {
  return temporalClient;
}

export function getConnectionStatus(): TemporalConnectionStatus {
  return connectionStatus;
}

export async function closeTemporalClient(): Promise<void> {
  if (temporalConnection) {
    try {
      logger.info("Closing Temporal client");
      await temporalConnection.close();
      temporalClient = null;
      temporalConnection = null;
      connectionStatus = { isConnected: false };
    } catch (error) {
      logger.error("Error closing Temporal client", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

export async function startKYCWorkflow(
  input: KYCReviewWorkflowInput
): Promise<StartWorkflowResult> {
  const workflowId = generateWorkflowId(input.reviewId);
  const config = getTemporalConfig();

  logger.info("Starting KYC review workflow", {
    workflowId,
    reviewId: input.reviewId,
    documentId: input.documentId,
    userId: input.userId,
    documentType: input.documentType,
    aiScore: input.aiScore,
  });

  try {
    const client = await createTemporalClient();

    if (!client) {
      logger.error("Cannot start workflow - Temporal client not available");
      return {
        success: false,
        workflowId,
        error: "Temporal client not available",
      };
    }

    const handle = await client.workflow.start("kycReviewWorkflow", {
      args: [input],
      taskQueue: config?.taskQueue || TASK_QUEUE_NAME,
      workflowId,
      workflowExecutionTimeout: "7 days",
      workflowRunTimeout: "1 day",
      workflowTaskTimeout: "10 minutes",
      retry: {
        maximumAttempts: 3,
        initialInterval: "10s",
        maximumInterval: "5m",
        backoffCoefficient: 2,
      },
    });

    logger.info("KYC review workflow started successfully", {
      workflowId,
      runId: handle.firstExecutionRunId,
      reviewId: input.reviewId,
    });

    return {
      success: true,
      workflowId,
      runId: handle.firstExecutionRunId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to start KYC review workflow", {
      error: errorMessage,
      workflowId,
      reviewId: input.reviewId,
    });

    return {
      success: false,
      workflowId,
      error: errorMessage,
    };
  }
}

export async function completeManualReviewWorkflow(
  reviewId: string,
  decision: "approved" | "rejected",
  notes?: string,
  decidedBy?: string
): Promise<SignalWorkflowResult> {
  const workflowId = generateWorkflowId(reviewId);

  logger.info("Signaling KYC review workflow with decision", {
    workflowId,
    reviewId,
    decision,
    hasNotes: !!notes,
    decidedBy,
  });

  try {
    const client = await createTemporalClient();

    if (!client) {
      logger.error("Cannot signal workflow - Temporal client not available");
      return {
        success: false,
        workflowId,
        error: "Temporal client not available",
      };
    }

    const handle = client.workflow.getHandle(workflowId);

    await handle.signal(reviewDecisionSignal, {
      decision,
      notes,
      decidedBy,
    });

    logger.info("KYC review workflow signaled successfully", {
      workflowId,
      reviewId,
      decision,
    });

    return {
      success: true,
      workflowId,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      logger.warn("Workflow not found for signal", {
        workflowId,
        reviewId,
      });
      return {
        success: false,
        workflowId,
        error: `Workflow not found: ${workflowId}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to signal KYC review workflow", {
      error: errorMessage,
      workflowId,
      reviewId,
    });

    return {
      success: false,
      workflowId,
      error: errorMessage,
    };
  }
}

export async function failReviewWorkflow(
  reviewId: string,
  reason: string
): Promise<CancelWorkflowResult> {
  const workflowId = generateWorkflowId(reviewId);

  logger.info("Cancelling KYC review workflow", {
    workflowId,
    reviewId,
    reason,
  });

  try {
    const client = await createTemporalClient();

    if (!client) {
      logger.error("Cannot cancel workflow - Temporal client not available");
      return {
        success: false,
        workflowId,
        error: "Temporal client not available",
      };
    }

    const handle = client.workflow.getHandle(workflowId);

    try {
      await handle.signal(cancelReviewSignal, reason);
      
      logger.info("KYC review workflow cancel signal sent", {
        workflowId,
        reviewId,
        reason,
      });
    } catch (signalError) {
      logger.warn("Could not signal cancel, attempting workflow cancel", {
        workflowId,
        signalError: signalError instanceof Error ? signalError.message : "Unknown",
      });

      await handle.cancel();
      
      logger.info("KYC review workflow cancelled via cancel()", {
        workflowId,
        reviewId,
      });
    }

    return {
      success: true,
      workflowId,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      logger.warn("Workflow not found for cancellation", {
        workflowId,
        reviewId,
      });
      return {
        success: true,
        workflowId,
      };
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to cancel KYC review workflow", {
      error: errorMessage,
      workflowId,
      reviewId,
    });

    return {
      success: false,
      workflowId,
      error: errorMessage,
    };
  }
}

export async function getWorkflowState(
  reviewId: string
): Promise<WorkflowStateResult> {
  const workflowId = generateWorkflowId(reviewId);

  logger.debug("Querying KYC review workflow state", {
    workflowId,
    reviewId,
  });

  try {
    const client = await createTemporalClient();

    if (!client) {
      logger.error("Cannot query workflow - Temporal client not available");
      return {
        success: false,
        workflowId,
        error: "Temporal client not available",
      };
    }

    const handle = client.workflow.getHandle(workflowId);
    const state = await handle.query(getWorkflowStateQuery);

    logger.debug("KYC review workflow state retrieved", {
      workflowId,
      reviewId,
      status: state.status,
    });

    return {
      success: true,
      workflowId,
      state,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      logger.warn("Workflow not found for query", {
        workflowId,
        reviewId,
      });
      return {
        success: false,
        workflowId,
        error: `Workflow not found: ${workflowId}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to query KYC review workflow state", {
      error: errorMessage,
      workflowId,
      reviewId,
    });

    return {
      success: false,
      workflowId,
      error: errorMessage,
    };
  }
}

export async function waitForWorkflowCompletion(
  reviewId: string,
  timeoutMs: number = 300000
): Promise<{
  success: boolean;
  result?: KYCReviewWorkflowOutput;
  error?: string;
}> {
  const workflowId = generateWorkflowId(reviewId);

  logger.info("Waiting for KYC review workflow completion", {
    workflowId,
    reviewId,
    timeoutMs,
  });

  try {
    const client = await createTemporalClient();

    if (!client) {
      return {
        success: false,
        error: "Temporal client not available",
      };
    }

    const handle = client.workflow.getHandle(workflowId);

    const result = await Promise.race([
      handle.result(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout waiting for workflow completion")), timeoutMs)
      ),
    ]);

    logger.info("KYC review workflow completed", {
      workflowId,
      reviewId,
      decision: result.finalDecision,
    });

    return {
      success: true,
      result: result as KYCReviewWorkflowOutput,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Error waiting for KYC review workflow completion", {
      error: errorMessage,
      workflowId,
      reviewId,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
