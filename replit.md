# FiLot Backend - Replit Configuration

## Overview
FiLot Backend is a Node.js/TypeScript REST API server for the FiLot mobile financial AI assistant. It provides secure authentication, user profile management, Indonesian document processing (KTP/NPWP OCR), conversational AI chat, and integration with external financial services. The project aims to deliver a robust, scalable, and secure backend solution for personal finance management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
The backend uses Node.js with TypeScript and Express.js. It features a layered architecture for modularity and maintainability.

### Security Architecture
Security is a core focus, utilizing:
- **Helmet.js** for secure HTTP headers.
- **CORS hardening** restricted to the FiLot frontend.
- **JWT-based authentication** for user routes.
- **Service key authentication** for internal routes.
- **Rate limiting** (global and sensitive routes).
- **File validation** (magic-number, MIME, size limits).
- **Presigned URLs** for secure access to private R2 bucket documents.
- Password hashing with bcryptjs and Zod for input validation.

### Error Handling & Logging
A centralized global error handler, a 404 handler, and a custom logger ensure consistent error responses and effective debugging. Morgan middleware is used for HTTP request logging.

### Configuration Management
Environment variables are loaded via `dotenv`, with type-safe configuration ensuring robust deployments.

### Code Quality
ESLint, Prettier, and strict TypeScript compiler flags enforce high code quality and consistency.

### File Upload and Document Processing
- Supports JPEG, PNG, PDF files up to 5MB via Multer.
- Files are stored in a private R2 bucket, accessed via time-limited presigned URLs.
- Integrates Tesseract OCR for Indonesian document processing (KTP/NPWP).
- Features an asynchronous processing pipeline with Redis-based or Temporal-based queuing.

### GPU OCR Worker (T7-B)
The system supports GPU-accelerated OCR processing for high-performance document handling:
- **GPU Queue**: Separate Redis queue (`filot:ocr:gpu:queue`) for GPU processing jobs.
- **CUDA Support**: Uses NVIDIA CUDA 12.2 runtime with Tesseract OCR.
- **Auto Fallback**: Automatically falls back to CPU processing when GPU is unavailable.
- **Retry Logic**: Configurable retry attempts with automatic requeuing.
- **Pub/Sub Results**: Results published to `filot:ocr:gpu:results` channel.
- **ECS Deployment**: Docker image and ECS task definition for AWS deployment on g4dn.* instances.

### Hybrid Verification System
Combines AI-powered scoring with manual review capabilities:
- **AI Scoring Engine**: Computes confidence scores (0-100) for KTP/NPWP based on completeness and format validation.
  - Documents with scores ≥85 are `auto_approved`.
  - Documents with scores <35 are `auto_reject`.
  - Documents with scores between 35 and 85 are `needs_review`.
- **Hybrid Decision Engine**: Determines verification path (`auto_approved` or `pending_manual_review`).
- **BULI2 Integration**: Documents requiring manual review are escalated to the BULI2 review service.
- **Secure Download Route**: Provides authenticated, owner-specific access to processed documents via presigned URLs.
- **Documents Table Schema**: Includes fields for `ai_score`, `ai_decision`, `verification_status`, `buli2_ticket_id`, and `processed_at`.

## External Dependencies

### Production Dependencies
- **express**: Web framework.
- **express-rate-limit**: Rate limiting.
- **cors**: CORS middleware.
- **helmet**: Security headers.
- **morgan**: HTTP request logging.
- **dotenv**: Environment variables.
- **zod**: Schema validation.
- **jsonwebtoken**, **jose**: JWT handling.
- **bcryptjs**: Password hashing.
- **multer**: File uploads.
- **@aws-sdk/client-s3**, **@aws-sdk/s3-request-presigner**: Cloudflare R2 storage.
- **mime-types**: MIME type detection.
- **uuid**: Unique IDs.
- **drizzle-orm**, **pg**: PostgreSQL ORM and client.
- **node-tesseract-ocr**: Tesseract OCR wrapper.
- **redis**: Redis client for queuing.
- **@temporalio/proto**, **@temporalio/workflow**: Temporal SDK.

### External Service Integrations
- **BULI2 Review Service**: For manual document review.
- **Temporal Cloud**: For durable workflow execution (future KYC review process).
- **FiLot DeFi API**: For decentralized finance operations.
- **Project Alpha API**: For additional financial services.

## Recent Changes

### T8-A Production Deployment Preparation (Latest)
Tranche T8-A prepares the FiLot backend for production deployment:

- **Production Environment Template** (`backend/prod.env.template`):
  - Complete list of all 50+ production environment variables
  - Documentation for each variable with format requirements
  - AWS Secrets Manager integration paths

- **Secrets Manifest** (`backend/production_secrets_required.json`):
  - Machine-readable secrets list with 24 secrets tracked
  - Status tracking (19 exist, 3 missing, 2 need verification)
  - AWS Secrets Manager paths for each secret

- **Validation Reports** (`backend/docs/`):
  - `redis_validation_report.md` - Redis configuration validation
  - `gpu_worker_env_validation.md` - GPU worker environment validation  
  - `r2_config_validation.md` - Cloudflare R2 configuration validation
  - `temporal_env_validation.md` - Temporal Cloud integration validation
  - `mock_cleanup_report.md` - Mock code audit (no issues found)

- **Pre-Deployment Checklist** (`backend/docs/T8A_predeployment_checklist.md`):
  - Step-by-step deployment verification
  - Security checklist with 40+ items
  - Post-deployment smoke tests

- **Missing Secrets** (`backend/missing_required_secrets.txt`):
  - `JWT_SECRET` - Must generate before deployment
  - `BULI2_API_KEY` - Obtain from BULI2 team
  - `BULI2_SIGNATURE_SECRET` - Generate and share with BULI2 team

### T7-E/T7-F Production Hardening
Tranche T7-E and T7-F implement complete production hardening for the FiLot backend:

- **Cloud Observability** (`backend/src/utils/metrics.ts`):
  - CloudWatch EMF-compatible metrics emitter
  - System metrics tracking (queue depths, GPU status, BULI2 retry counts)
  - Automatic metric batching and flushing

- **Monitoring Endpoint** (`GET /metrics`):
  - Real-time system health and queue statistics
  - GPU worker status and active job counts
  - Circuit breaker states

- **Production Documentation**:
  - `FiLot_PRODUCTION_CHECKLIST.md` - Deployment checklist
  - `T7F_production_readiness_report.md` - Readiness assessment
  - `T7E_T7F_FINAL_SUMMARY.md` - Complete summary
  - Updated `README.md` with production deployment guide

- **Environment Configuration**:
  - Updated `.env.example` with all required variables
  - Metrics configuration variables added
  - GPU stuck job recovery settings documented

### T7-D Full System Testing
Tranche T7-D implements comprehensive testing infrastructure for the complete OCR pipeline:

- **Test Suites** (`backend/tests/`):
  - `redis/queue.test.ts` - Redis queue operations, pub/sub, retry logic
  - `temporal/ocr-workflow.test.ts` - Temporal workflow states, signals, queries
  - `e2e/ocr-end-to-end.test.ts` - Complete pipeline integration tests

- **Mock Components** (`backend/src/workers/__mocks__/`):
  - `gpu-worker-mock.ts` - GPU processor mock with fallback simulation

- **Simulation Scripts** (`backend/scripts/`):
  - `simulate-ecs-runtime.ts` - Full ECS worker simulation
  - `run-full-system-test.ts` - Unified test runner (11/11 tests passing)

- **Test Results**:
  - Jest: 4 test suites, 59 tests passing
  - Full System: 11 tests (Redis 4, GPU 3, Temporal 3, E2E 1)

- **NPM Scripts Added**:
  - `npm run test:redis` - Redis queue tests
  - `npm run test:temporal` - Temporal workflow tests
  - `npm run test:e2e` - End-to-end tests
  - `npm run test:full` - Full system test runner
  - `npm run simulate:ecs` - ECS runtime simulation

- **Documentation**: `backend/docs/T7D_SYSTEM_TEST_REPORT.md`

### T7-B GPU OCR Worker
- Implemented GPU-accelerated OCR worker with Redis queue consumer
- Added CUDA-enabled Dockerfile (`backend/Dockerfile.gpu`)
- Created ECS deployment script (`backend/scripts/deploy-ocr-gpu.sh`) for ap-southeast-2
- Added ECS task definition with GPU requirements (`backend/infra/ecs/task-ocr-gpu.json`)
- Integrated with hybrid verification system
- Added CPU fallback support with configurable retry logic
- Full documentation at `backend/docs/T7B_GPU_OCR_WORKER.md`

## GPU Worker Environment Variables
```
OCR_GPU_ENABLED=false
OCR_GPU_CONCURRENCY=2
OCR_GPU_POLL_INTERVAL=1000
OCR_GPU_AUTOFALLBACK=true
OCR_GPU_MAX_RETRIES=3
OCR_GPU_QUEUE_KEY=filot:ocr:gpu:queue
OCR_GPU_PROCESSING_KEY=filot:ocr:gpu:processing
OCR_GPU_ATTEMPTS_KEY=filot:ocr:gpu:attempts
OCR_GPU_PUBLISH_CHANNEL=filot:ocr:gpu:results
```

### T7-C AWS ECS Deployment (Latest)
Tranche T7-C implements the complete AWS ECS deployment infrastructure for the GPU OCR Worker:

- **Deployment Scripts** (`/scripts/`):
  - `aws-ecr-setup-gpu.sh` - ECR repository setup and image push
  - `build-gpu-worker.sh` - Docker image build for linux/amd64
  - `deploy-ocr-gpu.sh` - Main deployment orchestration (build/push/register/update/all)

- **ECS Infrastructure** (`/infra/ecs/`):
  - `task-ocr-gpu.json` - ECS task definition with GPU requirements
  - `cluster.json` - ECS cluster configuration
  - `service-ocr-gpu.json` - ECS service with g5.xlarge placement

- **AWS Resources**:
  - ECS Cluster: `filot-ocr-gpu-cluster`
  - ECS Service: `filot-ocr-gpu-service`
  - ECR Repository: `filot-ocr-gpu-worker`
  - Image: `070017891928.dkr.ecr.ap-southeast-2.amazonaws.com/filot-ocr-gpu-worker:latest`

- **Documentation**: `doc/T7C_GPU_OCR_DEPLOYMENT.md`

## Deployment Commands

```bash
# Build GPU worker image
./scripts/deploy-ocr-gpu.sh build

# Push to ECR
./scripts/deploy-ocr-gpu.sh push

# Register ECS task definition
./scripts/deploy-ocr-gpu.sh register

# Update ECS service
./scripts/deploy-ocr-gpu.sh update

# Run all (full deployment)
./scripts/deploy-ocr-gpu.sh all
```