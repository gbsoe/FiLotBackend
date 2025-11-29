import { logger } from "../utils/logger";

const BULI2_API_URL = process.env.BULI2_API_URL || "http://localhost:8080";
const BULI2_API_KEY = process.env.BULI2_API_KEY || "";
const REQUEST_TIMEOUT_MS = 30000;

export interface Buli2Document {
  id: string;
  userId?: string;
  type: string;
  r2Key?: string;
  originalFilename?: string;
}

export interface Buli2ParsedData {
  [key: string]: unknown;
}

export interface Buli2SendPayload {
  documentId: string;
  userId?: string;
  documentType: string;
  parsedData: Buli2ParsedData;
  aiScore: number;
  ocrText?: string;
  correlationId?: string;
  callbackUrl?: string;
  metadata?: {
    originalFilename?: string;
    r2Key?: string;
    submittedAt: string;
  };
}

export interface Buli2SendResult {
  ticketId: string;
  status: string;
  message?: string;
}

export interface Buli2RequestContext {
  reviewId?: string;
  documentId: string;
  correlationId?: string;
  startTime?: number;
}

export class Buli2ClientError extends Error {
  public readonly statusCode?: number;
  public readonly context?: Buli2RequestContext;

  constructor(message: string, statusCode?: number, context?: Buli2RequestContext) {
    super(message);
    this.name = "Buli2ClientError";
    this.statusCode = statusCode;
    this.context = context;
  }
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

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (BULI2_API_KEY) {
    headers["Authorization"] = `Bearer ${BULI2_API_KEY}`;
  }

  return headers;
}

function buildPayload(
  document: Buli2Document,
  parsedData: Buli2ParsedData,
  aiScore: number,
  options?: {
    ocrText?: string;
    correlationId?: string;
    callbackUrl?: string;
  }
): Buli2SendPayload {
  return {
    documentId: document.id,
    userId: document.userId,
    documentType: document.type,
    parsedData,
    aiScore,
    ocrText: options?.ocrText,
    correlationId: options?.correlationId,
    callbackUrl: options?.callbackUrl,
    metadata: {
      originalFilename: document.originalFilename,
      r2Key: document.r2Key,
      submittedAt: new Date().toISOString(),
    },
  };
}

export async function sendToBuli2(
  document: Buli2Document,
  parsedData: Buli2ParsedData,
  aiScore: number,
  options?: {
    ocrText?: string;
    correlationId?: string;
    callbackUrl?: string;
  }
): Promise<Buli2SendResult> {
  const startTime = Date.now();
  const context: Buli2RequestContext = {
    documentId: document.id,
    correlationId: options?.correlationId,
    startTime,
  };

  const url = `${BULI2_API_URL}/internal/reviews`;
  const payload = buildPayload(document, parsedData, aiScore, options);

  logger.info("BULI2: Sending document for manual review", {
    documentId: document.id,
    documentType: document.type,
    aiScore,
    correlationId: options?.correlationId,
    url,
  });

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS
    );

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const data = (await response.json()) as { taskId?: string; ticketId?: string; status?: string };
      const ticketId = data.taskId || data.ticketId || `BULI2-${Date.now()}`;

      logger.info("BULI2: Document successfully queued for review", {
        documentId: document.id,
        ticketId,
        responseTimeMs: responseTime,
        correlationId: options?.correlationId,
      });

      return {
        ticketId,
        status: data.status || "queued",
      };
    }

    const errorText = await response.text();
    logger.error("BULI2: Request failed with non-success status", {
      documentId: document.id,
      statusCode: response.status,
      error: errorText,
      responseTimeMs: responseTime,
      correlationId: options?.correlationId,
    });

    throw new Buli2ClientError(
      `BULI2 returned status ${response.status}: ${errorText}`,
      response.status,
      context
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error instanceof Buli2ClientError) {
      throw error;
    }

    const isTimeout = error instanceof Error && error.name === "AbortError";
    const errorMessage = isTimeout
      ? `Request timeout after ${REQUEST_TIMEOUT_MS}ms`
      : error instanceof Error
        ? error.message
        : "Unknown error";

    logger.error("BULI2: Request failed", {
      documentId: document.id,
      error: errorMessage,
      isTimeout,
      responseTimeMs: responseTime,
      correlationId: options?.correlationId,
    });

    throw new Buli2ClientError(errorMessage, undefined, context);
  }
}

export async function getReviewStatus(
  ticketId: string,
  correlationId?: string
): Promise<{
  status: string;
  decision?: string;
  notes?: string;
} | null> {
  const startTime = Date.now();
  const url = `${BULI2_API_URL}/internal/reviews/${ticketId}/status`;

  logger.debug("BULI2: Checking review status", {
    ticketId,
    correlationId,
  });

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: buildAuthHeaders(),
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
        ticketId,
        status: data.status,
        decision: data.decision,
        responseTimeMs: responseTime,
        correlationId,
      });

      return data;
    }

    logger.warn("BULI2: Failed to get review status", {
      ticketId,
      statusCode: response.status,
      responseTimeMs: responseTime,
      correlationId,
    });

    return null;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";

    logger.error("BULI2: Error checking review status", {
      ticketId,
      error: error instanceof Error ? error.message : "Unknown error",
      isTimeout,
      responseTimeMs: responseTime,
      correlationId,
    });

    return null;
  }
}

export async function cancelReview(
  ticketId: string,
  reason?: string,
  correlationId?: string
): Promise<boolean> {
  const startTime = Date.now();
  const url = `${BULI2_API_URL}/internal/reviews/${ticketId}/cancel`;

  logger.info("BULI2: Cancelling review", {
    ticketId,
    reason,
    correlationId,
  });

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ reason }),
      },
      REQUEST_TIMEOUT_MS
    );

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      logger.info("BULI2: Review cancelled successfully", {
        ticketId,
        responseTimeMs: responseTime,
        correlationId,
      });
      return true;
    }

    logger.warn("BULI2: Failed to cancel review", {
      ticketId,
      statusCode: response.status,
      responseTimeMs: responseTime,
      correlationId,
    });

    return false;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error("BULI2: Error cancelling review", {
      ticketId,
      error: error instanceof Error ? error.message : "Unknown error",
      responseTimeMs: responseTime,
      correlationId,
    });

    return false;
  }
}

export function isBuli2Configured(): boolean {
  return !!BULI2_API_KEY && BULI2_API_URL !== "http://localhost:8080";
}
