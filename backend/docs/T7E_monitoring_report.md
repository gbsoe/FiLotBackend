# T7-E Cloud Observability & Monitoring Report

**Date:** November 29, 2025  
**Task:** T7-E Task 6 - Cloud Observability & Monitoring  
**Status:** Completed

## Overview

This document details the cloud observability and monitoring infrastructure implemented for the FiLot backend production deployment.

---

## 1. CloudWatch Log Integration

### Log Group Configuration

| Log Group | Purpose |
|-----------|---------|
| `/ecs/filot-ocr-gpu-worker` | GPU OCR worker logs |
| `/ecs/filot-backend` | Main backend API logs |

### Log Event Types

The following structured log events are emitted for CloudWatch Logs:

| Event Type | Description | Fields |
|------------|-------------|--------|
| `queue_pull` | Document dequeued for processing | documentId, correlationId, queueType, action |
| `processing_done` | OCR processing completed | documentId, correlationId, success, processingTimeMs, processorType |
| `fallback_event` | GPU to CPU fallback | documentId, correlationId, reason, fromProcessor, toProcessor |
| `ai_evaluation_done` | AI scoring completed | documentId, correlationId, score, decision, outcome |
| `buli2_forward` | Document sent to BULI2 | documentId, correlationId, reviewId, success, responseTimeMs |

### Log Format

All logs are emitted in CloudWatch EMF (Embedded Metric Format) for automatic metric extraction:

```json
{
  "_aws": {
    "Timestamp": "2025-11-29T10:30:00.000Z",
    "CloudWatchMetrics": [{
      "Namespace": "FiLot",
      "Dimensions": [["Environment"]],
      "Metrics": [{ "Name": "metric_name", "Unit": "Count" }]
    }]
  },
  "metric_name": 1,
  "Environment": "production"
}
```

---

## 2. Metrics Implementation

### Metrics Utility (`backend/src/utils/metrics.ts`)

Created a comprehensive metrics emitter utility with the following features:

- CloudWatch EMF-compatible metric format
- Metric buffering with configurable batch size
- Automatic flush timer
- Dimension support for metric filtering
- Integration with Redis for queue metrics

### Metrics Catalog

| Metric Name | Unit | Description | Dimensions |
|-------------|------|-------------|------------|
| `filot.queue_length` | Count | Number of documents in queue | QueueType (gpu/cpu/total) |
| `filot.gpu.active_jobs` | Count | Currently processing GPU jobs | - |
| `filot.gpu.processing_time_ms` | Milliseconds | GPU OCR processing duration | DocumentId, ProcessorType |
| `filot.verification.latency_ms` | Milliseconds | End-to-end verification latency | DocumentId, Outcome |
| `filot.buli2.retry_count` | Count | Items in BULI2 retry queue | - |
| `filot.ocr.success_count` | Count | Successful OCR operations | DocumentId, ProcessorType |
| `filot.ocr.failure_count` | Count | Failed OCR operations | DocumentId, ProcessorType |
| `filot.ai.evaluation_count` | Count | AI evaluation operations | DocumentId, Decision, ScoreBucket |
| `filot.buli2.forward_count` | Count | BULI2 forward operations | DocumentId, Success |
| `filot.gpu.fallback_count` | Count | GPU to CPU fallback events | DocumentId, Reason |

### Metrics API Functions

```typescript
// Record queue metrics from Redis
await recordQueueMetrics();

// Record BULI2 retry queue depth
await recordBuli2RetryMetrics();

// Record processing time
recordProcessingTime(documentId, 1500, true);

// Record verification latency
recordVerificationLatency(documentId, 2500, 'auto_approved');

// Record OCR result
recordOcrResult(documentId, true, 'GPU');

// Record AI evaluation
recordAiEvaluation(documentId, 'auto_approve', 85);

// Record BULI2 forward
recordBuli2Forward(documentId, true);

// Record fallback event
recordFallbackToCpu(documentId, 'gpu_unavailable');
```

---

## 3. Metrics Endpoint

### `/metrics` Endpoint

Added a new metrics endpoint to the health routes:

```bash
GET /metrics
```

**Response:**
```json
{
  "ok": true,
  "metrics": {
    "timestamp": "2025-11-29T10:30:00.000Z",
    "uptime": 3600,
    "environment": "production",
    "queues": {
      "gpuQueueLength": 5,
      "cpuQueueLength": 2,
      "gpuActiveJobs": 2,
      "buli2RetryQueueLength": 0
    },
    "gpuWorker": {
      "isRunning": true,
      "isGPUAvailable": true,
      "isGPUEnabled": true,
      "activeJobsCount": 2,
      "autoFallbackEnabled": true
    },
    "circuitBreaker": {
      "buli2": {
        "state": "CLOSED",
        "failures": 0,
        "successes": 42
      }
    },
    "metricsBuffer": {
      "size": 5
    }
  }
}
```

---

## 4. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_NAMESPACE` | `FiLot` | CloudWatch metric namespace |
| `CLOUDWATCH_LOG_GROUP` | `/ecs/filot-ocr-gpu-worker` | Log group for EMF logs |
| `METRICS_ENABLED` | `true` | Enable/disable metrics emission |
| `METRICS_BATCH_SIZE` | `10` | Flush buffer after N metrics |
| `METRICS_FLUSH_INTERVAL_MS` | `60000` | Auto-flush interval (60s) |

---

## 5. Files Created/Modified

| File | Change |
|------|--------|
| `backend/src/utils/metrics.ts` | **NEW** - Metrics emitter utility |
| `backend/src/controllers/health.controller.ts` | Added `getMetrics` function |
| `backend/src/routes/health.routes.ts` | Added `/metrics` route |

---

## 6. CloudWatch Dashboard Recommendations

### Widgets to Create

1. **Queue Depth Graph**
   - Metric: `filot.queue_length`
   - Dimensions: QueueType
   - Period: 1 minute

2. **GPU Active Jobs**
   - Metric: `filot.gpu.active_jobs`
   - Period: 1 minute

3. **Processing Time (P95)**
   - Metric: `filot.gpu.processing_time_ms`
   - Statistic: p95
   - Period: 5 minutes

4. **BULI2 Retry Queue**
   - Metric: `filot.buli2.retry_count`
   - Period: 1 minute

5. **OCR Success Rate**
   - Metrics: `filot.ocr.success_count`, `filot.ocr.failure_count`
   - Math expression: (success / (success + failure)) * 100
   - Period: 5 minutes

6. **GPU Fallback Rate**
   - Metric: `filot.gpu.fallback_count`
   - Period: 5 minutes

---

## 7. Alarm Recommendations

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| High Queue Depth | `filot.queue_length` | > 100 for 5m | SNS notification |
| GPU Worker Down | `filot.gpu.active_jobs` | = 0 for 10m | PagerDuty |
| BULI2 Retry Backlog | `filot.buli2.retry_count` | > 50 for 10m | SNS notification |
| High Processing Time | `filot.gpu.processing_time_ms` | p95 > 60000 for 5m | SNS notification |
| Low Success Rate | Math expression | < 95% for 5m | PagerDuty |

---

## 8. Integration Points

### GPU Worker Integration

The GPU OCR worker now emits metrics at key processing stages:
- Queue pull events
- Processing completion
- AI evaluation completion
- BULI2 forwarding
- Fallback events

### BULI2 Service Integration

The forwardToBuli2 service emits metrics for:
- Forward success/failure
- Retry queue depth
- Circuit breaker state changes

---

## 9. Testing Recommendations

1. **Verify EMF Format**
   - Check CloudWatch Logs for valid EMF entries
   - Verify automatic metric creation in CloudWatch Metrics

2. **Load Test Metrics**
   - Generate load and verify metric accuracy
   - Check metric buffer flush behavior

3. **Alarm Testing**
   - Manually trigger threshold conditions
   - Verify alarm notifications

---

## Conclusion

The monitoring infrastructure provides comprehensive observability for the FiLot production deployment:

- Structured logging with CloudWatch EMF format
- Real-time metrics for all key system components
- HTTP endpoint for external monitoring tools
- Recommendations for dashboards and alarms

All changes compile cleanly with TypeScript.
