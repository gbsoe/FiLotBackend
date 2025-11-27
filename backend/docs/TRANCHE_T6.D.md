# TRANCHE T6.D — TEMPORAL MIGRATION PREPARATION

**Date:** 2025-11-27  
**Status:** Complete  
**Purpose:** Prepare FiLot backend codebase to be Temporal-ready while keeping Redis queue as fallback

---

## Overview

This tranche adds a queue abstraction layer to the FiLot backend, enabling a future migration from Redis-based queues to Temporal workflows. The existing Redis queue implementation remains fully functional and serves as the default queue engine. The Temporal adapter is implemented as a skeleton with helpful error messages for when Temporal is not configured.

---

## Summary of Changes

### Files Created

| File | Description |
|------|-------------|
| `src/queue/index.ts` | QueueClient interface, factory function, and engine selection |
| `src/queue/redisQueue.ts` | Redis adapter implementing QueueClient interface |
| `src/queue/temporalQueue.ts` | Temporal adapter skeleton with stub implementations |
| `src/temporal/client.ts` | Temporal client creation function with lazy initialization |
| `src/temporal/types.ts` | TypeScript interfaces for OCR workflow and activity inputs/outputs |
| `src/temporal/workflows/README.md` | Workflow documentation with signatures and configuration |
| `test/queue.test.ts` | Unit tests for queue abstraction |
| `README.md` | Backend documentation with environment variables |

### Files Modified

| File | Changes |
|------|---------|
| `src/ocr/processor.ts` | Updated to use queue abstraction with Redis fallback |
| `src/index.ts` | Added OCR engine logging at startup |
| `src/controllers/health.controller.ts` | Added `ocrEngine` field to health response |
| `src/temporal/index.ts` | Added exports for new types and client |
| `package.json` | Added Temporal SDK and Jest dependencies |

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
- `isAutoFallbackEnabled()`: Returns whether auto-fallback is enabled
- `isTemporalConfigured()`: Returns whether Temporal is properly configured

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_ENGINE` | `redis` | Queue engine to use (`redis` or `temporal`) |
| `QUEUE_ENGINE` | `redis` | Legacy alias for OCR_ENGINE (backward compatible) |
| `OCR_AUTOFALLBACK` | `true` | Auto-fallback to Redis if Temporal unavailable |
| `TEMPORAL_ENDPOINT` | - | Temporal Cloud/server address |
| `TEMPORAL_ADDRESS` | - | Alternative to TEMPORAL_ENDPOINT |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `filot-ocr` | Task queue name for OCR workflows |
| `TEMPORAL_API_KEY` | - | API key for Temporal Cloud (store in secrets) |
| `TEMPORAL_DISABLED` | `true` | Set to `false` when Temporal is configured |

---

## How to Run with Redis (Default)

```bash
# Default behavior - uses Redis queue
cd backend
npm install
npm run dev

# Verify with health check
curl http://localhost:8080/health
# Response: { "ok": true, "ocrEngine": "redis", "temporalConfigured": false }
```

---

## How to Switch to Temporal (Future Tranche)

When ready to enable Temporal workflows:

### 1. Deploy Temporal Infrastructure
- Set up Temporal Cloud or self-hosted Temporal server
- Configure mTLS certificates if using Temporal Cloud

### 2. Configure Environment Variables
```bash
export OCR_ENGINE=temporal
export TEMPORAL_DISABLED=false
export TEMPORAL_ENDPOINT=<your-temporal-address>
export TEMPORAL_NAMESPACE=<your-namespace>
export TEMPORAL_TASK_QUEUE=filot-ocr
# Store TEMPORAL_API_KEY in Replit Secrets
```

### 3. Implement Temporal Workflows
- Update `temporalQueue.ts` to connect to Temporal client
- Create OCR processing workflow in `temporal/workflows/`
- Register activities from `temporal/activities/`

### 4. Deploy Worker
- Start Temporal worker to process workflows
- Configure worker with appropriate concurrency settings

---

## Fallback Behavior

The system is designed with automatic fallback:

### When OCR_ENGINE=temporal but Temporal fails:
1. If `OCR_AUTOFALLBACK=true` (default):
   - Logs a warning
   - Falls back to Redis queue automatically
   - Continues processing without interruption

2. If `OCR_AUTOFALLBACK=false`:
   - Server refuses to start
   - Prints explicit error with required environment variables

### When TEMPORAL_DISABLED=true with OCR_ENGINE=temporal:
- Logs a warning about mismatch
- Uses Redis queue

---

## Safety Notes

- No secret keys are added to the codebase
- `TEMPORAL_API_KEY` should be stored in Replit Secrets or secure secret manager
- Default engine remains `redis` - no production changes without explicit configuration
- All `console.log` of tokens or secrets is avoided

---

## Rollback Instructions

To rollback to working state:

```bash
# Set environment to use Redis
export OCR_ENGINE=redis
# Or simply unset OCR_ENGINE
unset OCR_ENGINE

# Restart the backend
npm run dev
```

If needed, revert the branch with:
```bash
git checkout main -- backend/
```

---

## Temporal Workflow Contracts

### OCR Processing Workflow

**Workflow name:** `filot.ocrs.workflow`

**Input:**
```typescript
interface OCRWorkflowInput {
  documentId: string;
  userId?: string;
}
```

**Activities:**
1. `downloadFromR2` - Fetch document from R2 storage
2. `runOCR` - Execute Tesseract OCR
3. `parse` - Extract structured data
4. `saveResult` - Persist to database

**Task Queue:** `filot-ocr`

See `src/temporal/workflows/README.md` for full documentation.

---

## Dependencies Added

```json
{
  "@temporalio/client": "^1.11.7",
  "@temporalio/worker": "^1.11.7",
  "@temporalio/common": "^1.11.7",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5",
  "@types/jest": "^29.5.12"
}
```

Existing `ioredis` dependency remains for Redis fallback.

---

## Testing

### Run Unit Tests
```bash
cd backend
npm test
```

### Verify Redis Queue Still Works
```bash
# Default behavior - should use Redis
npm run dev
curl http://localhost:8080/health
# Response includes: "ocrEngine": "redis"
```

### Verify Temporal Stub Behavior
```bash
export OCR_ENGINE=temporal
export TEMPORAL_DISABLED=false
npm run dev
# Should fall back to Redis and log warning
# Health check shows: "ocrEngine": "redis"
```

---

## Health Endpoint

`GET /health` now returns:

```json
{
  "ok": true,
  "status": "ok",
  "uptime": 123,
  "timestamp": "2025-11-27T12:00:00.000Z",
  "environment": "development",
  "ocrEngine": "redis",
  "temporalConfigured": false
}
```

---

## Startup Logs

Server startup now logs the selected OCR engine:

```
Using OCR engine: redis
OCR Engine Configuration { engine: 'redis', temporalConfigured: false, autoFallbackEnabled: true }
```

---

## Related Documentation

- [T6.C Redis Queue Pipeline](./T6C_REDIS_QUEUE_PIPELINE.md) - Current Redis implementation
- [Temporal Documentation](./TEMPORAL.md) - Temporal workflow stubs and activities
- [Temporal Workflows README](../src/temporal/workflows/README.md) - Workflow signatures

---

## Next Steps (Future Tranches)

1. **T6.E (Planned):** Temporal Cloud infrastructure setup
2. **T6.F (Planned):** Implement OCR processing workflow in Temporal
3. **T6.G (Planned):** Migrate production traffic to Temporal
4. **T6.H (Planned):** Deprecate Redis queue (optional)

---

## Success Criteria Verification

- [x] `npm install` completes without errors
- [x] `npm run build` finishes with zero TypeScript errors
- [x] Unit tests for queue abstraction pass
- [x] App starts with `OCR_ENGINE=redis` and health returns `ocrEngine: "redis"`
- [x] App starts with `OCR_ENGINE=temporal` without Temporal env: falls back to redis
- [x] No secrets added to codebase
- [x] Existing Redis functionality preserved
