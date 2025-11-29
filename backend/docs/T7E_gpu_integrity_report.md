# T7-E GPU Worker Pipeline Integrity Report

**Date:** November 29, 2025  
**Task:** GPU Worker Pipeline Integrity Improvements (T7-E Task 3)

## Summary

This document details the GPU worker pipeline integrity improvements implemented in `backend/src/workers/ocr-gpu-worker.ts`. The changes focus on reliability, traceability, and race condition prevention for the GPU OCR processing pipeline.

---

## 1. Stuck-Job Reaper

### Implementation Details

Added a `reapStuckJobs()` function that monitors and recovers jobs that have been processing for too long.

**New Redis Keys:**
- `filot:ocr:gpu:processing:timestamps` - Hash storing processing start times for each document

**Configuration (Environment Variables):**
- `OCR_GPU_STUCK_TIMEOUT` - Job timeout in milliseconds (default: 300000 = 5 minutes)
- `OCR_GPU_REAPER_INTERVAL` - Reaper run interval in milliseconds (default: 60000 = 60 seconds)

**Functions Added:**
- `reapStuckJobs()` - Main reaper function that:
  - Gets all document IDs from GPU_PROCESSING_KEY set
  - Checks processing duration against timeout threshold
  - Moves stuck jobs back to queue (if retries available) or marks as failed
- `handleStuckJob()` - Handles individual stuck job recovery
- `setProcessingStartTime()` - Records when processing started
- `getProcessingStartTime()` - Retrieves processing start timestamp
- `clearProcessingStartTime()` - Clears timestamp on completion

**Reaper Integration:**
The reaper runs within the poll loop every 60 seconds (configurable). This approach avoids additional timers while ensuring regular stuck job detection.

---

## 2. Correlation IDs

### Implementation Details

Every job now has a unique correlation ID for end-to-end traceability.

**New Redis Key:**
- `filot:ocr:gpu:correlation` - Hash mapping document IDs to correlation IDs

**Functions Added:**
- `generateCorrelationId()` - Generates UUID v4 using `crypto.randomUUID()`
- `getCorrelationId()` - Retrieves correlation ID for a document
- `setCorrelationId()` - Stores correlation ID in Redis
- `clearCorrelationId()` - Removes correlation ID on completion

**Integration Points:**
- Correlation ID generated at enqueue time (`enqueueForGPU()`)
- Stored in Redis hash for persistence across worker restarts
- Included in ALL log entries for the job lifecycle
- Passed through `GPUOCRResult` interface to result publishing
- Cleaned up on job completion

**Updated Interface:**
```typescript
export interface GPUOCRResult {
  success: boolean;
  documentId: string;
  correlationId?: string;  // NEW
  // ... other fields
}
```

---

## 3. Race Condition Prevention

### Implementation Details

Multiple mechanisms prevent race conditions in the processing pipeline.

**New Redis Key:**
- `filot:ocr:gpu:lock:<documentId>` - Per-document processing locks

**Configuration:**
- `OCR_GPU_LOCK_TTL` - Lock TTL in seconds (default: 600 = 10 minutes)

**Functions Added:**
- `acquireProcessingLock()` - Uses Redis SETNX to acquire exclusive lock
- `releaseProcessingLock()` - Releases the lock on completion

**Atomic Operations:**
The dequeue operation now uses Redis MULTI/EXEC for atomicity:
```typescript
const pipeline = redis.multi();
pipeline.sadd(GPU_PROCESSING_KEY, documentId);
pipeline.hset(GPU_PROCESSING_TIMESTAMPS_KEY, documentId, Date.now().toString());
const results = await pipeline.exec();
```

**Document Status Check:**
Before processing, the worker checks the current document status in the database:
```typescript
const status = await checkDocumentStatus(documentId);
if (status === "processing" || status === "completed") {
  // Skip - already being handled
}
```

**Race Condition Scenarios Handled:**
1. **Multiple workers dequeue same job:** Lock prevents duplicate processing
2. **Worker crashes mid-processing:** Reaper recovers stuck jobs
3. **Document already completed:** Status check prevents reprocessing

---

## 4. Database Status Tracking

### Status Flow Implementation

The document processing now follows the defined status flow:

```
uploaded -> processing -> ocr_completed -> ai_evaluated -> (auto_approve | auto_reject | needs_review)
```

**Status Transitions in Code:**

1. **uploaded -> processing**
   ```typescript
   await db.update(documents)
     .set({ status: "processing" })
     .where(eq(documents.id, documentId));
   ```

2. **processing -> ocr_completed**
   ```typescript
   await db.update(documents)
     .set({ 
       verificationStatus: "ocr_completed",
       ocrText: ocrText,
     })
     .where(eq(documents.id, documentId));
   ```

3. **ocr_completed -> ai_evaluated**
   ```typescript
   await db.update(documents)
     .set({ 
       verificationStatus: "ai_evaluated",
       aiScore: score,
       aiDecision: decision,
       resultJson: parsedResult,
     })
     .where(eq(documents.id, documentId));
   ```

4. **ai_evaluated -> final outcome**
   ```typescript
   await db.update(documents)
     .set({
       status: "completed",
       verificationStatus: outcome, // auto_approved | auto_rejected | pending_manual_review
       processedAt: new Date(),
     })
     .where(eq(documents.id, documentId));
   ```

---

## 5. Configuration Summary

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_GPU_QUEUE_KEY` | `filot:ocr:gpu:queue` | Redis queue key |
| `OCR_GPU_PROCESSING_KEY` | `filot:ocr:gpu:processing` | Redis processing set key |
| `OCR_GPU_ATTEMPTS_KEY` | `filot:ocr:gpu:attempts` | Redis attempts hash key |
| `OCR_GPU_PUBLISH_CHANNEL` | `filot:ocr:gpu:results` | Redis pub/sub channel |
| `OCR_GPU_CONCURRENCY` | `2` | Max concurrent jobs |
| `OCR_GPU_POLL_INTERVAL` | `1000` | Poll interval in ms |
| `OCR_GPU_MAX_RETRIES` | `3` | Max retry attempts |
| `OCR_GPU_STUCK_TIMEOUT` | `300000` | Stuck job timeout (5 min) |
| `OCR_GPU_REAPER_INTERVAL` | `60000` | Reaper interval (60 sec) |
| `OCR_GPU_LOCK_TTL` | `600` | Lock TTL in seconds |

### Redis Keys Used

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `filot:ocr:gpu:queue` | List | Pending jobs queue |
| `filot:ocr:gpu:processing` | Set | Currently processing jobs |
| `filot:ocr:gpu:attempts` | Hash | Retry attempt counts |
| `filot:ocr:gpu:processing:timestamps` | Hash | Processing start times |
| `filot:ocr:gpu:correlation` | Hash | Correlation ID mappings |
| `filot:ocr:gpu:lock:<docId>` | String | Per-document processing locks |

---

## 6. Updated Worker Status

The `getGPUWorkerStatus()` function now returns additional fields:

```typescript
{
  isRunning: boolean;
  isGPUAvailable: boolean;
  isGPUEnabled: boolean;
  activeJobsCount: number;
  queueLength: number;
  processingCount: number;
  autoFallbackEnabled: boolean;
  maxRetries: number;
  stuckJobTimeoutMs: number;  // NEW
  reaperIntervalMs: number;   // NEW
}
```

---

## 7. Cleanup Improvements

The `clearGPUQueues()` function now cleans all related keys:
- Queue list
- Processing set
- Attempts hash
- Processing timestamps hash
- Correlation IDs hash
- All per-document locks

---

## 8. Testing Recommendations

1. **Stuck Job Recovery Test:**
   - Enqueue a job
   - Manually add to processing set without processing
   - Wait for reaper (60 seconds)
   - Verify job is requeued or marked failed

2. **Correlation ID Traceability Test:**
   - Process multiple documents
   - Verify each log entry contains correlationId
   - Verify published results contain correlationId

3. **Race Condition Test:**
   - Run multiple worker instances
   - Enqueue same document multiple times
   - Verify only one instance processes it

4. **Status Flow Test:**
   - Process a document
   - Verify database shows status transitions in correct order

---

## Conclusion

These improvements significantly enhance the reliability and observability of the GPU OCR worker pipeline. The stuck job reaper prevents orphaned jobs, correlation IDs enable end-to-end tracing, and atomic operations prevent race conditions.
