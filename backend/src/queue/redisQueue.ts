import { QueueClient, QueueStatus } from "./index";
import {
  enqueue,
  dequeue as redisDequeue,
  getQueueLength,
  getProcessingCount,
} from "../services/queueService";
import { startQueueWorker, stopQueueWorker, getWorkerStatus } from "../workers/queueWorker";
import { logger } from "../utils/logger";

export interface RedisQueueOptions {
  pollIntervalMs?: number;
}

class RedisQueue implements QueueClient {
  private pollIntervalMs: number;
  private isStarted: boolean = false;

  constructor(options: RedisQueueOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 3000;
    logger.info("RedisQueue initialized", { pollIntervalMs: this.pollIntervalMs });
  }

  async enqueueDocument(documentId: string): Promise<boolean> {
    const result = await enqueue(documentId);
    if (!result) {
      logger.info("Document already in queue or processing", { documentId });
    }
    return result;
  }

  async dequeue(): Promise<string | null> {
    return await redisDequeue();
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn("RedisQueue worker already started");
      return;
    }
    await startQueueWorker(this.pollIntervalMs);
    this.isStarted = true;
    logger.info("RedisQueue worker started");
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      logger.warn("RedisQueue worker not started");
      return;
    }
    stopQueueWorker();
    this.isStarted = false;
    logger.info("RedisQueue worker stopped");
  }

  async getStatus(): Promise<QueueStatus> {
    const workerStatus = await getWorkerStatus();
    const queueLength = await getQueueLength();
    const processingCount = await getProcessingCount();

    return {
      isRunning: workerStatus.isRunning,
      queueLength,
      processingCount,
    };
  }
}

export function createRedisQueue(options: RedisQueueOptions = {}): QueueClient {
  return new RedisQueue(options);
}
