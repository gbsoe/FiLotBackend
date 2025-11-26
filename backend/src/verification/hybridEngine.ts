import { computeAIScore } from './aiScoring';

export interface VerificationPathResult {
  outcome: 'auto_verified' | 'needs_manual_review';
  score: number;
}

export function determineVerificationPath(
  type: 'KTP' | 'NPWP',
  parsedResult: any
): VerificationPathResult {
  const score = computeAIScore(type, parsedResult);

  if (score >= 75) {
    return { outcome: 'auto_verified', score };
  }

  return { outcome: 'needs_manual_review', score };
}
