import { EventEmitter } from "events";

export interface MockGPUOCRResult {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: Record<string, unknown>;
  score?: number;
  decision?: string;
  outcome?: string;
  error?: string;
  gpuProcessed: boolean;
  processingTimeMs?: number;
}

export interface MockGPUWorkerConfig {
  gpuAvailable: boolean;
  simulateFailure: boolean;
  failureAfterAttempts?: number;
  processingDelayMs?: number;
  forceTimeout?: boolean;
}

interface MockWorkerState {
  isRunning: boolean;
  isGPUAvailable: boolean;
  activeJobs: Map<string, Promise<MockGPUOCRResult>>;
  processedDocuments: Map<string, MockGPUOCRResult>;
  attempts: Map<string, number>;
  config: MockGPUWorkerConfig;
}

const mockState: MockWorkerState = {
  isRunning: false,
  isGPUAvailable: true,
  activeJobs: new Map(),
  processedDocuments: new Map(),
  attempts: new Map(),
  config: {
    gpuAvailable: true,
    simulateFailure: false,
    failureAfterAttempts: undefined,
    processingDelayMs: 50,
    forceTimeout: false,
  },
};

const eventEmitter = new EventEmitter();

const GPU_MAX_RETRIES = parseInt(process.env.OCR_GPU_MAX_RETRIES || "3", 10);

export function configureMockGPUWorker(config: Partial<MockGPUWorkerConfig>): void {
  mockState.config = { ...mockState.config, ...config };
  mockState.isGPUAvailable = config.gpuAvailable ?? mockState.config.gpuAvailable;
}

export function resetMockGPUWorker(): void {
  mockState.isRunning = false;
  mockState.isGPUAvailable = true;
  mockState.activeJobs.clear();
  mockState.processedDocuments.clear();
  mockState.attempts.clear();
  mockState.config = {
    gpuAvailable: true,
    simulateFailure: false,
    failureAfterAttempts: undefined,
    processingDelayMs: 50,
    forceTimeout: false,
  };
}

export function isGPUEnabled(): boolean {
  const enabled = process.env.OCR_GPU_ENABLED?.toLowerCase();
  return enabled === "true" || enabled === "1";
}

export function isGPUAutoFallbackEnabled(): boolean {
  const autoFallback = process.env.OCR_GPU_AUTOFALLBACK?.toLowerCase();
  return autoFallback !== "false";
}

export async function checkGPUAvailability(): Promise<boolean> {
  return mockState.isGPUAvailable && mockState.config.gpuAvailable;
}

async function simulateGPUProcessing(documentId: string): Promise<MockGPUOCRResult> {
  const startTime = Date.now();
  const attempts = mockState.attempts.get(documentId) || 0;
  mockState.attempts.set(documentId, attempts + 1);
  
  const delay = mockState.config.processingDelayMs || 50;
  await new Promise((resolve) => setTimeout(resolve, delay));
  
  if (mockState.config.forceTimeout) {
    throw new Error("GPU processing timeout");
  }
  
  const shouldFail = mockState.config.simulateFailure || 
    (mockState.config.failureAfterAttempts !== undefined && 
     attempts < mockState.config.failureAfterAttempts);
  
  if (shouldFail) {
    return {
      success: false,
      documentId,
      error: "Simulated GPU processing failure",
      gpuProcessed: false,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  if (!mockState.isGPUAvailable) {
    if (isGPUAutoFallbackEnabled()) {
      return simulateCPUFallback(documentId, startTime);
    }
    return {
      success: false,
      documentId,
      error: "GPU not available and fallback disabled",
      gpuProcessed: false,
      processingTimeMs: Date.now() - startTime,
    };
  }
  
  const mockOCRText = generateMockOCRText(documentId);
  const mockParsedResult = generateMockParsedResult(documentId);
  const mockScore = Math.floor(Math.random() * 30) + 70;
  const mockDecision = mockScore >= 85 ? "auto_approve" : "needs_review";
  const mockOutcome = mockScore >= 75 ? "auto_approved" : "pending_manual_review";
  
  const result: MockGPUOCRResult = {
    success: true,
    documentId,
    ocrText: mockOCRText,
    parsedResult: mockParsedResult,
    score: mockScore,
    decision: mockDecision,
    outcome: mockOutcome,
    gpuProcessed: true,
    processingTimeMs: Date.now() - startTime,
  };
  
  mockState.processedDocuments.set(documentId, result);
  return result;
}

function simulateCPUFallback(documentId: string, startTime: number): MockGPUOCRResult {
  const mockOCRText = generateMockOCRText(documentId);
  const mockParsedResult = generateMockParsedResult(documentId);
  const mockScore = Math.floor(Math.random() * 30) + 70;
  const mockDecision = mockScore >= 85 ? "auto_approve" : "needs_review";
  const mockOutcome = mockScore >= 75 ? "auto_approved" : "pending_manual_review";
  
  return {
    success: true,
    documentId,
    ocrText: mockOCRText,
    parsedResult: mockParsedResult,
    score: mockScore,
    decision: mockDecision,
    outcome: mockOutcome,
    gpuProcessed: false,
    processingTimeMs: Date.now() - startTime,
  };
}

function generateMockOCRText(documentId: string): string {
  const isKTP = documentId.includes("KTP") || Math.random() > 0.5;
  
  if (isKTP) {
    return `
REPUBLIK INDONESIA
PROVINSI DKI JAKARTA
KARTU TANDA PENDUDUK

NIK: 3174051234560001
Nama: JOHN DOE TESTING
Tempat/Tgl Lahir: JAKARTA, 01-01-1990
Jenis Kelamin: LAKI-LAKI
Alamat: JL. TEST NO. 123
RT/RW: 001/002
Kel/Desa: TESTVILLE
Kecamatan: TEST DISTRICT
Agama: ISLAM
Status Perkawinan: BELUM KAWIN
Pekerjaan: KARYAWAN SWASTA
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP
    `.trim();
  }
  
  return `
KEMENTERIAN KEUANGAN REPUBLIK INDONESIA
DIREKTORAT JENDERAL PAJAK

NPWP: 01.234.567.8-901.000
Nama: JOHN DOE TESTING
NIK: 3174051234560001
Alamat: JL. TEST NO. 123, JAKARTA
    `.trim();
}

function generateMockParsedResult(documentId: string): Record<string, unknown> {
  const isKTP = documentId.includes("KTP") || Math.random() > 0.5;
  
  if (isKTP) {
    return {
      nik: "3174051234560001",
      nama: "JOHN DOE TESTING",
      tempatLahir: "JAKARTA",
      tanggalLahir: "01-01-1990",
      jenisKelamin: "LAKI-LAKI",
      alamat: "JL. TEST NO. 123",
      rtRw: "001/002",
      kelDesa: "TESTVILLE",
      kecamatan: "TEST DISTRICT",
      agama: "ISLAM",
      statusPerkawinan: "BELUM KAWIN",
      pekerjaan: "KARYAWAN SWASTA",
      kewarganegaraan: "WNI",
      berlakuHingga: "SEUMUR HIDUP",
      documentType: "KTP",
    };
  }
  
  return {
    npwp: "01.234.567.8-901.000",
    nama: "JOHN DOE TESTING",
    nik: "3174051234560001",
    alamat: "JL. TEST NO. 123, JAKARTA",
    documentType: "NPWP",
  };
}

export async function processDocumentGPU(documentId: string): Promise<MockGPUOCRResult> {
  const jobPromise = simulateGPUProcessing(documentId);
  mockState.activeJobs.set(documentId, jobPromise);
  
  try {
    const result = await jobPromise;
    return result;
  } finally {
    mockState.activeJobs.delete(documentId);
  }
}

export async function enqueueForGPU(documentId: string): Promise<boolean> {
  if (!mockState.isRunning) {
    return false;
  }
  
  mockState.attempts.set(documentId, 0);
  eventEmitter.emit("enqueue", documentId);
  return true;
}

export async function startGPUWorker(): Promise<boolean> {
  if (mockState.isRunning) {
    return true;
  }
  
  mockState.isGPUAvailable = await checkGPUAvailability();
  
  if (!mockState.isGPUAvailable && !isGPUAutoFallbackEnabled()) {
    return false;
  }
  
  mockState.isRunning = true;
  eventEmitter.emit("started");
  return true;
}

export async function stopGPUWorker(): Promise<void> {
  if (!mockState.isRunning) {
    return;
  }
  
  await Promise.all(Array.from(mockState.activeJobs.values()));
  
  mockState.isRunning = false;
  mockState.activeJobs.clear();
  eventEmitter.emit("stopped");
}

export async function getGPUWorkerStatus(): Promise<{
  isRunning: boolean;
  isGPUAvailable: boolean;
  isGPUEnabled: boolean;
  activeJobsCount: number;
  queueLength: number;
  processingCount: number;
  autoFallbackEnabled: boolean;
  maxRetries: number;
}> {
  return {
    isRunning: mockState.isRunning,
    isGPUAvailable: mockState.isGPUAvailable,
    isGPUEnabled: isGPUEnabled(),
    activeJobsCount: mockState.activeJobs.size,
    queueLength: 0,
    processingCount: mockState.activeJobs.size,
    autoFallbackEnabled: isGPUAutoFallbackEnabled(),
    maxRetries: GPU_MAX_RETRIES,
  };
}

export async function getGPUQueueLength(): Promise<number> {
  return 0;
}

export async function getGPUProcessingCount(): Promise<number> {
  return mockState.activeJobs.size;
}

export function getAttempts(documentId: string): number {
  return mockState.attempts.get(documentId) || 0;
}

export function getProcessedDocument(documentId: string): MockGPUOCRResult | undefined {
  return mockState.processedDocuments.get(documentId);
}

export function onEvent(event: string, callback: (...args: unknown[]) => void): void {
  eventEmitter.on(event, callback);
}

export function offEvent(event: string, callback: (...args: unknown[]) => void): void {
  eventEmitter.off(event, callback);
}

export const mockGPUWorker = {
  configureMockGPUWorker,
  resetMockGPUWorker,
  isGPUEnabled,
  isGPUAutoFallbackEnabled,
  checkGPUAvailability,
  processDocumentGPU,
  enqueueForGPU,
  startGPUWorker,
  stopGPUWorker,
  getGPUWorkerStatus,
  getGPUQueueLength,
  getGPUProcessingCount,
  getAttempts,
  getProcessedDocument,
  onEvent,
  offEvent,
};

export default mockGPUWorker;
