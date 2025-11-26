import { computeAIScore } from './aiScoring';

export interface VerificationPathResult {
  outcome: 'auto_approved' | 'pending_manual_review';
  score: number;
  decision: 'auto_approve' | 'needs_review';
}

export function determineVerificationPath(
  type: 'KTP' | 'NPWP',
  parsedResult: any
): VerificationPathResult {
  const score = computeAIScore(type, parsedResult);

  if (score >= 75) {
    return { outcome: 'auto_approved', score, decision: 'auto_approve' };
  }

  return { outcome: 'pending_manual_review', score, decision: 'needs_review' };
}
