import { logger } from "./logger";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private halfOpenTestInProgress: boolean = false;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;

  constructor(config: CircuitBreakerConfig) {
    this.name = config.name;
    this.failureThreshold = config.failureThreshold;
    this.cooldownMs = config.cooldownMs;
    this.onStateChange = config.onStateChange;

    logger.info("Circuit breaker initialized", {
      name: this.name,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
    });
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;

      logger.info("Circuit breaker state changed", {
        name: this.name,
        from: oldState,
        to: newState,
        failureCount: this.failureCount,
      });

      if (this.onStateChange) {
        this.onStateChange(this.name, oldState, newState);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.state !== CircuitState.OPEN) {
      return false;
    }

    if (!this.lastFailureTime) {
      return true;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.cooldownMs;
  }

  isOpen(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return false;
    }

    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionTo(CircuitState.HALF_OPEN);
      return false;
    }

    return this.state === CircuitState.OPEN;
  }

  canAttempt(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenTestInProgress) {
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(): void {
    this.totalRequests++;
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenTestInProgress = false;
      this.failureCount = 0;
      this.transitionTo(CircuitState.CLOSED);
      logger.info("Circuit breaker reset to closed after successful test request", {
        name: this.name,
      });
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  recordFailure(error?: Error): void {
    this.totalRequests++;
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn("Circuit breaker recorded failure", {
      name: this.name,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      state: this.state,
      error: error?.message,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenTestInProgress = false;
      this.transitionTo(CircuitState.OPEN);
      logger.warn("Circuit breaker opened after half-open test failure", {
        name: this.name,
      });
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
      logger.warn("Circuit breaker opened after reaching failure threshold", {
        name: this.name,
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
      });
    }
  }

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (!this.canAttempt()) {
      logger.warn("Circuit breaker is open, request rejected", {
        name: this.name,
        state: this.state,
        cooldownRemainingMs: this.lastFailureTime
          ? Math.max(0, this.cooldownMs - (Date.now() - this.lastFailureTime))
          : 0,
      });

      if (fallback) {
        return fallback();
      }

      throw new CircuitBreakerOpenError(
        `Circuit breaker "${this.name}" is open`,
        this.name
      );
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenTestInProgress = true;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      return CircuitState.HALF_OPEN;
    }
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenTestInProgress = false;

    logger.info("Circuit breaker manually reset", {
      name: this.name,
    });
  }
}

export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;

  constructor(message: string, circuitName: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
    this.circuitName = circuitName;
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getOrCreateCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  const existing = circuitBreakers.get(config.name);
  if (existing) {
    return existing;
  }

  const cb = new CircuitBreaker(config);
  circuitBreakers.set(config.name, cb);
  return cb;
}

export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  return circuitBreakers.get(name);
}

export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map((cb) => cb.getStats());
}
