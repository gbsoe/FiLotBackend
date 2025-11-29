import { sendToBuli2, Buli2Document, Buli2ParsedData, Buli2SendResult } from './buli2Client';
import { db } from '../db';
import { documents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface EscalationResult {
  ticketId: string;
  status: string;
}

export interface EscalationDocument {
  id: string;
  userId?: string;
  type: string;
  r2Key?: string;
  originalFilename?: string;
}

export interface EscalationOptions {
  ocrText?: string;
  correlationId?: string;
  callbackUrl?: string;
}

export async function escalateToBuli2(
  document: EscalationDocument,
  parsed: Buli2ParsedData,
  score: number,
  options?: EscalationOptions
): Promise<EscalationResult> {
  const startTime = Date.now();
  const correlationId = options?.correlationId || `esc-${document.id}-${Date.now()}`;

  logger.info('BULI2: Escalating document for manual review', {
    documentId: document.id,
    documentType: document.type,
    aiScore: score,
    correlationId,
  });

  const buli2Doc: Buli2Document = {
    id: document.id,
    userId: document.userId,
    type: document.type,
    r2Key: document.r2Key,
    originalFilename: document.originalFilename,
  };

  const result: Buli2SendResult = await sendToBuli2(buli2Doc, parsed, score, {
    ocrText: options?.ocrText,
    correlationId,
    callbackUrl: options?.callbackUrl,
  });

  await db.update(documents)
    .set({
      buli2TicketId: result.ticketId,
      verificationStatus: 'pending_manual_review',
      aiScore: score,
      aiDecision: 'needs_review'
    })
    .where(eq(documents.id, document.id));

  const responseTime = Date.now() - startTime;

  logger.info('BULI2: Document escalated successfully', {
    documentId: document.id,
    ticketId: result.ticketId,
    status: result.status,
    correlationId,
    responseTimeMs: responseTime,
  });

  return {
    ticketId: result.ticketId,
    status: result.status,
  };
}

export async function cancelEscalation(
  documentId: string,
  ticketId: string,
  reason?: string,
  correlationId?: string
): Promise<boolean> {
  const startTime = Date.now();
  const { cancelReview } = await import('./buli2Client');

  logger.info('BULI2: Cancelling escalation', {
    documentId,
    ticketId,
    reason,
    correlationId,
  });

  const cancelled = await cancelReview(ticketId, reason, correlationId);

  if (cancelled) {
    await db.update(documents)
      .set({
        verificationStatus: 'escalation_cancelled',
      })
      .where(eq(documents.id, documentId));

    const responseTime = Date.now() - startTime;

    logger.info('BULI2: Escalation cancelled successfully', {
      documentId,
      ticketId,
      correlationId,
      responseTimeMs: responseTime,
    });
  } else {
    const responseTime = Date.now() - startTime;

    logger.warn('BULI2: Failed to cancel escalation', {
      documentId,
      ticketId,
      correlationId,
      responseTimeMs: responseTime,
    });
  }

  return cancelled;
}

export async function getEscalationStatus(
  ticketId: string,
  correlationId?: string
): Promise<{
  status: string;
  decision?: string;
  notes?: string;
} | null> {
  const { getReviewStatus } = await import('./buli2Client');
  return getReviewStatus(ticketId, correlationId);
}
