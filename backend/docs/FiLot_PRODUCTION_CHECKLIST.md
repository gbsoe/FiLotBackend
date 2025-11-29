# FiLot Production Deployment Checklist

**Version:** 1.0  
**Date:** November 29, 2025  
**Status:** Production Ready

---

## Pre-Deployment Checklist

### 1. Environment Variables

#### Required Secrets (Must be set)

| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | [ ] | PostgreSQL connection string |
| `JWT_SECRET` | [ ] | Strong random string (min 32 chars) |
| `SESSION_SECRET` | [ ] | Strong random string |
| `SERVICE_INTERNAL_KEY` | [ ] | API key for internal routes |
| `REDIS_URL` | [ ] | Redis connection URL (redis:// or rediss://) |
| `REDIS_PASSWORD` | [ ] | Redis authentication password |
| `CF_R2_ENDPOINT` | [ ] | Cloudflare R2 endpoint |
| `CF_R2_ACCESS_KEY_ID` | [ ] | R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | [ ] | R2 secret key |
| `CF_R2_BUCKET_NAME` | [ ] | R2 bucket name |
| `CF_ACCOUNT_ID` | [ ] | Cloudflare account ID |
| `BULI2_API_URL` | [ ] | BULI2 API endpoint |
| `BULI2_API_KEY` | [ ] | BULI2 API authentication key |
| `BULI2_SIGNATURE_SECRET` | [ ] | HMAC secret for callbacks |
| `STACK_PROJECT_ID` | [ ] | Stack Auth project ID |
| `STACK_SECRET_SERVER_KEY` | [ ] | Stack Auth server key |
| `STACK_PUBLISHABLE_CLIENT_KEY` | [ ] | Stack Auth client key |

#### Optional Configuration

| Variable | Recommended Value | Notes |
|----------|-------------------|-------|
| `NODE_ENV` | `production` | Required for production mode |
| `PORT` | `8080` | Server port |
| `AI_SCORE_THRESHOLD_AUTO_APPROVE` | `85` | Auto-approve threshold |
| `AI_SCORE_THRESHOLD_AUTO_REJECT` | `35` | Auto-reject threshold |
| `OCR_GPU_ENABLED` | `true` (on GPU) | Enable GPU processing |
| `METRICS_ENABLED` | `true` | Enable metrics emission |

---

### 2. Database Preparation

- [ ] Run database migrations: `npm run db:push`
- [ ] Verify all tables exist:
  - `users`
  - `documents`
  - `manual_reviews`
  - `verification_results`
- [ ] Verify database constraints are in place
- [ ] Set up database connection pooling (max connections)
- [ ] Configure database backups

---

### 3. Redis Configuration

- [ ] Verify Redis is accessible from backend
- [ ] Test Redis connection with `redis-cli ping`
- [ ] Configure Redis persistence (RDB/AOF)
- [ ] Set appropriate memory limits
- [ ] Enable Redis TLS if required (`rediss://`)

---

### 4. Temporal Configuration (if enabled)

- [ ] Set `TEMPORAL_DISABLED=false`
- [ ] Configure Temporal Cloud credentials:
  - `TEMPORAL_ENDPOINT`
  - `TEMPORAL_NAMESPACE`
  - `TEMPORAL_API_KEY`
- [ ] Verify Temporal connection
- [ ] Deploy Temporal workers

---

### 5. GPU Worker Deployment (ECS)

- [ ] Build GPU Docker image: `docker build -f Dockerfile.gpu -t filot-ocr-gpu-worker .`
- [ ] Push to ECR: `aws ecr get-login-password | docker push ...`
- [ ] Deploy ECS task definition
- [ ] Verify GPU availability in ECS
- [ ] Test GPU worker health

---

### 6. Security Verification

- [ ] Verify `JWT_SECRET` is NOT the default value
- [ ] Verify all secrets are not exposed in logs
- [ ] Test rate limiting on sensitive endpoints
- [ ] Verify HMAC signature validation for BULI2 callbacks
- [ ] Verify CORS is properly configured
- [ ] Test Zod validation on all input routes

---

### 7. Monitoring Setup

- [ ] Configure CloudWatch log groups:
  - `/ecs/filot-ocr-gpu-worker`
  - `/ecs/filot-backend`
- [ ] Set up CloudWatch dashboards
- [ ] Configure CloudWatch alarms:
  - High queue depth (> 100)
  - GPU worker down (0 active jobs for 10m)
  - BULI2 retry backlog (> 50)
  - High processing time (p95 > 60s)
- [ ] Verify `/metrics` endpoint is accessible
- [ ] Set up external monitoring (Datadog, Grafana, etc.)

---

### 8. Testing

- [ ] Run unit tests: `npm test`
- [ ] Run integration tests: `npm run test:e2e`
- [ ] Test document upload flow end-to-end
- [ ] Test KTP parsing
- [ ] Test NPWP parsing
- [ ] Test auto-approve flow (score >= 85)
- [ ] Test auto-reject flow (score <= 35)
- [ ] Test manual review escalation (35 < score < 85)
- [ ] Test BULI2 callback processing
- [ ] Load test with expected traffic

---

### 9. Build and Deploy

- [ ] Build production bundle: `npm run build`
- [ ] Verify build completes without errors
- [ ] Deploy to production environment
- [ ] Verify health check: `GET /health`
- [ ] Verify metrics endpoint: `GET /metrics`

---

### 10. Post-Deployment Verification

- [ ] Monitor logs for errors
- [ ] Verify queue processing is working
- [ ] Verify GPU worker is processing jobs
- [ ] Test end-to-end document verification
- [ ] Verify BULI2 integration is working
- [ ] Monitor queue depths and processing times

---

## Rollback Plan

### Database Rollback
1. Identify the last stable migration
2. Rollback using Drizzle migrations
3. Restore from backup if needed

### Application Rollback
1. Revert to previous Docker image tag
2. Redeploy ECS tasks
3. Verify health checks pass

### Queue Cleanup
```bash
# Clear GPU queue (if corrupted)
redis-cli DEL filot:ocr:gpu:queue
redis-cli DEL filot:ocr:gpu:processing
redis-cli DEL filot:ocr:gpu:attempts

# Clear BULI2 retry queue
redis-cli DEL filot:buli2:retry_queue

# Reset circuit breaker (via API or restart)
```

---

## Support Contacts

| Role | Contact |
|------|---------|
| Backend Lead | [TBD] |
| DevOps | [TBD] |
| Database Admin | [TBD] |
| BULI2 Support | [TBD] |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-29 | 1.0 | Initial production checklist |

---

**Deployment Approved By:** ______________________  
**Date:** ______________________
