import { EventEmitter } from "events";

interface ECSJobPayload {
  documentId: string;
  userId: string;
  documentType: "KTP" | "NPWP";
  fileKey: string;
  attempts: number;
}

interface MockR2File {
  key: string;
  buffer: Buffer;
  contentType: string;
}

interface GPUProcessingResult {
  success: boolean;
  ocrText?: string;
  error?: string;
  processingTimeMs: number;
  gpuUtilization?: number;
}

interface ParsedDocument {
  type: "KTP" | "NPWP";
  fields: Record<string, string>;
  confidence: number;
}

interface ScoringResult {
  score: number;
  decision: "auto_approve" | "needs_review" | "auto_reject";
  reasons: string[];
}

interface HybridVerificationResult {
  outcome: "auto_approved" | "pending_manual_review" | "auto_rejected";
  requiresManualReview: boolean;
  escalationReason?: string;
}

interface WorkflowResult {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: Record<string, unknown>;
  score?: number;
  decision?: string;
  outcome?: string;
  buli2CallbackSent?: boolean;
  error?: string;
}

const eventBus = new EventEmitter();

class MockRedisQueue {
  private queue: ECSJobPayload[] = [];
  private processing = new Set<string>();
  private attempts = new Map<string, number>();
  private resultsChannel: ((result: WorkflowResult) => void)[] = [];

  async enqueue(payload: ECSJobPayload): Promise<void> {
    this.queue.push(payload);
    this.attempts.set(payload.documentId, payload.attempts);
    eventBus.emit("redis:enqueued", { documentId: payload.documentId });
    console.log(`[Redis] Enqueued document: ${payload.documentId}`);
  }

  async dequeue(): Promise<ECSJobPayload | null> {
    const job = this.queue.shift() || null;
    if (job) {
      this.processing.add(job.documentId);
      eventBus.emit("redis:dequeued", { documentId: job.documentId });
      console.log(`[Redis] Dequeued document: ${job.documentId}`);
    }
    return job;
  }

  async markComplete(documentId: string): Promise<void> {
    this.processing.delete(documentId);
    this.attempts.delete(documentId);
    eventBus.emit("redis:completed", { documentId });
    console.log(`[Redis] Marked complete: ${documentId}`);
  }

  async publishResult(result: WorkflowResult): Promise<void> {
    this.resultsChannel.forEach((handler) => handler(result));
    eventBus.emit("redis:published", result);
    console.log(`[Redis] Published result for: ${result.documentId}`);
  }

  subscribe(handler: (result: WorkflowResult) => void): void {
    this.resultsChannel.push(handler);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }
}

class MockR2Storage {
  private files = new Map<string, MockR2File>();

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    this.files.set(key, { key, buffer, contentType });
    eventBus.emit("r2:uploaded", { key, size: buffer.length });
    console.log(`[R2] Uploaded file: ${key} (${buffer.length} bytes)`);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) {
      throw new Error(`[R2] File not found: ${key}`);
    }
    eventBus.emit("r2:downloaded", { key });
    console.log(`[R2] Downloaded file: ${key}`);
    return file.buffer;
  }

  addMockFile(key: string, content: string = "mock-image-content"): void {
    this.files.set(key, {
      key,
      buffer: Buffer.from(content),
      contentType: "image/jpeg",
    });
  }
}

class MockDatabase {
  private documents = new Map<
    string,
    {
      id: string;
      userId: string;
      type: string;
      status: string;
      ocrText?: string;
      resultJson?: Record<string, unknown>;
      aiScore?: number;
      aiDecision?: string;
      verificationStatus?: string;
    }
  >();

  async update(
    documentId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const existing = this.documents.get(documentId) || {
      id: documentId,
      userId: "",
      type: "",
      status: "uploaded",
    };
    this.documents.set(documentId, { ...existing, ...updates } as any);
    eventBus.emit("db:updated", { documentId, updates });
    console.log(`[Database] Updated document: ${documentId}`);
  }

  async find(documentId: string): Promise<Record<string, unknown> | null> {
    return this.documents.get(documentId) || null;
  }

  addMockDocument(doc: { id: string; userId: string; type: string }): void {
    this.documents.set(doc.id, { ...doc, status: "uploaded" });
  }
}

class MockGPUProcessor {
  private gpuAvailable: boolean = true;
  private shouldFail: boolean = false;
  private failureCount: number = 0;

  setGPUAvailable(available: boolean): void {
    this.gpuAvailable = available;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async processImage(
    imageBuffer: Buffer,
    documentType: "KTP" | "NPWP"
  ): Promise<GPUProcessingResult> {
    const startTime = Date.now();

    await this.simulateProcessingDelay();

    if (this.shouldFail) {
      this.failureCount++;
      eventBus.emit("gpu:failed", { failureCount: this.failureCount });
      console.log(`[GPU] Processing failed (attempt ${this.failureCount})`);
      return {
        success: false,
        error: "Simulated GPU failure",
        processingTimeMs: Date.now() - startTime,
      };
    }

    if (!this.gpuAvailable) {
      console.log(`[GPU] GPU not available, processing with CPU fallback`);
      return this.processCPUFallback(imageBuffer, documentType, startTime);
    }

    const ocrText = this.generateOCRText(documentType);
    const processingTimeMs = Date.now() - startTime;

    eventBus.emit("gpu:success", { processingTimeMs });
    console.log(`[GPU] Processing successful in ${processingTimeMs}ms`);

    return {
      success: true,
      ocrText,
      processingTimeMs,
      gpuUtilization: 85 + Math.random() * 10,
    };
  }

  private async processCPUFallback(
    _imageBuffer: Buffer,
    documentType: "KTP" | "NPWP",
    startTime: number
  ): Promise<GPUProcessingResult> {
    await this.simulateProcessingDelay(200);

    return {
      success: true,
      ocrText: this.generateOCRText(documentType),
      processingTimeMs: Date.now() - startTime,
    };
  }

  private async simulateProcessingDelay(ms: number = 100): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateOCRText(type: "KTP" | "NPWP"): string {
    if (type === "KTP") {
      return `
NIK: 3174051234560001
Nama: JOHN DOE SIMULATION
Tempat/Tgl Lahir: JAKARTA, 01-01-1990
Jenis Kelamin: LAKI-LAKI
Alamat: JL. SIMULATION NO. 123
RT/RW: 001/002
Kel/Desa: SIMVILLE
Kecamatan: SIM DISTRICT
      `.trim();
    }

    return `
NPWP: 01.234.567.8-901.000
Nama: JOHN DOE SIMULATION
NIK: 3174051234560001
Alamat: JL. SIMULATION NO. 123, JAKARTA
    `.trim();
  }
}

class MockParser {
  parse(ocrText: string, type: "KTP" | "NPWP"): ParsedDocument {
    const fields: Record<string, string> = {};
    const lines = ocrText.split("\n").map((l) => l.trim());

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/[\/\s]/g, "_");
        const value = line.substring(colonIndex + 1).trim();
        fields[key] = value;
      }
    }

    console.log(`[Parser] Parsed ${Object.keys(fields).length} fields from ${type} document`);

    return {
      type,
      fields,
      confidence: 0.85 + Math.random() * 0.1,
    };
  }
}

class MockScoringEngine {
  score(parsed: ParsedDocument): ScoringResult {
    let score = 0;
    const reasons: string[] = [];

    if (parsed.type === "KTP") {
      if (parsed.fields.nik && /^\d{16}$/.test(parsed.fields.nik)) {
        score += 25;
        reasons.push("Valid NIK format");
      }
      if (parsed.fields.nama && parsed.fields.nama.length > 3) {
        score += 20;
        reasons.push("Name field present");
      }
      if (parsed.fields.tempat_tgl_lahir) {
        score += 15;
        reasons.push("Birth info present");
      }
      if (parsed.fields.alamat) {
        score += 15;
        reasons.push("Address present");
      }
      if (parsed.fields.jenis_kelamin) {
        score += 10;
        reasons.push("Gender present");
      }
      if (parsed.confidence > 0.8) {
        score += 15;
        reasons.push("High OCR confidence");
      }
    } else {
      if (parsed.fields.npwp && /^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/.test(parsed.fields.npwp)) {
        score += 40;
        reasons.push("Valid NPWP format");
      }
      if (parsed.fields.nama && parsed.fields.nama.length > 3) {
        score += 30;
        reasons.push("Name field present");
      }
      if (parsed.fields.alamat) {
        score += 20;
        reasons.push("Address present");
      }
      if (parsed.confidence > 0.8) {
        score += 10;
        reasons.push("High OCR confidence");
      }
    }

    let decision: ScoringResult["decision"];
    if (score >= 85) {
      decision = "auto_approve";
      reasons.push(`Score ${score} meets auto-approval threshold`);
    } else if (score < 35) {
      decision = "auto_reject";
      reasons.push(`Score ${score} below rejection threshold`);
    } else {
      decision = "needs_review";
      reasons.push(`Score ${score} requires manual review`);
    }

    console.log(`[Scoring] Score: ${score}, Decision: ${decision}`);

    return { score, decision, reasons };
  }
}

class MockHybridVerification {
  verify(scoringResult: ScoringResult): HybridVerificationResult {
    let outcome: HybridVerificationResult["outcome"];
    let requiresManualReview = false;
    let escalationReason: string | undefined;

    switch (scoringResult.decision) {
      case "auto_approve":
        outcome = "auto_approved";
        break;
      case "auto_reject":
        outcome = "auto_rejected";
        break;
      case "needs_review":
        outcome = "pending_manual_review";
        requiresManualReview = true;
        escalationReason = "Score below auto-approval threshold";
        break;
    }

    console.log(`[HybridVerification] Outcome: ${outcome}, Manual Review: ${requiresManualReview}`);

    return { outcome, requiresManualReview, escalationReason };
  }
}

class MockTemporalWorkflow {
  async execute(
    documentId: string,
    _ocrText: string,
    _parsed: ParsedDocument,
    _scoring: ScoringResult,
    verification: HybridVerificationResult
  ): Promise<void> {
    console.log(`[Temporal] Workflow started for: ${documentId}`);
    eventBus.emit("temporal:started", { documentId });

    await new Promise((resolve) => setTimeout(resolve, 50));

    eventBus.emit("temporal:completed", {
      documentId,
      outcome: verification.outcome,
    });
    console.log(`[Temporal] Workflow completed for: ${documentId}`);
  }
}

class MockBULI2Client {
  async sendCallback(
    documentId: string,
    verification: HybridVerificationResult,
    scoring: ScoringResult
  ): Promise<boolean> {
    if (!verification.requiresManualReview) {
      console.log(`[BULI2] No callback needed for: ${documentId}`);
      return false;
    }

    console.log(`[BULI2] Sending callback for: ${documentId}`);
    eventBus.emit("buli2:callback", {
      documentId,
      decision: scoring.decision,
      score: scoring.score,
    });

    return true;
  }
}

class ECSRuntimeSimulator {
  private redisQueue: MockRedisQueue;
  private r2Storage: MockR2Storage;
  private database: MockDatabase;
  private gpuProcessor: MockGPUProcessor;
  private parser: MockParser;
  private scoringEngine: MockScoringEngine;
  private hybridVerification: MockHybridVerification;
  private temporalWorkflow: MockTemporalWorkflow;
  private buli2Client: MockBULI2Client;
  private maxRetries: number = 3;

  constructor() {
    this.redisQueue = new MockRedisQueue();
    this.r2Storage = new MockR2Storage();
    this.database = new MockDatabase();
    this.gpuProcessor = new MockGPUProcessor();
    this.parser = new MockParser();
    this.scoringEngine = new MockScoringEngine();
    this.hybridVerification = new MockHybridVerification();
    this.temporalWorkflow = new MockTemporalWorkflow();
    this.buli2Client = new MockBULI2Client();
  }

  setupTestData(): void {
    this.r2Storage.addMockFile("user-001/KTP_test-001.jpg");
    this.r2Storage.addMockFile("user-001/NPWP_test-002.jpg");

    this.database.addMockDocument({
      id: "test-001",
      userId: "user-001",
      type: "KTP",
    });
    this.database.addMockDocument({
      id: "test-002",
      userId: "user-001",
      type: "NPWP",
    });
  }

  async enqueueJob(job: ECSJobPayload): Promise<void> {
    await this.redisQueue.enqueue(job);
  }

  async processNextJob(): Promise<WorkflowResult | null> {
    const job = await this.redisQueue.dequeue();
    if (!job) {
      console.log("[ECS] No jobs in queue");
      return null;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[ECS] Processing job: ${job.documentId}`);
    console.log(`${"=".repeat(60)}`);

    try {
      console.log("\n[Step 1] Downloading document from R2...");
      const imageBuffer = await this.r2Storage.download(job.fileKey);

      console.log("\n[Step 2] Processing with GPU...");
      const gpuResult = await this.gpuProcessor.processImage(
        imageBuffer,
        job.documentType
      );

      if (!gpuResult.success) {
        if (job.attempts < this.maxRetries) {
          console.log(
            `\n[ECS] GPU failed, requeuing (attempt ${job.attempts + 1}/${this.maxRetries})`
          );
          await this.redisQueue.enqueue({ ...job, attempts: job.attempts + 1 });
          return null;
        }
        throw new Error("Max retries exceeded for GPU processing");
      }

      console.log("\n[Step 3] Parsing OCR text...");
      const parsed = this.parser.parse(gpuResult.ocrText!, job.documentType);

      console.log("\n[Step 4] Calculating score...");
      const scoring = this.scoringEngine.score(parsed);

      console.log("\n[Step 5] Running hybrid verification...");
      const verification = this.hybridVerification.verify(scoring);

      console.log("\n[Step 6] Updating database...");
      await this.database.update(job.documentId, {
        status: "completed",
        ocrText: gpuResult.ocrText,
        resultJson: parsed.fields,
        aiScore: scoring.score,
        aiDecision: scoring.decision,
        verificationStatus: verification.outcome,
      });

      console.log("\n[Step 7] Invoking Temporal workflow...");
      await this.temporalWorkflow.execute(
        job.documentId,
        gpuResult.ocrText!,
        parsed,
        scoring,
        verification
      );

      console.log("\n[Step 8] Checking BULI2 callback...");
      const buli2Sent = await this.buli2Client.sendCallback(
        job.documentId,
        verification,
        scoring
      );

      console.log("\n[Step 9] Publishing result...");
      const result: WorkflowResult = {
        success: true,
        documentId: job.documentId,
        ocrText: gpuResult.ocrText,
        parsedResult: parsed.fields,
        score: scoring.score,
        decision: scoring.decision,
        outcome: verification.outcome,
        buli2CallbackSent: buli2Sent,
      };

      await this.redisQueue.publishResult(result);

      console.log("\n[Step 10] Marking job complete...");
      await this.redisQueue.markComplete(job.documentId);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`[ECS] Job completed successfully: ${job.documentId}`);
      console.log(`Final Decision: ${verification.outcome}`);
      console.log(`Score: ${scoring.score}`);
      console.log(`${"=".repeat(60)}\n`);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[ECS] Job failed: ${job.documentId} - ${errorMessage}`);

      await this.database.update(job.documentId, {
        status: "failed",
      });

      const failResult: WorkflowResult = {
        success: false,
        documentId: job.documentId,
        error: errorMessage,
      };

      await this.redisQueue.publishResult(failResult);
      return failResult;
    }
  }

  async runSimulation(): Promise<void> {
    console.log("\n" + "=".repeat(80));
    console.log("  ECS RUNTIME SIMULATION - FiLot GPU OCR Worker");
    console.log("=".repeat(80) + "\n");

    this.setupTestData();

    console.log("[Simulation] Enqueuing test jobs...\n");

    await this.enqueueJob({
      documentId: "test-001",
      userId: "user-001",
      documentType: "KTP",
      fileKey: "user-001/KTP_test-001.jpg",
      attempts: 0,
    });

    await this.enqueueJob({
      documentId: "test-002",
      userId: "user-001",
      documentType: "NPWP",
      fileKey: "user-001/NPWP_test-002.jpg",
      attempts: 0,
    });

    console.log(`[Simulation] Queue length: ${this.redisQueue.getQueueLength()}\n`);

    const results: WorkflowResult[] = [];

    while (this.redisQueue.getQueueLength() > 0) {
      const result = await this.processNextJob();
      if (result) {
        results.push(result);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("  SIMULATION COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nProcessed ${results.length} documents:`);

    for (const result of results) {
      console.log(
        `  - ${result.documentId}: ${result.success ? "SUCCESS" : "FAILED"} (${result.outcome || result.error})`
      );
    }

    console.log("\n");
  }

  setGPUAvailable(available: boolean): void {
    this.gpuProcessor.setGPUAvailable(available);
  }

  setGPUShouldFail(fail: boolean): void {
    this.gpuProcessor.setShouldFail(fail);
  }
}

async function main(): Promise<void> {
  const simulator = new ECSRuntimeSimulator();

  console.log("\n--- Scenario 1: Normal GPU Processing ---\n");
  await simulator.runSimulation();

  console.log("\n--- Scenario 2: GPU Unavailable (CPU Fallback) ---\n");
  const cpuSimulator = new ECSRuntimeSimulator();
  cpuSimulator.setGPUAvailable(false);
  await cpuSimulator.runSimulation();

  console.log("\n--- Scenario 3: GPU Failure with Retry ---\n");
  const retrySimulator = new ECSRuntimeSimulator();
  retrySimulator.setGPUShouldFail(true);
  await retrySimulator.runSimulation();
}

main().catch(console.error);

export { ECSRuntimeSimulator, eventBus };
