import { logger } from "../utils/logger";

const AI_SCORE_THRESHOLD_AUTO_APPROVE = parseInt(
  process.env.AI_SCORE_THRESHOLD_AUTO_APPROVE || "85",
  10
);
const AI_SCORE_THRESHOLD_AUTO_REJECT = parseInt(
  process.env.AI_SCORE_THRESHOLD_AUTO_REJECT || "35",
  10
);

export interface ScoringResult {
  score: number;
  decision: "auto_approve" | "auto_reject" | "needs_review";
  reasons: string[];
}

interface KTPData {
  nik?: string;
  name?: string;
  birthPlace?: string;
  birthDate?: string;
  address?: string;
  gender?: string;
  religion?: string;
  maritalStatus?: string;
}

interface NPWPData {
  npwpNumber?: string;
  name?: string;
}

type ParsedData = KTPData | NPWPData;

function validateNIK(nik: string): { valid: boolean; reason?: string } {
  if (!nik) return { valid: false, reason: "NIK is missing" };
  if (nik.length !== 16) return { valid: false, reason: "NIK must be 16 digits" };
  if (!/^\d{16}$/.test(nik)) return { valid: false, reason: "NIK must contain only digits" };
  return { valid: true };
}

function validateNPWP(npwp: string): { valid: boolean; reason?: string } {
  if (!npwp) return { valid: false, reason: "NPWP is missing" };
  const cleaned = npwp.replace(/[\.\-]/g, "");
  if (cleaned.length !== 15) return { valid: false, reason: "NPWP must be 15 digits" };
  if (!/^\d{15}$/.test(cleaned)) return { valid: false, reason: "NPWP must contain only digits" };
  return { valid: true };
}

function calculateOCRConfidence(ocrText: string): number {
  if (!ocrText || ocrText.length < 50) return 20;
  
  const cleanChars = ocrText.replace(/[^a-zA-Z0-9\s]/g, "").length;
  const totalChars = ocrText.length;
  const cleanRatio = cleanChars / totalChars;
  
  const lineCount = ocrText.split("\n").filter((line) => line.trim().length > 5).length;
  const hasStructure = lineCount >= 3;
  
  let confidence = 50;
  confidence += cleanRatio * 30;
  if (hasStructure) confidence += 15;
  if (ocrText.length > 200) confidence += 5;
  
  return Math.min(100, Math.round(confidence));
}

function scoreKTPData(data: KTPData, ocrText: string): ScoringResult {
  const reasons: string[] = [];
  let score = 0;
  let criticalFieldsMissing = false;
  
  const nikValidation = validateNIK(data.nik || "");
  if (nikValidation.valid) {
    score += 30;
    reasons.push("NIK is valid (16 digits)");
  } else {
    reasons.push(nikValidation.reason || "NIK validation failed");
    criticalFieldsMissing = true;
  }
  
  if (data.name && data.name.length >= 3) {
    score += 20;
    reasons.push("Name is present");
  } else {
    reasons.push("Name is missing or too short");
    criticalFieldsMissing = true;
  }
  
  if (data.birthDate) {
    score += 15;
    reasons.push("Birth date is present");
  } else {
    reasons.push("Birth date is missing");
  }
  
  if (data.address && data.address.length >= 10) {
    score += 15;
    reasons.push("Address is present");
  } else {
    reasons.push("Address is missing or incomplete");
  }
  
  const ocrConfidence = calculateOCRConfidence(ocrText);
  score += Math.round(ocrConfidence * 0.2);
  reasons.push(`OCR confidence: ${ocrConfidence}%`);
  
  score = Math.min(100, Math.max(0, score));
  
  let decision: ScoringResult["decision"];
  if (criticalFieldsMissing && score < AI_SCORE_THRESHOLD_AUTO_REJECT) {
    decision = "auto_reject";
    reasons.push(`Score ${score} below rejection threshold ${AI_SCORE_THRESHOLD_AUTO_REJECT}`);
  } else if (!criticalFieldsMissing && score >= AI_SCORE_THRESHOLD_AUTO_APPROVE) {
    decision = "auto_approve";
    reasons.push(`Score ${score} meets auto-approval threshold ${AI_SCORE_THRESHOLD_AUTO_APPROVE}`);
  } else {
    decision = "needs_review";
    reasons.push(`Score ${score} requires manual review`);
  }
  
  return { score, decision, reasons };
}

function scoreNPWPData(data: NPWPData, ocrText: string): ScoringResult {
  const reasons: string[] = [];
  let score = 0;
  let criticalFieldsMissing = false;
  
  const npwpValidation = validateNPWP(data.npwpNumber || "");
  if (npwpValidation.valid) {
    score += 40;
    reasons.push("NPWP number is valid (15 digits)");
  } else {
    reasons.push(npwpValidation.reason || "NPWP validation failed");
    criticalFieldsMissing = true;
  }
  
  if (data.name && data.name.length >= 3) {
    score += 30;
    reasons.push("Name is present");
  } else {
    reasons.push("Name is missing or too short");
    criticalFieldsMissing = true;
  }
  
  const ocrConfidence = calculateOCRConfidence(ocrText);
  score += Math.round(ocrConfidence * 0.3);
  reasons.push(`OCR confidence: ${ocrConfidence}%`);
  
  score = Math.min(100, Math.max(0, score));
  
  let decision: ScoringResult["decision"];
  if (criticalFieldsMissing && score < AI_SCORE_THRESHOLD_AUTO_REJECT) {
    decision = "auto_reject";
    reasons.push(`Score ${score} below rejection threshold ${AI_SCORE_THRESHOLD_AUTO_REJECT}`);
  } else if (!criticalFieldsMissing && score >= AI_SCORE_THRESHOLD_AUTO_APPROVE) {
    decision = "auto_approve";
    reasons.push(`Score ${score} meets auto-approval threshold ${AI_SCORE_THRESHOLD_AUTO_APPROVE}`);
  } else {
    decision = "needs_review";
    reasons.push(`Score ${score} requires manual review`);
  }
  
  return { score, decision, reasons };
}

export function computeScoreAndDecision(
  parsedData: ParsedData,
  ocrText: string,
  documentType: "KTP" | "NPWP"
): ScoringResult {
  logger.info(`Computing AI score for ${documentType} document`, {
    parsedDataKeys: Object.keys(parsedData),
    ocrTextLength: ocrText?.length || 0,
  });
  
  let result: ScoringResult;
  
  if (documentType === "KTP") {
    result = scoreKTPData(parsedData as KTPData, ocrText);
  } else if (documentType === "NPWP") {
    result = scoreNPWPData(parsedData as NPWPData, ocrText);
  } else {
    result = {
      score: 0,
      decision: "needs_review",
      reasons: [`Unknown document type: ${documentType}`],
    };
  }
  
  logger.info(`AI scoring complete`, {
    documentType,
    score: result.score,
    decision: result.decision,
    reasonsCount: result.reasons.length,
  });
  
  return result;
}
