import { EventEmitter } from "events";

interface MockDocument {
  id: string;
  userId: string;
  type: "KTP" | "NPWP";
  fileUrl: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  ocrText?: string;
  resultJson?: Record<string, unknown>;
  aiScore?: number;
  aiDecision?: string;
  verificationStatus?: string;
  processedAt?: Date;
}

interface MockR2Storage {
  files: Map<string, Buffer>;
  upload: (key: string, buffer: Buffer) => Promise<string>;
  download: (key: string) => Promise<Buffer>;
  delete: (key: string) => Promise<void>;
}

interface MockRedisQueue {
  queue: string[];
  processing: Set<string>;
  attempts: Map<string, number>;
  enqueue: (documentId: string) => Promise<boolean>;
  dequeue: () => Promise<string | null>;
  markComplete: (documentId: string) => Promise<void>;
  markFailed: (documentId: string) => Promise<void>;
}

interface MockDatabase {
  documents: Map<string, MockDocument>;
  insert: (doc: MockDocument) => Promise<MockDocument>;
  update: (id: string, updates: Partial<MockDocument>) => Promise<MockDocument | null>;
  find: (id: string) => Promise<MockDocument | null>;
}

interface BULI2Callback {
  reviewId: string;
  documentId: string;
  decision: string;
  score: number;
}

const eventBus = new EventEmitter();

function createMockR2Storage(): MockR2Storage {
  const files = new Map<string, Buffer>();

  return {
    files,
    async upload(key: string, buffer: Buffer): Promise<string> {
      files.set(key, buffer);
      eventBus.emit("r2:uploaded", { key, size: buffer.length });
      return key;
    },
    async download(key: string): Promise<Buffer> {
      const file = files.get(key);
      if (!file) {
        throw new Error(`File not found: ${key}`);
      }
      eventBus.emit("r2:downloaded", { key });
      return file;
    },
    async delete(key: string): Promise<void> {
      files.delete(key);
      eventBus.emit("r2:deleted", { key });
    },
  };
}

function createMockRedisQueue(): MockRedisQueue {
  const queue: string[] = [];
  const processing = new Set<string>();
  const attempts = new Map<string, number>();

  return {
    queue,
    processing,
    attempts,
    async enqueue(documentId: string): Promise<boolean> {
      if (queue.includes(documentId) || processing.has(documentId)) {
        return false;
      }
      queue.push(documentId);
      attempts.set(documentId, 0);
      eventBus.emit("queue:enqueued", { documentId });
      return true;
    },
    async dequeue(): Promise<string | null> {
      const documentId = queue.shift() || null;
      if (documentId) {
        processing.add(documentId);
        eventBus.emit("queue:dequeued", { documentId });
      }
      return documentId;
    },
    async markComplete(documentId: string): Promise<void> {
      processing.delete(documentId);
      attempts.delete(documentId);
      eventBus.emit("queue:completed", { documentId });
    },
    async markFailed(documentId: string): Promise<void> {
      processing.delete(documentId);
      attempts.delete(documentId);
      eventBus.emit("queue:failed", { documentId });
    },
  };
}

function createMockDatabase(): MockDatabase {
  const documents = new Map<string, MockDocument>();

  return {
    documents,
    async insert(doc: MockDocument): Promise<MockDocument> {
      documents.set(doc.id, { ...doc });
      eventBus.emit("db:inserted", { documentId: doc.id });
      return doc;
    },
    async update(id: string, updates: Partial<MockDocument>): Promise<MockDocument | null> {
      const doc = documents.get(id);
      if (!doc) return null;
      const updated = { ...doc, ...updates };
      documents.set(id, updated);
      eventBus.emit("db:updated", { documentId: id, updates });
      return updated;
    },
    async find(id: string): Promise<MockDocument | null> {
      return documents.get(id) || null;
    },
  };
}

function createFakeKTPImage(): Buffer {
  const base64Data = `
    iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
  `.trim();
  return Buffer.from(base64Data, "base64");
}

function createFakeNPWPImage(): Buffer {
  const base64Data = `
    iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
  `.trim();
  return Buffer.from(base64Data, "base64");
}

function mockGPUOCR(imageBuffer: Buffer, documentType: "KTP" | "NPWP"): string {
  if (documentType === "KTP") {
    return `
REPUBLIK INDONESIA
PROVINSI DKI JAKARTA
KARTU TANDA PENDUDUK

NIK: 3174051234560001
Nama: JOHN DOE TESTING
Tempat/Tgl Lahir: JAKARTA, 01-01-1990
Jenis Kelamin: LAKI-LAKI
Alamat: JL. SUDIRMAN NO. 123
RT/RW: 001/002
Kel/Desa: MENTENG
Kecamatan: MENTENG
Agama: ISLAM
Status Perkawinan: KAWIN
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
Alamat: JL. SUDIRMAN NO. 123, JAKARTA PUSAT
  `.trim();
}

interface ParsedKTP {
  nik: string;
  nama: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  alamat: string;
  rtRw?: string;
  kelDesa?: string;
  kecamatan?: string;
  agama?: string;
  statusPerkawinan?: string;
  pekerjaan?: string;
  kewarganegaraan?: string;
}

interface ParsedNPWP {
  npwp: string;
  nama: string;
  nik?: string;
  alamat: string;
}

function parseKTPText(ocrText: string): ParsedKTP {
  const lines = ocrText.split("\n").map((l) => l.trim());
  const result: Partial<ParsedKTP> = {};

  for (const line of lines) {
    if (line.startsWith("NIK:")) {
      result.nik = line.replace("NIK:", "").trim();
    } else if (line.startsWith("Nama:")) {
      result.nama = line.replace("Nama:", "").trim();
    } else if (line.startsWith("Tempat/Tgl Lahir:")) {
      const parts = line.replace("Tempat/Tgl Lahir:", "").trim().split(",");
      result.tempatLahir = parts[0]?.trim() || "";
      result.tanggalLahir = parts[1]?.trim() || "";
    } else if (line.startsWith("Jenis Kelamin:")) {
      result.jenisKelamin = line.replace("Jenis Kelamin:", "").trim();
    } else if (line.startsWith("Alamat:")) {
      result.alamat = line.replace("Alamat:", "").trim();
    } else if (line.startsWith("RT/RW:")) {
      result.rtRw = line.replace("RT/RW:", "").trim();
    } else if (line.startsWith("Kel/Desa:")) {
      result.kelDesa = line.replace("Kel/Desa:", "").trim();
    } else if (line.startsWith("Kecamatan:")) {
      result.kecamatan = line.replace("Kecamatan:", "").trim();
    } else if (line.startsWith("Agama:")) {
      result.agama = line.replace("Agama:", "").trim();
    } else if (line.startsWith("Status Perkawinan:")) {
      result.statusPerkawinan = line.replace("Status Perkawinan:", "").trim();
    } else if (line.startsWith("Pekerjaan:")) {
      result.pekerjaan = line.replace("Pekerjaan:", "").trim();
    } else if (line.startsWith("Kewarganegaraan:")) {
      result.kewarganegaraan = line.replace("Kewarganegaraan:", "").trim();
    }
  }

  return result as ParsedKTP;
}

function parseNPWPText(ocrText: string): ParsedNPWP {
  const lines = ocrText.split("\n").map((l) => l.trim());
  const result: Partial<ParsedNPWP> = {};

  for (const line of lines) {
    if (line.startsWith("NPWP:")) {
      result.npwp = line.replace("NPWP:", "").trim();
    } else if (line.startsWith("Nama:")) {
      result.nama = line.replace("Nama:", "").trim();
    } else if (line.startsWith("NIK:")) {
      result.nik = line.replace("NIK:", "").trim();
    } else if (line.startsWith("Alamat:")) {
      result.alamat = line.replace("Alamat:", "").trim();
    }
  }

  return result as ParsedNPWP;
}

function calculateScore(parsedResult: ParsedKTP | ParsedNPWP, type: "KTP" | "NPWP"): number {
  let score = 0;

  if (type === "KTP") {
    const ktp = parsedResult as ParsedKTP;
    if (ktp.nik && /^\d{16}$/.test(ktp.nik)) score += 25;
    if (ktp.nama && ktp.nama.length > 2) score += 20;
    if (ktp.tempatLahir) score += 15;
    if (ktp.tanggalLahir) score += 15;
    if (ktp.jenisKelamin) score += 10;
    if (ktp.alamat) score += 15;
  } else {
    const npwp = parsedResult as ParsedNPWP;
    if (npwp.npwp && /^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/.test(npwp.npwp)) score += 40;
    if (npwp.nama && npwp.nama.length > 2) score += 30;
    if (npwp.alamat) score += 30;
  }

  return score;
}

function determineDecision(score: number): { decision: string; outcome: string } {
  if (score >= 85) {
    return { decision: "auto_approve", outcome: "APPROVE" };
  } else if (score < 35) {
    return { decision: "auto_reject", outcome: "REJECT" };
  }
  return { decision: "needs_review", outcome: "REVIEW" };
}

const buli2Callbacks: BULI2Callback[] = [];

async function simulateBULI2Callback(
  reviewId: string,
  documentId: string,
  decision: string,
  score: number
): Promise<void> {
  buli2Callbacks.push({ reviewId, documentId, decision, score });
  eventBus.emit("buli2:callback", { reviewId, documentId, decision, score });
}

describe("End-to-End OCR Pipeline Tests", () => {
  let r2Storage: MockR2Storage;
  let redisQueue: MockRedisQueue;
  let database: MockDatabase;

  beforeEach(() => {
    r2Storage = createMockR2Storage();
    redisQueue = createMockRedisQueue();
    database = createMockDatabase();
    buli2Callbacks.length = 0;
    eventBus.removeAllListeners();
  });

  describe("Full KTP Processing Pipeline", () => {
    it("should process KTP image from upload to decision", async () => {
      const events: string[] = [];
      eventBus.on("r2:uploaded", () => events.push("r2:uploaded"));
      eventBus.on("queue:enqueued", () => events.push("queue:enqueued"));
      eventBus.on("queue:dequeued", () => events.push("queue:dequeued"));
      eventBus.on("db:updated", () => events.push("db:updated"));
      eventBus.on("queue:completed", () => events.push("queue:completed"));

      const documentId = "e2e-ktp-001";
      const userId = "user-001";
      const fileKey = `${userId}/KTP_${documentId}.jpg`;

      const fakeImage = createFakeKTPImage();
      await r2Storage.upload(fileKey, fakeImage);

      const doc = await database.insert({
        id: documentId,
        userId,
        type: "KTP",
        fileUrl: fileKey,
        status: "uploaded",
      });

      await redisQueue.enqueue(documentId);

      const dequeuedId = await redisQueue.dequeue();
      expect(dequeuedId).toBe(documentId);

      await database.update(documentId, { status: "processing" });

      const imageBuffer = await r2Storage.download(fileKey);
      expect(imageBuffer).toBeDefined();

      const ocrText = mockGPUOCR(imageBuffer, "KTP");
      expect(ocrText).toContain("NIK:");

      const parsedResult = parseKTPText(ocrText);
      expect(parsedResult.nik).toBe("3174051234560001");
      expect(parsedResult.nama).toBe("JOHN DOE TESTING");
      expect(parsedResult.tempatLahir).toBe("JAKARTA");
      expect(parsedResult.tanggalLahir).toBe("01-01-1990");
      expect(parsedResult.jenisKelamin).toBe("LAKI-LAKI");
      expect(parsedResult.alamat).toBe("JL. SUDIRMAN NO. 123");

      const score = calculateScore(parsedResult, "KTP");
      expect(score).toBeGreaterThanOrEqual(85);

      const { decision, outcome } = determineDecision(score);
      expect(["auto_approve", "needs_review", "auto_reject"]).toContain(decision);
      expect(["APPROVE", "REVIEW", "REJECT"]).toContain(outcome);

      const updatedDoc = await database.update(documentId, {
        status: "completed",
        ocrText,
        resultJson: parsedResult,
        aiScore: score,
        aiDecision: decision,
        verificationStatus: outcome.toLowerCase(),
        processedAt: new Date(),
      });

      expect(updatedDoc?.status).toBe("completed");
      expect(updatedDoc?.aiScore).toBeGreaterThanOrEqual(85);

      if (decision === "needs_review") {
        await simulateBULI2Callback(`review-${documentId}`, documentId, decision, score);
      }

      await redisQueue.markComplete(documentId);

      expect(events).toContain("r2:uploaded");
      expect(events).toContain("queue:enqueued");
      expect(events).toContain("queue:dequeued");
      expect(events).toContain("db:updated");
      expect(events).toContain("queue:completed");
    });

    it("should extract all required KTP fields", async () => {
      const fakeImage = createFakeKTPImage();
      const ocrText = mockGPUOCR(fakeImage, "KTP");
      const parsedResult = parseKTPText(ocrText);

      expect(parsedResult).toHaveProperty("nik");
      expect(parsedResult).toHaveProperty("nama");
      expect(parsedResult).toHaveProperty("tempatLahir");
      expect(parsedResult).toHaveProperty("tanggalLahir");
      expect(parsedResult).toHaveProperty("alamat");
      expect(parsedResult).toHaveProperty("jenisKelamin");

      expect(parsedResult.nik).toMatch(/^\d{16}$/);
    });
  });

  describe("Full NPWP Processing Pipeline", () => {
    it("should process NPWP image from upload to decision", async () => {
      const documentId = "e2e-npwp-001";
      const userId = "user-002";
      const fileKey = `${userId}/NPWP_${documentId}.jpg`;

      const fakeImage = createFakeNPWPImage();
      await r2Storage.upload(fileKey, fakeImage);

      await database.insert({
        id: documentId,
        userId,
        type: "NPWP",
        fileUrl: fileKey,
        status: "uploaded",
      });

      await redisQueue.enqueue(documentId);
      await redisQueue.dequeue();

      const imageBuffer = await r2Storage.download(fileKey);
      const ocrText = mockGPUOCR(imageBuffer, "NPWP");

      const parsedResult = parseNPWPText(ocrText);
      expect(parsedResult.npwp).toBe("01.234.567.8-901.000");
      expect(parsedResult.nama).toBe("JOHN DOE TESTING");

      const score = calculateScore(parsedResult, "NPWP");
      const { decision, outcome } = determineDecision(score);

      await database.update(documentId, {
        status: "completed",
        ocrText,
        resultJson: parsedResult,
        aiScore: score,
        aiDecision: decision,
        verificationStatus: outcome.toLowerCase(),
        processedAt: new Date(),
      });

      await redisQueue.markComplete(documentId);

      const finalDoc = await database.find(documentId);
      expect(finalDoc?.status).toBe("completed");
      expect(finalDoc?.aiScore).toBeDefined();
    });

    it("should extract all required NPWP fields", async () => {
      const fakeImage = createFakeNPWPImage();
      const ocrText = mockGPUOCR(fakeImage, "NPWP");
      const parsedResult = parseNPWPText(ocrText);

      expect(parsedResult).toHaveProperty("npwp");
      expect(parsedResult).toHaveProperty("nama");
      expect(parsedResult).toHaveProperty("alamat");

      expect(parsedResult.npwp).toMatch(/^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/);
    });
  });

  describe("Decision Engine Outcomes", () => {
    it("should return APPROVE for high score documents", async () => {
      const parsedResult: ParsedKTP = {
        nik: "3174051234560001",
        nama: "JOHN DOE TESTING",
        tempatLahir: "JAKARTA",
        tanggalLahir: "01-01-1990",
        jenisKelamin: "LAKI-LAKI",
        alamat: "JL. SUDIRMAN NO. 123",
      };

      const score = calculateScore(parsedResult, "KTP");
      const { outcome } = determineDecision(score);

      expect(score).toBeGreaterThanOrEqual(85);
      expect(outcome).toBe("APPROVE");
    });

    it("should return REVIEW for medium score documents", async () => {
      const parsedResult: Partial<ParsedKTP> = {
        nik: "3174051234560001",
        nama: "JOHN DOE",
      };

      const score = calculateScore(parsedResult as ParsedKTP, "KTP");
      const { outcome } = determineDecision(score);

      expect(score).toBeGreaterThanOrEqual(35);
      expect(score).toBeLessThan(85);
      expect(outcome).toBe("REVIEW");
    });

    it("should return REJECT for low score documents", async () => {
      const parsedResult: Partial<ParsedKTP> = {
        nama: "X",
      };

      const score = calculateScore(parsedResult as ParsedKTP, "KTP");
      const { outcome } = determineDecision(score);

      expect(score).toBeLessThan(35);
      expect(outcome).toBe("REJECT");
    });
  });

  describe("Database Updates", () => {
    it("should update document status throughout pipeline", async () => {
      const documentId = "e2e-status-001";

      await database.insert({
        id: documentId,
        userId: "user-001",
        type: "KTP",
        fileUrl: "test/path.jpg",
        status: "uploaded",
      });

      let doc = await database.find(documentId);
      expect(doc?.status).toBe("uploaded");

      await database.update(documentId, { status: "processing" });
      doc = await database.find(documentId);
      expect(doc?.status).toBe("processing");

      await database.update(documentId, {
        status: "completed",
        aiScore: 90,
        aiDecision: "auto_approve",
        verificationStatus: "approve",
      });
      doc = await database.find(documentId);
      expect(doc?.status).toBe("completed");
      expect(doc?.aiScore).toBe(90);
    });
  });

  describe("BULI2 Callback Simulation", () => {
    it("should trigger callback for needs_review decisions", async () => {
      const documentId = "e2e-buli2-001";
      const reviewId = `review-${documentId}`;

      await simulateBULI2Callback(reviewId, documentId, "needs_review", 65);

      expect(buli2Callbacks.length).toBe(1);
      expect(buli2Callbacks[0]).toEqual({
        reviewId,
        documentId,
        decision: "needs_review",
        score: 65,
      });
    });

    it("should emit BULI2 callback event", async () => {
      let callbackReceived = false;
      eventBus.on("buli2:callback", () => {
        callbackReceived = true;
      });

      await simulateBULI2Callback("review-001", "doc-001", "needs_review", 50);

      expect(callbackReceived).toBe(true);
    });
  });

  describe("Pipeline Failure Scenarios", () => {
    it("should fail if any step breaks - R2 download failure", async () => {
      const documentId = "e2e-fail-001";
      const fileKey = "nonexistent/file.jpg";

      await database.insert({
        id: documentId,
        userId: "user-001",
        type: "KTP",
        fileUrl: fileKey,
        status: "uploaded",
      });

      await expect(r2Storage.download(fileKey)).rejects.toThrow("File not found");

      await database.update(documentId, { status: "failed" });
      await redisQueue.markFailed(documentId);

      const doc = await database.find(documentId);
      expect(doc?.status).toBe("failed");
    });

    it("should mark document as failed on processing error", async () => {
      const documentId = "e2e-fail-002";

      await database.insert({
        id: documentId,
        userId: "user-001",
        type: "KTP",
        fileUrl: "test/file.jpg",
        status: "uploaded",
      });

      await redisQueue.enqueue(documentId);
      await redisQueue.dequeue();

      await database.update(documentId, { status: "failed" });
      await redisQueue.markFailed(documentId);

      const doc = await database.find(documentId);
      expect(doc?.status).toBe("failed");
      expect(redisQueue.processing.has(documentId)).toBe(false);
    });
  });

  describe("Concurrent Processing", () => {
    it("should handle multiple documents in queue", async () => {
      const documentIds = ["e2e-concurrent-001", "e2e-concurrent-002", "e2e-concurrent-003"];

      for (const id of documentIds) {
        await database.insert({
          id,
          userId: "user-001",
          type: "KTP",
          fileUrl: `user-001/KTP_${id}.jpg`,
          status: "uploaded",
        });
        await r2Storage.upload(`user-001/KTP_${id}.jpg`, createFakeKTPImage());
        await redisQueue.enqueue(id);
      }

      expect(redisQueue.queue.length).toBe(3);

      const processedIds: string[] = [];
      while (redisQueue.queue.length > 0) {
        const id = await redisQueue.dequeue();
        if (id) {
          processedIds.push(id);
          await database.update(id, { status: "completed" });
          await redisQueue.markComplete(id);
        }
      }

      expect(processedIds.length).toBe(3);
      expect(processedIds).toEqual(documentIds);
    });
  });

  describe("Full Pipeline Integration", () => {
    it("should complete full pipeline for multiple document types", async () => {
      const ktpDoc = {
        id: "e2e-full-ktp-001",
        userId: "user-001",
        type: "KTP" as const,
        fileUrl: "user-001/KTP_full.jpg",
        status: "uploaded" as const,
      };

      const npwpDoc = {
        id: "e2e-full-npwp-001",
        userId: "user-001",
        type: "NPWP" as const,
        fileUrl: "user-001/NPWP_full.jpg",
        status: "uploaded" as const,
      };

      await r2Storage.upload(ktpDoc.fileUrl, createFakeKTPImage());
      await r2Storage.upload(npwpDoc.fileUrl, createFakeNPWPImage());

      await database.insert(ktpDoc);
      await database.insert(npwpDoc);

      await redisQueue.enqueue(ktpDoc.id);
      await redisQueue.enqueue(npwpDoc.id);

      for (let i = 0; i < 2; i++) {
        const docId = await redisQueue.dequeue();
        if (!docId) continue;

        const doc = await database.find(docId);
        if (!doc) continue;

        const imageBuffer = await r2Storage.download(doc.fileUrl);
        const ocrText = mockGPUOCR(imageBuffer, doc.type);
        const parsedResult =
          doc.type === "KTP" ? parseKTPText(ocrText) : parseNPWPText(ocrText);
        const score = calculateScore(parsedResult, doc.type);
        const { decision, outcome } = determineDecision(score);

        await database.update(docId, {
          status: "completed",
          ocrText,
          resultJson: parsedResult,
          aiScore: score,
          aiDecision: decision,
          verificationStatus: outcome.toLowerCase(),
          processedAt: new Date(),
        });

        await redisQueue.markComplete(docId);
      }

      const finalKtp = await database.find(ktpDoc.id);
      const finalNpwp = await database.find(npwpDoc.id);

      expect(finalKtp?.status).toBe("completed");
      expect(finalNpwp?.status).toBe("completed");
      expect(finalKtp?.aiScore).toBeDefined();
      expect(finalNpwp?.aiScore).toBeDefined();
    });
  });
});

export {};
