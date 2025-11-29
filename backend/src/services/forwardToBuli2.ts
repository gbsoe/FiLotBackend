import { logger } from "../utils/logger";
import {
  CircuitState,
  CircuitBreakerOpenError,
  getOrCreateCircuitBreaker,
} from "../utils/circuitBreaker";
import { getRedisClient } from "./redisClient";

const BULI2_API_URL = process.env.BULI2_API_URL || "http://localhost:8080";
const BULI2_API_KEY = process.env.BULI2_API_KEY || "";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

const BULI2_RETRY_QUEUE_KEY = "filot:buli2:retry_queue";
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30000;

export interface ReviewPayload {
  reviewId: string;
  documentId: string;
  userId: string;
  documentType: string;
  parsedData: object;
  ocrText: string;
  score: number;
  decision: string;
  reasons: string[];
  callbackUrl?: string;
  correlationId?: string;
}

export interface ForwardResult {
  success: boolean;
  taskId?: string;
  error?: string;
  queued?: boolean;
  circuitOpen?: boolean;
}

interface QueuedReview {
  payload: ReviewPayload;
  queuedAt: number;
  attempts: number;
}

const buli2CircuitBreaker = getOrCreateCircuitBreaker({
  name: "buli2-forward",
  failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
  onStateChange: (name, from, to) => {
    logger.warn("BULI2 circuit breaker state changed", {
      name,
      from,
      to,
      timestamp: new Date().toISOString(),
    });
  },
});

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function makeRequest(
  url: string,
  payload: ReviewPayload,
  attempt: number
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (BULI2_API_KEY) {
    headers["Authorization"] = `Bearer ${BULI2_API_KEY}`;
  }

  const startTime = Date.now();

  logger.info("BULI2: Forwarding review", {
    reviewId: payload.reviewId,
    documentId: payload.documentId,
    correlationId: payload.correlationId,
    attempt,
    maxAttempts: MAX_RETRIES,
  });

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS
  );

  const responseTime = Date.now() - startTime;

  logger.info("BULI2: Request completed", {
    reviewId: payload.reviewId,
    documentId: payload.documentId,
    correlationId: payload.correlationId,
    statusCode: response.status,
    responseTimeMs: responseTime,
    attempt,
  });

  return response;
}

async function queueForRetry(payload: ReviewPayload): Promise<void> {
  try {
    const redis = getRedisClient();
    const queuedReview: QueuedReview = {
      payload,
      queuedAt: Date.now(),
      attempts: 0,
    };

    await redis.rpush(BULI2_RETRY_QUEUE_KEY, JSON.stringify(queuedReview));

    logger.info("BULI2: Review queued for later retry", {
      reviewId: payload.reviewId,
      documentId: payload.documentId,
      correlationId: payload.correlationId,
    });
  } catch (error) {
    logger.error("BULI2: Failed to queue review for retry", {
      reviewId: payload.reviewId,
      documentId: payload.documentId,
      correlationId: payload.correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function executeForward(payload: ReviewPayload): Promise<ForwardResult> {
  const url = `${BULI2_API_URL}/internal/reviews`;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await makeRequest(url, payload, attempt);

      if (response.ok) {
        const data = (await response.json()) as { taskId: string };
        const responseTime = Date.now() - startTime;

        logger.info("BULI2: Review forwarded successfully", {
          reviewId: payload.reviewId,
          documentId: payload.documentId,
          correlationId: payload.correlationId,
          taskId: data.taskId,
          totalTimeMs: responseTime,
          attempts: attempt,
        });

        return {
          success: true,
          taskId: data.taskId,
        };
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn("BULI2: Server error, retrying", {
          reviewId: payload.reviewId,
          documentId: payload.documentId,
          correlationId: payload.correlationId,
          statusCode: response.status,
          attempt,
          retryDelayMs: delayMs,
        });
        await delay(delayMs);
        continue;
      }

      const errorText = await response.text();
      const responseTime = Date.now() - startTime;

      logger.error("BULI2: Request failed with non-retriable status", {
        reviewId: payload.reviewId,
        documentId: payload.documentId,
        correlationId: payload.correlationId,
        statusCode: response.status,
        error: errorText,
        totalTimeMs: responseTime,
        attempts: attempt,
      });

      return {
        success: false,
        error: `BULI2 returned status ${response.status}: ${errorText}`,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";

      if (attempt < MAX_RETRIES) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn("BULI2: Network error, retrying", {
          reviewId: payload.reviewId,
          documentId: payload.documentId,
          correlationId: payload.correlationId,
          attempt,
          isTimeout,
          error: error instanceof Error ? error.message : "Unknown error",
          retryDelayMs: delayMs,
        });
        await delay(delayMs);
        continue;
      }

      const responseTime = Date.now() - startTime;

      logger.error("BULI2: Request failed after all retries", {
        reviewId: payload.reviewId,
        documentId: payload.documentId,
        correlationId: payload.correlationId,
        error: error instanceof Error ? error.message : "Unknown error",
        isTimeout,
        totalTimeMs: responseTime,
        attempts: attempt,
      });

      throw error;
    }
  }

  return {
    success: false,
    error: "Max retries exceeded",
  };
}

export async function forwardReview(payload: ReviewPayload): Promise<ForwardResult> {
  const circuitState = buli2CircuitBreaker.getState();

  logger.debug("BULI2: Circuit breaker status", {
    state: circuitState,
    reviewId: payload.reviewId,
    documentId: payload.documentId,
    correlationId: payload.correlationId,
  });

  try {
    const result = await buli2CircuitBreaker.execute(
      () => executeForward(payload),
      async () => {
        await queueForRetry(payload);
        return {
          success: false,
          queued: true,
          circuitOpen: true,
          error: "Circuit breaker is open, review queued for retry",
        };
      }
    );

    return result;
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      await queueForRetry(payload);
      return {
        success: false,
        queued: true,
        circuitOpen: true,
        error: "Circuit breaker is open, review queued for retry",
      };
    }

    logger.error("BULI2: Unexpected error in forwardReview", {
      reviewId: payload.reviewId,
      documentId: payload.documentId,
      correlationId: payload.correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}

export async function checkReviewStatus(
  taskId: string,
  correlationId?: string
): Promise<{
  status: string;
  decision?: string;
  notes?: string;
} | null> {
  const url = `${BULI2_API_URL}/internal/reviews/${taskId}/status`;
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (BULI2_API_KEY) {
      headers["Authorization"] = `Bearer ${BULI2_API_KEY}`;
    }

    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers,
      },
      REQUEST_TIMEOUT_MS
    );

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const data = (await response.json()) as {
        status: string;
        decision?: string;
        notes?: string;
      };

      logger.info("BULI2: Review status retrieved", {
        taskId,
        correlationId,
        status: data.status,
        decision: data.decision,
        responseTimeMs: responseTime,
      });

      return data;
    }

    logger.warn("BULI2: Failed to get review status", {
      taskId,
      correlationId,
      statusCode: response.status,
      responseTimeMs: responseTime,
    });

    return null;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";

    logger.error("BULI2: Error checking review status", {
      taskId,
      correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
      isTimeout,
      responseTimeMs: responseTime,
    });

    return null;
  }
}

export async function processRetryQueue(): Promise<number> {
  try {
    const redis = getRedisClient();
    let processed = 0;

    if (buli2CircuitBreaker.getState() === CircuitState.OPEN) {
      logger.debug("BULI2: Skipping retry queue processing - circuit is open");
      return 0;
    }

    const queueLength = await redis.llen(BULI2_RETRY_QUEUE_KEY);

    if (queueLength === 0) {
      return 0;
    }

    logger.info("BULI2: Processing retry queue", { queueLength });

    for (let i = 0; i < Math.min(queueLength, 10); i++) {
      const item = await redis.lpop(BULI2_RETRY_QUEUE_KEY);

      if (!item) break;

      try {
        const queuedReview: QueuedReview = JSON.parse(item);
        const result = await forwardReview(queuedReview.payload);

        if (result.success) {
          processed++;
        } else if (result.circuitOpen) {
          await redis.lpush(BULI2_RETRY_QUEUE_KEY, item);
          break;
        } else if (queuedReview.attempts < 5) {
          queuedReview.attempts++;
          await redis.rpush(BULI2_RETRY_QUEUE_KEY, JSON.stringify(queuedReview));
        } else {
          logger.error("BULI2: Review exceeded max retry attempts, discarding", {
            reviewId: queuedReview.payload.reviewId,
            documentId: queuedReview.payload.documentId,
            correlationId: queuedReview.payload.correlationId,
            attempts: queuedReview.attempts,
          });
        }
      } catch (error) {
        logger.error("BULI2: Error processing queued review", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logger.info("BULI2: Retry queue processing complete", { processed });
    return processed;
  } catch (error) {
    logger.error("BULI2: Failed to process retry queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export function getCircuitBreakerStats() {
  return buli2CircuitBreaker.getStats();
}

export function resetCircuitBreaker(): void {
  buli2CircuitBreaker.reset();
}
