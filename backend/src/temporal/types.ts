export interface OCRWorkflowInput {
  documentId: string;
  userId?: string;
}

export interface OCRWorkflowOutput {
  success: boolean;
  documentId: string;
  status: "completed" | "failed";
  parsedData?: Record<string, unknown>;
  error?: string;
  completedAt: string;
}

export interface DownloadFromR2Input {
  documentId: string;
  r2Key: string;
}

export interface DownloadFromR2Output {
  success: boolean;
  localPath?: string;
  error?: string;
}

export interface RunOCRInput {
  documentId: string;
  localPath: string;
  documentType: "KTP" | "NPWP" | "UNKNOWN";
}

export interface RunOCROutput {
  success: boolean;
  rawText?: string;
  error?: string;
}

export interface ParseDocumentInput {
  documentId: string;
  rawText: string;
  documentType: "KTP" | "NPWP" | "UNKNOWN";
}

export interface ParseDocumentOutput {
  success: boolean;
  parsedData?: Record<string, unknown>;
  error?: string;
}

export interface SaveResultInput {
  documentId: string;
  parsedData: Record<string, unknown>;
  rawText: string;
  status: "completed" | "failed";
}

export interface SaveResultOutput {
  success: boolean;
  error?: string;
}

export const FILOT_OCR_WORKFLOW = "filot.ocrs.workflow";
export const FILOT_OCR_TASK_QUEUE = "filot-ocr";

export const ACTIVITY_NAMES = {
  downloadFromR2: "downloadFromR2",
  runOCR: "runOCR",
  parse: "parse",
  saveResult: "saveResult",
} as const;

export const WORKFLOW_TIMEOUTS = {
  executionTimeout: "30m",
  runTimeout: "15m",
  taskTimeout: "5m",
};

export const ACTIVITY_TIMEOUTS = {
  downloadFromR2: "2m",
  runOCR: "10m",
  parse: "1m",
  saveResult: "1m",
};

export const RETRY_POLICIES = {
  default: {
    maximumAttempts: 3,
    initialInterval: "1s",
    maximumInterval: "1m",
    backoffCoefficient: 2,
  },
  downloadFromR2: {
    maximumAttempts: 5,
    initialInterval: "2s",
    maximumInterval: "2m",
    backoffCoefficient: 2,
  },
  runOCR: {
    maximumAttempts: 3,
    initialInterval: "5s",
    maximumInterval: "5m",
    backoffCoefficient: 2,
  },
};
