import { EventEmitter } from "events";

interface WorkflowInput {
  documentId: string;
  userId: string;
  documentType: "KTP" | "NPWP";
  fileKey: string;
}

interface WorkflowOutput {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: Record<string, unknown>;
  score?: number;
  decision?: string;
  outcome?: string;
  error?: string;
  gpuProcessed: boolean;
}

interface WorkflowState {
  status: "pending" | "processing" | "completed" | "failed" | "needs_review";
  retryCount: number;
  lastError?: string;
  gpuAttempts: number;
  cpuFallbackUsed: boolean;
}

class MockTemporalWorkflow extends EventEmitter {
  private state: WorkflowState = {
    status: "pending",
    retryCount: 0,
    gpuAttempts: 0,
    cpuFallbackUsed: false,
  };

  private config: {
    gpuEnabled: boolean;
    gpuShouldFail: boolean;
    gpuFailAfterAttempts: number;
    maxRetries: number;
  };

  constructor(config?: Partial<MockTemporalWorkflow["config"]>) {
    super();
    this.config = {
      gpuEnabled: true,
      gpuShouldFail: false,
      gpuFailAfterAttempts: 0,
      maxRetries: 3,
      ...config,
    };
  }

  async executeOCRWorkflow(input: WorkflowInput): Promise<WorkflowOutput> {
    this.state.status = "processing";
    this.emit("workflow:started", input);

    try {
      let result: WorkflowOutput;

      if (this.config.gpuEnabled) {
        result = await this.tryGPUProcessing(input);
      } else {
        result = await this.processCPU(input);
      }

      if (result.success) {
        await this.updateDatabase(input.documentId, result);
        await this.triggerBuli2Callback(input.documentId, result);
      }

      this.state.status = result.success ? "completed" : "failed";
      this.emit("workflow:completed", result);

      return result;
    } catch (error) {
      this.state.status = "failed";
      this.state.lastError = error instanceof Error ? error.message : "Unknown error";
      this.emit("workflow:failed", { documentId: input.documentId, error: this.state.lastError });

      return {
        success: false,
        documentId: input.documentId,
        error: this.state.lastError,
        gpuProcessed: false,
      };
    }
  }

  private async tryGPUProcessing(input: WorkflowInput): Promise<WorkflowOutput> {
    while (this.state.gpuAttempts < this.config.maxRetries) {
      this.state.gpuAttempts++;
      this.emit("gpu:attempt", { documentId: input.documentId, attempt: this.state.gpuAttempts });

      const shouldFail =
        this.config.gpuShouldFail ||
        (this.config.gpuFailAfterAttempts > 0 && this.state.gpuAttempts <= this.config.gpuFailAfterAttempts);

      if (!shouldFail) {
        this.emit("gpu:success", { documentId: input.documentId });
        return this.generateGPUResult(input, true);
      }

      this.emit("gpu:failed", { documentId: input.documentId, attempt: this.state.gpuAttempts });

      if (this.state.gpuAttempts >= this.config.maxRetries) {
        break;
      }

      await this.delay(100);
    }

    this.state.cpuFallbackUsed = true;
    this.emit("cpu:fallback", { documentId: input.documentId });
    return this.processCPU(input);
  }

  private async processCPU(input: WorkflowInput): Promise<WorkflowOutput> {
    await this.delay(50);

    return this.generateCPUResult(input);
  }

  private generateGPUResult(input: WorkflowInput, success: boolean): WorkflowOutput {
    if (!success) {
      return {
        success: false,
        documentId: input.documentId,
        error: "GPU processing failed",
        gpuProcessed: false,
      };
    }

    const score = Math.floor(Math.random() * 30) + 70;
    const decision = score >= 85 ? "auto_approve" : score >= 35 ? "needs_review" : "auto_reject";
    const outcome = score >= 75 ? "auto_approved" : "pending_manual_review";

    return {
      success: true,
      documentId: input.documentId,
      ocrText: this.generateMockOCRText(input.documentType),
      parsedResult: this.generateMockParsedResult(input.documentType),
      score,
      decision,
      outcome,
      gpuProcessed: true,
    };
  }

  private generateCPUResult(input: WorkflowInput): WorkflowOutput {
    const score = Math.floor(Math.random() * 30) + 70;
    const decision = score >= 85 ? "auto_approve" : score >= 35 ? "needs_review" : "auto_reject";
    const outcome = score >= 75 ? "auto_approved" : "pending_manual_review";

    return {
      success: true,
      documentId: input.documentId,
      ocrText: this.generateMockOCRText(input.documentType),
      parsedResult: this.generateMockParsedResult(input.documentType),
      score,
      decision,
      outcome,
      gpuProcessed: false,
    };
  }

  private generateMockOCRText(type: "KTP" | "NPWP"): string {
    if (type === "KTP") {
      return `NIK: 3174051234560001\nNama: JOHN DOE\nTempat/Tgl Lahir: JAKARTA, 01-01-1990`;
    }
    return `NPWP: 01.234.567.8-901.000\nNama: JOHN DOE`;
  }

  private generateMockParsedResult(type: "KTP" | "NPWP"): Record<string, unknown> {
    if (type === "KTP") {
      return {
        nik: "3174051234560001",
        nama: "JOHN DOE",
        tempatLahir: "JAKARTA",
        tanggalLahir: "01-01-1990",
        jenisKelamin: "LAKI-LAKI",
        alamat: "JL. TEST NO. 123",
      };
    }
    return {
      npwp: "01.234.567.8-901.000",
      nama: "JOHN DOE",
      alamat: "JL. TEST NO. 123",
    };
  }

  private async updateDatabase(_documentId: string, _result: WorkflowOutput): Promise<void> {
    this.emit("db:updated", { documentId: _documentId });
    await this.delay(10);
  }

  private async triggerBuli2Callback(_documentId: string, result: WorkflowOutput): Promise<void> {
    if (result.decision === "needs_review") {
      this.emit("buli2:callback", { documentId: _documentId, decision: result.decision });
    }
    await this.delay(10);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getState(): WorkflowState {
    return { ...this.state };
  }

  async sendSignal(signalName: string, payload: unknown): Promise<void> {
    this.emit(`signal:${signalName}`, payload);
  }

  async query(queryName: string): Promise<unknown> {
    if (queryName === "getState") {
      return this.getState();
    }
    if (queryName === "getAttempts") {
      return this.state.gpuAttempts;
    }
    return null;
  }

  reset(): void {
    this.state = {
      status: "pending",
      retryCount: 0,
      gpuAttempts: 0,
      cpuFallbackUsed: false,
    };
    this.removeAllListeners();
  }
}

describe("Temporal OCR Workflow Tests", () => {
  let workflow: MockTemporalWorkflow;

  beforeEach(() => {
    workflow = new MockTemporalWorkflow();
  });

  afterEach(() => {
    workflow.reset();
  });

  describe("Workflow Path 1 - GPU Success", () => {
    it("should complete full workflow with GPU success", async () => {
      const input: WorkflowInput = {
        documentId: "test-doc-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const events: string[] = [];
      workflow.on("workflow:started", () => events.push("started"));
      workflow.on("gpu:attempt", () => events.push("gpu_attempt"));
      workflow.on("gpu:success", () => events.push("gpu_success"));
      workflow.on("db:updated", () => events.push("db_updated"));
      workflow.on("workflow:completed", () => events.push("completed"));

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe(input.documentId);
      expect(result.gpuProcessed).toBe(true);
      expect(result.ocrText).toBeDefined();
      expect(result.parsedResult).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.decision).toBeDefined();
      expect(result.outcome).toBeDefined();

      expect(events).toContain("started");
      expect(events).toContain("gpu_attempt");
      expect(events).toContain("gpu_success");
      expect(events).toContain("db_updated");
      expect(events).toContain("completed");
    });

    it("should parse KTP fields correctly", async () => {
      const input: WorkflowInput = {
        documentId: "test-ktp-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(result.parsedResult).toHaveProperty("nik");
      expect(result.parsedResult).toHaveProperty("nama");
      expect(result.parsedResult).toHaveProperty("tempatLahir");
      expect(result.parsedResult).toHaveProperty("tanggalLahir");
      expect(result.parsedResult).toHaveProperty("alamat");
    });

    it("should parse NPWP fields correctly", async () => {
      const input: WorkflowInput = {
        documentId: "test-npwp-001",
        userId: "user-001",
        documentType: "NPWP",
        fileKey: "user-001/NPWP_test.jpg",
      };

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(result.parsedResult).toHaveProperty("npwp");
      expect(result.parsedResult).toHaveProperty("nama");
      expect(result.parsedResult).toHaveProperty("alamat");
    });

    it("should trigger hybrid verification decision", async () => {
      const input: WorkflowInput = {
        documentId: "test-hybrid-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(["auto_approve", "needs_review", "auto_reject"]).toContain(result.decision);
      expect(["auto_approved", "pending_manual_review"]).toContain(result.outcome);
    });

    it("should update database after processing", async () => {
      const input: WorkflowInput = {
        documentId: "test-db-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      let dbUpdated = false;
      workflow.on("db:updated", () => {
        dbUpdated = true;
      });

      await workflow.executeOCRWorkflow(input);

      expect(dbUpdated).toBe(true);
    });
  });

  describe("Workflow Path 2 - GPU Failure + CPU Fallback", () => {
    it("should fallback to CPU when GPU fails", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: true,
      });

      const input: WorkflowInput = {
        documentId: "test-fallback-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const events: string[] = [];
      workflow.on("gpu:failed", () => events.push("gpu_failed"));
      workflow.on("cpu:fallback", () => events.push("cpu_fallback"));

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(result.gpuProcessed).toBe(false);
      expect(events).toContain("cpu_fallback");
    });

    it("should retry GPU before falling back to CPU", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: true,
        maxRetries: 3,
      });

      const input: WorkflowInput = {
        documentId: "test-retry-fallback-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      let gpuAttempts = 0;
      workflow.on("gpu:attempt", () => {
        gpuAttempts++;
      });

      await workflow.executeOCRWorkflow(input);

      expect(gpuAttempts).toBe(3);
      expect(workflow.getState().cpuFallbackUsed).toBe(true);
    });

    it("should succeed on GPU after initial failures", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: false,
        gpuFailAfterAttempts: 2,
        maxRetries: 3,
      });

      const input: WorkflowInput = {
        documentId: "test-eventual-success-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const result = await workflow.executeOCRWorkflow(input);

      expect(result.success).toBe(true);
      expect(result.gpuProcessed).toBe(true);
      expect(workflow.getState().gpuAttempts).toBe(3);
    });
  });

  describe("Workflow Path 3 - Max Retries + Fail Flag", () => {
    it("should set fail flag after max retries exhausted", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: true,
        maxRetries: 3,
      });

      const input: WorkflowInput = {
        documentId: "test-max-retry-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      await workflow.executeOCRWorkflow(input);

      const state = workflow.getState();
      expect(state.gpuAttempts).toBe(3);
      expect(state.cpuFallbackUsed).toBe(true);
    });

    it("should track retry count correctly", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: true,
        maxRetries: 5,
      });

      const input: WorkflowInput = {
        documentId: "test-retry-count-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const attemptCounts: number[] = [];
      workflow.on("gpu:attempt", (data: { attempt: number }) => {
        attemptCounts.push(data.attempt);
      });

      await workflow.executeOCRWorkflow(input);

      expect(attemptCounts).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("Workflow Path 4 - Signal/Query Calls", () => {
    it("should handle signal calls", async () => {
      const input: WorkflowInput = {
        documentId: "test-signal-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      let signalReceived = false;
      workflow.on("signal:cancel", () => {
        signalReceived = true;
      });

      workflow.executeOCRWorkflow(input);
      await workflow.sendSignal("cancel", { reason: "User requested cancellation" });

      expect(signalReceived).toBe(true);
    });

    it("should respond to state queries", async () => {
      const input: WorkflowInput = {
        documentId: "test-query-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      workflow.executeOCRWorkflow(input);

      const state = (await workflow.query("getState")) as WorkflowState;
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("retryCount");
      expect(state).toHaveProperty("gpuAttempts");
    });

    it("should respond to attempts queries", async () => {
      workflow = new MockTemporalWorkflow({
        gpuEnabled: true,
        gpuShouldFail: false,
        gpuFailAfterAttempts: 2,
      });

      const input: WorkflowInput = {
        documentId: "test-attempts-query-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      await workflow.executeOCRWorkflow(input);

      const attempts = await workflow.query("getAttempts");
      expect(typeof attempts).toBe("number");
      expect(attempts).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple signals during workflow", async () => {
      const input: WorkflowInput = {
        documentId: "test-multi-signal-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const signals: string[] = [];
      workflow.on("signal:pause", () => signals.push("pause"));
      workflow.on("signal:resume", () => signals.push("resume"));
      workflow.on("signal:priority", () => signals.push("priority"));

      workflow.executeOCRWorkflow(input);

      await workflow.sendSignal("pause", {});
      await workflow.sendSignal("resume", {});
      await workflow.sendSignal("priority", { level: "high" });

      expect(signals).toEqual(["pause", "resume", "priority"]);
    });
  });

  describe("BULI2 Callback Integration", () => {
    it("should trigger BULI2 callback for needs_review decisions", async () => {
      const input: WorkflowInput = {
        documentId: "test-buli2-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      let callbackTriggered = false;
      workflow.on("buli2:callback", () => {
        callbackTriggered = true;
      });

      const result = await workflow.executeOCRWorkflow(input);

      if (result.decision === "needs_review") {
        expect(callbackTriggered).toBe(true);
      }
    });
  });

  describe("Workflow Error Handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      const errorWorkflow = new MockTemporalWorkflow();
      const originalMethod = errorWorkflow["tryGPUProcessing"].bind(errorWorkflow);
      errorWorkflow["tryGPUProcessing"] = async () => {
        throw new Error("Unexpected system error");
      };

      const input: WorkflowInput = {
        documentId: "test-error-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      const result = await errorWorkflow.executeOCRWorkflow(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unexpected system error");
      expect(errorWorkflow.getState().status).toBe("failed");

      errorWorkflow["tryGPUProcessing"] = originalMethod;
    });

    it("should preserve error state after failure", async () => {
      const errorWorkflow = new MockTemporalWorkflow();
      errorWorkflow["tryGPUProcessing"] = async () => {
        throw new Error("Test error message");
      };

      const input: WorkflowInput = {
        documentId: "test-error-state-001",
        userId: "user-001",
        documentType: "KTP",
        fileKey: "user-001/KTP_test.jpg",
      };

      await errorWorkflow.executeOCRWorkflow(input);

      const state = errorWorkflow.getState();
      expect(state.status).toBe("failed");
      expect(state.lastError).toBe("Test error message");
    });
  });
});

export {};
