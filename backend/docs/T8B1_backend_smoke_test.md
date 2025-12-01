# T8-B.1 Backend Smoke Test Procedures

**Tranche**: T8-B.1  
**Date**: 2024-12-01  
**Status**: Ready for Execution

---

## Overview

This document outlines the smoke test procedures for validating the FiLot Backend API deployment at `https://api.filot.me`.

---

## Quick Start

### Run Automated Smoke Tests

```bash
./scripts/smoke/run_e2e_smoke.sh --api-url https://api.filot.me
```

### Run with JWT Token (Full Tests)

```bash
./scripts/smoke/run_e2e_smoke.sh \
  --api-url https://api.filot.me \
  --jwt $ADMIN_JWT
```

---

## Test Categories

### Phase 1: API Health Checks

| Test | Endpoint | Expected |
|------|----------|----------|
| API Health | `GET /health` | 200 OK, `{"ok":true}` |
| Redis Connected | `GET /health` | `"redisConnected":true` |
| Database Connected | `GET /health` | Response indicates healthy |
| Metrics Endpoint | `GET /metrics` | 200 OK |

### Phase 2: Endpoint Validation

| Test | Endpoint | Expected |
|------|----------|----------|
| Auth Protected | `POST /auth/login` | 400/401 (requires credentials) |
| Documents Protected | `POST /documents/upload` | 401 (requires auth) |
| Verification (with JWT) | `POST /verification/evaluate` | 400/404 (endpoint works) |

### Phase 3: Infrastructure Checks

| Test | Check | Expected |
|------|-------|----------|
| CloudWatch Logs | Log group exists | `/ecs/filot-backend` |
| ECS Service | Service status | ACTIVE |
| GPU Worker | Service status | ACTIVE |

---

## Manual Test Procedures

### Test 1: Health Check

```bash
curl -s https://api.filot.me/health | jq .
```

**Expected Response**:
```json
{
  "ok": true,
  "redisConnected": true,
  "timestamp": "2024-12-01T00:00:00.000Z",
  "environment": "production"
}
```

### Test 2: Version Endpoint

```bash
curl -s https://api.filot.me/version | jq .
```

**Expected Response**:
```json
{
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2024-12-01T00:00:00.000Z"
}
```

### Test 3: BULI2 Health Check

```bash
curl -s https://api.filot.me/internal/buli2/health \
  -H "x-service-key: $SERVICE_INTERNAL_KEY" | jq .
```

**Expected Response**:
```json
{
  "status": "healthy",
  "buli2": {
    "configured": true
  }
}
```

### Test 4: BULI2 Callback (Mock Payload)

```bash
# Create test payload
PAYLOAD='{"reviewId":"smoke-test","documentId":"smoke-doc","decision":"approved","timestamp":"2024-12-01T00:00:00Z"}'

# Calculate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$BULI2_SIGNATURE_SECRET" | awk '{print $2}')

# Send callback
curl -X POST https://api.filot.me/internal/buli2/callback \
  -H "Content-Type: application/json" \
  -H "x-service-key: $SERVICE_INTERNAL_KEY" \
  -H "x-buli2-signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

**Expected Response**: 
- `200 OK` if document exists
- `404 Not Found` if smoke-doc doesn't exist (expected for mock test)

---

## Connectivity Tests

### Test 5: Redis Connectivity

Verified via health check response showing `redisConnected: true`.

Additional verification:
```bash
# Check from within ECS task (if needed)
aws ecs execute-command \
  --cluster filot-backend-cluster \
  --task $TASK_ARN \
  --container filot-backend \
  --interactive \
  --command "node -e \"const Redis = require('ioredis'); const r = new Redis(process.env.REDIS_URL); r.ping().then(console.log).catch(console.error)\""
```

### Test 6: PostgreSQL Connectivity

Verified via health check. The backend connects to Neon PostgreSQL on startup.

### Test 7: Cloudflare R2 Connectivity

Test by uploading a document (requires authentication):
```bash
curl -X POST https://api.filot.me/documents/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-document.jpg" \
  -F "type=ktp"
```

### Test 8: Temporal Cloud Connectivity (If Enabled)

```bash
curl -s https://api.filot.me/health/temporal | jq .
```

**Expected Response** (if Temporal enabled):
```json
{
  "ok": true,
  "temporal": "connected"
}
```

---

## Infrastructure Validation

### ECS Service Status

```bash
aws ecs describe-services \
  --cluster filot-backend-cluster \
  --services filot-backend-service \
  --query 'services[0].{status:status,runningCount:runningCount,desiredCount:desiredCount}' \
  --region ap-southeast-2
```

**Expected Output**:
```json
{
  "status": "ACTIVE",
  "runningCount": 1,
  "desiredCount": 1
}
```

### CloudWatch Logs

```bash
aws logs tail /ecs/filot-backend --since 5m --region ap-southeast-2
```

### Target Group Health

```bash
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-southeast-2:070017891928:targetgroup/filot-backend-tg/... \
  --region ap-southeast-2
```

---

## Expected Smoke Test Output

```
========================================
  FiLot Production Smoke Tests
========================================
API URL:    https://api.filot.me
Timestamp:  2024-12-01T00:00:00Z
========================================

Phase 1: API Health Checks
----------------------------------------
[PASS] API Health Check
[PASS] Health - Redis Connected
[PASS] Health - Database Connected
[PASS] Metrics Endpoint

Phase 2: Endpoint Validation
----------------------------------------
[PASS] Auth Endpoint (Protected)
[PASS] Documents Endpoint (Protected)
[SKIP] Verification Evaluate Endpoint - No JWT token provided

Phase 3: Infrastructure Checks
----------------------------------------
[PASS] CloudWatch Log Groups
[PASS] ECS Service Status
[PASS] GPU Worker Status

========================================
  Smoke Test Summary
========================================
  Passed:  9
  Failed:  0
  Skipped: 1
========================================
  OVERALL: PASSED
```

---

## Troubleshooting

### Health Check Failing

1. Check ECS task is running:
   ```bash
   aws ecs list-tasks --cluster filot-backend-cluster --service-name filot-backend-service
   ```

2. Check container logs:
   ```bash
   aws logs tail /ecs/filot-backend --since 10m
   ```

3. Verify secrets are accessible:
   ```bash
   aws secretsmanager get-secret-value --secret-id filot/database-url
   ```

### Redis Not Connected

1. Verify `REDIS_URL` secret exists
2. Check Redis is accessible from VPC
3. Verify TLS is working (`rediss://`)

### Database Not Connected

1. Verify `DATABASE_URL` secret exists
2. Check Neon database is active
3. Verify SSL connection string

---

## Post-Test Checklist

- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass (or skip appropriately)
- [ ] All Phase 3 tests pass
- [ ] No error spikes in CloudWatch logs
- [ ] Response times are acceptable (< 500ms for health)
- [ ] SSL certificate is valid

---

*Generated as part of Tranche T8-B.1: Backend Deployment Patch*
