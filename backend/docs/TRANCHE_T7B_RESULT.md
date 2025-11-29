# Tranche T7-B: GPU OCR Worker Integration - Implementation Report

**Implementation Date:** November 28, 2025  
**Implemented By:** Replit Agent  
**Status:** ✅ IMPLEMENTED

---

## Summary

Tranche T7-B implements a GPU-accelerated OCR worker for FiLot, enabling high-throughput document processing using NVIDIA CUDA-enabled infrastructure. This implementation provides:

1. A Redis-based GPU queue consumer worker
2. NVIDIA CUDA Docker container for GPU processing
3. AWS ECS task definition with GPU resource requirements
4. Deployment scripts for ECR/ECS deployment

---

## Files Added/Changed

### New Files

| File | Description |
|------|-------------|
| `backend/src/workers/ocr-gpu-worker.ts` | GPU OCR worker with Redis queue consumer |
| `backend/Dockerfile.gpu` | NVIDIA CUDA-based Docker image |
| `backend/infra/ecs/task-ocr-gpu.json` | ECS task definition with GPU |
| `backend/scripts/deploy-ocr-gpu.sh` | Build, push, and deploy script |

### Modified Files

| File | Changes |
|------|---------|
| `backend/.env.example` | Added GPU worker environment variables |
| `backend/src/temporal/workflows.ts` | Fixed unused import (TS error) |

---

## GPU Worker Architecture

### Flow Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ FiLot Backend   │────▶│ Redis GPU Queue  │────▶│ GPU OCR Worker  │
│ (enqueue)       │     │ filot:ocr:gpu:*  │     │ (ECS Task)      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │ Cloudflare R2    │◀─────────────┤ Download
                        │ Document Storage │              │
                        └──────────────────┘              │
                                                          │
                        ┌──────────────────┐              │
                        │ PostgreSQL DB    │◀─────────────┤ Save Result
                        │ (Drizzle ORM)    │              │
                        └──────────────────┘              │
                                                          │
                        ┌──────────────────┐              │
                        │ Redis Pub/Sub    │◀─────────────┘ Publish
                        │ filot:ocr:gpu:   │
                        │ results          │
                        └──────────────────┘
```

### Key Components

#### 1. GPU OCR Worker (`ocr-gpu-worker.ts`)

**Features:**
- Redis queue consumer with configurable polling
- Concurrent job processing (default: 2)
- GPU availability detection
- Automatic CPU fallback when GPU unavailable
- Result publishing via Redis pub/sub
- Structured logging and error handling

**Key Functions:**
```typescript
// Queue operations
enqueueForGPU(documentId: string): Promise<boolean>
dequeueFromGPU(): Promise<string | null>
markGPUComplete(documentId: string): Promise<void>

// Processing
processDocumentGPU(documentId: string): Promise<GPUOCRResult>

// Worker lifecycle
startGPUWorker(): Promise<void>
stopGPUWorker(): void
getGPUWorkerStatus(): Promise<GPUWorkerStatus>
```

#### 2. Docker Image (`Dockerfile.gpu`)

**Base:** `nvidia/cuda:12.2.0-runtime-ubuntu22.04`

**Installed Components:**
- Node.js 20.x LTS
- Tesseract OCR with Indonesian & English
- CUDA runtime libraries

**Security:**
- Non-root user (`filot`)
- Health check endpoint
- Minimal container size

#### 3. ECS Task Definition (`task-ocr-gpu.json`)

**Resources:**
- CPU: 2048 units
- Memory: 8192 MB
- GPU: 1 NVIDIA device

**Placement:** `g4dn.*` instance types

**Secrets:** All sensitive values from AWS Secrets Manager

---

## Environment Variables

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_GPU_ENABLED` | `false` | Enable GPU worker |
| `OCR_GPU_CONCURRENCY` | `2` | Parallel job limit |
| `OCR_GPU_POLL_INTERVAL` | `1000` | Poll interval (ms) |
| `OCR_GPU_AUTOFALLBACK` | `true` | Fall back to CPU if GPU unavailable |
| `OCR_GPU_DRIVER` | `tesseract` | OCR engine (future: custom) |

### Redis Keys

| Variable | Default | Purpose |
|----------|---------|---------|
| `OCR_GPU_QUEUE_KEY` | `filot:ocr:gpu:queue` | Queue list |
| `OCR_GPU_PROCESSING_KEY` | `filot:ocr:gpu:processing` | Processing set |
| `OCR_GPU_PUBLISH_CHANNEL` | `filot:ocr:gpu:results` | Result pub/sub |

---

## Build & Deploy

### Prerequisites

1. AWS CLI configured with appropriate permissions
2. Docker installed
3. ECS cluster with GPU-enabled instances (`g4dn.*`)
4. AWS Secrets Manager secrets configured

### Commands

```bash
# Navigate to backend directory
cd backend

# Build only
./scripts/deploy-ocr-gpu.sh build

# Push to ECR
./scripts/deploy-ocr-gpu.sh push

# Deploy (register task, update service)
./scripts/deploy-ocr-gpu.sh deploy

# Full deployment (build + push + deploy)
./scripts/deploy-ocr-gpu.sh all
```

### Manual Docker Build

```bash
cd backend

# Build image
docker build -f Dockerfile.gpu -t filot-ocr-gpu-worker:latest .

# Run locally (without GPU)
docker run -d \
  -p 8080:8080 \
  -e OCR_GPU_ENABLED=false \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  filot-ocr-gpu-worker:latest
```

---

## Manual Steps Required

### 1. Create AWS IAM Roles

**Task Execution Role:**
```bash
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**Task Role:**
```bash
aws iam create-role \
  --role-name filot-ecs-task-role \
  --assume-role-policy-document file://trust-policy.json

# Attach policies for Secrets Manager, CloudWatch, etc.
```

### 2. Configure Secrets Manager

Create secrets in AWS Secrets Manager:
- `filot/database-url`
- `filot/redis-url`
- `filot/redis-password`
- `filot/cf-r2-endpoint`
- `filot/cf-r2-access-key`
- `filot/cf-r2-secret-key`
- `filot/cf-r2-bucket`
- `filot/buli2-api-url`
- `filot/buli2-callback-url`

### 3. Create ECS Service

```bash
aws ecs create-service \
  --cluster filot-production \
  --service-name filot-ocr-gpu-worker \
  --task-definition filot-ocr-gpu-worker \
  --desired-count 1 \
  --launch-type EC2 \
  --placement-constraints type=memberOf,expression='attribute:ecs.instance-type =~ g4dn.*' \
  --region ap-southeast-1
```

### 4. Set Up CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/filot-ocr-gpu-worker \
  --region ap-southeast-1

aws logs put-retention-policy \
  --log-group-name /ecs/filot-ocr-gpu-worker \
  --retention-in-days 30 \
  --region ap-southeast-1
```

---

## Smoke Tests

### 1. TypeScript Build

```bash
cd backend && npm run build
```
**Result:** ✅ PASS

### 2. Unit Tests

```bash
cd backend && npm test
```
**Result:** ✅ PASS (11/11 tests)

### 3. Linter

```bash
cd backend && npm run lint
```
**Result:** ⚠️ WARNINGS (no new errors from T7-B)

### 4. Docker Build (Dry Run)

**Note:** Docker is not available in Replit environment. Manual build required:

```bash
docker build -f Dockerfile.gpu --no-cache -t filot-gpu-test .
```

### 5. Import Verification

```typescript
import { 
  startGPUWorker,
  stopGPUWorker,
  enqueueForGPU,
  getGPUWorkerStatus,
  isGPUEnabled
} from './workers/ocr-gpu-worker';
```
**Result:** ✅ All exports available

---

## Integration Points

### With Existing CPU OCR Flow

The GPU worker is designed to run in parallel with the existing CPU OCR pipeline:

```
┌─────────────────┐
│ Document Upload │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check GPU Flag  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ CPU   │ │ GPU   │
│ Queue │ │ Queue │
└───────┘ └───────┘
```

**Note:** GPU queue usage is optional and controlled by `OCR_GPU_ENABLED`.

### With Redis

- Uses existing Redis client (`redisClient.ts`)
- Separate key prefixes to avoid conflicts
- Health checks prevent operations when Redis unavailable

### With Temporal

- GPU worker can operate independently of Temporal
- Future integration possible via Temporal activities

---

## Monitoring Recommendations

### CloudWatch Metrics

1. **Queue Length:** Monitor `filot:ocr:gpu:queue` size
2. **Processing Time:** Track `processingTimeMs` from results
3. **Error Rate:** Count failed results
4. **GPU Utilization:** ECS container insights

### Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Queue Backlog | `queueLength > 100` | Scale up workers |
| High Error Rate | `errors/total > 10%` | Investigate failures |
| Worker Down | No heartbeat 5min | Check ECS service |

---

## Limitations & Known Issues

1. **Docker Build:** Cannot test in Replit environment - manual build required
2. **GPU Testing:** Requires actual GPU hardware for full validation
3. **Auto-scaling:** Not implemented - manual service scaling needed
4. **Fallback Routing:** GPU → CPU fallback is per-worker, not per-job

---

## Next Steps (T7-C)

1. [ ] Set up AWS infrastructure (ECR, Secrets Manager)
2. [ ] Build and push Docker image
3. [ ] Deploy ECS service
4. [ ] Configure auto-scaling
5. [ ] Set up monitoring dashboards
6. [ ] Performance testing with production load

---

## Appendix: File Contents Summary

### ocr-gpu-worker.ts (Key Exports)

```typescript
// Feature flags
isGPUEnabled(): boolean
isGPUAutoFallbackEnabled(): boolean

// Queue operations
enqueueForGPU(documentId: string): Promise<boolean>

// Worker lifecycle
startGPUWorker(): Promise<void>
stopGPUWorker(): void

// Status
getGPUWorkerStatus(): Promise<GPUWorkerStatus>
getGPUQueueLength(): Promise<number>

// Processing
processDocumentGPU(documentId: string): Promise<GPUOCRResult>
```

### Dockerfile.gpu (Summary)

- Base: NVIDIA CUDA 12.2.0 Ubuntu 22.04
- Node.js: 20.x LTS
- Tesseract: 5.x with ind+eng
- User: filot (non-root)
- Health check: HTTP on port 8080

### task-ocr-gpu.json (Summary)

- Family: filot-ocr-gpu-worker
- CPU/Memory: 2048/8192
- GPU: 1 NVIDIA device
- Placement: g4dn.* instances
- Logging: CloudWatch

---

*T7-B implementation completed successfully.*
