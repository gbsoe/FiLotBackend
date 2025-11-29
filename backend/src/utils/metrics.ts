import { logger } from "./logger";
import { getRedisClient, isRedisHealthy } from "../services/redisClient";

export interface MetricValue {
  name: string;
  value: number;
  unit: MetricUnit;
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

export type MetricUnit =
  | "Count"
  | "Milliseconds"
  | "Seconds"
  | "Bytes"
  | "Percent"
  | "None";

interface MetricsConfig {
  namespace: string;
  logGroup: string;
  enabled: boolean;
  batchSize: number;
  flushIntervalMs: number;
}

const config: MetricsConfig = {
  namespace: process.env.METRICS_NAMESPACE || "FiLot",
  logGroup: process.env.CLOUDWATCH_LOG_GROUP || "/ecs/filot-ocr-gpu-worker",
  enabled: process.env.METRICS_ENABLED !== "false",
  batchSize: parseInt(process.env.METRICS_BATCH_SIZE || "10", 10),
  flushIntervalMs: parseInt(process.env.METRICS_FLUSH_INTERVAL_MS || "60000", 10),
};

const metricBuffer: MetricValue[] = [];
let flushIntervalId: NodeJS.Timeout | null = null;

export const METRIC_NAMES = {
  QUEUE_LENGTH: "filot.queue_length",
  GPU_ACTIVE_JOBS: "filot.gpu.active_jobs",
  GPU_PROCESSING_TIME_MS: "filot.gpu.processing_time_ms",
  VERIFICATION_LATENCY_MS: "filot.verification.latency_ms",
  BULI2_RETRY_COUNT: "filot.buli2.retry_count",
  OCR_SUCCESS_COUNT: "filot.ocr.success_count",
  OCR_FAILURE_COUNT: "filot.ocr.failure_count",
  AI_EVALUATION_COUNT: "filot.ai.evaluation_count",
  BULI2_FORWARD_COUNT: "filot.buli2.forward_count",
  FALLBACK_TO_CPU_COUNT: "filot.gpu.fallback_count",
} as const;

function formatMetricLog(metric: MetricValue): object {
  return {
    _aws: {
      Timestamp: (metric.timestamp || new Date()).toISOString(),
      CloudWatchMetrics: [
        {
          Namespace: config.namespace,
          Dimensions: [Object.keys(metric.dimensions || {})],
          Metrics: [
            {
              Name: metric.name,
              Unit: metric.unit,
            },
          ],
        },
      ],
    },
    [metric.name]: metric.value,
    ...(metric.dimensions || {}),
  };
}

export function emitMetric(
  name: string,
  value: number,
  unit: MetricUnit = "Count",
  dimensions?: Record<string, string>
): void {
  if (!config.enabled) {
    return;
  }

  const metric: MetricValue = {
    name,
    value,
    unit,
    dimensions: {
      Environment: process.env.NODE_ENV || "development",
      ...dimensions,
    },
    timestamp: new Date(),
  };

  metricBuffer.push(metric);

  logger.debug("Metric emitted", {
    metric: metric.name,
    value: metric.value,
    unit: metric.unit,
    dimensions: metric.dimensions,
  });

  if (metricBuffer.length >= config.batchSize) {
    flushMetrics();
  }
}

export async function flushMetrics(): Promise<void> {
  if (metricBuffer.length === 0) {
    return;
  }

  const metricsToFlush = [...metricBuffer];
  metricBuffer.length = 0;

  for (const metric of metricsToFlush) {
    const logEntry = formatMetricLog(metric);
    console.log(JSON.stringify(logEntry));
  }

  logger.debug("Metrics flushed", { count: metricsToFlush.length });
}

export function startMetricsFlushTimer(): void {
  if (flushIntervalId) {
    return;
  }

  flushIntervalId = setInterval(() => {
    flushMetrics();
  }, config.flushIntervalMs);

  logger.info("Metrics flush timer started", {
    intervalMs: config.flushIntervalMs,
  });
}

export function stopMetricsFlushTimer(): void {
  if (flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
    flushMetrics();
    logger.info("Metrics flush timer stopped");
  }
}

export async function recordQueueMetrics(): Promise<void> {
  try {
    const healthy = await isRedisHealthy();
    if (!healthy) {
      logger.warn("Redis not healthy, skipping queue metrics");
      return;
    }

    const redis = getRedisClient();

    const gpuQueueKey = process.env.OCR_GPU_QUEUE_KEY || "filot:ocr:gpu:queue";
    const gpuProcessingKey = process.env.OCR_GPU_PROCESSING_KEY || "filot:ocr:gpu:processing";
    const cpuQueueKey = process.env.OCR_QUEUE_KEY || "filot:ocr:queue";

    const [gpuQueueLength, gpuActiveJobs, cpuQueueLength] = await Promise.all([
      redis.llen(gpuQueueKey),
      redis.scard(gpuProcessingKey),
      redis.llen(cpuQueueKey),
    ]);

    emitMetric(METRIC_NAMES.QUEUE_LENGTH, gpuQueueLength + cpuQueueLength, "Count", {
      QueueType: "total",
    });

    emitMetric(METRIC_NAMES.QUEUE_LENGTH, gpuQueueLength, "Count", {
      QueueType: "gpu",
    });

    emitMetric(METRIC_NAMES.QUEUE_LENGTH, cpuQueueLength, "Count", {
      QueueType: "cpu",
    });

    emitMetric(METRIC_NAMES.GPU_ACTIVE_JOBS, gpuActiveJobs, "Count");

    logger.debug("Queue metrics recorded", {
      gpuQueueLength,
      gpuActiveJobs,
      cpuQueueLength,
    });
  } catch (error) {
    logger.error("Failed to record queue metrics", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function recordBuli2RetryMetrics(): Promise<void> {
  try {
    const healthy = await isRedisHealthy();
    if (!healthy) {
      return;
    }

    const redis = getRedisClient();
    const retryQueueKey = "filot:buli2:retry_queue";

    const retryCount = await redis.llen(retryQueueKey);

    emitMetric(METRIC_NAMES.BULI2_RETRY_COUNT, retryCount, "Count");

    logger.debug("BULI2 retry metrics recorded", { retryCount });
  } catch (error) {
    logger.error("Failed to record BULI2 retry metrics", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export function recordProcessingTime(
  documentId: string,
  processingTimeMs: number,
  isGpu: boolean
): void {
  emitMetric(METRIC_NAMES.GPU_PROCESSING_TIME_MS, processingTimeMs, "Milliseconds", {
    DocumentId: documentId,
    ProcessorType: isGpu ? "GPU" : "CPU",
  });
}

export function recordVerificationLatency(
  documentId: string,
  latencyMs: number,
  outcome: string
): void {
  emitMetric(METRIC_NAMES.VERIFICATION_LATENCY_MS, latencyMs, "Milliseconds", {
    DocumentId: documentId,
    Outcome: outcome,
  });
}

export function recordOcrResult(
  documentId: string,
  success: boolean,
  processorType: "GPU" | "CPU"
): void {
  const metricName = success
    ? METRIC_NAMES.OCR_SUCCESS_COUNT
    : METRIC_NAMES.OCR_FAILURE_COUNT;

  emitMetric(metricName, 1, "Count", {
    DocumentId: documentId,
    ProcessorType: processorType,
  });
}

export function recordAiEvaluation(
  documentId: string,
  decision: string,
  score: number
): void {
  emitMetric(METRIC_NAMES.AI_EVALUATION_COUNT, 1, "Count", {
    DocumentId: documentId,
    Decision: decision,
    ScoreBucket: getScoreBucket(score),
  });
}

export function recordBuli2Forward(documentId: string, success: boolean): void {
  emitMetric(METRIC_NAMES.BULI2_FORWARD_COUNT, 1, "Count", {
    DocumentId: documentId,
    Success: success ? "true" : "false",
  });
}

export function recordFallbackToCpu(documentId: string, reason: string): void {
  emitMetric(METRIC_NAMES.FALLBACK_TO_CPU_COUNT, 1, "Count", {
    DocumentId: documentId,
    Reason: reason,
  });
}

function getScoreBucket(score: number): string {
  if (score >= 85) return "high";
  if (score >= 50) return "medium";
  if (score >= 35) return "low";
  return "very_low";
}

export interface SystemMetrics {
  gpuQueueLength: number;
  cpuQueueLength: number;
  gpuActiveJobs: number;
  buli2RetryQueueLength: number;
  metricsBufferSize: number;
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const defaultMetrics: SystemMetrics = {
    gpuQueueLength: 0,
    cpuQueueLength: 0,
    gpuActiveJobs: 0,
    buli2RetryQueueLength: 0,
    metricsBufferSize: metricBuffer.length,
  };

  try {
    const healthy = await isRedisHealthy();
    if (!healthy) {
      return defaultMetrics;
    }

    const redis = getRedisClient();

    const gpuQueueKey = process.env.OCR_GPU_QUEUE_KEY || "filot:ocr:gpu:queue";
    const gpuProcessingKey = process.env.OCR_GPU_PROCESSING_KEY || "filot:ocr:gpu:processing";
    const cpuQueueKey = process.env.OCR_QUEUE_KEY || "filot:ocr:queue";
    const retryQueueKey = "filot:buli2:retry_queue";

    const [gpuQueueLength, gpuActiveJobs, cpuQueueLength, buli2RetryQueueLength] =
      await Promise.all([
        redis.llen(gpuQueueKey),
        redis.scard(gpuProcessingKey),
        redis.llen(cpuQueueKey),
        redis.llen(retryQueueKey),
      ]);

    return {
      gpuQueueLength,
      cpuQueueLength,
      gpuActiveJobs,
      buli2RetryQueueLength,
      metricsBufferSize: metricBuffer.length,
    };
  } catch (error) {
    logger.error("Failed to get system metrics", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return defaultMetrics;
  }
}

export function emitCloudWatchLogEvent(
  eventType: string,
  data: Record<string, unknown>
): void {
  const logEvent = {
    timestamp: new Date().toISOString(),
    logGroup: config.logGroup,
    eventType,
    ...data,
  };

  console.log(JSON.stringify(logEvent));
}

export function logQueuePull(
  documentId: string,
  correlationId: string,
  queueType: "GPU" | "CPU"
): void {
  emitCloudWatchLogEvent("queue_pull", {
    documentId,
    correlationId,
    queueType,
    action: "dequeue",
  });
}

export function logProcessingDone(
  documentId: string,
  correlationId: string,
  success: boolean,
  processingTimeMs: number,
  processorType: "GPU" | "CPU"
): void {
  emitCloudWatchLogEvent("processing_done", {
    documentId,
    correlationId,
    success,
    processingTimeMs,
    processorType,
  });

  recordProcessingTime(documentId, processingTimeMs, processorType === "GPU");
  recordOcrResult(documentId, success, processorType);
}

export function logFallbackEvent(
  documentId: string,
  correlationId: string,
  reason: string
): void {
  emitCloudWatchLogEvent("fallback_event", {
    documentId,
    correlationId,
    reason,
    fromProcessor: "GPU",
    toProcessor: "CPU",
  });

  recordFallbackToCpu(documentId, reason);
}

export function logAiEvaluationDone(
  documentId: string,
  correlationId: string,
  score: number,
  decision: string,
  outcome: string
): void {
  emitCloudWatchLogEvent("ai_evaluation_done", {
    documentId,
    correlationId,
    score,
    decision,
    outcome,
  });

  recordAiEvaluation(documentId, decision, score);
}

export function logBuli2Forward(
  documentId: string,
  correlationId: string,
  reviewId: string,
  success: boolean,
  responseTimeMs: number
): void {
  emitCloudWatchLogEvent("buli2_forward", {
    documentId,
    correlationId,
    reviewId,
    success,
    responseTimeMs,
  });

  recordBuli2Forward(documentId, success);
}
