import { sendToBuli2 } from './buli2Client';
import { db } from '../db';
import { documents } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface EscalationResult {
  ticketId: string;
  status: string;
}

export async function escalateToBuli2(
  document: any,
  parsed: any,
  score: number
): Promise<EscalationResult> {
  const result = await sendToBuli2(document, parsed, score);

  await db.update(documents)
    .set({
      buli2TicketId: result.ticketId,
      verificationStatus: 'pending_manual_review',
      aiScore: score,
      aiDecision: 'needs_review'
    })
    .where(eq(documents.id, document.id));

  return result;
}
