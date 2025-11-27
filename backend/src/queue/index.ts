import { createRedisQueue, RedisQueueOptions } from "./redisQueue";
import { createTemporalQueue, TemporalQueueOptions } from "./temporalQueue";
import { logger } from "../utils/logger";

export type QueueEngine = "redis" | "temporal";

export interface QueueClient {
  enqueueDocument(documentId: string): Promise<void>;
  dequeue?(): Promise<string | null>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  getStatus?(): Promise<{
    isRunning: boolean;
    queueLength: number;
    processingCount: number;
  }>;
}

export interface QueueOptions {
  engine: QueueEngine;
  redis?: RedisQueueOptions;
  temporal?: TemporalQueueOptions;
}

export function createQueueClient(options: QueueOptions): QueueClient {
  const { engine } = options;

  logger.info("Creating queue client", { engine });

  switch (engine) {
    case "redis":
      return createRedisQueue(options.redis || {});
    case "temporal":
      return createTemporalQueue(options.temporal || {});
    default:
      throw new Error(`Unknown queue engine: ${engine}`);
  }
}

export function getDefaultQueueEngine(): QueueEngine {
  const envEngine = process.env.QUEUE_ENGINE?.toLowerCase();
  
  if (envEngine === "temporal") {
    const temporalDisabled = process.env.TEMPORAL_DISABLED === "true";
    if (temporalDisabled) {
      logger.warn("QUEUE_ENGINE=temporal but TEMPORAL_DISABLED=true, falling back to redis");
      return "redis";
    }
    return "temporal";
  }
  
  return "redis";
}

let defaultQueueClient: QueueClient | null = null;

export function getQueueClient(options?: QueueOptions): QueueClient {
  if (!defaultQueueClient) {
    const engine = options?.engine || getDefaultQueueEngine();
    defaultQueueClient = createQueueClient({
      engine,
      ...options,
    });
  }
  return defaultQueueClient;
}

export function resetQueueClient(): void {
  defaultQueueClient = null;
}

export { RedisQueueOptions } from "./redisQueue";
export { TemporalQueueOptions } from "./temporalQueue";
