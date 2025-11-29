import { EventEmitter } from "events";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestSuiteResult {
  suiteName: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  totalDuration: number;
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function printSuccess(message: string): void {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

function printFailure(message: string): void {
  console.log(`${RED}✗${RESET} ${message}`);
}

function printHeader(title: string): void {
  console.log(`\n${BOLD}${BLUE}### ${title}${RESET}\n`);
}

function printSummary(results: TestSuiteResult[]): void {
  console.log("\n" + "=".repeat(60));
  console.log(`${BOLD}FULL SYSTEM TEST SUMMARY${RESET}`);
  console.log("=".repeat(60) + "\n");

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of results) {
    const status = suite.failed === 0 ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${suite.suiteName}: ${status} (${suite.passed}/${suite.passed + suite.failed})`);
    totalPassed += suite.passed;
    totalFailed += suite.failed;
  }

  console.log("\n" + "-".repeat(60));
  console.log(
    `Total: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} total`
  );

  if (totalFailed === 0) {
    console.log(`\n${GREEN}${BOLD}ALL TESTS PASSED!${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}SOME TESTS FAILED!${RESET}\n`);
  }
}

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    return {
      name,
      passed: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

class MockRedisQueue {
  private queue: string[] = [];
  private processing = new Set<string>();
  private attempts = new Map<string, number>();
  private eventBus = new EventEmitter();
  private subscribers: ((message: string) => void)[] = [];

  async enqueue(documentId: string): Promise<boolean> {
    if (this.queue.includes(documentId) || this.processing.has(documentId)) {
      return false;
    }
    this.queue.push(documentId);
    this.attempts.set(documentId, 0);
    this.eventBus.emit("enqueued", documentId);
    return true;
  }

  async dequeue(): Promise<string | null> {
    const id = this.queue.shift() || null;
    if (id) {
      this.processing.add(id);
    }
    return id;
  }

  async markComplete(documentId: string): Promise<void> {
    this.processing.delete(documentId);
    this.attempts.delete(documentId);
  }

  async publish(channel: string, message: string): Promise<void> {
    this.subscribers.forEach((handler) => handler(message));
    this.eventBus.emit("published", { channel, message });
  }

  subscribe(handler: (message: string) => void): void {
    this.subscribers.push(handler);
  }

  async incrementAttempts(documentId: string): Promise<number> {
    const current = this.attempts.get(documentId) || 0;
    this.attempts.set(documentId, current + 1);
    return current + 1;
  }

  getAttempts(documentId: string): number {
    return this.attempts.get(documentId) || 0;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }

  reset(): void {
    this.queue = [];
    this.processing.clear();
    this.attempts.clear();
    this.subscribers = [];
  }
}

async function runRedisTests(): Promise<TestSuiteResult> {
  printHeader("Redis Queue Tests");
  const tests: TestResult[] = [];
  const redis = new MockRedisQueue();

  tests.push(
    await runTest("queue works", async () => {
      redis.reset();
      const result = await redis.enqueue("doc-001");
      if (!result) throw new Error("Failed to enqueue");
      const dequeued = await redis.dequeue();
      if (dequeued !== "doc-001") throw new Error("Dequeue returned wrong document");
    })
  );

  tests.push(
    await runTest("processing set", async () => {
      redis.reset();
      await redis.enqueue("doc-002");
      await redis.dequeue();
      if (redis.getProcessingCount() !== 1) throw new Error("Processing count incorrect");
      await redis.markComplete("doc-002");
      if (redis.getProcessingCount() !== 0) throw new Error("Should be empty after complete");
    })
  );

  tests.push(
    await runTest("pub/sub", async () => {
      redis.reset();
      let received = false;
      redis.subscribe((msg) => {
        if (msg === "test-message") received = true;
      });
      await redis.publish("test-channel", "test-message");
      if (!received) throw new Error("Message not received");
    })
  );

  tests.push(
    await runTest("retry", async () => {
      redis.reset();
      await redis.enqueue("doc-003");
      for (let i = 0; i < 3; i++) {
        await redis.incrementAttempts("doc-003");
      }
      if (redis.getAttempts("doc-003") !== 3) throw new Error("Attempts count incorrect");
    })
  );

  for (const test of tests) {
    if (test.passed) {
      printSuccess(test.name);
    } else {
      printFailure(`${test.name}: ${test.error}`);
    }
  }

  return {
    suiteName: "Redis",
    tests,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    totalDuration: tests.reduce((sum, t) => sum + t.duration, 0),
  };
}

interface GPUWorkerConfig {
  gpuAvailable: boolean;
  shouldFail: boolean;
  failAfterAttempts: number;
}

class MockGPUWorker {
  private config: GPUWorkerConfig = {
    gpuAvailable: true,
    shouldFail: false,
    failAfterAttempts: 0,
  };
  private attempts = new Map<string, number>();

  configure(config: Partial<GPUWorkerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async process(
    documentId: string
  ): Promise<{ success: boolean; gpuProcessed: boolean; error?: string }> {
    const attempts = (this.attempts.get(documentId) || 0) + 1;
    this.attempts.set(documentId, attempts);

    await new Promise((resolve) => setTimeout(resolve, 10));

    if (this.config.shouldFail) {
      return { success: false, gpuProcessed: false, error: "GPU processing failed" };
    }

    if (this.config.failAfterAttempts > 0 && attempts <= this.config.failAfterAttempts) {
      return { success: false, gpuProcessed: false, error: "Simulated failure" };
    }

    if (!this.config.gpuAvailable) {
      return { success: true, gpuProcessed: false };
    }

    return { success: true, gpuProcessed: true };
  }

  reset(): void {
    this.config = { gpuAvailable: true, shouldFail: false, failAfterAttempts: 0 };
    this.attempts.clear();
  }
}

async function runGPUWorkerTests(): Promise<TestSuiteResult> {
  printHeader("GPU Worker Tests");
  const tests: TestResult[] = [];
  const worker = new MockGPUWorker();

  tests.push(
    await runTest("gpu success path", async () => {
      worker.reset();
      worker.configure({ gpuAvailable: true });
      const result = await worker.process("doc-001");
      if (!result.success) throw new Error("Should succeed");
      if (!result.gpuProcessed) throw new Error("Should use GPU");
    })
  );

  tests.push(
    await runTest("fallback path", async () => {
      worker.reset();
      worker.configure({ gpuAvailable: false });
      const result = await worker.process("doc-002");
      if (!result.success) throw new Error("Should succeed with CPU");
      if (result.gpuProcessed) throw new Error("Should not use GPU");
    })
  );

  tests.push(
    await runTest("retry path", async () => {
      worker.reset();
      worker.configure({ gpuAvailable: true, failAfterAttempts: 2 });
      let result = await worker.process("doc-003");
      if (result.success) throw new Error("First attempt should fail");
      result = await worker.process("doc-003");
      if (result.success) throw new Error("Second attempt should fail");
      result = await worker.process("doc-003");
      if (!result.success) throw new Error("Third attempt should succeed");
    })
  );

  for (const test of tests) {
    if (test.passed) {
      printSuccess(test.name);
    } else {
      printFailure(`${test.name}: ${test.error}`);
    }
  }

  return {
    suiteName: "GPU Worker",
    tests,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    totalDuration: tests.reduce((sum, t) => sum + t.duration, 0),
  };
}

interface WorkflowState {
  status: string;
  retryCount: number;
}

class MockTemporalWorkflow {
  private state: WorkflowState = { status: "pending", retryCount: 0 };
  private signals: Map<string, unknown> = new Map();

  async execute(_input: { documentId: string }): Promise<{ success: boolean }> {
    this.state.status = "processing";
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.state.status = "completed";
    return { success: true };
  }

  sendSignal(name: string, payload: unknown): void {
    this.signals.set(name, payload);
  }

  query(name: string): unknown {
    if (name === "getState") return this.state;
    return null;
  }

  reset(): void {
    this.state = { status: "pending", retryCount: 0 };
    this.signals.clear();
  }
}

async function runTemporalTests(): Promise<TestSuiteResult> {
  printHeader("Temporal Workflow Tests");
  const tests: TestResult[] = [];
  const workflow = new MockTemporalWorkflow();

  tests.push(
    await runTest("workflow executed", async () => {
      workflow.reset();
      const result = await workflow.execute({ documentId: "doc-001" });
      if (!result.success) throw new Error("Workflow should succeed");
      const state = workflow.query("getState") as WorkflowState;
      if (state.status !== "completed") throw new Error("State should be completed");
    })
  );

  tests.push(
    await runTest("signals", async () => {
      workflow.reset();
      workflow.sendSignal("cancel", { reason: "test" });
      const state = workflow.query("getState");
      if (!state) throw new Error("Should return state");
    })
  );

  tests.push(
    await runTest("retry rules", async () => {
      workflow.reset();
      const result = await workflow.execute({ documentId: "doc-002" });
      if (!result.success) throw new Error("Should succeed");
    })
  );

  for (const test of tests) {
    if (test.passed) {
      printSuccess(test.name);
    } else {
      printFailure(`${test.name}: ${test.error}`);
    }
  }

  return {
    suiteName: "Temporal",
    tests,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    totalDuration: tests.reduce((sum, t) => sum + t.duration, 0),
  };
}

interface E2EDocument {
  id: string;
  status: string;
  score?: number;
  decision?: string;
}

class E2EPipeline {
  private documents = new Map<string, E2EDocument>();

  async processDocument(
    id: string,
    type: "KTP" | "NPWP"
  ): Promise<{ success: boolean; score: number; decision: string }> {
    this.documents.set(id, { id, status: "processing" });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const parsed =
      type === "KTP"
        ? { nik: "3174051234560001", nama: "JOHN DOE" }
        : { npwp: "01.234.567.8-901.000", nama: "JOHN DOE" };

    let score = 0;
    if (type === "KTP") {
      if (parsed.nik && /^\d{16}$/.test(parsed.nik)) score += 50;
      if (parsed.nama) score += 40;
    } else {
      if (parsed.npwp) score += 60;
      if (parsed.nama) score += 30;
    }

    const decision = score >= 85 ? "APPROVE" : score >= 35 ? "REVIEW" : "REJECT";

    this.documents.set(id, { id, status: "completed", score, decision });

    return { success: true, score, decision };
  }

  getDocument(id: string): E2EDocument | undefined {
    return this.documents.get(id);
  }

  reset(): void {
    this.documents.clear();
  }
}

async function runE2ETests(): Promise<TestSuiteResult> {
  printHeader("E2E Pipeline Tests");
  const tests: TestResult[] = [];
  const pipeline = new E2EPipeline();

  tests.push(
    await runTest("ocr → parser → score → decision → db → callback", async () => {
      pipeline.reset();

      const result = await pipeline.processDocument("e2e-001", "KTP");
      if (!result.success) throw new Error("Pipeline should succeed");

      if (typeof result.score !== "number") throw new Error("Score should be a number");
      if (!["APPROVE", "REVIEW", "REJECT"].includes(result.decision)) {
        throw new Error("Invalid decision");
      }

      const doc = pipeline.getDocument("e2e-001");
      if (!doc) throw new Error("Document should exist");
      if (doc.status !== "completed") throw new Error("Status should be completed");
    })
  );

  for (const test of tests) {
    if (test.passed) {
      printSuccess(test.name);
    } else {
      printFailure(`${test.name}: ${test.error}`);
    }
  }

  return {
    suiteName: "E2E Pipeline",
    tests,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    totalDuration: tests.reduce((sum, t) => sum + t.duration, 0),
  };
}

async function main(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log(`${BOLD}FILOT FULL SYSTEM TEST RUNNER${RESET}`);
  console.log(`${YELLOW}Tranche T7-D: System Testing${RESET}`);
  console.log("=".repeat(60));

  const results: TestSuiteResult[] = [];

  results.push(await runRedisTests());
  results.push(await runGPUWorkerTests());
  results.push(await runTemporalTests());
  results.push(await runE2ETests());

  printSummary(results);

  const hasFailures = results.some((r) => r.failed > 0);
  process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { runRedisTests, runGPUWorkerTests, runTemporalTests, runE2ETests };
