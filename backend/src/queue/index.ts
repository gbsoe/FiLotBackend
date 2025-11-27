import { createRedisQueue, RedisQueueOptions } from "./redisQueue";
import { createTemporalQueue, TemporalQueueOptions } from "./temporalQueue";
import { logger } from "../utils/logger";

export type QueueEngine = "redis" | "temporal";

export interface QueueStatus {
  isRunning: boolean;
  queueLength: number;
  processingCount: number;
}

export interface QueueClient {
  enqueueDocument(documentId: string): Promise<boolean>;
  dequeue(): Promise<string | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<QueueStatus>;
}

export interface QueueOptions {
  engine: QueueEngine;
  redis?: RedisQueueOptions;
  temporal?: TemporalQueueOptions;
}

interface QueueState {
  client: QueueClient | null;
  engine: QueueEngine | null;
  isRunning: boolean;
}

const queueState: QueueState = {
  client: null,
  engine: null,
  isRunning: false,
};

function createClient(engine: QueueEngine, options?: QueueOptions): QueueClient {
  logger.info("Creating queue client", { engine });

  switch (engine) {
    case "redis":
      return createRedisQueue(options?.redis || {});
    case "temporal":
      return createTemporalQueue(options?.temporal || {});
    default:
      throw new Error(`Unknown queue engine: ${engine}`);
  }
}

export function getConfiguredQueueEngine(): QueueEngine {
  const envEngine = process.env.QUEUE_ENGINE?.toLowerCase();
  
  if (envEngine === "temporal") {
    const temporalDisabled = process.env.TEMPORAL_DISABLED === "true";
    if (temporalDisabled) {
      logger.warn("QUEUE_ENGINE=temporal but TEMPORAL_DISABLED=true, should use redis");
      return "redis";
    }
    return "temporal";
  }
  
  return "redis";
}

export function getActiveQueueEngine(): QueueEngine {
  return queueState.engine || getConfiguredQueueEngine();
}

export function getQueueClient(engine?: QueueEngine): QueueClient {
  const targetEngine = engine || queueState.engine || getConfiguredQueueEngine();
  
  if (queueState.client && queueState.engine === targetEngine) {
    return queueState.client;
  }
  
  if (queueState.engine && queueState.engine !== targetEngine) {
    logger.info("Switching queue engine", { from: queueState.engine, to: targetEngine });
  }
  
  queueState.client = createClient(targetEngine);
  queueState.engine = targetEngine;
  
  return queueState.client;
}

export async function startQueue(engine?: QueueEngine): Promise<void> {
  const targetEngine = engine || getConfiguredQueueEngine();
  
  if (queueState.isRunning && queueState.engine === targetEngine) {
    logger.info("Queue already running", { engine: targetEngine });
    return;
  }
  
  if (queueState.isRunning && queueState.engine !== targetEngine) {
    await stopQueue();
  }
  
  const client = getQueueClient(targetEngine);
  await client.start();
  queueState.isRunning = true;
  
  logger.info("Queue started", { engine: targetEngine });
}

export async function stopQueue(): Promise<void> {
  if (!queueState.isRunning || !queueState.client) {
    logger.info("Queue not running, nothing to stop");
    return;
  }
  
  try {
    await queueState.client.stop();
    queueState.isRunning = false;
    logger.info("Queue stopped", { engine: queueState.engine });
  } catch (error) {
    logger.error("Error stopping queue", {
      engine: queueState.engine,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    queueState.isRunning = false;
  }
}

export async function switchToRedis(): Promise<void> {
  if (queueState.engine === "redis" && queueState.isRunning && queueState.client) {
    logger.info("Already running Redis queue, no switch needed");
    return;
  }
  
  if (queueState.isRunning && queueState.engine !== "redis") {
    await stopQueue();
  }
  
  if (!queueState.client || queueState.engine !== "redis") {
    queueState.client = createClient("redis");
    queueState.engine = "redis";
  }
  
  if (!queueState.isRunning) {
    await queueState.client.start();
    queueState.isRunning = true;
    logger.info("Switched to Redis queue and started worker");
  }
}

export function isQueueRunning(): boolean {
  return queueState.isRunning;
}

export function resetQueueState(): void {
  queueState.client = null;
  queueState.engine = null;
  queueState.isRunning = false;
}

export { RedisQueueOptions } from "./redisQueue";
export { TemporalQueueOptions } from "./temporalQueue";
