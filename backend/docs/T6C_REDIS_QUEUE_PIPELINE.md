# Tranche T6.C - Redis Queue Pipeline Documentation

**Date:** November 27, 2025
**Objective:** Stabilize OCR pipeline by replacing in-memory queue with Redis, enabling persistent processing, backoff retry, file validation, and clean worker separation.

---

## Overview

This tranche migrates the FiLot OCR processing pipeline from an in-memory queue to a Redis-backed persistent queue system. This prepares the backend for full Temporal GPU workflow migration while providing immediate benefits in reliability, recoverability, and observability.

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `src/services/redisClient.ts` | **New** | Redis client singleton with connection management |
| `src/services/queueService.ts` | **New** | Persistent Redis queue operations |
| `src/workers/ocrWorker.ts` | **New** | Isolated OCR processing logic |
| `src/workers/queueWorker.ts` | **New** | Queue polling loop with retry logic |
| `src/workers/startupRecovery.ts` | **New** | Startup recovery for stuck documents |
| `src/ocr/processor.ts` | **Modified** | Replaced in-memory queue with Redis queue |
| `src/utils/fileValidation.ts` | **Modified** | Enhanced JPEG magic number validation |
| `src/routes/internalRoutes.ts` | **Modified** | Added verification result webhook stub |
| `src/index.ts` | **Modified** | Added startup recovery and graceful shutdown |

---

## Queue Flow Diagram

```
                                    +-----------------+
                                    |   Document      |
                                    |   Upload        |
                                    +--------+--------+
                                             |
                                             v
                              +---------------------------+
                              |   queueDocumentForProcessing()  |
                              |   (processor.ts)          |
                              +-------------+-------------+
                                            |
                                            v
+------------------+     enqueue()     +------------------+
|   Redis Queue    | <---------------- |  queueService.ts |
|   (FIFO List)    |                   +------------------+
+--------+---------+
         |
         | dequeue() [polling every 3s]
         v
+------------------+
|  queueWorker.ts  |
|  (Main Loop)     |
+--------+---------+
         |
         v
+------------------+
|   ocrWorker.ts   |
|  (OCR + Parse)   |
+--------+---------+
         |
    +----+----+
    |         |
    v         v
+-------+  +--------+
|Success|  | Failure|
+---+---+  +----+---+
    |           |
    v           v
markComplete()  incrementAttempts()
                    |
              +-----+-----+
              |           |
              v           v
         attempts < 3   attempts >= 3
              |           |
              v           v
         requeue()   markFailed()
         (with delay)  (permanent)
```

---

## Retry Logic Description

### Exponential Backoff Strategy

The queue worker implements an exponential backoff strategy for failed OCR jobs:

| Attempt | Delay Before Retry | Formula |
|---------|-------------------|---------|
| 1 | 3 seconds | BASE_DELAY * 3^0 |
| 2 | 9 seconds | BASE_DELAY * 3^1 |
| 3 | 27 seconds | BASE_DELAY * 3^2 |

### Retry Flow

1. **Initial Processing:** Document is dequeued and processed
2. **On Failure:** 
   - Attempt counter is incremented in Redis hash
   - If attempts < 3: Document is requeued with calculated delay
   - If attempts >= 3: Document is marked as permanently failed
3. **Delayed Queue Processing:**
   - A separate interval checks the delayed queue every 1 second
   - Documents whose delay has elapsed are moved back to the main queue

### Error Storage

Failed documents have their error stored in `result_json`:
```json
{
  "error": "Error message",
  "failedAt": "2025-11-27T10:00:00.000Z",
  "maxRetriesExceeded": true
}
```

---

## Redis Data Structures

| Key | Type | Description |
|-----|------|-------------|
| `filot:ocr:queue` | List | Main FIFO queue for documents |
| `filot:ocr:processing` | Set | Currently processing document IDs |
| `filot:ocr:attempts` | Hash | Attempt counts per document ID |
| `filot:ocr:delayed` | Sorted Set | Delayed documents (score = execute timestamp) |

### Atomic Operations

All queue operations use Redis pipelines for atomicity:
- `markComplete()` - Atomically removes from processing, attempts, and delayed queues
- `markFailed()` - Atomically removes from processing, attempts, and delayed queues
- `processDelayedQueue()` - Atomically moves documents from delayed to main queue

### Graceful Degradation

When Redis is unavailable:
- Queue worker runs in "degraded mode" (no processing)
- Health checks run every 3 seconds to detect Redis recovery
- Logs clearly indicate when Redis is lost/restored

---

## Startup Recovery Logic

On server startup (in `index.ts`):

1. **Redis Health Check:** Verify Redis connection is healthy
2. **Clear Processing Set:** Remove any stale entries from the processing set
3. **Query Stuck Documents:** Find all documents with `status = 'processing'`
4. **Clear All Queue State:** Remove document from all queues (main, processing, delayed)
5. **Reset Attempt Counter:** Set attempt counter back to 0
6. **Reset Status:** Set database status back to `'uploaded'`
7. **Requeue:** Add documents back to Redis queue with fresh state

This ensures no documents are lost if the server crashes during processing, and prevents
miscount of retry attempts from stale state.

---

## File Magic Number Validation

Enhanced JPEG validation now checks for these specific signatures:

| Format | Magic Bytes | Description |
|--------|-------------|-------------|
| JFIF | FF D8 FF E0 | Standard JPEG |
| EXIF | FF D8 FF E1 | JPEG with EXIF metadata |
| ICC | FF D8 FF E2 | JPEG with ICC profile |
| SPIFF | FF D8 FF E8 | SPIFF format |
| Raw | FF D8 FF DB | Raw JPEG |
| Adobe | FF D8 FF EE | Adobe JPEG |

PNG validation:
| Format | Magic Bytes |
|--------|-------------|
| PNG | 89 50 4E 47 0D 0A 1A 0A |

---

## Environment Variable Checklist

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL (e.g., `redis://localhost:6379`) |
| `REDIS_PASSWORD` | No | Redis password (if authentication required) |
| `SERVICE_INTERNAL_KEY` | Yes | Internal service authentication key |

---

## Internal Webhook Stub

**Endpoint:** `POST /internal/verification/result`

**Authentication:** Requires `x-service-key` header matching `SERVICE_INTERNAL_KEY`

**Request Body:**
```json
{
  "documentId": "uuid",
  "userId": "uuid",
  "verificationResult": "approved|rejected",
  "score": 85,
  "decision": "string",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification result received",
  "timestamp": "2025-11-27T10:00:00.000Z"
}
```

---

## Testing Instructions

### 1. Start Redis (if local development)
```bash
redis-server
```

### 2. Set Environment Variables
```bash
export REDIS_URL=redis://localhost:6379
export REDIS_PASSWORD=your_password  # if needed
export SERVICE_INTERNAL_KEY=your_secret_key
```

### 3. Start Backend Server
```bash
cd backend
npm run dev
```

### 4. Verify Startup Logs
Look for:
- "Redis connection healthy"
- "Starting queue worker"

### 5. Test Document Upload
Upload a document and verify:
- Document appears in Redis queue
- Queue worker processes the document
- Document status updates correctly

### 6. Test Retry Logic
Simulate a failure (e.g., corrupt image) and verify:
- Document is requeued with delay
- Attempt counter increments
- After 3 failures, document is marked as failed

### 7. Test Webhook Stub
```bash
curl -X POST http://localhost:8080/internal/verification/result \
  -H "Content-Type: application/json" \
  -H "x-service-key: your_secret_key" \
  -d '{"documentId": "test-uuid", "verificationResult": "approved"}'
```

---

## Migration Notes for Temporal

This Redis queue implementation serves as an intermediate step before full Temporal migration:

### Current State (T6.C)
- Redis-based persistent queue
- In-process worker polling
- Manual retry logic with exponential backoff

### Future Temporal Migration
- Replace `queueService.ts` with Temporal task queue
- Replace `queueWorker.ts` with Temporal worker
- Replace manual retry with Temporal retry policies
- OCR processing becomes a Temporal activity

### Key Abstractions Preserved
- `queueDocumentForProcessing()` API unchanged
- Worker separation (ocrWorker.ts) makes activity conversion straightforward
- Retry logic can be replaced with Temporal RetryPolicy

---

## Performance Considerations

1. **Queue Polling:** Worker polls every 3 seconds (configurable)
2. **Delayed Queue Check:** Every 1 second
3. **Single Worker:** Only one document processed at a time (sequential processing)
4. **Redis Commands:** Atomic operations for queue management

---

## Monitoring

Monitor these Redis keys for queue health:
```bash
# Queue length
redis-cli LLEN filot:ocr:queue

# Currently processing
redis-cli SCARD filot:ocr:processing

# Delayed count
redis-cli ZCARD filot:ocr:delayed
```

Use `getWorkerStatus()` function for programmatic monitoring:
```typescript
import { getWorkerStatus } from './workers/queueWorker';
const status = await getWorkerStatus();
// { isRunning: true, isProcessing: false, queueStats: {...} }
```

---

## Rollback Plan

If issues arise, rollback by:

1. Revert `processor.ts` to use in-memory queue
2. Remove Redis imports from `index.ts`
3. The in-memory implementation is preserved in git history

---

## Related Documentation

- [T6A Security Hardening](./T6A_SECURITY_HARDENING.md)
- [T6B Backend Security Patch](./T6B_BACKEND_SECURITY_PATCH.md)
- [Temporal Integration](./TEMPORAL.md)
