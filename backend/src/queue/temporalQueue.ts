import { QueueClient, QueueStatus } from "./index";
import { logger } from "../utils/logger";

export interface TemporalQueueOptions {
  address?: string;
  namespace?: string;
  taskQueue?: string;
}

class TemporalQueueNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalQueueNotConfiguredError";
  }
}

function isTemporalDisabled(): boolean {
  return process.env.TEMPORAL_DISABLED === "true";
}

function getTemporalEndpoint(): string | undefined {
  return process.env.TEMPORAL_ENDPOINT || process.env.TEMPORAL_ADDRESS;
}

function isTemporalConfigured(): boolean {
  return !!(
    getTemporalEndpoint() &&
    process.env.TEMPORAL_NAMESPACE &&
    !isTemporalDisabled()
  );
}

class TemporalQueue implements QueueClient {
  private address: string;
  private namespace: string;
  private taskQueue: string;
  private isStarted: boolean = false;

  constructor(options: TemporalQueueOptions = {}) {
    this.address = options.address || getTemporalEndpoint() || "";
    this.namespace = options.namespace || process.env.TEMPORAL_NAMESPACE || "default";
    this.taskQueue = options.taskQueue || process.env.TEMPORAL_TASK_QUEUE || "filot-ocr";

    logger.info("TemporalQueue initialized", {
      address: this.address ? "[configured]" : "[not configured]",
      namespace: this.namespace,
      taskQueue: this.taskQueue,
      disabled: isTemporalDisabled(),
    });
  }

  async enqueueDocument(documentId: string): Promise<boolean> {
    if (isTemporalDisabled()) {
      throw new TemporalQueueNotConfiguredError(
        "Temporal is disabled (TEMPORAL_DISABLED=true). " +
        "Set TEMPORAL_DISABLED=false and configure TEMPORAL_ENDPOINT to use Temporal queue."
      );
    }

    if (!isTemporalConfigured()) {
      throw new TemporalQueueNotConfiguredError(
        "Temporal is not configured. Required environment variables: " +
        "TEMPORAL_ENDPOINT (or TEMPORAL_ADDRESS), TEMPORAL_NAMESPACE. " +
        "See docs/TEMPORAL.md for setup instructions."
      );
    }

    logger.info("TemporalQueue: enqueueDocument called (stub)", {
      documentId,
      taskQueue: this.taskQueue,
    });

    throw new TemporalQueueNotConfiguredError(
      "Temporal workflow execution is not yet implemented. " +
      "This is a preparation tranche - Temporal Cloud integration will be added in a future tranche. " +
      "Use OCR_ENGINE=redis for now."
    );
  }

  async dequeue(): Promise<string | null> {
    logger.warn("TemporalQueue: dequeue is not applicable for Temporal workflows");
    return null;
  }

  async start(): Promise<void> {
    if (isTemporalDisabled()) {
      throw new TemporalQueueNotConfiguredError(
        "Cannot start Temporal worker - Temporal is disabled (TEMPORAL_DISABLED=true)."
      );
    }

    if (!isTemporalConfigured()) {
      throw new TemporalQueueNotConfiguredError(
        "Cannot start Temporal worker - Temporal is not configured. " +
        "Required: TEMPORAL_ENDPOINT (or TEMPORAL_ADDRESS), TEMPORAL_NAMESPACE."
      );
    }

    if (this.isStarted) {
      logger.warn("TemporalQueue worker already started");
      return;
    }

    logger.info("TemporalQueue: start called (stub)", {
      address: "[configured]",
      namespace: this.namespace,
      taskQueue: this.taskQueue,
    });

    throw new TemporalQueueNotConfiguredError(
      "Temporal worker startup is not yet implemented. " +
      "This is a preparation tranche - worker will be implemented with Temporal Cloud integration."
    );
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      logger.warn("TemporalQueue worker not started");
      return;
    }

    logger.info("TemporalQueue: stop called (stub)");
    this.isStarted = false;
  }

  async getStatus(): Promise<QueueStatus> {
    return {
      isRunning: this.isStarted,
      queueLength: 0,
      processingCount: 0,
    };
  }
}

export function createTemporalQueue(options: TemporalQueueOptions = {}): QueueClient {
  return new TemporalQueue(options);
}

export { TemporalQueueNotConfiguredError };
