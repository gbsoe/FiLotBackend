import Redis from "ioredis";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let redisClient: Redis | null = null;
let isConnectionClosed = false;

function createRedisClient(): Redis {
  const options: any = {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error("Redis connection failed after 10 retries, will retry later");
        isConnectionClosed = true;
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    },
  };

  if (REDIS_PASSWORD) {
    options.password = REDIS_PASSWORD;
  }

  const client = new Redis(REDIS_URL, options);

  client.on("connect", () => {
    logger.info("Redis client connected");
    isConnectionClosed = false;
  });

  client.on("ready", () => {
    logger.info("Redis client ready");
    isConnectionClosed = false;
  });

  client.on("error", (err: Error) => {
    logger.error("Redis client error", { error: err.message });
  });

  client.on("close", () => {
    logger.warn("Redis connection closed");
    isConnectionClosed = true;
  });

  client.on("reconnecting", () => {
    logger.info("Redis client reconnecting");
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!redisClient || isConnectionClosed) {
    if (redisClient && isConnectionClosed) {
      try {
        redisClient.disconnect();
      } catch {
      }
      redisClient = null;
    }
    redisClient = createRedisClient();
    isConnectionClosed = false;
  }
  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnectionClosed = true;
    logger.info("Redis connection closed gracefully");
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    if (isConnectionClosed) {
      redisClient = null;
    }
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === "PONG";
  } catch (error) {
    logger.error("Redis health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export function resetRedisConnection(): void {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
    }
    redisClient = null;
    isConnectionClosed = true;
    logger.info("Redis connection reset");
  }
}
