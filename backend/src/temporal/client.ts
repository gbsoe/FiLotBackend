import { logger } from "../utils/logger";

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

let temporalClient: any = null;
let connectionStatus: TemporalConnectionStatus = { isConnected: false };

export function getTemporalConfig(): TemporalClientConfig | null {
  const address = process.env.TEMPORAL_ENDPOINT || process.env.TEMPORAL_ADDRESS;
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const apiKey = process.env.TEMPORAL_API_KEY;
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "filot-ocr";

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

export async function createTemporalClient(): Promise<any> {
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

    connectionStatus = {
      isConnected: true,
      address: config.address,
      namespace: config.namespace,
    };

    logger.info("Temporal client initialized (lazy - not connected until first use)", {
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

export function getTemporalClient(): any {
  return temporalClient;
}

export function getConnectionStatus(): TemporalConnectionStatus {
  return connectionStatus;
}

export async function closeTemporalClient(): Promise<void> {
  if (temporalClient) {
    try {
      logger.info("Closing Temporal client");
      temporalClient = null;
      connectionStatus = { isConnected: false };
    } catch (error) {
      logger.error("Error closing Temporal client", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
