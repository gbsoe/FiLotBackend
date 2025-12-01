# T8-A: Pre-Deployment Checklist

**Tranche:** T8-A  
**Generated:** 2024-11-30

---

## Pre-Deployment Checklist for FiLot Backend

Use this checklist before deploying to production. All items must be verified.

---

## 1. Secrets Configuration

### Critical Secrets

- [ ] `JWT_SECRET` - Generated (32+ chars random string)
- [ ] `SESSION_SECRET` - Configured and secure
- [ ] `SERVICE_INTERNAL_KEY` - Configured for internal API auth
- [ ] `DATABASE_URL` - Points to production Neon database with SSL
- [ ] `REDIS_URL` - Uses `rediss://` protocol (TLS)
- [ ] `REDIS_PASSWORD` - Set and strong

### External Service Secrets

- [ ] `STACK_PROJECT_ID` - Production Stack Auth project
- [ ] `STACK_SECRET_SERVER_KEY` - Production server key
- [ ] `STACK_PUBLISHABLE_CLIENT_KEY` - Production client key
- [ ] `CF_R2_ACCESS_KEY_ID` - R2 API token access key
- [ ] `CF_R2_SECRET_ACCESS_KEY` - R2 API token secret
- [ ] `CF_R2_BUCKET_NAME` - Production bucket name
- [ ] `BULI2_API_KEY` - Obtained from BULI2 team
- [ ] `BULI2_SIGNATURE_SECRET` - Configured and shared with BULI2
- [ ] `TEMPORAL_API_KEY` - (If using Temporal)

---

## 2. Environment Configuration

### Core Settings

- [ ] `NODE_ENV=production`
- [ ] `PORT=8080`
- [ ] `FILOT_FRONTEND_ORIGIN=https://app.filot.me`

### OCR Configuration

- [ ] `OCR_ENGINE=redis` (or `temporal` if configured)
- [ ] `OCR_AUTOFALLBACK=true`
- [ ] `OCR_GPU_ENABLED=true` (if GPU worker deployed)
- [ ] `OCR_GPU_AUTOFALLBACK=true`

### Monitoring

- [ ] `LOG_LEVEL=info`
- [ ] `CLOUDWATCH_ENABLED=true`
- [ ] `METRICS_ENABLED=true`
- [ ] `METRICS_NAMESPACE=FiLot`

---

## 3. Database

### Schema Migration

- [ ] Database schema migrated: `npm run db:push`
- [ ] All migrations applied successfully
- [ ] Verify tables exist: `users`, `profiles`, `documents`
- [ ] Indexes created for performance

### Connection Verification

- [ ] Test connection from production environment
- [ ] SSL/TLS connection verified
- [ ] Connection pooling configured

---

## 4. Redis

### Connection

- [ ] `REDIS_URL` uses `rediss://` (TLS enabled)
- [ ] Connection tested from ECS task
- [ ] Authentication working

### Queue Verification

- [ ] CPU queue operational: `filot:ocr:queue`
- [ ] GPU queue operational: `filot:ocr:gpu:queue`
- [ ] Pub/Sub channel working: `filot:ocr:gpu:results`
- [ ] Lock mechanism tested

---

## 5. Cloudflare R2

### Configuration

- [ ] `CF_R2_ENDPOINT` correct format
- [ ] API token has Object Read/Write permissions
- [ ] Bucket exists and is private

### Operations

- [ ] Upload test passed
- [ ] Download test passed
- [ ] Presigned URL generation working
- [ ] Presigned URL accessible from frontend

---

## 6. GPU Worker (ECS)

### Docker Image

- [ ] Image built: `./scripts/deploy-ocr-gpu.sh build`
- [ ] Image pushed to ECR: `./scripts/deploy-ocr-gpu.sh push`
- [ ] Image tagged as `latest`

### ECS Configuration

- [ ] Task definition registered
- [ ] Service created and running
- [ ] GPU instance (g4dn.xlarge) available
- [ ] CloudWatch log group created

### Verification

- [ ] Worker connects to Redis
- [ ] Worker processes test document
- [ ] Fallback to CPU works
- [ ] Results published to channel

---

## 7. BULI2 Integration

### Configuration

- [ ] `BULI2_API_URL` points to production
- [ ] `BULI2_API_KEY` configured
- [ ] `BULI2_CALLBACK_URL` is correct
- [ ] `BULI2_SIGNATURE_SECRET` shared with BULI2

### Verification

- [ ] Test escalation call succeeds
- [ ] Callback endpoint accessible
- [ ] Signature verification works

---

## 8. Temporal (If Enabled)

### Configuration

- [ ] `TEMPORAL_DISABLED=false`
- [ ] `TEMPORAL_ENDPOINT` configured
- [ ] `TEMPORAL_NAMESPACE` correct
- [ ] `TEMPORAL_API_KEY` stored securely

### Verification

- [ ] Temporal Worker deployed
- [ ] Connection test passes
- [ ] Workflow can be started

---

## 9. Security

### Headers & CORS

- [ ] Helmet.js enabled
- [ ] CORS restricted to `FILOT_FRONTEND_ORIGIN`
- [ ] Rate limiting configured

### Authentication

- [ ] JWT validation working
- [ ] Service key auth on internal routes
- [ ] Stack Auth integration verified

### Data Protection

- [ ] PII masking in logs verified
- [ ] Error responses hide stack traces
- [ ] No secrets in logs

---

## 10. Monitoring

### CloudWatch

- [ ] Log groups created
- [ ] Metrics appearing in CloudWatch
- [ ] Alarms configured for critical metrics

### Health Checks

- [ ] `/health` endpoint returns OK
- [ ] ECS health checks configured
- [ ] ALB health checks passing

---

## 11. Build & Deployment

### Build Verification

- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript compilation errors
- [ ] All tests passing: `npm test`

### Deployment

- [ ] ECS service updated
- [ ] Tasks running healthy
- [ ] No deployment errors in logs

---

## 12. Post-Deployment Verification

### Smoke Tests

- [ ] Health endpoint responds: `GET /health`
- [ ] Metrics endpoint responds: `GET /metrics`
- [ ] Authentication works
- [ ] Document upload works
- [ ] OCR processing completes
- [ ] BULI2 escalation works

### Monitoring Check

- [ ] Logs appearing in CloudWatch
- [ ] Metrics updating
- [ ] No error spikes

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| DevOps | | | |
| Security | | | |
| QA | | | |

---

*Generated as part of Tranche T8-A: Production Deployment Preparation*
