# FiLot Backend

FiLot Backend API - Financial AI Assistant

## Overview

This is the backend service for the FiLot mobile financial AI assistant. It provides:

- Secure authentication and user management
- Indonesian document processing (KTP/NPWP OCR)
- AI-powered verification with manual review escalation
- Integration with external financial services

## Quick Start

```bash
# Install dependencies
npm install

# Development with hot-reload
npm run dev

# Production build
npm run build
npm start

# Run tests
npm test
```

## Environment Variables

### Required Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://...` |

### R2 Storage (Required)

| Variable | Description |
|----------|-------------|
| `CF_R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `CF_R2_ACCESS_KEY_ID` | R2 access key ID |
| `CF_R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `CF_R2_BUCKET_NAME` | R2 bucket name |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FILOT_FRONTEND_ORIGIN` | - | Allowed CORS origin (e.g., `https://app.filot.id`) |
| `SERVICE_INTERNAL_KEY` | - | Service key for internal routes |
| `R2_PRIVATE_URL_EXPIRY` | `3600` | Presigned URL expiry in seconds |

### OCR Engine Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_ENGINE` | `redis` | Queue engine: `redis` or `temporal` |
| `OCR_AUTOFALLBACK` | `true` | Auto-fallback to Redis if Temporal unavailable |

### Temporal Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ENDPOINT` | - | Temporal server address (alternative: `TEMPORAL_ADDRESS`) |
| `TEMPORAL_ADDRESS` | - | Temporal server address (alternative: `TEMPORAL_ENDPOINT`) |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_API_KEY` | - | API key for Temporal Cloud (store in secrets) |
| `TEMPORAL_TASK_QUEUE` | `filot-ocr` | Temporal task queue name |
| `TEMPORAL_DISABLED` | `true` | Set to `false` when Temporal is configured |

### BULI2 Integration

| Variable | Description |
|----------|-------------|
| `BULI2_API_URL` | BULI2 service URL |
| `BULI2_API_KEY` | BULI2 API key |
| `BULI2_CALLBACK_URL` | Callback URL for decisions |
| `AI_SCORE_THRESHOLD_AUTO_APPROVE` | Score threshold for auto-approval (default: 85) |
| `AI_SCORE_THRESHOLD_AUTO_REJECT` | Score threshold for auto-rejection (default: 35) |

### GPU OCR Worker (T7-B)

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_GPU_ENABLED` | `false` | Enable GPU OCR processing |
| `OCR_GPU_CONCURRENCY` | `2` | Number of concurrent GPU jobs |
| `OCR_GPU_POLL_INTERVAL` | `1000` | Queue poll interval (ms) |
| `OCR_GPU_AUTOFALLBACK` | `true` | Auto-fallback to CPU if GPU unavailable |
| `OCR_GPU_MAX_RETRIES` | `3` | Max retry attempts per document |
| `OCR_GPU_QUEUE_KEY` | `filot:ocr:gpu:queue` | Redis queue key |
| `OCR_GPU_PROCESSING_KEY` | `filot:ocr:gpu:processing` | Redis processing set key |
| `OCR_GPU_PUBLISH_CHANNEL` | `filot:ocr:gpu:results` | Redis Pub/Sub channel |

## OCR Engine Modes

### Redis Mode (Default)

```bash
# Default configuration - uses Redis queue
export OCR_ENGINE=redis
npm run dev
```

Redis mode uses a persistent Redis-based queue with:
- Atomic operations for reliability
- Retry logic with exponential backoff
- Startup recovery for stuck documents

### Temporal Mode (Future)

```bash
# Temporal configuration (requires Temporal infrastructure)
export OCR_ENGINE=temporal
export TEMPORAL_DISABLED=false
export TEMPORAL_ENDPOINT=your-temporal-address
export TEMPORAL_NAMESPACE=your-namespace
npm run dev
```

When Temporal is not configured but `OCR_ENGINE=temporal`:
- If `OCR_AUTOFALLBACK=true` (default): Falls back to Redis
- If `OCR_AUTOFALLBACK=false`: Server refuses to start with error

### GPU Mode (T7-B)

For high-performance OCR processing with NVIDIA GPU acceleration:

```bash
# Enable GPU processing (requires CUDA-enabled hardware)
export OCR_GPU_ENABLED=true
export OCR_GPU_CONCURRENCY=4
npm run dev
```

GPU mode features:
- CUDA-accelerated Tesseract OCR
- Separate Redis queue for GPU jobs
- Automatic CPU fallback if GPU unavailable
- Configurable retry logic
- Pub/Sub result notifications

For production deployment, use the GPU Docker image:
```bash
./scripts/deploy-ocr-gpu.sh all
```

See [T7-B GPU OCR Worker Documentation](./docs/T7B_GPU_OCR_WORKER.md) for details.

## API Endpoints

### Health Check
```
GET /health
```
Returns server status including OCR engine information:
```json
{
  "ok": true,
  "ocrEngine": "redis",
  "temporalConfigured": false
}
```

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout

### Documents
- `POST /documents/upload` - Upload document
- `GET /documents/:id/download` - Get presigned download URL
- `POST /documents/:id/process` - Trigger OCR processing

### Verification
- `POST /verification/evaluate` - Evaluate processed documents
- `GET /verification/status/:documentId` - Get verification status
- `POST /verification/:documentId/escalate` - Escalate to manual review

## Project Structure

```
backend/
├── src/
│   ├── auth/           # JWT & authentication
│   ├── buli2/          # BULI2 integration
│   ├── config/         # Environment configuration
│   ├── controllers/    # Route handlers
│   ├── db/             # Drizzle ORM schema
│   ├── middlewares/    # Express middleware
│   ├── ocr/            # OCR processing
│   ├── queue/          # Queue abstraction layer
│   ├── routes/         # Express routes
│   ├── services/       # Business services
│   ├── temporal/       # Temporal workflows (stubs)
│   ├── utils/          # Utilities
│   ├── verification/   # Hybrid verification
│   └── workers/        # Queue workers
├── test/               # Jest tests
├── docs/               # Documentation
└── package.json
```

## Documentation

- [T7-B GPU OCR Worker](./docs/T7B_GPU_OCR_WORKER.md)
- [T7-A Temporal Setup](./docs/T7A_Temporal_Setup.md)
- [T6.D Temporal Preparation](./docs/TRANCHE_T6.D.md)
- [T6.C Redis Queue Pipeline](./docs/T6C_REDIS_QUEUE_PIPELINE.md)
- [T6.B Security Patch](./docs/T6B_BACKEND_SECURITY_PATCH.md)
- [T6.A Security Hardening](./docs/T6A_SECURITY_HARDENING.md)
- [Temporal Workflows](./src/temporal/workflows/README.md)

## Security Notes

- Never commit secrets or API keys to version control
- Store sensitive values in Replit Secrets or secure secret management
- The `TEMPORAL_API_KEY` should be stored securely, not in environment files
- All internal routes are protected with service key authentication
