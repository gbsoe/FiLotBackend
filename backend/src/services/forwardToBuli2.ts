import { logger } from "../utils/logger";

const BULI2_API_URL = process.env.BULI2_API_URL || "http://localhost:8080";
const BULI2_API_KEY = process.env.BULI2_API_KEY || "";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

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
}

export interface ForwardResult {
  success: boolean;
  taskId?: string;
  error?: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  
  logger.info(`Forwarding review to BULI2 (attempt ${attempt}/${MAX_RETRIES})`, {
    url,
    reviewId: payload.reviewId,
    documentId: payload.documentId,
  });
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  
  return response;
}

export async function forwardReview(payload: ReviewPayload): Promise<ForwardResult> {
  const url = `${BULI2_API_URL}/internal/reviews`;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await makeRequest(url, payload, attempt);
      
      if (response.ok) {
        const data = await response.json() as { taskId: string };
        logger.info(`Successfully forwarded review to BULI2`, {
          reviewId: payload.reviewId,
          taskId: data.taskId,
        });
        return {
          success: true,
          taskId: data.taskId,
        };
      }
      
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`BULI2 returned ${response.status}, retrying in ${delayMs}ms`, {
          reviewId: payload.reviewId,
          attempt,
        });
        await delay(delayMs);
        continue;
      }
      
      const errorText = await response.text();
      logger.error(`BULI2 request failed with status ${response.status}`, {
        reviewId: payload.reviewId,
        status: response.status,
        error: errorText,
      });
      
      return {
        success: false,
        error: `BULI2 returned status ${response.status}: ${errorText}`,
      };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`Network error forwarding to BULI2, retrying in ${delayMs}ms`, {
          reviewId: payload.reviewId,
          attempt,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        await delay(delayMs);
        continue;
      }
      
      logger.error(`Failed to forward review to BULI2 after ${MAX_RETRIES} attempts`, {
        reviewId: payload.reviewId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown network error",
      };
    }
  }
  
  return {
    success: false,
    error: "Max retries exceeded",
  };
}

export async function checkReviewStatus(taskId: string): Promise<{
  status: string;
  decision?: string;
  notes?: string;
} | null> {
  const url = `${BULI2_API_URL}/internal/reviews/${taskId}/status`;
  
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (BULI2_API_KEY) {
      headers["Authorization"] = `Bearer ${BULI2_API_KEY}`;
    }
    
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    
    if (response.ok) {
      return await response.json() as { status: string; decision?: string; notes?: string };
    }
    
    logger.warn(`Failed to check BULI2 review status`, {
      taskId,
      status: response.status,
    });
    
    return null;
  } catch (error) {
    logger.error(`Error checking BULI2 review status`, {
      taskId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}
