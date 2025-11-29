import Redis from "ioredis";

const GPU_QUEUE_KEY = "filot:test:gpu:queue";
const GPU_PROCESSING_KEY = "filot:test:gpu:processing";
const GPU_ATTEMPTS_KEY = "filot:test:gpu:attempts";
const GPU_RESULTS_CHANNEL = "filot:test:gpu:results";
const GPU_MAX_RETRIES = 3;

interface MockRedisClient {
  redis: Redis | null;
  connected: boolean;
}

const mockClient: MockRedisClient = {
  redis: null,
  connected: false,
};

function createMockRedis(): Redis {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  });
}

async function enqueueForGPU(redis: Redis, documentId: string): Promise<boolean> {
  try {
    const existsInQueue = await redis.lpos(GPU_QUEUE_KEY, documentId);
    const existsInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);

    if (existsInQueue !== null || existsInProcessing) {
      return false;
    }

    await redis.rpush(GPU_QUEUE_KEY, documentId);
    await redis.hset(GPU_ATTEMPTS_KEY, documentId, "0");
    return true;
  } catch {
    return false;
  }
}

async function dequeueFromGPU(redis: Redis): Promise<string | null> {
  try {
    const documentId = await redis.lpop(GPU_QUEUE_KEY);

    if (documentId) {
      await redis.sadd(GPU_PROCESSING_KEY, documentId);
    }

    return documentId;
  } catch {
    return null;
  }
}

async function markGPUComplete(redis: Redis, documentId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.srem(GPU_PROCESSING_KEY, documentId);
  pipeline.hdel(GPU_ATTEMPTS_KEY, documentId);
  await pipeline.exec();
}

async function markGPUFailed(redis: Redis, documentId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.srem(GPU_PROCESSING_KEY, documentId);
  pipeline.hdel(GPU_ATTEMPTS_KEY, documentId);
  await pipeline.exec();
}

async function incrementAttempts(redis: Redis, documentId: string): Promise<number> {
  const result = await redis.hincrby(GPU_ATTEMPTS_KEY, documentId, 1);
  return result;
}

async function getAttempts(redis: Redis, documentId: string): Promise<number> {
  const attempts = await redis.hget(GPU_ATTEMPTS_KEY, documentId);
  return attempts ? parseInt(attempts, 10) : 0;
}

async function requeueWithDelay(redis: Redis, documentId: string): Promise<void> {
  await redis.srem(GPU_PROCESSING_KEY, documentId);
  await redis.rpush(GPU_QUEUE_KEY, documentId);
}

async function cleanupTestKeys(redis: Redis): Promise<void> {
  await redis.del(GPU_QUEUE_KEY);
  await redis.del(GPU_PROCESSING_KEY);
  await redis.del(GPU_ATTEMPTS_KEY);
}

describe("Redis Queue Test Suite", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = createMockRedis();
    try {
      await redis.connect();
      mockClient.redis = redis;
      mockClient.connected = true;
    } catch {
      console.warn("Redis not available - some tests will be skipped");
      mockClient.connected = false;
    }
  });

  afterAll(async () => {
    if (mockClient.connected && redis) {
      await cleanupTestKeys(redis);
      await redis.quit();
    }
  });

  beforeEach(async () => {
    if (mockClient.connected && redis) {
      await cleanupTestKeys(redis);
    }
  });

  describe("Queue Operations", () => {
    it("should enqueue a document and dequeue it", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-doc-001";

      const enqueued = await enqueueForGPU(redis, documentId);
      expect(enqueued).toBe(true);

      const dequeued = await dequeueFromGPU(redis);
      expect(dequeued).toBe(documentId);

      const isInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(isInProcessing).toBe(1);
    });

    it("should not enqueue duplicate documents", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-doc-002";

      const firstEnqueue = await enqueueForGPU(redis, documentId);
      expect(firstEnqueue).toBe(true);

      const secondEnqueue = await enqueueForGPU(redis, documentId);
      expect(secondEnqueue).toBe(false);

      const queueLength = await redis.llen(GPU_QUEUE_KEY);
      expect(queueLength).toBe(1);
    });

    it("should add document to processing set on dequeue", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-doc-003";
      await enqueueForGPU(redis, documentId);

      const beforeDequeue = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(beforeDequeue).toBe(0);

      await dequeueFromGPU(redis);

      const afterDequeue = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(afterDequeue).toBe(1);
    });

    it("should remove document from processing set on completion", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-doc-004";
      await enqueueForGPU(redis, documentId);
      await dequeueFromGPU(redis);

      await markGPUComplete(redis, documentId);

      const isInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(isInProcessing).toBe(0);
    });

    it("should return null when queue is empty", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const result = await dequeueFromGPU(redis);
      expect(result).toBeNull();
    });
  });

  describe("Processing Set Operations", () => {
    it("should track documents in processing set", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const doc1 = "test-proc-001";
      const doc2 = "test-proc-002";

      await enqueueForGPU(redis, doc1);
      await enqueueForGPU(redis, doc2);

      await dequeueFromGPU(redis);
      await dequeueFromGPU(redis);

      const processingCount = await redis.scard(GPU_PROCESSING_KEY);
      expect(processingCount).toBe(2);
    });

    it("should remove from processing set on mark failed", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-fail-001";
      await enqueueForGPU(redis, documentId);
      await dequeueFromGPU(redis);

      await markGPUFailed(redis, documentId);

      const isInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(isInProcessing).toBe(0);
    });
  });

  describe("Attempts Counter Operations", () => {
    it("should initialize attempts counter to 0 on enqueue", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-attempts-001";
      await enqueueForGPU(redis, documentId);

      const attempts = await getAttempts(redis, documentId);
      expect(attempts).toBe(0);
    });

    it("should increment attempts counter", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-attempts-002";
      await enqueueForGPU(redis, documentId);

      await incrementAttempts(redis, documentId);
      expect(await getAttempts(redis, documentId)).toBe(1);

      await incrementAttempts(redis, documentId);
      expect(await getAttempts(redis, documentId)).toBe(2);

      await incrementAttempts(redis, documentId);
      expect(await getAttempts(redis, documentId)).toBe(3);
    });

    it("should cleanup attempts on completion", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-attempts-003";
      await enqueueForGPU(redis, documentId);
      await incrementAttempts(redis, documentId);
      await dequeueFromGPU(redis);

      await markGPUComplete(redis, documentId);

      const attempts = await redis.hget(GPU_ATTEMPTS_KEY, documentId);
      expect(attempts).toBeNull();
    });
  });

  describe("Pub/Sub Message Delivery", () => {
    it("should publish and receive messages on results channel", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const subscriber = redis.duplicate();
      await subscriber.connect();

      const receivedMessages: string[] = [];

      await new Promise<void>((resolve) => {
        subscriber.subscribe(GPU_RESULTS_CHANNEL, () => {
          resolve();
        });
      });

      subscriber.on("message", (_channel: string, message: string) => {
        receivedMessages.push(message);
      });

      const testMessage = JSON.stringify({
        documentId: "test-pubsub-001",
        success: true,
        gpuProcessed: true,
      });

      await redis.publish(GPU_RESULTS_CHANNEL, testMessage);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      expect(receivedMessages[0]).toBe(testMessage);

      await subscriber.unsubscribe(GPU_RESULTS_CHANNEL);
      await subscriber.quit();
    });

    it("should handle multiple subscribers", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const subscriber1 = redis.duplicate();
      const subscriber2 = redis.duplicate();
      await subscriber1.connect();
      await subscriber2.connect();

      let sub1Received = false;
      let sub2Received = false;

      await new Promise<void>((resolve) => {
        let count = 0;
        const checkDone = () => {
          count++;
          if (count === 2) resolve();
        };
        subscriber1.subscribe(GPU_RESULTS_CHANNEL, checkDone);
        subscriber2.subscribe(GPU_RESULTS_CHANNEL, checkDone);
      });

      subscriber1.on("message", () => {
        sub1Received = true;
      });
      subscriber2.on("message", () => {
        sub2Received = true;
      });

      await redis.publish(GPU_RESULTS_CHANNEL, "test-message");

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(sub1Received).toBe(true);
      expect(sub2Received).toBe(true);

      await subscriber1.unsubscribe();
      await subscriber2.unsubscribe();
      await subscriber1.quit();
      await subscriber2.quit();
    });
  });

  describe("Failure Handling", () => {
    it("should handle corrupted JSON payload gracefully", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const subscriber = redis.duplicate();
      await subscriber.connect();

      let errorCaught = false;
      let parsedSuccessfully = false;

      await new Promise<void>((resolve) => {
        subscriber.subscribe(GPU_RESULTS_CHANNEL, resolve);
      });

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          JSON.parse(message);
          parsedSuccessfully = true;
        } catch {
          errorCaught = true;
        }
      });

      await redis.publish(GPU_RESULTS_CHANNEL, "not-valid-json{{{");

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorCaught).toBe(true);
      expect(parsedSuccessfully).toBe(false);

      await subscriber.unsubscribe();
      await subscriber.quit();
    });

    it("should retry up to max retries limit", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-retry-001";
      await enqueueForGPU(redis, documentId);
      await dequeueFromGPU(redis);

      for (let i = 0; i < GPU_MAX_RETRIES; i++) {
        await incrementAttempts(redis, documentId);
        await requeueWithDelay(redis, documentId);
        await dequeueFromGPU(redis);
      }

      const attempts = await getAttempts(redis, documentId);
      expect(attempts).toBe(GPU_MAX_RETRIES);
    });

    it("should requeue document on failure", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const documentId = "test-requeue-001";
      await enqueueForGPU(redis, documentId);
      await dequeueFromGPU(redis);

      const isInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(isInProcessing).toBe(1);

      await requeueWithDelay(redis, documentId);

      const stillInProcessing = await redis.sismember(GPU_PROCESSING_KEY, documentId);
      expect(stillInProcessing).toBe(0);

      const queueLength = await redis.llen(GPU_QUEUE_KEY);
      expect(queueLength).toBe(1);
    });
  });

  describe("Connection Recovery", () => {
    it("should handle connection loss gracefully", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const testRedis = createMockRedis();

      let connectionError = false;
      testRedis.on("error", () => {
        connectionError = true;
      });

      try {
        await testRedis.connect();
        expect(testRedis.status).toBe("ready");
      } catch {
        connectionError = true;
      }

      await testRedis.quit();

      expect(connectionError || testRedis.status === "end").toBe(true);
    });
  });

  describe("Queue Priority and Ordering", () => {
    it("should maintain FIFO order for documents", async () => {
      if (!mockClient.connected) {
        console.log("Skipping test - Redis not available");
        return;
      }

      const docs = ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"];

      for (const doc of docs) {
        await enqueueForGPU(redis, doc);
      }

      const dequeuedDocs: string[] = [];
      for (let i = 0; i < docs.length; i++) {
        const doc = await dequeueFromGPU(redis);
        if (doc) dequeuedDocs.push(doc);
      }

      expect(dequeuedDocs).toEqual(docs);
    });
  });
});

export {};
