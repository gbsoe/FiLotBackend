# TRANCHE T6.D — TEMPORAL MIGRATION PREPARATION

**Date:** 2025-11-27  
**Status:** Complete  
**Purpose:** Prepare FiLot backend codebase to be Temporal-ready while keeping Redis queue as fallback

---

## Overview

This tranche adds a queue abstraction layer to the FiLot backend, enabling a future migration from Redis-based queues to Temporal workflows. The existing Redis queue implementation remains fully functional and serves as the default queue engine. The Temporal adapter is implemented as a skeleton with helpful error messages for when Temporal is not configured.

---

## Files Created/Modified

| File | Type | Description |
|------|------|-------------|
| `src/queue/index.ts` | **New** | QueueClient interface, factory function, and engine selection |
| `src/queue/redisQueue.ts` | **New** | Redis adapter implementing QueueClient interface |
| `src/queue/temporalQueue.ts` | **New** | Temporal adapter skeleton with stub implementations |
| `src/ocr/processor.ts` | **Modified** | Updated to use queue abstraction with Redis fallback |
| `src/index.ts` | **Modified** | Updated to use startProcessingLoop/stopProcessingLoop from processor |
| `package.json` | **Modified** | Added Temporal SDK dependencies |

---

## Architecture

### Queue Abstraction Layer

```
                    +------------------+
                    |   processor.ts   |
                    | (entry point)    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  queue/index.ts  |
                    |  (factory)       |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
     +----------------+            +------------------+
     | redisQueue.ts  |            | temporalQueue.ts |
     | (implemented)  |            | (skeleton)       |
     +----------------+            +------------------+
              |                             |
              v                             v
     +----------------+            +------------------+
     | queueService   |            | Temporal SDK     |
     | (existing)     |            | (future)         |
     +----------------+            +------------------+
```

### QueueClient Interface

```typescript
export interface QueueStatus {
  isRunning: boolean;
  queueLength: number;
  processingCount: number;
}

export interface QueueClient {
  enqueueDocument(documentId: string): Promise<boolean>;
  dequeue(): Promise<string | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<QueueStatus>;
}
```

All methods are required to ensure consistent behavior across implementations. The `enqueueDocument` returns `boolean` to match existing Redis queue semantics (false if document already in queue).

### Queue State Management

The queue module maintains global state to track:
- `client`: The current queue client instance
- `engine`: The active engine type (redis or temporal)
- `isRunning`: Whether the worker is currently processing

Key functions:
- `startQueue(engine?)`: Starts the queue with specified or configured engine
- `stopQueue()`: Stops the current queue worker
- `switchToRedis()`: Explicitly switches to Redis engine (used for fallback)
- `getQueueClient(engine?)`: Gets the client for specified or active engine
- `getConfiguredQueueEngine()`: Returns the engine from environment config
- `getActiveQueueEngine()`: Returns the currently active engine

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_ENGINE` | `redis` | Queue engine to use (`redis` or `temporal`) |
| `TEMPORAL_DISABLED` | `true` | Set to `false` when Temporal is configured |
| `TEMPORAL_ADDRESS` | - | Temporal Cloud/server address (required for Temporal) |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `filot-ocr-queue` | Task queue name for OCR workflows |

### Current Default Behavior

By default, the system uses Redis as the queue engine. To use Temporal (once configured):

```bash
export QUEUE_ENGINE=temporal
export TEMPORAL_DISABLED=false
export TEMPORAL_ADDRESS=your-temporal-address
export TEMPORAL_NAMESPACE=your-namespace
```

---

## Dependencies Added

```json
{
  "@temporalio/client": "latest",
  "@temporalio/worker": "latest",
  "@temporalio/common": "latest"
}
```

These dependencies are installed and ready for use. The existing `ioredis` dependency remains for Redis fallback.

---

## How to Flip to Temporal (Future Tranche)

When ready to enable Temporal workflows:

1. **Deploy Temporal Infrastructure**
   - Set up Temporal Cloud or self-hosted Temporal server
   - Configure mTLS certificates if using Temporal Cloud

2. **Configure Environment Variables**
   ```bash
   QUEUE_ENGINE=temporal
   TEMPORAL_DISABLED=false
   TEMPORAL_ADDRESS=<your-temporal-address>
   TEMPORAL_NAMESPACE=<your-namespace>
   TEMPORAL_TASK_QUEUE=filot-ocr-queue
   ```

3. **Implement Temporal Workflows**
   - Update `temporalQueue.ts` to connect to Temporal client
   - Create OCR processing workflow in `temporal/workflows/`
   - Register activities from `temporal/activities/`

4. **Deploy Worker**
   - Start Temporal worker to process workflows
   - Configure worker with appropriate concurrency settings

---

## Fallback Behavior

The system is designed with automatic fallback:

1. If `QUEUE_ENGINE=temporal` but Temporal fails:
   - Logs a warning
   - Falls back to Redis queue automatically
   - Continues processing without interruption

2. If `TEMPORAL_DISABLED=true` with `QUEUE_ENGINE=temporal`:
   - Logs a warning about mismatch
   - Uses Redis queue

### Known Limitations (Preparation Phase)

The fallback mechanism in this preparation tranche is a best-effort implementation:

- **Concurrent failure handling**: The current implementation does not include mutex/locking for concurrent Temporal failures during fallback. This is acceptable for the preparation phase as Temporal is not yet configured.
- **State management**: Complex race conditions between queue state transitions are not fully addressed. These will be implemented in a future tranche when Temporal Cloud is configured and tested.

For production Temporal deployment, the following enhancements are recommended:
- Add promise-based locking for engine transitions
- Implement proper client lifecycle tracking separate from engine state
- Add integration tests for concurrent failure scenarios

---

## Testing

### Verify Redis Queue Still Works
```bash
# Default behavior - should use Redis
curl -X POST /api/documents/upload ...
# Check logs for: "Document queued for processing via Redis"
```

### Verify Temporal Stub Behavior
```bash
export QUEUE_ENGINE=temporal
export TEMPORAL_DISABLED=false
# Attempt to queue - should throw TemporalQueueNotConfiguredError
# and fall back to Redis
```

---

## Related Documentation

- [T6C Redis Queue Pipeline](./T6C_REDIS_QUEUE_PIPELINE.md) - Current Redis implementation
- [Temporal Documentation](./TEMPORAL.md) - Temporal workflow stubs and activities

---

## Next Steps (Future Tranches)

1. **T6.E (Planned):** Temporal Cloud infrastructure setup
2. **T6.F (Planned):** Implement OCR processing workflow in Temporal
3. **T6.G (Planned):** Migrate production traffic to Temporal
4. **T6.H (Planned):** Deprecate Redis queue (optional)
