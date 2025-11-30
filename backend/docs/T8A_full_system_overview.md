# T8-A: FiLot Backend Full System Overview

**Tranche:** T8-A  
**Generated:** 2024-11-30  
**Version:** 1.0.0

---

## Executive Summary

FiLot is a mobile financial AI assistant backend providing secure authentication, Indonesian document processing (KTP/NPWP OCR), AI-powered verification, and integration with external financial services. This document provides a comprehensive overview of the system architecture, components, and operational requirements.

---

## 1. System Overview

### 1.1 Purpose

FiLot Backend provides:
- User authentication and profile management
- Indonesian identity document processing (KTP, NPWP)
- OCR extraction with AI-powered verification
- Hybrid verification (AI + manual review)
- Integration with BULI2 for manual document review
- Secure document storage with presigned URLs

### 1.2 Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ with TypeScript |
| Framework | Express.js |
| Database | PostgreSQL (Neon) with Drizzle ORM |
| Queue | Redis (Upstash) |
| Storage | Cloudflare R2 (S3-compatible) |
| OCR | Tesseract (CPU) / CUDA Tesseract (GPU) |
| Auth | Stack Auth + JWT |
| Workflow | Temporal Cloud (optional) |
| Deployment | AWS ECS Fargate + EC2 (GPU) |

---

## 2. Architecture Components

### 2.1 Core Services

```
backend/src/
├── auth/           # Authentication (JWT, Stack Auth)
├── buli2/          # BULI2 manual review integration
├── config/         # Environment configuration
├── controllers/    # HTTP request handlers
├── db/             # Drizzle ORM schema & migrations
├── middlewares/    # Express middleware
├── ocr/            # OCR processing (Tesseract)
├── queue/          # Queue abstraction (Redis/Temporal)
├── routes/         # Express routes
├── services/       # Business logic services
├── temporal/       # Temporal workflows (optional)
├── utils/          # Utilities (logger, metrics)
├── verification/   # AI scoring & hybrid verification
└── workers/        # Queue workers (CPU, GPU)
```

### 2.2 External Dependencies

| Service | Purpose | Environment Variables |
|---------|---------|----------------------|
| Neon PostgreSQL | Primary database | `DATABASE_URL` |
| Upstash Redis | Queue & caching | `REDIS_URL`, `REDIS_PASSWORD` |
| Cloudflare R2 | Document storage | `CF_R2_*` |
| Stack Auth | User authentication | `STACK_*` |
| BULI2 | Manual review service | `BULI2_*` |
| Temporal Cloud | Workflow orchestration | `TEMPORAL_*` |

---

## 3. Document Processing Pipeline

### 3.1 Flow Overview

```
1. Upload → 2. Store → 3. Queue → 4. OCR → 5. Parse → 6. Score → 7. Verify
```

### 3.2 Detailed Flow

1. **Document Upload**
   - User uploads KTP/NPWP image via `/documents/upload`
   - File validated (type, size, magic bytes)
   - Stored in R2 with user-scoped key

2. **Queue Processing**
   - Document ID pushed to Redis queue
   - GPU queue if `OCR_GPU_ENABLED=true`
   - CPU queue as fallback

3. **OCR Extraction**
   - GPU worker or CPU worker processes document
   - Tesseract OCR extracts text
   - KTP/NPWP parser extracts structured data

4. **AI Scoring**
   - Completeness check (all required fields present)
   - Format validation (NIK pattern, NPWP format)
   - Generates score 0-100

5. **Verification Decision**
   - Score ≥ 85: Auto-approved
   - Score 35-85: Needs review (escalate to BULI2)
   - Score < 35: Auto-rejected

6. **BULI2 Escalation** (if needed)
   - Document sent to BULI2 for manual review
   - Callback received when decision made
   - Document status updated

### 3.3 Queue Architecture

| Queue | Key | Purpose |
|-------|-----|---------|
| CPU Queue | `filot:ocr:queue` | Standard OCR processing |
| GPU Queue | `filot:ocr:gpu:queue` | GPU-accelerated processing |
| GPU Processing | `filot:ocr:gpu:processing` | Active jobs set |
| GPU Results | `filot:ocr:gpu:results` | Pub/Sub channel |

---

## 4. Authentication & Security

### 4.1 Authentication Flow

1. User authenticates via Stack Auth (frontend)
2. Backend verifies Stack Auth token
3. JWT issued for subsequent requests
4. JWT validated on protected routes

### 4.2 Security Layers

| Layer | Implementation |
|-------|----------------|
| Transport | TLS 1.3 (Cloudflare) |
| Headers | Helmet.js security headers |
| CORS | Restricted to frontend origin |
| Rate Limiting | Express rate limiter |
| Input Validation | Zod schemas |
| File Validation | Magic bytes, MIME type |
| Auth | JWT + Service key |
| PII Protection | Log masking |

### 4.3 Internal API Security

Internal routes (`/internal/*`) require `SERVICE_INTERNAL_KEY`:

```
Authorization: Bearer <SERVICE_INTERNAL_KEY>
```

---

## 5. Database Schema

### 5.1 Core Tables

```sql
-- Users (from Stack Auth)
users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP
)

-- User Profiles
profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  full_name VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMP
)

-- Documents
documents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50),           -- 'KTP' or 'NPWP'
  file_url TEXT,
  status VARCHAR(50),         -- 'pending', 'processing', 'completed', 'failed'
  verification_status VARCHAR(50),
  ai_score INTEGER,
  ai_decision VARCHAR(50),
  result_json JSONB,
  ocr_text TEXT,
  buli2_ticket_id VARCHAR(100),
  created_at TIMESTAMP,
  processed_at TIMESTAMP
)
```

---

## 6. API Endpoints

### 6.1 Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | System metrics |

### 6.2 Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login |
| POST | `/auth/register` | User registration |
| POST | `/auth/logout` | User logout |
| GET | `/auth/me` | Current user info |

### 6.3 Document Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/documents/upload` | Upload document |
| GET | `/documents/:id` | Get document details |
| GET | `/documents/:id/download` | Get presigned URL |
| POST | `/documents/:id/process` | Trigger OCR |

### 6.4 Verification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/verification/status/:id` | Verification status |
| POST | `/verification/:id/escalate` | Escalate to review |

### 6.5 Internal Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/internal/reviews` | BULI2 callback |
| POST | `/internal/ocr/queue` | Queue status |

---

## 7. GPU Worker

### 7.1 Architecture

- Runs on AWS ECS with g4dn.xlarge instances
- NVIDIA T4 GPU with CUDA 12.2
- Tesseract OCR with Indonesian language support
- Connects to same Redis as backend

### 7.2 Features

- Concurrent processing (configurable)
- Automatic CPU fallback on GPU failure
- Stuck job recovery (reaper process)
- Distributed locking (Redis)
- Result publication (Pub/Sub)

### 7.3 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_GPU_ENABLED` | `false` | Enable GPU mode |
| `OCR_GPU_CONCURRENCY` | `2` | Max concurrent jobs |
| `OCR_GPU_MAX_RETRIES` | `3` | Retry attempts |
| `OCR_GPU_AUTOFALLBACK` | `true` | CPU fallback |

---

## 8. Monitoring & Observability

### 8.1 Logging

- Structured JSON logs
- PII masking (NIK, NPWP, email, phone)
- CloudWatch Logs integration
- Log levels: debug, info, warn, error

### 8.2 Metrics

CloudWatch EMF metrics:
- `filot.queue_length` - Queue depths
- `filot.gpu.active_jobs` - Active GPU jobs
- `filot.gpu.processing_time_ms` - Processing duration
- `filot.buli2.retry_count` - BULI2 retry queue

### 8.3 Health Check

```json
GET /health

{
  "ok": true,
  "timestamp": "2024-11-30T12:00:00.000Z",
  "ocrEngine": "redis",
  "temporalConfigured": false,
  "redisConnected": true
}
```

---

## 9. Deployment

### 9.1 Environment Types

| Environment | Purpose | Configuration |
|-------------|---------|---------------|
| Development | Local dev | `.env` file |
| Staging | Pre-production | ECS (Fargate) |
| Production | Live service | ECS (Fargate + EC2 GPU) |

### 9.2 ECS Services

| Service | Type | Resources |
|---------|------|-----------|
| Backend API | Fargate | 2 vCPU, 4GB RAM |
| GPU Worker | EC2 (g4dn.xlarge) | 4 vCPU, 16GB RAM, 1 GPU |

### 9.3 Deployment Commands

```bash
# Build production
npm run build

# Database migration
npm run db:push

# GPU worker deployment
./scripts/deploy-ocr-gpu.sh all
```

---

## 10. Configuration Reference

### 10.1 Required Secrets

| Secret | Category |
|--------|----------|
| `JWT_SECRET` | Security |
| `SESSION_SECRET` | Security |
| `SERVICE_INTERNAL_KEY` | Security |
| `DATABASE_URL` | Database |
| `REDIS_URL` | Queue |
| `REDIS_PASSWORD` | Queue |
| `CF_R2_SECRET_ACCESS_KEY` | Storage |
| `BULI2_API_KEY` | Integration |
| `TEMPORAL_API_KEY` | Workflow |

### 10.2 Environment Variables

See `prod.env.template` for complete list with documentation.

---

## 11. Tranche History

| Tranche | Description | Status |
|---------|-------------|--------|
| T1 | Initial backend setup | Complete |
| T2 | Database & user schema | Complete |
| T3 | Authentication (JWT) | Complete |
| T4 | Document upload & R2 | Complete |
| T5 | OCR pipeline (async) | Complete |
| T6 | Hybrid verification | Complete |
| T6-A | Security hardening | Complete |
| T6-B | Security patch | Complete |
| T6-C | Redis queue pipeline | Complete |
| T6-D | Temporal preparation | Complete |
| T7-A | Temporal Cloud setup | Complete |
| T7-B | GPU OCR worker | Complete |
| T7-C | ECS deployment | Complete |
| T7-D | System testing | Complete |
| T7-E/F | Production hardening | Complete |
| T8-A | Production preparation | Complete |
| T8-B | Production deployment | Pending |

---

## 12. Next Steps (T8-B)

1. Configure missing secrets (JWT_SECRET, BULI2_API_KEY, BULI2_SIGNATURE_SECRET)
2. Deploy backend API to ECS Fargate
3. Deploy GPU worker to ECS EC2
4. Configure CloudWatch alarms
5. Run production smoke tests
6. Enable production monitoring

---

*Generated as part of Tranche T8-A: Production Deployment Preparation*
