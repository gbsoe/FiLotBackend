# Tranche T7-B: GPU OCR Worker Implementation

## Overview

Tranche T7-B introduces GPU-accelerated OCR processing for the FiLot backend. This implementation provides high-performance document processing using NVIDIA CUDA-enabled hardware with automatic CPU fallback for environments without GPU support.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        FiLot Backend                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Upload    │────▶│  GPU Queue  │────▶│  GPU Worker │       │
│  │  Controller │     │   (Redis)   │     │  (CUDA/CPU) │       │
│  └─────────────┘     └─────────────┘     └──────┬──────┘       │
│                                                  │              │
│                      ┌─────────────┐             │              │
│                      │   Pub/Sub   │◀────────────┘              │
│                      │  (Results)  │                            │
│                      └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### GPU Worker Flow

1. **Document Upload**: Documents are uploaded and stored in R2
2. **Queue Enqueue**: Document ID is pushed to the GPU queue (`filot:ocr:gpu:queue`)
3. **Worker Poll**: GPU worker polls the queue at configurable intervals
4. **Processing**: Document is processed using GPU-accelerated Tesseract OCR
5. **Result Publication**: Results are published to Redis Pub/Sub channel
6. **Database Update**: Document record is updated with OCR results and verification status

## Files

| File | Purpose |
|------|---------|
| `src/workers/ocr-gpu-worker.ts` | GPU worker implementation |
| `Dockerfile.gpu` | CUDA-enabled Docker image |
| `scripts/deploy-ocr-gpu.sh` | AWS ECS deployment script |
| `infra/ecs/task-ocr-gpu.json` | ECS task definition |

## GPU Worker API

### Exports

```typescript
// Start the GPU worker
startGPUWorker(): Promise<boolean>

// Stop the GPU worker
stopGPUWorker(): void

// Get worker status and metrics
getGPUWorkerStatus(): Promise<{
  isRunning: boolean;
  isGPUAvailable: boolean;
  isGPUEnabled: boolean;
  activeJobsCount: number;
  queueLength: number;
  processingCount: number;
  autoFallbackEnabled: boolean;
  maxRetries: number;
}>

// Check if GPU is enabled
isGPUEnabled(): boolean

// Enqueue document for GPU processing
enqueueForGPU(documentId: string): Promise<boolean>

// Process a single document (internal)
processDocumentGPU(documentId: string): Promise<GPUOCRResult>

// Get queue length
getGPUQueueLength(): Promise<number>

// Clear all GPU queues
clearGPUQueues(): Promise<void>
```

### GPUOCRResult Interface

```typescript
interface GPUOCRResult {
  success: boolean;
  documentId: string;
  ocrText?: string;
  parsedResult?: Record<string, unknown>;
  score?: number;
  decision?: string;
  outcome?: string;
  error?: string;
  gpuProcessed: boolean;
  processingTimeMs?: number;
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_GPU_ENABLED` | `false` | Enable GPU OCR processing |
| `OCR_GPU_CONCURRENCY` | `2` | Number of concurrent GPU jobs |
| `OCR_GPU_POLL_INTERVAL` | `1000` | Queue poll interval (ms) |
| `OCR_GPU_AUTOFALLBACK` | `true` | Auto-fallback to CPU if GPU unavailable |
| `OCR_GPU_MAX_RETRIES` | `3` | Max retry attempts per document |
| `OCR_GPU_QUEUE_KEY` | `filot:ocr:gpu:queue` | Redis queue key |
| `OCR_GPU_PROCESSING_KEY` | `filot:ocr:gpu:processing` | Redis processing set key |
| `OCR_GPU_ATTEMPTS_KEY` | `filot:ocr:gpu:attempts` | Redis attempts hash key |
| `OCR_GPU_PUBLISH_CHANNEL` | `filot:ocr:gpu:results` | Redis Pub/Sub channel |
| `OCR_GPU_DRIVER` | `tesseract` | OCR driver to use |

## Docker Image (Dockerfile.gpu)

### Base Image
- `nvidia/cuda:12.2.0-runtime-ubuntu22.04`

### Installed Components
- Node.js 20
- Tesseract OCR with English and Indonesian language packs
- Non-root user (`filot`)

### Build

```bash
cd backend
docker build -f Dockerfile.gpu -t filot-ocr-gpu-worker .
```

### Run

```bash
docker run --gpus all \
  -e OCR_GPU_ENABLED=true \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  filot-ocr-gpu-worker
```

### Health Check
The container includes a health check probing `http://localhost:8080/health` every 30 seconds.

## AWS ECS Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- ECS cluster with GPU-enabled instances (g4dn.*)
- Secrets configured in AWS Secrets Manager

### Deployment Script

```bash
# Build only
./scripts/deploy-ocr-gpu.sh build

# Push to ECR
./scripts/deploy-ocr-gpu.sh push

# Register task and update service
./scripts/deploy-ocr-gpu.sh deploy

# Full deployment (build + push + deploy)
./scripts/deploy-ocr-gpu.sh all
```

### Task Definition

The ECS task definition (`infra/ecs/task-ocr-gpu.json`) specifies:

| Resource | Value |
|----------|-------|
| GPU | 1 |
| CPU | 2048 |
| Memory | 8192 MB |
| Shared Memory | 2048 MB |
| Placement | g4dn.* instances |

### Required Secrets (Secrets Manager)

- `filot/database-url`
- `filot/redis-url`
- `filot/redis-password`
- `filot/cf-r2-endpoint`
- `filot/cf-r2-access-key`
- `filot/cf-r2-secret-key`
- `filot/cf-r2-bucket`
- `filot/buli2-api-url`
- `filot/buli2-callback-url`

## GPU Detection

The worker automatically detects GPU availability based on:

1. `OCR_GPU_ENABLED` environment variable
2. `NVIDIA_VISIBLE_DEVICES` not set to "none"

If GPU is unavailable and `OCR_GPU_AUTOFALLBACK=true`, the worker will process documents using CPU-based OCR.

## Retry Logic

1. Failed documents are requeued up to `OCR_GPU_MAX_RETRIES` times
2. Attempt count is tracked in Redis hash (`OCR_GPU_ATTEMPTS_KEY`)
3. After max retries:
   - If `OCR_GPU_AUTOFALLBACK=true`: Falls back to CPU processing
   - Otherwise: Document is marked as failed

## Monitoring

### CloudWatch Logs
- Log group: `/ecs/filot-ocr-gpu-worker`
- Stream prefix: `ecs`

### Metrics to Monitor
- Queue length (`getGPUWorkerStatus().queueLength`)
- Processing count (`getGPUWorkerStatus().processingCount`)
- Active jobs (`getGPUWorkerStatus().activeJobsCount`)
- Processing time (logged per document)

## Integration with Hybrid Verification

The GPU worker integrates with the existing hybrid verification system:

1. **OCR Processing**: Extracts text using GPU-accelerated Tesseract
2. **Document Parsing**: Parses KTP/NPWP fields from OCR text
3. **AI Scoring**: Computes confidence score (0-100)
4. **Decision Engine**: Determines verification path
5. **BULI2 Escalation**: Documents requiring manual review are escalated

## Security Considerations

- Worker runs as non-root user (`filot`)
- Secrets are injected from AWS Secrets Manager
- Temporary files are cleaned up after processing
- Network access restricted via ECS security groups

## Troubleshooting

### GPU Not Detected
1. Verify `OCR_GPU_ENABLED=true`
2. Check `NVIDIA_VISIBLE_DEVICES` is not "none"
3. Ensure NVIDIA drivers are installed on host

### Documents Stuck in Processing
1. Check Redis connectivity
2. Verify worker is running (`getGPUWorkerStatus().isRunning`)
3. Clear stuck documents: `clearGPUQueues()`

### High Failure Rate
1. Check document quality/format
2. Review CloudWatch logs for errors
3. Consider increasing `OCR_GPU_MAX_RETRIES`

## Changelog

### T7-B (Initial Release)
- Implemented GPU OCR worker with Redis queue
- Added CUDA-enabled Dockerfile
- Created ECS deployment infrastructure
- Integrated with hybrid verification system
- Added CPU fallback support
- Implemented retry logic with configurable attempts
