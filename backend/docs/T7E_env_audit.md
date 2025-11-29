# T7E Environment Audit Report

**Generated**: 2025-11-29  
**Tranche**: T7-E Production Environment Validation

---

## 1. Environment Variables Audit

### 1.1 Complete List of Used Environment Variables

| Variable | File(s) | Required | Has Default | Status |
|----------|---------|----------|-------------|--------|
| `NODE_ENV` | app.ts, corsConfig.ts, errorHandler.ts, logger.ts, health.controller.ts | No | `development`/`production` | ✅ OK |
| `PORT` | config/env.ts | No | `8080` | ✅ OK |
| `DATABASE_URL` | db/index.ts | **YES** | None | ✅ Secret Exists |
| `JWT_SECRET` | config/env.ts | **YES** | `dev-secret-change-in-production` (insecure) | ⚠️ Needs Review |
| `UPLOAD_DIR` | config/env.ts | No | `./uploads` | ✅ OK |

**Stack Auth Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `STACK_PROJECT_ID` | YES | ✅ Secret Exists |
| `STACK_SECRET_SERVER_KEY` | YES | ✅ Secret Exists |
| `STACK_PUBLISHABLE_CLIENT_KEY` | YES | ✅ Secret Exists |
| `SESSION_SECRET` | YES | ✅ Secret Exists |

**Cloudflare R2 Storage:**
| Variable | Required | Status |
|----------|----------|--------|
| `CF_R2_ENDPOINT` | YES | ✅ Secret Exists |
| `CF_R2_ACCESS_KEY_ID` | YES | ✅ Secret Exists |
| `CF_R2_SECRET_ACCESS_KEY` | YES | ✅ Secret Exists |
| `CF_R2_BUCKET_NAME` | YES | ✅ Secret Exists |
| `CF_ACCOUNT_ID` | YES | ✅ Secret Exists |
| `R2_PRIVATE_URL_EXPIRY` | No | ✅ Env Var Set (3600) |

**BULI2 Integration:**
| Variable | Required | Status |
|----------|----------|--------|
| `BULI2_API_URL` | YES | ✅ Env Var Set |
| `BULI2_API_KEY` | YES for production | ⚠️ Not Set (mock mode) |
| `BULI2_CALLBACK_URL` | YES | ✅ Env Var Set |

**AI Scoring:**
| Variable | Required | Status |
|----------|----------|--------|
| `AI_SCORE_THRESHOLD_AUTO_APPROVE` | No | ✅ Env Var Set (85) |
| `AI_SCORE_THRESHOLD_AUTO_REJECT` | No | ✅ Env Var Set (35) |

**Security:**
| Variable | Required | Status |
|----------|----------|--------|
| `FILOT_FRONTEND_ORIGIN` | No | ✅ Env Var Set |
| `SERVICE_INTERNAL_KEY` | YES | ✅ Secret Exists |

**Redis Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `REDIS_URL` | YES | ✅ Secret Exists |
| `REDIS_PASSWORD` | Optional | ✅ Secret Exists |
| `REDIS_HOST` | No (use REDIS_URL) | ✅ Secret Exists |
| `REDIS_PORT` | No (use REDIS_URL) | ✅ Secret Exists |
| `REDIS_USERNAME` | Optional | ✅ Secret Exists |
| `REDIS_TLS` | No | ✅ Secret Exists |
| `QUEUE_PREFIX` | No | ✅ Secret Exists |

**OCR Engine Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `OCR_ENGINE` | No | ✅ Secret Exists (redis) |
| `OCR_AUTOFALLBACK` | No | ✅ Secret Exists (true) |
| `QUEUE_ENGINE` | No (deprecated) | ⚠️ Not in .env.example |

**Temporal Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `TEMPORAL_DISABLED` | No | ✅ Secret Exists |
| `TEMPORAL_ENDPOINT` | When enabled | ✅ Secret Exists |
| `TEMPORAL_ADDRESS` | Alias | ✅ Via TEMPORAL_ENDPOINT |
| `TEMPORAL_NAMESPACE` | When enabled | ✅ Secret Exists |
| `TEMPORAL_API_KEY` | When enabled | ✅ Secret Exists |
| `TEMPORAL_TASK_QUEUE` | No | ✅ Secret Exists |

**GPU OCR Worker Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `OCR_GPU_ENABLED` | No | ⚠️ Not Set (defaults false) |
| `OCR_GPU_QUEUE_KEY` | No | ✅ Has Default |
| `OCR_GPU_PROCESSING_KEY` | No | ✅ Has Default |
| `OCR_GPU_PUBLISH_CHANNEL` | No | ✅ Has Default |
| `OCR_GPU_CONCURRENCY` | No | ✅ Has Default (2) |
| `OCR_GPU_POLL_INTERVAL` | No | ✅ Has Default (1000) |
| `OCR_GPU_AUTOFALLBACK` | No | ✅ Has Default (true) |
| `OCR_GPU_MAX_RETRIES` | No | ✅ Has Default (3) |
| `OCR_GPU_ATTEMPTS_KEY` | No | ✅ Has Default |
| `OCR_GPU_DRIVER` | No | ⚠️ Not Used in Code |
| `NVIDIA_VISIBLE_DEVICES` | No | ⚠️ Not in .env.example |

**AWS Configuration:**
| Variable | Required | Status |
|----------|----------|--------|
| `AWS_REGION` | For deployment | ⚠️ Not Set |
| `AWS_ACCOUNT_ID` | For deployment | ⚠️ Not Set |
| `ECR_REPOSITORY` | For deployment | ⚠️ Not Set |
| `ECS_CLUSTER` | For deployment | ⚠️ Not Set |
| `ECS_SERVICE` | For deployment | ⚠️ Not Set |

---

## 2. Production Secrets Validation

### 2.1 Required Production Secrets (per spec)

| Secret | Alias/Key | Status |
|--------|-----------|--------|
| `filot/database-url` | `DATABASE_URL` | ✅ Exists |
| `filot/redis-url` | `REDIS_URL` | ✅ Exists |
| `filot/redis-password` | `REDIS_PASSWORD` | ✅ Exists |
| Cloudflare R2 credentials | `CF_R2_*` | ✅ All Exist |
| BULI2 API URL | `BULI2_API_URL` | ✅ Env Var Set |
| BULI2 API Key | `BULI2_API_KEY` | ⚠️ Not Set (mock mode) |
| OCR GPU flags | `OCR_GPU_ENABLED` | ⚠️ Not Set |

### 2.2 URL Format Validation

**Database URL:**
- Format: `postgresql://user:pass@host:port/dbname`
- ✅ Managed by Replit PostgreSQL integration

**Redis URL:**
- Format: `redis://` or `rediss://` (TLS)
- ✅ Configured via `REDIS_URL` secret
- TLS: Controlled via `REDIS_TLS` environment variable

---

## 3. Issues Found

### 3.1 Critical Issues
1. **JWT_SECRET has insecure default**: `dev-secret-change-in-production` should error in production
2. **BULI2_API_KEY not set**: Mock client in use - needs real implementation for production

### 3.2 Moderate Issues
1. **QUEUE_ENGINE** referenced in code but not in .env.example (deprecated alias for OCR_ENGINE)
2. **NVIDIA_VISIBLE_DEVICES** used for GPU detection but not documented
3. **OCR_GPU_DRIVER** in .env.example but not used in code

### 3.3 Minor Issues
1. AWS deployment variables not set (needed for ECS deployment only)
2. Some redundant Redis variables (REDIS_HOST, REDIS_PORT vs REDIS_URL)

---

## 4. Recommendations

### 4.1 Immediate Actions
1. ✅ Add NODE_ENV to .env.example
2. ✅ Add NVIDIA_VISIBLE_DEVICES to .env.example
3. ✅ Remove unused OCR_GPU_DRIVER or implement it
4. ✅ Add validation for required secrets at startup
5. ✅ Implement proper BULI2 client (replace mock)

### 4.2 Security Enhancements
1. ✅ Fail startup if JWT_SECRET is default in production
2. ✅ Validate DATABASE_URL format
3. ✅ Validate REDIS_URL scheme
4. ✅ Add missing env var error messages

---

## 5. Updated .env.example

The `.env.example` has been updated to include all environment variables with proper documentation.

---

**Audit Status**: ✅ COMPLETE  
**Production Readiness**: Pending security hardening (Task T7-E-2)
